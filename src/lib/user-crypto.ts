/**
 * Per-user DEK (Data Encryption Key) retrieval and field-level encrypt/decrypt helpers.
 *
 * Uses React.cache() to deduplicate DEK lookups within a single request,
 * matching the same pattern as requireAuth().
 */

import { cache } from "react"
// Imports preserved for re-activation of field-level encryption:
// import { eq } from "drizzle-orm"
// import { db } from "@/db/drizzle"
// import { users } from "@/db/schema"
// import { decryptDek } from "@/lib/crypto"
import { encryptField, decryptField, decryptNumericField } from "@/lib/crypto"

// ==========================================
// DEK RETRIEVAL (cached per-request)
// ==========================================

/**
 * Get the decrypted DEK for a user. Cached per-request via React.cache().
 * Returns null if the user has no DEK (pre-migration user) or decryption fails.
 */
const getUserDek = cache(async (_userId: string): Promise<string | null> => {
	// Field-level encryption disabled. Infrastructure preserved for re-activation.
	// To re-enable: uncomment original implementation below and run scripts/migrate-encrypt-existing-data.ts
	return null

	// --- ORIGINAL IMPLEMENTATION (preserved for re-activation) ---
	// const user = await db.query.users.findFirst({
	// 	where: eq(users.id, userId),
	// 	columns: { encryptedDek: true },
	// })
	// if (!user?.encryptedDek) return null
	// const dek = decryptDek(user.encryptedDek)
	// if (!dek) {
	// 	console.error(
	// 		`[getUserDek] Failed to decrypt DEK for user ${userId}. ` +
	// 		"This likely means ENCRYPTION_MASTER_KEY is missing or differs from the key used to encrypt the data."
	// 	)
	// }
	// return dek
})

// ==========================================
// TRADE FIELD ENCRYPTION/DECRYPTION
// ==========================================

interface TradeEncryptableFields {
	pnl?: number | null
	plannedRiskAmount?: number | null
	commission?: number | null
	fees?: number | null
	entryPrice?: string | number | null
	exitPrice?: string | number | null
	positionSize?: string | number | null
	stopLoss?: string | number | null
	takeProfit?: string | number | null
	plannedRMultiple?: string | number | null
	preTradeThoughts?: string | null
	postTradeReflection?: string | null
	lessonLearned?: string | null
	disciplineNotes?: string | null
}

interface TradeEncryptedFields {
	pnl: string | null
	plannedRiskAmount: string | null
	commission: string | null
	fees: string | null
	entryPrice: string | null
	exitPrice: string | null
	positionSize: string | null
	stopLoss: string | null
	takeProfit: string | null
	plannedRMultiple: string | null
	preTradeThoughts: string | null
	postTradeReflection: string | null
	lessonLearned: string | null
	disciplineNotes: string | null
}

/**
 * Encrypt trade fields before writing to the database.
 * Only encrypts fields that are present (not undefined).
 */
const encryptTradeFields = (fields: TradeEncryptableFields, dek: string): Partial<TradeEncryptedFields> => {
	const result: Partial<TradeEncryptedFields> = {}

	if (fields.pnl !== undefined) result.pnl = encryptField(fields.pnl, dek)
	if (fields.plannedRiskAmount !== undefined) result.plannedRiskAmount = encryptField(fields.plannedRiskAmount, dek)
	if (fields.commission !== undefined) result.commission = encryptField(fields.commission, dek)
	if (fields.fees !== undefined) result.fees = encryptField(fields.fees, dek)
	if (fields.entryPrice !== undefined) result.entryPrice = encryptField(fields.entryPrice, dek)
	if (fields.exitPrice !== undefined) result.exitPrice = encryptField(fields.exitPrice, dek)
	if (fields.positionSize !== undefined) result.positionSize = encryptField(fields.positionSize, dek)
	if (fields.stopLoss !== undefined) result.stopLoss = encryptField(fields.stopLoss, dek)
	if (fields.takeProfit !== undefined) result.takeProfit = encryptField(fields.takeProfit, dek)
	if (fields.plannedRMultiple !== undefined) result.plannedRMultiple = encryptField(fields.plannedRMultiple, dek)
	if (fields.preTradeThoughts !== undefined) result.preTradeThoughts = encryptField(fields.preTradeThoughts, dek)
	if (fields.postTradeReflection !== undefined) result.postTradeReflection = encryptField(fields.postTradeReflection, dek)
	if (fields.lessonLearned !== undefined) result.lessonLearned = encryptField(fields.lessonLearned, dek)
	if (fields.disciplineNotes !== undefined) result.disciplineNotes = encryptField(fields.disciplineNotes, dek)

	return result
}

