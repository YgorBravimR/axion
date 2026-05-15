import type { Strategy, StrategyVersion } from "@/db/schema"

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

// getStrategyVersion result: the immutable version snapshot plus runtime info
// the UI needs — how many trades reference this version (tradeCount) and
// whether any trade is pinned to it (isLive — true means the version is
// immutable from a versioning-rules standpoint, false means an old empty
// version that could in principle be edited but UI usually treats as frozen).
export interface StrategyVersionDetail extends StrategyVersion {
	tradeCount: number
	isLive: boolean
}
