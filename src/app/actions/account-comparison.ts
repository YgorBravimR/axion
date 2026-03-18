"use server"

import { db } from "@/db/drizzle"
import { trades, tradingAccounts } from "@/db/schema"
import { eq, and, gte, lte, inArray } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { requireRole } from "@/lib/auth-utils"
import { getUserDek, decryptTradeFields, decryptAccountFields } from "@/lib/user-crypto"
import { fromCents } from "@/lib/money"
import {
	computeOverallStats,
	computeExpectedValue,
	computeEquityCurve,
	computeMaxDrawdown,
	computeAvgRiskPerTrade,
} from "@/lib/analytics-helpers"
import type {
	ActionResponse,
	AccountComparisonData,
	AccountComparisonMetrics,
	TradeFilters,
} from "@/types"

/**
 * Fetch comparison data for multiple accounts in a single query.
 *
 * Why a dedicated action instead of calling existing analytics N times:
 * - Single DB query with inArray is far more efficient than N separate queries
 * - Single getUserDek() call (encryption is per-user, not per-account)
 * - Avoids N auth round-trips
 * - Groups trades by accountId in application code
 */
const getAccountComparisonData = async (
	accountIds: string[],
	filters?: TradeFilters
): Promise<ActionResponse<AccountComparisonData>> => {
	try {
		// Auth + admin check
		const authContext = await requireAuth()
		await requireRole("admin")

		if (accountIds.length < 2) {
			return {
				status: "error",
				message: "At least 2 accounts required for comparison",
				errors: [{ code: "INVALID_INPUT", detail: "Select at least 2 accounts" }],
			}
		}

		// Verify all accounts belong to this user
		const userAccounts = await db.query.tradingAccounts.findMany({
			where: and(
				eq(tradingAccounts.userId, authContext.userId),
				inArray(tradingAccounts.id, accountIds)
			),
		})

		if (userAccounts.length !== accountIds.length) {
			return {
				status: "error",
				message: "One or more accounts not found",
				errors: [{ code: "ACCOUNT_NOT_FOUND", detail: "Invalid account IDs" }],
			}
		}

		// Decrypt account fields for config display
		const dek = await getUserDek(authContext.userId)
		const decryptedAccounts = dek
			? userAccounts.map((a) =>
					decryptAccountFields(
						a as unknown as Record<string, unknown>,
						dek
					) as unknown as typeof a
				)
			: userAccounts

		// Single query: all trades across selected accounts
		const conditions = [
			inArray(trades.accountId, accountIds),
			eq(trades.isArchived, false),
		]

		if (filters?.dateFrom) {
			conditions.push(gte(trades.entryDate, filters.dateFrom))
		}
		if (filters?.dateTo) {
			conditions.push(lte(trades.entryDate, filters.dateTo))
		}

		const rawTrades = await db.query.trades.findMany({
			where: and(...conditions),
		})

		// Decrypt all trades at once (single DEK)
		const decryptedTrades = dek
			? rawTrades.map((t) => decryptTradeFields(t, dek))
			: rawTrades

		// Group trades by accountId
		const tradesByAccount = new Map<string, typeof decryptedTrades>()
		for (const accountId of accountIds) {
			tradesByAccount.set(accountId, [])
		}
		for (const trade of decryptedTrades) {
			if (!trade.accountId) continue
			const group = tradesByAccount.get(trade.accountId)
			if (group) {
				group.push(trade)
			}
		}

		// Compute metrics per account
		const accounts: AccountComparisonMetrics[] = []

		for (const account of decryptedAccounts) {
			const accountTrades = tradesByAccount.get(account.id) ?? []

			const stats = computeOverallStats(accountTrades)
			const expectedValue = computeExpectedValue(accountTrades)
			const equityCurve = computeEquityCurve(accountTrades)
			const { maxDrawdown, maxDrawdownPercent } =
				computeMaxDrawdown(equityCurve)
			const avgRiskPerTrade = computeAvgRiskPerTrade(accountTrades)

			accounts.push({
				accountId: account.id,
				accountName: account.name,
				accountType: account.accountType,
				config: {
					defaultCommission: fromCents(account.defaultCommission),
					defaultFees: fromCents(account.defaultFees),
					defaultRiskPerTrade: account.defaultRiskPerTrade
						? Number(account.defaultRiskPerTrade)
						: null,
				},
				stats,
				expectedValue,
				equityCurve,
				maxDrawdown,
				maxDrawdownPercent,
				avgRiskPerTrade,
			})
		}

		return {
			status: "success",
			message: "Comparison data retrieved",
			data: { accounts },
		}
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Failed to retrieve comparison data"
		return {
			status: "error",
			message,
			errors: [{ code: "FETCH_FAILED", detail: message }],
		}
	}
}

export { getAccountComparisonData }
