import { describe, it, expect } from "vitest"
import { computePointsPnl } from "../../../../scripts/backfill-points-pnl"

describe("computePointsPnl", () => {
	it("WIN: 2000 cents / (20 cents/pt × 1 contract) = 100 pts", () => {
		expect(computePointsPnl({ financialPnlCents: 2000, asset: "WIN", contracts: 1 })).toBe(100)
	})
	it("WDO: 10000 cents / (1000 cents/pt × 1 contract) = 10 pts", () => {
		expect(computePointsPnl({ financialPnlCents: 10000, asset: "WDO", contracts: 1 })).toBe(10)
	})
	it("WIN: 3 contracts: 6000 / (20 × 3) = 100 pts", () => {
		expect(computePointsPnl({ financialPnlCents: 6000, asset: "WIN", contracts: 3 })).toBe(100)
	})
	it("unknown asset returns null", () => {
		expect(computePointsPnl({ financialPnlCents: 1000, asset: "PETR4", contracts: 1 })).toBeNull()
	})
	it("zero contracts returns null", () => {
		expect(computePointsPnl({ financialPnlCents: 1000, asset: "WIN", contracts: 0 })).toBeNull()
	})
})
