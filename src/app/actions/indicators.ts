"use server"

import { db } from "@/db/drizzle"
import {
	indicatorGroups,
	indicatorDefinitions,
	type IndicatorGroup,
	type IndicatorDefinition,
} from "@/db/schema"
import { eq, asc } from "drizzle-orm"
import { invalidateSettingsData } from "@/lib/cache/invalidate"
import {
	createIndicatorGroupSchema,
	updateIndicatorGroupSchema,
	createIndicatorDefinitionSchema,
	updateIndicatorDefinitionSchema,
	type CreateIndicatorGroupInput,
	type UpdateIndicatorGroupInput,
	type CreateIndicatorDefinitionInput,
	type UpdateIndicatorDefinitionInput,
} from "@/lib/validations/indicator"
import type { IndicatorGroupWithDefinitions } from "@/types/indicator"
import { auth } from "@/auth"
import { requireRole } from "@/lib/auth-utils"
import { getTranslations } from "next-intl/server"

/**
 * Require authenticated session. Returns userId or throws.
 */
const requireSession = async (): Promise<string> => {
	const session = await auth()
	if (!session?.user?.id) {
		throw new Error("Unauthorized")
	}
	return session.user.id
}

// ============================================================================
// READ OPERATIONS
// ============================================================================

/**
 * Fetch all indicator groups with their indicator definitions, ordered by sortOrder.
 */
export const getIndicatorGroups = async (): Promise<IndicatorGroupWithDefinitions[]> => {
	await requireSession()
	const result = await db.query.indicatorGroups.findMany({
		with: { indicators: true },
		orderBy: [asc(indicatorGroups.sortOrder)],
	})
	return result
}

/**
 * Fetch all indicator definitions, ordered by sortOrder.
 */
export const getIndicatorDefinitions = async (): Promise<IndicatorDefinition[]> => {
	await requireSession()
	const result = await db.query.indicatorDefinitions.findMany({
		orderBy: [asc(indicatorDefinitions.sortOrder)],
	})
	return result
}

// ============================================================================
// INDICATOR GROUP CRUD
// ============================================================================

export const createIndicatorGroup = async (
	data: CreateIndicatorGroupInput
): Promise<{ success: boolean; data?: IndicatorGroup; error?: string }> => {
	await requireRole("admin")
	const validated = createIndicatorGroupSchema.safeParse(data)

	if (!validated.success) {
		return {
			success: false,
			error: validated.error.issues[0]?.message ?? "Invalid data",
		}
	}

	const [group] = await db
		.insert(indicatorGroups)
		.values({
			key: validated.data.key,
			displayName: validated.data.displayName,
			description: validated.data.description,
		})
		.returning()

	invalidateSettingsData()

	return { success: true, data: group }
}

export const updateIndicatorGroup = async (
	id: string,
	data: UpdateIndicatorGroupInput
): Promise<{ success: boolean; data?: IndicatorGroup; error?: string }> => {
	await requireRole("admin")
	const validated = updateIndicatorGroupSchema.safeParse(data)

	if (!validated.success) {
		return {
			success: false,
			error: validated.error.issues[0]?.message ?? "Invalid data",
		}
	}

	const [group] = await db
		.update(indicatorGroups)
		.set(validated.data)
		.where(eq(indicatorGroups.id, id))
		.returning()

	if (!group) {
		const t = await getTranslations("settings")
		return { success: false, error: t("indicators.errors.groupNotFound") }
	}

	invalidateSettingsData()

	return { success: true, data: group }
}

export const deleteIndicatorGroup = async (
	id: string
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")

	const linkedDefinition = await db.query.indicatorDefinitions.findFirst({
		where: eq(indicatorDefinitions.groupId, id),
	})

	if (linkedDefinition) {
		const t = await getTranslations("settings")
		return {
			success: false,
			error: t("indicators.errors.groupHasDefinitions"),
		}
	}

	await db.delete(indicatorGroups).where(eq(indicatorGroups.id, id))

	invalidateSettingsData()

	return { success: true }
}

export const toggleIndicatorGroupActive = async (
	id: string,
	isActive: boolean
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")
	await db
		.update(indicatorGroups)
		.set({ isActive })
		.where(eq(indicatorGroups.id, id))

	invalidateSettingsData()

	return { success: true }
}

// ============================================================================
// INDICATOR DEFINITION CRUD
// ============================================================================

export const createIndicatorDefinition = async (
	data: CreateIndicatorDefinitionInput
): Promise<{ success: boolean; data?: IndicatorDefinition; error?: string }> => {
	await requireRole("admin")
	const validated = createIndicatorDefinitionSchema.safeParse(data)

	if (!validated.success) {
		return {
			success: false,
			error: validated.error.issues[0]?.message ?? "Invalid data",
		}
	}

	const [definition] = await db
		.insert(indicatorDefinitions)
		.values({
			key: validated.data.key,
			displayName: validated.data.displayName,
			groupId: validated.data.groupId,
			csvHeader: validated.data.csvHeader,
			sortOrder: validated.data.sortOrder ?? 0,
		})
		.returning()

	invalidateSettingsData()

	return { success: true, data: definition }
}

export const updateIndicatorDefinition = async (
	id: string,
	data: UpdateIndicatorDefinitionInput
): Promise<{ success: boolean; data?: IndicatorDefinition; error?: string }> => {
	await requireRole("admin")
	const validated = updateIndicatorDefinitionSchema.safeParse(data)

	if (!validated.success) {
		return {
			success: false,
			error: validated.error.issues[0]?.message ?? "Invalid data",
		}
	}

	const updateValues: Record<string, unknown> = {}

	if (validated.data.key !== undefined) updateValues.key = validated.data.key
	if (validated.data.displayName !== undefined) updateValues.displayName = validated.data.displayName
	if (validated.data.groupId !== undefined) updateValues.groupId = validated.data.groupId
	if (validated.data.csvHeader !== undefined) updateValues.csvHeader = validated.data.csvHeader
	if (validated.data.sortOrder !== undefined) updateValues.sortOrder = validated.data.sortOrder

	const [definition] = await db
		.update(indicatorDefinitions)
		.set(updateValues)
		.where(eq(indicatorDefinitions.id, id))
		.returning()

	if (!definition) {
		const t = await getTranslations("settings")
		return { success: false, error: t("indicators.errors.definitionNotFound") }
	}

	invalidateSettingsData()

	return { success: true, data: definition }
}

export const deleteIndicatorDefinition = async (
	id: string
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")
	await db.delete(indicatorDefinitions).where(eq(indicatorDefinitions.id, id))

	invalidateSettingsData()

	return { success: true }
}

export const toggleIndicatorDefinitionActive = async (
	id: string,
	isActive: boolean
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")
	await db
		.update(indicatorDefinitions)
		.set({ isActive })
		.where(eq(indicatorDefinitions.id, id))

	invalidateSettingsData()

	return { success: true }
}
