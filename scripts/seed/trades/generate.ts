import type { SeedSql } from "../helpers/sql"
import { calculatePnl, WIN_PER_POINT, WDO_PER_POINT } from "../helpers/pnl"
import { createPrng, pickFrom } from "../helpers/prng"
import {
	generateExitTime,
	getTradingDays,
	randomTradingTime,
} from "../helpers/trading-days"
import type { MonthMeta } from "../plans"

export interface ProceduralMonthSpec {
	year: number
	month: number // 1-12
	netTargetCents: number
	monthMeta: MonthMeta
}

export interface ProceduralTradeOptions {
	accountId: string
	prngSeed: number
	months: ProceduralMonthSpec[]
	strategyPicker: (_rand: () => number) => string | null
	// Optional caps so different account arcs can scale position sizing.
	// Default = 1.0 (no scaling).
	positionSizeScale?: number
	// Probability the trade followed plan (default 0.7 for winning trades, less for losses).
	planConformityRate?: number
}

export interface GeneratedTrade {
	asset: "WIN" | "WDO"
	dir: "long" | "short"
	entryTime: string
	exitTime: string
	entryP: number
	exitP: number
	size: number
	sl: number
	tp: number
	pnlCents: number
	outcome: "win" | "loss"
	plan: boolean
	strat: string | null
	oneRSnapshotCents: number
	rOutcome: string
	plannedRiskAmountCents: number
	tradingDay: Date
	year: number
	month: number
}

const round2 = (n: number): number => Math.round(n * 100) / 100

const shuffleIndices = (length: number, rand: () => number): number[] => {
	const indices: number[] = []
	for (let i = 0; i < length; i++) {
		indices.push(i)
	}
	for (let i = indices.length - 1; i > 0; i--) {
		const j = Math.floor(rand() * (i + 1))
		const a = indices[i]
		const b = indices[j]
		if (a === undefined || b === undefined) {
			continue
		}
		indices[i] = b
		indices[j] = a
	}
	return indices
}

const buildDailyPnls = (
	tradingDays: Date[],
	netTargetReais: number,
	oneRReais: number,
	rand: () => number
): number[] => {
	const isLossMonth = netTargetReais < 0
	const loserRatio = isLossMonth ? 0.65 : 0.3
	const numLosers = Math.floor(tradingDays.length * loserRatio)
	const numWinners = Math.max(1, tradingDays.length - numLosers)
	const totalLossReais = -1 * numLosers * oneRReais
	const winnersTotalReais = netTargetReais - totalLossReais
	const avgWinnerReais = winnersTotalReais / numWinners

	const dayIndices = shuffleIndices(tradingDays.length, rand)
	const loserIdx = new Set(dayIndices.slice(0, numLosers))

	const dailyPnls: number[] = []
	for (let i = 0; i < tradingDays.length; i++) {
		if (loserIdx.has(i)) {
			dailyPnls.push(-1 * oneRReais)
		} else {
			const jitter = 0.55 + rand() * 0.9
			dailyPnls.push(avgWinnerReais * jitter)
		}
	}

	const winnerSum = dailyPnls.reduce(
		(sum, val, i) => (loserIdx.has(i) ? sum : sum + val),
		0
	)
	const scale = winnerSum !== 0 ? winnersTotalReais / winnerSum : 1
	for (let i = 0; i < dailyPnls.length; i++) {
		if (!loserIdx.has(i)) {
			const cur = dailyPnls[i]
			if (cur !== undefined) {
				dailyPnls[i] = cur * scale
			}
		}
	}
	return dailyPnls
}

