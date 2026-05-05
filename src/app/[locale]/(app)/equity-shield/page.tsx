import { Suspense } from "react"
import { getActiveMonthlyRiskConfig } from "@/app/actions/monthly-risk-config"
import { getTradeYears } from "@/app/actions/risk-simulation"
import { EquityShieldContent } from "@/components/equity-shield"
import { LoadingSpinner } from "@/components/shared"
import { requireRole } from "@/lib/auth-utils"


const EquityShieldPage = async () => {
	await requireRole("premium")
	const [planResponse, yearsResponse] = await Promise.all([
		getActiveMonthlyRiskConfig(),
		getTradeYears(),
	])

	const monthlyPlan =
		planResponse.status === "success" ? (planResponse.data ?? null) : null
	const tradeYears =
		yearsResponse.status === "success" ? (yearsResponse.data ?? []) : []

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 container mx-auto max-w-7xl">
			<Suspense fallback={<LoadingSpinner size="md" className="h-50" />}>
				<EquityShieldContent
					monthlyPlan={monthlyPlan}
					tradeYears={tradeYears}
				/>
			</Suspense>
		</div>
	)
}

export { EquityShieldPage as default }
