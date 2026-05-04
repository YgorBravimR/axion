import { describe, it, expect } from "vitest"
import { accumulateIrrf } from "@/lib/tax/irrf-accumulator"

describe("accumulateIrrf", () => {
	it("positive days only — IRRF 1% on each positive day gross", () => {
		const days = [
			{ date: new Date("2026-01-02"), grossPnlCents: 50000 },  // R$500 gain → IRRF 500
			{ date: new Date("2026-01-03"), grossPnlCents: 20000 },  // R$200 gain → IRRF 200
		]
		const result = accumulateIrrf(days, 100)  // 100bps = 1%
		expect(result.totalIrrfCents).toBe(700)
		expect(result.irrfByDay).toHaveLength(2)
		expect(result.irrfByDay[0].irrfCents).toBe(500)
		expect(result.irrfByDay[1].irrfCents).toBe(200)
	})

	it("negative day → no IRRF withheld", () => {
		const days = [
			{ date: new Date("2026-01-02"), grossPnlCents: -30000 },
		]
		const result = accumulateIrrf(days, 100)
		expect(result.totalIrrfCents).toBe(0)
		expect(result.irrfByDay[0].irrfCents).toBe(0)
	})

	it("mixed days — only positive days contribute", () => {
		const days = [
			{ date: new Date("2026-01-02"), grossPnlCents: 100000 },  // IRRF 1000
			{ date: new Date("2026-01-03"), grossPnlCents: -50000 },  // IRRF 0
			{ date: new Date("2026-01-04"), grossPnlCents: 0 },        // IRRF 0
			{ date: new Date("2026-01-05"), grossPnlCents: 80000 },   // IRRF 800
		]
		const result = accumulateIrrf(days, 100)
		expect(result.totalIrrfCents).toBe(1800)
		expect(result.irrfByDay[1].irrfCents).toBe(0)
		expect(result.irrfByDay[2].irrfCents).toBe(0)
	})

	it("all loss days → totalIrrfCents = 0", () => {
		const days = [
			{ date: new Date("2026-01-02"), grossPnlCents: -10000 },
			{ date: new Date("2026-01-03"), grossPnlCents: -20000 },
		]
		const result = accumulateIrrf(days, 100)
		expect(result.totalIrrfCents).toBe(0)
	})

	it("empty days array → total 0, empty byDay", () => {
		const result = accumulateIrrf([], 100)
		expect(result.totalIrrfCents).toBe(0)
		expect(result.irrfByDay).toHaveLength(0)
	})
})
