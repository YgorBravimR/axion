import { and, eq, gte, lt } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import {
	resolveTier,
	type LadderRuleR,
} from "@/lib/fractal-plan/capital-ladder"
import { parseFiniteNumber } from "@/lib/fractal-plan/parse-number"

/**
 * Realized net P&L for each month of a year, carried into the account balance
 * exactly the way the annual cockpit grid does — so the month/quarter cockpit
 * cards show the SAME start-of-month capital the year view shows.
 *
 * Net is computed per month as:
 *   gross           = Σ trades.pnl (raw, in cents)
 *   traderShare     = prop account & gross > 0 ? gross × profitShare% : gross
 *   netAfterTax     = traderShare − (traderShare > 0 ? traderShare × irTaxRate : 0)
 *   realPnlCents    = netAfterTax − (netAfterTax > 0 ? netAfterTax × withdrawalPct : 0)
 *
 * Prop profit-share is applied here (matching month-report's current-month
 * display) — the year page historically skipped it, which was wrong for prop
 * accounts. Personal accounts pass profitSharePercent = 100, a no-op.
 */
interface RealizedPnlParams {
	accountId: string
	year: number
	/** Prop account share of gross profit, 0–100. Personal accounts pass 100. */
	profitSharePercent: number
	/** IR day-trade rate as a fraction (0–1). */
	irTaxRate: number
	/** Withdrawal target as a fraction (0–1). 0 disables withdrawal. */
	withdrawalPct: number
	/** When false, tax is not deducted (mirrors account.showTaxEstimates). */
	applyTax: boolean
}

const computeRealizedPnlByMonth = async (
	params: RealizedPnlParams
): Promise<number[]> => {
	const {
		accountId,
		year,
		profitSharePercent,
		irTaxRate,
		withdrawalPct,
		applyTax,
	} = params

	const yearStart = new Date(Date.UTC(year, 0, 1))
	const yearEnd = new Date(Date.UTC(year + 1, 0, 1))
	const yearTrades = await db
		.select({ entryDate: trades.entryDate, pnl: trades.pnl })
		.from(trades)
		.where(
			and(
				eq(trades.accountId, accountId),
				eq(trades.isArchived, false),
				gte(trades.entryDate, yearStart),
				lt(trades.entryDate, yearEnd)
			)
		)

	const grossByMonth = Array.from({ length: 12 }, () => 0)
	for (const t of yearTrades) {
		const pnlCents = parseFiniteNumber(t.pnl, 0)
		grossByMonth[t.entryDate.getUTCMonth()]! += pnlCents
	}

	return grossByMonth.map((gross) => {
		const result = computeNetPnlChain({
			grossCents: gross,
			profitSharePercent,
			irTaxRate,
			applyTax,
			withdrawalPct,
		})
		return result.retainedCents
	})
}

/**
 * Start-of-month capital = initial capital + Σ realized net P&L of every month
 * from `planStartMonth` up to (but not including) `targetMonth` (both 1–12).
 */
const capitalAtMonthStart = (
	initialCapitalCents: number,
	realPnlByMonth: number[],
	planStartMonth: number,
	targetMonth: number
): number => {
	let cap = initialCapitalCents
	for (let m = planStartMonth; m < targetMonth; m++) {
		cap += realPnlByMonth[m - 1] ?? 0
	}
	return cap
}

interface PnlChainResult {
	traderShareCents: number
	taxCents: number
	netAfterTaxCents: number
	withdrawalCents: number
	retainedCents: number
}

interface PnlChainParams {
	grossCents: number
	profitSharePercent: number
	irTaxRate: number
	applyTax: boolean
	withdrawalPct: number
}

/**
 * Canonical P&L chain: gross → trader share → tax → withdrawal → retained.
 * Rounding applied after each step for precision.
 * Guards: clamped profit share (0–100%), NaN/finite checks on inputs.
 */
const computeNetPnlChain = (params: PnlChainParams): PnlChainResult => {
	const { grossCents, profitSharePercent, irTaxRate, applyTax, withdrawalPct } =
		params

	if (!Number.isFinite(grossCents)) {
		return {
			traderShareCents: 0,
			taxCents: 0,
			netAfterTaxCents: 0,
			withdrawalCents: 0,
			retainedCents: 0,
		}
	}

	const share = Math.min(100, Math.max(0, profitSharePercent)) / 100
	const traderShareCents =
		grossCents > 0 ? Math.round(grossCents * share) : grossCents
	const taxCents =
		applyTax && traderShareCents > 0
			? Math.round(traderShareCents * irTaxRate)
			: 0
	const netAfterTaxCents = traderShareCents - taxCents
	const withdrawalCents =
		netAfterTaxCents > 0 && withdrawalPct > 0
			? Math.round(netAfterTaxCents * withdrawalPct)
			: 0
	const retainedCents = netAfterTaxCents - withdrawalCents

	return {
		traderShareCents,
		taxCents,
		netAfterTaxCents,
		withdrawalCents,
		retainedCents,
	}
}

interface MonthCapitalResult {
	capitalCents: number
	oneRCents: number
	isRealCarryForward: boolean
}

interface MonthCapitalParams {
	ladderRules: LadderRuleR[]
	initialCapitalCents: number
	realPnlByMonth: number[]
	planStartMonth: number
	month: number
	snapshotOneRCents: number
}

/**
 * Resolve start-of-month capital and 1R size: either via real carry-forward
 * (ladder → capital → tier → 1R), or fallback to initial capital + snapshot 1R.
 */
const resolveMonthStartCapital = (
	params: MonthCapitalParams
): MonthCapitalResult => {
	const {
		ladderRules,
		initialCapitalCents,
		realPnlByMonth,
		planStartMonth,
		month,
		snapshotOneRCents,
	} = params

	if (ladderRules.length > 0) {
		const capital = capitalAtMonthStart(
			initialCapitalCents,
			realPnlByMonth,
			planStartMonth,
			month
		)
		const tier = resolveTier(capital, ladderRules)
		return {
			capitalCents: capital,
			oneRCents: tier.oneRCents,
			isRealCarryForward: true,
		}
	}

	return {
		capitalCents: initialCapitalCents,
		oneRCents: snapshotOneRCents,
		isRealCarryForward: false,
	}
}

export {
	computeRealizedPnlByMonth,
	capitalAtMonthStart,
	computeNetPnlChain,
	resolveMonthStartCapital,
}
export type {
	PnlChainResult,
	PnlChainParams,
	MonthCapitalResult,
	MonthCapitalParams,
}
