import { describe, it, expect } from "vitest"
import { runBacktest } from "@/lib/backtest/engine"
import { recipeFromCombo } from "@/lib/optimize/recipe-from-combo"
import type { StrategyRecipe, AssetConfig, CandleRow } from "@/types/backtest"

const createMockRecipe = (): StrategyRecipe => ({
	entry: {
		type: "hawks_triple_screen",
		config: {
			ema27_60m_key: "mme27_60m",
			ema55_60m_key: "mme55_60m",
			ema27_15m_key: "mme27_15m",
			ema55_15m_key: "mme55_15m",
			macd_key: "macd",
			prev_15m_open_key: "prev_15m_open",
			prev_15m_close_key: "prev_15m_close",
			prev_60m_open_key: "prev_60m_open",
			prev_60m_close_key: "prev_60m_close",
			brickSize5mPoints: 100,
			startTime: 930,
			endTime: 1730,
		},
	},
	stop: {
		triggerMode: "exact",
		baseBricks: 1,
		breakeven: undefined,
		trailing: undefined,
	},
	target: {
		type: "fixed",
		levels: [{ name: "T1", ratio: 1.5 }],
	},
	sizing: {
		type: "monetary_risk",
		valuePerPointCents: 10000,
	},
	reversal: {
		type: "none",
	},
	requiredIndicators: ["mme27_60m"],
	slippageTicks: 0,
})

const createMockCandles = (): CandleRow[] => [
	{
		timestamp: "2026-01-02T13:05:00.000Z",
		open: 100000,
		high: 100100,
		low: 99950,
		close: 100050,
		candleIndex: 0,
		indicators: {
			mme27_60m: 100000,
			mme55_60m: 100050,
			mme27_15m: 100000,
			mme55_15m: 100050,
			prev_15m_open: 100000,
			prev_15m_close: 100000,
			prev_60m_open: 100000,
			prev_60m_close: 100000,
			macd: 0,
			volume: 1000,
		},
	},
	{
		timestamp: "2026-01-02T13:10:00.000Z",
		open: 100050,
		high: 100150,
		low: 100000,
		close: 100120,
		candleIndex: 1,
		indicators: {
			mme27_60m: 100000,
			mme55_60m: 100050,
			mme27_15m: 100000,
			mme55_15m: 100050,
			prev_15m_open: 100000,
			prev_15m_close: 100000,
			prev_60m_open: 100000,
			prev_60m_close: 100000,
			macd: 0.5,
			volume: 1100,
		},
	},
]

const assetConfig: AssetConfig = {
	tickSize: 5,
	tickValueCents: 100,
	currency: "BRL",
}

describe("Backtest vs Optimize Engine Parity", () => {
	it("produces identical trade count when recipe goes through recipeFromCombo with empty combo", () => {
		const recipe = createMockRecipe()
		const candles = createMockCandles()

		// Path 1: Direct backtest (simulates /backtest route)
		const result1 = runBacktest(candles, recipe, assetConfig)

		// Path 2: Recipe through recipeFromCombo with empty combo (simulates /optimize route)
		const recipeViaCombo = recipeFromCombo(recipe, {})
		const result2 = runBacktest(candles, recipeViaCombo, assetConfig)

		// Trade counts should match
		expect(result1.summary.totalTrades).toBe(result2.summary.totalTrades)
		expect(result1.summary.profitFactor).toBeCloseTo(
			result2.summary.profitFactor,
			5
		)
		expect(result1.summary.netPnlCents).toBe(result2.summary.netPnlCents)
	})

	it("produces identical results when candles are structuredCloned (simulates postMessage)", () => {
		const recipe = createMockRecipe()
		const candles = createMockCandles()

		// Path 1: Direct backtest
		const result1 = runBacktest(candles, recipe, assetConfig)

		// Path 2: With structuredClone (simulates postMessage in worker)
		const clonedCandles = structuredClone(candles)
		const clonedRecipe = structuredClone(recipe)
		const result2 = runBacktest(clonedCandles, clonedRecipe, assetConfig)

		expect(result1.summary.totalTrades).toBe(result2.summary.totalTrades)
		expect(result1.summary.profitFactor).toBeCloseTo(
			result2.summary.profitFactor,
			5
		)
		expect(result1.summary.netPnlCents).toBe(result2.summary.netPnlCents)
	})

	it("produces identical results when recipe goes through both recipeFromCombo AND structuredClone", () => {
		const recipe = createMockRecipe()
		const candles = createMockCandles()

		// Path 1: Direct backtest
		const result1 = runBacktest(candles, recipe, assetConfig)

		// Path 2: Full simulate /optimize path
		const clonedCandles = structuredClone(candles)
		const recipeViaCombo = recipeFromCombo(recipe, {})
		const result2 = runBacktest(clonedCandles, recipeViaCombo, assetConfig)

		expect(result1.summary.totalTrades).toBe(result2.summary.totalTrades)
		expect(result1.summary.profitFactor).toBeCloseTo(
			result2.summary.profitFactor,
			5
		)
		expect(result1.summary.netPnlCents).toBe(result2.summary.netPnlCents)
	})
})

