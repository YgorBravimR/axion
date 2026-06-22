/**
 * Tool: `get_account_context`
 *
 * Return the active account's framing context: currency, starting balance,
 * the latest yearly plan (for ladder + initial capital). Scoped via
 * `requireAuth()`.
 *
 * Lets the agent frame per-trade R-values in the user's actual capital
 * reality ("at your current T1 of R$300/R, this -1.2R trade cost ~R$360").
 * The agent must NOT use this to propose ladder values — that's the
 * Ladder Assistant's job (Phase 1.5f boundary).
 */
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"
import { db } from "@/db/drizzle"
import {
	tradingAccounts,
	yearlyPlans,
	type TradingAccount,
	type YearlyPlan,
} from "@/db/schema"

const inputSchema = z.object({})

type Input = z.infer<typeof inputSchema>

interface Output {
	account: Pick<
		TradingAccount,
		"id" | "name" | "defaultCurrency" | "startingBalanceCents"
	>
	latestYearlyPlan: Pick<
		YearlyPlan,
		"id" | "year" | "initialCapitalCents" | "ladderRules"
	> | null
}

const getAccountContext = async (_rawInput: Input): Promise<Output> => {
	const { accountId } = await requireAuth()

	const [account] = await db
		.select({
			id: tradingAccounts.id,
			name: tradingAccounts.name,
			defaultCurrency: tradingAccounts.defaultCurrency,
			startingBalanceCents: tradingAccounts.startingBalanceCents,
		})
		.from(tradingAccounts)
		.where(eq(tradingAccounts.id, accountId))
		.limit(1)

	if (!account) {
		// Should not happen — requireAuth guarantees an active account row.
		// Defensive throw: surfaces as a tool-call error in the agent loop,
		// never reaches the user.
		throw new Error("Active account not found")
	}

	const [plan] = await db
		.select({
			id: yearlyPlans.id,
			year: yearlyPlans.year,
			initialCapitalCents: yearlyPlans.initialCapitalCents,
			ladderRules: yearlyPlans.ladderRules,
		})
		.from(yearlyPlans)
		.where(and(eq(yearlyPlans.accountId, accountId)))
		.orderBy(desc(yearlyPlans.year))
		.limit(1)

	return {
		account,
		latestYearlyPlan: plan ?? null,
	}
}

export { getAccountContext, inputSchema }
export type { Input, Output }
