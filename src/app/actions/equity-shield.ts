"use server"

import { getTranslations } from "next-intl/server"
import { db } from "@/db/drizzle"
import { trades, tradeHawksMetadata } from "@/db/schema"
import { eq, and, asc, gte, lte, isNotNull } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { BRT_OFFSET } from "@/lib/dates"
import { runEquityShield } from "@/lib/equity-shield"
import { resolveDay } from "@/lib/fractal-plan/resolver"
import {
	runGovernorSweep,
	type SweepTrade,
	type SweepResult,
} from "@/lib/hawks/governor-sweep"
import { dateRangeSchema } from "@/lib/validations/risk-simulation"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"
import type {
	EquityShieldParams,
	EquityShieldResult,
	TradeForShield,
} from "@/types/equity-shield"

/**
 * Fetch closed trades within a date range and run the Equity Shield analysis.
 *
 * @param params - Equity Shield computation parameters
 * @param dateFrom - Start date in YYYY-MM-DD format
 * @param dateTo - End date in YYYY-MM-DD format
 */
export const runEquityShieldFromDb = async (
	params: EquityShieldParams,
	dateFrom: string,
	dateTo: string
): Promise<ActionResponse<EquityShieldResult>> => {
	const t = await getTranslations("equityShield.errors")
	try {
		const { accountId } = await requireAuth()
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

		const decryptedTrades = rawTrades

		if (decryptedTrades.length === 0) {
			return {
				status: "error",
				message: t("noTradesInRange"),
				errors: [{ code: "NO_TRADES", detail: "No closed trades found" }],
			}
		}

		const tradesForShield: TradeForShield[] = decryptedTrades.map((trade) => ({
			id: trade.id,
			entryDate: trade.entryDate,
			exitDate: trade.exitDate,
			pnlCents:
				typeof trade.pnl === "string"
					? parseInt(trade.pnl, 10)
					: (trade.pnl ?? 0),
			outcome: trade.outcome as "win" | "loss" | "breakeven" | null,
			asset: trade.asset,
		}))

		const result = runEquityShield(tradesForShield, params)

		return {
			status: "success",
			message: "Equity Shield analysis complete",
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("runFailed"),
			errors: [
				{
					code: "SHIELD_FAILED",
					detail: toSafeErrorMessage(error, "runEquityShieldFromDb"),
				},
			],
		}
	}
}

/**
 * Run the Hawks daily-governor FLOOR SWEEP over real logged trades.
 *
 * This is the "governor" mode of Equity Shield — a distinct risk analysis from
 * the DD-floor methods. It loads each closed Hawks trade's realized R and
 * trading day, then sweeps candidate floors to show what each would have done to
 * total R / expectancy / drawdown / red-days. The trader picks the floor the
 * data rewards. See docs/plans/hawks-governor-backtest-validation.md.
 *
 * The daily target comes from the fractal cascade (resolveDay) so the sweep
 * uses the same Phase B boundary the live governor uses.
 */
export const runGovernorSweepFromDb = async (
	dateFrom: string,
	dateTo: string,
	floors?: number[]
): Promise<ActionResponse<SweepResult>> => {
	const t = await getTranslations("equityShield.errors")
	try {
		const { accountId } = await requireAuth()
		const validated = dateRangeSchema.parse({ dateFrom, dateTo })

		const startDate = new Date(`${validated.dateFrom}T00:00:00${BRT_OFFSET}`)
		const endDate = new Date(`${validated.dateTo}T23:59:59.999${BRT_OFFSET}`)

		// Daily target from the cascade (same source as the live governor).
		const day = await resolveDay(accountId, startDate)
		const dailyTargetR = day ? Number(day.dailyTargetR.value) : 0
		if (!Number.isFinite(dailyTargetR) || dailyTargetR <= 0) {
			return {
				status: "error",
				message: t("runFailed"),
				errors: [
					{ code: "NO_TARGET", detail: "No positive daily target resolved" },
				],
			}
		}

		// Load closed trades with realized R + Hawks trading day.
		const rows = await db
			.select({
				rOutcome: trades.rOutcome,
				outcome: trades.outcome,
				tradingDay: tradeHawksMetadata.tradingDay,
			})
			.from(tradeHawksMetadata)
			.innerJoin(trades, eq(trades.id, tradeHawksMetadata.tradeId))
			.where(
				and(
					eq(trades.accountId, accountId),
					eq(trades.isArchived, false),
					isNotNull(trades.exitDate),
					isNotNull(trades.rOutcome),
					gte(trades.entryDate, startDate),
					lte(trades.entryDate, endDate)
				)
			)
			.orderBy(asc(trades.entryDate))

		if (rows.length === 0) {
			return {
				status: "error",
				message: t("noTradesInRange"),
				errors: [{ code: "NO_TRADES", detail: "No closed Hawks trades found" }],
			}
		}

		const sweepTrades: SweepTrade[] = rows.map((row) => ({
			rOutcome: Number(row.rOutcome ?? 0),
			outcome: row.outcome as SweepTrade["outcome"],
			tradingDay: row.tradingDay,
		}))

		const result = runGovernorSweep({
			trades: sweepTrades,
			dailyTargetR,
			floors,
		})

		return {
			status: "success",
			message: "Governor sweep complete",
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: t("runFailed"),
			errors: [
				{
					code: "SWEEP_FAILED",
					detail: toSafeErrorMessage(error, "runGovernorSweepFromDb"),
				},
			],
		}
	}
}

/**
 * Get a quick count of closed trades within a date range.
 * Used to show the user how many trades will be analyzed before running.
 */
export const getEquityShieldPreview = async (
	dateFrom: string,
	dateTo: string
): Promise<
	ActionResponse<{ totalTrades: number; hasEnoughTrades: boolean }>
> => {
	const t = await getTranslations("equityShield.errors")
	try {
		const { accountId } = await requireAuth()
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
			columns: { id: true },
		})

		const totalTrades = rawTrades.length
		const hasEnoughTrades = totalTrades >= 20

		return {
			status: "success",
			message: "Preview ready",
			data: { totalTrades, hasEnoughTrades },
		}
	} catch (error) {
		return {
			status: "error",
			message: t("previewFailed"),
			errors: [
				{
					code: "PREVIEW_FAILED",
					detail: toSafeErrorMessage(error, "getEquityShieldPreview"),
				},
			],
		}
	}
}
