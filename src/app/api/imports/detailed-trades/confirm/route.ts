/**
 * POST /api/imports/detailed-trades/confirm
 * Confirm import and commit trades to database
 * Uses cached preview from previous /api/imports/detailed-trades call
 */

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { db } from "@/db/drizzle"
import { trades as tradesTable } from "@/db/schema"
import { previewCache } from "../route"
import { toNumericString } from "@/lib/money"
import type { GroupedTrade } from "@/lib/csv-parsers"

/**
 * Converts a numeric value to string, throwing if null.
 * Used for required DB fields where the parser guarantees a value.
 */
const requireNumericString = (
	value: number | string | null | undefined
): string => {
	const result = toNumericString(value)
	if (result === null) {
		throw new Error("Required numeric value is null")
	}
	return result
}

export const POST = async (req: NextRequest) => {
	try {
		// Authenticate using NextAuth
		const session = await auth()
		if (!session?.user?.id) {
			return NextResponse.json(
				{ error: "api.errors.unauthorized" },
				{ status: 401 }
			)
		}
		const userId = session.user.id

		// Parse request
		const body = await req.json()
		const { importId, accountId }: { importId: string; accountId: string } =
			body

		if (!importId || !accountId) {
			return NextResponse.json(
				{ error: "api.errors.missingFields" },
				{ status: 400 }
			)
		}

		// Retrieve cached preview
		const cached = previewCache.get(importId)
		if (!cached) {
			return NextResponse.json(
				{ error: "imports.errors.previewExpired", importId },
				{ status: 404 }
			)
		}

		// Verify preview belongs to correct account
		if (cached.accountId !== accountId) {
			return NextResponse.json(
				{ error: "api.errors.forbidden" },
				{ status: 403 }
			)
		}

		const { preview } = cached

		// Convert trades to database format (plaintext)
		type TradeInsert = typeof tradesTable.$inferInsert
		const tradesToInsert: TradeInsert[] = preview.trades.map(
			(trade: GroupedTrade) => {
				// Use the already-correct Date objects from the parser (constructed with BRT offset)
				const entryDate = trade.entryGroup.firstExecutionTime
				const exitDate = trade.exitGroup
					? trade.exitGroup.firstExecutionTime
					: null

				const entryPriceStr = requireNumericString(trade.entryPrice)
				const positionSizeStr = requireNumericString(trade.entryQuantity)

				return {
					accountId,
					asset: trade.asset,
					direction: trade.direction,
					entryDate,
					exitDate,
					entryPrice: entryPriceStr,
					exitPrice: trade.exitPrice
						? requireNumericString(trade.exitPrice)
						: null,
					positionSize: positionSizeStr,
					pnl: trade.netPnl ? requireNumericString(trade.netPnl) : null,
					stopLoss: null,
					takeProfit: null,
					mfe: null,
					mae: null,
					preTradeThoughts: `imports.importedFrom|${preview.brokerName}`,
					postTradeReflection: trade.warnings.join("; "),
					followedPlan: true,
					plannedRiskAmount: null,
					plannedRMultiple: null,
					isArchived: false,
					importedAt: new Date(),
					importSource: `${preview.brokerName}_DETAILED_CSV`,
					source: "csv",
					isEncrypted: false,
				}
			}
		)

		// Insert trades
		let insertedCount = 0
		if (tradesToInsert.length > 0) {
			await db.insert(tradesTable).values(tradesToInsert)
			insertedCount = tradesToInsert.length
		}

		// TODO: Log import to importLogs table once it exists in schema
		// This would track import history for auditing and rate limiting persistence
		// const importLog = await db.insert(importLogs).values({
		//   id: uuid(),
		//   accountId,
		//   source: `${preview.brokerName}_DETAILED_CSV`,
		//   importedCount: insertedCount,
		//   failedCount: 0,
		//   status: "success",
		//   details: {...}
		// })

		// Clear cache
		previewCache.delete(importId)

		return NextResponse.json({
			success: true,
			importId,
			importedTradesCount: insertedCount,
			message: "imports.success.imported",
		})
	} catch (error) {
		console.error("[POST /api/imports/detailed-trades/confirm]", error)

		const message =
			error instanceof Error ? error.message : "imports.errors.confirmFailed"

		return NextResponse.json(
			{ error: "imports.errors.confirmFailed", message },
			{ status: 500 }
		)
	}
}
