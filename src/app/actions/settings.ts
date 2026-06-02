"use server"

import { db } from "@/db/drizzle"
import {
	settings,
	userSettings,
	tradingAccounts,
	users,
	type UserSettings,
} from "@/db/schema"
import { eq } from "drizzle-orm"
import { invalidateSettingsData } from "@/lib/cache/invalidate"
import type { ActionResponse } from "@/types"
import {
	userSettingsSchema,
	type UpdateUserSettingsInput,
} from "@/lib/validations/settings"
import { requireAuth } from "@/app/actions/auth"
import { getTranslations } from "next-intl/server"
import type { RiskSettings, UserSettingsData } from "./settings.types"

const DEFAULT_USER_SETTINGS: UserSettingsData = {
	isPropAccount: false,
	propFirmName: null,
	profitSharePercentage: 100,
	taxExemptThreshold: 0,
	defaultCurrency: "BRL",
	showTaxEstimates: true,
	showPropCalculations: true,
	showAllAccounts: false,
}

const toUserSettingsData = (row: UserSettings): UserSettingsData => ({
	isPropAccount: row.isPropAccount,
	propFirmName: row.propFirmName,
	profitSharePercentage: Number(row.profitSharePercentage),
	taxExemptThreshold: row.taxExemptThreshold,
	defaultCurrency: row.defaultCurrency,
	showTaxEstimates: row.showTaxEstimates,
	showPropCalculations: row.showPropCalculations,
	showAllAccounts: row.showAllAccounts,
})

// Get user settings (creates default if not exists)
export const getUserSettings = async (): Promise<
	ActionResponse<UserSettingsData>
> => {
	const t = await getTranslations("settings")
	try {
		const { userId } = await requireAuth()

		const existingSettings = await db.query.userSettings.findFirst({
			where: eq(userSettings.userId, userId),
		})

		if (existingSettings) {
			return {
				status: "success",
				message: t("actions.settingsRetrieved"),
				data: toUserSettingsData(existingSettings),
			}
		}

		// Create default settings if not exists
		const [newSettings] = await db
			.insert(userSettings)
			.values({
				userId: userId,
				isPropAccount: DEFAULT_USER_SETTINGS.isPropAccount,
				propFirmName: DEFAULT_USER_SETTINGS.propFirmName,
				profitSharePercentage: String(
					DEFAULT_USER_SETTINGS.profitSharePercentage
				),
				taxExemptThreshold: DEFAULT_USER_SETTINGS.taxExemptThreshold,
				defaultCurrency: DEFAULT_USER_SETTINGS.defaultCurrency,
				showTaxEstimates: DEFAULT_USER_SETTINGS.showTaxEstimates,
				showPropCalculations: DEFAULT_USER_SETTINGS.showPropCalculations,
				showAllAccounts: DEFAULT_USER_SETTINGS.showAllAccounts,
			})
			.returning()

		if (!newSettings) {
			throw new Error("Failed to insert user settings")
		}

		return {
			status: "success",
			message: t("actions.settingsCreated"),
			data: toUserSettingsData(newSettings),
		}
	} catch (error) {
		console.error("Failed to get user settings:", error)
		return {
			status: "error",
			message: t("actions.settingsFetchFailed"),
		}
	}
}

