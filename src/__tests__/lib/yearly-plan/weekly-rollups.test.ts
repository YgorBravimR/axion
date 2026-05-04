import { describe, it, expect } from "vitest"
import { computeMonthRollup } from "@/lib/yearly-plan/weekly-rollups"
import type { WeeklyTarget } from "@/db/schema"

const makeWeek = (overrides: Partial<WeeklyTarget>): WeeklyTarget => ({
	id: "w1",
	yearlyPlanId: "plan1",
	isoWeek: 1,
	isoYear: 2026,
	contracts: 1,
	valorOperacionalCents: 300000,
	ptsAlvo: "6.50",
	ptsFeito: "6.00",
	ptsSource: "auto",
	metaBrutoCents: null,
	metaLiquidoCents: null,
	createdAt: new Date(),
	updatedAt: new Date(),
	...overrides,
})

const PLAN_STUB = {
	irTaxRate: "30.00",
	tradingDaysPerWeek: 5,
	valorPorContratoCents: 300000,
}

describe("computeMonthRollup", () => {
	it("totalPtsAlvo sums ptsAlvo across weeks", () => {
		const weeks = [
			makeWeek({ isoWeek: 1, ptsAlvo: "6.50" }),
			makeWeek({ isoWeek: 2, ptsAlvo: "6.50" }),
			makeWeek({ isoWeek: 3, ptsAlvo: "6.50" }),
			makeWeek({ isoWeek: 4, ptsAlvo: "6.50" }),
		]
		const rollup = computeMonthRollup(weeks, PLAN_STUB as never, 0, 0)
		expect(rollup.totalPtsAlvo).toBeCloseTo(26, 5)
	})
	it("totalPtsFeito sums ptsFeito across weeks (null treated as 0)", () => {
		const weeks = [
			makeWeek({ isoWeek: 1, ptsFeito: "10.00" }),
			makeWeek({ isoWeek: 2, ptsFeito: null }),
			makeWeek({ isoWeek: 3, ptsFeito: "5.00" }),
		]
		const rollup = computeMonthRollup(weeks, PLAN_STUB as never, 0, 0)
		expect(rollup.totalPtsFeito).toBeCloseTo(15, 5)
	})
	it("avgPtsPerWeek = totalPtsFeito / number of weeks with data", () => {
		const weeks = [
			makeWeek({ isoWeek: 1, ptsFeito: "10.00" }),
			makeWeek({ isoWeek: 2, ptsFeito: "20.00" }),
		]
		const rollup = computeMonthRollup(weeks, PLAN_STUB as never, 0, 0)
		expect(rollup.avgPtsPerWeek).toBeCloseTo(15, 5)
	})
	it("cumulativePoints carries forward from prior months", () => {
		const weeks = [makeWeek({ isoWeek: 1, ptsFeito: "10.00" })]
		const rollup = computeMonthRollup(weeks, PLAN_STUB as never, 0, 50)
		expect(rollup.cumulativePoints).toBeCloseTo(60, 5)
	})
	it("cumulativeFinancialCents carries forward", () => {
		const weeks = [makeWeek({ isoWeek: 1, metaBrutoCents: 100000 })]
		const rollup = computeMonthRollup(weeks, PLAN_STUB as never, 200000, 0)
		expect(rollup.cumulativeFinancialCents).toBe(300000)
	})
})
