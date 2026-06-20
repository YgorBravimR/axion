import type { Trade } from "@/db/schema"
import type {
	EnrichmentContext,
	EnrichmentDelta,
	EnrichmentPass,
	EnrichmentField,
} from "@/lib/enrichment/types"

export const deterministicSlTargetPass: EnrichmentPass = (
	trade: Trade,
	ctx: EnrichmentContext
): EnrichmentDelta => {
	const tradeId = trade.id

	if (ctx.brickSize5mPoints === null) {
		return {
			tradeId,
			source: "deterministic-sl",
			fields: {},
			passStatus: "skipped",
			skipReason: "no-brick-size-config",
		}
	}

	if (trade.entryPrice === null) {
		return {
			tradeId,
			source: "deterministic-sl",
			fields: {},
			passStatus: "skipped",
			skipReason: "no-entry-price",
		}
	}

	const trimmed = String(trade.entryPrice).trim()
	const entryPrice = Number(trimmed)
	if (!trimmed || !Number.isFinite(entryPrice)) {
		return {
			tradeId,
			source: "deterministic-sl",
			fields: {},
			passStatus: "skipped",
			skipReason: "no-entry-price",
		}
	}

	try {
		const brickSize = ctx.brickSize5mPoints
		const isLong = trade.direction === "long"

		// SL = entry ± 2 × brickSize
		const slValue = isLong
			? entryPrice - 2 * brickSize
			: entryPrice + 2 * brickSize

		// Target = entry ± 6 × brickSize (3R extension)
		const tpValue = isLong
			? entryPrice + 6 * brickSize
			: entryPrice - 6 * brickSize

		// Round to 2 decimals (WIN price precision)
		const slRounded = Math.round(slValue * 100) / 100
		const tpRounded = Math.round(tpValue * 100) / 100

		const derivationPrefix = `entry <${isLong ? "-" : "+"}> 2 × ${brickSize} points`
		const tpDerivation = `3R extension (6 × ${brickSize} points from entry)`

		const fields: Record<string, EnrichmentField> = {
			stopLoss: {
				value: slRounded,
				source: "deterministic-sl",
				confidence: "high",
				derivation: derivationPrefix,
				conflictsWithCurrent:
					trade.stopLoss !== null &&
					Math.round(Number(trade.stopLoss) * 100) / 100 !== slRounded,
			},
			takeProfit: {
				value: tpRounded,
				source: "deterministic-sl",
				confidence: "high",
				derivation: tpDerivation,
				conflictsWithCurrent:
					trade.takeProfit !== null &&
					Math.round(Number(trade.takeProfit) * 100) / 100 !== tpRounded,
			},
		}

		return {
			tradeId,
			source: "deterministic-sl",
			fields,
			passStatus: "succeeded",
		}
	} catch (error) {
		return {
			tradeId,
			source: "deterministic-sl",
			fields: {},
			passStatus: "failed",
			errorMessage: error instanceof Error ? error.message : "Unknown error",
		}
	}
}
