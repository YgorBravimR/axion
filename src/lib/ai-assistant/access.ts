/**
 * AI Assistant — runtime visibility resolver.
 *
 * Single source of truth for "is the AI Assistant visible to this user right
 * now, on this surface?" Used by:
 *   - UI trigger components (return null when false → zero DOM nodes).
 *   - `/api/ai/narrate` route (return 404 when false — indistinguishable
 *     from "this endpoint doesn't exist" to keep the assistant invisible
 *     even at the network layer).
 *   - Future Phase 1.5+ surface gates.
 *
 * Three gates, all must pass:
 *   1. Build-time env (`isAiAssistantBuildEnabled()` — checks
 *      `ANTHROPIC_API_KEY` + `AI_ASSISTANT_ENABLED=1`).
 *   2. DB config (`ai_assistant_config.enabled = true`).
 *   3. User permission (role in `allowedRoles` OR user_id in
 *      `allowedUserIds` allowlist).
 *   4. Surface permission (if a surface is passed: surface in
 *      `allowedSurfaces`).
 *
 * If any gate fails: returns `{ canUse: false, reason }`. Callers MUST treat
 * this as "feature does not exist" — never surface the reason to the user.
 * `reason` is only for server-side logging and the admin telemetry page.
 *
 * Caching: the DB config read is `React.cache`-wrapped so multiple checks
 * within a single request share one query (matches the `getCachedSession`
 * pattern in `src/lib/auth-utils.ts`).
 *
 * Failure mode: if the config row doesn't exist (fresh DB, no migration run
 * yet), this returns `{ canUse: false, reason: "config_missing" }` — the
 * assistant stays invisible by default until an admin explicitly enables it.
 */
import { cache } from "react"
import { eq } from "drizzle-orm"
import { db } from "@/db/drizzle"
import { aiAssistantConfig, type AiAssistantConfig } from "@/db/schema"
import { getCachedSession } from "@/lib/auth-utils"
import { isAiAssistantBuildEnabled } from "@/lib/flags/ai-assistant"
import type { UserRole } from "@/lib/feature-access"

type AccessDenyReason =
	| "build_disabled"
	| "no_session"
	| "config_missing"
	| "globally_disabled"
	| "role_not_allowed"
	| "user_not_allowlisted"
	| "surface_not_allowed"

type AccessResult =
	| { canUse: true; config: AiAssistantConfig; userId: string; role: UserRole }
	| { canUse: false; reason: AccessDenyReason }

/**
 * Per-request cached config read. Returns the singleton config row or null
 * when the row doesn't exist (fresh install, migration not yet applied).
 */
const getCachedConfig = cache(async (): Promise<AiAssistantConfig | null> => {
	const [row] = await db
		.select()
		.from(aiAssistantConfig)
		.where(eq(aiAssistantConfig.id, 1))
		.limit(1)
	return row ?? null
})

/**
 * Resolve whether the AI Assistant is visible to the current session on the
 * given surface. Pass `surface` to gate per-surface (Phase 1.5+); omit for a
 * global "is the assistant available at all?" check.
 */
const canUseAiAssistant = async (surface?: string): Promise<AccessResult> => {
	// Gate 1: build-time env. Cheapest check, sync, no DB round-trip.
	if (!isAiAssistantBuildEnabled()) {
		return { canUse: false, reason: "build_disabled" }
	}

	// Gate 2: authenticated session.
	const session = await getCachedSession()
	if (!session?.user?.id) {
		return { canUse: false, reason: "no_session" }
	}
	const userId = session.user.id
	const role = (session.user.role ?? "trader") as UserRole

	// Gate 3: admin-managed DB config.
	const config = await getCachedConfig()
	if (!config) {
		return { canUse: false, reason: "config_missing" }
	}
	if (!config.enabled) {
		return { canUse: false, reason: "globally_disabled" }
	}

	// Gate 4: per-user allowlist (overrides role check when non-empty) OR
	// role check. allowedUserIds is the "dogfood on Ygor's account only"
	// path before broader rollout.
	const allowedUserIds = (config.allowedUserIds ?? []) as string[]
	const allowedRoles = (config.allowedRoles ?? ["admin"]) as UserRole[]
	if (allowedUserIds.length > 0) {
		if (!allowedUserIds.includes(userId)) {
			return { canUse: false, reason: "user_not_allowlisted" }
		}
	} else if (!allowedRoles.includes(role)) {
		return { canUse: false, reason: "role_not_allowed" }
	}

	// Gate 4b: per-surface gate (optional). Skipped when surface is not passed
	// (caller asking "available at all?" rather than "available here?").
	if (surface !== undefined) {
		const allowedSurfaces = config.allowedSurfaces as unknown as string[]
		if (!allowedSurfaces.includes(surface)) {
			return { canUse: false, reason: "surface_not_allowed" }
		}
	}

	return { canUse: true, config, userId, role }
}

export { canUseAiAssistant }
export type { AccessResult, AccessDenyReason }
