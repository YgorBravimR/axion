"use client"

import { useSession } from "next-auth/react"
import { canAccessFeature, hasAccess, type UserRole } from "@/lib/feature-access"

const useFeatureAccess = () => {
	const session = useSession()
	const isLoading = session.status === "loading"
	const role: UserRole = session.data?.user?.role ?? "trader"

	return {
		role,
		isLoading,
		canAccess: (featureKey: string) => canAccessFeature(role, featureKey),
		isAdmin: role === "admin",
		isTrader: hasAccess(role, "trader"),
	}
}

export { useFeatureAccess }
