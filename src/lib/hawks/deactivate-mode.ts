/**
 * Hawk's Mode — per-account deactivation.
 *
 * Flips `accountModes.mode` back to `default`, stamps `deactivatedAt`, and
 * removes only the Hawks-managed strategy/tag rows that activation seeded
 * (identified by `HWK_` code prefix and `Hawks ` name prefix). User-authored
 * playbook entries and tags are left untouched.
 *
 * `archivedState` is preserved for historical record so a future activation
 * can compare against the prior monthlyPlan snapshot if needed.
 *
 * @see docs/hawks-mode-research.md § 13.3
 */

import { db } from "@/db/drizzle"
import { accountModes, strategies, tags, tradingAccounts } from "@/db/schema"
import { and, eq, inArray } from "drizzle-orm"
import { HAWKS_STRATEGY_CODES, HAWKS_TAG_NAMES } from "@/lib/hawks/seed-data"

interface DeactivateInput {
	accountId: string
}

interface DeactivationResult {
	accountId: string
	mode: "default"
	deactivatedAt: Date
	archivedSnapshot: Record<string, unknown> | null
}

interface HawksModeStatus {
	mode: "default" | "hawks"
	accountId: string
}

const resolveUserIdForAccount = async (accountId: string): Promise<string | null> => {
	const account = await db.query.tradingAccounts.findFirst({
		where: eq(tradingAccounts.id, accountId),
		columns: { userId: true },
	})
	return account?.userId ?? null
}

const removeHawksSeedRows = async (userId: string): Promise<void> => {
	await Promise.all([
		db
			.delete(strategies)
			.where(
				and(
					eq(strategies.userId, userId),
					inArray(strategies.code, [...HAWKS_STRATEGY_CODES])
				)
			),
		db
			.delete(tags)
			.where(
				and(
					eq(tags.userId, userId),
					inArray(tags.name, [...HAWKS_TAG_NAMES])
				)
			),
	])
}

const deactivateHawksMode = async ({
	accountId,
}: DeactivateInput): Promise<DeactivationResult> => {
	const existing = await db.query.accountModes.findFirst({
		where: eq(accountModes.accountId, accountId),
	})

	const deactivatedAt = new Date()

	const userId = await resolveUserIdForAccount(accountId)
	if (userId) {
		await removeHawksSeedRows(userId)
	}

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
export type { DeactivateInput, DeactivationResult, HawksModeStatus }
