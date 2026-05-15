import { Suspense } from "react"
import { setRequestLocale } from "next-intl/server"
import { AnalyticsContent } from "@/components/analytics"
import { LoadingSpinner } from "@/components/shared"
import { getAnalyticsDashboard } from "@/app/actions/analytics"
import { getTagStats } from "@/app/actions/tags"
import { getUniqueAssets } from "@/app/actions/trades"
import { getTimeframes } from "@/app/actions/timeframes"
import { getUserAccounts } from "@/app/actions/auth"

interface AnalyticsPageProps {
	params: Promise<{ locale: string }>
}

const AnalyticsPage = async ({ params }: AnalyticsPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	// Fetch all initial data server-side in parallel
	const [
		dashboardResult,
		tagStatsResult,
		assetsResult,
		timeframesResult,
		userAccounts,
	] = await Promise.all([
		getAnalyticsDashboard(),
		getTagStats(),
		getUniqueAssets(),
		getTimeframes(),
		getUserAccounts(),
	])

	const initialDashboard =
		dashboardResult.status === "success" && dashboardResult.data
			? dashboardResult.data
			: null
	const initialTagStats =
		tagStatsResult.status === "success" && tagStatsResult.data
			? tagStatsResult.data
			: []
	const availableAssets =
		assetsResult.status === "success" && assetsResult.data
			? assetsResult.data
			: []
	const availableTimeframes = timeframesResult.map(
		(tf: { id: string; name: string }) => ({
			id: tf.id,
			name: tf.name,
		})
	)

	const accountOptions = userAccounts.map((a) => ({
		id: a.id,
		name: a.name,
		accountType: a.accountType,
	}))

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
				<Suspense fallback={<LoadingSpinner size="md" className="min-h-48" />}>
					<AnalyticsContent
						initialDashboard={initialDashboard}
						initialTagStats={initialTagStats}
						availableAssets={availableAssets}
						availableTimeframes={availableTimeframes}
						accounts={accountOptions}
					/>
				</Suspense>
			</div>
		</div>
	)
}

export { AnalyticsPage as default }
