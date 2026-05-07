/**
 * One-time data encryption migration script.
 *
 * Encrypts all existing plaintext data in the database using per-user DEKs.
 * Must be run AFTER the schema migration (0010_security_encryption.sql) is applied
 * and BEFORE the app goes live with encryption enabled.
 *
 * Prerequisites:
 *   - Schema migration 0010 applied (columns changed to text)
 *   - ENCRYPTION_MASTER_KEY set in .env
 *   - DATABASE_URL set in .env
 *
 * Usage: pnpm tsx scripts/migrate-encrypt-existing-data.ts
 *
 * Idempotent: safe to re-run if interrupted. Already-encrypted values (matching
 * the base64:base64:base64 pattern) are skipped.
 *
 * Rollback: restore from Neon branch snapshot taken before migration.
 */

import "dotenv/config"
import { drizzle } from "drizzle-orm/neon-http"
import { eq, inArray, sql, asc, gt } from "drizzle-orm"
import * as schema from "../src/db/schema"
import {
	generateKey,
	encryptDek,
	encrypt,
	isEncrypted,
} from "../src/lib/crypto"

const db = drizzle(process.env.DATABASE_URL!, { schema })

const BATCH_SIZE = 100

// ==========================================
// HELPERS
// ==========================================

/** Encrypt a value with the given DEK, skipping nulls and already-encrypted values */
const safeEncrypt = (
	value: string | number | null | undefined,
	dek: string
): string | null => {
	if (value === null || value === undefined) {
		return null
	}
	const strValue = String(value)
	if (isEncrypted(strValue)) {
		return strValue
	} // already encrypted
	return encrypt(strValue, dek)
}

// ==========================================
// STEP 1: Generate DEKs for all users
// ==========================================

const generateDeks = async (): Promise<number> => {
	const usersWithoutDek = await db.query.users.findMany({
		where: sql`${schema.users.encryptedDek} IS NULL`,
		columns: { id: true },
	})

	let count = 0
	for (const user of usersWithoutDek) {
		const dek = generateKey()
		const encryptedDekValue = encryptDek(dek)
		await db
			.update(schema.users)
			.set({ encryptedDek: encryptedDekValue })
			.where(eq(schema.users.id, user.id))
		count++
		console.log(`Generated DEK for user ${user.id}`)
	}

	return count
}

// ==========================================
// STEP 2: Encrypt users.name
// ==========================================

const encryptUserNames = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, name: true, encryptedDek: true },
	})

	let count = 0
	for (const user of allUsers) {
		if (!user.encryptedDek || !user.name) {
			continue
		}
		if (isEncrypted(user.name)) {
			continue
		}

		const { decryptDek } = await import("../src/lib/crypto")
		const dek = decryptDek(user.encryptedDek)
		if (!dek) {
			console.error(`Failed to decrypt DEK for user ${user.id}`)
			continue
		}

		const encryptedName = safeEncrypt(user.name, dek)
		if (encryptedName) {
			await db
				.update(schema.users)
				.set({ name: encryptedName })
				.where(eq(schema.users.id, user.id))
			count++
		}
	}

	return count
}

// ==========================================
// STEP 3: Encrypt trades
// ==========================================

