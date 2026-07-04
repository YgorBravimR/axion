import { notFound } from "next/navigation"
import { TradeForm } from "@/components/journal"
import { Panel } from "@/components/ui/panel"
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
			getActiveAssets(),
			getActiveTimeframes(),
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
			<div className="p-m-400 sm:p-m-500 lg:p-m-600 flex-1 overflow-auto">
				<Panel padding="lg">
					<TradeForm
						trade={trade}
						strategies={strategies}
						tags={tags}
						assets={assets}
						timeframes={timeframes}
					/>
				</Panel>
			</div>
		</div>
	)
}

export { EditTradePage as default }
