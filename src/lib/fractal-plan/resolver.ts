/**
 * Cascade resolver: walks year → quarter → month → week → day,
 * runs resolveCascade per overridable field, returns merged plan + provenance map.
 *
 * Phase 3: yearlyPlans now has defaultDailyLossR / defaultDailyTargetR / defaultWeeklyLossR /
 * defaultMonthlyLossR columns — columns are read directly (no optional-access cast needed).
 * Hardcoded FALLBACK_* constants remain in case the column value is null (user hasn't configured).
 */
import { db } from "@/db/drizzle"
import {
	yearlyPlans,
	quarterlyPlan,
	monthlyPlan,
	weeklyPlan,
	dailyPlan,
	accountCapitalEvents,
	accountMonthlyAggregate,
} from "@/db/schema"
import { eq, and, lte } from "drizzle-orm"
import { resolveCascade, type CascadeResult } from "./cascade-merge"
import { getWeekNumber, getWeekYear } from "@/lib/calendar/iso-week"

interface ResolvedDay {
	readonly accountId: string
	readonly date: Date
	readonly oneRCents: number
	readonly tierIndex: number
	readonly dailyLossR: CascadeResult<string>
	readonly dailyTargetR: CascadeResult<string>
	readonly weeklyLossR: CascadeResult<string>
	readonly monthlyLossR: CascadeResult<string>
	readonly activePlaybookIds: CascadeResult<readonly string[]> | null
	readonly raw: {
		year: { id: string }
		quarter: { id: string } | null
		month: { id: string } | null
		week: { id: string } | null
		day: { id: string } | null
	}
}

// Sane defaults used when the Phase 3 columns are not yet present on yearlyPlans.
const FALLBACK_DAILY_LOSS_R = "3.00"
const FALLBACK_DAILY_TARGET_R = "2.00"
const FALLBACK_WEEKLY_LOSS_R = "6.00"
const FALLBACK_MONTHLY_LOSS_R = "10.00"

