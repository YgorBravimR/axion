"use server"

import { invalidateSettingsData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { riskManagementProfiles } from "@/db/schema"
import type { ActionResponse } from "@/types"
import type {
	RiskManagementProfile,
	DecisionTreeConfig,
} from "@/types/risk-profile"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { riskProfileSchema } from "@/lib/validations/risk-profile"
import type { RiskProfileSchemaInput } from "@/lib/validations/risk-profile"
import { requireAuth } from "@/app/actions/auth"
import { requireRole } from "@/lib/auth-utils"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getTranslations } from "next-intl/server"

// ==========================================
// HELPERS
// ==========================================

/**
 * Parses a DB row's JSON decision tree string into a typed DecisionTreeConfig.
 * Returns null if the JSON is corrupt, so list operations can skip bad rows.
 */
const parseProfileRow = (
	row: typeof riskManagementProfiles.$inferSelect
): RiskManagementProfile | null => {
	try {
		return {
			id: row.id,
			name: row.name,
			description: row.description,
			createdByUserId: row.createdByUserId,
			isActive: row.isActive,
			decisionTree: JSON.parse(row.decisionTree) as DecisionTreeConfig,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		}
	} catch (e) {
		console.error(
			`[risk-profiles] Failed to parse decisionTree for profile ${row.id}:`,
			e instanceof Error ? e.message : String(e)
		)
		return null
	}
}

// ==========================================
// RISK PROFILE ACTIONS
// ==========================================

/**
 * Returns all active risk profiles. Any authenticated user can read profiles.
 * Corrupt profiles are skipped with server-side logging.
 */
export const listActiveRiskProfiles = async (): Promise<
	ActionResponse<RiskManagementProfile[]>
> => {
	const t = await getTranslations("settings.riskProfiles")
	try {
		await requireAuth()

		const rows = await db.query.riskManagementProfiles.findMany({
			where: eq(riskManagementProfiles.isActive, true),
			orderBy: (profiles, { asc }) => [asc(profiles.name)],
		})

		const parsed = rows
			.map(parseProfileRow)
			.filter((p): p is RiskManagementProfile => p !== null)

		return {
			status: "success",
			message: t("actions.retrieved"),
			data: parsed,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.fetchFailed"),
			errors: [
				{
					code: "FETCH_ERROR",
					detail: toSafeErrorMessage(error, "listActiveRiskProfiles"),
				},
			],
		}
	}
}

/**
 * Get a single risk profile by ID.
 * Returns "data corrupted" error if the profile's JSON is malformed.
 */
export const getRiskProfile = async (
	id: string
): Promise<ActionResponse<RiskManagementProfile>> => {
	const t = await getTranslations("settings.riskProfiles")
	try {
		await requireAuth()

		const row = await db.query.riskManagementProfiles.findFirst({
			where: eq(riskManagementProfiles.id, id),
		})

		if (!row) {
			return {
				status: "error",
				message: t("errors.notFound"),
				errors: [{ code: "NOT_FOUND", detail: "Risk profile not found" }],
			}
		}

		const parsed = parseProfileRow(row)
		if (!parsed) {
			return {
				status: "error",
				message: t("errors.notFound"),
				errors: [
					{
						code: "DATA_CORRUPTED",
						detail: "Risk profile data corrupted",
					},
				],
			}
		}

		return {
			status: "success",
			message: t("actions.retrievedOne"),
			data: parsed,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("actions.fetchFailed"),
			errors: [
				{
					code: "FETCH_ERROR",
					detail: toSafeErrorMessage(error, "getRiskProfile"),
				},
			],
		}
	}
}

/**
 * Create a new risk management profile. Admin only.
 */
