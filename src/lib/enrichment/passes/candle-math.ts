import type {
	EnrichmentContext,
	EnrichmentDelta,
	EnrichmentPass,
} from "@/lib/enrichment/types"
import type { Trade } from "@/db/schema"

const candleMathPass: EnrichmentPass = (
	trade: Trade,
	ctx: EnrichmentContext
): EnrichmentDelta => {
	const delta: EnrichmentDelta = {
		tradeId: trade.id,
		source: "candle-math",
		fields: {},
		passStatus: "succeeded",
	}

	try {
		if (!ctx.candles) {
			return { ...delta, passStatus: "skipped", skipReason: "no-candles" }
		}
		if (!trade.exitDate) {
			return { ...delta, passStatus: "skipped", skipReason: "no-exit-date" }
		}

		const entryMs = new Date(trade.entryDate as Date | string).getTime()
		const exitMs = new Date(trade.exitDate as Date | string).getTime()

		const candlesInWindow = ctx.candles.filter((candle) => {
			const candleMs = new Date(candle.timestamp).getTime()
			return candleMs >= entryMs && candleMs <= exitMs
		})

		if (candlesInWindow.length === 0) {
			return {
				...delta,
				passStatus: "skipped",
				skipReason: "no-candles-in-window",
			}
		}

		const entryPrice = parseFloat(trade.entryPrice as string)
		if (isNaN(entryPrice)) {
			return {
				...delta,
				passStatus: "failed",
				errorMessage: "Invalid entry price",
			}
		}

		const maxHigh = Math.max(...candlesInWindow.map((c) => c.high))
		const minLow = Math.min(...candlesInWindow.map((c) => c.low))

		const mfe =
			trade.direction === "long" ? maxHigh - entryPrice : entryPrice - minLow
		const mae =
			trade.direction === "long" ? entryPrice - minLow : maxHigh - entryPrice

		if (isNaN(mfe) || isNaN(mae)) {
			return {
				...delta,
				passStatus: "failed",
				errorMessage: "NaN in MFE/MAE computation",
			}
		}

		const holdingMs = exitMs - entryMs

		const confidence = candlesInWindow.length >= 3 ? "high" : "medium"
		const derivation = `Candle replay over ${candlesInWindow.length} candles in window`

		const mfeConflict =
			trade.mfe !== null &&
			Math.abs(parseFloat(trade.mfe.toString()) - mfe) > 1e-8
		const maeConflict =
			trade.mae !== null &&
			Math.abs(parseFloat(trade.mae.toString()) - mae) > 1e-8

		delta.fields["mfe"] = {
			value: mfe,
			source: "candle-math",
			confidence,
			conflictsWithCurrent: mfeConflict,
			derivation,
		}

		delta.fields["mae"] = {
			value: mae,
			source: "candle-math",
			confidence,
			conflictsWithCurrent: maeConflict,
			derivation,
		}

		delta.fields["holdingMs"] = {
			value: holdingMs,
			source: "candle-math",
			confidence: "high",
			conflictsWithCurrent: false,
			derivation: `${candlesInWindow.length} candles; ${exitMs - entryMs}ms between entry and exit`,
		}

		return delta
	} catch (error) {
		return {
			...delta,
			passStatus: "failed",
			errorMessage: error instanceof Error ? error.message : "Unknown error",
		}
	}
}

export { candleMathPass }
