"use client"

import { useCallback, useMemo } from "react"
import { useSession } from "next-auth/react"
import { canAccessFeature, hasAccess, getFeatureLimits, type UserRole } from "@/lib/feature-access"

const useFeatureAccess = () => {
	const session = useSession()
	const isLoading = session.status === "loading"
	const role: UserRole = session.data?.user?.role ?? "trader"

	const canAccess = useCallback((featureKey: string) => canAccessFeature(role, featureKey), [role])
	const limits = useMemo(() => getFeatureLimits(role), [role])

	return useMemo(() => ({
		role,
		isLoading,
		canAccess,
		isAdmin: role === "admin",
		isPremium: hasAccess(role, "premium"),
		isTrader: hasAccess(role, "trader"),
		limits,
	}), [role, isLoading, canAccess, limits])
}

export { useFeatureAccess }
