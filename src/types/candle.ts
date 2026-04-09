interface CandleQueryParams {
	assetId: string
	timeframeId: string
	from: Date
	to: Date
}

interface CandleRow {
	timestamp: string
	open: number
	high: number
	low: number
	close: number
	candleIndex: number | null
	indicators: Record<string, number>
}

interface IndicatorGroupWithKeys {
	key: string
	displayName: string
	indicatorKeys: Array<{ key: string; displayName: string }>
}

interface DataSourceInfo {
	assetId: string
	assetSymbol: string
	assetName: string
	timeframeId: string
	timeframeCode: string
	timeframeName: string
	rowCount: number | null
	lastImported: string | null
}

interface TradeChartData {
	trade: {
		id: string
		direction: "long" | "short"
		entryDate: string
		exitDate: string | null
		entryPrice: number
		exitPrice: number | null
		stopLoss: number | null
		takeProfit: number | null
		pnl: number | null
		outcome: "win" | "loss" | "breakeven" | null
		asset: string
		positionSize: number
	}
	executions: Array<{
		type: "entry" | "exit"
		price: number
		quantity: number
		timestamp: string
	}>
	candles: CandleRow[]
	indicatorGroups: IndicatorGroupWithKeys[]
}

export type { CandleQueryParams, CandleRow, IndicatorGroupWithKeys, DataSourceInfo, TradeChartData }
