import type {
	BacktestResult,
	BacktestSummary,
	BacktestTrade,
	DayBreakdown,
	EquityCurvePoint,
} from "@/types/backtest"
import { buildEquityCurve, computeMetrics } from "./metrics"

// "Breakeven trade" here = an exit triggered by the BE stop (price trailed to
// entry, then came back). The user-facing toggle hides them as "noise"; this
// predicate is the single canonical filter so call sites stay aligned.
const isBreakevenTrade = (trade: BacktestTrade): boolean =>
	trade.exitReason === "breakeven_stop"

const filterOutBreakevens = (
	trades: readonly BacktestTrade[]
): BacktestTrade[] => trades.filter((t) => !isBreakevenTrade(t))

// % of trades that exited via the BE stop. Returns 0 for an empty list. Kept
// as a UI-derived stat (not folded into BacktestSummary) so engine fixtures
// and seed scripts don't have to be updated.
const computeBreakevenRate = (trades: readonly BacktestTrade[]): number => {
	if (trades.length === 0) {
		return 0
	}
	const beCount = trades.reduce(
		(acc, t) => acc + (isBreakevenTrade(t) ? 1 : 0),
		0
	)
	return Math.round((beCount / trades.length) * 1000) / 10
}

const countBreakevens = (trades: readonly BacktestTrade[]): number =>
	trades.reduce((acc, t) => acc + (isBreakevenTrade(t) ? 1 : 0), 0)

// Rebuild per-day rollups from a (filtered) trade list, carrying the original
// range fields (rangeHigh / rangeLow are set by ORB-style range strategies and
// are independent of which trades fired). Days that had only BE trades drop to
// `trades: 0, pnlCents: 0`.
const recomputeDayBreakdown = (
	trades: readonly BacktestTrade[],
	original: readonly DayBreakdown[]
): DayBreakdown[] => {
	const byDay = new Map<string, { trades: number; pnlCents: number }>()
	for (const t of trades) {
		const acc = byDay.get(t.dayKey) ?? { trades: 0, pnlCents: 0 }
		acc.trades += 1
		acc.pnlCents += t.netPnlCents
		byDay.set(t.dayKey, acc)
	}
	return original.map((row) => {
		const acc = byDay.get(row.dayKey)
		return {
			...row,
			trades: acc?.trades ?? 0,
			pnlCents: acc?.pnlCents ?? 0,
		}
	})
}

interface FilteredResult {
	readonly trades: BacktestTrade[]
	readonly summary: BacktestSummary
	readonly equityCurve: EquityCurvePoint[]
	readonly dayBreakdown: DayBreakdown[]
}

// Recompute summary + equity curve over a BE-filtered trade list. Reuses the
// engine's own metrics functions so the "without BE" headline stats match
// what the engine would have produced if BE trades had never existed in the
// first place. `totalDays` is carried through from the original run so the
// "tradingDays / totalDays" denominator doesn't shift just because BE trades
// went away.
const recomputeWithoutBreakevens = (result: BacktestResult): FilteredResult => {
	const filtered = filterOutBreakevens(result.trades)
	return {
		trades: filtered,
		summary: computeMetrics(filtered, result.summary.totalDays),
		equityCurve: buildEquityCurve(filtered),
		dayBreakdown: recomputeDayBreakdown(filtered, result.dayBreakdown),
	}
}

export {
	computeBreakevenRate,
	countBreakevens,
	filterOutBreakevens,
	isBreakevenTrade,
	recomputeDayBreakdown,
	recomputeWithoutBreakevens,
	type FilteredResult,
}
