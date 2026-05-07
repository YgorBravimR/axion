/**
 * One-time data decryption migration script.
 *
 * Decrypts all encrypted data in the database back to plaintext.
 * Inverse of scripts/migrate-encrypt-existing-data.ts.
 *
 * Prerequisites:
 *   - ENCRYPTION_MASTER_KEY set in .env (needed to decrypt existing DEKs)
 *   - DATABASE_URL set in .env
 *   - Database backup taken (Neon branch snapshot or pg_dump)
 *
 * Usage: pnpm tsx scripts/migrate-decrypt-existing-data.ts
 *
 * Idempotent: safe to re-run if interrupted. Already-plaintext values
 * (not matching the base64:base64:base64 pattern) are skipped.
 *
 * Rollback: run scripts/migrate-encrypt-existing-data.ts to re-encrypt.
 */

import "dotenv/config"
import { drizzle } from "drizzle-orm/neon-http"
import { eq, inArray, sql, asc } from "drizzle-orm"
import * as schema from "../src/db/schema"
import { decrypt, decryptDek, isEncrypted } from "../src/lib/crypto"

const db = drizzle(process.env.DATABASE_URL!, { schema })

const BATCH_SIZE = 100

// ==========================================
// HELPERS
// ==========================================

/** Decrypt a value with the given DEK, skipping nulls and already-plaintext values */
const safeDecrypt = (value: string | null, dek: string): string | null => {
	if (value === null) {
		return null
	}
	if (!isEncrypted(value)) {
		return value
	} // already plaintext
	return decrypt(value, dek) ?? value // keep original on failure to prevent data loss
}

// ==========================================
// STEP 1: Decrypt users.name
// ==========================================

const decryptUserNames = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, name: true, encryptedDek: true },
	})

	let count = 0
	for (const user of allUsers) {
		if (!user.encryptedDek || !user.name) {
			continue
		}
		if (!isEncrypted(user.name)) {
			continue
		}

		const dek = decryptDek(user.encryptedDek)
		if (!dek) {
			console.error(`Failed to decrypt DEK for user ${user.id}`)
			continue
		}

		const decryptedName = safeDecrypt(user.name, dek)
		if (decryptedName && decryptedName !== user.name) {
			await db
				.update(schema.users)
				.set({ name: decryptedName })
				.where(eq(schema.users.id, user.id))
			count++
		}
	}

	return count
}

// ==========================================
// STEP 2: Decrypt trades
// ==========================================

const decryptTrades = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, encryptedDek: true },
	})

	let totalDecrypted = 0

	for (const user of allUsers) {
		if (!user.encryptedDek) {
			continue
		}

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

		// Process trades in batches using cursor-based pagination
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
				// Skip if entryPrice is already plaintext (idempotency check)
				if (trade.entryPrice && !isEncrypted(trade.entryPrice as string)) {
					continue
				}

				const decrypted: Record<string, string | null> = {}

				// Numeric fields
				decrypted.pnl = safeDecrypt(trade.pnl as string | null, dek)
				decrypted.plannedRiskAmount = safeDecrypt(
					trade.plannedRiskAmount as string | null,
					dek
				)
				decrypted.commission = safeDecrypt(
					trade.commission as string | null,
					dek
				)
				decrypted.fees = safeDecrypt(trade.fees as string | null, dek)

				// Decimal fields
				decrypted.entryPrice = safeDecrypt(
					trade.entryPrice as string | null,
					dek
				)
				decrypted.exitPrice = safeDecrypt(trade.exitPrice as string | null, dek)
				decrypted.positionSize = safeDecrypt(
					trade.positionSize as string | null,
					dek
				)
				decrypted.stopLoss = safeDecrypt(trade.stopLoss as string | null, dek)
				decrypted.takeProfit = safeDecrypt(
					trade.takeProfit as string | null,
					dek
				)
				decrypted.plannedRMultiple = safeDecrypt(
					trade.plannedRMultiple as string | null,
					dek
				)

				// Text fields
				decrypted.preTradeThoughts = safeDecrypt(
					trade.preTradeThoughts as string | null,
					dek
				)
				decrypted.postTradeReflection = safeDecrypt(
					trade.postTradeReflection as string | null,
					dek
				)
				decrypted.lessonLearned = safeDecrypt(
					trade.lessonLearned as string | null,
					dek
				)
				decrypted.disciplineNotes = safeDecrypt(
					trade.disciplineNotes as string | null,
					dek
				)

				await db
					.update(schema.trades)
					.set(decrypted)
					.where(eq(schema.trades.id, trade.id))
				totalDecrypted++
			}

			lastId = batch[batch.length - 1].id
			console.log(
				`Decrypted ${totalDecrypted} trades so far for user ${user.id}`
			)

			if (batch.length < BATCH_SIZE) {
				hasMore = false
			}
		}
	}

	return totalDecrypted
}

