import { z } from "zod"

const createScenarioSchema = z.object({
	strategyId: z.string().uuid("validation.scenario.invalidStrategyId"),
	name: z
		.string()
		.min(1, "validation.scenario.nameRequired")
		.max(200, "validation.scenario.nameMax"),
	description: z
		.string()
		.max(2000, "validation.scenario.descriptionMax")
		.optional()
		.or(z.literal("")),
	sortOrder: z.coerce.number().int().min(0).default(0),
})

const updateScenarioSchema = createScenarioSchema.omit({ strategyId: true }).partial()

type CreateScenarioInput = z.infer<typeof createScenarioSchema>
type UpdateScenarioInput = z.infer<typeof updateScenarioSchema>

export {
	createScenarioSchema,
	updateScenarioSchema,
	type CreateScenarioInput,
	type UpdateScenarioInput,
}
