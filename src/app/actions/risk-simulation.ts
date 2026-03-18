"use server"

import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import type { ActionResponse } from "@/types"
import type {
	RiskSimulationParams,
	RiskSimulationResult,
	SimulationPreview,
	TradeForSimulation,
} from "@/types/risk-simulation"
import { eq, and, gte, lte, asc, isNotNull, sql } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"
import { getAssetBySymbol } from "@/app/actions/assets"
import { getAssetFees, getBreakevenTicks } from "@/app/actions/accounts"
import { fromCents } from "@/lib/money"
import { formatDateKey, BRT_OFFSET } from "@/lib/dates"
import {
	calculateAssetPnL,
	calculateRMultiple,
	determineOutcome,
} from "@/lib/calculations"
import {
	riskSimulationParamsSchema,
	dateRangeSchema,
} from "@/lib/validations/risk-simulation"
import { runSimpleSimulation } from "@/lib/risk-simulation"
import { runAdvancedSimulation } from "@/lib/risk-simulation-advanced"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getTranslations } from "next-intl/server"

// ==========================================
// PREVIEW (before running simulation)
// ==========================================

/**
 * Returns a quick preview of trades in the date range:
 * total count, how many have SL, unique assets, day count.
 */
const getSimulationPreview = async (
	dateFrom: string,
	dateTo: string
): Promise<ActionResponse<SimulationPreview>> => {
	try {
		const { accountId, userId } = await requireAuth()
		const validated = dateRangeSchema.parse({ dateFrom, dateTo })

		const startDate = new Date(`${validated.dateFrom}T00:00:00${BRT_OFFSET}`)
		const endDate = new Date(`${validated.dateTo}T23:59:59.999${BRT_OFFSET}`)

		const rawTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				eq(trades.isArchived, false),
				isNotNull(trades.exitPrice),
				gte(trades.entryDate, startDate),
				lte(trades.entryDate, endDate)
			),
			orderBy: [asc(trades.entryDate)],
		})

		// Decrypt to read stopLoss values
		const dek = await getUserDek(userId)
		const decryptedTrades = dek
			? rawTrades.map((t) => decryptTradeFields(t, dek))
			: rawTrades

		const tradesWithSl = decryptedTrades.filter(
			(t) => t.stopLoss !== null && Number(t.stopLoss) !== 0
		)

		const assets = [...new Set(decryptedTrades.map((t) => t.asset))]
		const dayKeys = new Set(decryptedTrades.map((t) => formatDateKey(t.entryDate)))

		return {
			status: "success",
			message: "Preview generated",
			data: {
				totalTrades: decryptedTrades.length,
				tradesWithSl: tradesWithSl.length,
				tradesWithoutSl: decryptedTrades.length - tradesWithSl.length,
				assets,
				dayCount: dayKeys.size,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to generate preview",
			errors: [{ code: "PREVIEW_FAILED", detail: toSafeErrorMessage(error, "getSimulationPreview") }],
		}
	}
}

// ==========================================
// RUN SIMULATION
// ==========================================

/**
 * Fetches trades from DB, decrypts, enriches with asset config, and runs simulation.
 */
