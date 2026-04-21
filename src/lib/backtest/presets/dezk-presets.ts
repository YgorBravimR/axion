import type { StrategyRecipe } from "@/types/backtest"

/**
 * Pre-built 10K (dezK) strategy recipes.
 * Based on BRAVO_E_10k_v3.pas and BRAVO_E_10k_v4.pas (Diego TAT mentorship).
 */

/** 10K v4 — Diego TAT faithful replica. Color turn, 2nd candle entry, pivot stop. */
const dezk10kV4: StrategyRecipe = {
	presetId: "custom",
	displayName: "10K v4 — Diego TAT",
	entry: {
		type: "macd_wma_alignment",
		config: {
			macdFast: 12,
			macdSlow: 26,
			macdSignal: 15,
			wmaFast: 9,
			wmaSlow: 21,
			candlesAfterAlignment: 2,
			stopBufferPoints: 30,
			requireZeroCross: false,
			startTime: 903,
			endTime: 1630,
		},
	},
	stop: {
		initial: { type: "fixed_points", points: 0 }, // stop from entry signal's stopReference
		breakeven: { type: "on_partial" },
		trailing: { type: "indicator", wmaPeriod: 9, offset: 1 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 80, mode: "fixed_points", exitPct: 50, label: "partial" },
		],
		eodTime: 1730,
	},
	sizing: { type: "fixed_lots", lots: 10 },
	reversal: { type: "none" },
	slippageTicks: 1,
	requiredIndicators: [],
}

/** 10K v3 — Zero-cross required, same-bar entry, tighter stop. */
const dezk10kV3: StrategyRecipe = {
	presetId: "custom",
	displayName: "10K v3 — Zero Cross",
	entry: {
		type: "macd_wma_alignment",
		config: {
			macdFast: 12,
			macdSlow: 26,
			macdSignal: 15,
			wmaFast: 9,
			wmaSlow: 21,
			candlesAfterAlignment: 0,  // enter same bar
			stopBufferPoints: 10,      // tighter stop (1 Renko + buffer)
			requireZeroCross: true,
			startTime: 905,
			endTime: 1630,
		},
	},
	stop: {
		initial: { type: "fixed_points", points: 0 },
		breakeven: { type: "on_partial" },
		trailing: { type: "indicator", wmaPeriod: 9, offset: 1 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 500, mode: "fixed_points", exitPct: 50, label: "partial" },
			{ value: 1250, mode: "fixed_points", exitPct: 100, label: "final" },
		],
		eodTime: 1730,
	},
	sizing: { type: "fixed_lots", lots: 10 },
	reversal: { type: "none" },
	slippageTicks: 1,
	requiredIndicators: [],
}

const dezkPresets: StrategyRecipe[] = [dezk10kV4, dezk10kV3]

export { dezkPresets, dezk10kV4, dezk10kV3 }