const resolveDay = async (
	accountId: string,
	date: Date
): Promise<ResolvedDay | null> => {
	const year = date.getFullYear()
	const month = date.getMonth() + 1
	const quarter = Math.ceil(month / 3)
	const isoWeek = getWeekNumber(date)
	const isoYear = getWeekYear(date)

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(
			eq(yearlyPlans.accountId, accountId),
			eq(yearlyPlans.year, year)
		),
	})
	if (!yearRow) {
		return null
	}

	const quarterRow = await db.query.quarterlyPlan.findFirst({
		where: and(
			eq(quarterlyPlan.yearlyPlanId, yearRow.id),
			eq(quarterlyPlan.quarter, quarter)
		),
	})
	const monthRow = quarterRow
		? await db.query.monthlyPlan.findFirst({
				where: and(
					eq(monthlyPlan.quarterlyPlanId, quarterRow.id),
					eq(monthlyPlan.month, month)
				),
			})
		: null
	const weekRow = monthRow
		? await db.query.weeklyPlan.findFirst({
				where: and(
					eq(weeklyPlan.monthlyPlanId, monthRow.id),
					eq(weeklyPlan.isoWeek, isoWeek),
					eq(weeklyPlan.isoYear, isoYear)
				),
			})
		: null
	const dayRow = weekRow
		? await db.query.dailyPlan.findFirst({
				where: and(
					eq(dailyPlan.weeklyPlanId, weekRow.id),
					eq(dailyPlan.date, date.toISOString().slice(0, 10))
				),
			})
		: null

	// Phase 3: columns now exist on yearlyPlans — read directly, fall back to constants if null.
	const dailyLossR = resolveCascade<string>([
		{ level: "day", value: dayRow?.overrideDailyLossR },
		{ level: "week", value: weekRow?.overrideDailyLossR },
		{ level: "month", value: monthRow?.overrideDailyLossR },
		{
			level: "year",
			value: yearRow.defaultDailyLossR ?? FALLBACK_DAILY_LOSS_R,
		},
	])
	const dailyTargetR = resolveCascade<string>([
		{ level: "day", value: dayRow?.overrideDailyTargetR },
		{ level: "week", value: weekRow?.overrideDailyTargetR },
		{ level: "month", value: monthRow?.overrideDailyTargetR },
		{
			level: "year",
			value: yearRow.defaultDailyWinR ?? FALLBACK_DAILY_TARGET_R,
		},
	])
	const weeklyLossR = resolveCascade<string>([
		{ level: "week", value: weekRow?.overrideWeeklyLossR },
		{ level: "month", value: monthRow?.overrideWeeklyLossR },
		{
			level: "year",
			value: yearRow.defaultWeeklyLossR ?? FALLBACK_WEEKLY_LOSS_R,
		},
	])
	const monthlyLossR = resolveCascade<string>([
		{ level: "month", value: monthRow?.overrideMonthlyLossR },
		{
			level: "year",
			value: yearRow.defaultMonthlyLossR ?? FALLBACK_MONTHLY_LOSS_R,
		},
	])

	const playbookLayers = [
		{
			level: "day" as const,
			value: dayRow?.overrideActivePlaybookIds as string[] | null | undefined,
		},
		{
			level: "week" as const,
			value: weekRow?.overrideActivePlaybookIds as string[] | null | undefined,
		},
		{
			level: "month" as const,
			value: monthRow?.overrideActivePlaybookIds as string[] | null | undefined,
		},
		{
			level: "quarter" as const,
			value: quarterRow?.activePlaybookIds as string[] | null | undefined,
		},
	]
	const hasPlaybooks = playbookLayers.some(
		(l) => l.value !== null && l.value !== undefined
	)
	const activePlaybookIds = hasPlaybooks
		? resolveCascade<readonly string[]>(playbookLayers)
		: null

	return {
		accountId,
		date,
		oneRCents: monthRow?.snapshotOneRCents ?? 0,
		tierIndex: monthRow?.snapshotTierIndex ?? 0,
		dailyLossR,
		dailyTargetR,
		weeklyLossR,
		monthlyLossR,
		activePlaybookIds,
		raw: {
			year: { id: yearRow.id },
			quarter: quarterRow ? { id: quarterRow.id } : null,
			month: monthRow ? { id: monthRow.id } : null,
			week: weekRow ? { id: weekRow.id } : null,
			day: dayRow ? { id: dayRow.id } : null,
		},
	}
}

// ---------------------------------------------------------------------------
// resolveMonth: cascade year → quarter → month for month-level R targets
// ---------------------------------------------------------------------------

interface ResolveMonthInput {
	accountId: string
	year: number
	month: number // 1-12
}

interface ResolveMonthResult {
	monthlyWinR: number | null
	monthlyWinR_provenance: "year" | "quarter" | "month" | "none"
	monthlyLossR: number | null
	monthlyLossR_provenance: "year" | "quarter" | "month" | "none"
	monthlyTargetWeeks: number | null
	monthlyTargetWeeks_provenance: "year" | "quarter" | "month" | "none"
}

/** Nullable cascade: walks layers from most-specific to least, returns first defined value. */
const cascadeNullable = <T extends string | number | null>(
	layers: {
		level: "year" | "quarter" | "month" | "none"
		value: T | null | undefined
	}[]
): {
	value: number | null
	provenance: "year" | "quarter" | "month" | "none"
} => {
	for (const layer of layers) {
		if (layer.value !== null && layer.value !== undefined) {
			return { value: Number(layer.value), provenance: layer.level }
		}
	}
	return { value: null, provenance: "none" }
}