// Update user settings
export const updateUserSettings = async (
	data: UpdateUserSettingsInput
): Promise<ActionResponse<UserSettingsData>> => {
	const t = await getTranslations("settings")
	try {
		const { userId } = await requireAuth()

		// Validate input
		const validationResult = userSettingsSchema.partial().safeParse(data)
		if (!validationResult.success) {
			return {
				status: "error",
				message:
					validationResult.error.issues[0]?.message ||
					t("actions.validationError"),
			}
		}

		const now = new Date()

		// Ensure settings exist
		const existing = await db.query.userSettings.findFirst({
			where: eq(userSettings.userId, userId),
		})

		if (!existing) {
			// Create with provided data merged with defaults
			const [newSettings] = await db
				.insert(userSettings)
				.values({
					userId: userId,
					isPropAccount:
						data.isPropAccount ?? DEFAULT_USER_SETTINGS.isPropAccount,
					propFirmName: data.propFirmName ?? DEFAULT_USER_SETTINGS.propFirmName,
					profitSharePercentage: String(
						data.profitSharePercentage ??
							DEFAULT_USER_SETTINGS.profitSharePercentage
					),
					taxExemptThreshold:
						data.taxExemptThreshold ?? DEFAULT_USER_SETTINGS.taxExemptThreshold,
					defaultCurrency:
						data.defaultCurrency ?? DEFAULT_USER_SETTINGS.defaultCurrency,
					showTaxEstimates:
						data.showTaxEstimates ?? DEFAULT_USER_SETTINGS.showTaxEstimates,
					showPropCalculations:
						data.showPropCalculations ??
						DEFAULT_USER_SETTINGS.showPropCalculations,
					showAllAccounts:
						data.showAllAccounts ?? DEFAULT_USER_SETTINGS.showAllAccounts,
					updatedAt: now,
				})
				.returning()

			if (!newSettings) {
				throw new Error("Failed to insert user settings")
			}

			invalidateSettingsData()

			return {
				status: "success",
				message: t("actions.settingsCreated"),
				data: toUserSettingsData(newSettings),
			}
		}

		// Build update object only with provided fields
		const updateData: Record<string, unknown> = { updatedAt: now }

		if (data.isPropAccount !== undefined) {
			updateData.isPropAccount = data.isPropAccount
		}
		if (data.propFirmName !== undefined) {
			updateData.propFirmName = data.propFirmName
		}
		if (data.profitSharePercentage !== undefined) {
			updateData.profitSharePercentage = String(data.profitSharePercentage)
		}
		if (data.taxExemptThreshold !== undefined) {
			updateData.taxExemptThreshold = data.taxExemptThreshold
		}
		if (data.defaultCurrency !== undefined) {
			updateData.defaultCurrency = data.defaultCurrency
		}
		if (data.showTaxEstimates !== undefined) {
			updateData.showTaxEstimates = data.showTaxEstimates
		}
		if (data.showPropCalculations !== undefined) {
			updateData.showPropCalculations = data.showPropCalculations
		}
		if (data.showAllAccounts !== undefined) {
			updateData.showAllAccounts = data.showAllAccounts
		}

		const [updated] = await db
			.update(userSettings)
			.set(updateData)
			.where(eq(userSettings.userId, userId))
			.returning()

		if (!updated) {
			throw new Error("Failed to update user settings")
		}

		invalidateSettingsData()

		return {
			status: "success",
			message: t("actions.settingsUpdated"),
			data: toUserSettingsData(updated),
		}
	} catch (error) {
		console.error("Failed to update user settings:", error)
		return {
			status: "error",
			message: t("actions.settingsUpdateFailed"),
		}
	}
}

export const getRiskSettings = async (): Promise<
	ActionResponse<RiskSettings>
> => {
	const t = await getTranslations("settings")
	try {
		await requireAuth()

		const balanceSetting = await db.query.settings.findFirst({
			where: eq(settings.key, "account_balance"),
		})

		return {
			status: "success",
			message: t("actions.settingsRetrieved"),
			data: {
				accountBalance: balanceSetting ? Number(balanceSetting.value) : 10000,
			},
		}
	} catch (error) {
		console.error("Failed to get risk settings:", error)
		return {
			status: "error",
			message: t("actions.settingsFetchFailed"),
		}
	}
}

export const updateRiskSettings = async (
	data: RiskSettings
): Promise<ActionResponse<RiskSettings>> => {
	const t = await getTranslations("settings")
	try {
		await requireAuth()
		const now = new Date()

		const existingBalance = await db.query.settings.findFirst({
			where: eq(settings.key, "account_balance"),
		})

		if (existingBalance) {
			await db
				.update(settings)
				.set({ value: String(data.accountBalance), updatedAt: now })
				.where(eq(settings.key, "account_balance"))
		} else {
			await db.insert(settings).values({
				key: "account_balance",
				value: String(data.accountBalance),
				description: "Initial/current trading capital",
				updatedAt: now,
			})
		}

		return {
			status: "success",
			message: t("actions.settingsUpdated"),
			data,
		}
	} catch (error) {
		console.error("Failed to update risk settings:", error)
		return {
			status: "error",
			message: t("actions.settingsUpdateFailed"),
		}
	}
}

/**
 * Get the user's persisted theme preference from the database.
 */
export const getUserTheme = async (): Promise<ActionResponse<string>> => {
	const t = await getTranslations("settings")
	try {
		const { userId } = await requireAuth()

		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { theme: true },
		})

		return {
			status: "success",
			message: t("actions.themeRetrieved"),
			data: user?.theme ?? "dark",
		}
	} catch (error) {
		console.error("Failed to get user theme:", error)
		return {
			status: "error",
			message: t("actions.themeFetchFailed"),
		}
	}
}

/**
 * Persist the user's theme preference to the database.
 */
export const updateTheme = async (
	theme: string
): Promise<ActionResponse<string>> => {
	const t = await getTranslations("settings")
	try {
		const { userId } = await requireAuth()

		const validThemes = ["dark", "light"]
		if (!validThemes.includes(theme)) {
			return {
				status: "error",
				message: t("errors.invalidTheme"),
				errors: [
					{
						code: "INVALID_THEME",
						detail: `Theme must be one of: ${validThemes.join(", ")}`,
					},
				],
			}
		}

		await db
			.update(users)
			.set({ theme, updatedAt: new Date() })
			.where(eq(users.id, userId))

		return {
			status: "success",
			message: t("actions.themeUpdated"),
			data: theme,
		}
	} catch (error) {
		console.error("Failed to update theme:", error)
		return {
			status: "error",
			message: t("actions.themeUpdateFailed"),
		}
	}
}

