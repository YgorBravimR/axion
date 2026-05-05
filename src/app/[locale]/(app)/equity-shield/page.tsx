import { Suspense } from "react"
import { getTradeYears } from "@/app/actions/risk-simulation"
import { EquityShieldContent } from "@/components/equity-shield"
import { LoadingSpinner } from "@/components/shared"
import { requireRole } from "@/lib/auth-utils"


const EquityShieldPage = async () => {
	await requireRole("premium")
	const [yearsResponse] = await Promise.all([getTradeYears()])

	// Phase 4b: monthly plan prefill is being migrated to the fractal-plan resolver.
	const monthlyPlan = null
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
