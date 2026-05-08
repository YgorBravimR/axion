import type { NextRequest } from "next/server"
import { db } from "@/db/drizzle"
import { trades as tradesTable } from "@/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { archAuth } from "../../../_lib/auth"
import { archSuccess, archError } from "../../../_lib/helpers"
import { ARCH_PREVIEW_CACHE } from "../route"
import { encryptField } from "@/lib/crypto"
import { getUserDek } from "@/lib/user-crypto"
import { toNumericString } from "@/lib/money"
import { computeTradeHash } from "@/lib/deduplication"
import { markTaxLedgerDirty } from "@/lib/tax/mark-dirty"
import type { GroupedTrade } from "@/lib/csv-parsers"

interface ConfirmBody {
	importId: string
	accountId?: string
}

const requireNumericString = (
	value: number | string | null | undefined
): string => {
	const result = toNumericString(value)
	if (result === null) {
		throw new Error("Required numeric value is null")
	}
	return result
}

const encryptRequired = (value: string, dek: string): string => {
	const result = encryptField(value, dek)
	if (result === null) {
		throw new Error("Encryption produced null for non-null input")
	}
	return result
}

/**
 * POST /api/arch/imports/csv/confirm
 *
 * Commits a previously-previewed broker CSV import to the database.
 * Skips trades whose deduplicationHash already exists for the account.
 * Marks the monthly tax ledger dirty for every distinct trade month.
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		const body = (await request.json()) as ConfirmBody
		if (!body.importId) {
			return archError("Missing required field: importId", [
				{ code: "MISSING_FIELDS", detail: "Required: importId" },
			])
		}

		const cached = ARCH_PREVIEW_CACHE.get(body.importId)
		if (!cached) {
			return archError(
				"Import preview expired or not found",
				[
					{
						code: "PREVIEW_NOT_FOUND",
						detail: "Re-run /api/arch/imports/csv to obtain a fresh importId",
					},
				],
				404
			)
		}

		if (cached.userId !== auth.userId) {
			return archError(
				"Import preview belongs to a different user",
				[{ code: "FORBIDDEN", detail: "Preview ownership mismatch" }],
				403
			)
		}

		const accountId = body.accountId ?? cached.accountId
		const accountAllowed = auth.showAllAccounts
			? auth.allAccountIds.includes(accountId)
			: accountId === auth.accountId
		if (!accountAllowed) {
			return archError(
				"Account not accessible",
				[
					{
						code: "FORBIDDEN_ACCOUNT",
						detail: "accountId is not owned by the authenticated user",
					},
				],
				403
			)
		}

		const dek = await getUserDek(auth.userId)
		const previewTrades = cached.preview.trades as GroupedTrade[]

		// Build candidate inserts with dedup hashes.
		type TradeInsert = typeof tradesTable.$inferInsert
		const candidates: { insert: TradeInsert; entryDate: Date; hash: string }[] =
			[]

		for (const trade of previewTrades) {
			const entryDate = trade.entryGroup.firstExecutionTime
			const exitDate = trade.exitGroup
				? trade.exitGroup.firstExecutionTime
				: null
			const entryPriceStr = requireNumericString(trade.entryPrice)
			const positionSizeStr = requireNumericString(trade.entryQuantity)

			const hash = computeTradeHash({
				accountId,
				asset: trade.asset.toUpperCase(),
				direction: trade.direction,
				entryDate,
				entryPrice: trade.entryPrice,
				exitPrice: trade.exitPrice ?? undefined,
				positionSize: trade.entryQuantity,
			})

			const insert: TradeInsert = {
				accountId,
				asset: trade.asset,
				direction: trade.direction,
				entryDate,
				exitDate,
				entryPrice: dek ? encryptRequired(entryPriceStr, dek) : entryPriceStr,
				exitPrice: trade.exitPrice
					? dek
						? encryptRequired(requireNumericString(trade.exitPrice), dek)
						: requireNumericString(trade.exitPrice)
					: null,
				positionSize: dek
					? encryptRequired(positionSizeStr, dek)
					: positionSizeStr,
				pnl: trade.netPnl
					? dek
						? encryptRequired(requireNumericString(trade.netPnl), dek)
						: requireNumericString(trade.netPnl)
					: null,
				stopLoss: null,
				takeProfit: null,
				mfe: null,
				mae: null,
				preTradeThoughts: `imports.importedFrom|${cached.preview.brokerName}`,
				postTradeReflection: trade.warnings.join("; "),
				followedPlan: true,
				plannedRiskAmount: null,
				plannedRMultiple: null,
				isArchived: false,
				source: "csv",
				deduplicationHash: hash,
			}

			candidates.push({ insert, entryDate, hash })
		}

		// Filter out trades whose hash is already present for this account.
		const incomingHashes = candidates.map((row) => row.hash)
		let existingHashes = new Set<string>()
		if (incomingHashes.length) {
			const existing = await db
				.select({ deduplicationHash: tradesTable.deduplicationHash })
				.from(tradesTable)
				.where(
					and(
						eq(tradesTable.accountId, accountId),
						inArray(tradesTable.deduplicationHash, incomingHashes)
					)
				)
			existingHashes = new Set(
				existing
					.map((row) => row.deduplicationHash)
					.filter((value): value is string => Boolean(value))
			)
		}

		const toInsert = candidates.filter(
			(candidate) => !existingHashes.has(candidate.hash)
		)
		const skipped = candidates.length - toInsert.length

		let insertedCount = 0
		if (toInsert.length) {
			await db.insert(tradesTable).values(toInsert.map((row) => row.insert))
			insertedCount = toInsert.length

			// Mark tax ledger dirty for every unique month touched (idempotent, run in parallel).
			const monthlyDates = new Map<string, Date>()
			for (const row of toInsert) {
				const key = `${row.entryDate.getUTCFullYear()}-${row.entryDate.getUTCMonth()}`
				if (!monthlyDates.has(key)) {
					monthlyDates.set(key, row.entryDate)
				}
			}
			await Promise.all(
				Array.from(monthlyDates.values()).map((date) =>
					markTaxLedgerDirty(accountId, date)
				)
			)
		}

		ARCH_PREVIEW_CACHE.delete(body.importId)

		return archSuccess("CSV import committed", {
			importId: body.importId,
			imported: insertedCount,
			skipped,
			brokerName: cached.preview.brokerName,
		})
	} catch (error) {
		return archError(
			"Failed to confirm CSV import",
			[{ code: "CONFIRM_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST }
