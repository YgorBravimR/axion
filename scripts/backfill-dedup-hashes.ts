/**
 * One-time backfill script: compute deduplication hashes for existing trades.
 *
 * This is required so that future CSV imports can detect duplicates against
 * historical trades that were imported before the dedup feature existed.
 *
 * Usage: npx tsx scripts/backfill-dedup-hashes.ts
 *
 * The script:
 * 1. Fetches all trades without a dedup hash
 * 2. Decrypts price fields (needed for hash computation)
 * 3. Computes SHA-256 hash from plaintext values
 * 4. Updates the row with the hash
 *
 * Safe to run multiple times — only processes rows with NULL dedup hash.
 */

import { config } from "dotenv"
config({ path: ".env" })

import { db } from "../src/db/drizzle"
import { trades, users } from "../src/db/schema"
import { eq, isNull } from "drizzle-orm"
import { computeTradeHash } from "../src/lib/deduplication"
import { decryptDek, decryptField } from "../src/lib/crypto"

const BATCH_SIZE = 100

const run = async () => {
	console.log("Starting dedup hash backfill...")

	// Get all trades without a dedup hash
	const unhashed = await db.query.trades.findMany({
		where: isNull(trades.deduplicationHash),
		columns: {
			id: true,
			accountId: true,
			asset: true,
			direction: true,
			entryDate: true,
			entryPrice: true,
			exitPrice: true,
			positionSize: true,
		},
	})

	console.log(`Found ${unhashed.length} trades without dedup hash`)

	if (unhashed.length === 0) {
		console.log("Nothing to backfill. All trades already have hashes.")
		process.exit(0)
	}

	// Build a map of accountId → userId → DEK for decryption
	const accountUserMap = new Map<string, string>()
	const dekCache = new Map<string, string | null>()

	// Get all trading accounts to find their userId
	const allAccounts = await db.query.tradingAccounts.findMany({
		columns: { id: true, userId: true },
	})
	for (const account of allAccounts) {
		accountUserMap.set(account.id, account.userId)
	}

	// Helper to get DEK for a user
	const getDekForUser = async (userId: string): Promise<string | null> => {
		if (dekCache.has(userId)) {
			return dekCache.get(userId)!
		}

		const user = await db.query.users.findFirst({
			where: eq(users.id, userId),
			columns: { encryptedDek: true },
		})

		if (!user?.encryptedDek) {
			dekCache.set(userId, null)
			return null
		}

		const dek = decryptDek(user.encryptedDek)
		dekCache.set(userId, dek)
		return dek
	}

	let updated = 0
	let failed = 0

	for (let i = 0; i < unhashed.length; i += BATCH_SIZE) {
		const batch = unhashed.slice(i, i + BATCH_SIZE)

		for (const trade of batch) {
			try {
				if (!trade.accountId) {
					failed++
					continue
				}

				// Get DEK for decryption
				const userId = accountUserMap.get(trade.accountId)
				if (!userId) {
					failed++
					continue
				}

				const dek = await getDekForUser(userId)

				// Decrypt price fields
				let entryPrice = trade.entryPrice
				let exitPrice = trade.exitPrice
				let positionSize = trade.positionSize

				if (dek) {
					entryPrice = decryptField(entryPrice, dek) || entryPrice
					exitPrice = exitPrice
						? decryptField(exitPrice, dek) || exitPrice
						: exitPrice
					positionSize = decryptField(positionSize, dek) || positionSize
				}

				const hash = computeTradeHash({
					accountId: trade.accountId,
					asset: trade.asset.toUpperCase(),
					direction: trade.direction,
					entryDate: trade.entryDate,
					entryPrice: Number(entryPrice),
					exitPrice: exitPrice ? Number(exitPrice) : null,
					positionSize: Number(positionSize),
				})

				await db
					.update(trades)
					.set({ deduplicationHash: hash })
					.where(eq(trades.id, trade.id))

				updated++
			} catch (error) {
				console.error(`Failed to hash trade ${trade.id}:`, error)
				failed++
			}
		}

		console.log(
			`Progress: ${Math.min(i + BATCH_SIZE, unhashed.length)}/${unhashed.length} (${updated} updated, ${failed} failed)`
		)
	}

	console.log(
		`\nBackfill complete: ${updated} hashes computed, ${failed} failures`
	)
	process.exit(0)
}

run().catch((error) => {
	console.error("Fatal error:", error)
	process.exit(1)
})
