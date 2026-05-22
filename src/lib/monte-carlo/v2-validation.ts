/**
 * Pure orchestration logic for V2 simulation validation and orchestration.
 * No I/O, no auth — accepts validated params as arguments.
 */

import type { SimulationParamsV2 } from "@/types/monte-carlo"

/**
 * Validate V2 simulation parameters for computational feasibility.
 * @param params Simulation parameters to validate
 * @throws Error if parameters exceed computational budget
 * @returns Validated parameters
 */
export function validateV2SimulationBudget(
	params: SimulationParamsV2
): SimulationParamsV2 {
	// Each simulation runs monthsToTrade * tradingDaysPerMonth trades per month
	const profile = params.profile
	const tradesPerMonth = (profile.tradingDaysPerMonth || 20) * 50 // Assuming ~50 trades per day max
	const totalTrades = tradesPerMonth * (params.monthsToTrade || 12)
	const totalOperations = totalTrades * params.simulationCount

	// Budget cap: prevent runaway simulations
	// Reasonable limit: 100M operations (1000 months * 100k sims or 100 months * 1M sims, etc.)
	const MAX_OPERATIONS = 100_000_000

	if (totalOperations > MAX_OPERATIONS) {
		throw new Error(
			`V2 simulation budget exceeded: ${totalOperations.toLocaleString()} operations > ${MAX_OPERATIONS.toLocaleString()} max`
		)
	}

	return params
}

/**
 * Check if V2 profile has required fields for day-aware simulation.
 * @param profile Risk profile to validate
 * @returns True if profile is complete and valid
 */
export function isV2ProfileComplete(
	profile: SimulationParamsV2["profile"]
): boolean {
	// Validate that key fields are present (non-nullable)
	return (
		profile.name != null &&
		profile.baseRiskCents != null &&
		profile.rewardRiskRatio != null &&
		profile.winRate != null
	)
}

/**
 * Extract simulation boundaries from V2 params.
 * @param params Simulation parameters
 * @returns Object with start and end dates for the simulation period
 */
export function getSimulationTimeframe(params: SimulationParamsV2): {
	monthsToTrade: number
	tradingDaysPerMonth: number
} {
	return {
		monthsToTrade: params.monthsToTrade || 12,
		tradingDaysPerMonth: params.profile.tradingDaysPerMonth || 20,
	}
}

/**
 * Calculate total expected number of trades for V2 simulation.
 * @param params Simulation parameters
 * @returns Expected trade count
 */
export function estimateV2TradeCount(params: SimulationParamsV2): number {
	const { monthsToTrade, tradingDaysPerMonth } = getSimulationTimeframe(params)
	// Conservative estimate: 50 trades per trading day
	return monthsToTrade * tradingDaysPerMonth * 50
}

/**
 * Orchestrate V2 simulation preparation.
 * Performs validation checks without executing the actual simulation.
 * @param params Simulation parameters
 * @returns Validation result with any errors
 */
export function validateV2SimulationSetup(params: SimulationParamsV2): {
	valid: boolean
	errors: string[]
} {
	const errors: string[] = []

	// Check profile completeness - validate key required fields
	if (
		params.profile.name == null ||
		params.profile.baseRiskCents == null ||
		params.profile.rewardRiskRatio == null ||
		params.profile.winRate == null
	) {
		errors.push("V2 profile missing required fields")
	}

	// Check simulation count bounds
	if (params.simulationCount < 100) {
		errors.push("Simulation count must be at least 100")
	}
	if (params.simulationCount > 50_000) {
		errors.push("Simulation count exceeds maximum of 50,000")
	}

	// Check initial balance
	if (params.initialBalance && params.initialBalance <= 0) {
		errors.push("Initial balance must be positive")
	}

	// Check months to trade
	if (params.monthsToTrade && params.monthsToTrade <= 0) {
		errors.push("Months to trade must be positive")
	}

	// Check budget feasibility
	try {
		validateV2SimulationBudget(params)
	} catch (e) {
		errors.push(e instanceof Error ? e.message : "Budget validation failed")
	}

	return {
		valid: errors.length === 0,
		errors,
	}
}
