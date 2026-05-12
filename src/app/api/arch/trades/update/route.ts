import type { NextRequest } from "next/server"
import { z } from "zod"
import { db } from "@/db/drizzle"
import { trades, tradeTags, strategies, tags, timeframes } from "@/db/schema"
import { eq, and, inArray } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError, formatTradeForArch } from "../../_lib/helpers"
import { buildAccountCondition } from "../../_lib/filters"
import {
	resolveStrategyName,
	resolveTagNames,
	resolveTimeframeName,
} from "../../_lib/resolve-names"
import { getAssetBySymbol, getBreakevenTicks } from "../../_lib/asset-lookup"
import { resolveTradeAsset } from "@/lib/asset-resolution"
import { getRegisteredAssetSymbols } from "@/app/actions/assets"
import {
	calculatePnL,
	calculateAssetPnL,
	calculateRMultiple,
	determineOutcome,
} from "@/lib/calculations"
import { fromCents, toCents, toNumericString } from "@/lib/money"
import {
	getUserDek,
	encryptTradeFields,
	decryptTradeFields,
} from "@/lib/user-crypto"
import { markTaxLedgerDirty } from "@/lib/tax/mark-dirty"
import { applyScaledExecutionOps, hasOps } from "../../_lib/scaled-update"
import type { ScaledExecutionOps } from "../../_lib/scaled-update"

const numericLike = z.union([z.number(), z.string()])
const dateLike = z.union([z.string(), z.number(), z.date()])

const archUpdateTradeSchema = z.object({
	id: z.string().uuid("id must be a UUID"),
	asset: z.string().min(1).max(20).optional(),
	direction: z.enum(["long", "short"]).optional(),
	entryDate: dateLike.optional(),
	exitDate: dateLike.optional(),
	entryPrice: numericLike.optional(),
	exitPrice: numericLike.optional(),
	positionSize: numericLike.optional(),
	stopLoss: numericLike.optional(),
	takeProfit: numericLike.optional(),
	riskAmount: numericLike.optional(),
	strategy: z.string().optional(),
	strategyId: z.string().uuid().nullable().optional(),
	timeframe: z.string().optional(),
	timeframeId: z.string().uuid().nullable().optional(),
	tags: z.array(z.string()).optional(),
	tagIds: z.array(z.string().uuid()).optional(),
	preTradeThoughts: z.string().optional(),
	postTradeReflection: z.string().optional(),
	lessonLearned: z.string().optional(),
	disciplineNotes: z.string().optional(),
	followedPlan: z.boolean().optional(),
	setupRank: z.enum(["A", "AA", "AAA"]).nullable().optional(),
	rating: z.enum(["A", "B", "C", "D", "F"]).nullable().optional(),
	screenshotUrl: z.string().nullable().optional(),
	screenshotS3Key: z.string().nullable().optional(),
	isArchived: z.boolean().optional(),
	mfe: numericLike.optional(),
	mae: numericLike.optional(),
	mfeR: numericLike.optional(),
	maeR: numericLike.optional(),
	contractsExecuted: numericLike.optional(),
	executions: z
		.object({
			add: z.array(z.unknown()).optional(),
			update: z.array(z.unknown()).optional(),
			delete: z.array(z.string()).optional(),
		})
		.passthrough()
		.optional(),
})

/**
 * Verifies a strategyId belongs to the calling user.
 * Returns the id when valid, null when explicitly cleared, throws otherwise.
 */
const verifyStrategyOwnership = async (
	strategyId: string | null | undefined,
	userId: string
): Promise<string | null> => {
	if (strategyId === null) {
		return null
	}
	if (!strategyId) {
		return null
	}
	const row = await db.query.strategies.findFirst({
		where: and(eq(strategies.id, strategyId), eq(strategies.userId, userId)),
		columns: { id: true },
	})
	if (!row) {
		throw new Error("STRATEGY_NOT_FOUND")
	}
	return row.id
}

/**
 * Verifies a timeframeId exists (timeframes are global, not user-scoped).
 */
const verifyTimeframeExists = async (
	timeframeId: string | null | undefined
): Promise<string | null> => {
	if (timeframeId === null) {
		return null
	}
	if (!timeframeId) {
		return null
	}
	const row = await db.query.timeframes.findFirst({
		where: eq(timeframes.id, timeframeId),
		columns: { id: true },
	})
	if (!row) {
		throw new Error("TIMEFRAME_NOT_FOUND")
	}
	return row.id
}

