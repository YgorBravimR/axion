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

// listStrategyVersions result: lightweight summary of every version that
// exists for a strategy, sorted newest-first. The version chip dropdown
// renders one row per entry — full snapshot bodies aren't needed at chip
// time and would bloat the response, so we keep this thin.
export interface StrategyVersionSummary {
	id: string
	version: number
	tradeCount: number
	createdAt: Date
	label: string | null
}

// Lightweight strategy + versions row used by the dashboard cohort-split
// filter. Only what the chip-group UI needs (name + version numbers + trade
// counts) — full snapshots stay in StrategyVersionDetail / getStrategyVersion.
export interface StrategyFilterVersion {
	id: string
	version: number
	tradeCount: number
}

export interface StrategyFilterOption {
	id: string
	name: string
	currentVersion: number
	versions: StrategyFilterVersion[]
}

// Carry-over payload the fork dialog sends to createStrategyVersion. Mirrors
// the schema in src/lib/validations/strategy.ts (createStrategyVersionSchema)
// minus `conditions`, which the dialog supplies separately so its preview can
// render the count without re-validating the array.
export interface StrategyVersionSnapshot {
	name: string
	description?: string
	entryCriteria?: string
	exitCriteria?: string
	riskRules?: string
	finalR?: number
	maxRiskPercent?: number
	screenshotUrl?: string
	screenshotS3Key?: string
	notes?: string
}
