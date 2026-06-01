import { Suspense } from "react"
import { getBacktestDataSources } from "@/app/actions/backtest"
import { BacktestContent } from "@/components/backtest"
import { LoadingSpinner } from "@/components/shared"
import { requireRole } from "@/lib/auth-utils"

const BacktestPage = async () => {
	await requireRole("premium")
	const sourcesResponse = await getBacktestDataSources()
	const dataSources =
		sourcesResponse.status === "success" ? (sourcesResponse.data ?? []) : []

	return (
		<Suspense fallback={<LoadingSpinner size="md" className="min-h-48" />}>
			<BacktestContent dataSources={dataSources} />
		</Suspense>
	)
}

export { BacktestPage as default }
