import { db } from "@/db/drizzle"
import { trades, tradeTags } from "@/db/schema"
import { eq } from "drizzle-orm"
import {
	resolveStrategyName,
	resolveTagNames,
	resolveTimeframeName,
} from "./resolve-names"
import { getAssetBySymbol, getBreakevenTicks } from "./asset-lookup"
import {
	calculatePnL,
	calculateAssetPnL,
	calculateRMultiple,
	determineOutcome,
} from "@/lib/calculations"
import { fromCents, toCents, toNumericString } from "@/lib/money"
import { getUserDek, encryptTradeFields } from "@/lib/user-crypto"
import { computeTradeHash } from "@/lib/deduplication"
import { markTaxLedgerDirty } from "@/lib/tax/mark-dirty"
import { createTradeSchema } from "@/lib/validations/trade"
import type { CreateTradeInput } from "@/lib/validations/trade"
import { resolveTradeAsset } from "@/lib/asset-resolution"
import { getRegisteredAssetSymbols } from "@/app/actions/assets"
import {
	validateScaledExecutions,
	persistScaledExecutions,
} from "./scaled-create"
import type {
	ScaledExecutionInput,
	ValidatedScaledExecutions,
} from "./scaled-create"
import type { ArchAuthContext } from "./auth"
import { formatTradeForArch } from "./helpers"
import type { FormattedTrade } from "./helpers"

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
	rating?: "A" | "B" | "C" | "D" | "F" | null
	screenshotUrl?: string | null
	screenshotS3Key?: string | null
	mfe?: number | string
	mae?: number | string
	contractsExecuted?: number | string
	executions?: ScaledExecutionInput[]
}

type CreateArchTradeOutcome =
	| { ok: true; trade: FormattedTrade }
	| { ok: false; code: string; detail: string; status?: number }

const createArchTrade = async (
	body: ArchCreateTradeBody,
	auth: ArchAuthContext
): Promise<CreateArchTradeOutcome> => {
	const isScaled = Array.isArray(body.executions) && body.executions.length > 0

	let scaled: ValidatedScaledExecutions | null = null
	if (isScaled) {
		try {
			scaled = validateScaledExecutions(body.executions ?? [])
		} catch (validationError) {
			const raw =
				validationError instanceof Error
					? validationError.message
					: String(validationError)
			const [, code, ...detailParts] = raw.split(":")
			return {
				ok: false,
				code: code ?? "SCALED_VALIDATION",
				detail: detailParts.join(":") || raw,
			}
		}

		const firstEntry = scaled.legs.find((leg) => leg.executionType === "entry")
		if (firstEntry) {
			body.entryDate = body.entryDate ?? scaled.earliestEntryDate.toISOString()
			body.entryPrice = body.entryPrice ?? firstEntry.price
			body.positionSize = body.positionSize ?? scaled.entryQty
		}
	}

	if (
		!body.asset ||
		!body.direction ||
		!body.entryDate ||
		body.entryPrice === undefined ||
		body.entryPrice === null ||
		body.entryPrice === "" ||
		body.positionSize === undefined ||
		body.positionSize === null ||
		body.positionSize === ""
	) {
		return {
			ok: false,
			code: "MISSING_FIELDS",
			detail:
				"Required: asset, direction, entryDate, entryPrice, positionSize (or executions[] for scaled mode)",
		}
	}

	const strategyId = body.strategy
		? await resolveStrategyName(body.strategy, auth.userId)
		: undefined
	const timeframeId = body.timeframe
		? await resolveTimeframeName(body.timeframe)
		: undefined
	const tagIds = body.tags?.length
		? await resolveTagNames(body.tags, auth.userId)
		: []

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

	let validated: ReturnType<typeof createTradeSchema.parse>
	try {
		validated = createTradeSchema.parse(createInput)
	} catch (error) {
		if (error instanceof Error && error.name === "ZodError") {
			return { ok: false, code: "VALIDATION_ERROR", detail: error.message }
		}
		throw error
	}
	const { tagIds: validatedTagIds, ...tradeData } = validated

	const registeredSymbols = await getRegisteredAssetSymbols()
	const resolved = resolveTradeAsset(tradeData.asset, registeredSymbols)
	tradeData.asset = resolved.symbol

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

	const deduplicationHash = computeTradeHash({
		accountId: auth.accountId,
		asset: tradeData.asset.toUpperCase(),
		direction: tradeData.direction,
		entryDate: tradeData.entryDate,
		entryPrice: tradeData.entryPrice,
		exitPrice: tradeData.exitPrice,
		positionSize: tradeData.positionSize,
	})

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
		rating: body.rating ?? null,
		screenshotUrl: body.screenshotUrl ?? null,
		screenshotS3Key: body.screenshotS3Key ?? null,
		source: "arch",
		executionMode: isScaled ? "scaled" : "simple",
	}

	const dek = await getUserDek(auth.userId)
	if (dek) {
		Object.assign(
			insertValues,
			encryptTradeFields(
				{
					pnl: pnl !== undefined ? toCents(pnl) : null,
					plannedRiskAmount:
						plannedRiskAmount !== undefined ? toCents(plannedRiskAmount) : null,
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

	const [trade] = await db
		.insert(trades)
		.values(insertValues as typeof trades.$inferInsert)
		.returning()

	if (!trade) {
		return {
			ok: false,
			code: "CREATE_FAILED",
			detail: "Insert returned no row",
			status: 500,
		}
	}

	if (isScaled && scaled) {
		await persistScaledExecutions(trade.id, scaled.legs, dek)
	}

	if (validatedTagIds?.length) {
		await db.insert(tradeTags).values(
			validatedTagIds.map((tagId) => ({
				tradeId: trade.id,
				tagId,
			}))
		)
	}

	await markTaxLedgerDirty(auth.accountId, new Date(tradeData.entryDate))

	const createdTrade = await db.query.trades.findFirst({
		where: eq(trades.id, trade.id),
		with: {
			strategy: { columns: { name: true } },
			timeframe: { columns: { name: true } },
			tradeTags: { with: { tag: true } },
		},
	})

	if (!createdTrade) {
		return {
			ok: false,
			code: "RETRIEVE_FAILED",
			detail: "Trade insertion succeeded but re-fetch failed",
			status: 500,
		}
	}

	return { ok: true, trade: formatTradeForArch(createdTrade) }
}

export { createArchTrade }
export type { ArchCreateTradeBody, CreateArchTradeOutcome }
