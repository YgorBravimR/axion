/**
 * Pure orchestration logic for determining strategy eligibility.
 * No I/O, no auth — accepts pre-loaded data as arguments.
 */

export interface StrategyWithTradeCount {
	id: string
	name: string
	description?: string | null
	isActive: boolean
	tradesCount: number
}

/**
 * Filter strategies to only those meeting minimum trade requirement.
 * @param strategies Pre-loaded strategies with trade counts
 * @param minTrades Minimum number of trades required (default: 10)
 * @returns Strategies that meet the threshold
 */
export function filterEligibleStrategies(
	strategies: StrategyWithTradeCount[],
	minTrades: number = 10
): StrategyWithTradeCount[] {
	return strategies.filter((s) => s.tradesCount >= minTrades)
}

/**
 * Mark which strategies are disabled due to insufficient trades.
 * @param strategies Pre-loaded strategies with trade counts
 * @param minTrades Minimum number of trades required (default: 10)
 * @returns Strategies with eligibility metadata
 */
export function annotateStrategyEligibility(
	strategies: StrategyWithTradeCount[],
	minTrades: number = 10
): Array<
	StrategyWithTradeCount & { disabled: boolean; disabledReason?: string }
> {
	return strategies.map((s) => ({
		...s,
		disabled: s.tradesCount < minTrades,
		disabledReason:
			s.tradesCount < minTrades
				? `Need at least ${minTrades} trades`
				: undefined,
	}))
}
