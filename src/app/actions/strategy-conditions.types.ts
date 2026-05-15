import type { StrategyCondition, TradingCondition } from "@/db/schema"

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
	isHawksStrategy: boolean
}
