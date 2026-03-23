"use server"

import { db } from "@/db/drizzle"
import { settings, userSettings, tradingAccounts, users, type UserSettings } from "@/db/schema"
import { eq } from "drizzle-orm"
import { invalidateSettingsData } from "@/lib/cache/invalidate"
import type { ActionResponse } from "@/types"
import {
	userSettingsSchema,
	type UpdateUserSettingsInput,
} from "@/lib/validations/settings"
import { requireAuth } from "@/app/actions/auth"
import { getTranslations } from "next-intl/server"

export interface RiskSettings {
	defaultRiskPercent: number
	accountBalance: number
}

// User Settings Types
export interface UserSettingsData {
	isPropAccount: boolean
	propFirmName: string | null
	profitSharePercentage: number
	dayTradeTaxRate: number
	swingTradeTaxRate: number
	taxExemptThreshold: number
	defaultCurrency: string
	showTaxEstimates: boolean
	showPropCalculations: boolean
	showAllAccounts: boolean
}

// Default settings for new users
const DEFAULT_USER_SETTINGS: UserSettingsData = {
	isPropAccount: false,
	propFirmName: null,
	profitSharePercentage: 100,
	dayTradeTaxRate: 20,
	swingTradeTaxRate: 15,
	taxExemptThreshold: 0,
	defaultCurrency: "BRL",
	showTaxEstimates: true,
	showPropCalculations: true,
	showAllAccounts: false,
}

