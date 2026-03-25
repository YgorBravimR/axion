import { setRequestLocale } from "next-intl/server"
import { MonthlyContent } from "@/components/monthly"
import {
	getMonthlyResultsWithProp,
	getMonthlyProjection,
	getMonthComparison,
} from "@/app/actions/reports"


interface MonthlyPageProps {
	params: Promise<{ locale: string }>
}

const MonthlyPage = async ({ params }: MonthlyPageProps) => {
	const { locale } = await params
	setRequestLocale(locale)

	// Fetch initial data server-side
	const [monthlyResult, projectionResult, comparisonResult] = await Promise.all([
		getMonthlyResultsWithProp(0),
		getMonthlyProjection(),
		getMonthComparison(0),
	])

	const initialMonthlyData = monthlyResult.status === "success" ? monthlyResult.data ?? null : null
	const initialProjectionData = projectionResult.status === "success" ? projectionResult.data ?? null : null
	const initialComparisonData = comparisonResult.status === "success" ? comparisonResult.data ?? null : null

	return (
		<div className="min-h-dvh bg-bg-100">
			<main className="mx-auto max-w-5xl p-m-400 sm:p-m-500 lg:p-m-600">
				<MonthlyContent
					initialMonthlyData={initialMonthlyData}
					initialProjectionData={initialProjectionData}
					initialComparisonData={initialComparisonData}
				/>
			</main>
		</div>
	)
}

export { MonthlyPage as default }
