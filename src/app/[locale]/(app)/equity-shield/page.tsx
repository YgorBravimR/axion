import { Suspense } from "react"
import { getActiveMonthlyPlan } from "@/app/actions/monthly-plans"
import { getEquityShieldPreview } from "@/app/actions/equity-shield"
import { EquityShieldContent } from "@/components/equity-shield"
import { LoadingSpinner } from "@/components/shared"


const EquityShieldPage = async () => {
	const [planResponse, previewResponse] = await Promise.all([
		getActiveMonthlyPlan(),
		getEquityShieldPreview(),
	])

	const monthlyPlan =
		planResponse.status === "success" ? (planResponse.data ?? null) : null
	const initialTradeCount =
		previewResponse.status === "success"
			? (previewResponse.data?.totalTrades ?? 0)
			: 0

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 container mx-auto max-w-7xl">
			<Suspense fallback={<LoadingSpinner size="md" className="h-50" />}>
				<EquityShieldContent
					monthlyPlan={monthlyPlan}
					initialTradeCount={initialTradeCount}
				/>
			</Suspense>
		</div>
	)
}

export { EquityShieldPage as default }
