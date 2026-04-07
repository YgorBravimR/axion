import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades, tradeTags } from "@/db/schema"
import { eq } from "drizzle-orm"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError, formatTradeForArch } from "../../_lib/helpers"
import {
	resolveStrategyName,
	resolveTagNames,
	resolveTimeframeName,
} from "../../_lib/resolve-names"
import { getAssetBySymbol, getBreakevenTicks } from "../../_lib/asset-lookup"
import {
	calculatePnL,
	calculateAssetPnL,
	calculateRMultiple,
	determineOutcome,
} from "@/lib/calculations"
import { fromCents, toCents, toNumericString } from "@/lib/money"
import { getUserDek, encryptTradeFields } from "@/lib/user-crypto"
import { computeTradeHash } from "@/lib/deduplication"
import { createTradeSchema } from "@/lib/validations/trade"
import type { CreateTradeInput } from "@/lib/validations/trade"
import { resolveTradeAsset } from "@/lib/asset-resolution"
import { getRegisteredAssetSymbols } from "@/app/actions/assets"

interface ArchCreateTradeBody {
	asset: string
	direction: "long" | "short"
	entryDate: string | Date | number
	entryPrice: number | string
	positionSize: number | string
	exitDate?: string | Date | number
	exitPrice?: number | string
	stopLoss?: number | string
	takeProfit?: number | string
	riskAmount?: number | string
	strategy?: string
	timeframe?: string
	tags?: string[]
	preTradeThoughts?: string
	postTradeReflection?: string
	lessonLearned?: string
	disciplineNotes?: string
	followedPlan?: boolean
	setupRank?: "A" | "AA" | "AAA" | null
	mfe?: number | string
	mae?: number | string
	contractsExecuted?: number | string
}