const runRiskSimulationFromDb = async (
	dateFrom: string,
	dateTo: string,
	params: RiskSimulationParams
): Promise<ActionResponse<RiskSimulationResult>> => {
	const t = await getTranslations("riskSimulation")
	try {
		const { accountId, userId } = await requireAuth()
		const validatedDates = dateRangeSchema.parse({ dateFrom, dateTo })
		const validatedParams = riskSimulationParamsSchema.parse(params)

		const startDate = new Date(`${validatedDates.dateFrom}T00:00:00${BRT_OFFSET}`)
		const endDate = new Date(`${validatedDates.dateTo}T23:59:59.999${BRT_OFFSET}`)

		// Query closed trades in date range, sorted chronologically
		const rawTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				eq(trades.isArchived, false),
				isNotNull(trades.exitPrice),
				gte(trades.entryDate, startDate),
				lte(trades.entryDate, endDate)
			),
			orderBy: [asc(trades.entryDate)],
		})

		// Decrypt
		const dek = await getUserDek(userId)
		const decryptedTrades = dek
			? rawTrades.map((t) => decryptTradeFields(t, dek))
			: rawTrades

		if (decryptedTrades.length === 0) {
			return {
				status: "error",
				message: t("errors.noClosedTrades"),
				errors: [{ code: "NO_TRADES", detail: "No closed trades found" }],
			}
		}

		// Build asset config map
		const uniqueAssets = [...new Set(decryptedTrades.map((t) => t.asset))]
		const assetConfigMap = new Map<
			string,
			{
				tickSize: number
				tickValue: number
				commission: number
				fees: number
				breakevenTicks: number
			}
		>()

		for (const symbol of uniqueAssets) {
			const assetConfig = await getAssetBySymbol(symbol)
			if (assetConfig) {
				const assetFees = await getAssetFees(assetConfig.symbol, accountId)
				const breakevenTicks = await getBreakevenTicks(assetConfig.symbol, accountId)
				assetConfigMap.set(symbol, {
					tickSize: parseFloat(assetConfig.tickSize),
					tickValue: assetConfig.tickValue, // already in cents
					commission: assetFees.commission,
					fees: assetFees.fees,
					breakevenTicks,
				})
			}
		}

		// Map to TradeForSimulation[]
		const tradesForSim: TradeForSimulation[] = []

		for (const trade of decryptedTrades) {
			const entryPrice = Number(trade.entryPrice)
			const exitPrice = Number(trade.exitPrice)
			const positionSize = Number(trade.positionSize)
			const stopLoss = trade.stopLoss ? Number(trade.stopLoss) : null
			const direction = trade.direction as "long" | "short"
			const contractsExecuted = trade.contractsExecuted
				? Number(trade.contractsExecuted)
				: positionSize * 2

			if (!entryPrice || !exitPrice || !positionSize) continue

			const config = assetConfigMap.get(trade.asset.toUpperCase())
			const tickSize = config?.tickSize ?? 1
			const tickValue = config?.tickValue ?? 100
			const commission = config?.commission ?? 0
			const fees = config?.fees ?? 0
			const breakevenTicks = config?.breakevenTicks ?? 0

			// Recalculate P&L consistently
			let pnlCents: number
			let ticksGained: number | null = null

			if (config) {
				const pnlResult = calculateAssetPnL({
					entryPrice,
					exitPrice,
					positionSize,
					direction,
					tickSize,
					tickValue: fromCents(tickValue),
					commission: fromCents(commission),
					fees: fromCents(fees),
					contractsExecuted,
				})
				pnlCents = Math.round(pnlResult.netPnl * 100)
				ticksGained = pnlResult.ticksGained
			} else {
				const priceDiff = direction === "long" ? exitPrice - entryPrice : entryPrice - exitPrice
				pnlCents = Math.round(priceDiff * positionSize * 100)
			}

			const outcome = determineOutcome({ pnl: pnlCents / 100, ticksGained, breakevenTicks })

			// Calculate R-multiple from SL
			let rMultiple: number | null = null
			if (stopLoss) {
				const slDiff = Math.abs(entryPrice - stopLoss)
				let riskAmount: number
				if (config) {
					const ticksAtRisk = slDiff / tickSize
					riskAmount = ticksAtRisk * fromCents(tickValue) * positionSize
				} else {
					riskAmount = slDiff * positionSize
				}
				if (riskAmount > 0) {
					rMultiple = calculateRMultiple(pnlCents / 100, riskAmount)
				}
			}

			tradesForSim.push({
				id: trade.id,
				entryDate: trade.entryDate,
				exitDate: trade.exitDate,
				asset: trade.asset,
				direction,
				entryPrice,
				exitPrice,
				stopLoss,
				positionSize,
				pnlCents,
				outcome,
				rMultiple,
				tickSize,
				tickValue, // cents per tick
				commissionPerExecution: commission,
				feesPerExecution: fees,
				contractsExecuted,
			})
		}

		if (tradesForSim.length === 0) {
			return {
				status: "error",
				message: t("errors.noValidTrades"),
				errors: [{ code: "NO_VALID_TRADES", detail: "No trades with valid price data found" }],
			}
		}

		// Run the appropriate engine
		const result = validatedParams.mode === "simple"
			? runSimpleSimulation(tradesForSim, validatedParams)
			: runAdvancedSimulation(tradesForSim, validatedParams)

		return {
			status: "success",
			message: "Simulation completed",
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to run simulation",
			errors: [{ code: "SIMULATION_FAILED", detail: toSafeErrorMessage(error, "runRiskSimulationFromDb") }],
		}
	}
}

// ==========================================
// TRADE YEARS (for quick date filters)
// ==========================================

/**
 * Returns sorted list of distinct years that have closed trades.
 */
const getTradeYears = async (): Promise<ActionResponse<number[]>> => {
	try {
		const { accountId } = await requireAuth()

		const rows = await db
			.selectDistinct({
				year: sql<number>`extract(year from ${trades.entryDate})::int`,
			})
			.from(trades)
			.where(
				and(
					eq(trades.accountId, accountId),
					eq(trades.isArchived, false),
					isNotNull(trades.exitPrice)
				)
			)
			.orderBy(sql`1 desc`)

		return {
			status: "success",
			message: "Trade years retrieved",
			data: rows.map((r) => r.year),
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to get trade years",
			errors: [{ code: "YEARS_FAILED", detail: toSafeErrorMessage(error, "getTradeYears") }],
		}
	}
}

export { getSimulationPreview, runRiskSimulationFromDb, getTradeYears }
