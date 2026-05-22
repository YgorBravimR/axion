import type { TradeCondition } from "@/db/schema"

export type TradeConditionItem = {
	conditionId: string
	met: boolean
}

export type TradeConditionWithName = TradeCondition & {
	name: string
	category: string
}