const resolveMonth = async (
	input: ResolveMonthInput
): Promise<ResolveMonthResult> => {
	const { accountId, year, month } = input
	const quarter = Math.ceil(month / 3)

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(
			eq(yearlyPlans.accountId, accountId),
			eq(yearlyPlans.year, year)
		),
	})

	const quarterRow = yearRow
		? await db.query.quarterlyPlan.findFirst({
				where: and(
					eq(quarterlyPlan.yearlyPlanId, yearRow.id),
					eq(quarterlyPlan.quarter, quarter)
				),
			})
		: null

	// monthlyPlan is keyed by quarterlyPlanId; search by year+month if quarter exists.
	const monthRow = quarterRow
		? await db.query.monthlyPlan.findFirst({
				where: and(
					eq(monthlyPlan.quarterlyPlanId, quarterRow.id),
					eq(monthlyPlan.month, month)
				),
			})
		: null

	// Monthly win R: only year-level default (monthly_plan has no winR override column).
	const winR = cascadeNullable([
		{ level: "year", value: yearRow?.defaultMonthlyWinR },
	])

	// Monthly loss R: month overrides year via overrideMonthlyLossR.
	const lossR = cascadeNullable([
		{ level: "month", value: monthRow?.overrideMonthlyLossR },
		{ level: "year", value: yearRow?.defaultMonthlyLossR },
	])

	// Target weeks: year-level only.
	const targetWeeks = cascadeNullable([
		{
			level: "year",
			value:
				yearRow?.targetWeeksToYearly != null
					? String(yearRow.targetWeeksToYearly)
					: null,
		},
	])

	return {
		monthlyWinR: winR.value,
		monthlyWinR_provenance: winR.provenance,
		monthlyLossR: lossR.value,
		monthlyLossR_provenance: lossR.provenance,
		monthlyTargetWeeks: targetWeeks.value,
		monthlyTargetWeeks_provenance: targetWeeks.provenance,
	}
}

// ---------------------------------------------------------------------------
// resolveYear: returns year-level R defaults with provenance
// ---------------------------------------------------------------------------

interface ResolveYearInput {
	accountId: string
	year: number
}

interface ResolveYearResult {
	defaultDailyLossR: number | null
	defaultDailyLossR_provenance: "year" | "none"
	defaultDailyWinR: number | null
	defaultDailyWinR_provenance: "year" | "none"
	defaultWeeklyLossR: number | null
	defaultWeeklyLossR_provenance: "year" | "none"
	defaultWeeklyWinR: number | null
	defaultWeeklyWinR_provenance: "year" | "none"
	defaultMonthlyLossR: number | null
	defaultMonthlyLossR_provenance: "year" | "none"
	defaultMonthlyWinR: number | null
	defaultMonthlyWinR_provenance: "year" | "none"
}

const resolveYear = async (
	input: ResolveYearInput
): Promise<ResolveYearResult> => {
	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(
			eq(yearlyPlans.accountId, input.accountId),
			eq(yearlyPlans.year, input.year)
		),
	})

	const tag = (
		v: string | null | undefined
	): { value: number | null; provenance: "year" | "none" } =>
		v == null
			? { value: null, provenance: "none" }
			: { value: Number(v), provenance: "year" }

	const dl = tag(yearRow?.defaultDailyLossR)
	const dw = tag(yearRow?.defaultDailyWinR)
	const wl = tag(yearRow?.defaultWeeklyLossR)
	const ww = tag(yearRow?.defaultWeeklyWinR)
	const ml = tag(yearRow?.defaultMonthlyLossR)
	const mw = tag(yearRow?.defaultMonthlyWinR)

	return {
		defaultDailyLossR: dl.value,
		defaultDailyLossR_provenance: dl.provenance,
		defaultDailyWinR: dw.value,
		defaultDailyWinR_provenance: dw.provenance,
		defaultWeeklyLossR: wl.value,
		defaultWeeklyLossR_provenance: wl.provenance,
		defaultWeeklyWinR: ww.value,
		defaultWeeklyWinR_provenance: ww.provenance,
		defaultMonthlyLossR: ml.value,
		defaultMonthlyLossR_provenance: ml.provenance,
		defaultMonthlyWinR: mw.value,
		defaultMonthlyWinR_provenance: mw.provenance,
	}
}

// ---------------------------------------------------------------------------
// resolveBehavior — cascade adaptive risk-management behaviors (Phase 4b)
// ---------------------------------------------------------------------------

type BehaviorProvenance = "year" | "month" | "week" | "day" | "fallback"

