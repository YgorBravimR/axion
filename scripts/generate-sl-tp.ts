/**
 * Auto-generate SL/TP values for existing trades in the database.
 *
 * This script retroactively applies stop loss and take profit values to trades
 * that were imported without these fields. Useful for seeded/historical accounts.
 *
 * Behavior:
 *   - Loss trades: SL = exitPrice (actual stop-out, 1R loss)
 *   - Win/breakeven trades: SL and TP are randomly generated within configured ranges (ticks)
 *   - Updates planned risk and R-multiple calculations
 *
 * Prerequisites:
 *   - ENCRYPTION_MASTER_KEY set in .env
 *   - DATABASE_URL set in .env
 *
 * Usage:
 *   pnpm tsx scripts/generate-sl-tp.ts <accountId>
 *   pnpm tsx scripts/generate-sl-tp.ts <accountId> --dry-run
 *
 * Safeguards:
 *   - OVERWRITE_EXISTING flag prevents overwriting trades that already have SL/TP
 *   - Idempotent: safe to re-run (skips trades with existing SL)
 */

import "dotenv/config"
import { drizzle } from "drizzle-orm/neon-http"
import { neon } from "@neondatabase/serverless"
import { eq, and, isNotNull } from "drizzle-orm"
import * as schema from "../src/db/schema"
import {
	decryptDek,
	encryptField,
	decryptField,
	decryptNumericField,
} from "../src/lib/crypto"
import { toCents, fromCents, toNumericString } from "../src/lib/money"
import { calculateRMultiple } from "../src/lib/calculations"

// ==========================================
// CONFIGURATION
// ==========================================

// Edit this config before running the script
const ASSET_CONFIG: Record<
	string,
	{
		slTicks: number
		slVariance: number
		tpTicks: number
		tpVariance: number
	}
> = {
	WIN: { slTicks: 37, slVariance: 5, tpTicks: 140, tpVariance: 5 },
	WDO: { slTicks: 50, slVariance: 10, tpTicks: 100, tpVariance: 20 },
	DOL: { slTicks: 30, slVariance: 8, tpTicks: 60, tpVariance: 15 },
	IND: { slTicks: 25, slVariance: 6, tpTicks: 50, tpVariance: 12 },
}

// Set to true to overwrite trades that already have SL/TP values
const OVERWRITE_EXISTING = true

// ==========================================
// SETUP
// ==========================================

const sql = neon(process.env.DATABASE_URL!)
const db = drizzle(sql, { schema })

const getRandomInt = (min: number, max: number): number => {
	return Math.floor(Math.random() * (max - min + 1)) + min
}

// ==========================================
// MAIN SCRIPT
// ==========================================

