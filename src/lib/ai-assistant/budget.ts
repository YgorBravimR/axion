/**
 * AI Assistant — per-user monthly cost ceiling.
 *
 * Enforces the hard server-side cap from Phase-1 spec §6 + the admin-managed
 * `monthlyCostCapCents` in `ai_assistant_config`. The check happens BEFORE
 * any Anthropic API call so a runaway loop or a budget mistake can't burn
 * real money.
 *
 * Usage in the agent loop (PR 3):
 *   ```ts
 *   const { allowed, capCents, spentCents } = await assertWithinBudget(userId)
 *   if (!allowed) {
 *     return { error: "BUDGET_EXCEEDED", capCents, spentCents }
 *   }
 *   // ... run LLM turn ...
 *   await recordSpend({ userId, costCents, tokensIn, tokensOut })
 *   ```
 *
 * Concurrency safety: `recordSpend()` uses an UPSERT (`onConflictDoUpdate`)
 * with `EXCLUDED + existing` arithmetic, so parallel turns from the same
 * user atomically accumulate. No read-modify-write races.
 *
 * Month boundary: the year-month key is derived in UTC (`YYYY-MM`).
 * Lexicographic comparison = chronological. The rollover is implicit — a
 * new month produces a new PK row on first write.
 */
import { eq, sql } from "drizzle-orm"
import { db } from "@/db/drizzle"
import {
	aiAssistantConfig,
	aiAssistantUsage,
	type AiAssistantConfig,
} from "@/db/schema"

const DEFAULT_CAP_CENTS = 500

interface BudgetStatus {
	allowed: boolean
	capCents: number
	spentCents: number
	yearMonth: string
}

interface SpendRecord {
	userId: string
	costCents: number
	tokensIn: number
	tokensOut: number
}

/** UTC year-month key. `new Date()` is fine here — this is server-side
 * runtime accounting, not a workflow that needs determinism. */
const currentYearMonth = (): string => {
	const now = new Date()
	const year = now.getUTCFullYear()
	const month = String(now.getUTCMonth() + 1).padStart(2, "0")
	return `${year}-${month}`
}

/** Read the admin-managed cap. Falls back to DEFAULT_CAP_CENTS only if the
 * config row is missing (shouldn't happen post-migration; defensive). */
const getCapCents = async (): Promise<number> => {
	const [row]: AiAssistantConfig[] = await db
		.select()
		.from(aiAssistantConfig)
		.where(eq(aiAssistantConfig.id, 1))
		.limit(1)
	return row?.monthlyCostCapCents ?? DEFAULT_CAP_CENTS
}

/** Read this user's current month spend. Returns 0 if no row yet (first
 * turn of the month). */
const getMonthlySpend = async (userId: string): Promise<number> => {
	const yearMonth = currentYearMonth()
	const [row] = await db
		.select({ costCents: aiAssistantUsage.costCents })
		.from(aiAssistantUsage)
		.where(
			sql`${aiAssistantUsage.userId} = ${userId} AND ${aiAssistantUsage.yearMonth} = ${yearMonth}`
		)
		.limit(1)
	return row?.costCents ?? 0
}

/** Pre-flight check before an LLM call. Cheap (1 indexed read on
 * ai_assistant_config + 1 PK lookup on ai_assistant_usage). */
const assertWithinBudget = async (userId: string): Promise<BudgetStatus> => {
	const yearMonth = currentYearMonth()
	const [capCents, spentCents] = await Promise.all([
		getCapCents(),
		getMonthlySpend(userId),
	])
	return {
		allowed: spentCents < capCents,
		capCents,
		spentCents,
		yearMonth,
	}
}

/** Atomic accumulation after a successful LLM turn. Race-safe via UPSERT:
 * concurrent calls from the same user in the same month accumulate without
 * lost-update bugs. */
const recordSpend = async ({
	userId,
	costCents,
	tokensIn,
	tokensOut,
}: SpendRecord): Promise<void> => {
	const yearMonth = currentYearMonth()
	await db
		.insert(aiAssistantUsage)
		.values({
			userId,
			yearMonth,
			costCents,
			tokensIn,
			tokensOut,
			messageCount: 1,
		})
		.onConflictDoUpdate({
			target: [aiAssistantUsage.userId, aiAssistantUsage.yearMonth],
			set: {
				costCents: sql`${aiAssistantUsage.costCents} + EXCLUDED.cost_cents`,
				tokensIn: sql`${aiAssistantUsage.tokensIn} + EXCLUDED.tokens_in`,
				tokensOut: sql`${aiAssistantUsage.tokensOut} + EXCLUDED.tokens_out`,
				messageCount: sql`${aiAssistantUsage.messageCount} + 1`,
				updatedAt: sql`now()`,
			},
		})
}

export {
	assertWithinBudget,
	currentYearMonth,
	getCapCents,
	getMonthlySpend,
	recordSpend,
}
export type { BudgetStatus, SpendRecord }