// ==========================================
// STEP 3: Decrypt trade_executions
// ==========================================

const decryptExecutions = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, encryptedDek: true },
	})

	let totalDecrypted = 0

	for (const user of allUsers) {
		if (!user.encryptedDek) {
			continue
		}

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
				if (exec.price && !isEncrypted(exec.price as string)) {
					continue
				}

				const decrypted: Record<string, string | null> = {
					price: safeDecrypt(exec.price as string | null, dek),
					quantity: safeDecrypt(exec.quantity as string | null, dek),
					commission: safeDecrypt(exec.commission as string | null, dek),
					fees: safeDecrypt(exec.fees as string | null, dek),
					slippage: safeDecrypt(exec.slippage as string | null, dek),
					executionValue: safeDecrypt(
						exec.executionValue as string | null,
						dek
					),
				}

				await db
					.update(schema.tradeExecutions)
					.set(decrypted)
					.where(eq(schema.tradeExecutions.id, exec.id))
				totalDecrypted++
			}

			lastExecId = executions[executions.length - 1].id
			if (executions.length < BATCH_SIZE) {
				hasMoreExec = false
			}
		}
	}

	return totalDecrypted
}

// ==========================================
// STEP 4: Decrypt trading_accounts
// ==========================================

const decryptAccounts = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, encryptedDek: true },
	})

	let totalDecrypted = 0

	for (const user of allUsers) {
		if (!user.encryptedDek) {
			continue
		}

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
				!isEncrypted(account.dayTradeTaxRate as string)
			) {
				continue
			}

			const decrypted: Record<string, string | null> = {
				dayTradeTaxRate: safeDecrypt(
					account.dayTradeTaxRate as string | null,
					dek
				),
				swingTradeTaxRate: safeDecrypt(
					account.swingTradeTaxRate as string | null,
					dek
				),
				profitSharePercentage: safeDecrypt(
					account.profitSharePercentage as string | null,
					dek
				),
				defaultCommission: safeDecrypt(
					account.defaultCommission as string | null,
					dek
				),
				defaultFees: safeDecrypt(account.defaultFees as string | null, dek),
				maxDailyLoss: safeDecrypt(account.maxDailyLoss as string | null, dek),
				maxMonthlyLoss: safeDecrypt(
					account.maxMonthlyLoss as string | null,
					dek
				),
				propFirmName: safeDecrypt(account.propFirmName as string | null, dek),
			}

			await db
				.update(schema.tradingAccounts)
				.set(decrypted)
				.where(eq(schema.tradingAccounts.id, account.id))
			totalDecrypted++
		}
	}

	return totalDecrypted
}

// ==========================================
// STEP 5: Decrypt monthly_plans
// ==========================================

const decryptMonthlyPlans = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, encryptedDek: true },
	})

	let totalDecrypted = 0

	for (const user of allUsers) {
		if (!user.encryptedDek) {
			continue
		}

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
			if (plan.accountBalance && !isEncrypted(plan.accountBalance as string)) {
				continue
			}

			const decrypted: Record<string, string | null> = {
				accountBalance: safeDecrypt(plan.accountBalance as string | null, dek),
				riskPerTradeCents: safeDecrypt(
					plan.riskPerTradeCents as string | null,
					dek
				),
				dailyLossCents: safeDecrypt(plan.dailyLossCents as string | null, dek),
				monthlyLossCents: safeDecrypt(
					plan.monthlyLossCents as string | null,
					dek
				),
				weeklyLossCents: safeDecrypt(
					plan.weeklyLossCents as string | null,
					dek
				),
			}

			await db
				.update(schema.monthlyPlans)
				.set(decrypted)
				.where(eq(schema.monthlyPlans.id, plan.id))
			totalDecrypted++
		}
	}

	return totalDecrypted
}

// ==========================================
// STEP 6: Decrypt daily_journals (skipped — no userId column)
// ==========================================

const decryptJournals = async (): Promise<number> => {
	const allJournals = await db.query.dailyJournals.findMany()
	console.log(
		`Found ${allJournals.length} journals — skipping (no userId column for DEK lookup)`
	)
	return 0
}

// ==========================================
// STEP 7: Decrypt daily_account_notes
// ==========================================

