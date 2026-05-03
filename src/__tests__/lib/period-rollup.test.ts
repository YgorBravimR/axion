import { describe, it, expect } from "vitest"
import { rollupTrades } from "@/lib/aggregation/period-rollup"

/**
 * Parses a "YYYY-MM-DD" string using the local-time constructor so the
 * resulting Date represents midnight in the host timezone rather than UTC
 * midnight. Avoids the TZ-fragility of `new Date("YYYY-MM-DD")` which
 * produces UTC midnight and can shift the local calendar date by ±1 day
 * depending on the host offset (e.g. America/Sao_Paulo UTC-3).
 */
const parseLocalISODate = (s: string): Date => {
  const [y, m, d] = s.split("-").map(Number)
  return new Date(y, m - 1, d)
}

const makeDay = (date: string, pnlCents: number, commission = 0, fees = 0) => ({
  id: `trade-${date}-${pnlCents}`,
  asset: "WIN",
  pnlCents,
  commissionCents: commission,
  feesCents: fees,
  points: pnlCents / 20, // 1 point = R$0.20 = 20 cents for WIN
  entryDate: parseLocalISODate(date),
})

describe("rollupTrades", () => {
  it("sums net, gross, and points correctly", () => {
    const trades = [
      makeDay("2026-01-05", 10000, 500, 200),
      makeDay("2026-01-06", -5000, 500, 200),
    ]
    const result = rollupTrades(trades, { year: 2026, month: 1 })
    expect(result.netCents).toBe(5000)
    expect(result.grossCents).toBe(6400)        // (10000+500+200) + (-5000+500+200) = 10700 + (-4300)
    expect(result.points).toBe(250)
  })

  it("counts gain days and loss days correctly", () => {
    const trades = [
      makeDay("2026-01-05", 10000),
      makeDay("2026-01-05", 3000),
      makeDay("2026-01-06", -5000),
      makeDay("2026-01-07", -2000),
    ]
    const result = rollupTrades(trades, { year: 2026, month: 1 })
    expect(result.gainDays).toBe(1)
    expect(result.lossDays).toBe(2)
    expect(result.tradingDays).toBe(3)
  })

  it("returns zero result for empty array", () => {
    const result = rollupTrades([], { year: 2026, month: 1 })
    expect(result.netCents).toBe(0)
    expect(result.grossCents).toBe(0)
    expect(result.tradingDays).toBe(0)
  })

  it("handles breakeven trades (pnl = 0) — not counted in gain or loss days", () => {
    const trades = [makeDay("2026-01-05", 0)]
    const result = rollupTrades(trades, { year: 2026, month: 1 })
    expect(result.gainDays).toBe(0)
    expect(result.lossDays).toBe(0)
    expect(result.tradingDays).toBe(0)
  })

  it("classifies mixed-sign same-day trades by net pnl (day-net semantics)", () => {
    const trades = [
      makeDay("2026-01-05", 3000),   // +R$30
      makeDay("2026-01-05", -5000),  // -R$50 → net -R$20 → loss day
    ]
    const result = rollupTrades(trades, { year: 2026, month: 1 })
    expect(result.gainDays).toBe(0)
    expect(result.lossDays).toBe(1)
    expect(result.tradingDays).toBe(1)
  })
})
