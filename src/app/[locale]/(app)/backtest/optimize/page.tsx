import { Suspense } from "react"
import { getBacktestDataSources } from "@/app/actions/backtest"
import { OptimizeContent } from "@/components/optimize/optimize-content"
import { LoadingSpinner } from "@/components/shared"
import { requireRole } from "@/lib/auth-utils"

const OptimizePage = async () => {
	await requireRole("admin")
	const sourcesResponse = await getBacktestDataSources()
	const dataSources = sourcesResponse.success ? (sourcesResponse.data ?? []) : []

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 container mx-auto max-w-[1600px]">
			<Suspense fallback={<LoadingSpinner size="md" className="h-50" />}>
				<OptimizeContent dataSources={dataSources} />
			</Suspense>
		</div>
	)
}

export { OptimizePage as default }
