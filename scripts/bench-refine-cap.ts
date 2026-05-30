/**
 * Benchmark — refine-stage cardinality cap perf gate.
 *
 * Per the locked PR2 decision, the design's `refine.cap = 3000` is unbenchmarked.
 * This script runs ~3000 Hawks combos serially against a small candle slice and
 * reports wall-clock. The outcome ladder:
 *
 *   - < 6 min  → ship refine cap = 3000 (design target).
 *   - 6–15 min → ship refine cap = 3000 with WARN = 1500 (advise smaller).
 *   - > 15 min → drop cap to the largest power of 500 fitting 6 min; update design.
 *
 * Run with:
 *   pnpm tsx scripts/bench-refine-cap.ts
 *
 * Output: human-readable summary on stderr + JSON on stdout for CI pickup.
 *
 * NOTE: this is a CPU-only benchmark — no DB, no worker. Real-world refine
 * sweeps run in a Web Worker, which has the same single-threaded JS perf
 * profile, so wall-clock here is a reasonable proxy.
 */
import { runBacktest } from "@/lib/backtest/engine"
import { hawksTripleScreen } from "@/lib/backtest/presets/hawks-presets"
import type { CandleRow } from "@/types/candle"
import type { AssetConfig, StrategyRecipe } from "@/types/backtest"

const TARGET_COMBINATIONS = 3000

const fakeCandles = (count: number): CandleRow[] => {
	const out: CandleRow[] = []
	const base = new Date("2026-05-13T12:10:00Z").getTime()
	let price = 182_000
	for (let i = 0; i < count; i++) {
		price += i % 2 === 0 ? 50 : -50
		out.push({
			timestamp: new Date(base + i * 5 * 60_000),
			open: price,
			high: price + 100,
			low: price - 100,
			close: price + 25,
			volume: 1000,
			indicators: {},
		} as unknown as CandleRow)
	}
	return out
}

const generateRecipes = (count: number): StrategyRecipe[] => {
	const base = hawksTripleScreen
	const recipes: StrategyRecipe[] = []
	const stopPointsValues = [80, 100, 120, 140, 160, 180]
	const target1Values = [120, 160, 200, 240, 280]
	const target2Values = [200, 280, 360, 440, 520]
	let i = 0
	outer: for (const sp of stopPointsValues) {
		for (const t1 of target1Values) {
			for (const t2 of target2Values) {
				for (let k = 0; k < 20 && i < count; k++) {
					recipes.push({
						...base,
						displayName: `bench-${i}`,
						stop: {
							...base.stop,
							initial: { ...base.stop.initial, points: sp },
						},
						target: {
							...base.target,
							first: { ...base.target.first, points: t1 + k * 5 },
							second: { ...base.target.second, points: t2 + k * 5 },
						},
					} as StrategyRecipe)
					i++
					if (i >= count) {
						break outer
					}
				}
			}
		}
	}
	return recipes
}

const asset: AssetConfig = {
	symbol: "WIN",
	pointValue: 0.2,
	tickSize: 5,
	commissionPerSideCents: 0,
} as AssetConfig

const main = async (): Promise<void> => {
	const candles = fakeCandles(2000)
	const recipes = generateRecipes(TARGET_COMBINATIONS)
	const start = performance.now()
	let trades = 0
	for (const recipe of recipes) {
		const result = runBacktest(candles, asset, recipe)
		trades += result.trades.length
	}
	const elapsedMs = performance.now() - start
	const elapsedMin = elapsedMs / 1000 / 60
	const verdict =
		elapsedMin < 6
			? "PASS — ship cap=3000, WARN=1500"
			: elapsedMin < 15
				? "MARGINAL — ship cap=3000, WARN=1500, surface time warning"
				: "FAIL — drop cap to fit 6 min budget; update design doc"
	const summary = {
		recipes: recipes.length,
		candles: candles.length,
		totalTrades: trades,
		elapsedMs: Math.round(elapsedMs),
		elapsedMin: Number(elapsedMin.toFixed(2)),
		verdict,
	}
	process.stderr.write(
		`refine-cap benchmark: ${recipes.length} combos, ${trades} trades, ${elapsedMin.toFixed(2)} min → ${verdict}\n`
	)
	process.stdout.write(JSON.stringify(summary, null, 2) + "\n")
}

main().catch((err: unknown) => {
	process.stderr.write(`bench-refine-cap failed: ${String(err)}\n`)
	process.exit(1)
})
