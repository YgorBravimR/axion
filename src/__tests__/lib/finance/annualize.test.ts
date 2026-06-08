import { describe, it, expect } from "vitest"
import {
	TRADING_DAYS_PER_YEAR,
	annualizedSharpe,
	annualizedSortino,
	annualizedVolatility,
	cagr,
	bucketTradesToDailyReturns,
	sampleStdDev,
} from "@/lib/finance/annualize"

describe("annualize", () => {
	describe("annualizedSharpe", () => {
		it("computes annualized Sharpe from daily returns", () => {
			// Known fixture: daily mean 0.1%, daily std 0.5%
			// Annualized Sharpe = (0.001 / 0.005) × √252 ≈ 3.1749
			const sharpe = annualizedSharpe(0.001, 0.005)
			expect(sharpe).toBeCloseTo(3.1749, 3)
		})

		it("returns 0 when std dev is 0 (no volatility)", () => {
			const sharpe = annualizedSharpe(0.001, 0)
			expect(sharpe).toBe(0)
		})

		it("returns 0 for NaN inputs", () => {
			expect(annualizedSharpe(NaN, 0.005)).toBe(0)
			expect(annualizedSharpe(0.001, NaN)).toBe(0)
			expect(annualizedSharpe(NaN, NaN)).toBe(0)
		})

		it("returns 0 for non-finite inputs", () => {
			expect(annualizedSharpe(Infinity, 0.005)).toBe(0)
			expect(annualizedSharpe(0.001, Infinity)).toBe(0)
			expect(annualizedSharpe(-Infinity, 0.005)).toBe(0)
		})

		it("handles negative mean returns", () => {
			// Negative mean, positive std
			const sharpe = annualizedSharpe(-0.001, 0.005)
			expect(sharpe).toBeCloseTo(-3.1749, 3)
		})
	})

	describe("annualizedSortino", () => {
		it("computes annualized Sortino from daily returns", () => {
			// Known fixture: daily mean 0.1%, daily downside dev 0.3%
			// Annualized Sortino = (0.001 / 0.003) × √252 ≈ 5.2915
			const sortino = annualizedSortino(0.001, 0.003)
			expect(sortino).toBeCloseTo(5.2915, 3)
		})

		it("returns 0 when downside dev is 0", () => {
			const sortino = annualizedSortino(0.001, 0)
			expect(sortino).toBe(0)
		})

		it("returns 0 for NaN inputs", () => {
			expect(annualizedSortino(NaN, 0.003)).toBe(0)
			expect(annualizedSortino(0.001, NaN)).toBe(0)
		})

		it("has asymmetric shape (penalizes downside volatility)", () => {
			const sharpe = annualizedSharpe(0.001, 0.005)
			const sortino = annualizedSortino(0.001, 0.003)
			// Sortino should be higher than Sharpe (smaller downside dev)
			expect(sortino).toBeGreaterThan(sharpe)
		})
	})

	describe("annualizedVolatility", () => {
		it("computes annualized volatility from daily std", () => {
			// Daily std 0.5% → annualized ≈ 0.5% × √252 ≈ 7.937%
			const vol = annualizedVolatility(0.005)
			expect(vol).toBeCloseTo(0.07937, 5)
		})

		it("returns 0 for NaN input", () => {
			expect(annualizedVolatility(NaN)).toBe(0)
		})

		it("scales proportionally", () => {
			const vol1 = annualizedVolatility(0.005)
			const vol2 = annualizedVolatility(0.01)
			expect(vol2).toBeCloseTo(vol1 * 2, 5)
		})
	})

	describe("cagr", () => {
		it("computes CAGR over multiple years", () => {
			// $100k → $500k over 5 years
			// CAGR = (5/1)^(1/5) - 1 ≈ 0.3797 (37.97%)
			const cagrValue = cagr(100000, 500000, 5)
			expect(cagrValue).toBeCloseTo(0.3797, 4)
		})

		it("handles single-year growth", () => {
			// $100k → $110k over 1 year = 10%
			const cagrValue = cagr(100000, 110000, 1)
			expect(cagrValue).toBeCloseTo(0.1, 5)
		})

		it("returns 0 for startEquity <= 0", () => {
			expect(cagr(0, 500000, 5)).toBe(0)
			expect(cagr(-100000, 500000, 5)).toBe(0)
		})

		it("returns 0 for years <= 0", () => {
			expect(cagr(100000, 500000, 0)).toBe(0)
			expect(cagr(100000, 500000, -5)).toBe(0)
		})

		it("returns -1 for endEquity < 0 (loss beyond initial)", () => {
			const cagrValue = cagr(100000, -50000, 5)
			expect(cagrValue).toBe(-1)
		})

		it("returns -1 for endEquity == 0 (complete loss)", () => {
			const cagrValue = cagr(100000, 0, 5)
			expect(cagrValue).toBe(-1)
		})

		it("returns 0 for NaN inputs", () => {
			expect(cagr(NaN, 500000, 5)).toBe(0)
			expect(cagr(100000, NaN, 5)).toBe(0)
			expect(cagr(100000, 500000, NaN)).toBe(0)
		})

		it("handles non-finite inputs", () => {
			expect(cagr(Infinity, 500000, 5)).toBe(0)
			expect(cagr(100000, Infinity, 5)).toBe(0)
			expect(cagr(100000, 500000, Infinity)).toBe(0)
		})
	})

	describe("bucketTradesToDailyReturns", () => {
		it("groups trades by date and computes daily returns", () => {
			const trades = [
				{ closedAt: new Date("2026-01-01"), pnlCents: 10000 },
				{ closedAt: new Date("2026-01-01"), pnlCents: 5000 },
				{ closedAt: new Date("2026-01-02"), pnlCents: -3000 },
			]
			const result = bucketTradesToDailyReturns(trades, 1000000)

			expect(result).toHaveLength(2)
			expect(result[0]).toEqual({
				date: "2026-01-01",
				pnlCents: 15000,
				returnPct: 1.5,
			})
			expect(result[1]).toEqual({
				date: "2026-01-02",
				pnlCents: -3000,
				returnPct: expect.closeTo(-0.3, 2),
			})
		})

		it("sorts results chronologically", () => {
			const trades = [
				{ closedAt: "2026-01-03", pnlCents: 1000 },
				{ closedAt: "2026-01-01", pnlCents: 2000 },
				{ closedAt: "2026-01-02", pnlCents: 3000 },
			]
			const result = bucketTradesToDailyReturns(trades, 1000000)

			expect(result[0]?.date).toBe("2026-01-01")
			expect(result[1]?.date).toBe("2026-01-02")
			expect(result[2]?.date).toBe("2026-01-03")
		})

		it("computes running equity-based returns", () => {
			// Start: 100k
			// Day 1: +10k → equity 110k
			// Day 2: -5.5k (should be 5% of 110k) → equity 104.5k
			const trades = [
				{ closedAt: "2026-01-01", pnlCents: 1000000 },
				{ closedAt: "2026-01-02", pnlCents: -550000 },
			]
			const result = bucketTradesToDailyReturns(trades, 10000000)

			expect(result[0]?.returnPct).toBeCloseTo(10, 1)
			expect(result[1]?.returnPct).toBeCloseTo(-5, 1)
		})

		it("returns empty array for invalid initialBalance", () => {
			const trades = [{ closedAt: "2026-01-01", pnlCents: 1000 }]
			expect(bucketTradesToDailyReturns(trades, 0)).toEqual([])
			expect(bucketTradesToDailyReturns(trades, -1000)).toEqual([])
			expect(bucketTradesToDailyReturns(trades, NaN)).toEqual([])
		})

		it("skips trades with malformed dates", () => {
			const trades = [
				{ closedAt: "invalid-date", pnlCents: 1000 },
				{ closedAt: "2026-01-01", pnlCents: 2000 },
			]
			const result = bucketTradesToDailyReturns(trades, 1000000)

			expect(result).toHaveLength(1)
			expect(result[0]?.date).toBe("2026-01-01")
		})
	})

	describe("sampleStdDev", () => {
		it("computes sample std dev with Bessel's correction", () => {
			// Known values: [1, 2, 3, 4, 5]
			// Mean = 3, squared diffs = [4, 1, 0, 1, 4], sum = 10
			// Sample std (n-1 divisor) = √(10/4) = 1.5811...
			const stdDev = sampleStdDev([1, 2, 3, 4, 5])
			expect(stdDev).toBeCloseTo(1.5811, 4)
		})

		it("returns 0 for array with < 2 elements", () => {
			expect(sampleStdDev([])).toBe(0)
			expect(sampleStdDev([5])).toBe(0)
		})

		it("returns 0 for all identical values", () => {
			const stdDev = sampleStdDev([5, 5, 5, 5])
			expect(stdDev).toBe(0)
		})

		it("differs from population std dev by factor √(n/(n-1))", () => {
			const values = [1, 2, 3, 4, 5]
			const sample = sampleStdDev(values)

			// Population std = √(10/5) = 1.4142...
			const population = Math.sqrt(
				values.reduce((sum, v) => sum + Math.pow(v - 3, 2), 0) / values.length
			)

			// sample / population = √(5/4) ≈ 1.118
			expect(sample / population).toBeCloseTo(Math.sqrt(5 / 4), 5)
		})

		it("handles negative values", () => {
			const stdDev = sampleStdDev([-5, -3, 0, 3, 5])
			expect(stdDev).toBeGreaterThan(0)
			expect(stdDev).toBeCloseTo(4.1231, 4)
		})
	})

	describe("integration: daily returns → annualized Sharpe", () => {
		it("chains daily-bucket → Sharpe → annualize", () => {
			// Simulate 5 trading days with varying returns
			const trades = [
				{ closedAt: "2026-01-01", pnlCents: 5000 }, // 0.5%
				{ closedAt: "2026-01-02", pnlCents: 10000 }, // 1.0% (cumulative equity 1015k)
				{ closedAt: "2026-01-03", pnlCents: -5000 }, // -0.49%
				{ closedAt: "2026-01-04", pnlCents: 15000 }, // 1.47%
				{ closedAt: "2026-01-05", pnlCents: 2000 }, // 0.2%
			]

			const daily = bucketTradesToDailyReturns(trades, 1000000)
			const returnPcts = daily.map((d) => d.returnPct / 100) // Convert % to decimal
			const mean = returnPcts.reduce((s, v) => s + v, 0) / returnPcts.length
			const std = sampleStdDev(returnPcts)
			const sharpe = annualizedSharpe(mean, std)

			expect(daily).toHaveLength(5)
			expect(sharpe).toBeGreaterThan(0)
			expect(sharpe).toBeLessThan(30) // Reasonable range for short sample
		})
	})

	describe("edge cases", () => {
		it("TRADING_DAYS_PER_YEAR constant equals 252", () => {
			expect(TRADING_DAYS_PER_YEAR).toBe(252)
		})

		it("handles very small returns", () => {
			const sharpe = annualizedSharpe(0.0001, 0.0005)
			expect(sharpe).toBeCloseTo(3.1749, 3)
		})

		it("handles very large returns", () => {
			const sharpe = annualizedSharpe(0.5, 0.05)
			expect(sharpe).toBeCloseTo(158.745, 2)
		})

		it("bucketTradesToDailyReturns handles empty trade list", () => {
			const result = bucketTradesToDailyReturns([], 1000000)
			expect(result).toEqual([])
		})
	})
})
