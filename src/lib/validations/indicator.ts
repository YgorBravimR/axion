import { z } from "zod"

const indicatorGroupSchema = z.object({
	key: z
		.string()
		.min(1, "validation.indicator.keyRequired")
		.max(50, "validation.indicator.keyMax")
		.regex(
			/^[a-z0-9_]+$/,
			"validation.indicator.keyFormat"
		),
	displayName: z
		.string()
		.min(1, "validation.indicator.displayNameRequired")
		.max(100, "validation.indicator.displayNameMax"),
	description: z.string().max(500).optional().nullable(),
})

const createIndicatorGroupSchema = indicatorGroupSchema

const updateIndicatorGroupSchema = indicatorGroupSchema.partial()

const indicatorDefinitionSchema = z.object({
	key: z
		.string()
		.min(1, "validation.indicator.keyRequired")
		.max(50, "validation.indicator.keyMax")
		.regex(
			/^[a-z0-9_]+$/,
			"validation.indicator.keyFormat"
		),
	displayName: z
		.string()
		.min(1, "validation.indicator.displayNameRequired")
		.max(100, "validation.indicator.displayNameMax"),
	groupId: z.string().uuid("validation.indicator.invalidGroupId"),
	csvHeader: z.string().max(100, "validation.indicator.csvHeaderMax").optional().nullable(),
	sortOrder: z.number().int().optional(),
})

const createIndicatorDefinitionSchema = indicatorDefinitionSchema

const updateIndicatorDefinitionSchema = indicatorDefinitionSchema.partial()

type CreateIndicatorGroupInput = z.infer<typeof createIndicatorGroupSchema>
type UpdateIndicatorGroupInput = z.infer<typeof updateIndicatorGroupSchema>
type CreateIndicatorDefinitionInput = z.infer<typeof createIndicatorDefinitionSchema>
type UpdateIndicatorDefinitionInput = z.infer<typeof updateIndicatorDefinitionSchema>

export {
	createIndicatorGroupSchema,
	updateIndicatorGroupSchema,
	createIndicatorDefinitionSchema,
	updateIndicatorDefinitionSchema,
}

export type {
	CreateIndicatorGroupInput,
	UpdateIndicatorGroupInput,
	CreateIndicatorDefinitionInput,
	UpdateIndicatorDefinitionInput,
}
