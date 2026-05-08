// src/lib/tax/mark-dirty.ts
import { db } from "@/db/drizzle"
import { monthlyTaxLedger } from "@/db/schema"
import { eq, and, gte } from "drizzle-orm"
import { startOfMonth } from "date-fns"

/**
 * Marks the monthly_tax_ledger row for the given account + month as dirty.
 * Also marks all subsequent months dirty (carryover propagation).
 * Called whenever a trade is created, updated, or deleted.
 *
 * @param accountId - trading account UUID
 * @param tradeDate - any date within the affected month
 */
const markTaxLedgerDirty = async (accountId: string, tradeDate: Date): Promise<void> => {
	const monthStart = startOfMonth(tradeDate)

	// Mark affected month and all future months dirty (carryover chain)
	await db
		.update(monthlyTaxLedger)
		.set({ isDirty: true })
		.where(
			and(
				eq(monthlyTaxLedger.accountId, accountId),
				gte(monthlyTaxLedger.month, monthStart),
			),
		)
}

export { markTaxLedgerDirty }
