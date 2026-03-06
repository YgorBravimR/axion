import { auth } from "@/auth"
import { hasAccess, type UserRole } from "@/lib/feature-access"

/**
 * Centralized role-based authorization for server actions.
 * Throws if the session user doesn't meet the minimum role requirement.
 *
 * @returns The authenticated user's ID
 */
const requireRole = async (minimumRole: UserRole): Promise<string> => {
	const session = await auth()
	if (!session?.user?.id) {
		throw new Error("Unauthorized")
	}
	if (!hasAccess(session.user.role ?? "trader", minimumRole)) {
		throw new Error("Forbidden")
	}
	return session.user.id
}

export { requireRole }
