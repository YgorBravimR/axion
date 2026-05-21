import type {
	StrategyCondition,
	StrategyMethodology,
	TradingCondition,
} from "@/db/schema"

export interface StrategyConditionWithDetail extends StrategyCondition {
	condition: TradingCondition
}

export interface ConditionRollup {
	conditionId: string
	conditionName: string
	category: TradingCondition["category"]
	tier: StrategyCondition["tier"]
	sortOrder: number
	totalRecorded: number
	metCount: number
	metRate: number
}

export interface StrategyConditionsRollup {
	totalTrades: number
	conditions: ConditionRollup[]
	// Intrinsic methodology persisted on the strategy. NULL = unstructured.
	// Drives per-methodology UI dispatch (Hawks panel, KPI grid extensions, etc.).
	methodology: StrategyMethodology | null
	// Derived "is this strategy currently traded by any Hawks-mode account?" —
	// retained for back-compat with code paths gated on the *runtime* answer.
	// New code should prefer `methodology === "hawks"` for the intrinsic check.
	isHawksStrategy: boolean
}
