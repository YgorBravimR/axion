import { getActiveMonthlyPlan } from "@/app/actions/monthly-plans"
import { listActiveRiskProfiles } from "@/app/actions/risk-profiles"
import { getTradeYears } from "@/app/actions/risk-simulation"
import { RiskSimulationContent } from "@/components/risk-simulation"

export const dynamic = "force-dynamic"

const RiskSimulationPage = async () => {
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

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 container mx-auto max-w-7xl">
			<RiskSimulationContent
				monthlyPlan={monthlyPlan}
				riskProfiles={riskProfiles}
				tradeYears={tradeYears}
			/>
		</div>
	)
}

export default RiskSimulationPage
