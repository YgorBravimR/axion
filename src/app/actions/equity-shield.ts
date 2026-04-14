"use server"

import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { eq, and, asc, isNotNull } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"
import { fromCents } from "@/lib/money"
import { runEquityShield } from "@/lib/equity-shield"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"
import type { EquityShieldParams, EquityShieldResult, TradeForShield } from "@/types/equity-shield"

/**
 * Fetch all closed trades for the current account and run the Equity Shield analysis.
 * Optionally slices the trade array to a user-selected range before computing.
 *
 * @param fromTrade - 1-based start index (default: 1)
 * @param toTrade - 1-based end index inclusive (default: 0 = all trades)
 */
const runEquityShieldFromDb = async (
	params: EquityShieldParams,
	fromTrade: number = 1,
	toTrade: number = 0
): Promise<ActionResponse<EquityShieldResult>> => {
	try {
		const { accountId, userId } = await requireAuth()

		const rawTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				eq(trades.isArchived, false),
				isNotNull(trades.exitPrice)
			),
			orderBy: [asc(trades.entryDate)],
		})

		const dek = await getUserDek(userId)
		const decryptedTrades = dek
			? rawTrades.map((t) => decryptTradeFields(t, dek))
			: rawTrades

		if (decryptedTrades.length === 0) {
			return {
				status: "error",
				message: "No closed trades found for this account",
				errors: [{ code: "NO_TRADES", detail: "No closed trades found" }],
			}
		}

		// Map to TradeForShield — lightweight, only needs P&L
		const tradesForShield: TradeForShield[] = decryptedTrades.map((trade) => ({
			id: trade.id,
			entryDate: trade.entryDate,
			exitDate: trade.exitDate,
			pnlCents: typeof trade.pnl === "string" ? parseInt(trade.pnl, 10) : (trade.pnl ?? 0),
			outcome: trade.outcome as "win" | "loss" | "breakeven" | null,
			asset: trade.asset,
		}))

		// Slice to user-selected range (1-based, inclusive)
		const rangeEnd = toTrade > 0 ? toTrade : tradesForShield.length
		const selectedTrades = tradesForShield.slice(
			Math.max(0, fromTrade - 1),
			rangeEnd
		)

		if (selectedTrades.length === 0) {
			return {
				status: "error",
				message: "No trades in the selected range",
				errors: [{ code: "EMPTY_RANGE", detail: "Selected range contains no trades" }],
			}
		}

		const result = runEquityShield(selectedTrades, params)

		return {
			status: "success",
			message: "Equity Shield analysis complete",
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to run Equity Shield analysis",
			errors: [{ code: "SHIELD_FAILED", detail: toSafeErrorMessage(error, "runEquityShieldFromDb") }],
		}
	}
}

/**
 * Get a quick count of closed trades for the current account.
 * Used to show the user how many trades will be analyzed.
 */
const getEquityShieldPreview = async (): Promise<
	ActionResponse<{ totalTrades: number; hasEnoughTrades: boolean }>
> => {
	try {
		const { accountId, userId } = await requireAuth()

		const rawTrades = await db.query.trades.findMany({
			where: and(
				eq(trades.accountId, accountId),
				eq(trades.isArchived, false),
				isNotNull(trades.exitPrice)
			),
			columns: { id: true, pnl: true },
		})

		const totalTrades = rawTrades.length
		// Mentor recommends 400-500 backtest samples, but 100 is minimum
		const hasEnoughTrades = totalTrades >= 20

		return {
			status: "success",
			message: "Preview ready",
			data: { totalTrades, hasEnoughTrades },
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to get preview",
			errors: [{ code: "PREVIEW_FAILED", detail: toSafeErrorMessage(error, "getEquityShieldPreview") }],
		}
	}
}

export { runEquityShieldFromDb, getEquityShieldPreview }
