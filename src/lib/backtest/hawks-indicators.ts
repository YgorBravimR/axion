/**
 * Hawks indicator snapshot — pure read-only function.
 *
 * Returns the Hawks indicator state at a single 5m brick (the "fire site"
 * brick), tagged with `favorable: boolean` relative to a trade direction.
 *
 * Two callers share this code:
 *   1. The Hawks autonomous engine (replay): captures the indicator readout
 *      at fire time and attaches it to the emitted trade for downstream
 *      analytics.
 *   2. The two-phase journaling enrichment pass: given a manually-entered
 *      trade's entry timestamp, derives the indicator readout (15m gate,
 *      60m gate, MACD, VWAP D/M/W, AJUSTE) without re-running the entire
 *      engine state machine.
 *
 * The function is intentionally side-effect-free and stateless — it does
 * NOT mutate the candle, does NOT update any running context, and does
 * NOT read or write the engine's structural state (TOPO/FUNDO/phase).
 * Indicator readouts are point-in-time snapshots of the candle's indicators
 * map, plus boolean `favorable` flags derived from the trade direction.
 *
 * Layering: this module reads ONLY from `CandleRow.indicators` and from the
 * preset's key configuration. NO hardcoded column literals — vendor renames
 * are a one-line preset change. The candle-store has no alias layer (see
 * `docs/gotchas.md` → "Hawks: candle-store has NO indicator-key alias layer"),
 * so plumbing every key through config is the only way to avoid silent-null
 * regressions when columns drift.
 */

