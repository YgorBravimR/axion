import { getTranslations, setRequestLocale } from "next-intl/server"
import { DashboardContent } from "@/components/dashboard"
import { getDashboardBatch } from "@/app/actions/analytics"
import { getServerEffectiveNow } from "@/lib/effective-date"

interface DashboardPageProps {
	params: Promise<{ locale: string }>
}

const DashboardPage = async ({ params }: DashboardPageProps) => {
	const pageStart = performance.now()

	const { locale } = await params
	setRequestLocale(locale)

	const t = await getTranslations("dashboard")
	const now = await getServerEffectiveNow()

	const initialYear = now.getFullYear()
	const initialMonthIndex = now.getMonth()

	// Single batch query replaces 6 independent DB queries
	const batchResult = await getDashboardBatch(initialYear, initialMonthIndex)

	const stats = batchResult.status === "success" ? batchResult.data?.stats ?? null : null
	const discipline = batchResult.status === "success" ? batchResult.data?.discipline ?? null : null
	const equityCurve = batchResult.status === "success" ? batchResult.data?.equityCurve ?? [] : []
	const streakData = batchResult.status === "success" ? batchResult.data?.streakData ?? null : null
	const dailyPnL = batchResult.status === "success" ? batchResult.data?.dailyPnL ?? [] : []
	const radarData = batchResult.status === "success" ? batchResult.data?.radarData ?? [] : []

	const pageMs = (performance.now() - pageStart).toFixed(1)
	console.log(`[YGORDEV:dashboard] SSR: ${pageMs}ms | queries: 1 (batched from 6)`)

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 p-m-400 sm:p-m-500 lg:p-m-600">
				<DashboardContent
					initialStats={stats}
					initialDiscipline={discipline}
					initialEquityCurve={equityCurve}
					initialStreakData={streakData}
					initialDailyPnL={dailyPnL}
					initialRadarData={radarData}
					initialYear={initialYear}
					initialMonthIndex={initialMonthIndex}
				/>
			</div>
		</div>
	)
}

export default DashboardPage