const main = async () => {
	const accountId = process.argv[2]
	const isDryRun = process.argv.includes("--dry-run")

	if (!accountId) {
		console.error(
			"Usage: pnpm tsx scripts/generate-sl-tp.ts <accountId> [--dry-run]"
		)
		process.exit(1)
	}

	console.log(`\n📊 Generating SL/TP for account: ${accountId}`)
	console.log(`Mode: ${isDryRun ? "DRY RUN" : "LIVE"}`)
	console.log(`Overwrite existing: ${OVERWRITE_EXISTING}\n`)

	// 1. Get account and user
	const account = await db.query.tradingAccounts.findFirst({
		where: eq(schema.tradingAccounts.id, accountId),
		columns: { userId: true },
	})

	if (!account) {
		console.error(`❌ Account ${accountId} not found`)
		process.exit(1)
	}

	console.log(`✓ Found account for user: ${account.userId}`)

	// 2. Decrypt DEK
	const user = await db.query.users.findFirst({
		where: eq(schema.users.id, account.userId),
		columns: { encryptedDek: true },
	})

	if (!user?.encryptedDek) {
		console.error("❌ User has no encrypted DEK (pre-migration user?)")
		process.exit(1)
	}

	const dek = decryptDek(user.encryptedDek)
	if (!dek) {
		console.error("❌ Failed to decrypt DEK. Check ENCRYPTION_MASTER_KEY.")
		process.exit(1)
	}

	console.log("✓ DEK decrypted successfully")

	// 3. Fetch trades (non-archived)
	const rawTrades = await db.query.trades.findMany({
		where: and(
			eq(schema.trades.accountId, accountId),
			eq(schema.trades.isArchived, false)
		),
	})

	console.log(`✓ Found ${rawTrades.length} trades to process\n`)

	// 4. Decrypt trades
	const decryptedTrades = rawTrades.map((t) => ({
		...t,
		entryPrice:
			decryptField(t.entryPrice as string | null, dek) || t.entryPrice,
		exitPrice: decryptField(t.exitPrice as string | null, dek) || t.exitPrice,
		positionSize:
			decryptField(t.positionSize as string | null, dek) || t.positionSize,
		stopLoss: decryptField(t.stopLoss as string | null, dek) || t.stopLoss,
		takeProfit:
			decryptField(t.takeProfit as string | null, dek) || t.takeProfit,
		pnl: decryptNumericField(t.pnl as string | null, dek) ?? t.pnl,
		plannedRiskAmount:
			decryptNumericField(t.plannedRiskAmount as string | null, dek) ??
			t.plannedRiskAmount,
	}))

	// 5. Build asset config map
	const uniqueAssets = [
		...new Set(
			decryptedTrades
				.map((t) => t.asset.toUpperCase())
				.filter((a) => ASSET_CONFIG[a])
		),
	]

	const assetConfigMap = new Map<
		string,
		{ tickSize: number; tickValue: number }
	>()

	for (const symbol of uniqueAssets) {
		const asset = await db.query.assets.findFirst({
			where: eq(schema.assets.symbol, symbol),
		})
		if (asset) {
			assetConfigMap.set(symbol, {
				tickSize: parseFloat(asset.tickSize),
				tickValue: fromCents(asset.tickValue),
			})
		}
	}

	console.log(
		`✓ Asset configurations: ${[...assetConfigMap.keys()].join(", ")}`
	)

	// 6. Process trades
	let processedCount = 0
	let skippedCount = 0
	let updatedCount = 0

	for (const trade of decryptedTrades) {
		processedCount++

		const entryPrice = Number(trade.entryPrice)
		const exitPrice = trade.exitPrice ? Number(trade.exitPrice) : null
		const positionSize = Number(trade.positionSize)
		const direction = (trade.direction as string).toLowerCase()
		const pnl =
			typeof trade.pnl === "number"
				? fromCents(trade.pnl as any)
				: trade.pnl
					? Number(trade.pnl)
					: null

		// Skip if missing required data
		if (!entryPrice || !positionSize) {
			skippedCount++
			continue
		}

		// Skip if already has SL and we're not overwriting
		if (!OVERWRITE_EXISTING && trade.stopLoss) {
			skippedCount++
			continue
		}

		// Get asset config
		const assetSymbol = trade.asset.toUpperCase()
		let config = ASSET_CONFIG[assetSymbol]

		// Fallback: try stripping trailing digits for futures contracts
		if (!config && assetSymbol.length > 3) {
			const baseSymbol = assetSymbol.replace(/\d+$/, "")
			config = ASSET_CONFIG[baseSymbol]
		}

		if (!config) {
			skippedCount++
			continue
		}

		// Classify outcome
		const isWin = pnl !== null && pnl >= 0

		let slPrice: number
		let tpPrice: number
		const assetConfig = assetConfigMap.get(assetSymbol)

		if (!assetConfig) {
			skippedCount++
			continue
		}

		const tickSize = assetConfig.tickSize

		if (isWin) {
			// Win/breakeven: random SL and TP within variance
			const slTicks = getRandomInt(
				config.slTicks - config.slVariance,
				config.slTicks + config.slVariance
			)
			const tpTicks = getRandomInt(
				config.tpTicks - config.tpVariance,
				config.tpTicks + config.tpVariance
			)

			if (direction === "long") {
				slPrice = entryPrice - slTicks * tickSize
				tpPrice = entryPrice + tpTicks * tickSize
			} else {
				slPrice = entryPrice + slTicks * tickSize
				tpPrice = entryPrice - tpTicks * tickSize
			}
		} else {
			// Loss: SL = exitPrice (1R loss), random TP
			if (!exitPrice) {
				skippedCount++
				continue
			}

			slPrice = exitPrice
			const tpTicks = getRandomInt(
				config.tpTicks - config.tpVariance,
				config.tpTicks + config.tpVariance
			)

			if (direction === "long") {
				tpPrice = entryPrice + tpTicks * tickSize
			} else {
				tpPrice = entryPrice - tpTicks * tickSize
			}
		}

		// Calculate planned risk
		const priceDiff = Math.abs(entryPrice - slPrice)
		const ticksAtRisk = priceDiff / tickSize
		const plannedRiskAmount = ticksAtRisk * assetConfig.tickValue * positionSize

		// Calculate planned R multiple
		const riskPerUnit = Math.abs(entryPrice - slPrice)
		const rewardPerUnit = Math.abs(tpPrice - entryPrice)
		const plannedRMultiple =
			riskPerUnit > 0 ? rewardPerUnit / riskPerUnit : null

		// Calculate realized R if we have PnL
		let realizedRMultiple: number | null = null
		if (pnl !== null && plannedRiskAmount > 0) {
			realizedRMultiple = calculateRMultiple(pnl, plannedRiskAmount)
		}

		if (!isDryRun) {
			// Encrypt updated fields
			const encryptedData: Record<string, string | null> = {
				stopLoss: encryptField(slPrice, dek),
				takeProfit: encryptField(tpPrice, dek),
				plannedRiskAmount: encryptField(toCents(plannedRiskAmount), dek),
				plannedRMultiple: encryptField(toNumericString(plannedRMultiple), dek),
			}

			// Update trade
			await db
				.update(schema.trades)
				.set({
					...encryptedData,
					realizedRMultiple: toNumericString(realizedRMultiple),
				})
				.where(eq(schema.trades.id, trade.id))
		}

		updatedCount++

		// Log progress
		const outcome = isWin ? "win" : "loss"
		console.log(
			`[${trade.asset}] ${direction.toUpperCase()} ${outcome} → ` +
				`SL: ${slPrice.toFixed(2)}, TP: ${tpPrice.toFixed(2)}`
		)
	}

	// 7. Summary
	console.log(`\n${"=".repeat(60)}`)
	console.log(`Processed: ${processedCount}`)
	console.log(`Skipped: ${skippedCount}`)
	console.log(`Updated: ${updatedCount}`)
	console.log(`${"=".repeat(60)}`)

	if (isDryRun) {
		console.log("\n⚠️  DRY RUN: No changes were written to the database.")
		console.log("Run without --dry-run to apply changes.")
	} else {
		console.log("\n✅ SL/TP generation complete!")
	}
}

main().catch((error) => {
	console.error("❌ Error:", error instanceof Error ? error.message : error)
	process.exit(1)
})
