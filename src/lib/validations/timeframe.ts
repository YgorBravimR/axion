import { z } from "zod"

export const timeframeTypeValues = ["time_based", "renko"] as const
export const timeframeUnitValues = [
	"minutes",
	"hours",
	"days",
	"weeks",
	"ticks",
	"points",
] as const

export const timeframeTypeSchema = z.enum(timeframeTypeValues)
export const timeframeUnitSchema = z.enum(timeframeUnitValues)

export const timeframeSchema = z.object({
	code: z
		.string()
		.min(1, "validation.timeframe.codeRequired")
		.max(20, "validation.timeframe.codeMax")
		.regex(
			/^[A-Z0-9_]+$/,
			"validation.timeframe.codeFormat"
		)
		.transform((val) => val.toUpperCase()),
	name: z
		.string()
		.min(2, "validation.timeframe.nameMin")
		.max(50, "validation.timeframe.nameMax"),
	type: timeframeTypeSchema,
	value: z.coerce
		.number({ message: "validation.timeframe.valueRequired" })
		.int("validation.timeframe.valueInteger")
		.positive("validation.timeframe.valuePositive"),
	unit: timeframeUnitSchema,
	sortOrder: z.coerce
		.number()
		.int("validation.timeframe.sortOrderInteger")
		.min(0, "validation.timeframe.sortOrderMin")
		.optional()
		.default(0),
	isActive: z.boolean().default(true),
})

export const createTimeframeSchema = timeframeSchema

export const updateTimeframeSchema = timeframeSchema.partial().extend({
	id: z.string().uuid("validation.timeframe.invalidTimeframeId"),
})

export type TimeframeType = (typeof timeframeTypeValues)[number]
export type TimeframeUnit = (typeof timeframeUnitValues)[number]
export type CreateTimeframeInput = z.infer<typeof createTimeframeSchema>
export type UpdateTimeframeInput = z.infer<typeof updateTimeframeSchema>
