import { describe, it, expect } from "vitest"
import { POINT_VALUES, pointsToCents, centsToPoints } from "@/lib/contracts/point-values"

describe("point-values", () => {
  it("WIN point value is R$0.20", () => {
    expect(POINT_VALUES["WIN"]).toBe(0.20)
  })

  it("WDO point value is R$10.00", () => {
    expect(POINT_VALUES["WDO"]).toBe(10.00)
  })

  it("pointsToCents: 100 WIN points × 1 contract = 2000 cents (R$20.00)", () => {
    expect(pointsToCents(100, "WIN", 1)).toBe(2000)
  })

  it("pointsToCents: 50 WDO points × 2 contracts = 100000 cents (R$1000.00)", () => {
    expect(pointsToCents(50, "WDO", 2)).toBe(100000)
  })

  it("pointsToCents: unknown instrument falls back to 1.00/point", () => {
    expect(pointsToCents(100, "UNKNOWN", 1)).toBe(10000)
  })

  it("centsToPoints: 2000 cents WIN 1 contract = 100 points", () => {
    expect(centsToPoints(2000, "WIN", 1)).toBe(100)
  })

  it("centsToPoints: 100000 cents WDO 2 contracts = 50 points", () => {
    expect(centsToPoints(100000, "WDO", 2)).toBe(50)
  })

  it("centsToPoints: 300 cents WIN 3 contracts = 5 points (float drift guard)", () => {
    expect(centsToPoints(300, "WIN", 3)).toBe(5)
  })

  it("round-trip: pointsToCents → centsToPoints returns input", () => {
    // For each (points, instrument, contracts) combo, round-trip must return points
    expect(centsToPoints(pointsToCents(5, "WIN", 3), "WIN", 3)).toBe(5)
    expect(centsToPoints(pointsToCents(7, "WDO", 4), "WDO", 4)).toBe(7)
  })
})