interface BehaviorResolved {
	readonly riskProfileId: string | null
	readonly riskProfileId_provenance: BehaviorProvenance
	readonly maxConsecutiveLosses: number | null
	readonly maxConsecutiveLosses_provenance: BehaviorProvenance
	readonly allowSecondOpAfterLoss: boolean
	readonly allowSecondOpAfterLoss_provenance: BehaviorProvenance
	readonly reduceRiskAfterLoss: boolean
	readonly reduceRiskAfterLoss_provenance: BehaviorProvenance
	readonly riskReductionFactor: number | null
	readonly riskReductionFactor_provenance: BehaviorProvenance
	readonly increaseRiskAfterWin: boolean
	readonly increaseRiskAfterWin_provenance: BehaviorProvenance
	readonly capRiskAfterWin: boolean
	readonly capRiskAfterWin_provenance: BehaviorProvenance
	readonly profitReinvestmentPercent: number | null
	readonly profitReinvestmentPercent_provenance: BehaviorProvenance
}

interface ResolveBehaviorInput {
	accountId: string
	date: Date
}

const pickWithin = <T>(
	d: T | null | undefined,
	w: T | null | undefined,
	m: T | null | undefined,
	y: T | null | undefined
): { value: T | null; level: BehaviorProvenance } => {
	if (d !== null && d !== undefined) {
		return { value: d, level: "day" }
	}
	if (w !== null && w !== undefined) {
		return { value: w, level: "week" }
	}
	if (m !== null && m !== undefined) {
		return { value: m, level: "month" }
	}
	if (y !== null && y !== undefined) {
		return { value: y, level: "year" }
	}
	return { value: null, level: "fallback" }
}

const pickStrategy = <T>(
	m: T | null | undefined,
	y: T | null | undefined
): { value: T | null; level: BehaviorProvenance } => {
	if (m !== null && m !== undefined) {
		return { value: m, level: "month" }
	}
	if (y !== null && y !== undefined) {
		return { value: y, level: "year" }
	}
	return { value: null, level: "fallback" }
}

const numOrNull = (v: string | number | null | undefined): number | null =>
	v === null || v === undefined ? null : Number(v)

const resolveBehavior = async ({
	accountId,
	date,
}: ResolveBehaviorInput): Promise<BehaviorResolved> => {
	const year = date.getFullYear()
	const month = date.getMonth() + 1
	const quarter = Math.ceil(month / 3)
	const isoWeek = getWeekNumber(date)
	const isoYear = getWeekYear(date)
	const dateStr = date.toISOString().slice(0, 10)

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(
			eq(yearlyPlans.accountId, accountId),
			eq(yearlyPlans.year, year)
		),
	})

	const quarterRow = yearRow
		? await db.query.quarterlyPlan.findFirst({
				where: and(
					eq(quarterlyPlan.yearlyPlanId, yearRow.id),
					eq(quarterlyPlan.quarter, quarter)
				),
			})
		: null

	const monthRow = quarterRow
		? await db.query.monthlyPlan.findFirst({
				where: and(
					eq(monthlyPlan.quarterlyPlanId, quarterRow.id),
					eq(monthlyPlan.month, month)
				),
			})
		: null

	const weekRow = monthRow
		? await db.query.weeklyPlan.findFirst({
				where: and(
					eq(weeklyPlan.monthlyPlanId, monthRow.id),
					eq(weeklyPlan.isoWeek, isoWeek),
					eq(weeklyPlan.isoYear, isoYear)
				),
			})
		: null

	const dayRow = weekRow
		? await db.query.dailyPlan.findFirst({
				where: and(
					eq(dailyPlan.weeklyPlanId, weekRow.id),
					eq(dailyPlan.date, dateStr)
				),
			})
		: null

	const profile = pickStrategy(
		monthRow?.overrideRiskProfileId,
		yearRow?.defaultRiskProfileId
	)

	const maxConsec = pickWithin(
		dayRow?.overrideMaxConsecutiveLosses,
		weekRow?.overrideMaxConsecutiveLosses,
		monthRow?.overrideMaxConsecutiveLosses,
		yearRow?.defaultMaxConsecutiveLosses
	)

	const secondOp = pickWithin(
		dayRow?.overrideAllowSecondOpAfterLoss,
		weekRow?.overrideAllowSecondOpAfterLoss,
		monthRow?.overrideAllowSecondOpAfterLoss,
		yearRow?.defaultAllowSecondOpAfterLoss
	)

	const reduceLoss = pickStrategy(
		monthRow?.overrideReduceRiskAfterLoss,
		yearRow?.defaultReduceRiskAfterLoss
	)

	const reductionFactor = pickStrategy(
		numOrNull(monthRow?.overrideRiskReductionFactor),
		numOrNull(yearRow?.defaultRiskReductionFactor)
	)

	const increaseWin = pickStrategy(
		monthRow?.overrideIncreaseRiskAfterWin,
		yearRow?.defaultIncreaseRiskAfterWin
	)

	const capWin = pickStrategy(
		monthRow?.overrideCapRiskAfterWin,
		yearRow?.defaultCapRiskAfterWin
	)

	const reinvest = pickStrategy(
		numOrNull(monthRow?.overrideProfitReinvestmentPercent),
		numOrNull(yearRow?.defaultProfitReinvestmentPercent)
	)

	return {
		riskProfileId: profile.value,
		riskProfileId_provenance: profile.level,
		maxConsecutiveLosses: maxConsec.value,
		maxConsecutiveLosses_provenance: maxConsec.level,
		allowSecondOpAfterLoss: secondOp.value ?? false,
		allowSecondOpAfterLoss_provenance: secondOp.level,
		reduceRiskAfterLoss: reduceLoss.value ?? false,
		reduceRiskAfterLoss_provenance: reduceLoss.level,
		riskReductionFactor: reductionFactor.value,
		riskReductionFactor_provenance: reductionFactor.level,
		increaseRiskAfterWin: increaseWin.value ?? false,
		increaseRiskAfterWin_provenance: increaseWin.level,
		capRiskAfterWin: capWin.value ?? false,
		capRiskAfterWin_provenance: capWin.level,
		profitReinvestmentPercent: reinvest.value,
		profitReinvestmentPercent_provenance: reinvest.level,
	}
}

