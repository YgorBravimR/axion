import { Suspense } from "react"
import { setRequestLocale } from "next-intl/server"
import { SettingsContent } from "@/components/settings"
import { LoadingSpinner } from "@/components/shared"
import { getAssets, getAssetTypes } from "@/app/actions/assets"
import { getTimeframes } from "@/app/actions/timeframes"
import { getCurrentUser } from "@/app/actions/auth"
import { getAllUsersWithAccounts } from "@/app/actions/user-management"
import { seedBuiltInRiskProfiles } from "@/app/actions/seed-risk-profiles"
import { getIndicatorGroups } from "@/app/actions/indicators"
import { requireRole } from "@/lib/auth-utils"
import { getActiveAccountModeForUser } from "@/lib/hawks/account-context"

interface SettingsPageProps {
	params: Promise<{ locale: string }>
}

const SettingsPage = async ({ params }: SettingsPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)
	await requireRole("trader")

	const [assets, assetTypes, timeframes, user, indicatorGroups, accountMode] =
		await Promise.all([
			getAssets(),
			getAssetTypes(),
			getTimeframes(),
			getCurrentUser(),
			getIndicatorGroups(),
			getActiveAccountModeForUser(),
		])

	const isAdmin = user?.role === "admin"

	// Idempotent: seeds the 5 professional risk models if they don't exist yet (admin-only)
	// Run seed + user fetch in parallel to avoid serial waterfall
	const [, usersWithAccounts] = await Promise.all([
		isAdmin ? seedBuiltInRiskProfiles() : Promise.resolve(undefined),
		isAdmin
			? getAllUsersWithAccounts()
			: Promise.resolve(
					[] as Awaited<ReturnType<typeof getAllUsersWithAccounts>>
				),
	])

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
				<Suspense fallback={<LoadingSpinner size="md" className="min-h-48" />}>
					<SettingsContent
						assets={assets}
						assetTypes={assetTypes}
						timeframes={timeframes}
						isAdmin={isAdmin}
						usersWithAccounts={usersWithAccounts}
						currentUserId={user?.id ?? ""}
						indicatorGroups={indicatorGroups}
						hawksModeActive={accountMode === "hawks"}
					/>
				</Suspense>
			</div>
		</div>
	)
}

export { SettingsPage as default }
