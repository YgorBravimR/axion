/**
 * Centralized cache invalidation.
 *
 * Every mutation in the app should call ONE of these functions instead of
 * scattering `revalidatePath` calls across action files. This guarantees
 * that every page consuming the affected data gets a fresh render.
 *
 * Tag-based invalidation (revalidateTag) busts "use cache" entries.
 * Path-based invalidation (revalidatePath) busts full-route cache.
 * Both are used together for maximum coverage.
 */

import { revalidatePath, revalidateTag } from "next/cache"
import { tradeTag, tradeAllTag, strategyTag, tagTag, settingsTag } from "./tags"

/* ------------------------------------------------------------------ */
/*  Path groups — which pages consume which data                       */
/* ------------------------------------------------------------------ */

const TRADE_PATHS = [
	"/",
	"/journal",
	"/analytics",
	"/reports",
	"/monthly",
	"/command-center",
] as const

const STRATEGY_PATHS = [
	"/playbook",
	"/journal",
	"/analytics",
] as const

const TAG_PATHS = [
	"/analytics",
	"/journal",
	"/settings",
] as const

const SETTINGS_PATHS = [
	"/settings",
	"/monthly",
] as const

const PLAYBOOK_PATHS = [
	"/playbook",
	"/settings",
] as const

const ACCOUNT_PATHS = [
	"/settings",
	"/command-center",
] as const

const MONTHLY_PLAN_PATHS = [
	"/monthly",
	"/command-center",
] as const

const ALL_PATHS = [
	"/",
	"/journal",
	"/analytics",
	"/reports",
	"/monthly",
	"/command-center",
	"/playbook",
	"/settings",
] as const

/* ------------------------------------------------------------------ */
/*  Invalidation functions                                             */
/* ------------------------------------------------------------------ */

/**
 * Call after trade CRUD, execution CRUD, CSV/OCR imports.
 * Also invalidates the specific trade detail page when tradeId is given.
 */
const invalidateTradeData = (tradeId?: string, userId?: string, accountId?: string) => {
	for (const path of TRADE_PATHS) revalidatePath(path)
	if (tradeId) revalidatePath(`/journal/${tradeId}`)
	if (userId && accountId) {
		revalidateTag(tradeTag(userId, accountId), "max")
		revalidateTag(tradeAllTag(userId), "max")
	}
}

/** Call after strategy create/update/delete/archive. */
const invalidateStrategyData = (userId?: string, accountId?: string) => {
	for (const path of STRATEGY_PATHS) revalidatePath(path)
	if (userId && accountId) {
		revalidateTag(strategyTag(userId, accountId), "max")
	}
}

/** Call after tag create/update/delete. */
const invalidateTagData = (userId?: string, accountId?: string) => {
	for (const path of TAG_PATHS) revalidatePath(path)
	if (userId && accountId) {
		revalidateTag(tagTag(userId, accountId), "max")
	}
}

/** Call after user settings changes (locale, currency, risk params, etc.). */
const invalidateSettingsData = (userId?: string) => {
	for (const path of SETTINGS_PATHS) revalidatePath(path)
	if (userId) {
		revalidateTag(settingsTag(userId), "max")
	}
}

/** Call after playbook scenario / trading condition changes. */
const invalidatePlaybookData = () => {
	for (const path of PLAYBOOK_PATHS) revalidatePath(path)
}

/** Call after account create/update/delete/archive. */
const invalidateAccountData = () => {
	for (const path of ACCOUNT_PATHS) revalidatePath(path)
}

/** Call after monthly plan updates. */
const invalidateMonthlyPlanData = () => {
	for (const path of MONTHLY_PLAN_PATHS) revalidatePath(path)
}

/** Call after account switch — nukes everything. */
const invalidateAllData = (userId?: string) => {
	for (const path of ALL_PATHS) revalidatePath(path)
	if (userId) {
		revalidateTag(tradeAllTag(userId), "max")
		revalidateTag(settingsTag(userId), "max")
	}
}

export {
	invalidateTradeData,
	invalidateStrategyData,
	invalidateTagData,
	invalidateSettingsData,
	invalidatePlaybookData,
	invalidateAccountData,
	invalidateMonthlyPlanData,
	invalidateAllData,
}
