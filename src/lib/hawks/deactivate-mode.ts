/**
 * Hawk's Mode — per-account deactivation (Phase 1: skeleton only).
 *
 * Flips `accountModes.mode` back to `default` and stamps `deactivatedAt`.
 * Preserves `archivedState` so historical record of what was active before
 * Hawks remains queryable. No destructive cleanup of strategies / tags /
 * scenarios — Phase 2 cloning will add corresponding revert logic.
 *
 * @see docs/hawks-mode-research.md § 13.3
 */

import { db } from "@/db/drizzle"
import { accountModes } from "@/db/schema"
import { eq } from "drizzle-orm"

interface DeactivateInput {
	accountId: string
}

interface DeactivationResult {
	accountId: string
	mode: "default"
	deactivatedAt: Date
	archivedSnapshot: Record<string, unknown> | null
}

const deactivateHawksMode = async ({
	accountId,
}: DeactivateInput): Promise<DeactivationResult> => {
	const existing = await db.query.accountModes.findFirst({
		where: eq(accountModes.accountId, accountId),
	})

	const deactivatedAt = new Date()

	if (!existing) {
		await db.insert(accountModes).values({
			accountId,
			mode: "default",
			deactivatedAt,
		})
		return {
			accountId,
			mode: "default",
			deactivatedAt,
			archivedSnapshot: null,
		}
	}

	await db
		.update(accountModes)
		.set({
			mode: "default",
			deactivatedAt,
			updatedAt: deactivatedAt,
		})
		.where(eq(accountModes.id, existing.id))

	return {
		accountId,
		mode: "default",
		deactivatedAt,
		archivedSnapshot: existing.archivedState ?? null,
	}
}

const getAccountMode = async (
	accountId: string
): Promise<"default" | "hawks"> => {
	const row = await db.query.accountModes.findFirst({
		where: eq(accountModes.accountId, accountId),
	})
	return row?.mode ?? "default"
}

const isHawksModeActive = async (accountId: string): Promise<boolean> => {
	const mode = await getAccountMode(accountId)
	return mode === "hawks"
}

export { deactivateHawksMode, getAccountMode, isHawksModeActive }
export type { DeactivateInput, DeactivationResult }
