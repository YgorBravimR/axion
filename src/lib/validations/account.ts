import { z } from "zod"

const accountTypeEnum = z.enum(["personal", "prop"])

export const createAccountSchema = z.object({
	name: z
		.string()
		.min(1, "validation.account.nameRequired")
		.max(100, "validation.account.nameMax"),
	description: z
		.string()
		.max(500, "validation.account.descriptionMax")
		.optional(),
	accountType: accountTypeEnum,
	propFirmName: z
		.string()
		.max(100, "validation.account.propFirmNameMax")
		.optional(),
	profitSharePercentage: z
		.number()
		.min(0, "validation.account.profitShareMin")
		.max(100, "validation.account.profitShareMax")
		.optional(),
	defaultCurrency: z
		.string()
		.min(3, "validation.account.currencyMin")
		.max(10, "validation.account.currencyMax")
		.optional(),
	defaultBreakevenTicks: z
		.number()
		.int("validation.account.breakevenTicksInteger")
		.min(0, "validation.account.breakevenTicksMin")
		.optional(),
	showTaxEstimates: z.boolean().optional(),
	showPropCalculations: z.boolean().optional(),
	defaultAssetId: z
		.string()
		.uuid("validation.account.invalidAssetId")
		.nullable()
		.optional(),
})

export const updateAccountSchema = createAccountSchema.partial()

export const deleteAccountSchema = z.object({
	accountId: z.string().uuid("validation.account.invalidAccountId"),
})

export const accountIdSchema = z
	.string()
	.uuid("validation.account.invalidAccountId")

export type CreateAccountInput = z.infer<typeof createAccountSchema>
export type UpdateAccountInput = z.infer<typeof updateAccountSchema>
