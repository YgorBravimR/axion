import type { StrategyRecipe } from "@/types/backtest"

/**
 * Hawks triple-screen v0 preset (engine math v0.2).
 *
 * Entry: 5m Renko brick closing in bias direction + 60m EMA stack aligned + 15m EMA aligned + MACD > 0.
 * Stop: 2 bricks back, Hawks 1R = 2 Renko (signal.stopReference = 2·open − close).
 * Target: 2R single exit (R-multiple off the corrected 2-brick stop distance).
 *
 * requiredIndicators must match the keys stored in candle JSONB by the CSV import pipeline.
 */
const hawksV0: StrategyRecipe = {
	presetId: "hawks_v0",
	displayName: "Hawks v0 — Triple Screen",
	entry: {
		type: "hawks_triple_screen",
		config: {
			ema27_60m_key: "mme27_60m",
			ema55_60m_key: "mme55_60m",
			ema27_15m_key: "mme27_15m",
			macd_key: "macd",
			startTime: 930,
			endTime: 1730,
		},
	},
	stop: {
		// points=0 activates signal.stopReference escape hatch — stop = 2·open − close = 2 bricks back
		initial: { type: "fixed_points", points: 0 },
	},
	target: {
		type: "fixed_levels",
		levels: [{ value: 2, mode: "r_multiple", exitPct: 100, label: "target1" }],
		eodTime: 1730,
	},
	sizing: { type: "fixed_lots", lots: 1 },
	reversal: { type: "none" },
	slippageTicks: 0,
	requiredIndicators: ["mme27_60m", "mme55_60m", "mme27_15m", "macd"],
}

const hawksPresets: readonly [StrategyRecipe, ...StrategyRecipe[]] = [hawksV0]

export { hawksPresets, hawksV0 }