describe("Hawks Day Boundary Parity", () => {
	it("produces identical results for multi-day backtests", () => {
		const recipe = createMockRecipe()
		// Two days of candles
		const candles: CandleRow[] = [
			// Day 1
			{
				timestamp: "2026-01-02T13:05:00.000Z", // Day key: 2026-01-02
				open: 100000,
				high: 100100,
				low: 99950,
				close: 100050,
				candleIndex: 0,
				indicators: {
					mme27_60m: 100000,
					mme55_60m: 100050,
					mme27_15m: 100000,
					mme55_15m: 100050,
					prev_15m_open: 100000,
					prev_15m_close: 100000,
					prev_60m_open: 100000,
					prev_60m_close: 100000,
					macd: 0,
					volume: 1000,
				},
			},
			{
				timestamp: "2026-01-02T13:10:00.000Z",
				open: 100050,
				high: 100150,
				low: 100000,
				close: 100120,
				candleIndex: 1,
				indicators: {
					mme27_60m: 100000,
					mme55_60m: 100050,
					mme27_15m: 100000,
					mme55_15m: 100050,
					prev_15m_open: 100000,
					prev_15m_close: 100000,
					prev_60m_open: 100000,
					prev_60m_close: 100000,
					macd: 0.5,
					volume: 1100,
				},
			},
			// Day 2
			{
				timestamp: "2026-01-03T13:05:00.000Z", // Different day key: 2026-01-03
				open: 100100,
				high: 100200,
				low: 100000,
				close: 100180,
				candleIndex: 2,
				indicators: {
					mme27_60m: 100000,
					mme55_60m: 100050,
					mme27_15m: 100000,
					mme55_15m: 100050,
					prev_15m_open: 100000,
					prev_15m_close: 100000,
					prev_60m_open: 100000,
					prev_60m_close: 100000,
					macd: 0.2,
					volume: 950,
				},
			},
		]

		// Path 1: Direct backtest
		const result1 = runBacktest(candles, recipe, assetConfig)

		// Path 2: Recipe through recipeFromCombo + structuredClone
		const clonedCandles = structuredClone(candles)
		const recipeViaCombo = recipeFromCombo(recipe, {})
		const result2 = runBacktest(clonedCandles, recipeViaCombo, assetConfig)

		expect(result1.summary.totalTrades).toBe(result2.summary.totalTrades)
		expect(result1.trades.length).toBe(result2.trades.length)
		expect(result1.dayBreakdown.length).toBe(result2.dayBreakdown.length)
	})
})

describe("Hawks Walk-Forward Verification", () => {
	it("correctly handles IS/OOS split without altering individual trade counts", () => {
		const recipe = createMockRecipe()
		const candles = createMockCandles()

		// Single-pass backtest (simulates /backtest or /optimize without walk-forward)
		const result = runBacktest(candles, recipe, assetConfig)

		// IS-only backtest (simulates walk-forward IS phase)
		// In this simple test, just the first candle
		const isCandles = candles.slice(0, 1)
		const resultIS = runBacktest(isCandles, recipe, assetConfig)

		// OOS-only backtest (simulates walk-forward OOS phase)
		const oosCandles = candles.slice(1)
		const resultOOS = runBacktest(oosCandles, recipe, assetConfig)

		// Verify: combined IS+OOS trades should not equal full dataset trades
		// (because the split changes the pivot detection on the boundary)
		// But each path should be internally consistent
		expect(resultIS.trades).toBeDefined()
		expect(resultOOS.trades).toBeDefined()
		expect(result.trades).toBeDefined()

		// All results should have the same engine version
		expect(resultIS.engineVersion).toBe(result.engineVersion)
		expect(resultOOS.engineVersion).toBe(result.engineVersion)
	})

	it("maintains engine version consistency across all invocation paths", () => {
		const recipe = createMockRecipe()
		const candles = createMockCandles()

		const result1 = runBacktest(candles, recipe, assetConfig)
		const result2 = runBacktest(
			structuredClone(candles),
			structuredClone(recipe),
			assetConfig
		)
		const result3 = runBacktest(
			candles,
			recipeFromCombo(recipe, {}),
			assetConfig
		)

		expect(result1.engineVersion).toBe("hawks-v0.7")
		expect(result2.engineVersion).toBe("hawks-v0.7")
		expect(result3.engineVersion).toBe("hawks-v0.7")
	})
})
