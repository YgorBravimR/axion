"use client"

import { useSession } from "next-auth/react"
import { canAccessFeature, hasAccess, type UserRole } from "@/lib/feature-access"

const useFeatureAccess = () => {
	const session = useSession()
	const role: UserRole = session.data?.user?.role ?? "viewer"

	return {
		role,
		canAccess: (featureKey: string) => canAccessFeature(role, featureKey),
		isAdmin: role === "admin",
		isTrader: hasAccess(role, "trader"),
	}
}

export { useFeatureAccess }