import type {
	HawksTripleScreenConfig,
	HawksIndicatorSnapshot,
	HawksHtfGateReadout,
	HawksMacdReadout,
	HawksVwapReadout,
	HawksAjusteReadout,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

type Direction = "short" | "long"

/**
 * Binary search for the candle at or just before `timestamp`. Returns -1
 * when timestamp precedes all candles. Candles MUST be sorted by timestamp
 * ascending (the engine guarantees this; callers should too).
 */
const findFloorCandleIndex = (
	candles: CandleRow[],
	timestamp: string
): number => {
	const targetMs = new Date(timestamp).getTime()
	let lo = 0
	let hi = candles.length - 1
	let result = -1
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1
		if (new Date(candles[mid]!.timestamp).getTime() <= targetMs) {
			result = mid
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return result
}

/**
 * Higher-TF gate readout for one of the 15m / 60m gates.
 *
 * "State" reflects the prev_<tf>_open / prev_<tf>_close vs ema27/ema55:
 *   - "above_both" : open AND close > both EMAs (bullish gate is on)
 *   - "below_both" : open AND close < both EMAs (bearish gate is on)
 *   - "mixed"      : neither is strictly on (transition zone)
 *
 * `favorable` for a direction:
 *   - SHORT favorable iff state === "below_both"
 *   - LONG  favorable iff state === "above_both"
 */
const readHtfGate = (
	candle: CandleRow,
	openKey: string,
	closeKey: string,
	ema27Key: string,
	ema55Key: string,
	direction: Direction
): HawksHtfGateReadout => {
	const i = candle.indicators
	const open = i[openKey]
	const close = i[closeKey]
	const ema27 = i[ema27Key]
	const ema55 = i[ema55Key]
	if (
		typeof open !== "number" ||
		typeof close !== "number" ||
		typeof ema27 !== "number" ||
		typeof ema55 !== "number"
	) {
		return { state: "unknown", favorable: false }
	}
	const aboveBoth =
		open > ema27 && open > ema55 && close > ema27 && close > ema55
	const belowBoth =
		open < ema27 && open < ema55 && close < ema27 && close < ema55
	const state: HawksHtfGateReadout["state"] = aboveBoth
		? "above_both"
		: belowBoth
			? "below_both"
			: "mixed"
	const favorable =
		(direction === "short" && state === "below_both") ||
		(direction === "long" && state === "above_both")
	return {
		state,
		favorable,
		prevOpen: open,
		prevClose: close,
		ema27,
		ema55,
	}
}

/**
 * MACD readout — sign at the brick, and direction-aware `favorable`.
 *
 * SHORT favorable when histogram < 0; LONG favorable when histogram > 0.
 * Zero is "neutral" — favorable = false either way.
 */
const readMacd = (
	candle: CandleRow,
	macdKey: string,
	direction: Direction
): HawksMacdReadout => {
	const value = candle.indicators[macdKey]
	if (typeof value !== "number") {
		return { sign: "unknown", favorable: false }
	}
	const sign: HawksMacdReadout["sign"] =
		value > 0 ? "positive" : value < 0 ? "negative" : "zero"
	const favorable =
		(direction === "short" && sign === "negative") ||
		(direction === "long" && sign === "positive")
	return { sign, favorable, value }
}

/**
 * VWAP readout — price-vs-VWAP side, direction-aware `favorable`.
 *
 * SHORT favorable when close < VWAP (VWAP is overhead resistance).
 * LONG favorable when close > VWAP.
 */
const readVwap = (
	candle: CandleRow,
	vwapKey: string,
	direction: Direction
): HawksVwapReadout => {
	const value = candle.indicators[vwapKey]
	if (typeof value !== "number") {
		return { side: "unknown", favorable: false }
	}
	const side: HawksVwapReadout["side"] =
		candle.close > value ? "above" : candle.close < value ? "below" : "at"
	const favorable =
		(direction === "short" && side === "below") ||
		(direction === "long" && side === "above")
	return { side, favorable, value, distance: candle.close - value }
}

/**
 * AJUSTE (D-1 settlement) readout — price-vs-ajuste, direction-aware.
 * Same semantics as VWAP (settlement is a horizontal level).
 */
const readAjuste = (
	candle: CandleRow,
	ajusteKey: string,
	direction: Direction
): HawksAjusteReadout => {
	const value = candle.indicators[ajusteKey]
	if (typeof value !== "number") {
		return { position: "unknown", favorable: false }
	}
	const position: HawksAjusteReadout["position"] =
		candle.close > value ? "above" : candle.close < value ? "below" : "at"
	const favorable =
		(direction === "short" && position === "below") ||
		(direction === "long" && position === "above")
	return { position, favorable, value, distance: candle.close - value }
}

/**
 * Snapshot the Hawks indicator state at a SINGLE candle for a `direction`-
 * aware trade. The fast path: callers that already hold the candle (e.g.
 * the engine during replay) skip the binary-search lookup.
 */
const getHawksIndicatorsAtCandle = (
	candle: CandleRow,
	direction: Direction,
	config: HawksTripleScreenConfig
): HawksIndicatorSnapshot => {
	const gate15m = readHtfGate(
		candle,
		config.prev_15m_open_key,
		config.prev_15m_close_key,
		config.ema27_15m_key,
		config.ema55_15m_key,
		direction
	)
	const gate60m = readHtfGate(
		candle,
		config.prev_60m_open_key,
		config.prev_60m_close_key,
		config.ema27_60m_key,
		config.ema55_60m_key,
		direction
	)
	const macd = readMacd(candle, config.macd_key, direction)
	const vwapD = readVwap(candle, config.vwap_d_key, direction)
	const vwapM = readVwap(candle, config.vwap_m_key, direction)
	const vwapW = readVwap(candle, config.vwap_w_key, direction)
	const ajuste = readAjuste(candle, config.ajuste_key, direction)

	const favorableCount = [
		gate15m,
		gate60m,
		macd,
		vwapD,
		vwapM,
		vwapW,
		ajuste,
	].filter((r) => r.favorable).length

	return {
		candleTimestamp: candle.timestamp,
		direction,
		gate15m,
		gate60m,
		macd,
		vwapD,
		vwapM,
		vwapW,
		ajuste,
		favorableCount,
	}
}

/**
 * Snapshot the Hawks indicator state at `timestamp` for a `direction`-aware
 * trade. Returns null if no candle exists at/before `timestamp`.
 *
 * Used by the journaling enrichment pass: given a manually-entered trade's
 * entry timestamp, finds the matching 5m brick and produces the readout
 * without re-running the engine state machine.
 */
const getHawksIndicatorsAt = (
	candles: CandleRow[],
	timestamp: string,
	direction: Direction,
	config: HawksTripleScreenConfig
): HawksIndicatorSnapshot | null => {
	if (candles.length === 0) {
		return null
	}
	const idx = findFloorCandleIndex(candles, timestamp)
	if (idx < 0) {
		return null
	}
	return getHawksIndicatorsAtCandle(candles[idx]!, direction, config)
}

export { getHawksIndicatorsAt, getHawksIndicatorsAtCandle }
