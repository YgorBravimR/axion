import type { Trade } from "@/db/schema"
import type {
	EnrichmentDelta,
	EnrichmentPass,
	EnrichmentContext,
	EnrichmentField,
} from "@/lib/enrichment/types"
import { getHawksIndicatorsAt } from "@/lib/backtest/hawks-indicators"

const indicatorReadoutPass: EnrichmentPass = (
	trade: Trade,
	ctx: EnrichmentContext
): EnrichmentDelta => {
	// Skip if candles or hawksConfig is missing
	if (!ctx.candles || !ctx.hawksConfig) {
		return {
			tradeId: trade.id,
			source: "indicator-readout",
			fields: {},
			passStatus: "skipped",
			skipReason: "no-candles-or-config",
		}
	}

	try {
		const entryDateStr =
			trade.entryDate instanceof Date
				? trade.entryDate.toISOString()
				: String(trade.entryDate)

		const snapshot = getHawksIndicatorsAt(
			ctx.candles,
			entryDateStr,
			trade.direction as "long" | "short",
			ctx.hawksConfig
		)

		if (!snapshot) {
			return {
				tradeId: trade.id,
				source: "indicator-readout",
				fields: {},
				passStatus: "skipped",
				skipReason: "no-candle-at-entry",
			}
		}

		const fields: Record<string, EnrichmentField<unknown>> = {}

		const confidence: "high" | "medium" | "low" =
			snapshot.favorableCount >= 4
				? "high"
				: snapshot.favorableCount >= 2
					? "medium"
					: "low"

		const currentReadout = trade.indicatorReadout as unknown
		const conflictsWithCurrent =
			currentReadout !== null &&
			currentReadout !== undefined &&
			JSON.stringify(currentReadout) !== JSON.stringify(snapshot)

		fields.indicatorReadout = {
			value: snapshot,
			source: "indicator-readout" as const,
			confidence,
			conflictsWithCurrent,
			derivation: `Hawks indicator snapshot at 5m brick ${snapshot.candleTimestamp}`,
		}

		// setupRank: DB enum only supports A/AA/AAA; <4 favorable → NULL (full data in JSON).
		// Enum extension to B/C tracked in backlog.
		const setupRank: "AAA" | "AA" | "A" | null =
			snapshot.favorableCount >= 6
				? "AAA"
				: snapshot.favorableCount === 5
					? "AA"
					: snapshot.favorableCount === 4
						? "A"
						: null

		if (setupRank !== null) {
			fields.setupRank = {
				value: setupRank,
				source: "indicator-readout" as const,
				confidence,
				conflictsWithCurrent: false,
				derivation: `favorableCount=${snapshot.favorableCount}/7`,
			}
		}

		return {
			tradeId: trade.id,
			source: "indicator-readout",
			fields,
			passStatus: "succeeded",
		}
	} catch (error) {
		const errorMessage =
			error instanceof Error
				? error.message
				: "Unknown error in indicator-readout pass"

		return {
			tradeId: trade.id,
			source: "indicator-readout",
			fields: {},
			passStatus: "failed",
			errorMessage,
		}
	}
}

export { indicatorReadoutPass }
