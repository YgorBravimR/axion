import type { DecisionTreeCents as DecisionTreeConfig } from "@/lib/risk-profiles/cents-shape"

// ==========================================
// TRADE STATUSES
// ==========================================

type SimulatedTradeStatus =
	| "executed"
	| "skipped_no_sl"
	| "skipped_daily_limit"
	| "skipped_daily_target"
	| "skipped_max_trades"
	| "skipped_consecutive_loss"
	| "skipped_monthly_limit"
	| "skipped_weekly_limit"
	| "skipped_recovery_complete"
	| "skipped_gain_stop"

// ==========================================
// ENGINE MODES
// ==========================================

type SimulationMode = "simple" | "advanced"

/** Simple mode — flat params typically derived from a monthly plan */
interface SimpleSimulationParams {
	mode: "simple"
	accountBalanceCents: number
	riskPerTradePercent: number
	dailyLossPercent: number
	dailyProfitTargetPercent: number | null
	maxDailyTrades: number | null
	maxConsecutiveLosses: number | null
	consecutiveLossScope: "global" | "daily"
	reduceRiskAfterLoss: boolean
	riskReductionFactor: number
	increaseRiskAfterWin: boolean
	profitReinvestmentPercent: number | null
	monthlyLossPercent: number | null
	weeklyLossPercent: number | null
}

/** Advanced mode — full decision tree from a risk management profile */
interface AdvancedSimulationParams {
	mode: "advanced"
	accountBalanceCents: number
	decisionTree: DecisionTreeConfig
	dailyLossCents: number
	dailyProfitTargetCents: number | null
	weeklyLossCents: number | null
	monthlyLossCents: number
}

type RiskSimulationParams = SimpleSimulationParams | AdvancedSimulationParams

// ==========================================
// TRADE INPUT (to engine)
// ==========================================

interface TradeForSimulation {
	id: string
	entryDate: Date
	exitDate: Date | null
	asset: string
	direction: "long" | "short"
	entryPrice: number
	exitPrice: number
	stopLoss: number | null
	positionSize: number
	pnlCents: number
	outcome: "win" | "loss" | "breakeven" | null
	rMultiple: number | null
	tickSize: number
	tickValue: number
	commissionPerExecution: number
	feesPerExecution: number
	contractsExecuted: number
}

// ==========================================
// SIMULATED TRADE OUTPUT
// ==========================================

type DayPhase = "base" | "loss_recovery" | "gain_mode" | "normal"

interface SimulatedTrade {
	tradeId: string
	dayKey: string
	dayTradeNumber: number
	status: SimulatedTradeStatus
	asset: string
	direction: "long" | "short"
	entryPrice: number
	exitPrice: number
	stopLoss: number | null

	// Original values
	originalPositionSize: number
	originalPnlCents: number
	originalRMultiple: number | null

	// Simulated values (null when skipped)
	simulatedPositionSize: number | null
	simulatedPnlCents: number | null
	simulatedRMultiple: number | null
	riskAmountCents: number | null

	// Decision trace context
	dayPhase: DayPhase
	riskReason: string
	recoveryStepIndex: number | null

	// Running state at this point
	equityAfterCents: number
	dailyPnlCents: number
	consecutiveLosses: number
	drawdownPercent: number
}

// ==========================================
// DAY / WEEK TRACE (for decision trace modal)
// ==========================================

interface DayTraceResult {
	totalPnlCents: number
	executedCount: number
	skippedCount: number
	hitDailyLimit: boolean
	hitDailyTarget: boolean
	finalPhase: DayPhase
}

interface DayTrace {
	dayKey: string
	weekKey: string
	trades: SimulatedTrade[]
	dayResult: DayTraceResult
}

interface WeekTrace {
	weekKey: string
	weekLabel: string
	days: DayTrace[]
	weekPnlCents: number
}

// ==========================================
// EQUITY CURVE
// ==========================================

interface EquityCurvePoint {
	tradeIndex: number
	dayKey: string
	originalEquityCents: number
	simulatedEquityCents: number
}

// ==========================================
// SIMULATION SUMMARY
// ==========================================

interface SimulationSummary {
	totalTrades: number
	executedTrades: number
	skippedNoSl: number
	skippedDailyLimit: number
	skippedDailyTarget: number
	skippedMaxTrades: number
	skippedConsecutiveLoss: number
	skippedMonthlyLimit: number
	skippedWeeklyLimit: number

	// Original
	originalTotalPnlCents: number
	originalWinRate: number
	originalProfitFactor: number
	originalMaxDrawdownPercent: number
	originalAvgR: number

	// Simulated
	simulatedTotalPnlCents: number
	simulatedWinRate: number
	simulatedProfitFactor: number
	simulatedMaxDrawdownPercent: number
	simulatedAvgR: number

	// Comparison
	pnlDeltaCents: number
	daysHitDailyLimit: number
	daysHitDailyTarget: number
}

// ==========================================
// SIMULATION RESULT
// ==========================================

interface RiskSimulationResult {
	params: RiskSimulationParams
	summary: SimulationSummary
	trades: SimulatedTrade[]
	equityCurve: EquityCurvePoint[]
	weeks: WeekTrace[]
	dateRange: { from: string; to: string }
}

// ==========================================
// PREVIEW (before running simulation)
// ==========================================

interface SimulationPreview {
	totalTrades: number
	tradesWithSl: number
	tradesWithoutSl: number
	assets: string[]
	dayCount: number
}

// ==========================================
// PREFILL SOURCE (UI state)
// ==========================================

type PrefillSource = "monthlyPlan" | "riskProfile" | "manual"

export type {
	PrefillSource,
	SimulatedTradeStatus,
	SimulationMode,
	SimpleSimulationParams,
	AdvancedSimulationParams,
	RiskSimulationParams,
	TradeForSimulation,
	DayPhase,
	SimulatedTrade,
	DayTraceResult,
	DayTrace,
	WeekTrace,
	EquityCurvePoint,
	SimulationSummary,
	RiskSimulationResult,
	SimulationPreview,
}
