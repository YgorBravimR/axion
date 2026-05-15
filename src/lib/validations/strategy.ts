import { z } from "zod"

const conditionTiers = ["mandatory", "tier_2", "tier_3"] as const

const strategyConditionSchema = z.object({
	conditionId: z.string().uuid(),
	tier: z.enum(conditionTiers),
	sortOrder: z.coerce.number().int().min(0).default(0),
})

export const createStrategySchema = z.object({
	code: z
		.string()
		.min(3, "validation.strategy.codeMin")
		.max(10, "validation.strategy.codeMax")
		.transform((val) => val.toUpperCase())
		.refine((val) => /^[A-Z0-9]+$/.test(val), "validation.strategy.codeFormat"),
	name: z
		.string()
		.min(1, "validation.strategy.nameRequired")
		.max(100, "validation.strategy.nameMax"),
	description: z
		.string()
		.max(2000, "validation.strategy.descriptionMax")
		.optional(),
	entryCriteria: z
		.string()
		.max(5000, "validation.strategy.entryCriteriaMax")
		.optional(),
	exitCriteria: z
		.string()
		.max(5000, "validation.strategy.exitCriteriaMax")
		.optional(),
	riskRules: z
		.string()
		.max(5000, "validation.strategy.riskRulesMax")
		.optional(),
	finalR: z.coerce
		.number()
		.positive("validation.strategy.targetRPositive")
		.max(100, "validation.strategy.targetRMax")
		.optional(),
	maxRiskPercent: z.coerce
		.number()
		.positive("validation.strategy.maxRiskPositive")
		.max(100, "validation.strategy.maxRiskMax")
		.optional(),
	screenshotUrl: z
		.string()
		.url("validation.strategy.invalidUrl")
		.max(500)
		.optional()
		.or(z.literal("")),
	notes: z.string().max(5000, "validation.strategy.notesMax").optional(),
	isActive: z.boolean().default(true),
	screenshotS3Key: z.string().max(500).optional().or(z.literal("")),
	conditions: z.array(strategyConditionSchema).optional(),
})

export const updateStrategySchema = createStrategySchema.partial()

// Versioning input: omits `code` (strategy code stays stable across versions)
// and `isActive` (a fork doesn't toggle activation — caller mutates that
// independently via updateStrategy). Conditions become required so callers
// commit to an explicit per-version checklist.
export const createStrategyVersionSchema = createStrategySchema.omit({
	code: true,
	isActive: true,
})

export type CreateStrategyInput = z.infer<typeof createStrategySchema>
export type UpdateStrategyInput = z.infer<typeof updateStrategySchema>
export type CreateStrategyVersionInput = z.infer<
	typeof createStrategyVersionSchema
>