/**
 * Decrypt a trade record from the database.
 * Returns a new object with decrypted numeric and text fields.
 */
const decryptTradeFields = <T extends Record<string, unknown>>(trade: T, dek: string): T => {
	return {
		...trade,
		pnl: decryptNumericField(trade.pnl as string | null, dek),
		plannedRiskAmount: decryptNumericField(trade.plannedRiskAmount as string | null, dek),
		commission: decryptNumericField(trade.commission as string | null, dek),
		fees: decryptNumericField(trade.fees as string | null, dek),
		entryPrice: decryptField(trade.entryPrice as string | null, dek),
		exitPrice: decryptField(trade.exitPrice as string | null, dek),
		positionSize: decryptField(trade.positionSize as string | null, dek),
		stopLoss: decryptField(trade.stopLoss as string | null, dek),
		takeProfit: decryptField(trade.takeProfit as string | null, dek),
		plannedRMultiple: decryptField(trade.plannedRMultiple as string | null, dek),
		preTradeThoughts: decryptField(trade.preTradeThoughts as string | null, dek),
		postTradeReflection: decryptField(trade.postTradeReflection as string | null, dek),
		lessonLearned: decryptField(trade.lessonLearned as string | null, dek),
		disciplineNotes: decryptField(trade.disciplineNotes as string | null, dek),
	}
}

// ==========================================
// EXECUTION FIELD ENCRYPTION/DECRYPTION
// ==========================================

interface ExecutionEncryptableFields {
	price?: string | number | null
	quantity?: string | number | null
	commission?: number | null
	fees?: number | null
	slippage?: number | null
	executionValue?: number | null
}

const encryptExecutionFields = (fields: ExecutionEncryptableFields, dek: string): Record<string, string | null> => {
	const result: Record<string, string | null> = {}

	if (fields.price !== undefined) result.price = encryptField(fields.price, dek)
	if (fields.quantity !== undefined) result.quantity = encryptField(fields.quantity, dek)
	if (fields.commission !== undefined) result.commission = encryptField(fields.commission, dek)
	if (fields.fees !== undefined) result.fees = encryptField(fields.fees, dek)
	if (fields.slippage !== undefined) result.slippage = encryptField(fields.slippage, dek)
	if (fields.executionValue !== undefined) result.executionValue = encryptField(fields.executionValue, dek)

	return result
}

const decryptExecutionFields = <T extends Record<string, unknown>>(execution: T, dek: string): T => {
	return {
		...execution,
		price: decryptField(execution.price as string | null, dek),
		quantity: decryptField(execution.quantity as string | null, dek),
		commission: decryptNumericField(execution.commission as string | null, dek),
		fees: decryptNumericField(execution.fees as string | null, dek),
		slippage: decryptNumericField(execution.slippage as string | null, dek),
		executionValue: decryptNumericField(execution.executionValue as string | null, dek),
	}
}

// ==========================================
// ACCOUNT FIELD ENCRYPTION/DECRYPTION
// ==========================================

const encryptAccountFields = (fields: Record<string, unknown>, dek: string): Record<string, string | null> => {
	const encryptableKeys = [
		"dayTradeTaxRate", "swingTradeTaxRate", "profitSharePercentage",
		"propFirmName",
	]
	const result: Record<string, string | null> = {}
	for (const key of encryptableKeys) {
		if (fields[key] !== undefined) {
			result[key] = encryptField(fields[key] as string | number | null, dek)
		}
	}
	return result
}

