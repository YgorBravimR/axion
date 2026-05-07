import type { MonetaryRiskSizingConfig } from "@/types/backtest"

/**
 * Calculate contracts from monetary risk.
 * Formula: floor(riskAmountCents / (stopDistance × valuePerPointCents))
 * Minimum: 1 contract.
 */
const calculateMonetaryRisk = (
	stopDistance: number,
	config: MonetaryRiskSizingConfig
): number => {
	if (stopDistance <= 0) {
		return 1
	}
	const contracts = Math.floor(
		config.riskAmountCents / (stopDistance * config.valuePerPointCents)
	)
	return Math.max(1, contracts)
}

export { calculateMonetaryRisk }