// Convert database row to UserSettingsData
const toUserSettingsData = (row: UserSettings): UserSettingsData => ({
	isPropAccount: row.isPropAccount,
	propFirmName: row.propFirmName,
	profitSharePercentage: Number(row.profitSharePercentage),
	dayTradeTaxRate: Number(row.dayTradeTaxRate),
	swingTradeTaxRate: Number(row.swingTradeTaxRate),
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
	try {
		const { userId } = await requireAuth()

		const existingSettings = await db.query.userSettings.findFirst({
			where: eq(userSettings.userId, userId),
		})

		if (existingSettings) {
			return {
				status: "success",
				message: "Settings retrieved successfully",
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
				dayTradeTaxRate: String(DEFAULT_USER_SETTINGS.dayTradeTaxRate),
				swingTradeTaxRate: String(DEFAULT_USER_SETTINGS.swingTradeTaxRate),
				taxExemptThreshold: DEFAULT_USER_SETTINGS.taxExemptThreshold,
				defaultCurrency: DEFAULT_USER_SETTINGS.defaultCurrency,
				showTaxEstimates: DEFAULT_USER_SETTINGS.showTaxEstimates,
				showPropCalculations: DEFAULT_USER_SETTINGS.showPropCalculations,
				showAllAccounts: DEFAULT_USER_SETTINGS.showAllAccounts,
			})
			.returning()

		return {
			status: "success",
			message: "Default settings created",
			data: toUserSettingsData(newSettings),
		}
	} catch (error) {
		console.error("Failed to get user settings:", error)
		return {
			status: "error",
			message: "Failed to retrieve settings",
		}
	}
}

// Update user settings
export const updateUserSettings = async (
	data: UpdateUserSettingsInput
): Promise<ActionResponse<UserSettingsData>> => {
	try {
		const { userId } = await requireAuth()

		// Validate input
		const validationResult = userSettingsSchema.partial().safeParse(data)
		if (!validationResult.success) {
			return {
				status: "error",
				message: validationResult.error.issues[0]?.message || "Validation error",
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
					isPropAccount: data.isPropAccount ?? DEFAULT_USER_SETTINGS.isPropAccount,
					propFirmName: data.propFirmName ?? DEFAULT_USER_SETTINGS.propFirmName,
					profitSharePercentage: String(
						data.profitSharePercentage ??
							DEFAULT_USER_SETTINGS.profitSharePercentage
					),
					dayTradeTaxRate: String(
						data.dayTradeTaxRate ?? DEFAULT_USER_SETTINGS.dayTradeTaxRate
					),
					swingTradeTaxRate: String(
						data.swingTradeTaxRate ?? DEFAULT_USER_SETTINGS.swingTradeTaxRate
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

			invalidateSettingsData()

			return {
				status: "success",
				message: "Settings created successfully",
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
		if (data.dayTradeTaxRate !== undefined) {
			updateData.dayTradeTaxRate = String(data.dayTradeTaxRate)
		}
		if (data.swingTradeTaxRate !== undefined) {
			updateData.swingTradeTaxRate = String(data.swingTradeTaxRate)
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

		invalidateSettingsData()

		return {
			status: "success",
			message: "Settings updated successfully",
			data: toUserSettingsData(updated),
		}
	} catch (error) {
		console.error("Failed to update user settings:", error)
		return {
			status: "error",
			message: "Failed to update settings",
		}
	}
}

export const getRiskSettings = async (): Promise<ActionResponse<RiskSettings>> => {
	try {
		const { accountId } = await requireAuth()

		// Get account for risk settings
		const account = await db.query.tradingAccounts.findFirst({
			where: eq(tradingAccounts.id, accountId),
		})

		// Fallback to global settings
		const [riskSetting, balanceSetting] = await Promise.all([
			db.query.settings.findFirst({
				where: eq(settings.key, "default_risk_percent"),
			}),
			db.query.settings.findFirst({
				where: eq(settings.key, "account_balance"),
			}),
		])

		return {
			status: "success",
			message: "Settings retrieved successfully",
			data: {
				defaultRiskPercent: account?.defaultRiskPerTrade
					? Number(account.defaultRiskPerTrade)
					: riskSetting
						? Number(riskSetting.value)
						: 1.0,
				accountBalance: balanceSetting ? Number(balanceSetting.value) : 10000,
			},
		}
	} catch (error) {
		console.error("Failed to get risk settings:", error)
		return {
			status: "error",
			message: "Failed to retrieve settings",
		}
	}
}

export const updateRiskSettings = async (
	data: RiskSettings
): Promise<ActionResponse<RiskSettings>> => {
	try {
		const { accountId } = await requireAuth()
		const now = new Date()

		// Update account's default risk setting
		await db
			.update(tradingAccounts)
			.set({
				defaultRiskPerTrade: String(data.defaultRiskPercent),
				updatedAt: now,
			})
			.where(eq(tradingAccounts.id, accountId))

		// Also update global settings for backwards compatibility
		const existingRisk = await db.query.settings.findFirst({
			where: eq(settings.key, "default_risk_percent"),
		})

		if (existingRisk) {
			await db
				.update(settings)
				.set({ value: String(data.defaultRiskPercent), updatedAt: now })
				.where(eq(settings.key, "default_risk_percent"))
		} else {
			await db.insert(settings).values({
				key: "default_risk_percent",
				value: String(data.defaultRiskPercent),
				description: "Default position risk percentage",
				updatedAt: now,
			})
		}

		// Upsert account_balance (still global for now)
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
			message: "Settings updated successfully",
			data,
		}
	} catch (error) {
		console.error("Failed to update risk settings:", error)
		return {
			status: "error",
			message: "Failed to update settings",
		}
	}
}

/**
 * Get the user's persisted theme preference from the database.
 */
export const getUserTheme = async (): Promise<ActionResponse<string>> => {
	try {
		const { userId } = await requireAuth()

		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { theme: true },
		})

		return {
			status: "success",
			message: "Theme retrieved",
			data: user?.theme ?? "dark",
		}
	} catch (error) {
		console.error("Failed to get user theme:", error)
		return {
			status: "error",
			message: "Failed to retrieve theme",
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
				errors: [{ code: "INVALID_THEME", detail: `Theme must be one of: ${validThemes.join(", ")}` }],
			}
		}

		await db
			.update(users)
			.set({ theme, updatedAt: new Date() })
			.where(eq(users.id, userId))

		return {
			status: "success",
			message: "Theme updated",
			data: theme,
		}
	} catch (error) {
		console.error("Failed to update theme:", error)
		return {
			status: "error",
			message: "Failed to update theme",
		}
	}
}

import { BRANDS as VALID_BRANDS, type Brand as BrandValue } from "@/lib/brands"

/**
 * Get the current account's brand (color scheme) from the database.
 */
export const getAccountBrand = async (): Promise<ActionResponse<string>> => {
	try {
		const { accountId } = await requireAuth()

		const account = await db.query.tradingAccounts.findFirst({
			where: eq(tradingAccounts.id, accountId),
			columns: { brand: true },
		})

		return {
			status: "success",
			message: "Brand retrieved",
			data: account?.brand ?? "bravo",
		}
	} catch (error) {
		console.error("Failed to get account brand:", error)
		return {
			status: "error",
			message: "Failed to retrieve brand",
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
				errors: [{ code: "INVALID_BRAND", detail: `Brand must be one of: ${VALID_BRANDS.join(", ")}` }],
			}
		}

		await db
			.update(tradingAccounts)
			.set({ brand, updatedAt: new Date() })
			.where(eq(tradingAccounts.id, accountId))

		invalidateSettingsData()

		return {
			status: "success",
			message: "Brand updated",
			data: brand,
		}
	} catch (error) {
		console.error("Failed to update account brand:", error)
		return {
			status: "error",
			message: "Failed to update brand",
		}
	}
}
