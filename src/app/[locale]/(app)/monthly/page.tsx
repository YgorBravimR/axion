import { setRequestLocale } from "next-intl/server"
import { MonthlyContent } from "@/components/monthly/monthly-content"
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

	const [dataResult, projectionResult, comparisonResult] = await Promise.all([
		getMonthlyResultsWithProp(0).catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getMonthlyProjection().catch(() => ({
			status: "error" as const,
			data: null,
		})),
		getMonthComparison(0).catch(() => ({
			status: "error" as const,
			data: null,
		})),
	])

	const initialData =
		dataResult.status === "success" ? (dataResult.data ?? null) : null
	const initialProjection =
		projectionResult.status === "success"
			? (projectionResult.data ?? null)
			: null
	const initialComparison =
		comparisonResult.status === "success"
			? (comparisonResult.data ?? null)
			: null

	return (
		<div className="flex h-full flex-col">
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
				<MonthlyContent
					initialData={initialData}
					initialProjection={initialProjection}
					initialComparison={initialComparison}
				/>
			</div>
		</div>
	)
}

export { MonthlyPage as default }
