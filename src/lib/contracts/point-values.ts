/**
 * Regulatory tick/point values for Brazilian mini-contracts.
 * WIN: R$0.20 per point (Mini Índice Futuro — WINFUT).
 * WDO: R$10.00 per point (Mini Dólar Futuro — WDOFUT).
 * These are fixed by B3 regulation — not configurable.
 *
 * NOTE: The multi-asset cockpit reads `assets.tickValue` (cents/tick) directly
 * for what-if sizing and trade entry. This module is retained because
 * `centsToPoints` is the unit converter used by `rollupTrades` to populate the
 * legacy `points` field on aggregates — switching that to ticks changes
 * downstream metric semantics across the app and is out of scope.
 */

type Instrument = "WIN" | "WDO"

const POINT_VALUES: Record<Instrument, number> = {
	WIN: 0.20,
	WDO: 10.00,
}

const UNKNOWN_INSTRUMENT_POINT_VALUE = 1

const resolvePointValue = (instrument: string): number =>
	POINT_VALUES[instrument as Instrument] ?? UNKNOWN_INSTRUMENT_POINT_VALUE

const pointsToCents = (points: number, instrument: string, contracts = 1): number =>
	Math.round(points * resolvePointValue(instrument) * contracts * 100)

const centsToPoints = (cents: number, instrument: string, contracts = 1): number =>
	Math.round(cents / (resolvePointValue(instrument) * contracts * 100))

export type { Instrument }
export { POINT_VALUES, pointsToCents, centsToPoints }
