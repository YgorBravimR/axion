import type { InspectorCandleRow, InspectorBrickSizes } from "@/types/inspector"

interface HawksChartTradeMarker {
	readonly id: string
	readonly entryTime: string
	readonly exitTime: string | null
	readonly direction: "long" | "short"
	readonly entryPrice: number
	readonly exitPrice: number | null
	readonly rMultiple: number | null
	// Mirrors `trades.outcome` (pgEnum). "breakeven" reflects the per-account
	// breakeven-tick band — i.e. trades whose realized PnL ticks-gained sit
	// within ±breakevenTicks of entry. Resolved by `determineOutcome` in
	// src/lib/calculations.ts at trade-save time, not re-derived here.
	readonly outcome: "win" | "loss" | "breakeven"
	// Planned stop / target prices in the same price scale as entry/exit.
	// Nullable for legacy trades. Used to render the trade as a position
	// box (entry line + risk band to stop + reward band to target) so it
	// looks identical to a user-drawn position drawing.
	readonly stopPrice: number | null
	readonly targetPrice: number | null
}

interface HawksChartFullWindow {
	readonly assetSymbol: string
	readonly candles5m: InspectorCandleRow[]
	readonly candles15m: InspectorCandleRow[]
	readonly candles60m: InspectorCandleRow[]
	readonly sizes: InspectorBrickSizes
	readonly tradeMarkers: HawksChartTradeMarker[]
}

type HawksChartFullWindowResult =
	| { readonly status: "success"; readonly data: HawksChartFullWindow }
	| { readonly status: "error"; readonly message: string }

export type {
	HawksChartFullWindow,
	HawksChartFullWindowResult,
	HawksChartTradeMarker,
}