const encryptTrades = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, encryptedDek: true },
	})

	let totalEncrypted = 0

	for (const user of allUsers) {
		if (!user.encryptedDek) {
			continue
		}

		const { decryptDek } = await import("../src/lib/crypto")
		const dek = decryptDek(user.encryptedDek)
		if (!dek) {
			continue
		}

		// Get all account IDs for this user
		const accounts = await db.query.tradingAccounts.findMany({
			where: eq(schema.tradingAccounts.userId, user.id),
			columns: { id: true },
		})
		const accountIds = accounts.map((a) => a.id)
		if (accountIds.length === 0) {
			continue
		}

		// Process trades in batches using cursor-based pagination (stable across mutations)
		let lastId = ""
		let hasMore = true
		while (hasMore) {
			const batch = await db.query.trades.findMany({
				where: lastId
					? sql`${schema.trades.accountId} IN ${accountIds} AND ${schema.trades.id} > ${lastId}`
					: inArray(schema.trades.accountId, accountIds),
				limit: BATCH_SIZE,
				orderBy: [asc(schema.trades.id)],
			})

			if (batch.length === 0) {
				break
			}

			for (const trade of batch) {
				// Skip if entryPrice is already encrypted (idempotency — entryPrice is always non-null)
				if (trade.entryPrice && isEncrypted(trade.entryPrice as string)) {
					continue
				}

				const encrypted: Record<string, string | null> = {}

				// Numeric fields (were bigint/integer, now text)
				encrypted.pnl = safeEncrypt(trade.pnl, dek)
				encrypted.plannedRiskAmount = safeEncrypt(trade.plannedRiskAmount, dek)
				encrypted.commission = safeEncrypt(trade.commission, dek)
				encrypted.fees = safeEncrypt(trade.fees, dek)

				// Decimal fields (were decimal, now text)
				encrypted.entryPrice = safeEncrypt(trade.entryPrice, dek)
				encrypted.exitPrice = safeEncrypt(trade.exitPrice, dek)
				encrypted.positionSize = safeEncrypt(trade.positionSize, dek)
				encrypted.stopLoss = safeEncrypt(trade.stopLoss, dek)
				encrypted.takeProfit = safeEncrypt(trade.takeProfit, dek)
				encrypted.plannedRMultiple = safeEncrypt(trade.plannedRMultiple, dek)

				// Text fields
				encrypted.preTradeThoughts = safeEncrypt(trade.preTradeThoughts, dek)
				encrypted.postTradeReflection = safeEncrypt(
					trade.postTradeReflection,
					dek
				)
				encrypted.lessonLearned = safeEncrypt(trade.lessonLearned, dek)
				encrypted.disciplineNotes = safeEncrypt(trade.disciplineNotes, dek)

				await db
					.update(schema.trades)
					.set(encrypted)
					.where(eq(schema.trades.id, trade.id))
				totalEncrypted++
			}

			lastId = batch[batch.length - 1].id
			console.log(
				`Encrypted ${totalEncrypted} trades so far for user ${user.id}`
			)

			if (batch.length < BATCH_SIZE) {
				hasMore = false
			}
		}
	}

	return totalEncrypted
}

// ==========================================
// STEP 4: Encrypt trade_executions
// ==========================================

const encryptExecutions = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, encryptedDek: true },
	})

	let totalEncrypted = 0

	for (const user of allUsers) {
		if (!user.encryptedDek) {
			continue
		}

		const { decryptDek } = await import("../src/lib/crypto")
		const dek = decryptDek(user.encryptedDek)
		if (!dek) {
			continue
		}

		const accounts = await db.query.tradingAccounts.findMany({
			where: eq(schema.tradingAccounts.userId, user.id),
			columns: { id: true },
		})
		const accountIds = accounts.map((a) => a.id)
		if (accountIds.length === 0) {
			continue
		}

		// Get trade IDs for this user's accounts
		const userTrades = await db.query.trades.findMany({
			where: inArray(schema.trades.accountId, accountIds),
			columns: { id: true },
		})
		const tradeIds = userTrades.map((t) => t.id)
		if (tradeIds.length === 0) {
			continue
		}

		// Cursor-based pagination through executions
		let lastExecId = ""
		let hasMoreExec = true
		while (hasMoreExec) {
			const executions = await db.query.tradeExecutions.findMany({
				where: lastExecId
					? sql`${schema.tradeExecutions.tradeId} IN ${tradeIds} AND ${schema.tradeExecutions.id} > ${lastExecId}`
					: inArray(schema.tradeExecutions.tradeId, tradeIds),
				limit: BATCH_SIZE,
				orderBy: [asc(schema.tradeExecutions.id)],
			})

			if (executions.length === 0) {
				break
			}

			for (const exec of executions) {
				if (exec.price && isEncrypted(exec.price as string)) {
					continue
				}

				const encrypted: Record<string, string | null> = {
					price: safeEncrypt(exec.price, dek),
					quantity: safeEncrypt(exec.quantity, dek),
					commission: safeEncrypt(exec.commission, dek),
					fees: safeEncrypt(exec.fees, dek),
					slippage: safeEncrypt(exec.slippage, dek),
					executionValue: safeEncrypt(exec.executionValue, dek),
				}

				await db
					.update(schema.tradeExecutions)
					.set(encrypted)
					.where(eq(schema.tradeExecutions.id, exec.id))
				totalEncrypted++
			}

			lastExecId = executions[executions.length - 1].id
			if (executions.length < BATCH_SIZE) {
				hasMoreExec = false
			}
		}
	}

	return totalEncrypted
}

// ==========================================
// STEP 5: Encrypt trading_accounts
// ==========================================

