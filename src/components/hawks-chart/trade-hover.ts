import type { HawksChartTradeMarker } from "@/app/actions/hawks-chart-data.types"

// A trade with its resolved 5m brick span. `startBrickIdx`/`endBrickIdx` are
// the inclusive brick-index bounds the position box occupies on the 5m pane.
export interface TradeSpan {
	readonly id: string
	readonly startBrickIdx: number
	readonly endBrickIdx: number
}

/**
 * Resolve which trade the user is hovering. A trade is a candidate when the
 * hovered brick index falls inside its `[startBrickIdx, endBrickIdx]` span.
 * When several spans overlap the hovered brick, prefer the one whose entry
 * (start) is nearest the hovered index; ties break toward the later-starting
 * trade (the more recent entry). Returns `null` when nothing is hovered or no
 * span contains the hovered brick — that resting state renders a clean chart.
 */
export const resolveActiveTradeId = (
	spans: ReadonlyArray<TradeSpan>,
	hoveredIdx: number | null
): string | null => {
	if (hoveredIdx === null) {
		return null
	}
	let best: TradeSpan | null = null
	let bestDelta = Number.POSITIVE_INFINITY
	for (const s of spans) {
		if (hoveredIdx < s.startBrickIdx || hoveredIdx > s.endBrickIdx) {
			continue
		}
		const delta = Math.abs(hoveredIdx - s.startBrickIdx)
		if (
			delta < bestDelta ||
			(delta === bestDelta &&
				best !== null &&
				s.startBrickIdx >= best.startBrickIdx)
		) {
			bestDelta = delta
			best = s
		}
	}
	return best?.id ?? null
}

/**
 * Human-readable hover badge label for a trade:
 *   `#3 · short · -1.05R · 17143956`
 * `index` is the 1-based chronological position within the loaded, entry-
 * sorted trade set. `rMultiple` renders signed to 2 decimals, or `—` when
 * the trade has no realized R (open / pre-enrichment). The id is truncated to
 * the first 8 chars, matching what a DB query would show.
 */
export const buildTradeLabel = (
	trade: Pick<HawksChartTradeMarker, "id" | "direction" | "rMultiple">,
	index: number
): string => {
	const r =
		trade.rMultiple !== null && Number.isFinite(trade.rMultiple)
			? `${trade.rMultiple >= 0 ? "+" : ""}${trade.rMultiple.toFixed(2)}R`
			: "—"
	return `#${index} · ${trade.direction} · ${r} · ${trade.id.slice(0, 8)}`
}

/**
 * Resolve the R brick-size to show in a pane's size label from the hovered
 * brick's `brick` indicator. Falls back to the last brick's `brick` value
 * when nothing is hovered (matching the "latest week" resting behavior), then
 * to `fallbackSize` when no brick carries the value (legacy rows).
 */
export const resolveBrickSize = (
	candles: ReadonlyArray<{ readonly indicators: Record<string, number> }>,
	hoveredIdx: number | null,
	fallbackSize: number
): number => {
	const at = (i: number): number | null => {
		const v = candles[i]?.indicators?.brick
		return typeof v === "number" && Number.isFinite(v) ? v : null
	}
	if (hoveredIdx !== null) {
		const hovered = at(hoveredIdx)
		if (hovered !== null) {
			return hovered
		}
	}
	const last = candles.length > 0 ? at(candles.length - 1) : null
	return last ?? fallbackSize
}
