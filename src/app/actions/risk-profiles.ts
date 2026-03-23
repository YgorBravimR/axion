"use server"

import { invalidateSettingsData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { riskManagementProfiles } from "@/db/schema"
import type { ActionResponse } from "@/types"
import type { RiskManagementProfile } from "@/types/risk-profile"
import type { DecisionTreeConfig } from "@/types/risk-profile"
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
 */
const parseProfileRow = (row: typeof riskManagementProfiles.$inferSelect): RiskManagementProfile => ({
	id: row.id,
	name: row.name,
	description: row.description,
	createdByUserId: row.createdByUserId,
	isActive: row.isActive,
	baseRiskCents: row.baseRiskCents,
	dailyLossCents: row.dailyLossCents,
	weeklyLossCents: row.weeklyLossCents,
	monthlyLossCents: row.monthlyLossCents,
	dailyProfitTargetCents: row.dailyProfitTargetCents,
	decisionTree: JSON.parse(row.decisionTree) as DecisionTreeConfig,
	createdAt: row.createdAt,
	updatedAt: row.updatedAt,
})

// ==========================================
// RISK PROFILE ACTIONS
// ==========================================

/**
 * Returns all active risk profiles. Any authenticated user can read profiles.
 */
const listActiveRiskProfiles = async (): Promise<ActionResponse<RiskManagementProfile[]>> => {
	try {
		await requireAuth()

		const rows = await db.query.riskManagementProfiles.findMany({
			where: eq(riskManagementProfiles.isActive, true),
			orderBy: (profiles, { asc }) => [asc(profiles.name)],
		})

		return {
			status: "success",
			message: "Risk profiles retrieved",
			data: rows.map(parseProfileRow),
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to get risk profiles",
			errors: [{ code: "FETCH_ERROR", detail: toSafeErrorMessage(error, "listActiveRiskProfiles") }],
		}
	}
}

/**
 * Get a single risk profile by ID.
 */
const getRiskProfile = async (id: string): Promise<ActionResponse<RiskManagementProfile>> => {
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

		return {
			status: "success",
			message: "Risk profile retrieved",
			data: parseProfileRow(row),
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to get risk profile",
			errors: [{ code: "FETCH_ERROR", detail: toSafeErrorMessage(error, "getRiskProfile") }],
		}
	}
}

/**
 * Create a new risk management profile. Admin only.
 */
const createRiskProfile = async (
	input: RiskProfileSchemaInput
): Promise<ActionResponse<RiskManagementProfile>> => {
	try {
		const { userId } = await requireAuth()
		await requireRole("admin")

		const validated = riskProfileSchema.parse(input)

		const [row] = await db
			.insert(riskManagementProfiles)
			.values({
				name: validated.name,
				description: validated.description ?? null,
				createdByUserId: userId,
				baseRiskCents: validated.baseRiskCents,
				dailyLossCents: validated.dailyLossCents,
				weeklyLossCents: validated.weeklyLossCents ?? null,
				monthlyLossCents: validated.monthlyLossCents,
				dailyProfitTargetCents: validated.dailyProfitTargetCents ?? null,
				decisionTree: JSON.stringify(validated.decisionTree),
			})
			.returning()

		invalidateSettingsData()

		return {
			status: "success",
			message: "Risk profile created",
			data: parseProfileRow(row),
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation failed",
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}
		if (error instanceof Error && error.message === "Forbidden") {
			return {
				status: "error",
				message: "Admin access required",
				errors: [{ code: "FORBIDDEN", detail: "Only admins can create risk profiles" }],
			}
		}
		return {
			status: "error",
			message: "Failed to create risk profile",
			errors: [{ code: "CREATE_ERROR", detail: toSafeErrorMessage(error, "createRiskProfile") }],
		}
	}
}

/**
 * Update an existing risk management profile. Admin only.
 */
const updateRiskProfile = async (
	id: string,
	input: RiskProfileSchemaInput
): Promise<ActionResponse<RiskManagementProfile>> => {
	const t = await getTranslations("settings.riskProfiles")
	try {
		const { userId } = await requireAuth()
		await requireRole("admin")

		const validated = riskProfileSchema.parse(input)

		const [row] = await db
			.update(riskManagementProfiles)
			.set({
				name: validated.name,
				description: validated.description ?? null,
				baseRiskCents: validated.baseRiskCents,
				dailyLossCents: validated.dailyLossCents,
				weeklyLossCents: validated.weeklyLossCents ?? null,
				monthlyLossCents: validated.monthlyLossCents,
				dailyProfitTargetCents: validated.dailyProfitTargetCents ?? null,
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

		return {
			status: "success",
			message: "Risk profile updated",
			data: parseProfileRow(row),
		}
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				status: "error",
				message: "Validation failed",
				errors: error.issues.map((e) => ({
					code: "VALIDATION_ERROR",
					detail: `${e.path.join(".")}: ${e.message}`,
				})),
			}
		}
		if (error instanceof Error && error.message === "Forbidden") {
			return {
				status: "error",
				message: "Admin access required",
				errors: [{ code: "FORBIDDEN", detail: "Only admins can update risk profiles" }],
			}
		}
		return {
			status: "error",
			message: "Failed to update risk profile",
			errors: [{ code: "UPDATE_ERROR", detail: toSafeErrorMessage(error, "updateRiskProfile") }],
		}
	}
}

/**
 * Soft-delete a risk profile by marking it inactive. Admin only.
 */
const deactivateRiskProfile = async (id: string): Promise<ActionResponse<null>> => {
	try {
		const { userId } = await requireAuth()
		await requireRole("admin")

		await db
			.update(riskManagementProfiles)
			.set({ isActive: false, updatedAt: new Date() })
			.where(eq(riskManagementProfiles.id, id))

		invalidateSettingsData()

		return {
			status: "success",
			message: "Risk profile deactivated",
		}
	} catch (error) {
		if (error instanceof Error && error.message === "Forbidden") {
			return {
				status: "error",
				message: "Admin access required",
				errors: [{ code: "FORBIDDEN", detail: "Only admins can deactivate risk profiles" }],
			}
		}
		return {
			status: "error",
			message: "Failed to deactivate risk profile",
			errors: [{ code: "DEACTIVATE_ERROR", detail: toSafeErrorMessage(error, "deactivateRiskProfile") }],
		}
	}
}

export {
	listActiveRiskProfiles,
	getRiskProfile,
	createRiskProfile,
	updateRiskProfile,
	deactivateRiskProfile,
}
