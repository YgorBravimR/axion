"use server"

import { and, eq, desc } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db/drizzle"
import { assets, hawksChartDrawings } from "@/db/schema"
import { requireAuth } from "@/app/actions/auth"
import type { Drawing } from "@/components/hawks-chart/drawings"
import type {
	DeleteResult,
	DrawingResult,
	MutationResult,
} from "./hawks-chart-drawings.types"

// ─── Zod schemas — server-side validation of the drawing payload ────────
// Mirrors the discriminated union in components/hawks-chart/drawings.ts.
// Keeping the schemas server-side prevents a malicious client from writing
// garbage JSON to the jsonb column — `payload` is otherwise opaque to SQL.

const baseDrawing = {
	id: z.string().min(1).max(64),
	color: z.string().min(1).max(32),
	label: z.string().max(120).optional(),
}

const hlinePayload = z.object({
	...baseDrawing,
	type: z.literal("hline"),
	price: z.number().finite(),
})

const trendlinePayload = z.object({
	...baseDrawing,
	type: z.literal("trendline"),
	startTimeMs: z.number().int().nonnegative(),
	startPrice: z.number().finite(),
	endTimeMs: z.number().int().nonnegative(),
	endPrice: z.number().finite(),
})

const vlinePayload = z.object({
	...baseDrawing,
	type: z.literal("vline"),
	timeMs: z.number().int().nonnegative(),
})

const fiboPayload = z.object({
	...baseDrawing,
	type: z.literal("fibo"),
	startTimeMs: z.number().int().nonnegative(),
	startPrice: z.number().finite(),
	endTimeMs: z.number().int().nonnegative(),
	endPrice: z.number().finite(),
	levels: z.array(z.number().finite()).optional(),
})

const positionPayload = z.object({
	...baseDrawing,
	type: z.literal("position"),
	direction: z.enum(["long", "short"]),
	startTimeMs: z.number().int().nonnegative(),
	endTimeMs: z.number().int().nonnegative(),
	entryPrice: z.number().finite(),
	stopPrice: z.number().finite(),
	targetPrice: z.number().finite(),
	qty: z.number().positive(),
	valuePerPoint: z.number().positive(),
})

const drawingPayloadSchema = z.discriminatedUnion("type", [
	hlinePayload,
	trendlinePayload,
	vlinePayload,
	fiboPayload,
	positionPayload,
])

const saveInputSchema = z.object({
	assetSymbol: z.string().min(1).max(16),
	drawing: drawingPayloadSchema,
})

const resolveAssetId = async (assetSymbol: string): Promise<string | null> => {
	const row = (
		await db
			.select({ id: assets.id })
			.from(assets)
			.where(eq(assets.symbol, assetSymbol))
			.limit(1)
	)[0]
	return row?.id ?? null
}

// ─── listDrawings ────────────────────────────────────────────────────────
export const listDrawings = async (
	assetSymbol: string
): Promise<DrawingResult> => {
	try {
		const auth = await requireAuth()
		const assetId = await resolveAssetId(assetSymbol)
		if (!assetId) {
			return { status: "error", message: `Asset ${assetSymbol} not found` }
		}
		const rows = await db
			.select()
			.from(hawksChartDrawings)
			.where(
				and(
					eq(hawksChartDrawings.userId, auth.userId),
					eq(hawksChartDrawings.assetId, assetId)
				)
			)
			.orderBy(desc(hawksChartDrawings.updatedAt))

		const drawings = rows
			.map((r): Drawing | null => {
				const parsed = drawingPayloadSchema.safeParse(r.payload)
				if (!parsed.success) {
					return null
				}
				// Overlay DB-controlled fields onto the payload so client code
				// always sees the canonical id/color/label from the row.
				return {
					...parsed.data,
					id: r.id,
					color: r.color,
					label: r.label ?? parsed.data.label,
				} as Drawing
			})
			.filter((d): d is Drawing => d !== null)

		return { status: "success", drawings }
	} catch (err) {
		return {
			status: "error",
			message: err instanceof Error ? err.message : "Failed to load drawings",
		}
	}
}

// ─── saveDrawing ─────────────────────────────────────────────────────────
export const saveDrawing = async (input: {
	assetSymbol: string
	drawing: Drawing
}): Promise<MutationResult> => {
	try {
		const auth = await requireAuth()
		const parsed = saveInputSchema.safeParse(input)
		if (!parsed.success) {
			return {
				status: "error",
				message: parsed.error.issues[0]?.message ?? "Invalid drawing",
			}
		}
		const assetId = await resolveAssetId(parsed.data.assetSymbol)
		if (!assetId) {
			return {
				status: "error",
				message: `Asset ${parsed.data.assetSymbol} not found`,
			}
		}

		const drawing = parsed.data.drawing

		// Upsert by id. New drawings come in with a client-generated id (crypto.
		// randomUUID); we honor it so optimistic UI doesn't have to re-sync.
		const existing = (
			await db
				.select({ id: hawksChartDrawings.id })
				.from(hawksChartDrawings)
				.where(
					and(
						eq(hawksChartDrawings.id, drawing.id),
						eq(hawksChartDrawings.userId, auth.userId)
					)
				)
				.limit(1)
		)[0]

		if (existing) {
			await db
				.update(hawksChartDrawings)
				.set({
					kind: drawing.type,
					payload: drawing,
					label: drawing.label ?? null,
					color: drawing.color,
					updatedAt: new Date(),
				})
				.where(eq(hawksChartDrawings.id, drawing.id))
		} else {
			await db.insert(hawksChartDrawings).values({
				id: drawing.id,
				userId: auth.userId,
				assetId,
				kind: drawing.type,
				payload: drawing,
				label: drawing.label ?? null,
				color: drawing.color,
			})
		}

		return { status: "success", drawing }
	} catch (err) {
		return {
			status: "error",
			message: err instanceof Error ? err.message : "Failed to save drawing",
		}
	}
}

// ─── deleteDrawing ───────────────────────────────────────────────────────
export const deleteDrawing = async (id: string): Promise<DeleteResult> => {
	try {
		const auth = await requireAuth()
		await db
			.delete(hawksChartDrawings)
			.where(
				and(
					eq(hawksChartDrawings.id, id),
					eq(hawksChartDrawings.userId, auth.userId)
				)
			)
		return { status: "success" }
	} catch (err) {
		return {
			status: "error",
			message: err instanceof Error ? err.message : "Failed to delete drawing",
		}
	}
}

// ─── clearDrawings ───────────────────────────────────────────────────────
// Hard-delete every drawing on a given asset for the current user. Used by
// the "Clear all" toolbar button. Confirmed in the UI via AlertDialog.
export const clearDrawings = async (
	assetSymbol: string
): Promise<DeleteResult> => {
	try {
		const auth = await requireAuth()
		const assetId = await resolveAssetId(assetSymbol)
		if (!assetId) {
			return {
				status: "error",
				message: `Asset ${assetSymbol} not found`,
			}
		}
		await db
			.delete(hawksChartDrawings)
			.where(
				and(
					eq(hawksChartDrawings.userId, auth.userId),
					eq(hawksChartDrawings.assetId, assetId)
				)
			)
		return { status: "success" }
	} catch (err) {
		return {
			status: "error",
			message: err instanceof Error ? err.message : "Failed to clear drawings",
		}
	}
}
