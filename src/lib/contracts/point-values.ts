/**
 * Regulatory tick/point values for Brazilian mini-contracts.
 * WIN: R$0.20 per point (Mini Índice Futuro — WINFUT).
 * WDO: R$10.00 per point (Mini Dólar Futuro — WDOFUT).
 * These are fixed by B3 regulation — not configurable.
 */
const POINT_VALUES: Record<string, number> = {
  WIN: 0.20,
  WDO: 10.00,
}

/**
 * Converts raw points to BRL cents for a given instrument and contract count.
 *
 * @param points - Raw point delta (e.g. 100 for a 100-point WIN move)
 * @param instrument - Instrument code: "WIN" | "WDO" (falls back to 1.00 for unknown)
 * @param contracts - Number of contracts traded (default 1)
 * @returns Amount in integer BRL cents
 */
const pointsToCents = (points: number, instrument: string, contracts = 1): number =>
  Math.round(points * (POINT_VALUES[instrument] ?? 1) * contracts * 100)

/**
 * Converts BRL cents to points for a given instrument and contract count.
 *
 * @param cents - Amount in BRL cents
 * @param instrument - Instrument code
 * @param contracts - Number of contracts (default 1)
 * @returns Equivalent point count
 */
const centsToPoints = (cents: number, instrument: string, contracts = 1): number =>
  cents / ((POINT_VALUES[instrument] ?? 1) * contracts * 100)

export { POINT_VALUES, pointsToCents, centsToPoints }