/**
 * Verifies every tagId in the array belongs to the calling user.
 * Returns the (deduped) id list, throws if any id is unknown or cross-tenant.
 */
const verifyTagOwnership = async (
	tagIds: string[],
	userId: string
): Promise<string[]> => {
	if (tagIds.length === 0) {
		return []
	}
	const unique = Array.from(new Set(tagIds))
	const rows = await db
		.select({ id: tags.id })
		.from(tags)
		.where(and(inArray(tags.id, unique), eq(tags.userId, userId)))
	if (rows.length !== unique.length) {
		throw new Error("TAG_NOT_FOUND")
	}
	return rows.map((row) => row.id)
}

/**
 * POST /api/arch/trades/update
 *
 * Updates an existing trade via the Arch API layer.
 * Resolves fuzzy names for strategy, timeframe, and tags.
 * Merges provided fields with existing trade data.
 * Recalculates P&L, outcome, and R-multiple when prices change.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = archUpdateTradeSchema.parse(await request.json())

		const accountCondition = buildAccountCondition(auth)

		// Fetch existing trade and verify ownership
		let existing = await db.query.trades.findFirst({
			where: and(eq(trades.id, body.id), accountCondition),
		})

		if (!existing) {
			return archError(
				"Trade not found",
				[
					{
						code: "NOT_FOUND",
						detail: "Trade does not exist or does not belong to this account",
					},
				],
				404
			)
		}

		// Decrypt existing trade fields before merging
		const dek = await getUserDek(auth.userId)
		if (dek) {
			existing = decryptTradeFields(existing, dek)
		}

		// Resolve strategy: direct id wins over fuzzy name. null explicitly clears.
		let strategyId: string | null | undefined
		if (body.strategyId !== undefined) {
			strategyId = await verifyStrategyOwnership(body.strategyId, auth.userId)
		} else if (body.strategy !== undefined) {
			strategyId = await resolveStrategyName(body.strategy, auth.userId)
		}

		// Resolve timeframe: direct id wins. Timeframes are global.
		let timeframeId: string | null | undefined
		if (body.timeframeId !== undefined) {
			timeframeId = await verifyTimeframeExists(body.timeframeId)
		} else if (body.timeframe !== undefined) {
			timeframeId = await resolveTimeframeName(body.timeframe)
		}

		// Resolve tags: direct ids win over fuzzy names. Verify ownership.
		let tagIds: string[] | undefined
		if (body.tagIds !== undefined) {
			tagIds = await verifyTagOwnership(body.tagIds, auth.userId)
		} else if (body.tags !== undefined) {
			tagIds = await resolveTagNames(body.tags, auth.userId)
		}

		// Merge provided fields over existing values
		const exitPrice =
			body.exitPrice !== undefined
				? Number(body.exitPrice)
				: existing.exitPrice
					? Number(existing.exitPrice)
					: undefined
		const entryPrice =
			body.entryPrice !== undefined
				? Number(body.entryPrice)
				: Number(existing.entryPrice)
		const positionSize =
			body.positionSize !== undefined
				? Number(body.positionSize)
				: Number(existing.positionSize)
		const direction = body.direction ?? existing.direction
		const stopLoss =
			body.stopLoss !== undefined
				? Number(body.stopLoss)
				: existing.stopLoss
					? Number(existing.stopLoss)
					: undefined
		const takeProfit =
			body.takeProfit !== undefined
				? Number(body.takeProfit)
				: existing.takeProfit
					? Number(existing.takeProfit)
					: undefined
		const riskAmount =
			body.riskAmount !== undefined
				? Number(body.riskAmount)
				: existing.plannedRiskAmount
					? Number(existing.plannedRiskAmount) / 100
					: undefined

		// Resolve asset symbol if being changed
		let resolvedAsset = body.asset
		if (resolvedAsset) {
			const registeredSymbols = await getRegisteredAssetSymbols()
			const resolved = resolveTradeAsset(resolvedAsset, registeredSymbols)
			resolvedAsset = resolved.symbol
		}

		// Calculate plannedRiskAmount
		let plannedRiskAmount: number | undefined
		const assetSymbol = resolvedAsset ?? existing.asset
		const assetConfigForRisk = await getAssetBySymbol(assetSymbol)

		if (riskAmount) {
			plannedRiskAmount = riskAmount
		} else if (stopLoss) {
			const priceDiff = Math.abs(entryPrice - stopLoss)

			if (assetConfigForRisk) {
				const tickSize = parseFloat(assetConfigForRisk.tickSize)
				const tickValue = fromCents(assetConfigForRisk.tickValue)
				const ticksAtRisk = priceDiff / tickSize
				plannedRiskAmount = ticksAtRisk * tickValue * positionSize
			} else {
				plannedRiskAmount = priceDiff * positionSize
			}
		}

		// Calculate plannedRMultiple from TP/SL ratio
		let plannedRMultiple: number | undefined
		if (stopLoss && takeProfit) {
			const riskPerUnit =
				direction === "long" ? entryPrice - stopLoss : stopLoss - entryPrice
			if (riskPerUnit !== 0) {
				const rewardPerUnit =
					direction === "long"
						? takeProfit - entryPrice
						: entryPrice - takeProfit
				plannedRMultiple = Math.abs(rewardPerUnit / riskPerUnit)
			}
		}

		// Recalculate P&L if exit price exists
		let pnl: number | undefined
		let outcome: "win" | "loss" | "breakeven" | null = null
		let realizedR: number | undefined

		if (exitPrice) {
			const assetConfig = await getAssetBySymbol(assetSymbol)
			let ticksGained: number | null = null

			if (assetConfig) {
				const contractsExec =
					body.contractsExecuted !== undefined
						? Number(body.contractsExecuted)
						: existing.contractsExecuted
							? Number(existing.contractsExecuted)
							: positionSize * 2

				const result = calculateAssetPnL({
					entryPrice,
					exitPrice,
					positionSize,
					direction,
					tickSize: parseFloat(assetConfig.tickSize),
					tickValue: fromCents(assetConfig.tickValue),
					contractsExecuted: contractsExec,
				})
				pnl = result.netPnl
				ticksGained = result.ticksGained
			} else {
				pnl = calculatePnL({
					direction,
					entryPrice,
					exitPrice,
					positionSize,
				})
			}

			const breakevenTicks = await getBreakevenTicks(
				assetSymbol,
				auth.accountId
			)
			outcome = determineOutcome({ pnl, ticksGained, breakevenTicks })

			if (plannedRiskAmount && plannedRiskAmount > 0) {
				realizedR = calculateRMultiple(pnl, plannedRiskAmount)
			}
		}

		// Build update data with only provided fields
		const updateData: Record<string, unknown> = {
			updatedAt: new Date(),
		}

		if (body.asset !== undefined) {
			updateData.asset = resolvedAsset ?? body.asset.toUpperCase()
		}
		if (body.direction !== undefined) {
			updateData.direction = body.direction
		}
		if (strategyId !== undefined) {
			updateData.strategyId = strategyId || null
		}
		if (timeframeId !== undefined) {
			updateData.timeframeId = timeframeId || null
		}
		if (body.entryDate !== undefined) {
			updateData.entryDate = new Date(body.entryDate)
		}
		if (body.exitDate !== undefined) {
			updateData.exitDate = new Date(body.exitDate)
		}
		if (body.entryPrice !== undefined) {
			updateData.entryPrice = toNumericString(Number(body.entryPrice))
		}
		if (body.exitPrice !== undefined) {
			updateData.exitPrice = toNumericString(Number(body.exitPrice))
		}
		if (body.positionSize !== undefined) {
			updateData.positionSize = toNumericString(Number(body.positionSize))
		}
		if (body.stopLoss !== undefined) {
			updateData.stopLoss = toNumericString(Number(body.stopLoss))
		}
		if (body.takeProfit !== undefined) {
			updateData.takeProfit = toNumericString(Number(body.takeProfit))
		}
		if (plannedRiskAmount !== undefined) {
			updateData.plannedRiskAmount = toNumericString(toCents(plannedRiskAmount))
		}
		if (plannedRMultiple !== undefined) {
			updateData.plannedRMultiple = toNumericString(plannedRMultiple)
		}
		if (body.mfe !== undefined) {
			updateData.mfe = toNumericString(Number(body.mfe))
		}
		if (body.mae !== undefined) {
			updateData.mae = toNumericString(Number(body.mae))
		}
		if (body.mfeR !== undefined) {
			updateData.mfeR = toNumericString(Number(body.mfeR))
		}
		if (body.maeR !== undefined) {
			updateData.maeR = toNumericString(Number(body.maeR))
		}
		if (body.contractsExecuted !== undefined) {
			updateData.contractsExecuted = toNumericString(
				Number(body.contractsExecuted)
			)
		}
		if (body.followedPlan !== undefined) {
			updateData.followedPlan = body.followedPlan
		}
		if (body.preTradeThoughts !== undefined) {
			updateData.preTradeThoughts = body.preTradeThoughts
		}
		if (body.postTradeReflection !== undefined) {
			updateData.postTradeReflection = body.postTradeReflection
		}
		if (body.lessonLearned !== undefined) {
			updateData.lessonLearned = body.lessonLearned
		}
		if (body.disciplineNotes !== undefined) {
			updateData.disciplineNotes = body.disciplineNotes
		}
		if (body.setupRank !== undefined) {
			updateData.setupRank = body.setupRank || null
		}
		if (body.rating !== undefined) {
			updateData.rating = body.rating || null
		}
		if (body.screenshotUrl !== undefined) {
			updateData.screenshotUrl = body.screenshotUrl
		}
		if (body.screenshotS3Key !== undefined) {
			updateData.screenshotS3Key = body.screenshotS3Key
		}
		if (body.isArchived !== undefined) {
			updateData.isArchived = body.isArchived
		}

		// Always include calculated fields when we have exit data
		if (exitPrice) {
			updateData.pnl = pnl !== undefined ? toNumericString(toCents(pnl)) : null
			updateData.outcome = outcome
			updateData.realizedRMultiple = toNumericString(realizedR) ?? null
		}
		if (plannedRiskAmount !== undefined) {
			updateData.plannedRiskAmount = toNumericString(toCents(plannedRiskAmount))
		}

		// Encrypt sensitive fields if DEK is available
		if (dek) {
			const fieldsToEncrypt: Record<string, unknown> = {}
			if (updateData.pnl !== undefined) {
				fieldsToEncrypt.pnl = pnl !== undefined ? toCents(pnl) : null
			}
			if (updateData.plannedRiskAmount !== undefined) {
				fieldsToEncrypt.plannedRiskAmount =
					plannedRiskAmount !== undefined ? toCents(plannedRiskAmount) : null
			}
			if (updateData.entryPrice !== undefined) {
				fieldsToEncrypt.entryPrice = updateData.entryPrice
			}
			if (updateData.exitPrice !== undefined) {
				fieldsToEncrypt.exitPrice = updateData.exitPrice
			}
			if (updateData.positionSize !== undefined) {
				fieldsToEncrypt.positionSize = updateData.positionSize
			}
			if (updateData.stopLoss !== undefined) {
				fieldsToEncrypt.stopLoss = updateData.stopLoss
			}
			if (updateData.takeProfit !== undefined) {
				fieldsToEncrypt.takeProfit = updateData.takeProfit
			}
			if (updateData.plannedRMultiple !== undefined) {
				fieldsToEncrypt.plannedRMultiple = updateData.plannedRMultiple
			}
			if (updateData.preTradeThoughts !== undefined) {
				fieldsToEncrypt.preTradeThoughts = updateData.preTradeThoughts
			}
			if (updateData.postTradeReflection !== undefined) {
				fieldsToEncrypt.postTradeReflection = updateData.postTradeReflection
			}
			if (updateData.lessonLearned !== undefined) {
				fieldsToEncrypt.lessonLearned = updateData.lessonLearned
			}
			if (updateData.disciplineNotes !== undefined) {
				fieldsToEncrypt.disciplineNotes = updateData.disciplineNotes
			}
			Object.assign(
				updateData,
				encryptTradeFields(
					fieldsToEncrypt as Parameters<typeof encryptTradeFields>[0],
					dek
				)
			)
		}

		// Update the trade
		const [updatedTrade] = await db
			.update(trades)
			.set(updateData)
			.where(and(eq(trades.id, body.id), accountCondition))
			.returning()

		if (!updatedTrade) {
			return archError(
				"Trade not found",
				[
					{
						code: "NOT_FOUND",
						detail: "Trade does not exist or does not belong to this account",
					},
				],
				404
			)
		}

		// Apply executions ops (add/update/delete) if provided. This will
		// recompute aggregates from legs via updateTradeAggregates, overriding
		// any prior trade-field updates that came from this same request body.
		const executionsOps = body.executions as ScaledExecutionOps | undefined
		if (hasOps(executionsOps)) {
			try {
				await applyScaledExecutionOps(body.id, executionsOps ?? {}, dek ?? null)
			} catch (opsError) {
				const raw =
					opsError instanceof Error ? opsError.message : String(opsError)
				const [, code, ...detailParts] = raw.split(":")
				return archError("Invalid execution operations", [
					{
						code: code ?? "SCALED_OPS",
						detail: detailParts.join(":") || raw,
					},
				])
			}
		}

		const originalEntryDate = existing.entryDate
			? new Date(existing.entryDate)
			: null
		const newEntryDate = updatedTrade.entryDate
			? new Date(updatedTrade.entryDate)
			: null
		const tradeAccountId = updatedTrade.accountId ?? auth.accountId
		if (originalEntryDate) {
			await markTaxLedgerDirty(tradeAccountId, originalEntryDate)
		}
		if (
			newEntryDate &&
			(!originalEntryDate ||
				newEntryDate.getTime() !== originalEntryDate.getTime())
		) {
			await markTaxLedgerDirty(tradeAccountId, newEntryDate)
		}

		// Replace tag associations if tags were provided
		if (tagIds !== undefined) {
			await db.delete(tradeTags).where(eq(tradeTags.tradeId, body.id))

			if (tagIds.length) {
				await db.insert(tradeTags).values(
					tagIds.map((tagId) => ({
						tradeId: body.id,
						tagId,
					}))
				)
			}
		}

		// Fetch updated trade with relations for formatted response
		const tradeWithRelations = await db.query.trades.findFirst({
			where: eq(trades.id, body.id),
			with: {
				strategy: { columns: { name: true } },
				timeframe: { columns: { name: true } },
				tradeTags: { with: { tag: true } },
			},
		})

		if (!tradeWithRelations) {
			return archError(
				"Trade updated but could not be retrieved",
				[
					{
						code: "RETRIEVE_FAILED",
						detail: "Trade update succeeded but re-fetch failed",
					},
				],
				500
			)
		}

		return archSuccess(
			"Trade updated successfully",
			formatTradeForArch(tradeWithRelations)
		)
	} catch (error) {
		if (error instanceof z.ZodError) {
			return archError(
				"Validation failed",
				error.issues.map((issue) => ({
					code: "VALIDATION_ERROR",
					detail: `${issue.path.join(".") || "body"}: ${issue.message}`,
				}))
			)
		}

		if (error instanceof Error) {
			if (error.message === "STRATEGY_NOT_FOUND") {
				return archError(
					"Strategy not found",
					[
						{
							code: "STRATEGY_NOT_FOUND",
							detail:
								"strategyId does not exist or does not belong to this user",
						},
					],
					404
				)
			}
			if (error.message === "TIMEFRAME_NOT_FOUND") {
				return archError(
					"Timeframe not found",
					[
						{
							code: "TIMEFRAME_NOT_FOUND",
							detail: "timeframeId does not exist",
						},
					],
					404
				)
			}
			if (error.message === "TAG_NOT_FOUND") {
				return archError(
					"One or more tagIds not found",
					[
						{
							code: "TAG_NOT_FOUND",
							detail:
								"At least one tagId does not exist or does not belong to this user",
						},
					],
					404
				)
			}
		}

		// Map Postgres invalid_text_representation (e.g. enum mismatch) to 400
		const raw = String(error)
		if (raw.includes("22P02") || raw.includes("invalid input value for enum")) {
			return archError(
				"Invalid enum value",
				[
					{
						code: "INVALID_ENUM",
						detail:
							"A field was sent with a value outside the allowed enum set. Check setupRank (A|AA|AAA), rating (A|B|C|D|F), direction (long|short).",
					},
				],
				400
			)
		}

		return archError(
			"Failed to update trade",
			[{ code: "UPDATE_FAILED", detail: raw }],
			500
		)
	}
}

export { POST }
