import type { CandleRow } from "@/types/candle"
import type { StrategyRecipe } from "@/types/backtest"

// v2 → v3 (2026-05-30): adds funnel fields (stage, parentRunIds, journeyId) to
// OptimizationRunProvenance. All three are optional; v2 entries deserialize as
// `stage=undefined`, which the UI renders as "ad-hoc" (non-funnel run). No data
// rewrite needed on migration — bumped to keep version-to-shape mapping explicit
// per the locked PR2 decision.
//
// v3 → v4 (2026-05-31): retag legacy broad sweeps. Pre-v4 the orchestrator
// passed `funnelStage: undefined` for non-refine sweeps, leaving `stage`
// blank. After v4 broad sweeps are explicitly stamped `stage: "broad"` and
// labels prefix with the wave name. The migration rewrites any record with
// `stage === undefined` to `stage: "broad"` and renames `Sweep #N` → `Broad
// #N` so the table is internally consistent without forcing the user to
// clear localStorage.
//
// v4 → v5 (2026-06-01): Pareto retention policy. Trades arrays are now
// compacted to save localStorage quota: full trades kept only for Pareto-front
// runs and single-metric extremes. The `tradesRetained` boolean flag marks
// whether a run's trades array is intact or stripped. On v4→v5 migration,
// all runs inherit `tradesRetained: true` (safe assumption: if trades exist
// in localStorage, we kept them; if they were stripped by an older pareto
// logic, they're already gone and missing tradesRetained is falsy).
//
// v5 → v6 (2026-06-01): Dual-mode quality gates. QualityGatesConfig gains
// new nested fields (keltnerInner, macd, volume, aggression) alongside legacy
// flat fields. Migration translates legacy flags to new shapes (e.g.,
// keltnerInnerPenalty: true → keltnerInner: { mode: "score" }), preserving
// both old and new fields until Piece B rewrites the rule code and phases out
// legacy fields. Idempotent: runs already having new fields are left untouched.
const STORAGE_SCHEMA_VERSION = 6

const hashString = (input: string): string => {
	let h = 0x811c9dc5
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i)
		h = Math.imul(h, 0x01000193) >>> 0
	}
	return h.toString(16).padStart(8, "0")
}

const hashCandles = (candles: CandleRow[]): string => {
	if (candles.length === 0) {
		return "empty"
	}
	const first = candles[0]!
	const last = candles[candles.length - 1]!
	const sample =
		candles.length > 4 ? [candles[Math.floor(candles.length / 2)]!] : []
	const payload = [first, ...sample, last]
		.map((c) => `${c.timestamp}|${c.open}|${c.close}`)
		.join(";")
	return `${candles.length}-${hashString(payload)}`
}

const hashDateRange = (from: string, to: string): string =>
	hashString(`${from}..${to}`)

const hashRecipeConfig = (recipe: StrategyRecipe): string =>
	hashString(JSON.stringify(recipe))

interface SweepProvenance {
	sweepId: string
	datasetHash: string
	candleCount: number
	dateRangeHash: string
	dateFrom: string
	dateTo: string
	engineVersion: string
	createdAt: string
}

const buildSweepProvenance = (
	candles: CandleRow[],
	dateFrom: string,
	dateTo: string,
	engineVersion: string
): SweepProvenance => ({
	sweepId: crypto.randomUUID(),
	datasetHash: hashCandles(candles),
	candleCount: candles.length,
	dateRangeHash: hashDateRange(dateFrom, dateTo),
	dateFrom,
	dateTo,
	engineVersion,
	createdAt: new Date().toISOString(),
})

export {
	STORAGE_SCHEMA_VERSION,
	hashCandles,
	hashDateRange,
	hashRecipeConfig,
	buildSweepProvenance,
}
export type { SweepProvenance }
