import type {
	EnrichmentContext,
	EnrichmentDelta,
	EnrichmentPass,
} from "@/lib/enrichment/types"
import type { Trade } from "@/db/schema"

// MFE/MAE used to be computed here from 5m Renko brick highs/lows, but Renko
// brick wicks routinely over-report intra-trade excursion (a single 5m brick
// can hold a 200+ pt wick that didn't actually trade contiguously through any
// stop level). The Profit Pro CSV already exposes MEP/MEN at tick resolution
// from the broker — that's the source of truth. Operations-CSV pass owns
// MFE/MAE; this pass only stamps holdingMs.
const candleMathPass: EnrichmentPass = (
	trade: Trade,
	_ctx: EnrichmentContext
): EnrichmentDelta => {
	if (!trade.exitDate) {
		return {
			tradeId: trade.id,
			source: "candle-math",
			fields: {},
			passStatus: "skipped",
			skipReason: "no-exit-date",
		}
	}
	const entryMs = new Date(trade.entryDate as Date | string).getTime()
	const exitMs = new Date(trade.exitDate as Date | string).getTime()
	const holdingMs = exitMs - entryMs
	return {
		tradeId: trade.id,
		source: "candle-math",
		fields: {
			holdingMs: {
				value: holdingMs,
				source: "candle-math",
				confidence: "high",
				conflictsWithCurrent: false,
				derivation: `${holdingMs}ms between entry and exit`,
			},
		},
		passStatus: "succeeded",
	}
}

export { candleMathPass }
