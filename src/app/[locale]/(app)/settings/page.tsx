import { setRequestLocale } from "next-intl/server"
import { SettingsContent } from "@/components/settings"
import { getAssets, getAssetTypes } from "@/app/actions/assets"
import { getTimeframes } from "@/app/actions/timeframes"
import { getCurrentUser } from "@/app/actions/auth"
import { getAllUsersWithAccounts } from "@/app/actions/user-management"
import { seedBuiltInRiskProfiles } from "@/app/actions/seed-risk-profiles"

// Force dynamic rendering to ensure account-specific data
export const dynamic = "force-dynamic"

interface SettingsPageProps {
	params: Promise<{ locale: string }>
}

const SettingsPage = async ({ params }: SettingsPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	const [assets, assetTypes, timeframes, user] = await Promise.all([
		getAssets(),
		getAssetTypes(),
		getTimeframes(),
		getCurrentUser(),
	])

	const isAdmin = user?.role === "admin"

	// Idempotent: seeds the 5 professional risk models if they don't exist yet (admin-only)
	if (isAdmin) {
		await seedBuiltInRiskProfiles()
	}

	const usersWithAccounts = isAdmin ? await getAllUsersWithAccounts() : []

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
				<SettingsContent
					assets={assets}
					assetTypes={assetTypes}
					timeframes={timeframes}
					isAdmin={isAdmin}
					usersWithAccounts={usersWithAccounts}
					currentUserId={user?.id ?? ""}
				/>
			</div>
		</div>
	)
}

export default SettingsPage
