import type { StrategyRecipe } from "@/types/backtest"

/**
 * Pre-built ORB strategy recipes matching the 4 tests from
 * /Users/ygorbravim/personal/projects/nelogica/working/BREAKOUT_1C_BACKTEST_GUIDE.md
 */

/** Test 1: Article replica — stop curto, sem parcial, EoD exit */
const orbTest1: StrategyRecipe = {
	presetId: "orb_test_1",
	displayName: "ORB Test 1 — Article Replica",
	entry: {
		type: "orb_breakout",
		config: { startTime: 900, endTime: 905, ticksBuffer: 2, ignorarGaps: true },
	},
	stop: {
		initial: { type: "pct_range", pct: 30 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 1000, mode: "pct_range", exitPct: 50, label: "target1" },
			{ value: 2000, mode: "pct_range", exitPct: 100, label: "target2" },
		],
		eodTime: 1730,
	},
	sizing: { type: "monetary_risk", riskAmountCents: 8000, valuePerPointCents: 20, riskDistribution: "per_trade" },
	reversal: { type: "none" },
	slippageTicks: 1,
	requiredIndicators: [],
}

/** Test 2: Conservative A — parcial 100%, alvo 200%, virada */
const orbTest2: StrategyRecipe = {
	presetId: "orb_test_2",
	displayName: "ORB Test 2 — Conservative A",
	entry: {
		type: "orb_breakout",
		config: { startTime: 900, endTime: 910, ticksBuffer: 2, ignorarGaps: true },
	},
	stop: {
		initial: { type: "full_range", ticksBuffer: 2 },
		breakeven: { type: "on_partial" },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 1, mode: "r_multiple", exitPct: 50, label: "target1" },
			{ value: 2, mode: "r_multiple", exitPct: 100, label: "target2" },
		],
		eodTime: 1730,
	},
	sizing: { type: "monetary_risk", riskAmountCents: 8000, valuePerPointCents: 20, riskDistribution: "per_trade" },
	reversal: { type: "reverse_on_stop", maxReversals: 1, virarNoBE: false },
	slippageTicks: 1,
	requiredIndicators: [],
}

/** Test 3: Conservative B — stop apertado + BE antecipado + alvos longos */
const orbTest3: StrategyRecipe = {
	presetId: "orb_test_3",
	displayName: "ORB Test 3 — Conservative B",
	entry: {
		type: "orb_breakout",
		config: { startTime: 900, endTime: 915, ticksBuffer: 2, ignorarGaps: true },
	},
	stop: {
		initial: { type: "pct_range", pct: 60 },
		breakeven: { type: "on_pct_risk", triggerPct: 50 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 1, mode: "r_multiple", exitPct: 50, label: "target1" },
			{ value: 3, mode: "r_multiple", exitPct: 100, label: "target2" },
		],
		eodTime: 1730,
	},
	sizing: { type: "monetary_risk", riskAmountCents: 8000, valuePerPointCents: 20, riskDistribution: "per_trade" },
	reversal: { type: "reverse_on_stop", maxReversals: 1, virarNoBE: false },
	slippageTicks: 1,
	requiredIndicators: [],
}

/** Test 4: Conservative C — range curto, parcial agressivo, sem virada */
const orbTest4: StrategyRecipe = {
	presetId: "orb_test_4",
	displayName: "ORB Test 4 — Conservative C",
	entry: {
		type: "orb_breakout",
		config: { startTime: 900, endTime: 905, ticksBuffer: 2, ignorarGaps: true },
	},
	stop: {
		initial: { type: "pct_range", pct: 40 },
	},
	target: {
		type: "fixed_levels",
		levels: [
			{ value: 75, mode: "pct_range", exitPct: 50, label: "target1" },
			{ value: 200, mode: "pct_range", exitPct: 100, label: "target2" },
		],
		eodTime: 1730,
	},
	sizing: { type: "monetary_risk", riskAmountCents: 8000, valuePerPointCents: 20, riskDistribution: "per_trade" },
	reversal: { type: "none" },
	slippageTicks: 1,
	requiredIndicators: [],
}

const orbPresets: StrategyRecipe[] = [orbTest1, orbTest2, orbTest3, orbTest4]

export { orbPresets, orbTest1, orbTest2, orbTest3, orbTest4 }
