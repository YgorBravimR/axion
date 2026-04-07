/**
 * Test fixture factory for `TradeForSimulation`.
 *
 * Creates realistic WIN (B3 mini-index futures) trades:
 *   - tickSize  = 5  (5 points per tick)
 *   - tickValue = 100 (100 cents = R$1.00 per tick per contract)
 *   - Entry prices in the 125000–135000 range
 *   - SL distances of 50–200 points (10–40 ticks)
 *
 * The `pnlCents` field is set to a representative value matching the trade
 * outcome, but tests that depend on exact P&L after resizing use the
 * simulation engine's `calculateAssetPnL` internally.  We only need
 * internally consistent `pnlCents` here to drive `originalStats` paths.
 */

import type { TradeForSimulation } from "@/types/risk-simulation"

/** WIN-specific asset constants used across all fixtures */
const WINFUT_TICK_SIZE = 5
const WINFUT_TICK_VALUE = 100 // cents per tick per contract (R$1.00)
const WINFUT_COMMISSION = 50 // cents per execution (R$0.50)
const WINFUT_FEES = 10 // cents per execution (R$0.10)

interface TradeOverrides {
	id?: string
	entryDate?: Date
	exitDate?: Date
	asset?: string
	direction?: "long" | "short"
	entryPrice?: number
	exitPrice?: number
	stopLoss?: number | null
	positionSize?: number
	pnlCents?: number
	outcome?: "win" | "loss" | "breakeven" | null
	rMultiple?: number | null
	tickSize?: number
	tickValue?: number
	commissionPerExecution?: number
	feesPerExecution?: number
	contractsExecuted?: number
}

let tradeIdCounter = 0

/**
 * Reset the auto-incrementing trade ID counter.
 * Call in `beforeEach` to keep IDs deterministic across tests.
 */
const resetTradeIdCounter = () => {
	tradeIdCounter = 0
}

/**
 * Creates a WIN long win trade.
 *
 * Default: entry=128000, exit=128100 (+100 points = +20 ticks), SL=127900 (20 ticks)
 * 1 contract × 20 ticks × R$1 = R$20 gross profit (2000 cents)
 */
const createWinTrade = (overrides: TradeOverrides = {}): TradeForSimulation => {
	tradeIdCounter++
	const id = overrides.id ?? `trade-win-${tradeIdCounter}`
	const entryDate = overrides.entryDate ?? new Date("2026-01-06T09:00:00-03:00")
	const direction = overrides.direction ?? "long"
	const entryPrice = overrides.entryPrice ?? 128000
	const exitPrice = overrides.exitPrice ?? 128100
	const stopLoss = overrides.stopLoss !== undefined ? overrides.stopLoss : 127900

	return {
		id,
		entryDate,
		exitDate: overrides.exitDate ?? new Date("2026-01-06T09:30:00-03:00"),
		asset: overrides.asset ?? "WIN",
		direction,
		entryPrice,
		exitPrice,
		stopLoss,
		positionSize: overrides.positionSize ?? 1,
		pnlCents: overrides.pnlCents ?? 2000, // R$20 net (rough, good for original stats)
		outcome: overrides.outcome ?? "win",
		rMultiple: overrides.rMultiple ?? 1.0,
		tickSize: overrides.tickSize ?? WINFUT_TICK_SIZE,
		tickValue: overrides.tickValue ?? WINFUT_TICK_VALUE,
		commissionPerExecution: overrides.commissionPerExecution ?? WINFUT_COMMISSION,
		feesPerExecution: overrides.feesPerExecution ?? WINFUT_FEES,
		contractsExecuted: overrides.contractsExecuted ?? 2,
	}
}

/**
 * Creates a WIN long loss trade.
 *
 * Default: entry=128000, exit=127900 (-100 points = -20 ticks), SL=127900 (20 ticks)
 * 1 contract × (-20 ticks) × R$1 = -R$20 gross P&L (-2000 cents net)
 */
const createLossTrade = (overrides: TradeOverrides = {}): TradeForSimulation => {
	tradeIdCounter++
	const id = overrides.id ?? `trade-loss-${tradeIdCounter}`
	const entryDate = overrides.entryDate ?? new Date("2026-01-06T09:00:00-03:00")
	const direction = overrides.direction ?? "long"
	const entryPrice = overrides.entryPrice ?? 128000
	const exitPrice = overrides.exitPrice ?? 127900
	const stopLoss = overrides.stopLoss !== undefined ? overrides.stopLoss : 127900

	return {
		id,
		entryDate,
		exitDate: overrides.exitDate ?? new Date("2026-01-06T09:30:00-03:00"),
		asset: overrides.asset ?? "WIN",
		direction,
		entryPrice,
		exitPrice,
		stopLoss,
		positionSize: overrides.positionSize ?? 1,
		pnlCents: overrides.pnlCents ?? -2000,
		outcome: overrides.outcome ?? "loss",
		rMultiple: overrides.rMultiple ?? -1.0,
		tickSize: overrides.tickSize ?? WINFUT_TICK_SIZE,
		tickValue: overrides.tickValue ?? WINFUT_TICK_VALUE,
		commissionPerExecution: overrides.commissionPerExecution ?? WINFUT_COMMISSION,
		feesPerExecution: overrides.feesPerExecution ?? WINFUT_FEES,
		contractsExecuted: overrides.contractsExecuted ?? 2,
	}
}

