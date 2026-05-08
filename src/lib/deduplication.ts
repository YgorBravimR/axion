/**
 * Trade deduplication via SHA-256 fingerprint.
 *
 * Because prices are AES-256-GCM encrypted in the database, direct comparison
 * for duplicate detection would require decrypting every row. Instead, we compute
 * a SHA-256 hash from plaintext values *before* encryption and store it alongside
 * the trade. This enables O(1) lookups via `WHERE deduplicationHash IN (...)`.
 *
 * The hash is NOT security-sensitive — it's a collision-resistant business fingerprint.
 */

import { createHash } from "crypto"
import { formatDateKey } from "@/lib/dates"

interface TradeHashInput {
	accountId: string
	asset: string
	direction: "long" | "short"
	entryDate: Date
	entryPrice: number
	exitPrice?: number | null
	positionSize: number
}

/**
 * Compute a SHA-256 deduplication hash for a trade.
 *
 * Fingerprint components (pipe-delimited):
 *   accountId | asset (uppercase) | direction | entryDate (YYYY-MM-DD HH:mm:ss) | entryPrice (2dp) | exitPrice (2dp) | positionSize
 *
 * Prices are rounded to 2 decimal places to avoid floating-point noise
 * (e.g., 128000.00000001 vs 128000.0 would otherwise produce different hashes).
 *
 * EntryDate uses full datetime (down to seconds) so two trades with identical
 * prices on the same day but different entry times don't collide.
 */
const computeTradeHash = (input: TradeHashInput): string => {
	const date = input.entryDate instanceof Date ? input.entryDate : new Date(input.entryDate)
	const dateKey = formatDateKey(date)
	const hh = String(date.getUTCHours()).padStart(2, "0")
	const mm = String(date.getUTCMinutes()).padStart(2, "0")
	const ss = String(date.getUTCSeconds()).padStart(2, "0")
	const datetimeKey = `${dateKey} ${hh}:${mm}:${ss}`
	const entryPriceNormalized = input.entryPrice.toFixed(2)
	const exitPriceNormalized = input.exitPrice != null ? input.exitPrice.toFixed(2) : "null"
	const positionSizeNormalized = input.positionSize.toString()

	const fingerprint = [
		input.accountId,
		input.asset.toUpperCase(),
		input.direction,
		datetimeKey,
		entryPriceNormalized,
		exitPriceNormalized,
		positionSizeNormalized,
	].join("|")

	return createHash("sha256").update(fingerprint).digest("hex")
}

/**
 * Compute a SHA-256 hash of a file's content (for nota PDF idempotency).
 */
const computeFileHash = (buffer: Buffer): string => {
	return createHash("sha256").update(buffer).digest("hex")
}

export { computeTradeHash, computeFileHash }
export type { TradeHashInput }
