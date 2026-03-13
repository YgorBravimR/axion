import { z } from "zod"

const conditionCategories = ["indicator", "price_action", "market_context", "custom"] as const

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

type CreateConditionInput = z.infer<typeof createConditionSchema>
type UpdateConditionInput = z.infer<typeof updateConditionSchema>

export {
	conditionCategories,
	createConditionSchema,
	updateConditionSchema,
	type CreateConditionInput,
	type UpdateConditionInput,
}
