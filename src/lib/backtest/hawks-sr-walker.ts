/**
 * Hawks S/R level proximity walker — stateless (engine v0.10).
 *
 * Per the indicator-isolation audit Group E
 * (`docs/hawks-strategy/indicator-isolation/group-e-sr-levels.md`), Axion's
 * engine has zero reads of `qualityGates.srLevelBlock` / `srLevelFavor` despite
 * the UI exposing both toggles and the `strict` opt-in preset bundle setting
 * them true. The audit script
 * (`scripts/indicator-isolation/group-e-sr-levels.ts`) found the methodology
 * block fires on ~30% of bricks across the catalog — a real, dense signal.
 *
 * This walker is the methodology-correct reader the audit prescribed. It runs
 * stateless per brick — proximity is a snapshot of (close, level values) at
 * that brick. No prior-brick memory needed.
 *
 * Per brick we classify, for BOTH directions independently (direction is not
 * known at walker time — only when a playbook fires):
 *
 *   SHORT entry at price P:
 *     A level L blocks if `P >= L` and `(P - L) <= srBlockBufferBricks * brickSize`
 *     A level L favors if `L > P` and `(L - P) <= srFavorRangeBricks * brickSize`
 *
 *   LONG entry at price P:
 *     A level L blocks if `L >= P` and `(L - P) <= srBlockBufferBricks * brickSize`
 *     A level L favors if `L < P` and `(P - L) <= srFavorRangeBricks * brickSize`
 *
 * "blocks" = level is AHEAD of the trade direction within buffer (would act
 * as a wall against the move). "favors" = level is BEHIND the trade direction
 * within range (acts as cushion / additional confirmation).
 *
 * Level set: 4 HTF EMAs (60m × 2, 15m × 2) + vwap_d + ajuste. `vwap_w`/`vwap_m`
 * are intentionally OUT of the default set — methodology calls out D-VWAP
 * specifically. Toggle via `qualityGates.srIncludeWeeklyMonthlyVwap` if a
 * future spec adds them.
 *
 * Ajuste sourcing: candle.indicators.ajuste is injected from
 * `asset_session_anchors` at fetch time (see `daily-anchors.ts`). The walker
 * reads it like any other indicator — when absent (session-1 of a rollover),
 * that level is excluded from the comparison set per audit Q3.
 *
 * Build once at engine init via `buildSrWalker(candles, config)`, lookup per
 * brick via `walker.get(timestamp)`. O(N × L) build (L = level count, capped
 * at ~8) + O(1) lookup. Parallel to (not replacing) the dead `favorableCount`
 * counter elsewhere in the engine.
 */

import type { HawksTripleScreenConfig } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

export type SrLevelKey =
	| "mme27_60m"
	| "mme55_60m"
	| "mme27_15m"
	| "mme55_15m"
	| "vwap_d"
	| "ajuste"

export interface SrLevelHit {
	level: SrLevelKey
	distanceBricks: number
}

export interface SrDirectionSnapshot {
	blocked: boolean
	levelsAhead: SrLevelHit[] // every level within srBlockBufferBricks, sorted nearest-first
	favorCount: number
	favorLevels: SrLevelKey[] // every level within srFavorRangeBricks behind
}

export interface SrWalkerSnapshot {
	short: SrDirectionSnapshot
	long: SrDirectionSnapshot
	// Raw level values surveyed at this brick — null for any level that's missing.
	levels: Record<SrLevelKey, number | null>
}

const numericFromCandle = (candle: CandleRow, key: string): number | null => {
	if (key === "") {
		return null
	}
	const v = candle.indicators[key]
	return typeof v === "number" ? v : null
}

const buildSrWalker = (
	candles: CandleRow[],
	config: HawksTripleScreenConfig
): Map<string, SrWalkerSnapshot> => {
	const out = new Map<string, SrWalkerSnapshot>()
	if (candles.length === 0) {
		return out
	}

	const brickSize = config.brickSize5mPoints
	const bufferBricks = config.qualityGates?.srBlockBufferBricks ?? 2
	const favorBricks = config.qualityGates?.srFavorRangeBricks ?? 3
	const bufferPts = bufferBricks * brickSize
	const favorPts = favorBricks * brickSize

	// Indicator key → snapshot key. Keys come from config so a future recipe
	// could rename them without touching the walker.
	const keyMap: Array<{ snapshot: SrLevelKey; configKey: string }> = [
		{ snapshot: "mme27_60m", configKey: config.ema27_60m_key },
		{ snapshot: "mme55_60m", configKey: config.ema55_60m_key },
		{ snapshot: "mme27_15m", configKey: config.ema27_15m_key },
		{ snapshot: "mme55_15m", configKey: config.ema55_15m_key },
		{ snapshot: "vwap_d", configKey: config.vwap_d_key },
		{ snapshot: "ajuste", configKey: config.ajuste_key },
	]

	for (const candle of candles) {
		const close = candle.close
		const levels: Record<SrLevelKey, number | null> = {
			mme27_60m: null,
			mme55_60m: null,
			mme27_15m: null,
			mme55_15m: null,
			vwap_d: null,
			ajuste: null,
		}
		for (const { snapshot, configKey } of keyMap) {
			levels[snapshot] = numericFromCandle(candle, configKey)
		}

		const shortAhead: SrLevelHit[] = []
		const shortFavor: SrLevelKey[] = []
		const longAhead: SrLevelHit[] = []
		const longFavor: SrLevelKey[] = []

		for (const { snapshot } of keyMap) {
			const value = levels[snapshot]
			if (value === null) {
				continue
			}

			// SHORT: ahead = level BELOW close (acts as floor). Favor = level ABOVE close.
			const shortAheadPts = close - value
			if (shortAheadPts >= 0 && shortAheadPts <= bufferPts) {
				shortAhead.push({
					level: snapshot,
					distanceBricks: shortAheadPts / brickSize,
				})
			}
			const shortFavorPts = value - close
			if (shortFavorPts > 0 && shortFavorPts <= favorPts) {
				shortFavor.push(snapshot)
			}

			// LONG: ahead = level ABOVE close (acts as ceiling). Favor = level BELOW close.
			const longAheadPts = value - close
			if (longAheadPts >= 0 && longAheadPts <= bufferPts) {
				longAhead.push({
					level: snapshot,
					distanceBricks: longAheadPts / brickSize,
				})
			}
			const longFavorPts = close - value
			if (longFavorPts > 0 && longFavorPts <= favorPts) {
				longFavor.push(snapshot)
			}
		}

		shortAhead.sort((a, b) => a.distanceBricks - b.distanceBricks)
		longAhead.sort((a, b) => a.distanceBricks - b.distanceBricks)

		out.set(candle.timestamp, {
			short: {
				blocked: shortAhead.length > 0,
				levelsAhead: shortAhead,
				favorCount: shortFavor.length,
				favorLevels: shortFavor,
			},
			long: {
				blocked: longAhead.length > 0,
				levelsAhead: longAhead,
				favorCount: longFavor.length,
				favorLevels: longFavor,
			},
			levels,
		})
	}

	return out
}

export { buildSrWalker }