// ---------------------------------------------------------------------------
// resolveBalance — derive live balance from initial capital + events + aggregates
// ---------------------------------------------------------------------------

interface BalanceResolved {
	readonly balanceCents: number
	readonly initialCapitalCents: number
	readonly capitalEventsDelta: number
	readonly realizedPnlDelta: number
	readonly computedAt: Date
}

interface ResolveBalanceInput {
	accountId: string
	date: Date
}

const resolveBalance = async ({
	accountId,
	date,
}: ResolveBalanceInput): Promise<BalanceResolved> => {
	const year = date.getFullYear()
	const month = date.getMonth() + 1
	const dateStr = date.toISOString().slice(0, 10)

	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(
			eq(yearlyPlans.accountId, accountId),
			eq(yearlyPlans.year, year)
		),
	})
	if (!yearRow) {
		throw new Error(
			`resolveBalance: no yearly plan for account ${accountId} year ${year}`
		)
	}

	const events = await db.query.accountCapitalEvents.findMany({
		where: and(
			eq(accountCapitalEvents.accountId, accountId),
			lte(accountCapitalEvents.eventDate, dateStr)
		),
	})

	const aggregates = await db.query.accountMonthlyAggregate.findMany({
		where: eq(accountMonthlyAggregate.accountId, accountId),
	})
	const aggUpTo = aggregates.filter(
		(a) => a.year < year || (a.year === year && a.month <= month)
	)

	const capitalEventsDelta = events.reduce(
		(sum, e) =>
			sum + (e.eventType === "deposit" ? e.amountCents : -e.amountCents),
		0
	)
	const realizedPnlDelta = aggUpTo.reduce((sum, a) => sum + a.netCents, 0)

	return {
		balanceCents:
			yearRow.initialCapitalCents + capitalEventsDelta + realizedPnlDelta,
		initialCapitalCents: yearRow.initialCapitalCents,
		capitalEventsDelta,
		realizedPnlDelta,
		computedAt: new Date(),
	}
}

export type {
	ResolvedDay,
	ResolveMonthInput,
	ResolveMonthResult,
	ResolveYearInput,
	ResolveYearResult,
	BehaviorResolved,
	BehaviorProvenance,
	ResolveBehaviorInput,
	BalanceResolved,
	ResolveBalanceInput,
}
export {
	resolveDay,
	resolveMonth,
	resolveYear,
	resolveBehavior,
	resolveBalance,
}
