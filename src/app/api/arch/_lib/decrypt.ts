import type { SQL } from "drizzle-orm"
import { and, asc, desc } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { trades } from "@/db/schema"
import { getUserDek, decryptTradeFields } from "@/lib/user-crypto"

interface FetchOptions {
	with?: Record<string, unknown>
	orderBy?: "asc" | "desc"
	limit?: number
}

/**
 * Fetches trades matching the given conditions, decrypts fields if DEK available.
 * Wraps the repeated pattern: query → getUserDek → decryptTradeFields map.
 *
 * @param userId - User ID for DEK lookup
 * @param conditions - Array of Drizzle SQL conditions
 * @param options - Optional query modifiers (relations, sort, limit)
 * @returns Decrypted trade records
 */
const fetchAndDecryptTrades = async (
	userId: string,
	conditions: SQL[],
	options?: FetchOptions
) => {
	const orderFn = options?.orderBy === "asc" ? asc : desc

	const rawResult = await db.query.trades.findMany({
		where: and(...conditions),
		...(options?.with && { with: options.with }),
		orderBy: [orderFn(trades.entryDate)],
		...(options?.limit && { limit: options.limit }),
	})

	const dek = await getUserDek(userId)
	if (!dek) return rawResult

	return rawResult.map((trade) => decryptTradeFields(trade, dek))
}

export { fetchAndDecryptTrades }
