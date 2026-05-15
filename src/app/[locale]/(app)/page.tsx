import { setRequestLocale } from "next-intl/server"
import { DashboardContent } from "@/components/dashboard"
import { getDashboardBatch } from "@/app/actions/analytics"
import { getServerEffectiveNow } from "@/lib/effective-date"

interface DashboardPageProps {
	params: Promise<{ locale: string }>
}

const DashboardPage = async ({ params }: DashboardPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	const now = await getServerEffectiveNow()

	const initialYear = now.getFullYear()
	const initialMonthIndex = now.getMonth()

	// Single batch query replaces 6 independent DB queries
	const batchResult = await getDashboardBatch(initialYear, initialMonthIndex)
	const batchData = batchResult.status === "success" ? batchResult.data : null

	const stats = batchData?.stats ?? null
	const discipline = batchData?.discipline ?? null
	const equityCurve = batchData?.equityCurve ?? []
	const streakData = batchData?.streakData ?? null
	const dailyPnL = batchData?.dailyPnL ?? []
	const radarData = batchData?.radarData ?? []

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1">
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

export { DashboardPage as default }
