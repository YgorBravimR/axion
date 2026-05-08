// ==========================================
// RISK MANAGEMENT PROFILE TYPES
// ==========================================
//
// Phase 4b: cents → R rebase. All risk magnitudes inside the decision tree are
// expressed in R-multiples (1R = base risk per trade as derived from the active
// fractal-plan ladder tier). Top-level cents columns on the
// `risk_management_profiles` table were dropped in the same phase — caps now
// live on `yearly_plans.defaultDailyLossR / defaultMonthlyLossR / …` and
// resolve via `resolveDay` / `resolveMonth`.

/**
 * Defines how risk is calculated for a single step in the loss recovery sequence.
 * Discriminated union on `type` for type-safe branching.
 */
type RiskCalculation =
	| { type: "percentOfBase"; percent: number }
	| { type: "sameAsPrevious" }
	| { type: "fixedR"; amountR: number }

/**
 * A single step in the loss recovery sequence (e.g., T2, T3, T4).
 */
interface LossRecoveryStep {
	riskCalculation: RiskCalculation
	/** @deprecated Single-asset relic. Multi-asset model expresses caps in R via `riskCalculation.amountR`. Kept until live circuit-breaker + Monte Carlo migrate to `maxRiskR`. */
	maxContractsOverride: number | null
	/** Money-based replacement for `maxContractsOverride`. Cap on this step in R-multiples. */
	maxRiskR?: number | null
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
			dailyTargetR: number | null
	  }
	| {
			type: "singleTarget"
			dailyTargetR: number
	  }
	| {
			type: "gainSequence"
			sequence: LossRecoveryStep[] // reuses the same step shape
			repeatLastStep: boolean // keep using last step's risk for subsequent trades
			stopOnFirstLoss: boolean
			dailyTargetR: number | null
	  }

// ==========================================
// DYNAMIC RISK SIZING TYPES (Phase 2)
// ==========================================

/** How the base risk per trade is calculated. */
type RiskSizingMode =
	| { type: "fixed" }
	| { type: "percentOfBalance"; riskPercent: number } // 0.1-10.0
	/** @deprecated Single-asset Larry-Williams ratio. Misaligned with multi-asset R=money model. Kept while Monte Carlo simulator references it. */
	| { type: "fixedRatio"; deltaR: number; baseContractRiskR: number }
	| { type: "kellyFractional"; divisor: number } // 4 = quarter Kelly, 8 = eighth Kelly

/** How cascading limits are expressed. */
type LimitMode = "rMultiples" | "percentOfInitial"

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
 * Governs day-level behavior: T1 loss recovery, T1 win gain mode, cascading
 * cap-hit actions. All magnitudes in R-multiples.
 *
 * @see docs/riskManagement/risk-management-flowchart.md
 */
interface DecisionTreeConfig {
	baseTrade: {
		riskR: number
		/** @deprecated Single-asset cap. Multi-asset model uses `maxRiskR` (R-multiple cap) and lets asset/tick conversion happen at trade entry. Live circuit-breaker still consumes this; remove once migrated. */
		maxContracts: number | null
		/** @deprecated Single-asset stop in points. Multi-asset trade entry computes contracts from `R / (stopTicks × tickValue)`. */
		minStopPoints: number | null
		/** Money-based cap on a single base trade. Optional companion to `riskR`. */
		maxRiskR?: number | null
	}
	lossRecovery: {
		sequence: LossRecoveryStep[]
		executeAllRegardless: boolean // run all recovery trades even if earlier ones win
		stopAfterSequence: boolean // stop trading for the day after sequence completes
	}
	gainMode: GainMode
	cascadingLimits: {
		weeklyLossR: number | null
		weeklyAction: "stopTrading" | "reduceRisk"
		monthlyLossR: number
		monthlyAction: "stopTrading" | "reduceRisk"
	}
	executionConstraints: {
		/** @deprecated Single-asset stop floor in points. */
		minStopPoints: number | null
		/** @deprecated Single-asset position cap. Use `maxRiskR` for the money-based equivalent. */
		maxContracts: number | null
		/** Money-based execution cap in R-multiples (replaces `maxContracts`). */
		maxRiskR?: number | null
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
	// Percent/R limit overrides (used when limitMode !== "rMultiples")
	limitsPercent?: { daily: number; weekly: number | null; monthly: number }
	limitsR?: { daily: number; weekly: number | null; monthly: number }
}

/**
 * A risk profile as returned from the DB, with the decision tree parsed from JSON.
 * Phase 4b: top-level cents fields removed; caps now resolve through the
 * fractal cascade per-account/date.
 */
interface RiskManagementProfile {
	id: string
	name: string
	description: string | null
	createdByUserId: string
	isActive: boolean
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
