import { describe, it, expect } from "vitest"
import {
  getPointValue,
  financialToPoints,
  ASSET_POINT_VALUES,
} from "@/lib/contracts/point-values"

describe("yearly-plan point-values helpers", () => {
  it("getPointValue(WIN) returns 20 cents/pt", () => {
    expect(getPointValue("WIN")?.pointValueCents).toBe(20)
  })
  it("getPointValue(WDO) returns 1000 cents/pt", () => {
    expect(getPointValue("WDO")?.pointValueCents).toBe(1000)
  })
  it("getPointValue is case-insensitive", () => {
    expect(getPointValue("win")?.pointValueCents).toBe(20)
  })
  it("getPointValue(UNKNOWN) returns null", () => {
    expect(getPointValue("PETR4")).toBeNull()
  })
  it("financialToPoints(2000 cents, WIN, 1 contract) = 100 pts", () => {
    expect(financialToPoints(2000, "WIN", 1)).toBe(100)
  })
  it("financialToPoints(10000 cents, WDO, 1 contract) = 10 pts", () => {
    expect(financialToPoints(10000, "WDO", 1)).toBe(10)
  })
  it("financialToPoints with 0 contracts returns null", () => {
    expect(financialToPoints(1000, "WIN", 0)).toBeNull()
  })
  it("ASSET_POINT_VALUES has WIN and WDO keys", () => {
    expect(ASSET_POINT_VALUES).toHaveProperty("WIN")
    expect(ASSET_POINT_VALUES).toHaveProperty("WDO")
  })
})
