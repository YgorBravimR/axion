// ==========================================
// RISK MANAGEMENT PROFILE TYPES
// ==========================================

/**
 * Defines how risk is calculated for a single step in the loss recovery sequence.
 * Discriminated union on `type` for type-safe branching.
 */
type RiskCalculation =
	| { type: "percentOfBase"; percent: number }
	| { type: "sameAsPrevious" }
	| { type: "fixedCents"; amountCents: number }

/**
 * A single step in the loss recovery sequence (e.g., T2, T3, T4).
 */
interface LossRecoveryStep {
	riskCalculation: RiskCalculation
	maxContractsOverride: number | null
}

/**
 * Gain mode after a winning first trade.
 * - compounding: reinvest a % of accumulated gains into subsequent trades
 * - singleTarget: one winning trade hits the daily target, no further trades
 * - gainSequence: step-by-step risk sizing (mirrors loss recovery pattern)
 */
type GainMode =
	| {
			type: "compounding"
			reinvestmentPercent: number // 30 = risk 30% of accumulated gain
			stopOnFirstLoss: boolean
			dailyTargetCents: number | null
	  }
	| {
			type: "singleTarget"
			dailyTargetCents: number
	  }
	| {
			type: "gainSequence"
			sequence: LossRecoveryStep[] // reuses the same step shape
			repeatLastStep: boolean // keep using last step's risk for subsequent trades
			stopOnFirstLoss: boolean
			dailyTargetCents: number | null
	  }

// ==========================================
// DYNAMIC RISK SIZING TYPES (Phase 2)
// ==========================================

/** How the base risk per trade is calculated. */
type RiskSizingMode =
	| { type: "fixed" }
	| { type: "percentOfBalance"; riskPercent: number } // 0.1-10.0
	| { type: "fixedRatio"; deltaCents: number; baseContractRiskCents: number }
	| { type: "kellyFractional"; divisor: number } // 4 = quarter Kelly, 8 = eighth Kelly

/** How cascading limits are expressed. */
type LimitMode = "fixedCents" | "percentOfInitial" | "rMultiples"

/** Drawdown-tiered risk adjustment. */
interface DrawdownTier {
	drawdownPercent: number // trigger at X% DD from peak
	action: "reduceRisk" | "pause"
	reducePercent: number // reduce risk by X% (0 for pause)
}

/** Consecutive losing day rule. */
interface ConsecutiveLossRule {
	consecutiveDays: number
	action: "reduceRisk" | "stopDay" | "pauseWeek"
	reducePercent: number // reduce risk by X% (0 for stopDay/pauseWeek)
}

/**
 * Full decision tree configuration stored as JSON in the riskManagementProfiles table.
 *
 * This governs day-level behavior: what happens on T1 loss (recovery sequence),
 * what happens on T1 win (gain mode), and when to stop trading (cascading limits).
 *
 * All Phase 2 fields are optional for backward compatibility — existing JSON parses unchanged.
 *
 * @see docs/riskManagement/risk-management-flowchart.md
 */
interface DecisionTreeConfig {
	baseTrade: {
		riskCents: number
		maxContracts: number | null
		minStopPoints: number | null
	}
	lossRecovery: {
		sequence: LossRecoveryStep[]
		executeAllRegardless: boolean // run all recovery trades even if earlier ones win
		stopAfterSequence: boolean // stop trading for the day after sequence completes
	}
	gainMode: GainMode
	cascadingLimits: {
		weeklyLossCents: number | null
		weeklyAction: "stopTrading" | "reduceRisk"
		monthlyLossCents: number
		monthlyAction: "stopTrading" | "reduceRisk"
	}
	executionConstraints: {
		minStopPoints: number | null
		maxContracts: number | null
		operatingHoursStart: string | null // "09:01"
		operatingHoursEnd: string | null // "17:00"
	}
	// Dynamic risk sizing (optional — defaults to "fixed" mode)
	riskSizing?: RiskSizingMode
	limitMode?: LimitMode
	drawdownControl?: {
		tiers: DrawdownTier[]
		recoveryThresholdPercent: number // resume normal after recovering X% of DD
	}
	consecutiveLossRules?: ConsecutiveLossRule[]
	// Percent/R limit overrides (used when limitMode !== "fixedCents")
	limitsPercent?: { daily: number; weekly: number | null; monthly: number }
	limitsR?: { daily: number; weekly: number | null; monthly: number }
}

/**
 * A risk profile as returned from the DB, with the decision tree parsed from JSON.
 */
interface RiskManagementProfile {
	id: string
	name: string
	description: string | null
	createdByUserId: string
	isActive: boolean
	baseRiskCents: number
	dailyLossCents: number
	weeklyLossCents: number | null
	monthlyLossCents: number
	dailyProfitTargetCents: number | null
	decisionTree: DecisionTreeConfig
	createdAt: Date
	updatedAt: Date
}

/**
 * Input shape for creating/updating a risk profile.
 */
interface RiskProfileInput {
	name: string
	description?: string | null
	baseRiskCents: number
	dailyLossCents: number
	weeklyLossCents?: number | null
	monthlyLossCents: number
	dailyProfitTargetCents?: number | null
	decisionTree: DecisionTreeConfig
}

export type {
	RiskCalculation,
	LossRecoveryStep,
	GainMode,
	RiskSizingMode,
	LimitMode,
	DrawdownTier,
	ConsecutiveLossRule,
	DecisionTreeConfig,
	RiskManagementProfile,
	RiskProfileInput,
}
