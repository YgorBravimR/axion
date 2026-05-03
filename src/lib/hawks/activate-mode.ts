/**
 * Hawk's Mode — per-account activation (Phase 1: skeleton only).
 *
 * Flips `accountModes.mode` to `hawks` for the given account, archives a
 * lightweight snapshot of pre-activation state into `archivedState` so
 * deactivation can restore it. Heavy seeding (clone strategy / tags /
 * scenarios / checklists / link risk profile) is deferred to Phase 2.
 *
 * @see docs/hawks-mode-research.md § 13.2
 */

import { db } from "@/db/drizzle"
import { accountModes, monthlyPlans, riskManagementProfiles } from "@/db/schema"
import { and, desc, eq } from "drizzle-orm"

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
		},
	}
}

const activateHawksMode = async ({ accountId }: ActivateInput): Promise<ActivationResult> => {
	const archivedSnapshot = await buildArchivedSnapshot(accountId)
	const activatedAt = new Date()

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
