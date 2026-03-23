"use server"

import { db } from "@/db/drizzle"
import { timeframes, type Timeframe } from "@/db/schema"
import { eq, asc } from "drizzle-orm"
import { invalidateSettingsData } from "@/lib/cache/invalidate"
import {
	createTimeframeSchema,
	updateTimeframeSchema,
	type CreateTimeframeInput,
	type UpdateTimeframeInput,
} from "@/lib/validations/timeframe"
import { auth } from "@/auth"
import { requireRole } from "@/lib/auth-utils"

const requireSession = async (): Promise<string> => {
	const session = await auth()
	if (!session?.user?.id) {
		throw new Error("Unauthorized")
	}
	return session.user.id
}

export const getTimeframes = async (): Promise<Timeframe[]> => {
	await requireSession()
	const result = await db.query.timeframes.findMany({
		orderBy: [asc(timeframes.sortOrder), asc(timeframes.code)],
	})
	return result
}

export const getActiveTimeframes = async (): Promise<Timeframe[]> => {
	await requireSession()
	const result = await db.query.timeframes.findMany({
		where: eq(timeframes.isActive, true),
		orderBy: [asc(timeframes.sortOrder), asc(timeframes.code)],
	})
	return result
}

export const getTimeframesByType = async (
	type: "time_based" | "renko"
): Promise<Timeframe[]> => {
	await requireSession()
	const result = await db.query.timeframes.findMany({
		where: eq(timeframes.type, type),
		orderBy: [asc(timeframes.sortOrder), asc(timeframes.code)],
	})
	return result
}

export const getTimeframe = async (id: string): Promise<Timeframe | null> => {
	await requireSession()
	const result = await db.query.timeframes.findFirst({
		where: eq(timeframes.id, id),
	})
	return result ?? null
}

export const getTimeframeByCode = async (
	code: string
): Promise<Timeframe | null> => {
	await requireSession()
	const result = await db.query.timeframes.findFirst({
		where: eq(timeframes.code, code.toUpperCase()),
	})
	return result ?? null
}

export const createTimeframe = async (
	data: CreateTimeframeInput
): Promise<{ success: boolean; data?: Timeframe; error?: string }> => {
	await requireRole("admin")
	const validated = createTimeframeSchema.safeParse(data)

	if (!validated.success) {
		return {
			success: false,
			error: validated.error.issues[0]?.message ?? "Invalid data",
		}
	}

	const [timeframe] = await db
		.insert(timeframes)
		.values({
			code: validated.data.code,
			name: validated.data.name,
			type: validated.data.type,
			value: validated.data.value,
			unit: validated.data.unit,
			sortOrder: validated.data.sortOrder ?? 0,
			isActive: validated.data.isActive,
		})
		.returning()

	invalidateSettingsData()

	return { success: true, data: timeframe }
}

export const updateTimeframe = async (
	data: UpdateTimeframeInput
): Promise<{ success: boolean; data?: Timeframe; error?: string }> => {
	await requireRole("admin")
	const validated = updateTimeframeSchema.safeParse(data)

	if (!validated.success) {
		return {
			success: false,
			error: validated.error.issues[0]?.message ?? "Invalid data",
		}
	}

	const { id, ...updateData } = validated.data

	const updateValues: Record<string, unknown> = {}

	if (updateData.code !== undefined) updateValues.code = updateData.code
	if (updateData.name !== undefined) updateValues.name = updateData.name
	if (updateData.type !== undefined) updateValues.type = updateData.type
	if (updateData.value !== undefined) updateValues.value = updateData.value
	if (updateData.unit !== undefined) updateValues.unit = updateData.unit
	if (updateData.sortOrder !== undefined)
		updateValues.sortOrder = updateData.sortOrder
	if (updateData.isActive !== undefined)
		updateValues.isActive = updateData.isActive

	const [timeframe] = await db
		.update(timeframes)
		.set(updateValues)
		.where(eq(timeframes.id, id))
		.returning()

	if (!timeframe) {
		return { success: false, error: "Timeframe not found" }
	}

	invalidateSettingsData()

	return { success: true, data: timeframe }
}

export const deleteTimeframe = async (
	id: string
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")
	await db.delete(timeframes).where(eq(timeframes.id, id))

	invalidateSettingsData()

	return { success: true }
}

export const toggleTimeframeActive = async (
	id: string,
	isActive: boolean
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")
	await db
		.update(timeframes)
		.set({ isActive })
		.where(eq(timeframes.id, id))

	invalidateSettingsData()

	return { success: true }
}

export const reorderTimeframes = async (
	orderedIds: string[]
): Promise<{ success: boolean; error?: string }> => {
	await requireRole("admin")
	for (let i = 0; i < orderedIds.length; i++) {
		await db
			.update(timeframes)
			.set({ sortOrder: i })
			.where(eq(timeframes.id, orderedIds[i]))
	}

	invalidateSettingsData()

	return { success: true }
}