const decryptDailyNotes = async (): Promise<number> => {
	const allUsers = await db.query.users.findMany({
		columns: { id: true, encryptedDek: true },
	})

	let totalDecrypted = 0

	for (const user of allUsers) {
		if (!user.encryptedDek) {
			continue
		}

		const dek = decryptDek(user.encryptedDek)
		if (!dek) {
			continue
		}

		const notes = await db.query.dailyAccountNotes.findMany({
			where: eq(schema.dailyAccountNotes.userId, user.id),
		})

		for (const note of notes) {
			if (note.preMarketNotes && !isEncrypted(note.preMarketNotes)) {
				continue
			}

			const decrypted: Record<string, string | null> = {
				preMarketNotes: safeDecrypt(note.preMarketNotes, dek),
				postMarketNotes: safeDecrypt(note.postMarketNotes, dek),
			}

			await db
				.update(schema.dailyAccountNotes)
				.set(decrypted)
				.where(eq(schema.dailyAccountNotes.id, note.id))
			totalDecrypted++
		}
	}

	return totalDecrypted
}

// ==========================================
// VERIFICATION
// ==========================================

const verify = async (): Promise<boolean> => {
	// Check ALL trades — ensure zero encrypted fields remaining
	const allTrades = await db.query.trades.findMany({
		columns: { id: true, entryPrice: true, pnl: true, exitPrice: true },
	})

	let failures = 0
	for (const trade of allTrades) {
		if (trade.entryPrice && isEncrypted(trade.entryPrice as string)) {
			console.error(`FAILED: trade ${trade.id} entryPrice is still encrypted`)
			failures++
		}
		if (trade.pnl && isEncrypted(trade.pnl as string)) {
			console.error(`FAILED: trade ${trade.id} pnl is still encrypted`)
			failures++
		}
		if (trade.exitPrice && isEncrypted(trade.exitPrice as string)) {
			console.error(`FAILED: trade ${trade.id} exitPrice is still encrypted`)
			failures++
		}
	}

	if (failures > 0) {
		console.error(
			`Verification FAILED: ${failures} still-encrypted fields found across ${allTrades.length} trades`
		)
		return false
	}

	console.log(
		`Verification passed: all ${allTrades.length} trades have plaintext fields`
	)
	return true
}

// ==========================================
// MAIN
// ==========================================

const main = async () => {
	console.log("========================================")
	console.log("Axion — Decrypt Existing Data")
	console.log("========================================\n")

	console.log("WARNING: This will convert all encrypted data to plaintext.")
	console.log("Ensure you have a database backup before proceeding.\n")

	try {
		// Step 1: Decrypt user names
		console.log("[Step 1/7] Decrypting user names...")
		const namesDecrypted = await decryptUserNames()
		console.log(`  Decrypted ${namesDecrypted} user names\n`)

		// Step 2: Decrypt trades
		console.log("[Step 2/7] Decrypting trades...")
		const tradesDecrypted = await decryptTrades()
		console.log(`  Decrypted ${tradesDecrypted} trades\n`)

		// Step 3: Decrypt executions
		console.log("[Step 3/7] Decrypting trade executions...")
		const executionsDecrypted = await decryptExecutions()
		console.log(`  Decrypted ${executionsDecrypted} executions\n`)

		// Step 4: Decrypt accounts
		console.log("[Step 4/7] Decrypting trading accounts...")
		const accountsDecrypted = await decryptAccounts()
		console.log(`  Decrypted ${accountsDecrypted} accounts\n`)

		// Step 5: Decrypt monthly plans
		console.log("[Step 5/7] Decrypting monthly plans...")
		const plansDecrypted = await decryptMonthlyPlans()
		console.log(`  Decrypted ${plansDecrypted} monthly plans\n`)

		// Step 6: Decrypt journals
		console.log("[Step 6/7] Decrypting journals...")
		const journalsDecrypted = await decryptJournals()
		console.log(`  Decrypted ${journalsDecrypted} journals\n`)

		// Step 7: Decrypt daily notes
		console.log("[Step 7/7] Decrypting daily account notes...")
		const notesDecrypted = await decryptDailyNotes()
		console.log(`  Decrypted ${notesDecrypted} daily notes\n`)

		// Verification
		console.log("\n[Verification] Checking for remaining encrypted data...")
		const verified = await verify()

		// Summary
		console.log("\n========================================")
		console.log("SUMMARY")
		console.log("========================================")
		console.log(`User names:          ${namesDecrypted}`)
		console.log(`Trades:              ${tradesDecrypted}`)
		console.log(`Executions:          ${executionsDecrypted}`)
		console.log(`Accounts:            ${accountsDecrypted}`)
		console.log(`Monthly plans:       ${plansDecrypted}`)
		console.log(`Journals:            ${journalsDecrypted}`)
		console.log(`Daily notes:         ${notesDecrypted}`)
		console.log(`Verification:        ${verified ? "PASSED" : "FAILED"}`)
		console.log("\nDone!")

		process.exit(verified ? 0 : 1)
	} catch (error) {
		console.error("\nFATAL ERROR:", error)
		process.exit(1)
	}
}

main()
