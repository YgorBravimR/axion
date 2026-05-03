/**
 * Position Size Calculator
 *
 * Pure calculation functions for determining optimal position size
 * based on risk management parameters and asset specifications.
 *
 * All monetary values are in cents to avoid floating-point issues.
 */

interface CalculatorParams {
	entryPrice: number
	stopPrice: number
	targetPrice: number | null
	direction: "long" | "short"
	tickSize: number
	tickValue: number // in cents (e.g., 1000 = R$10.00 per tick)
	multiplier: number
	maxAllowedRiskCents: number
	manualContracts: number | null
}

interface CalculatorResult {
	stopPoints: number
	riskPerContractCents: number
	maxAllowedRiskCents: number
	suggestedContracts: number
	actualContracts: number
	totalRiskCents: number
	targetPoints: number | null
	returnPerContractCents: number | null
	riskRewardRatio: number | null
	isValid: boolean
	errors: string[]
}

const validateDirection = (
	direction: "long" | "short",
	entryPrice: number,
	stopPrice: number,
	targetPrice: number | null
): string[] => {
	const errors: string[] = []

	if (direction === "long") {
		if (stopPrice >= entryPrice) {
			errors.push("validation.stopAboveEntry")
		}
		if (targetPrice !== null && targetPrice <= entryPrice) {
			errors.push("validation.targetBelowEntry")
		}
	}

	if (direction === "short") {
		if (stopPrice <= entryPrice) {
			errors.push("validation.stopBelowEntry")
		}
		if (targetPrice !== null && targetPrice >= entryPrice) {
			errors.push("validation.targetAboveEntry")
		}
	}

	return errors
}

const calculatePositionSize = (params: CalculatorParams): CalculatorResult => {
	const errors = validateDirection(
		params.direction,
		params.entryPrice,
		params.stopPrice,
		params.targetPrice
	)

	if (errors.length > 0) {
		return {
			stopPoints: 0,
			riskPerContractCents: 0,
			maxAllowedRiskCents: params.maxAllowedRiskCents,
			suggestedContracts: 0,
			actualContracts: 0,
			totalRiskCents: 0,
			targetPoints: null,
			returnPerContractCents: null,
			riskRewardRatio: null,
			isValid: false,
			errors,
		}
	}

	// Stop distance in price points
	const stopPoints = Math.abs(params.entryPrice - params.stopPrice)

	// How many ticks fit in that distance
	const ticksInStop = stopPoints / params.tickSize

	// Risk per contract = ticks * tickValue (already in cents)
	const riskPerContractCents = Math.round(ticksInStop * params.tickValue * params.multiplier)

	// Max contracts that fit within risk budget
	const suggestedContracts =
		riskPerContractCents > 0
			? Math.floor(params.maxAllowedRiskCents / riskPerContractCents)
			: 0

	const actualContracts = params.manualContracts ?? suggestedContracts
	const totalRiskCents = actualContracts * riskPerContractCents

	// Target calculations
	let targetPoints: number | null = null
	let returnPerContractCents: number | null = null
	let riskRewardRatio: number | null = null

	if (params.targetPrice !== null) {
		targetPoints = Math.abs(params.targetPrice - params.entryPrice)
		const ticksInTarget = targetPoints / params.tickSize
		returnPerContractCents = Math.round(ticksInTarget * params.tickValue * params.multiplier)
		riskRewardRatio =
			riskPerContractCents > 0 && returnPerContractCents !== null
				? returnPerContractCents / riskPerContractCents
				: null
	}

	return {
		stopPoints,
		riskPerContractCents,
		maxAllowedRiskCents: params.maxAllowedRiskCents,
		suggestedContracts,
		actualContracts,
		totalRiskCents,
		targetPoints,
		returnPerContractCents,
		riskRewardRatio,
		isValid: true,
		errors: [],
	}
}

export { calculatePositionSize }
export type { CalculatorParams, CalculatorResult }
