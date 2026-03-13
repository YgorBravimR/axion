import { z } from "zod"

export const assetTypeSchema = z.object({
	code: z
		.string()
		.min(2, "validation.asset.codeMin")
		.max(50, "validation.asset.codeMax")
		.regex(
			/^[A-Z_]+$/,
			"validation.asset.codeFormat"
		)
		.transform((val) => val.toUpperCase()),
	name: z
		.string()
		.min(2, "validation.asset.nameMin")
		.max(100, "validation.asset.nameMax"),
	description: z.string().optional().nullable(),
	isActive: z.boolean().default(true),
})

export const createAssetTypeSchema = assetTypeSchema

export const updateAssetTypeSchema = assetTypeSchema.partial()

export const assetSchema = z.object({
	symbol: z
		.string()
		.min(1, "validation.asset.symbolRequired")
		.max(20, "validation.asset.symbolMax")
		.regex(
			/^[A-Z0-9]+$/,
			"validation.asset.symbolFormat"
		)
		.transform((val) => val.toUpperCase()),
	name: z
		.string()
		.min(2, "validation.asset.nameMin")
		.max(100, "validation.asset.nameMax"),
	assetTypeId: z.string().uuid("validation.asset.invalidAssetTypeId"),
	tickSize: z
		.number()
		.positive("validation.asset.tickSizePositive")
		.or(z.string().transform((val) => parseFloat(val)))
		.refine((val) => val > 0, "validation.asset.tickSizePositive"),
	tickValue: z
		.number()
		.positive("validation.asset.tickValuePositive")
		.or(z.string().transform((val) => parseFloat(val)))
		.refine((val) => val > 0, "validation.asset.tickValuePositive"),
	currency: z
		.string()
		.min(3, "validation.asset.currencyMin")
		.max(10, "validation.asset.currencyMax")
		.default("BRL"),
	multiplier: z
		.number()
		.positive("validation.asset.multiplierPositive")
		.or(z.string().transform((val) => parseFloat(val)))
		.optional()
		.default(1),
	isActive: z.boolean().default(true),
})

export const createAssetSchema = assetSchema

export const updateAssetSchema = assetSchema.partial().extend({
	id: z.string().uuid("validation.asset.invalidAssetId"),
})

export type CreateAssetTypeInput = z.infer<typeof createAssetTypeSchema>
export type UpdateAssetTypeInput = z.infer<typeof updateAssetTypeSchema>
export type CreateAssetInput = z.infer<typeof createAssetSchema>
export type UpdateAssetInput = z.infer<typeof updateAssetSchema>
