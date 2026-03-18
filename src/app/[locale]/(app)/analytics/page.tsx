import { getTranslations, setRequestLocale } from "next-intl/server"
import { AnalyticsContent } from "@/components/analytics"
import {
	getPerformanceByVariable,
	getExpectedValue,
	getRDistribution,
	getEquityCurve,
	getHourlyPerformance,
	getDayOfWeekPerformance,
	getTimeHeatmap,
	getSessionPerformance,
	getSessionAssetPerformance,
} from "@/app/actions/analytics"
import { getTagStats } from "@/app/actions/tags"
import { getUniqueAssets } from "@/app/actions/trades"
import { getTimeframes } from "@/app/actions/timeframes"
import { getUserAccounts } from "@/app/actions/auth"

// Force dynamic rendering to ensure account-specific data
export const dynamic = "force-dynamic"

interface AnalyticsPageProps {
	params: Promise<{ locale: string }>
}

const AnalyticsPage = async ({ params }: AnalyticsPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	const t = await getTranslations("analytics")

	// Fetch all initial data server-side in parallel
	const [
		performanceResult,
		tagStatsResult,
		expectedValueResult,
		rDistributionResult,
		equityCurveResult,
		hourlyPerformanceResult,
		dayOfWeekPerformanceResult,
		timeHeatmapResult,
		sessionPerformanceResult,
		sessionAssetPerformanceResult,
		assetsResult,
		timeframesResult,
	] = await Promise.all([
		getPerformanceByVariable("asset"),
		getTagStats(),
		getExpectedValue(),
		getRDistribution(),
		getEquityCurve(),
		getHourlyPerformance(),
		getDayOfWeekPerformance(),
		getTimeHeatmap(),
		getSessionPerformance(),
		getSessionAssetPerformance(),
		getUniqueAssets(),
		getTimeframes(),
	])

	const initialPerformance =
		performanceResult.status === "success" && performanceResult.data
			? performanceResult.data
			: []
	const initialTagStats =
		tagStatsResult.status === "success" && tagStatsResult.data
			? tagStatsResult.data
			: []
	const initialExpectedValue =
		expectedValueResult.status === "success" && expectedValueResult.data
			? expectedValueResult.data
			: null
	const initialRDistribution =
		rDistributionResult.status === "success" && rDistributionResult.data
			? rDistributionResult.data
			: []
	const initialEquityCurve =
		equityCurveResult.status === "success" && equityCurveResult.data
			? equityCurveResult.data
			: []
	const initialHourlyPerformance =
		hourlyPerformanceResult.status === "success" && hourlyPerformanceResult.data
			? hourlyPerformanceResult.data
			: []
	const initialDayOfWeekPerformance =
		dayOfWeekPerformanceResult.status === "success" && dayOfWeekPerformanceResult.data
			? dayOfWeekPerformanceResult.data
			: []
	const initialTimeHeatmap =
		timeHeatmapResult.status === "success" && timeHeatmapResult.data
			? timeHeatmapResult.data
			: []
	const initialSessionPerformance =
		sessionPerformanceResult.status === "success" && sessionPerformanceResult.data
			? sessionPerformanceResult.data
			: []
	const initialSessionAssetPerformance =
		sessionAssetPerformanceResult.status === "success" && sessionAssetPerformanceResult.data
			? sessionAssetPerformanceResult.data
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

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
				<AnalyticsContent
					initialPerformance={initialPerformance}
					initialTagStats={initialTagStats}
					initialExpectedValue={initialExpectedValue}
					initialRDistribution={initialRDistribution}
					initialEquityCurve={initialEquityCurve}
					initialHourlyPerformance={initialHourlyPerformance}
					initialDayOfWeekPerformance={initialDayOfWeekPerformance}
					initialTimeHeatmap={initialTimeHeatmap}
					initialSessionPerformance={initialSessionPerformance}
					initialSessionAssetPerformance={initialSessionAssetPerformance}
					availableAssets={availableAssets}
					availableTimeframes={availableTimeframes}
					accountCount={accountCount}
				/>
			</div>
		</div>
	)
}

export default AnalyticsPage
