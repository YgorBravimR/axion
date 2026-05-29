import { Suspense } from "react"
import { getTradeYears } from "@/app/actions/risk-simulation"
import { EquityShieldContent } from "@/components/equity-shield"
import { LoadingSpinner } from "@/components/shared"
import { requireRole } from "@/lib/auth-utils"

const EquityShieldPage = async () => {
	await requireRole("premium")
	const [yearsResponse] = await Promise.all([getTradeYears()])

	// Phase 4b: monthly plan prefill is being migrated to the fractal-plan resolver.
	const tradeYears =
		yearsResponse.status === "success" ? (yearsResponse.data ?? []) : []

	return (
		<Suspense fallback={<LoadingSpinner size="md" className="min-h-48" />}>
			<EquityShieldContent tradeYears={tradeYears} />
		</Suspense>
	)
}

export { EquityShieldPage as default }
