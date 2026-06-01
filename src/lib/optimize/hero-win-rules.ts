/**
 * Hero-win qualification rules — the gates a refine run must clear before the
 * user can promote it to a frozen hero preset.
 *
 * Per the locked /plan-eng-review decision (Q3, 2026-05-30): these are code
 * constants here; a settings panel is deferred to P3 backlog. Update the
 * `notes` line below if the user requests a values change so the gate is
 * auditable from the file's history.
 *
 * Notes:
 * - 2026-05-30: initial values from the design doc.
 */
import type { OptimizationRun, HeroWinPreset } from "@/types/backtest"

interface HeroGateOutcome {
	passes: boolean
	failures: Array<{
		ruleId: keyof typeof HERO_WIN_RULES
		actualValue: number | boolean | undefined
		threshold: number | boolean
		labelKey: string
	}>
}

const HERO_WIN_RULES = {
	minProfitFactor: 1.5,
	requireOOSRobust: true,
	minTrades: 30,
} as const

/**
 * Check a run against every hero-win rule. Returns `passes=true` iff ALL
 * gates clear; otherwise `failures[]` lists what failed and what was needed.
 * UI surfaces the failures in the freeze modal so the user knows exactly why
 * a candidate is not promotable.
 */
const evaluateHeroGates = (run: OptimizationRun): HeroGateOutcome => {
	const failures: HeroGateOutcome["failures"] = []
	if (run.summary.profitFactor < HERO_WIN_RULES.minProfitFactor) {
		failures.push({
			ruleId: "minProfitFactor",
			actualValue: run.summary.profitFactor,
			threshold: HERO_WIN_RULES.minProfitFactor,
			labelKey: "minProfitFactor",
		})
	}
	if (HERO_WIN_RULES.requireOOSRobust && run.oosRobust !== true) {
		failures.push({
			ruleId: "requireOOSRobust",
			actualValue: run.oosRobust,
			threshold: HERO_WIN_RULES.requireOOSRobust,
			labelKey: "requireOOSRobust",
		})
	}
	if (run.summary.totalTrades < HERO_WIN_RULES.minTrades) {
		failures.push({
			ruleId: "minTrades",
			actualValue: run.summary.totalTrades,
			threshold: HERO_WIN_RULES.minTrades,
			labelKey: "minTrades",
		})
	}
	return { passes: failures.length === 0, failures }
}

/** Build a default preset ID using source ID + ISO date (YYYY-MM-DD). */
const suggestPresetId = (sourcePresetId: string, frozenAt: Date): string => {
	const date = frozenAt.toISOString().slice(0, 10)
	return `${sourcePresetId}_tuned_${date}`
}

/** Snapshot the metrics required by HeroWinPreset.metrics from a run. */
const snapshotMetrics = (run: OptimizationRun): HeroWinPreset["metrics"] => ({
	profitFactor: run.summary.profitFactor,
	profitFactorOOS: run.summaryOOS?.profitFactor,
	matchRate: run.matchRate,
	trades: run.summary.totalTrades,
	oosRobust: run.oosRobust === true,
	maxDrawdownCents: run.summary.maxDrawdownCents,
	winRate: run.summary.winRate,
})

export { HERO_WIN_RULES, evaluateHeroGates, suggestPresetId, snapshotMetrics }
export type { HeroGateOutcome }