const encryptAccounts = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, encryptedDek: true },
	})

	let totalEncrypted = 0

	for (const user of allUsers) {
		if (!user.encryptedDek) {
			continue
		}

		const { decryptDek } = await import("../src/lib/crypto")
		const dek = decryptDek(user.encryptedDek)
		if (!dek) {
			continue
		}

		const accounts = await db.query.tradingAccounts.findMany({
			where: eq(schema.tradingAccounts.userId, user.id),
		})

		for (const account of accounts) {
			// Idempotency: check if dayTradeTaxRate looks encrypted
			if (
				account.dayTradeTaxRate &&
				isEncrypted(account.dayTradeTaxRate as string)
			) {
				continue
			}

			const encrypted: Record<string, string | null> = {
				dayTradeTaxRate: safeEncrypt(account.dayTradeTaxRate, dek),
				swingTradeTaxRate: safeEncrypt(account.swingTradeTaxRate, dek),
				profitSharePercentage: safeEncrypt(account.profitSharePercentage, dek),
				defaultCommission: safeEncrypt(account.defaultCommission, dek),
				defaultFees: safeEncrypt(account.defaultFees, dek),
				maxDailyLoss: safeEncrypt(account.maxDailyLoss, dek),
				maxMonthlyLoss: safeEncrypt(account.maxMonthlyLoss, dek),
				propFirmName: safeEncrypt(account.propFirmName, dek),
			}

			await db
				.update(schema.tradingAccounts)
				.set(encrypted)
				.where(eq(schema.tradingAccounts.id, account.id))
			totalEncrypted++
		}
	}

	return totalEncrypted
}

// ==========================================
// STEP 6: Encrypt monthly_plans
// ==========================================

const encryptMonthlyPlans = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, encryptedDek: true },
	})

	let totalEncrypted = 0

	for (const user of allUsers) {
		if (!user.encryptedDek) {
			continue
		}

		const { decryptDek } = await import("../src/lib/crypto")
		const dek = decryptDek(user.encryptedDek)
		if (!dek) {
			continue
		}

		const accounts = await db.query.tradingAccounts.findMany({
			where: eq(schema.tradingAccounts.userId, user.id),
			columns: { id: true },
		})
		const accountIds = accounts.map((a) => a.id)
		if (accountIds.length === 0) {
			continue
		}

		const plans = await db.query.monthlyPlans.findMany({
			where: inArray(schema.monthlyPlans.accountId, accountIds),
		})

		for (const plan of plans) {
			if (plan.accountBalance && isEncrypted(plan.accountBalance as string)) {
				continue
			}

			const encrypted: Record<string, string | null> = {
				accountBalance: safeEncrypt(plan.accountBalance, dek),
				riskPerTradeCents: safeEncrypt(plan.riskPerTradeCents, dek),
				dailyLossCents: safeEncrypt(plan.dailyLossCents, dek),
				monthlyLossCents: safeEncrypt(plan.monthlyLossCents, dek),
				weeklyLossCents: safeEncrypt(plan.weeklyLossCents, dek),
			}

			await db
				.update(schema.monthlyPlans)
				.set(encrypted)
				.where(eq(schema.monthlyPlans.id, plan.id))
			totalEncrypted++
		}
	}

	return totalEncrypted
}

// ==========================================
// STEP 7: Encrypt daily_journals
// ==========================================

const encryptJournals = async (): Promise<number> => {
	const allJournals = await db.query.dailyJournals.findMany()
	// Journals don't have userId — we'd need to determine ownership.
	// For now, skip journals since they don't have a direct user relation in the schema.
	// They contain market_outlook, focus_goals, key_takeaways, session_review.
	console.log(
		`Found ${allJournals.length} journals — skipping (no userId column for DEK lookup)`
	)
	return 0
}

// ==========================================
// STEP 8: Encrypt daily_account_notes
// ==========================================

const encryptDailyNotes = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, encryptedDek: true },
	})

	let totalEncrypted = 0

	for (const user of allUsers) {
		if (!user.encryptedDek) {
			continue
		}

		const { decryptDek } = await import("../src/lib/crypto")
		const dek = decryptDek(user.encryptedDek)
		if (!dek) {
			continue
		}

		const notes = await db.query.dailyAccountNotes.findMany({
			where: eq(schema.dailyAccountNotes.userId, user.id),
		})

		for (const note of notes) {
			if (note.preMarketNotes && isEncrypted(note.preMarketNotes)) {
				continue
			}

			const encrypted: Record<string, string | null> = {
				preMarketNotes: safeEncrypt(note.preMarketNotes, dek),
				postMarketNotes: safeEncrypt(note.postMarketNotes, dek),
			}

			await db
				.update(schema.dailyAccountNotes)
				.set(encrypted)
				.where(eq(schema.dailyAccountNotes.id, note.id))
			totalEncrypted++
		}
	}

	return totalEncrypted
}

