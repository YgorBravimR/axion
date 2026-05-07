"use server"

import { z } from "zod"
import { db } from "@/db/drizzle"
import { filterPresets } from "@/db/schema"
import type { FilterPreset, NewFilterPreset } from "@/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { isFrameworkSignal } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"
import {
	savedFilterStateSchema,
	createPresetInputSchema,
	updatePresetInputSchema,
	type SavedFilterState,
	type CreatePresetInput,
	type UpdatePresetInput,
} from "@/lib/filter-preset-schema"

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const uuidSchema = z.string().uuid()

// ============================================================================
// LIST PRESETS
// ============================================================================

const listFilterPresets = async (): Promise<ActionResponse<FilterPreset[]>> => {
	try {
		const { userId, accountId } = await requireAuth()

		const presets = await db.query.filterPresets.findMany({
			where: and(
				eq(filterPresets.userId, userId),
				eq(filterPresets.accountId, accountId)
			),
			orderBy: [desc(filterPresets.updatedAt)],
		})

		return { status: "success", message: "Presets retrieved", data: presets }
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error listing filter presets:", error)
		}
		return { status: "error", message: "Failed to list presets" }
	}
}

// ============================================================================
// CREATE PRESET
// ============================================================================

const createFilterPreset = async (
	input: unknown
): Promise<ActionResponse<FilterPreset>> => {
	try {
		const { userId, accountId } = await requireAuth()

		const parsed = createPresetInputSchema.safeParse(input)
		if (!parsed.success) {
			return {
				status: "error",
				message: "Invalid preset data",
				errors: [{ code: "VALIDATION_ERROR", detail: parsed.error.message }],
			}
		}

		const { name, filters, isDefault } = parsed.data

		// If setting as default, unset any existing default
		if (isDefault) {
			await db
				.update(filterPresets)
				.set({ isDefault: false })
				.where(
					and(
						eq(filterPresets.userId, userId),
						eq(filterPresets.accountId, accountId),
						eq(filterPresets.isDefault, true)
					)
				)
		}

		const [preset] = await db
			.insert(filterPresets)
			.values({
				userId,
				accountId,
				name,
				filters: JSON.stringify(filters),
				isDefault: isDefault ?? false,
			})
			.returning()

		return { status: "success", message: "Preset created", data: preset }
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error creating filter preset:", error)
		}
		return { status: "error", message: "Failed to create preset" }
	}
}

// ============================================================================
// UPDATE PRESET
// ============================================================================

const updateFilterPreset = async (
	id: string,
	input: unknown
): Promise<ActionResponse<FilterPreset>> => {
	try {
		const { userId, accountId } = await requireAuth()

		// Validate UUID
		const idResult = uuidSchema.safeParse(id)
		if (!idResult.success) {
			return {
				status: "error",
				message: "Invalid preset ID",
				errors: [{ code: "INVALID_ID", detail: "ID must be a valid UUID" }],
			}
		}

		// Validate input
		const parsed = updatePresetInputSchema.safeParse(input)
		if (!parsed.success) {
			return {
				status: "error",
				message: "Invalid preset data",
				errors: [{ code: "VALIDATION_ERROR", detail: parsed.error.message }],
			}
		}

		// Verify ownership (userId + accountId scoping)
		const existing = await db.query.filterPresets.findFirst({
			where: and(
				eq(filterPresets.id, id),
				eq(filterPresets.userId, userId),
				eq(filterPresets.accountId, accountId)
			),
		})

		if (!existing) {
			return {
				status: "error",
				message: "Preset not found",
				errors: [{ code: "NOT_FOUND", detail: "Preset does not exist" }],
			}
		}

		const { name, filters, isDefault } = parsed.data

		// If setting as default, unset any existing default
		if (isDefault) {
			await db
				.update(filterPresets)
				.set({ isDefault: false })
				.where(
					and(
						eq(filterPresets.userId, userId),
						eq(filterPresets.accountId, accountId),
						eq(filterPresets.isDefault, true)
					)
				)
		}

		// Build typed update — only include fields that were provided
		const updateData: Partial<NewFilterPreset> = {
			updatedAt: new Date(),
		}

		if (name !== undefined) {
			updateData.name = name
		}
		if (filters !== undefined) {
			updateData.filters = JSON.stringify(filters)
		}
		if (isDefault !== undefined) {
			updateData.isDefault = isDefault
		}

		const [updated] = await db
			.update(filterPresets)
			.set(updateData)
			.where(eq(filterPresets.id, id))
			.returning()

		return { status: "success", message: "Preset updated", data: updated }
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error updating filter preset:", error)
		}
		return { status: "error", message: "Failed to update preset" }
	}
}

// ============================================================================
// DELETE PRESET
// ============================================================================

const deleteFilterPreset = async (
	id: string
): Promise<ActionResponse<null>> => {
	try {
		const { userId, accountId } = await requireAuth()

		// Validate UUID
		const idResult = uuidSchema.safeParse(id)
		if (!idResult.success) {
			return {
				status: "error",
				message: "Invalid preset ID",
				errors: [{ code: "INVALID_ID", detail: "ID must be a valid UUID" }],
			}
		}

		// Verify ownership (userId + accountId scoping)
		const existing = await db.query.filterPresets.findFirst({
			where: and(
				eq(filterPresets.id, id),
				eq(filterPresets.userId, userId),
				eq(filterPresets.accountId, accountId)
			),
		})

		if (!existing) {
			return {
				status: "error",
				message: "Preset not found",
				errors: [{ code: "NOT_FOUND", detail: "Preset does not exist" }],
			}
		}

		await db.delete(filterPresets).where(eq(filterPresets.id, id))

		return { status: "success", message: "Preset deleted", data: null }
	} catch (error) {
		if (!isFrameworkSignal(error)) {
			console.error("Error deleting filter preset:", error)
		}
		return { status: "error", message: "Failed to delete preset" }
	}
}

export {
	listFilterPresets,
	createFilterPreset,
	updateFilterPreset,
	deleteFilterPreset,
}
