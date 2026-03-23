import { getTranslations, setRequestLocale } from "next-intl/server"
import { ReportsContent } from "@/components/reports"
import {
	getWeeklyReport,
	getMonthlyReport,
	getMistakeCostAnalysis,
} from "@/app/actions/reports"


interface ReportsPageProps {
	params: Promise<{ locale: string }>
}

const ReportsPage = async ({ params }: ReportsPageProps) => {
	const pageStart = performance.now()

	const { locale } = await params
	setRequestLocale(locale)

	const t = await getTranslations("reports")

	const [weeklyResult, monthlyResult, mistakeResult] = await Promise.all([
		getWeeklyReport(0).catch(() => ({ status: "error" as const, data: null })),
		getMonthlyReport(0).catch(() => ({ status: "error" as const, data: null })),
		getMistakeCostAnalysis().catch(() => ({
			status: "error" as const,
			data: null,
		})),
	])

	const weeklyReport =
		weeklyResult.status === "success" ? weeklyResult.data ?? null : null
	const monthlyReport =
		monthlyResult.status === "success" ? monthlyResult.data ?? null : null
	const mistakeCostAnalysis =
		mistakeResult.status === "success" ? mistakeResult.data ?? null : null

	const pageMs = (performance.now() - pageStart).toFixed(1)
	console.log(`[YGORDEV:reports] SSR: ${pageMs}ms | queries: 3`)

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
				<ReportsContent
					weeklyReport={weeklyReport}
					monthlyReport={monthlyReport}
					mistakeCostAnalysis={mistakeCostAnalysis}
				/>
			</div>
		</div>
	)
}

export default ReportsPage