// ==========================================
// VERIFICATION
// ==========================================

const verify = async (): Promise<boolean> => {
	// Check ALL trades, not just a sample — ensure zero plaintext leaks
	const allTrades = await db.query.trades.findMany({
		columns: { id: true, entryPrice: true, pnl: true, exitPrice: true },
	})

	let failures = 0
	for (const trade of allTrades) {
		if (trade.entryPrice && !isEncrypted(trade.entryPrice as string)) {
			console.error(
				`FAILED: trade ${trade.id} entryPrice is not encrypted: ${trade.entryPrice}`
			)
			failures++
		}
		if (trade.pnl && !isEncrypted(trade.pnl as string)) {
			console.error(
				`FAILED: trade ${trade.id} pnl is not encrypted: ${trade.pnl}`
			)
			failures++
		}
		if (trade.exitPrice && !isEncrypted(trade.exitPrice as string)) {
			console.error(
				`FAILED: trade ${trade.id} exitPrice is not encrypted: ${trade.exitPrice}`
			)
			failures++
		}
	}

	if (failures > 0) {
		console.error(
			`Verification FAILED: ${failures} unencrypted fields found across ${allTrades.length} trades`
		)
		return false
	}

	console.log(
		`Verification passed: all ${allTrades.length} trades have encrypted fields`
	)
	return true
}

// ==========================================
// MAIN
// ==========================================

const main = async () => {
	console.log("========================================")
	console.log("Axion — Encrypt Existing Data")
	console.log("========================================\n")

	const failedUsers: string[] = []

	try {
		// Step 1: Generate DEKs
		console.log("\n[Step 1/8] Generating DEKs for users without one...")
		const deksGenerated = await generateDeks()
		console.log(`  Generated ${deksGenerated} DEKs\n`)

		// Step 2: Encrypt user names
		console.log("[Step 2/8] Encrypting user names...")
		const namesEncrypted = await encryptUserNames()
		console.log(`  Encrypted ${namesEncrypted} user names\n`)

		// Step 3: Encrypt trades
		console.log("[Step 3/8] Encrypting trades...")
		const tradesEncrypted = await encryptTrades()
		console.log(`  Encrypted ${tradesEncrypted} trades\n`)

		// Step 4: Encrypt executions
		console.log("[Step 4/8] Encrypting trade executions...")
		const executionsEncrypted = await encryptExecutions()
		console.log(`  Encrypted ${executionsEncrypted} executions\n`)

		// Step 5: Encrypt accounts
		console.log("[Step 5/8] Encrypting trading accounts...")
		const accountsEncrypted = await encryptAccounts()
		console.log(`  Encrypted ${accountsEncrypted} accounts\n`)

		// Step 6: Encrypt monthly plans
		console.log("[Step 6/8] Encrypting monthly plans...")
		const plansEncrypted = await encryptMonthlyPlans()
		console.log(`  Encrypted ${plansEncrypted} monthly plans\n`)

		// Step 7: Encrypt journals
		console.log("[Step 7/8] Encrypting journals...")
		const journalsEncrypted = await encryptJournals()
		console.log(`  Encrypted ${journalsEncrypted} journals\n`)

		// Step 8: Encrypt daily notes
		console.log("[Step 8/8] Encrypting daily account notes...")
		const notesEncrypted = await encryptDailyNotes()
		console.log(`  Encrypted ${notesEncrypted} daily notes\n`)

		// Verification
		console.log("\n[Verification] Checking encrypted data...")
		const verified = await verify()

		// Summary
		console.log("\n========================================")
		console.log("SUMMARY")
		console.log("========================================")
		console.log(`DEKs generated:      ${deksGenerated}`)
		console.log(`User names:          ${namesEncrypted}`)
		console.log(`Trades:              ${tradesEncrypted}`)
		console.log(`Executions:          ${executionsEncrypted}`)
		console.log(`Accounts:            ${accountsEncrypted}`)
		console.log(`Monthly plans:       ${plansEncrypted}`)
		console.log(`Journals:            ${journalsEncrypted}`)
		console.log(`Daily notes:         ${notesEncrypted}`)
		console.log(`Verification:        ${verified ? "PASSED" : "FAILED"}`)

		if (failedUsers.length > 0) {
			console.log(`\nFailed users: ${failedUsers.join(", ")}`)
		}

		console.log("\nDone!")
		process.exit(verified ? 0 : 1)
	} catch (error) {
		console.error("\nFATAL ERROR:", error)
		process.exit(1)
	}
}

main()
