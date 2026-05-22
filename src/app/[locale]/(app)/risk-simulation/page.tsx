import { Suspense } from "react"
import { listActiveRiskProfiles } from "@/app/actions/risk-profiles"
import { getTradeYears } from "@/app/actions/risk-simulation"
import { RiskSimulationContent } from "@/components/risk-simulation"
import { LoadingSpinner } from "@/components/shared"

const RiskSimulationPage = async () => {
	const [profilesResponse, yearsResponse] = await Promise.all([
		listActiveRiskProfiles(),
		getTradeYears(),
	])

	// Phase 4b: monthly plan prefill migrated to the fractal-plan resolver.
	const riskProfiles =
		profilesResponse.status === "success" ? (profilesResponse.data ?? []) : []
	const tradeYears =
		yearsResponse.status === "success" ? (yearsResponse.data ?? []) : []

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 container mx-auto max-w-7xl">
			<Suspense fallback={<LoadingSpinner size="md" className="min-h-48" />}>
				<RiskSimulationContent
					riskProfiles={riskProfiles}
					tradeYears={tradeYears}
				/>
			</Suspense>
		</div>
	)
}

export { RiskSimulationPage as default }
