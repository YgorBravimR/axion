import { notFound } from "next/navigation"
import { TradeForm } from "@/components/journal"
import { getTrade } from "@/app/actions/trades"
import { getStrategies } from "@/app/actions/strategies"
import { getTags } from "@/app/actions/tags"
import { getActiveAssets } from "@/app/actions/assets"
import { getActiveTimeframes } from "@/app/actions/timeframes"

interface EditTradePageProps {
	params: Promise<{ id: string }>
}

const EditTradePage = async ({ params }: EditTradePageProps) => {
	const { id } = await params

	const [tradeResult, strategiesResult, tagsResult, assets, timeframes] =
		await Promise.all([
			getTrade(id),
			getStrategies(),
			getTags(),
			getActiveAssets().catch(() => []),
			getActiveTimeframes().catch(() => []),
		])

	if (tradeResult.status === "error" || !tradeResult.data) {
		notFound()
	}

	const trade = tradeResult.data
	const strategies =
		strategiesResult.status === "success" ? strategiesResult.data || [] : []
	const tags = tagsResult.status === "success" ? tagsResult.data || [] : []

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-auto p-m-400 sm:p-m-500 lg:p-m-600">
				<div className="mx-auto max-w-2xl">
					<div className="rounded-lg border border-bg-300 bg-bg-200 p-m-400 sm:p-m-500 lg:p-m-600">
						<TradeForm
							trade={trade}
							strategies={strategies}
							tags={tags}
							assets={assets}
							timeframes={timeframes}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}

export { EditTradePage as default }
