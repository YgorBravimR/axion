import { getTranslations, setRequestLocale } from "next-intl/server"
import { DashboardContent } from "@/components/dashboard"
import {
	getOverallStats,
	getDisciplineScore,
	getEquityCurve,
	getStreakData,
	getDailyPnL,
	getRadarChartData,
} from "@/app/actions/analytics"
import { getServerEffectiveNow } from "@/lib/effective-date"

// Force dynamic rendering to ensure account-specific data
export const dynamic = "force-dynamic"

interface DashboardPageProps {
	params: Promise<{ locale: string }>
}

const DashboardPage = async ({ params }: DashboardPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	const t = await getTranslations("dashboard")
	const now = await getServerEffectiveNow()

	const [statsResult, disciplineResult, equityCurveResult, streakResult, dailyPnLResult, radarResult] =
		await Promise.all([
			getOverallStats(),
			getDisciplineScore(),
			getEquityCurve(), // Fetch all time data by default
			getStreakData(),
			getDailyPnL(now.getFullYear(), now.getMonth()),
			getRadarChartData(),
		])

	const stats = statsResult.status === "success" ? statsResult.data ?? null : null
	const discipline = disciplineResult.status === "success" ? disciplineResult.data ?? null : null
	const equityCurve = equityCurveResult.status === "success" ? equityCurveResult.data ?? [] : []
	const streakData = streakResult.status === "success" ? streakResult.data ?? null : null
	const dailyPnL = dailyPnLResult.status === "success" ? dailyPnLResult.data ?? [] : []
	const radarData = radarResult.status === "success" ? radarResult.data ?? [] : []

	// Pass month as year/month numbers to avoid Date serialization issues
	const initialYear = now.getFullYear()
	const initialMonthIndex = now.getMonth()

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