const decryptAccountFields = <T extends Record<string, unknown>>(account: T, dek: string): T => {
	return {
		...account,
		dayTradeTaxRate: decryptField(account.dayTradeTaxRate as string | null, dek),
		swingTradeTaxRate: decryptField(account.swingTradeTaxRate as string | null, dek),
		profitSharePercentage: decryptField(account.profitSharePercentage as string | null, dek),
		propFirmName: decryptField(account.propFirmName as string | null, dek),
	}
}

// ==========================================
// MONTHLY PLAN FIELD ENCRYPTION/DECRYPTION
// ==========================================

const encryptMonthlyPlanFields = (fields: Record<string, unknown>, dek: string): Record<string, string | null> => {
	const encryptableKeys = [
		"accountBalance", "riskPerTradeCents", "dailyLossCents", "monthlyLossCents", "weeklyLossCents",
	]
	const result: Record<string, string | null> = {}
	for (const key of encryptableKeys) {
		if (fields[key] !== undefined) {
			result[key] = encryptField(fields[key] as string | number | null, dek)
		}
	}
	return result
}

const decryptMonthlyPlanFields = <T extends Record<string, unknown>>(plan: T, dek: string): T => {
	return {
		...plan,
		accountBalance: decryptNumericField(plan.accountBalance as string | null, dek),
		riskPerTradeCents: decryptNumericField(plan.riskPerTradeCents as string | null, dek),
		dailyLossCents: decryptNumericField(plan.dailyLossCents as string | null, dek),
		monthlyLossCents: decryptNumericField(plan.monthlyLossCents as string | null, dek),
		weeklyLossCents: decryptNumericField(plan.weeklyLossCents as string | null, dek),
	}
}

// ==========================================
// JOURNAL FIELD ENCRYPTION/DECRYPTION
// ==========================================

const encryptJournalFields = (fields: Record<string, unknown>, dek: string): Record<string, string | null> => {
	const encryptableKeys = ["marketOutlook", "focusGoals", "keyTakeaways", "sessionReview"]
	const result: Record<string, string | null> = {}
	for (const key of encryptableKeys) {
		if (fields[key] !== undefined) {
			result[key] = encryptField(fields[key] as string | null, dek)
		}
	}
	return result
}

const decryptJournalFields = <T extends Record<string, unknown>>(journal: T, dek: string): T => {
	return {
		...journal,
		marketOutlook: decryptField(journal.marketOutlook as string | null, dek),
		focusGoals: decryptField(journal.focusGoals as string | null, dek),
		keyTakeaways: decryptField(journal.keyTakeaways as string | null, dek),
		sessionReview: decryptField(journal.sessionReview as string | null, dek),
	}
}

// ==========================================
// DAILY NOTES FIELD ENCRYPTION/DECRYPTION
// ==========================================

const encryptDailyNotesFields = (fields: Record<string, unknown>, dek: string): Record<string, string | null> => {
	const encryptableKeys = ["preMarketNotes", "postMarketNotes"]
	const result: Record<string, string | null> = {}
	for (const key of encryptableKeys) {
		if (fields[key] !== undefined) {
			result[key] = encryptField(fields[key] as string | null, dek)
		}
	}
	return result
}

const decryptDailyNotesFields = <T extends Record<string, unknown>>(notes: T, dek: string): T => {
	return {
		...notes,
		preMarketNotes: decryptField(notes.preMarketNotes as string | null, dek),
		postMarketNotes: decryptField(notes.postMarketNotes as string | null, dek),
	}
}

export {
	getUserDek,
	encryptTradeFields,
	decryptTradeFields,
	encryptExecutionFields,
	decryptExecutionFields,
	encryptAccountFields,
	decryptAccountFields,
	encryptMonthlyPlanFields,
	decryptMonthlyPlanFields,
	encryptJournalFields,
	decryptJournalFields,
	encryptDailyNotesFields,
	decryptDailyNotesFields,
}