/**
 * Creates a WIN trade with no stop loss.
 *
 * Used to verify "skipped_no_sl" behaviour.
 */
const createNoSlTrade = (overrides: TradeOverrides = {}): TradeForSimulation => {
	tradeIdCounter++
	return {
		...createWinTrade(overrides),
		id: overrides.id ?? `trade-nosl-${tradeIdCounter}`,
		stopLoss: null,
		rMultiple: null,
	}
}

/**
 * Creates a trade where entry === SL (zero-distance stop loss).
 * Edge case: should be treated as no-SL by the engine.
 */
const createZeroDistanceSLTrade = (overrides: TradeOverrides = {}): TradeForSimulation => {
	tradeIdCounter++
	const entryPrice = overrides.entryPrice ?? 128000
	return {
		...createWinTrade(overrides),
		id: overrides.id ?? `trade-zerodist-${tradeIdCounter}`,
		entryPrice,
		stopLoss: entryPrice, // same as entry → zero distance
	}
}

/**
 * Creates a sequence of trades all on the same day (Mon 2026-01-06).
 *
 * @param pattern - Array of "win" | "loss" — one entry per trade
 */
const createDaySequence = (
	pattern: Array<"win" | "loss">,
	dayDate: Date = new Date("2026-01-06T09:00:00-03:00")
): TradeForSimulation[] => {
	return pattern.map((outcome, index) => {
		const minuteOffset = index * 30
		const entryDate = new Date(dayDate.getTime() + minuteOffset * 60_000)
		return outcome === "win"
			? createWinTrade({ entryDate })
			: createLossTrade({ entryDate })
	})
}

/**
 * Creates trades spanning two different ISO calendar weeks.
 *
 * Week 1: Mon 2026-01-05 (trades on Mon)
 * Week 2: Mon 2026-01-12 (trades on Mon, next week)
 */
const createTwoWeekSequence = (
	week1Pattern: Array<"win" | "loss">,
	week2Pattern: Array<"win" | "loss">
): TradeForSimulation[] => {
	const week1Base = new Date("2026-01-05T09:00:00-03:00")
	const week2Base = new Date("2026-01-12T09:00:00-03:00")

	const week1Trades = week1Pattern.map((outcome, index) => {
		const entryDate = new Date(week1Base.getTime() + index * 30 * 60_000)
		return outcome === "win"
			? createWinTrade({ entryDate })
			: createLossTrade({ entryDate })
	})

	const week2Trades = week2Pattern.map((outcome, index) => {
		const entryDate = new Date(week2Base.getTime() + index * 30 * 60_000)
		return outcome === "win"
			? createWinTrade({ entryDate })
			: createLossTrade({ entryDate })
	})

	return [...week1Trades, ...week2Trades]
}

/**
 * Creates trades spanning two different calendar months.
 *
 * Month 1: 2026-01-05 (Mon)
 * Month 2: 2026-02-02 (Mon)
 */
const createTwoMonthSequence = (
	month1Pattern: Array<"win" | "loss">,
	month2Pattern: Array<"win" | "loss">
): TradeForSimulation[] => {
	const month1Base = new Date("2026-01-05T09:00:00-03:00")
	const month2Base = new Date("2026-02-02T09:00:00-03:00")

	const month1Trades = month1Pattern.map((outcome, index) => {
		const entryDate = new Date(month1Base.getTime() + index * 30 * 60_000)
		return outcome === "win"
			? createWinTrade({ entryDate })
			: createLossTrade({ entryDate })
	})

	const month2Trades = month2Pattern.map((outcome, index) => {
		const entryDate = new Date(month2Base.getTime() + index * 30 * 60_000)
		return outcome === "win"
			? createWinTrade({ entryDate })
			: createLossTrade({ entryDate })
	})

	return [...month1Trades, ...month2Trades]
}

export {
	WINFUT_TICK_SIZE,
	WINFUT_TICK_VALUE,
	WINFUT_COMMISSION,
	WINFUT_FEES,
	resetTradeIdCounter,
	createWinTrade,
	createLossTrade,
	createNoSlTrade,
	createZeroDistanceSLTrade,
	createDaySequence,
	createTwoWeekSequence,
	createTwoMonthSequence,
}
