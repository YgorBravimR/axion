/**
 * Hawks Volume EMA walker — stateless per-brick lookup of volume vs running EMA.
 *
 * Per the indicator-isolation audit Group G
 * (`docs/hawks-strategy/indicator-isolation/group-g-volume.md`), the
 * `qualityGates.volumeScore` (legacy) and `qualityGates.volume.*` (nested)
 * flags exist throughout config + UI + leaves but have no engine consumer.
 * This walker is the methodology-correct reader the audit prescribed.
 *
 * For each brick, computes the running EMA of `volume_fin` using the standard
 * recurrence (`ema[i] = α * v[i] + (1 − α) * ema[i−1]`, `α = 2 / (N + 1)`).
 * Seed is the first non-zero value.
 *
 * Per spec polarity: above-EMA = high conviction (would score / not block);
 * below-EMA = low conviction (would penalize / block). The Group G audit
 * found the spec polarity is empirically reversed on this engine — that's
 * documented in the audit, not in the walker. The walker is a faithful
 * implementation of the spec; whatever consumes it picks the polarity it
 * wants.
 *
 * Build once at engine init via `buildVolumeEmaWalker(candles, config)`,
 * lookup per brick via `walker.get(timestamp)`. O(N) build + O(1) lookup.
 */

import type { HawksTripleScreenConfig } from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

export interface VolumeEmaSnapshot {
	volume: number | null
	ema: number | null
	aboveEma: boolean // true when volume > ema; false when ≤ ema or either is null
}

const buildVolumeEmaWalker = (
	candles: CandleRow[],
	config: HawksTripleScreenConfig
): Map<string, VolumeEmaSnapshot> => {
	const out = new Map<string, VolumeEmaSnapshot>()
	if (candles.length === 0) {
		return out
	}

	const period = config.qualityGates?.volumeEmaPeriod ?? 500
	const volumeKey = config.volume_key
	const alpha = 2 / (period + 1)

	let ema: number | null = null

	for (const candle of candles) {
		const v = candle.indicators[volumeKey]
		const volume = typeof v === "number" ? v : null

		if (volume === null) {
			out.set(candle.timestamp, { volume, ema, aboveEma: false })
			continue
		}

		if (ema === null) {
			// Seed on first non-zero value. Zero-volume bricks pre-seed are
			// degenerate (pre-open) and should not anchor the running mean.
			if (volume > 0) {
				ema = volume
			}
		} else {
			ema = alpha * volume + (1 - alpha) * ema
		}

		const aboveEma = ema !== null && volume > ema
		out.set(candle.timestamp, { volume, ema, aboveEma })
	}

	return out
}

export { buildVolumeEmaWalker }
