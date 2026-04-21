import { getCandlesForRange, getAssetsWithPriceData } from "@/app/actions/candle-query"
import { MacdChartView } from "@/components/macd-test/macd-chart-view"

const MacdTestPage = async () => {
	const sourcesResult = await getAssetsWithPriceData()

	if (sourcesResult.status === "error" || !sourcesResult.data.length) {
		return (
			<div className="bg-bg-200 border-bg-300 rounded-lg border p-8 text-center">
				<p className="text-txt-200">No data sources available. Import candle data first.</p>
			</div>
		)
	}

	const source = sourcesResult.data[0]

	// Fetch all available candles — MACD(12,26,15) needs ~50+ candles to warm up,
	// so we fetch the full history to ensure accurate values for any selected day.
	const candleResult = await getCandlesForRange({
		assetId: source.assetId,
		timeframeId: source.timeframeId,
		from: new Date("2020-01-01"),
		to: new Date(),
	})

	if (candleResult.status === "error" || !candleResult.data) {
		return (
			<div className="bg-bg-200 border-bg-300 rounded-lg border p-8 text-center">
				<p className="text-txt-200">Failed to load candle data: {candleResult.message}</p>
			</div>
		)
	}

	return (
		<div className="space-y-m-400 p-m-500">
			<div>
				<h1 className="text-heading-2 font-semibold text-txt-100">MACD Validation</h1>
				<p className="text-body text-txt-200">
					{source.assetSymbol} — {source.timeframeCode} ·{" "}
					{candleResult.data.candles.length.toLocaleString()} candles loaded for warmup accuracy
				</p>
			</div>
			<MacdChartView candles={candleResult.data.candles} asset={source.assetSymbol} timeframe={source.timeframeCode} />
		</div>
	)
}

export { MacdTestPage as default }
