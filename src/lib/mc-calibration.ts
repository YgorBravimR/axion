import type { MCCalibrationSnapshot } from "@/types/mc-calibration"
import type { MonteCarloResult, MonteCarloResultV2 } from "@/types/monte-carlo"

// ==========================================
// SUGGESTION FUNCTIONS
// ==========================================

/**
 * Suggest SMA period from expected max loss streak.
 * The SMA should be long enough to absorb a typical worst-case loss streak
 * without whipsawing in and out of sim mode.
 */
const suggestSmaPeriod = (expectedMaxLossStreak: number): number => {
	const suggested = Math.ceil(expectedMaxLossStreak)
	return Math.max(3, Math.min(50, suggested))
}

/**
 * Suggest MDD multiplier from the ratio of worst-case to median max R drawdown.
 * Answers "how much worse than typical can the drawdown get?" — the safety buffer.
 *
 * Guard: if median is near zero (near-perfect strategy in simulation),
 * the ratio explodes — fall back to the mentor's default of 1.3.
 */
const suggestMddMultiplier = (
	worstMaxRDrawdown: number,
	medianMaxRDrawdown: number
): number => {
	if (medianMaxRDrawdown < 0.1) return 1.3
	const ratio = worstMaxRDrawdown / medianMaxRDrawdown
	return Math.round(Math.max(1.1, Math.min(3.0, ratio)) * 10) / 10
}

/**
 * Suggest drawdown limit in cents from worst-case DD percentage.
 * Converts Monte Carlo's statistical worst-case into an absolute dollar floor.
 */
const suggestDrawdownLimitCents = (
	worstMaxDrawdownPercent: number,
	initialBalanceCents: number
): number => {
	return Math.round(initialBalanceCents * worstMaxDrawdownPercent / 100)
}

// ==========================================
// SNAPSHOT BUILDERS
// ==========================================

/**
 * Build a compact calibration snapshot from V1 (Edge Expectancy) results.
 * Extracts only the scalar statistics needed for Equity Shield calibration.
 */
const buildCalibrationSnapshot = (
	result: MonteCarloResult
): MCCalibrationSnapshot => ({
	version: "v1",
	timestamp: Date.now(),
	expectedMaxLossStreak: result.statistics.expectedMaxLossStreak,
	worstMaxRDrawdown: result.statistics.worstMaxRDrawdown,
	medianMaxRDrawdown: result.statistics.medianMaxRDrawdown,
	profitablePct: result.statistics.profitablePct,
})

/**
 * Build a compact calibration snapshot from V2 (Capital Expectancy) results.
 * Captures dollar-space drawdown statistics and initial balance for conversion.
 */
const buildCalibrationSnapshotV2 = (
	result: MonteCarloResultV2,
	initialBalanceCents: number
): MCCalibrationSnapshot => ({
	version: "v2",
	timestamp: Date.now(),
	worstMaxDrawdownPercent: result.statistics.worstMaxDrawdownPercent,
	medianMaxDrawdownPercent: result.statistics.medianMaxDrawdownPercent,
	riskOfRuinPercent: result.statistics.riskOfRuinPercent,
	initialBalanceCents,
})

export {
	suggestSmaPeriod,
	suggestMddMultiplier,
	suggestDrawdownLimitCents,
	buildCalibrationSnapshot,
	buildCalibrationSnapshotV2,
}
