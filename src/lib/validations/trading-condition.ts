import { z } from "zod"

const conditionCategories = [
	"indicator",
	"price_action",
	"market_context",
	"custom",
] as const

const conditionTiers = ["mandatory", "tier_2", "tier_3"] as const

const createConditionSchema = z.object({
	name: z
		.string()
		.min(1, "validation.tradingCondition.nameRequired")
		.max(100, "validation.tradingCondition.nameMax"),
	description: z
		.string()
		.max(500, "validation.tradingCondition.descriptionMax")
		.optional()
		.or(z.literal("")),
	category: z.enum(conditionCategories),
})

const updateConditionSchema = createConditionSchema.partial()

const strategyConditionInputSchema = z.object({
	conditionId: z
		.string()
		.uuid("validation.tradingCondition.invalidConditionId"),
	tier: z.enum(conditionTiers, {
		error: "validation.tradingCondition.invalidTier",
	}),
	sortOrder: z
		.number()
		.int("validation.tradingCondition.sortOrderInteger")
		.min(0, "validation.tradingCondition.sortOrderMin"),
})

const syncStrategyConditionsSchema = z.object({
	strategyId: z.string().uuid("validation.tradingCondition.invalidStrategyId"),
	conditions: z
		.array(strategyConditionInputSchema)
		.max(100, "validation.tradingCondition.tooManyConditions"),
})

type CreateConditionInput = z.infer<typeof createConditionSchema>
type UpdateConditionInput = z.infer<typeof updateConditionSchema>
type SyncStrategyConditionsInput = z.infer<typeof syncStrategyConditionsSchema>

export {
	conditionCategories,
	conditionTiers,
	createConditionSchema,
	updateConditionSchema,
	strategyConditionInputSchema,
	syncStrategyConditionsSchema,
	type CreateConditionInput,
	type UpdateConditionInput,
	type SyncStrategyConditionsInput,
}
