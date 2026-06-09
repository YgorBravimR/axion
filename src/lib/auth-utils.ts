import { cache } from "react"
import { auth } from "@/auth"
import { hasAccess, type UserRole } from "@/lib/feature-access"

/**
 * Cached session getter — deduplicates auth() calls within a single request.
 * Multiple role checks share one JWT decode.
 */
const getCachedSession = cache(async () => auth())

/**
 * Centralized role-based authorization for server actions.
 * Throws if the session user doesn't meet the minimum role requirement.
 *
 * @returns The authenticated user's ID
 */
const requireRole = async (minimumRole: UserRole): Promise<string> => {
	const session = await getCachedSession()
	if (!session?.user?.id) {
		throw new Error("Unauthorized")
	}
	if (!hasAccess(session.user.role ?? "trader", minimumRole)) {
		throw new Error("Forbidden")
	}
	return session.user.id
}

export { requireRole, getCachedSession }
