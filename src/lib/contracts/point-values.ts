/**
 * Regulatory tick/point values for Brazilian mini-contracts.
 * WIN: R$0.20 per point (Mini Índice Futuro — WINFUT).
 * WDO: R$10.00 per point (Mini Dólar Futuro — WDOFUT).
 * These are fixed by B3 regulation — not configurable.
 */

type Instrument = "WIN" | "WDO"

const POINT_VALUES: Record<Instrument, number> = {
  WIN: 0.20,
  WDO: 10.00,
}

/** Fallback cents-per-point ratio (R$1.00/pt) for instruments not in B3 mini-contracts. */
const UNKNOWN_INSTRUMENT_POINT_VALUE = 1

const resolvePointValue = (instrument: string): number =>
  POINT_VALUES[instrument as Instrument] ?? UNKNOWN_INSTRUMENT_POINT_VALUE

/**
 * Converts raw points to BRL cents for a given instrument and contract count.
 *
 * @param points - Raw point delta (e.g. 100 for a 100-point WIN move)
 * @param instrument - Instrument code: "WIN" | "WDO" (falls back to 1.00 for unknown)
 * @param contracts - Number of contracts traded (default 1)
 * @returns Amount in integer BRL cents
 */
const pointsToCents = (points: number, instrument: string, contracts = 1): number =>
  Math.round(points * resolvePointValue(instrument) * contracts * 100)

/**
 * Converts BRL cents to points for a given instrument and contract count.
 *
 * @param cents - Amount in BRL cents
 * @param instrument - Instrument code
 * @param contracts - Number of contracts (default 1)
 * @returns Integer point count (rounded — WIN/WDO trade in whole points)
 */
const centsToPoints = (cents: number, instrument: string, contracts = 1): number =>
  Math.round(cents / (resolvePointValue(instrument) * contracts * 100))

export type { Instrument }
export { POINT_VALUES, pointsToCents, centsToPoints }

// ---------------------------------------------------------------------------
// Yearly-plan helpers (cents-denominated for integer math)
// ---------------------------------------------------------------------------
//
// The legacy POINT_VALUES export above stores values in reais (R$0.20/pt for
// WIN, R$10.00/pt for WDO) — useful for the human-facing contract display.
// The yearly-plan layer wants them in cents so it can divide integer P&L
// directly without losing precision to floats. Same regulated facts, two
// representations, kept in sync by construction.

interface AssetPointValue {
  asset: string
  pointValueCents: number
  description: string
}

const ASSET_POINT_VALUES: Record<string, AssetPointValue> = {
  WIN: { asset: "WIN", pointValueCents: 20, description: "Mini Índice — R$0,20/pt" },
  WDO: { asset: "WDO", pointValueCents: 1000, description: "Mini Dólar — R$10,00/pt" },
}

const getPointValue = (asset: string): AssetPointValue | null =>
  ASSET_POINT_VALUES[asset.toUpperCase()] ?? null

const financialToPoints = (
  financialPnlCents: number,
  asset: string,
  contracts: number,
): number | null => {
  const pv = getPointValue(asset)
  if (!pv || contracts <= 0) return null
  return financialPnlCents / (pv.pointValueCents * contracts)
}

export { ASSET_POINT_VALUES, getPointValue, financialToPoints }
export type { AssetPointValue }
