export type DataSource =
	| { type: "strategy"; strategyId: string }
	| { type: "all_strategies" }
	| { type: "universal" }

// V1: Edge Expectancy — simulates in R-multiples (strategy quality)
export interface SimulationParams {
	winRate: number              // 0-100
	rewardRiskRatio: number      // e.g. 2.0 means wins pay +2R
	numberOfTrades: number
	commissionImpactR: number    // commission as % of 1R (e.g. 2 = 2% of risk)
	simulationCount: number
}

export interface SourceStats {
	sourceType: DataSource["type"]
	sourceName: string
	totalTrades: number
	winRate: number
	avgRewardRiskRatio: number
	avgRiskPerTrade: number
	avgCommissionImpact: number
	dateRange: { from: Date | string; to: Date | string }
	profitFactor: number
	avgR: number
	// R-specific stats for Edge Expectancy
	avgWinR: number
	avgLossR: number
	commissionImpactR: number
	avgCommissionPerTradeCents?: number
	breakevenRate?: number
	strategiesCount?: number
	accountsCount?: number
	strategiesBreakdown?: Array<{
		name: string
		tradesCount: number
		winRate: number
	}>
}

export interface SimulatedTrade {
	tradeNumber: number
	isWin: boolean
	rResult: number              // +R:R or -1R (after commission)
	commission: number           // R units
	cumulativeR: number          // running total
	rDrawdown: number            // peak R - current R
}

export interface SimulationRun {
	runId: number
	trades: SimulatedTrade[]
	finalCumulativeR: number
	maxRDrawdown: number
	winCount: number
	lossCount: number
	maxWinStreak: number
	maxLossStreak: number
	peakR: number
}

export interface DistributionBucket {
	rangeStart: number
	rangeEnd: number
	count: number
	percentage: number
}

export interface SimulationStatistics {
	medianFinalR: number
	meanFinalR: number
	bestCaseFinalR: number
	worstCaseFinalR: number
	medianMaxRDrawdown: number
	meanMaxRDrawdown: number
	worstMaxRDrawdown: number
	profitablePct: number        // % of runs ending with positive R
	sharpeRatio: number          // mean R per trade / std dev
	sortinoRatio: number
	expectedRPerTrade: number    // the edge
	expectedMaxWinStreak: number
	expectedMaxLossStreak: number
	avgWinStreak: number
	avgLossStreak: number
	kellyFull: number
	kellyHalf: number
	kellyQuarter: number
	kellyRecommendation: string
	kellyLevel: "aggressive" | "balanced" | "conservative"
	profitFactor: number         // total winning R / total losing R
	avgRecoveryTrades: number
}

export interface MonteCarloResult {
	params: SimulationParams
	statistics: SimulationStatistics
	distributionBuckets: DistributionBucket[]
	sampleRun: SimulationRun
}

export interface StrategyComparisonResult {
	strategyId: string
	strategyName: string
	accountName?: string
	tradesCount: number
	winRate: number
	rewardRiskRatio: number
	medianFinalR: number
	profitablePct: number
	maxRDrawdown: number
	sharpeRatio: number
	rank: number
	result: MonteCarloResult
}

export type ComparisonSortField =
	| "rank"
	| "profitablePct"
	| "medianFinalR"
	| "maxRDrawdown"
	| "sharpeRatio"
	| "winRate"

export interface ComparisonRecommendation {
	topPerformers: string[]
	needsImprovement: string[]
	suggestedAllocations: Array<{
		strategyName: string
		allocationPct: number
		reason: string
	}>
}

export interface DataSourceOption {
	type: DataSource["type"]
	strategyId?: string
	label: string
	description?: string
	tradesCount: number
	disabled?: boolean
	disabledReason?: string
}

// ==========================================
// MONTE CARLO V2 — DAY-AWARE SIMULATION
// ==========================================

/**
 * Flat config derived from a risk profile for the V2 simulation engine.
 * Avoids deep nesting so the simulation loop stays readable.
 */
import type { DrawdownTier, ConsecutiveLossRule } from "@/types/risk-profile"

export interface RiskManagementProfileForSim {
	name: string
	baseRiskCents: number
	rewardRiskRatio: number
	winRate: number // 0-100 (of decisive trades, excluding breakevens)
	breakevenRate: number // 0-100 (percentage of ALL trades that are breakeven)
	dailyTargetCents: number | null
	dailyLossLimitCents: number
	lossRecoverySteps: Array<{
		riskCents: number // pre-computed absolute cents for this step
		riskMultiplier: number // relative to base (for dynamic modes: step / base)
	}>
	executeAllRegardless: boolean // run all recovery trades even if earlier ones win
	stopAfterSequence: boolean // stop trading for the day after recovery sequence completes
	compoundingRiskPercent: number // 0-100, 0 = no compounding (single-target mode)
	stopOnFirstLoss: boolean // in gain mode, stop compounding on first loss
	weeklyLossLimitCents: number | null
	monthlyLossLimitCents: number
	tradingDaysPerMonth: number // typically 22
	tradingDaysPerWeek: number // typically 5
	commissionPerTradeCents: number

