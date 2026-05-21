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

export interface ScenarioCount {
	scenarioId: string | null
	code: string | null
	name: string | null
	count: number
}

export interface StrategyHawksRollup {
	// Total trades in this strategy version that have Hawks metadata attached.
	// Zero means the strategy has never been traded under Hawks mode.
	totalHawksTrades: number
	// Per-axis "respected" counts. Rates are computed in the UI from count/total
	// so consumers can decide on tone thresholds (≥80% green / ≥50% warn / <50% red).
	vwapRespectedCount: number
	ajusteRespectedCount: number
	tripleScreenConfirmedCount: number
	// Bias-respected = trade.biasAtEntry matches the day's confirmed dailyHawksBias.bias.
	// Denominator is trades that have a daily bias row to compare against (not all do).
	biasRespectedCount: number
	biasRespectedDenom: number
	// B3 daily-cap is 6 day-trades per asset; we surface the in-cap vs over-cap split
	// so traders can spot cap-busting patterns. dailyTradeOrdinal is 1-indexed.
	withinDailyCapCount: number
	overDailyCapCount: number
	// Scenario distribution — sorted by count desc. scenarioId is nullable on the
	// metadata row (v0 ships single-scenario tagging only), so an "untagged" bucket
	// can appear with scenarioId = null.
	scenarioDistribution: ScenarioCount[]
}
