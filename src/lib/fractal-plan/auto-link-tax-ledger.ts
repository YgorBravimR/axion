import { db } from "@/db/drizzle"
import { monthlyPlan, monthlyTaxLedger } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { startOfMonth } from "date-fns"

interface AutoLinkInput {
	readonly accountId: string
	readonly year: number
	readonly month: number
	readonly monthlyPlanId: string
}

const autoLinkTaxLedger = async (input: AutoLinkInput): Promise<string | null> => {
	const monthDate = startOfMonth(new Date(input.year, input.month - 1, 1))
	const ledgerRow = await db.query.monthlyTaxLedger.findFirst({
		where: and(
			eq(monthlyTaxLedger.accountId, input.accountId),
			eq(monthlyTaxLedger.month, monthDate),
		),
	})
	if (!ledgerRow) return null

	await db
		.update(monthlyPlan)
		.set({ monthlyTaxLedgerId: ledgerRow.id })
		.where(eq(monthlyPlan.id, input.monthlyPlanId))

	await db
		.update(monthlyTaxLedger)
		.set({ monthlyPlanId: input.monthlyPlanId })
		.where(eq(monthlyTaxLedger.id, ledgerRow.id))

	return ledgerRow.id
}

export { autoLinkTaxLedger }