/**
 * POST /api/arch/trades/create
 *
 * Creates a new trade via the Arch API layer.
 * Resolves fuzzy names for strategy, timeframe, and tags.
 * Calculates P&L, outcome, and R-multiple from prices and asset config.
 * Encrypts sensitive fields if DEK is available.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) return authResult.response
	const { auth } = authResult

	try {
		const body = (await request.json()) as ArchCreateTradeBody

		// Validate required fields before fuzzy resolution
		if (
			!body.asset ||
			!body.direction ||
			!body.entryDate ||
			!body.entryPrice ||
			!body.positionSize
		) {
			return archError("Missing required fields", [
				{
					code: "MISSING_FIELDS",
					detail:
						"Required: asset, direction, entryDate, entryPrice, positionSize",
				},
			])
		}

		// Resolve fuzzy names to IDs
		const strategyId = body.strategy
			? await resolveStrategyName(body.strategy, auth.userId)
			: undefined
		const timeframeId = body.timeframe
			? await resolveTimeframeName(body.timeframe)
			: undefined
		const tagIds = body.tags?.length
			? await resolveTagNames(body.tags, auth.userId)
			: []

		// Build input matching CreateTradeInput schema
		const createInput: CreateTradeInput = {
			asset: body.asset,
			direction: body.direction,
			entryDate: body.entryDate,
			exitDate: body.exitDate,
			entryPrice: body.entryPrice,
			exitPrice: body.exitPrice,
			positionSize: body.positionSize,
			stopLoss: body.stopLoss,
			takeProfit: body.takeProfit,
			riskAmount: body.riskAmount,
			preTradeThoughts: body.preTradeThoughts,
			postTradeReflection: body.postTradeReflection,
			lessonLearned: body.lessonLearned,
			disciplineNotes: body.disciplineNotes,
			followedPlan: body.followedPlan,
			setupRank: body.setupRank,
			mfe: body.mfe,
			mae: body.mae,
			contractsExecuted: body.contractsExecuted,
			strategyId: strategyId ?? undefined,
			timeframeId: timeframeId ?? undefined,
			tagIds,
		}

		// Validate with Zod schema
		const validated = createTradeSchema.parse(createInput)
		const { tagIds: validatedTagIds, ...tradeData } = validated

		// Resolve asset symbol to canonical form (e.g., WING26 → WIN)
		const registeredSymbols = await getRegisteredAssetSymbols()
		const resolved = resolveTradeAsset(tradeData.asset, registeredSymbols)
		tradeData.asset = resolved.symbol

		// Calculate plannedRiskAmount from riskAmount or stopLoss
		let plannedRiskAmount: number | undefined
		const assetConfigForRisk = await getAssetBySymbol(tradeData.asset)

		if (tradeData.riskAmount) {
			plannedRiskAmount = tradeData.riskAmount
		} else if (tradeData.stopLoss) {
			const priceDiff = Math.abs(tradeData.entryPrice - tradeData.stopLoss)

			if (assetConfigForRisk) {
				const tickSize = parseFloat(assetConfigForRisk.tickSize)
				const tickValue = fromCents(assetConfigForRisk.tickValue)
				const ticksAtRisk = priceDiff / tickSize
				plannedRiskAmount = ticksAtRisk * tickValue * tradeData.positionSize
			} else {
				plannedRiskAmount = priceDiff * tradeData.positionSize
			}
		}

		// Calculate plannedRMultiple from TP/SL ratio
		let plannedRMultiple: number | undefined
		if (tradeData.stopLoss && tradeData.takeProfit) {
			const riskPerUnit =
				tradeData.direction === "long"
					? tradeData.entryPrice - tradeData.stopLoss
					: tradeData.stopLoss - tradeData.entryPrice
			if (riskPerUnit !== 0) {
				const rewardPerUnit =
					tradeData.direction === "long"
						? tradeData.takeProfit - tradeData.entryPrice
						: tradeData.entryPrice - tradeData.takeProfit
				plannedRMultiple = Math.abs(rewardPerUnit / riskPerUnit)
			}
		}

		// Calculate P&L if exit price exists
		let pnl: number | undefined
		let outcome: "win" | "loss" | "breakeven" | undefined
		let realizedR: number | undefined
		let ticksGained: number | null = null

		if (tradeData.exitPrice) {
			const assetConfig = await getAssetBySymbol(tradeData.asset)

			if (assetConfig) {
				const result = calculateAssetPnL({
					entryPrice: tradeData.entryPrice,
					exitPrice: tradeData.exitPrice,
					positionSize: tradeData.positionSize,
					direction: tradeData.direction,
					tickSize: parseFloat(assetConfig.tickSize),
					tickValue: fromCents(assetConfig.tickValue),
					contractsExecuted:
						tradeData.contractsExecuted ?? tradeData.positionSize * 2,
				})
				pnl = result.netPnl
				ticksGained = result.ticksGained
			} else {
				pnl = calculatePnL({
					direction: tradeData.direction,
					entryPrice: tradeData.entryPrice,
					exitPrice: tradeData.exitPrice,
					positionSize: tradeData.positionSize,
				})
			}
		}

		if (pnl !== undefined) {
			const breakevenTicks = await getBreakevenTicks(
				tradeData.asset,
				auth.accountId
			)
			outcome = determineOutcome({ pnl, ticksGained, breakevenTicks })
		}

		if (pnl !== undefined && plannedRiskAmount && plannedRiskAmount > 0) {
			realizedR = calculateRMultiple(pnl, plannedRiskAmount)
		}

		// Compute dedup hash from plaintext values before encryption
		const deduplicationHash = computeTradeHash({
			accountId: auth.accountId,
			asset: tradeData.asset.toUpperCase(),
			direction: tradeData.direction,
			entryDate: tradeData.entryDate,
			entryPrice: tradeData.entryPrice,
			exitPrice: tradeData.exitPrice,
			positionSize: tradeData.positionSize,
		})

		// Build insert values
		const insertValues: Record<string, unknown> = {
			accountId: auth.accountId,
			asset: tradeData.asset,
			direction: tradeData.direction,
			timeframeId: tradeData.timeframeId || null,
			entryDate: tradeData.entryDate,
			exitDate: tradeData.exitDate,
			entryPrice: toNumericString(tradeData.entryPrice),
			exitPrice: toNumericString(tradeData.exitPrice),
			positionSize: toNumericString(tradeData.positionSize),
			stopLoss: toNumericString(tradeData.stopLoss),
			takeProfit: toNumericString(tradeData.takeProfit),
			plannedRiskAmount:
				plannedRiskAmount !== undefined
					? toNumericString(toCents(plannedRiskAmount))
					: null,
			plannedRMultiple: toNumericString(plannedRMultiple),
			pnl: pnl !== undefined ? toNumericString(toCents(pnl)) : null,
			outcome,
			realizedRMultiple: toNumericString(realizedR),
			mfe: toNumericString(tradeData.mfe),
			mae: toNumericString(tradeData.mae),
			contractsExecuted: toNumericString(
				tradeData.contractsExecuted ?? tradeData.positionSize * 2
			),
			deduplicationHash,
			followedPlan: tradeData.followedPlan,
			strategyId: strategyId || null,
			preTradeThoughts: tradeData.preTradeThoughts,
			postTradeReflection: tradeData.postTradeReflection,
			lessonLearned: tradeData.lessonLearned,
			disciplineNotes: tradeData.disciplineNotes,
			setupRank: tradeData.setupRank || null,
			source: "arch",
		}

		// Encrypt sensitive fields if DEK is available
		const dek = await getUserDek(auth.userId)
		if (dek) {
			Object.assign(
				insertValues,
				encryptTradeFields(
					{
						pnl: pnl !== undefined ? toCents(pnl) : null,
						plannedRiskAmount:
							plannedRiskAmount !== undefined
								? toCents(plannedRiskAmount)
								: null,
						commission: undefined,
						fees: undefined,
						entryPrice: toNumericString(tradeData.entryPrice),
						exitPrice: toNumericString(tradeData.exitPrice),
						positionSize: toNumericString(tradeData.positionSize),
						stopLoss: toNumericString(tradeData.stopLoss),
						takeProfit: toNumericString(tradeData.takeProfit),
						plannedRMultiple: toNumericString(plannedRMultiple),
						preTradeThoughts: tradeData.preTradeThoughts,
						postTradeReflection: tradeData.postTradeReflection,
						lessonLearned: tradeData.lessonLearned,
						disciplineNotes: tradeData.disciplineNotes,
					},
					dek
				)
			)
		}

		// Insert the trade
		const [trade] = await db
			.insert(trades)
			.values(insertValues as typeof trades.$inferInsert)
			.returning()

		// Insert tag associations
		if (validatedTagIds?.length) {
			await db.insert(tradeTags).values(
				validatedTagIds.map((tagId) => ({
					tradeId: trade.id,
					tagId,
				}))
			)
		}

		// Fetch the created trade with relations for formatted response
		const createdTrade = await db.query.trades.findFirst({
			where: eq(trades.id, trade.id),
			with: {
				strategy: { columns: { name: true } },
				timeframe: { columns: { name: true } },
				tradeTags: { with: { tag: true } },
			},
		})

		if (!createdTrade) {
			return archError(
				"Trade created but could not be retrieved",
				[
					{
						code: "RETRIEVE_FAILED",
						detail: "Trade insertion succeeded but re-fetch failed",
					},
				],
				500
			)
		}

		return archSuccess(
			"Trade created successfully",
			formatTradeForArch(createdTrade)
		)
	} catch (error) {
		if (error instanceof Error && error.name === "ZodError") {
			return archError("Validation failed", [
				{ code: "VALIDATION_ERROR", detail: error.message },
			])
		}

		return archError(
			"Failed to create trade",
			[{ code: "CREATE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
