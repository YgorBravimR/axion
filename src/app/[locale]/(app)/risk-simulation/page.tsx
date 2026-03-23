import { Suspense } from "react"
import { getActiveMonthlyPlan } from "@/app/actions/monthly-plans"
import { listActiveRiskProfiles } from "@/app/actions/risk-profiles"
import { getTradeYears } from "@/app/actions/risk-simulation"
import { RiskSimulationContent } from "@/components/risk-simulation"
import { LoadingSpinner } from "@/components/shared"


const RiskSimulationPage = async () => {
	const pageStart = performance.now()

	const [planResponse, profilesResponse, yearsResponse] = await Promise.all([
		getActiveMonthlyPlan(),
		listActiveRiskProfiles(),
		getTradeYears(),
	])

	const monthlyPlan =
		planResponse.status === "success" ? (planResponse.data ?? null) : null
	const riskProfiles =
		profilesResponse.status === "success" ? (profilesResponse.data ?? []) : []
	const tradeYears =
		yearsResponse.status === "success" ? (yearsResponse.data ?? []) : []

	const pageMs = (performance.now() - pageStart).toFixed(1)
	console.log(`[YGORDEV:risk-simulation] SSR: ${pageMs}ms | queries: 3`)

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 container mx-auto max-w-7xl">
			<Suspense fallback={<LoadingSpinner size="md" className="h-50" />}>
				<RiskSimulationContent
					monthlyPlan={monthlyPlan}
					riskProfiles={riskProfiles}
					tradeYears={tradeYears}
				/>
			</Suspense>
		</div>
	)
}

export default RiskSimulationPage
