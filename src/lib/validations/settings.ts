import { z } from "zod"

export const userSettingsSchema = z.object({
	// Prop Trading Settings
	isPropAccount: z.boolean(),
	propFirmName: z.string().max(100).nullable().optional(),
	profitSharePercentage: z
		.number()
		.min(0, "validation.settings.profitShareMin")
		.max(100, "validation.settings.profitShareMax"),

	// Tax Settings
	dayTradeTaxRate: z
		.number()
		.min(0, "validation.settings.taxRateMin")
		.max(100, "validation.settings.taxRateMax"),
	swingTradeTaxRate: z
		.number()
		.min(0, "validation.settings.taxRateMin")
		.max(100, "validation.settings.taxRateMax"),
	taxExemptThreshold: z
		.number()
		.min(0, "validation.settings.thresholdMin")
		.optional(),

	// Display Preferences
	defaultCurrency: z.string().length(3, "validation.settings.currencyLength"),
	showTaxEstimates: z.boolean(),
	showPropCalculations: z.boolean(),

	// Multi-Account Preferences
	showAllAccounts: z.boolean(),
})

export type UserSettingsInput = z.infer<typeof userSettingsSchema>

// Partial schema for updates
export const updateUserSettingsSchema = userSettingsSchema.partial()

export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsSchema>
