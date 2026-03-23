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
	const pageStart = performance.now()

	const { locale } = await params
	setRequestLocale(locale)

	// Fetch all initial data server-side in parallel
	const [dashboardResult, tagStatsResult, assetsResult, timeframesResult] =
		await Promise.all([
			getAnalyticsDashboard(),
			getTagStats(),
			getUniqueAssets(),
			getTimeframes(),
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
	const availableTimeframes = timeframesResult.map((tf: { id: string; name: string }) => ({
		id: tf.id,
		name: tf.name,
	}))

	// Get account count for comparison link visibility
	const userAccounts = await getUserAccounts()
	const accountCount = userAccounts.length

	const pageMs = (performance.now() - pageStart).toFixed(1)
	console.log(`[YGORDEV:analytics] SSR: ${pageMs}ms | queries: 5`)

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
				<Suspense fallback={<LoadingSpinner size="md" className="h-50" />}>
				<AnalyticsContent
					initialDashboard={initialDashboard}
					initialTagStats={initialTagStats}
					availableAssets={availableAssets}
					availableTimeframes={availableTimeframes}
					accountCount={accountCount}
				/>
				</Suspense>
			</div>
		</div>
	)
}

export default AnalyticsPage
