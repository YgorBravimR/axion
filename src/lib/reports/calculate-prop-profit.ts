import type {
	PropProfitCalculation,
	PropCalcSettings,
} from "@/app/actions/reports.types"

/**
 * Calculates prop trading profit distribution and tax.
 *
 * For profitable gross amounts:
 * - Applies profit share percentage (100% for non-prop, custom % for prop accounts)
 * - Computes trader and firm shares
 * - Estimates tax on trader share (if showTaxEstimates is true)
 * - Returns net profit to trader
 *
 * For losses (grossProfit ≤ 0):
 * - Trader absorbs full loss
 * - No tax on losses
 *
 * @param grossProfit - Gross profit amount in cents (PnL + fees)
 * @param settings - Account settings including prop split percentage and tax rate
 * @returns Profit calculation breakdown with trader share, tax estimate, and net profit
 */
const calculatePropProfit = (
	grossProfit: number,
	settings: PropCalcSettings
): PropProfitCalculation => {
	// Only calculate shares if profitable
	if (grossProfit <= 0) {
		return {
			grossProfit,
			propFirmShare: 0,
			traderShare: grossProfit, // Trader absorbs the loss
			estimatedTax: 0, // No tax on losses
			netProfit: grossProfit,
		}
	}

	const profitSharePercent = settings.isPropAccount
		? settings.profitSharePercentage
		: 100

	const traderShare = grossProfit * (profitSharePercent / 100)
	const propFirmShare = grossProfit - traderShare
	const estimatedTax = settings.showTaxEstimates
		? traderShare * (settings.dayTradeTaxRate / 100)
		: 0
	const netProfit = traderShare - estimatedTax

	return {
		grossProfit,
		propFirmShare,
		traderShare,
		estimatedTax,
		netProfit,
	}
}

export { calculatePropProfit }
