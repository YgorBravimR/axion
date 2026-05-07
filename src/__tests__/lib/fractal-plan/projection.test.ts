import { describe, it, expect } from "vitest"
import { projectMonth, projectYear } from "@/lib/fractal-plan/projection"

describe("projectMonth", () => {
	it("returns zero PnL when no week targets set", () => {
		const result = projectMonth({
			startBalanceCents: 300_000,
			weekTargetRs: [null, null, null, null],
			oneRCents: 10_000,
			tradingDaysPerWeek: 5,
			irTaxRate: 0.3,
		})
		expect(result.grossPnlCents).toBe(0)
		expect(result.projectedNetLiquidCents).toBe(0)
		expect(result.endBalanceCents).toBe(300_000)
		expect(result.monthlyRentPct).toBe(0)
	})

	it("applies IR only on positive PnL", () => {
		const result = projectMonth({
			startBalanceCents: 300_000,
			weekTargetRs: [2, 2, 2, 2], // 8R × R$100 = R$800 gross
			oneRCents: 10_000,
			tradingDaysPerWeek: 5,
			irTaxRate: 0.3,
		})
		expect(result.grossPnlCents).toBe(80_000)
		expect(result.projectedNetLiquidCents).toBe(56_000) // 800 − 240 IR = 560
		expect(result.endBalanceCents).toBe(356_000)
	})

	it("does not refund tax on negative weeks", () => {
		const result = projectMonth({
			startBalanceCents: 300_000,
			weekTargetRs: [-3, -2, 0, 0],
			oneRCents: 10_000,
			tradingDaysPerWeek: 5,
			irTaxRate: 0.3,
		})
		expect(result.grossPnlCents).toBe(-50_000)
		expect(result.projectedNetLiquidCents).toBe(-50_000)
		expect(result.endBalanceCents).toBe(250_000)
	})

	it("computes avgR per day from trading-days-per-week", () => {
		const result = projectMonth({
			startBalanceCents: 100_000,
			weekTargetRs: [2, 2, 2, 2], // 8R total / 4 weeks = 2R/week / 5 days = 0.4R/day
			oneRCents: 5_000,
			tradingDaysPerWeek: 5,
			irTaxRate: 0,
		})
		expect(result.avgRPerWeek).toBeCloseTo(2)
		expect(result.avgRPerDay).toBeCloseTo(0.4)
	})

	it("derives monthlyRentPct off start balance", () => {
		const result = projectMonth({
			startBalanceCents: 100_000, // R$1.000
			weekTargetRs: [10],
			oneRCents: 10_000,
			tradingDaysPerWeek: 5,
			irTaxRate: 0,
		})
		expect(result.monthlyRentPct).toBeCloseTo(100) // doubled balance
	})

	it("computes withdrawalCents on positive net only", () => {
		const result = projectMonth({
			startBalanceCents: 300_000,
			weekTargetRs: [2, 2, 2, 2], // 8R × R$100 = R$800 gross; net after 30% IR = R$560
			oneRCents: 10_000,
			tradingDaysPerWeek: 5,
			irTaxRate: 0.3,
			withdrawalPct: 0.3,
		})
		expect(result.projectedNetLiquidCents).toBe(56_000)
		expect(result.withdrawalCents).toBe(16_800) // 30% of 56_000
	})

	it("zero withdrawalCents on negative net", () => {
		const result = projectMonth({
			startBalanceCents: 300_000,
			weekTargetRs: [-2, -2],
			oneRCents: 10_000,
			tradingDaysPerWeek: 5,
			irTaxRate: 0.3,
			withdrawalPct: 0.3,
		})
		expect(result.projectedNetLiquidCents).toBe(-40_000)
		expect(result.withdrawalCents).toBe(0)
	})

	it("withdrawalCents does not affect endBalance (display-only)", () => {
		const noWithdraw = projectMonth({
			startBalanceCents: 100_000,
			weekTargetRs: [5],
			oneRCents: 10_000,
			tradingDaysPerWeek: 5,
			irTaxRate: 0,
		})
		const withWithdraw = projectMonth({
			startBalanceCents: 100_000,
			weekTargetRs: [5],
			oneRCents: 10_000,
			tradingDaysPerWeek: 5,
			irTaxRate: 0,
			withdrawalPct: 0.3,
		})
		expect(withWithdraw.endBalanceCents).toBe(noWithdraw.endBalanceCents)
		expect(withWithdraw.withdrawalCents).toBeGreaterThan(0)
	})
})

describe("projectYear", () => {
	it("compounds 12 months, increasing balance each step on positive months", () => {
		const months = Array.from({ length: 12 }, () => ({
			weekTargetRs: [1, 1, 1, 1] as const,
			oneRCents: 10_000,
			tradingDaysPerWeek: 5,
		}))
		const result = projectYear({
			initialCapitalCents: 300_000,
			months,
			irTaxRate: 0,
		})
		expect(result.months).toHaveLength(12)
		expect(result.totalRAccum).toBe(48) // 4R × 12 months
		expect(result.endBalanceCents).toBe(300_000 + 48 * 10_000)
		expect(result.projectedNetLiquidCents).toBe(48 * 10_000)
	})

	it("threads each month's startBalance from prior endBalance", () => {
		const months = [
			{ weekTargetRs: [5], oneRCents: 10_000, tradingDaysPerWeek: 5 },
			{ weekTargetRs: [3], oneRCents: 10_000, tradingDaysPerWeek: 5 },
		]
		const result = projectYear({
			initialCapitalCents: 100_000,
			months,
			irTaxRate: 0,
		})
		expect(result.months[0].startBalanceCents).toBe(100_000)
		expect(result.months[0].endBalanceCents).toBe(150_000)
		expect(result.months[1].startBalanceCents).toBe(150_000)
		expect(result.months[1].endBalanceCents).toBe(180_000)
	})

	it("totalRentPct reflects compounded gain on initial capital", () => {
		const result = projectYear({
			initialCapitalCents: 100_000,
			months: [
				{ weekTargetRs: [10], oneRCents: 10_000, tradingDaysPerWeek: 5 },
			],
			irTaxRate: 0,
		})
		expect(result.totalRentPct).toBeCloseTo(100) // +R$1000 on R$1000
	})
})
