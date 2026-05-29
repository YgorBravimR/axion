interface InspectorCandleRow {
	readonly timestamp: string
	readonly open: number
	readonly high: number
	readonly low: number
	readonly close: number
	readonly indicators: Record<string, number>
}

interface InspectorBrickSizes {
	readonly size5m: number
	readonly size15m: number
	readonly size60m: number
	readonly effectiveDate: string | null
	readonly weekNumber: number | null
}

interface InspectorWindow {
	readonly candles5m: InspectorCandleRow[]
	readonly candles15m: InspectorCandleRow[]
	readonly candles60m: InspectorCandleRow[]
	readonly sizes: InspectorBrickSizes
	readonly assetSymbol: string
}

interface OverviewWindow {
	readonly candles5m: InspectorCandleRow[]
	readonly sizes: InspectorBrickSizes
}

interface GetInspectorWindowParams {
	readonly assetSymbol: string
	readonly centerTime: string
	readonly paddingMs5m?: number
	readonly paddingMs15m?: number
	readonly paddingMs60m?: number
}

type InspectorWindowResult =
	| { readonly status: "success"; readonly data: InspectorWindow }
	| { readonly status: "error"; readonly message: string }

interface GetOverviewRangeParams {
	readonly assetSymbol: string
	readonly fromDate: string
	readonly toDate: string
}

type OverviewRangeResult =
	| { readonly status: "success"; readonly data: OverviewWindow }
	| { readonly status: "error"; readonly message: string }

export type {
	InspectorCandleRow,
	InspectorBrickSizes,
	InspectorWindow,
	OverviewWindow,
	GetInspectorWindowParams,
	InspectorWindowResult,
	GetOverviewRangeParams,
	OverviewRangeResult,
}
