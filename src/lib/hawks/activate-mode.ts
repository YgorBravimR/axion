/**
 * Hawk's Mode — per-account activation.
 *
 * Flips `accountModes.mode` to `hawks`, archives a snapshot of the active
 * monthly plan, and seeds Hawks-managed strategies + tags into the user's
 * existing playbook/tag tables (idempotent upsert by code/name).
 *
 * Seeded rows are marker-prefixed (`HWK_` codes, `Hawks ` names) so that
 * {@link deactivateHawksMode} can remove only what activation introduced
 * without touching user-authored playbook entries.
 *
 * @see docs/hawks-mode-research.md § 13.2
 */

import { db } from "@/db/drizzle"
import {
	accountModes,
	dailyChecklists,
	monthlyPlans,
	riskManagementProfiles,
	strategies,
	tags,
	tradingAccounts,
} from "@/db/schema"
import { and, desc, eq } from "drizzle-orm"
import {
	HAWKS_CHECKLIST_ITEMS,
	HAWKS_CHECKLIST_NAME,
	HAWKS_DAILY_TRADE_CAP,
	HAWKS_STRATEGIES,
	HAWKS_TAGS,
} from "@/lib/hawks/seed-data"

interface ActivateInput {
	accountId: string
}

interface ActivationResult {
	accountId: string
	mode: "hawks"
	activatedAt: Date
	archivedSnapshot: Record<string, unknown>
}

const buildArchivedSnapshot = async (accountId: string): Promise<Record<string, unknown>> => {
	const activePlan = await db.query.monthlyPlans.findFirst({
		where: eq(monthlyPlans.accountId, accountId),
		orderBy: [desc(monthlyPlans.year), desc(monthlyPlans.month)],
	})

	if (!activePlan) {
		return { capturedAt: new Date().toISOString(), monthlyPlan: null }
	}

	return {
		capturedAt: new Date().toISOString(),
		monthlyPlan: {
			id: activePlan.id,
			year: activePlan.year,
			month: activePlan.month,
			riskProfileId: activePlan.riskProfileId,
			maxDailyTrades: activePlan.maxDailyTrades,
		},
	}
}

const enforceDailyTradeCap = async (accountId: string): Promise<void> => {
	const activePlan = await db.query.monthlyPlans.findFirst({
		where: eq(monthlyPlans.accountId, accountId),
		orderBy: [desc(monthlyPlans.year), desc(monthlyPlans.month)],
		columns: { id: true, maxDailyTrades: true },
	})
	if (!activePlan) return
	if (activePlan.maxDailyTrades === HAWKS_DAILY_TRADE_CAP) return
	await db
		.update(monthlyPlans)
		.set({ maxDailyTrades: HAWKS_DAILY_TRADE_CAP, updatedAt: new Date() })
		.where(eq(monthlyPlans.id, activePlan.id))
}

const seedHawksChecklist = async (
	userId: string,
	accountId: string
): Promise<void> => {
	const existing = await db.query.dailyChecklists.findFirst({
		where: and(
			eq(dailyChecklists.userId, userId),
			eq(dailyChecklists.accountId, accountId),
			eq(dailyChecklists.name, HAWKS_CHECKLIST_NAME)
		),
		columns: { id: true },
	})
	if (existing) return
	await db.insert(dailyChecklists).values({
		userId,
		accountId,
		name: HAWKS_CHECKLIST_NAME,
		items: JSON.stringify(HAWKS_CHECKLIST_ITEMS),
		isActive: true,
	})
}

const resolveUserIdForAccount = async (accountId: string): Promise<string | null> => {
	const account = await db.query.tradingAccounts.findFirst({
		where: eq(tradingAccounts.id, accountId),
		columns: { userId: true },
	})
	return account?.userId ?? null
}

const seedHawksStrategiesAndTags = async (userId: string) => {
	const strategyValues = HAWKS_STRATEGIES.map((seed) => ({
		userId,
		code: seed.code,
		name: seed.name,
		description: seed.description,
		entryCriteria: seed.entryCriteria,
		exitCriteria: seed.exitCriteria,
		riskRules: seed.riskRules,
		targetRMultiple: seed.targetRMultiple,
		maxRiskPercent: seed.maxRiskPercent,
		isActive: true,
	}))

	const tagValues = HAWKS_TAGS.map((seed) => ({
		userId,
		name: seed.name,
		type: seed.type,
		color: seed.color,
		description: seed.description,
	}))

	await Promise.all([
		db.insert(strategies).values(strategyValues).onConflictDoNothing({
			target: [strategies.userId, strategies.code],
		}),
		db.insert(tags).values(tagValues).onConflictDoNothing({
			target: [tags.userId, tags.name],
		}),
	])
}

const activateHawksMode = async ({ accountId }: ActivateInput): Promise<ActivationResult> => {
	const archivedSnapshot = await buildArchivedSnapshot(accountId)
	const activatedAt = new Date()

	const userId = await resolveUserIdForAccount(accountId)
	if (userId) {
		await seedHawksStrategiesAndTags(userId)
		await seedHawksChecklist(userId, accountId)
	}
	await enforceDailyTradeCap(accountId)

	const existing = await db.query.accountModes.findFirst({
		where: eq(accountModes.accountId, accountId),
	})

	if (existing) {
		await db
			.update(accountModes)
			.set({
				mode: "hawks",
				archivedState: archivedSnapshot,
				activatedAt,
				deactivatedAt: null,
				updatedAt: activatedAt,
			})
			.where(eq(accountModes.id, existing.id))
	} else {
		await db.insert(accountModes).values({
			accountId,
			mode: "hawks",
			archivedState: archivedSnapshot,
			activatedAt,
		})
	}

	return {
		accountId,
		mode: "hawks",
		activatedAt,
		archivedSnapshot,
	}
}

const getHawksRiskProfileId = async (): Promise<string | null> => {
	const profile = await db.query.riskManagementProfiles.findFirst({
		where: and(
			eq(riskManagementProfiles.name, "Hawks — Capital ÷ 20"),
			eq(riskManagementProfiles.isActive, true)
		),
	})
	return profile?.id ?? null
}

export { activateHawksMode, getHawksRiskProfileId }
export type { ActivateInput, ActivationResult }
