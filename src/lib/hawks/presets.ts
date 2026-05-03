/**
 * Hawks-tuned presets for backtest, Monte Carlo, and Equity Shield.
 *
 * The Hawks method's true entry trigger (Onda 2 pullback to 60-min EMA zone
 * confirmed by 5-min MACD on Renko bricks) is too specific to fit any of
 * Axion's existing engine entry types one-to-one. The backtest preset below
 * therefore approximates the spirit using the existing MACD/WMA alignment
 * engine with Pedro's calibration (21/89/42 + 27/55 EMAs, fixed-points
 * stop, partial + indicator trailing). Faithful Method-3 stop and Fib
 * expansion targets require a new entry/target type — out of scope for v1.
 *
 * MC + Equity Shield presets surface the rule-based numbers (3 trades/day,
 * 5 % daily stop, 10/5 stop-day cascade) so users can punch them into the
 * existing forms without recomputing them every time.
 *
 * @see docs/hawks-mode-research.md § 8 Phase 5
 */

import type { StrategyRecipe } from "@/types/backtest"

const hawksBacktestRecipe: StrategyRecipe = {
	presetId: "custom",
	displayName: "Hawks — Triple Screen Renko",
	entry: {
		type: "macd_wma_alignment",
		config: {
			macdFast: 21,
			macdSlow: 89,
			macdSignal: 42,
			wmaFast: 27,
			wmaSlow: 55,
			candlesAfterAlignment: 1,
			stopBufferPoints: 11,
			requireZeroCross: false,
			startTime: 905,
			endTime: 1700,
		},
	},
	stop: {
		initial: { type: "fixed_points", points: 0 },
		breakeven: { type: "on_partial" },
		trailing: { type: "indicator", wmaPeriod: 27, offset: 1 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 76, mode: "fixed_points", exitPct: 33, label: "fib_76_4" },
			{ value: 100, mode: "fixed_points", exitPct: 33, label: "fib_100" },
			{ value: 162, mode: "fixed_points", exitPct: 100, label: "fib_161_8" },
		],
		eodTime: 1730,
	},
	sizing: { type: "fixed_lots", lots: 1 },
	reversal: { type: "none" },
	slippageTicks: 1,
	requiredIndicators: [],
}

interface HawksMonteCarloDefaults {
	maxTradesPerDay: number
	dailyLossLimitPct: number
	weeklyLossLimitPct: number
	monthlyLossLimitPct: number
	stopAfterConsecutiveLosses: number
	profitFactorTarget: number
	winRateTarget: number
	expectancyR: number
}

const hawksMonteCarloDefaults: HawksMonteCarloDefaults = {
	maxTradesPerDay: 3,
	dailyLossLimitPct: 5,
	weeklyLossLimitPct: 10,
	monthlyLossLimitPct: 20,
	stopAfterConsecutiveLosses: 2,
	profitFactorTarget: 3.87,
	winRateTarget: 0.3166,
	expectancyR: 0.92,
}

interface HawksEquityShieldDefaults {
	mddMultiplier: number
	recoveryPercent: number
	smaPeriod: number
	stopDayCascade: { stop5: number; stop10: number }
	notes: string
}

const hawksEquityShieldDefaults: HawksEquityShieldDefaults = {
	mddMultiplier: 1.3,
	recoveryPercent: 0.3,
	smaPeriod: 10,
	stopDayCascade: { stop5: 5, stop10: 10 },
	notes:
		"Five red days in a row → drop to 50 % size. Ten red days → flat for the rest of the month, review in journal.",
}

export {
	hawksBacktestRecipe,
	hawksMonteCarloDefaults,
	hawksEquityShieldDefaults,
}
export type { HawksMonteCarloDefaults, HawksEquityShieldDefaults }
