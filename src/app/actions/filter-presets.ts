"use server"

import { db } from "@/db/drizzle"
import { filterPresets } from "@/db/schema"
import type { FilterPreset } from "@/db/schema"
import { eq, and, desc } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { isFrameworkSignal } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"

// ============================================================================
// TYPES
// ============================================================================

interface SavedFilterState {
	datePreset?: string | null
	dateFrom?: string | null
	dateTo?: string | null
	assets?: string[]
	directions?: string[]
	outcomes?: string[]
	timeframeIds?: string[]
	groupBy?: string
	expectancyMode?: string
}

interface CreatePresetInput {
	name: string
	filters: SavedFilterState
	isDefault?: boolean
}

interface UpdatePresetInput {
	name?: string
	filters?: SavedFilterState
	isDefault?: boolean
}

// ============================================================================
// LIST PRESETS
// ============================================================================

const listFilterPresets = async (): Promise<ActionResponse<FilterPreset[]>> => {
	try {
		const { userId, accountId } = await requireAuth()

		const presets = await db.query.filterPresets.findMany({
			where: and(
				eq(filterPresets.userId, userId),
				eq(filterPresets.accountId, accountId),
				eq(filterPresets.accountId, accountId)
			),
			orderBy: [desc(filterPresets.updatedAt)],
		})

		return { status: "success", message: "Presets retrieved", data: presets }
	} catch (error) {
		if (!isFrameworkSignal(error))
			console.error("Error listing filter presets:", error)
		return { status: "error", message: "Failed to list presets" }
	}
}

// ============================================================================
// CREATE PRESET
// ============================================================================

const createFilterPreset = async (
	input: CreatePresetInput
): Promise<ActionResponse<FilterPreset>> => {
	try {
		const { userId, accountId } = await requireAuth()

		const name = input.name.trim()
		if (!name || name.length > 100) {
			return {
				status: "error",
				message: "Preset name is required (max 100 characters)",
				errors: [{ code: "INVALID_NAME", detail: "Name is required" }],
			}
		}

		// If setting as default, unset any existing default
		if (input.isDefault) {
			await db
				.update(filterPresets)
				.set({ isDefault: false })
				.where(
					and(
						eq(filterPresets.userId, userId),
				eq(filterPresets.accountId, accountId),
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
				filters: JSON.stringify(input.filters),
				isDefault: input.isDefault ?? false,
			})
			.returning()

		return { status: "success", message: "Preset created", data: preset }
	} catch (error) {
		if (!isFrameworkSignal(error))
			console.error("Error creating filter preset:", error)
		return { status: "error", message: "Failed to create preset" }
	}
}

// ============================================================================
// UPDATE PRESET
// ============================================================================

const updateFilterPreset = async (
	id: string,
	input: UpdatePresetInput
): Promise<ActionResponse<FilterPreset>> => {
	try {
		const { userId, accountId } = await requireAuth()

		// Verify ownership
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

		// If setting as default, unset any existing default
		if (input.isDefault) {
			await db
				.update(filterPresets)
				.set({ isDefault: false })
				.where(
					and(
						eq(filterPresets.userId, userId),
				eq(filterPresets.accountId, accountId),
						eq(filterPresets.accountId, accountId),
						eq(filterPresets.isDefault, true)
					)
				)
		}

		const updateData: Record<string, unknown> = {
			updatedAt: new Date(),
		}

		if (input.name !== undefined) {
			const name = input.name.trim()
			if (!name || name.length > 100) {
				return {
					status: "error",
					message: "Preset name is required (max 100 characters)",
				}
			}
			updateData.name = name
		}

		if (input.filters !== undefined) {
			updateData.filters = JSON.stringify(input.filters)
		}

		if (input.isDefault !== undefined) {
			updateData.isDefault = input.isDefault
		}

		const [updated] = await db
			.update(filterPresets)
			.set(updateData)
			.where(eq(filterPresets.id, id))
			.returning()

		return { status: "success", message: "Preset updated", data: updated }
	} catch (error) {
		if (!isFrameworkSignal(error))
			console.error("Error updating filter preset:", error)
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

		// Verify ownership
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
		if (!isFrameworkSignal(error))
			console.error("Error deleting filter preset:", error)
		return { status: "error", message: "Failed to delete preset" }
	}
}

export {
	listFilterPresets,
	createFilterPreset,
	updateFilterPreset,
	deleteFilterPreset,
	type SavedFilterState,
	type CreatePresetInput,
	type UpdatePresetInput,
}
