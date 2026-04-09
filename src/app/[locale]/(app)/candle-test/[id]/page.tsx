import { connection } from "next/server"
import { notFound } from "next/navigation"
import { getTradeWithCandles } from "@/app/actions/candle-query"
import { TradeChartContent } from "@/components/candle-test/trade-chart-content"

interface TradeChartPageProps {
	params: Promise<{ id: string; locale: string }>
}

const TradeChartPage = async ({ params }: TradeChartPageProps) => {
	await connection()
	const { id } = await params
	const result = await getTradeWithCandles(id)

	if (result.status === "error" || !result.data) {
		notFound()
	}

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600">
			<TradeChartContent
				trade={result.data.trade}
				executions={result.data.executions}
				candles={result.data.candles}
				indicatorGroups={result.data.indicatorGroups}
			/>
		</div>
	)
}

export { TradeChartPage as default }