	// Dynamic risk sizing (Phase 2)
	riskSizingMode: "fixed" | "percentOfBalance" | "fixedRatio" | "kellyFractional"
	riskPercent: number | null // for percentOfBalance mode
	fixedRatioDeltaCents: number | null // for fixedRatio mode
	fixedRatioBaseContractRiskCents: number | null // for fixedRatio mode
	kellyDivisor: number | null // for kellyFractional mode

	// Limit mode
	limitMode: "fixedCents" | "percentOfInitial" | "rMultiples"
	dailyLossPercent: number | null
	weeklyLossPercent: number | null
	monthlyLossPercent: number | null
	dailyLossR: number | null
	weeklyLossR: number | null
	monthlyLossR: number | null

	// Drawdown control
	drawdownTiers: DrawdownTier[]
	drawdownRecoveryPercent: number

	// Consecutive loss rules
	consecutiveLossRules: ConsecutiveLossRule[]
}

export interface SimulationParamsV2 {
	profile: RiskManagementProfileForSim
	simulationCount: number
	initialBalance: number // cents
	monthsToTrade: number // 1-48
	ruinThresholdPercent: number // 0-100, default 50 — account loss % that constitutes "ruin"
}

/** The mode a trade was executed under within a simulated day. */
export type TradeMode = "base" | "lossRecovery" | "gainCompounding"

export interface SimulatedTradeV2 {
	dayNumber: number
	tradeNumberInDay: number
	mode: TradeMode
	riskAmount: number // cents
	isWin: boolean
	isBreakeven: boolean
	pnl: number // cents (signed)
	commission: number // cents
	accumulatedDayPnl: number // running total for the day
	balanceAfter: number // cents
}

export interface SimulatedDay {
	dayNumber: number
	weekNumber: number
	mode: "lossRecovery" | "gainCompounding" | "mixed"
	trades: SimulatedTradeV2[]
	dayPnl: number // cents
	targetHit: boolean
	skipped: boolean
	skipReason:
		| "weeklyLimit"
		| "monthlyLimit"
		| "consecutiveLossDay"
		| "consecutiveLossWeek"
		| "drawdownPause"
		| null
}

export interface SimulationRunV2 {
	days: SimulatedDay[]
	totalPnl: number
	totalTrades: number
	totalTradingDays: number
	daysInLossRecovery: number
	daysInGainCompounding: number
	daysSkippedWeeklyLimit: number
	daysSkippedMonthlyLimit: number
	daysSkippedConsecutiveLossDay: number
	daysSkippedConsecutiveLossWeek: number
	daysSkippedDrawdownPause: number
	daysTargetHit: number
	timesWeeklyLimitHit: number
	monthlyLimitHit: boolean
	maxDrawdown: number
	maxDrawdownPercent: number
	finalBalance: number
	totalReturnPercent: number
	minBalance: number // lowest balance reached at any point (cents)
	reachedRuin: boolean // true if minBalance <= initialBalance * (1 - ruinThreshold/100)
}

export interface SimulationStatisticsV2 {
	medianMonthlyPnl: number
	meanMonthlyPnl: number
	bestCaseMonthlyPnl: number
	worstCaseMonthlyPnl: number
	medianReturnPercent: number
	profitableMonthsPct: number
	monthlyLimitHitPct: number
	avgTradingDaysPerMonth: number
	avgDaysInLossRecovery: number
	avgDaysInGainCompounding: number
	avgDaysTargetHit: number
	avgDaysSkippedWeeklyLimit: number
	avgDaysSkippedMonthlyLimit: number
	avgTradesPerMonth: number
	medianMaxDrawdownPercent: number
	worstMaxDrawdownPercent: number
	sharpeRatio: number
	sortinoRatio: number
	expectedDailyPnl: number
	riskOfRuinPercent: number // % of runs that reached ruin
	medianMinBalancePercent: number // median of (minBalance / initialBalance * 100)
}

export interface MonteCarloResultV2 {
	params: SimulationParamsV2
	statistics: SimulationStatisticsV2
	distributionBuckets: DistributionBucket[]
	sampleRun: SimulationRunV2
}
