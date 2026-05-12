import type { Strategy } from "@/db/schema"

export interface StrategyWithStats extends Strategy {
	tradeCount: number
	winCount: number
	lossCount: number
	compliance: number
	totalPnl: number
	winRate: number
	profitFactor: number
	avgR: number
	conditionCount: number
	scenarioCount: number
}

export interface ComplianceOverview {
	overallCompliance: number
	totalTrackedTrades: number
	followedPlanCount: number
	notFollowedCount: number
	strategiesCount: number
	topPerformingStrategy: { name: string; compliance: number } | null
	needsAttentionStrategy: { name: string; compliance: number } | null
}

interface StrategyTradeStats {
	tradeCount: number
	winCount: number
	lossCount: number
	compliance: number
	totalPnl: number
	winRate: number
	profitFactor: number
	avgR: number
}

export type { StrategyTradeStats }
