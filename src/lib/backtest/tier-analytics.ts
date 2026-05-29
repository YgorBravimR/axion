import type { BacktestTrade, QualityTier } from "@/types/backtest"

interface TierBreakdownRow {
	tier: QualityTier | "untiered"
	count: number
	winRate: number // 0–100, 0 when count === 0
	avgRMultiple: number // mean of rMultiple
	totalPnlCents: number
	maxDrawdownCents: number // running drawdown across this tier's trade sequence
}

// Order tiers from strongest to weakest. "untiered" sinks to the bottom so the
// quality-graded tiers stay prominent.
const TIER_ORDER: (QualityTier | "untiered")[] = [
	"AAA",
	"AA",
	"A",
	"B",
	"untiered",
]

// Compute peak-to-trough drawdown over a sequence of P&L deltas. Equivalent to
// the engine-level maxDrawdownCents but scoped to a single tier's trades — i.e.
// "what would the drawdown look like if I only took trades of this tier?".
const computeRunningMaxDrawdown = (pnlSeq: number[]): number => {
	let peak = 0
	let cum = 0
	let maxDD = 0
	for (const delta of pnlSeq) {
		cum += delta
		if (cum > peak) {
			peak = cum
		}
		const dd = cum - peak // ≤ 0
		if (dd < maxDD) {
			maxDD = dd
		}
	}
	return maxDD
}

// Bucket trades by tier and compute per-tier summary metrics. Excludes
// breakeven trades from win/loss counts (mirrors the engine's wins/losses
// definitions). Trades without `quality` are bucketed as "untiered".
const computeTierBreakdown = (
	trades: readonly BacktestTrade[]
): TierBreakdownRow[] => {
	const buckets = new Map<QualityTier | "untiered", BacktestTrade[]>()
	for (const trade of trades) {
		const key: QualityTier | "untiered" = trade.quality?.tier ?? "untiered"
		const bucket = buckets.get(key) ?? []
		bucket.push(trade)
		buckets.set(key, bucket)
	}

	const rows: TierBreakdownRow[] = []
	for (const tier of TIER_ORDER) {
		const bucket = buckets.get(tier) ?? []
		if (bucket.length === 0) {
			continue
		}
		// Preserve engine-emission order for the drawdown calc — trades come
		// back in entry-time order, which is what we want.
		const pnlSeq = bucket.map((t) => t.netPnlCents)
		const wins = bucket.filter((t) => t.netPnlCents > 0).length
		const losses = bucket.filter((t) => t.netPnlCents < 0).length
		const decided = wins + losses
		const totalPnlCents = pnlSeq.reduce((s, p) => s + p, 0)
		const avgR = bucket.reduce((s, t) => s + t.rMultiple, 0) / bucket.length
		rows.push({
			tier,
			count: bucket.length,
			// Win-rate denominator excludes breakevens, matching BacktestSummary.
			winRate: decided === 0 ? 0 : Math.round((wins / decided) * 1000) / 10,
			avgRMultiple: Math.round(avgR * 100) / 100,
			totalPnlCents,
			maxDrawdownCents: computeRunningMaxDrawdown(pnlSeq),
		})
	}
	return rows
}

// Returns true if any trade in the set carries a quality tier. Useful to
// short-circuit the breakdown UI for non-Hawks strategies.
const hasAnyTierData = (trades: readonly BacktestTrade[]): boolean =>
	trades.some((t) => t.quality !== undefined)

export {
	TIER_ORDER,
	computeTierBreakdown,
	hasAnyTierData,
	type TierBreakdownRow,
}