const buildTradeFromDayPnl = (
	tradePnl: number,
	day: Date,
	oneRReais: number,
	oneRCents: number,
	year: number,
	month: number,
	options: ProceduralTradeOptions,
	rand: () => number
): GeneratedTrade => {
	const sizeScale = options.positionSizeScale ?? 1.0
	const asset: "WIN" | "WDO" = rand() < 0.55 ? "WDO" : "WIN"
	const dir: "long" | "short" = rand() < 0.6 ? "long" : "short"
	const ppc = asset === "WIN" ? WIN_PER_POINT : WDO_PER_POINT
	const refStopPoints = asset === "WDO" ? 50 : 100
	const baseSize = Math.max(1, Math.round(oneRReais / (refStopPoints * ppc)))
	const size = Math.max(1, Math.round(baseSize * sizeScale))
	const priceDiffPoints = tradePnl / (size * ppc)
	const basePrice =
		asset === "WIN"
			? 130000 + Math.floor(rand() * 6000)
			: 5000 + Math.floor(rand() * 200)
	const entryP = basePrice
	const rawExit =
		dir === "long" ? basePrice + priceDiffPoints : basePrice - priceDiffPoints
	const exitP =
		asset === "WIN" ? Math.round(rawExit / 5) * 5 : Math.round(rawExit * 2) / 2
	const stopPoints = oneRReais / (size * ppc)
	const sl = dir === "long" ? entryP - stopPoints : entryP + stopPoints
	const tp = dir === "long" ? entryP + stopPoints * 2 : entryP - stopPoints * 2

	const entryTime = randomTradingTime(day, rand)
	const exitTime = generateExitTime(entryTime, rand)

	const realizedReais = calculatePnl(asset, dir, entryP, exitP, size)
	const pnlCents = Math.round(realizedReais * 100)
	const outcome: "win" | "loss" = pnlCents >= 0 ? "win" : "loss"
	const rOutcome = (pnlCents / oneRCents).toFixed(2)
	const planRate = options.planConformityRate ?? 0.7
	const plan = outcome === "win" || rand() < planRate
	const strat = options.strategyPicker(rand)

	return {
		asset,
		dir,
		entryTime,
		exitTime,
		entryP,
		exitP,
		size,
		sl: round2(sl),
		tp: round2(tp),
		pnlCents,
		outcome,
		plan,
		strat,
		oneRSnapshotCents: oneRCents,
		rOutcome,
		plannedRiskAmountCents: oneRCents,
		tradingDay: new Date(day),
		year,
		month,
	}
}

export const generateProceduralTrades = (
	options: ProceduralTradeOptions
): GeneratedTrade[] => {
	const rand = createPrng(options.prngSeed)
	const out: GeneratedTrade[] = []

	for (const spec of options.months) {
		const oneRReais = spec.monthMeta.oneRCents / 100
		const monthEnd = new Date(Date.UTC(spec.year, spec.month, 0))
		const tradingDays = getTradingDays(
			new Date(Date.UTC(spec.year, spec.month - 1, 1)),
			monthEnd
		)
		if (tradingDays.length === 0) {
			continue
		}
		const dailyPnls = buildDailyPnls(
			tradingDays,
			spec.netTargetCents / 100,
			oneRReais,
			rand
		)

		for (let i = 0; i < tradingDays.length; i++) {
			const day = tradingDays[i]
			const dayPnl = dailyPnls[i]
			if (!day || dayPnl === undefined) {
				continue
			}
			const numTrades = rand() < 0.55 ? 1 : 2
			const tradesPnl: number[] =
				numTrades === 1
					? [dayPnl]
					: (() => {
							const split = 0.4 + rand() * 0.2
							return [dayPnl * split, dayPnl * (1 - split)]
						})()
			for (const tradePnl of tradesPnl) {
				out.push(
					buildTradeFromDayPnl(
						tradePnl,
						day,
						oneRReais,
						spec.monthMeta.oneRCents,
						spec.year,
						spec.month,
						options,
						rand
					)
				)
			}
		}
	}
	return out
}

export const insertTrades = async (
	sql: SeedSql,
	accountId: string,
	trades: GeneratedTrade[],
	strategyCodeToId: Map<string, string>
): Promise<void> => {
	for (const t of trades) {
		const strategyId = t.strat ? (strategyCodeToId.get(t.strat) ?? null) : null
		await sql`
			INSERT INTO trades (
				id, account_id, asset, direction, timeframe_id, entry_date, exit_date,
				entry_price, exit_price, position_size, stop_loss, take_profit,
				planned_risk_amount, realized_r_multiple,
				pnl, outcome, followed_plan, strategy_id, is_archived,
				one_r_snapshot_cents, r_outcome, source
			) VALUES (
				gen_random_uuid(), ${accountId}, ${t.asset}, ${t.dir}, NULL, ${t.entryTime}, ${t.exitTime},
				${t.entryP.toString()}, ${t.exitP.toString()}, ${t.size.toString()},
				${t.sl.toString()}, ${t.tp.toString()},
				${t.plannedRiskAmountCents.toString()}, ${t.rOutcome},
				${t.pnlCents.toString()}, ${t.outcome}, ${t.plan}, ${strategyId}, false,
				${t.oneRSnapshotCents}, ${t.rOutcome}, 'manual'
			)
		`
	}
}

// Strategy picker that returns one of a fixed pool, weighted uniformly.
export const uniformStrategyPicker = (
	codes: string[]
): ((_rand: () => number) => string) => {
	return (rand) => pickFrom(codes, rand)
}
