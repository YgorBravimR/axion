import type { StrategyCondition, TradingCondition } from "@/db/schema"

export interface StrategyConditionWithDetail extends StrategyCondition {
	condition: TradingCondition
}
