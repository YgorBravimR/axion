import { Suspense } from "react"
import { getBacktestDataSources } from "@/app/actions/backtest"
import { OptimizeContent } from "@/components/optimize/optimize-content"
import { LoadingSpinner } from "@/components/shared"
import { requireRole } from "@/lib/auth-utils"

const OptimizePage = async () => {
	await requireRole("premium")
	const sourcesResponse = await getBacktestDataSources()
	const dataSources =
		sourcesResponse.status === "success" ? (sourcesResponse.data ?? []) : []

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 container mx-auto max-w-screen-2xl">
			<Suspense fallback={<LoadingSpinner size="md" className="min-h-48" />}>
				<OptimizeContent dataSources={dataSources} />
			</Suspense>
		</div>
	)
}

export { OptimizePage as default }