export const getAccountLifecycle = async (): Promise<{
	status: "success" | "error"
	message?: string
	data?: {
		accountStartMonth: number | null
		accountStartYear: number | null
		startingBalanceCents: number | null
		withdrawalTargetPercent: number | null
	}
}> => {
	const { accountId } = await requireAuth()

	const account = await db.query.tradingAccounts.findFirst({
		where: eq(tradingAccounts.id, accountId),
		columns: {
			accountStartMonth: true,
			accountStartYear: true,
			startingBalanceCents: true,
			withdrawalTargetPercent: true,
		},
	})

	if (!account) {
		const t = await getTranslations("settings.errors")
		return { status: "error", message: t("accountNotFound") }
	}

	return {
		status: "success",
		data: {
			accountStartMonth: account.accountStartMonth ?? null,
			accountStartYear: account.accountStartYear ?? null,
			startingBalanceCents: account.startingBalanceCents ?? null,
			withdrawalTargetPercent: account.withdrawalTargetPercent
				? parseFloat(account.withdrawalTargetPercent.toString())
				: null,
		},
	}
}

export const updateAccountLifecycle = async (params: {
	accountStartMonth: number | null
	accountStartYear: number | null
	startingBalanceCents: number | null
	withdrawalTargetPercent: number | null
}): Promise<{ status: "success" | "error"; message?: string }> => {
	const { accountId } = await requireAuth()
	const t = await getTranslations("settings.errors")

	const {
		accountStartMonth,
		accountStartYear,
		startingBalanceCents,
		withdrawalTargetPercent,
	} = params

	if (
		accountStartMonth !== null &&
		(accountStartMonth < 1 || accountStartMonth > 12)
	) {
		return { status: "error", message: t("startMonthRange") }
	}
	const currentYear = new Date().getFullYear()
	if (
		accountStartYear !== null &&
		(accountStartYear < 2000 || accountStartYear > currentYear)
	) {
		return {
			status: "error",
			message: t("startYearRange", { year: currentYear }),
		}
	}
	if (startingBalanceCents !== null && startingBalanceCents <= 0) {
		return {
			status: "error",
			message: t("openingBalancePositive"),
		}
	}
	if (
		withdrawalTargetPercent !== null &&
		(withdrawalTargetPercent < 0 || withdrawalTargetPercent > 100)
	) {
		return {
			status: "error",
			message: t("withdrawalTargetRange"),
		}
	}

	await db
		.update(tradingAccounts)
		.set({
			accountStartMonth: accountStartMonth ?? null,
			accountStartYear: accountStartYear ?? null,
			startingBalanceCents: startingBalanceCents ?? null,
			withdrawalTargetPercent:
				withdrawalTargetPercent !== null
					? String(withdrawalTargetPercent)
					: null,
		})
		.where(eq(tradingAccounts.id, accountId))

	return { status: "success" }
}

import { BRANDS as VALID_BRANDS, type Brand as BrandValue } from "@/lib/brands"

/**
 * Get the current account's brand (color scheme) from the database.
 */
export const getAccountBrand = async (): Promise<ActionResponse<string>> => {
	const t = await getTranslations("settings")
	try {
		const { accountId } = await requireAuth()

		const account = await db.query.tradingAccounts.findFirst({
			where: eq(tradingAccounts.id, accountId),
			columns: { brand: true },
		})

		return {
			status: "success",
			message: t("actions.brandRetrieved"),
			data: account?.brand ?? "bravo",
		}
	} catch (error) {
		console.error("Failed to get account brand:", error)
		return {
			status: "error",
			message: t("actions.brandFetchFailed"),
		}
	}
}

/**
 * Persist the account's brand (color scheme) to the database.
 */
export const updateAccountBrand = async (
	brand: string
): Promise<ActionResponse<string>> => {
	const t = await getTranslations("settings")
	try {
		const { accountId } = await requireAuth()

		if (!VALID_BRANDS.includes(brand as BrandValue)) {
			return {
				status: "error",
				message: t("errors.invalidBrand"),
				errors: [
					{
						code: "INVALID_BRAND",
						detail: `Brand must be one of: ${VALID_BRANDS.join(", ")}`,
					},
				],
			}
		}

		await db
			.update(tradingAccounts)
			.set({ brand, updatedAt: new Date() })
			.where(eq(tradingAccounts.id, accountId))

		invalidateSettingsData()

		return {
			status: "success",
			message: t("actions.brandUpdated"),
			data: brand,
		}
	} catch (error) {
		console.error("Failed to update account brand:", error)
		return {
			status: "error",
			message: t("actions.brandUpdateFailed"),
		}
	}
}
