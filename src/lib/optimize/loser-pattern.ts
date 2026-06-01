/**
 * Loser pattern mining — surfaces which leaves disproportionately appear in
 * losers vs winners, and ranks them by causal strength.
 *
 * Per the design doc (PR 4 of broad-to-specific funnel, locked 2026-05-30):
 *   "Distinguishes correlated leaves (co-occur with winners) from causal
 *    leaves (flip outcomes). Surfaced under the broad scatter as actionable
 *    drivers: 'lock to winner value' / 'avoid loser value'."
 *
 * Math:
 *   For each leaf, for each observed value:
 *     winnerFreq = count(winners with value) / count(all winners)
 *     loserFreq  = count(losers  with value) / count(all losers)
 *     delta      = loserFreq - winnerFreq    (∈ [-1, 1])
 *
 *   delta > 0 → value appears more in losers; AVOID
 *   delta < 0 → value appears more in winners; PREFER
 *   |delta| close to 0 → no signal (random / both)
 *
 * Driver ranking is by `|delta|` across leaf values, then by leaf overall
 * strength (max |delta| per leaf). The list returned is per-leaf-value so the
 * UI can surface specific recommendations ("aggressionMode=reversed is in
 * 67% of winners vs 12% of losers — fix this in refine").
 */
import type { OptimizationRun, StrategyRecipe } from "@/types/backtest"
import type { PrimitiveValue } from "./sweep-leaf"

interface LeafValueDriver {
	leafPath: string
	value: PrimitiveValue
	winnerFreq: number
	loserFreq: number
	delta: number
	support: number
}

interface PatternMiningInput {
	runs: OptimizationRun[]
	leafPaths: string[]
	/**
	 * How to split runs into winners vs losers. Default = PF threshold:
	 *   winner: PF >= winnerPfMin (default 1.5)
	 *   loser:  PF <= loserPfMax  (default 1.0)
	 * Runs in between are excluded from both pools (gray zone).
	 */
	winnerPfMin?: number
	loserPfMax?: number
}

interface PatternMiningResult {
	winners: number
	losers: number
	drivers: LeafValueDriver[]
}

const DEFAULT_WINNER_PF_MIN = 1.5
const DEFAULT_LOSER_PF_MAX = 1.0

const readPath = (obj: unknown, path: string): unknown => {
	const parts = path.split(".")
	let cur: unknown = obj
	for (const part of parts) {
		if (cur === null || typeof cur !== "object") {
			return undefined
		}
		cur = (cur as Record<string, unknown>)[part]
	}
	return cur
}

const isPrimitive = (v: unknown): v is PrimitiveValue =>
	typeof v === "string" || typeof v === "number" || typeof v === "boolean"

/**
 * Build the per-leaf-value driver list across the runs corpus. The result is
 * sorted by absolute delta (most causal leaves first). Pools with zero runs
 * on either side return an empty driver list.
 */
const minePatterns = (input: PatternMiningInput): PatternMiningResult => {
	const winnerPfMin = input.winnerPfMin ?? DEFAULT_WINNER_PF_MIN
	const loserPfMax = input.loserPfMax ?? DEFAULT_LOSER_PF_MAX
	const winnerRecipes: StrategyRecipe[] = []
	const loserRecipes: StrategyRecipe[] = []
	for (const run of input.runs) {
		if (run.summary.profitFactor >= winnerPfMin) {
			winnerRecipes.push(run.recipe)
		} else if (run.summary.profitFactor <= loserPfMax) {
			loserRecipes.push(run.recipe)
		}
	}

	const winners = winnerRecipes.length
	const losers = loserRecipes.length
	if (winners === 0 || losers === 0) {
		return { winners, losers, drivers: [] }
	}

	const drivers: LeafValueDriver[] = []
	for (const leafPath of input.leafPaths) {
		const winnerCounts = new Map<string, number>()
		const loserCounts = new Map<string, number>()
		for (const recipe of winnerRecipes) {
			const v = readPath(recipe, leafPath)
			if (!isPrimitive(v)) {
				continue
			}
			const k = `${typeof v}:${String(v)}`
			winnerCounts.set(k, (winnerCounts.get(k) ?? 0) + 1)
		}
		for (const recipe of loserRecipes) {
			const v = readPath(recipe, leafPath)
			if (!isPrimitive(v)) {
				continue
			}
			const k = `${typeof v}:${String(v)}`
			loserCounts.set(k, (loserCounts.get(k) ?? 0) + 1)
		}

		const allKeys = new Set<string>([
			...winnerCounts.keys(),
			...loserCounts.keys(),
		])
		for (const k of allKeys) {
			const wCount = winnerCounts.get(k) ?? 0
			const lCount = loserCounts.get(k) ?? 0
			const winnerFreq = wCount / winners
			const loserFreq = lCount / losers
			const delta = loserFreq - winnerFreq
			const support = wCount + lCount
			const [typeTag, rawValue] = k.split(":")
			let value: PrimitiveValue
			if (typeTag === "number") {
				value = Number(rawValue)
			} else if (typeTag === "boolean") {
				value = rawValue === "true"
			} else {
				value = rawValue ?? ""
			}
			drivers.push({ leafPath, value, winnerFreq, loserFreq, delta, support })
		}
	}

	drivers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
	return { winners, losers, drivers }
}

/**
 * Pick the top N drivers AND clamp by a minimum |delta| threshold so the UI
 * doesn't surface noise. `minAbsDelta` defaults to 0.2 — meaning the value
 * must appear at least 20 percentage points more (or less) in losers vs
 * winners to register as a driver.
 */
const topDrivers = (
	result: PatternMiningResult,
	limit = 10,
	minAbsDelta = 0.2
): LeafValueDriver[] =>
	result.drivers.filter((d) => Math.abs(d.delta) >= minAbsDelta).slice(0, limit)

export { minePatterns, topDrivers, DEFAULT_WINNER_PF_MIN, DEFAULT_LOSER_PF_MAX }
export type { LeafValueDriver, PatternMiningInput, PatternMiningResult }