export const createRiskProfile = async (
	input: RiskProfileSchemaInput
): Promise<ActionResponse<RiskManagementProfile>> => {
	const t = await getTranslations("settings.riskProfiles")
	try {
		const { userId } = await requireAuth()
		await requireRole("premium")

		const validated = riskProfileSchema.parse(input)

		const [row] = await db
			.insert(riskManagementProfiles)
			.values({
				name: validated.name,
				description: validated.description ?? null,
				createdByUserId: userId,
				decisionTree: JSON.stringify(validated.decisionTree),
			})
			.returning()

		if (!row) {
			throw new Error("Failed to insert risk management profile")
		}

		invalidateSettingsData()

		const parsed = parseProfileRow(row)
		if (!parsed) {
			throw new Error("Failed to parse newly created risk profile")
		}

		return {
			status: "success",
			message: t("actions.created"),
			data: parsed,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: t("actions.validationError"),
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}
		if (error instanceof Error && error.message === "Forbidden") {
			return {
				status: "error",
				message: t("actions.premiumRequired"),
				errors: [
					{
						code: "FORBIDDEN",
						detail: "Premium role required to create risk profiles",
					},
				],
			}
		}
		return {
			status: "error",
			message: t("actions.createFailed"),
			errors: [
				{
					code: "CREATE_ERROR",
					detail: toSafeErrorMessage(error, "createRiskProfile"),
				},
			],
		}
	}
}

/**
 * Update an existing risk management profile. Admin only.
 */
export const updateRiskProfile = async (
	id: string,
	input: RiskProfileSchemaInput
): Promise<ActionResponse<RiskManagementProfile>> => {
	const t = await getTranslations("settings.riskProfiles")
	try {
		await requireAuth()
		await requireRole("premium")

		const validated = riskProfileSchema.parse(input)

		const [row] = await db
			.update(riskManagementProfiles)
			.set({
				name: validated.name,
				description: validated.description ?? null,
				decisionTree: JSON.stringify(validated.decisionTree),
				updatedAt: new Date(),
			})
			.where(eq(riskManagementProfiles.id, id))
			.returning()

		if (!row) {
			return {
				status: "error",
				message: t("errors.notFound"),
				errors: [{ code: "NOT_FOUND", detail: "Risk profile not found" }],
			}
		}

		invalidateSettingsData()

		const parsed = parseProfileRow(row)
		if (!parsed) {
			throw new Error("Failed to parse updated risk profile")
		}

		return {
			status: "success",
			message: t("actions.updated"),
			data: parsed,
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: t("actions.validationError"),
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}
		if (error instanceof Error && error.message === "Forbidden") {
			return {
				status: "error",
				message: t("actions.premiumRequired"),
				errors: [
					{
						code: "FORBIDDEN",
						detail: "Premium role required to update risk profiles",
					},
				],
			}
		}
		return {
			status: "error",
			message: t("actions.updateFailed"),
			errors: [
				{
					code: "UPDATE_ERROR",
					detail: toSafeErrorMessage(error, "updateRiskProfile"),
				},
			],
		}
	}
}

/**
 * Soft-delete a risk profile by marking it inactive. Admin only.
 */
export const deactivateRiskProfile = async (
	id: string
): Promise<ActionResponse<null>> => {
	const t = await getTranslations("settings.riskProfiles")
	try {
		await requireAuth()
		await requireRole("premium")

		await db
			.update(riskManagementProfiles)
			.set({ isActive: false, updatedAt: new Date() })
			.where(eq(riskManagementProfiles.id, id))

		invalidateSettingsData()

		return {
			status: "success",
			message: t("actions.deactivated"),
		}
	} catch (error) {
		if (error instanceof Error && error.message === "Forbidden") {
			return {
				status: "error",
				message: t("actions.premiumRequired"),
				errors: [
					{
						code: "FORBIDDEN",
						detail: "Premium role required to deactivate risk profiles",
					},
				],
			}
		}
		return {
			status: "error",
			message: t("actions.deactivateFailed"),
			errors: [
				{
					code: "DEACTIVATE_ERROR",
					detail: toSafeErrorMessage(error, "deactivateRiskProfile"),
				},
			],
		}
	}
}
