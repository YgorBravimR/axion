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
	// Epoch ms — client-stamped; persists as `updated_at` on the DB row.
	// Used as the conflict-resolution tiebreaker on mount when the
	// SSR-loaded list disagrees with the localStorage cache.
	lastModifiedMs: z.number().int().nonnegative(),
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
				// `lastModifiedMs` is derived from `updated_at` — the DB is
				// the source of truth for "when did the server last see
				// this", which is exactly what the conflict resolver needs.
				return {
					...parsed.data,
					id: r.id,
					color: r.color,
					label: r.label ?? parsed.data.label,
					lastModifiedMs: r.updatedAt.getTime(),
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

		// Atomic upsert. Honor the client's lastModifiedMs as `updated_at` so the
		// conflict resolver on next mount can compare apples to apples.
		// Falling back to `new Date()` would silently bump the row's updatedAt past
		// the client's stamp and break newer-wins.
		//
		// CRITICAL SECURITY: targetWhere ensures we only update rows owned by this user.
		// A malicious client reusing another user's drawing id will fail to update it
		// because the ownership constraint will block the update.
		const updatedAt = new Date(drawing.lastModifiedMs)
		await db
			.insert(hawksChartDrawings)
			.values({
				id: drawing.id,
				userId: auth.userId,
				assetId,
				kind: drawing.type,
				payload: drawing,
				label: drawing.label ?? null,
				color: drawing.color,
				updatedAt,
			})
			.onConflictDoUpdate({
				target: hawksChartDrawings.id,
				targetWhere: eq(hawksChartDrawings.userId, auth.userId),
				set: {
					kind: drawing.type,
					payload: drawing,
					label: drawing.label ?? null,
					color: drawing.color,
					updatedAt,
				},
			})

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

// ─── syncDrawings ────────────────────────────────────────────────────────
// Batch upsert + delete for the localStorage-first sync flow. The client
// holds the canonical drawing set in localStorage and periodically flushes
// the diff up here. Three reasons this is one action instead of three
// per-id calls:
//   1. Network — one POST per flush instead of N. The original chatty
//      flow was the whole reason we moved to local-first.
//   2. Transactional — either the whole batch lands or none of it does;
//      no partial-flush state where the DB has 3 of your 5 edits.
//   3. Tombstones — deletions travel with upserts in the same payload, so
//      a deleted-then-re-added id can't race with a stale upsert.
//
// Client contract: send the FULL current set under `upserts` + a list of
// `deletedIds`. Server applies deletes first, then upserts. lastModifiedMs
// is honored as updatedAt (same as saveDrawing). Returns the server's
// post-sync view so the client can reconcile if anything diverged.
const syncInputSchema = z.object({
	assetSymbol: z.string().min(1).max(16),
	upserts: z.array(drawingPayloadSchema).max(500),
	deletedIds: z.array(z.string().min(1).max(64)).max(500),
})

export const syncDrawings = async (input: {
	assetSymbol: string
	upserts: Drawing[]
	deletedIds: string[]
}): Promise<DrawingResult> => {
	try {
		const auth = await requireAuth()
		const parsed = syncInputSchema.safeParse(input)
		if (!parsed.success) {
			return {
				status: "error",
				message: parsed.error.issues[0]?.message ?? "Invalid sync payload",
			}
		}
		const assetId = await resolveAssetId(parsed.data.assetSymbol)
		if (!assetId) {
			return {
				status: "error",
				message: `Asset ${parsed.data.assetSymbol} not found`,
			}
		}

		// Execute all mutations in a transaction. On failure, DB and client
		// remain in sync — no partial state. Apply deletes first, then upserts.
		// If the same id is in both lists (shouldn't happen), the upsert wins,
		// matching "the client thinks it exists, so let it exist".
		// eslint-disable-next-line no-await-in-loop
		await db.transaction(async (tx) => {
			// Delete the specified ids. Each delete is scoped by both id and userId
			// so cross-user deletes are impossible.
			// eslint-disable-next-line no-await-in-loop
			for (const id of parsed.data.deletedIds) {
				// eslint-disable-next-line no-await-in-loop
				await tx
					.delete(hawksChartDrawings)
					.where(
						and(
							eq(hawksChartDrawings.id, id),
							eq(hawksChartDrawings.userId, auth.userId)
						)
					)
			}

			// Upsert each drawing atomically. targetWhere ensures we only update
			// rows owned by this user — a malicious client reusing another user's
			// drawing id will fail to update it.
			// eslint-disable-next-line no-await-in-loop
			for (const drawing of parsed.data.upserts) {
				const updatedAt = new Date(drawing.lastModifiedMs)
				// eslint-disable-next-line no-await-in-loop
				await tx
					.insert(hawksChartDrawings)
					.values({
						id: drawing.id,
						userId: auth.userId,
						assetId,
						kind: drawing.type,
						payload: drawing,
						label: drawing.label ?? null,
						color: drawing.color,
						updatedAt,
					})
					.onConflictDoUpdate({
						target: hawksChartDrawings.id,
						targetWhere: eq(hawksChartDrawings.userId, auth.userId),
						set: {
							kind: drawing.type,
							payload: drawing,
							label: drawing.label ?? null,
							color: drawing.color,
							updatedAt,
						},
					})
			}
		})

		// Return the server's post-sync view so the client can reconcile
		// (e.g. detect a drawing that another tab deleted between flushes).
		return await listDrawings(parsed.data.assetSymbol)
	} catch (err) {
		return {
			status: "error",
			message: err instanceof Error ? err.message : "Failed to sync drawings",
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
