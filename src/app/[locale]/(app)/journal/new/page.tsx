import { NewTradeTabs } from "@/components/journal"
import { getStrategies } from "@/app/actions/strategies"
import { getTags } from "@/app/actions/tags"
import { getActiveAssets } from "@/app/actions/assets"
import { getActiveTimeframes } from "@/app/actions/timeframes"
import { getServerEffectiveNow } from "@/lib/effective-date"

interface NewTradePageProps {
	searchParams: Promise<{ returnTo?: string; asset?: string }>
}

const NewTradePage = async ({ searchParams }: NewTradePageProps) => {
	const { returnTo, asset } = await searchParams

	const [strategiesResult, tagsResult, assets, timeframes, effectiveDate] = await Promise.all([
		getStrategies(),
		getTags(),
		getActiveAssets().catch(() => []),
		getActiveTimeframes().catch(() => []),
		getServerEffectiveNow(),
	])

	const strategies =
		strategiesResult.status === "success" ? strategiesResult.data || [] : []
	const tags = tagsResult.status === "success" ? tagsResult.data || [] : []

	// Determine back link based on returnTo
	const backLink = returnTo || "/journal"

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
				<div className="mx-auto max-w-5xl">
					<div className="rounded-lg border border-bg-300 bg-bg-200 p-m-400 sm:p-m-500 lg:p-m-600">
						<NewTradeTabs
							strategies={strategies}
							tags={tags}
							assets={assets}
							timeframes={timeframes}
							redirectTo={returnTo}
							defaultAssetId={asset}
							defaultDate={effectiveDate.toISOString()}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}

export default NewTradePage
