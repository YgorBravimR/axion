import { z } from "zod"

/**
 * Shared Zod schema for filter preset state.
 *
 * Kept in a plain module (no "use server") so it can be safely imported
 * by both the server-actions file and "use client" components without
 * violating Next.js's constraint that "use server" files may only
 * export async functions.
 */
const savedFilterStateSchema = z.object({
	datePreset: z.string().max(20).nullable().optional(),
	dateFrom: z.string().max(50).nullable().optional(),
	dateTo: z.string().max(50).nullable().optional(),
	assets: z.array(z.string().max(20)).max(50).optional(),
	directions: z.array(z.enum(["long", "short"])).optional(),
	outcomes: z.array(z.enum(["win", "loss", "breakeven"])).optional(),
	timeframeIds: z.array(z.string().uuid()).max(50).optional(),
	groupBy: z.string().max(20).optional(),
	expectancyMode: z.string().max(20).optional(),
})

type SavedFilterState = z.infer<typeof savedFilterStateSchema>

const createPresetInputSchema = z.object({
	name: z.string().min(1).max(100).transform((val) => val.trim()),
	filters: savedFilterStateSchema,
	isDefault: z.boolean().optional(),
})

const updatePresetInputSchema = z.object({
	name: z.string().min(1).max(100).transform((val) => val.trim()).optional(),
	filters: savedFilterStateSchema.optional(),
	isDefault: z.boolean().optional(),
})

type CreatePresetInput = z.infer<typeof createPresetInputSchema>
type UpdatePresetInput = z.infer<typeof updatePresetInputSchema>

export {
	savedFilterStateSchema,
	createPresetInputSchema,
	updatePresetInputSchema,
	type SavedFilterState,
	type CreatePresetInput,
	type UpdatePresetInput,
}
