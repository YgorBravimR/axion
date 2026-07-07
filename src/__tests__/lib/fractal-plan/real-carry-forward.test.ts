import { describe, it, expect, vi } from "vitest"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

// real-carry-forward.ts imports @/db/drizzle (for computeRealizedPnlByMonth), which
// throws at module load when DATABASE_URL is unset — i.e. on CI. See docs/gotchas.md
// "Unit tests must never transitively import @/db/drizzle at module load".
vi.mock("@/db/drizzle", () => ({ db: {} }))
import {
	capitalAtMonthStart,
	computeNetPnlChain,
	resolveMonthStartCapital,
} from "@/lib/fractal-plan/real-carry-forward"

describe("capitalAtMonthStart", () => {
	// realPnlByMonth is 0-indexed (Jan = index 0). Months in the API are 1-based.
	const noop = Array.from({ length: 12 }, () => 0)

	it("returns initial capital for the plan's first month (no priors)", () => {
		expect(capitalAtMonthStart(500_000, noop, 1, 1)).toBe(500_000)
		// Same when the plan starts mid-year.
		expect(capitalAtMonthStart(500_000, noop, 6, 6)).toBe(500_000)
	})

	it("carries forward ACTUAL realized net P&L — the screenshot bug", () => {
		// June (month 6, index 5) realized net R$ 915,12 = 91_512 cents.
		// July (month 7) start-of-month capital must be 5.000 + 915,12 ≈ R$ 5.915,12,
		// NOT the ~R$ 9.928 the old planned-goal compounding produced.
		const real = [...noop]
		real[5] = 91_512
		const planStartMonth = 6 // account started trading in June
		expect(capitalAtMonthStart(500_000, real, planStartMonth, 7)).toBe(591_512)
	})

	it("only sums months from planStartMonth up to (excluding) targetMonth", () => {
		const real = [...noop]
		real[4] = 10_000 // May — before plan start, must be ignored
		real[5] = 20_000 // June
		real[6] = 30_000 // July
		// Plan starts June (6); capital at start of August (8) = init + June + July.
		expect(capitalAtMonthStart(500_000, real, 6, 8)).toBe(550_000)
		// Capital at start of July = init + June only.
		expect(capitalAtMonthStart(500_000, real, 6, 7)).toBe(520_000)
	})

	it("carries negative months down (losing month shrinks capital)", () => {
		const real = [...noop]
		real[5] = -40_000 // June loss
		expect(capitalAtMonthStart(500_000, real, 6, 7)).toBe(460_000)
	})

	it("treats missing month entries as zero", () => {
		expect(capitalAtMonthStart(500_000, [], 1, 6)).toBe(500_000)
	})
})

describe("computeNetPnlChain", () => {
	it("computes canonical P&L chain for positive gross (personal account)", () => {
		// Personal account: profitShare=100%, tax=20%, no withdrawal
		// Gross 10000 → share 10000 → tax 2000 → net 8000
		const result = computeNetPnlChain({
			grossCents: 10000,
			profitSharePercent: 100,
			irTaxRate: 0.2,
			applyTax: true,
			withdrawalPct: 0,
		})
		expect(result.traderShareCents).toBe(10000)
		expect(result.taxCents).toBe(2000)
		expect(result.netAfterTaxCents).toBe(8000)
		expect(result.withdrawalCents).toBe(0)
		expect(result.retainedCents).toBe(8000)
	})

	it("computes canonical P&L chain for prop account with profit share", () => {
		// Prop account: profitShare=33%, tax=20%, no withdrawal
		// Gross 10000 → share 3300 → tax 660 → net 2640
		const result = computeNetPnlChain({
			grossCents: 10000,
			profitSharePercent: 33,
			irTaxRate: 0.2,
			applyTax: true,
			withdrawalPct: 0,
		})
		expect(result.traderShareCents).toBe(3300)
		expect(result.taxCents).toBe(660)
		expect(result.netAfterTaxCents).toBe(2640)
		expect(result.withdrawalCents).toBe(0)
		expect(result.retainedCents).toBe(2640)
	})

	it("skips tax when applyTax=false", () => {
		// Gross 10000 → share 3300 → NO tax → net 3300
		const result = computeNetPnlChain({
			grossCents: 10000,
			profitSharePercent: 33,
			irTaxRate: 0.2,
			applyTax: false,
			withdrawalPct: 0,
		})
		expect(result.traderShareCents).toBe(3300)
		expect(result.taxCents).toBe(0)
		expect(result.netAfterTaxCents).toBe(3300)
		expect(result.withdrawalCents).toBe(0)
		expect(result.retainedCents).toBe(3300)
	})

	it("applies withdrawal correctly", () => {
		// Net 10000, withdrawal 20% → withdrawn 2000, retained 8000
		const result = computeNetPnlChain({
			grossCents: 10000,
			profitSharePercent: 100,
			irTaxRate: 0.2,
			applyTax: true,
			withdrawalPct: 0.2,
		})
		// Gross 10000 → share 10000 → tax 2000 → net 8000
		// → withdrawal 1600, retained 6400
		expect(result.netAfterTaxCents).toBe(8000)
		expect(result.withdrawalCents).toBe(1600)
		expect(result.retainedCents).toBe(6400)
	})

	it("handles loss (negative gross)", () => {
		// Loss is passed through without share/tax logic
		const result = computeNetPnlChain({
			grossCents: -5000,
			profitSharePercent: 33,
			irTaxRate: 0.2,
			applyTax: true,
			withdrawalPct: 0,
		})
		expect(result.traderShareCents).toBe(-5000) // Loss passes through
		expect(result.taxCents).toBe(0) // No tax on loss
		expect(result.netAfterTaxCents).toBe(-5000)
		expect(result.withdrawalCents).toBe(0) // No withdrawal on loss
		expect(result.retainedCents).toBe(-5000)
	})

	it("handles zero gross", () => {
		const result = computeNetPnlChain({
			grossCents: 0,
			profitSharePercent: 33,
			irTaxRate: 0.2,
			applyTax: true,
			withdrawalPct: 0,
		})
		expect(result.traderShareCents).toBe(0)
		expect(result.taxCents).toBe(0)
		expect(result.netAfterTaxCents).toBe(0)
		expect(result.withdrawalCents).toBe(0)
		expect(result.retainedCents).toBe(0)
	})

	it("clamps profitSharePercent to 0–100 range", () => {
		// Over 100%
		const resultHigh = computeNetPnlChain({
			grossCents: 10000,
			profitSharePercent: 150,
			irTaxRate: 0.2,
			applyTax: true,
			withdrawalPct: 0,
		})
		expect(resultHigh.traderShareCents).toBe(10000) // Clamped to 100%

		// Below 0%
		const resultLow = computeNetPnlChain({
			grossCents: 10000,
			profitSharePercent: -50,
			irTaxRate: 0.2,
			applyTax: true,
			withdrawalPct: 0,
		})
		expect(resultLow.traderShareCents).toBe(0) // Clamped to 0%
	})

	it("guards against NaN input", () => {
		const result = computeNetPnlChain({
			grossCents: NaN,
			profitSharePercent: 33,
			irTaxRate: 0.2,
			applyTax: true,
			withdrawalPct: 0,
		})
		expect(result.traderShareCents).toBe(0)
		expect(result.taxCents).toBe(0)
		expect(result.netAfterTaxCents).toBe(0)
		expect(result.withdrawalCents).toBe(0)
		expect(result.retainedCents).toBe(0)
	})

	it("demonstrates rounding-order divergence from naive formula", () => {
		// Canonical: share first (round), then tax on rounded share
		// Naive formula: gross × share × (1−tax) = gross × 0.33 × 0.8
		// Gross 1000, share 33%, tax 20%
		// Canonical: 1000 × 0.33 = 330 (round) → 330 × 0.2 = 66 (round) → net 264
		// Naive: 1000 × 0.33 × 0.8 = 264 (exactly the same in this case)
		// But edge case: Gross 100, share 33%, tax 20%
		// Canonical: 100 × 0.33 = 33 → 33 × 0.2 = 6.6 → round to 7 → net 26
		// Naive: 100 × 0.33 × 0.8 = 26.4 → rounds to 26
		const result = computeNetPnlChain({
			grossCents: 100,
			profitSharePercent: 33,
			irTaxRate: 0.2,
			applyTax: true,
			withdrawalPct: 0,
		})
		const share = Math.round(100 * 0.33)
		const tax = Math.round(share * 0.2)
		// Canonical: share=33, tax=7, net=26
		// Naive: 100 × 0.33 × 0.8 = 26.4 → 26 (same result in this case)
		// In this case they match, but we test to ensure the canonical path is used
		expect(result.traderShareCents).toBe(share)
		expect(result.taxCents).toBe(tax)
		expect(result.netAfterTaxCents).toBe(26)
	})
})

describe("resolveMonthStartCapital", () => {
	const ladder: LadderRuleR[] = [
		{ minCapitalCents: 0, maxCapitalCents: 500_000, oneRCents: 250 },
		{ minCapitalCents: 500_001, maxCapitalCents: 1_000_000, oneRCents: 500 },
		{ minCapitalCents: 1_000_001, maxCapitalCents: Infinity, oneRCents: 1000 },
	]

	it("uses real carry-forward when ladder rules exist", () => {
		const realPnlByMonth = [0, 0, 0, 100_000, 0, 0, 0, 0, 0, 0, 0, 0]
		// Initial capital 500_000, + 100_000 from April → July start = 600_000
		// 600_000 falls in tier 1 (500_001–1_000_000) → 1R = 500 cents
		const result = resolveMonthStartCapital({
			ladderRules: ladder,
			initialCapitalCents: 500_000,
			realPnlByMonth,
			planStartMonth: 1,
			month: 7,
			snapshotOneRCents: 999, // Should not be used
		})
		expect(result.capitalCents).toBe(600_000)
		expect(result.oneRCents).toBe(500)
		expect(result.isRealCarryForward).toBe(true)
	})

	it("uses snapshot fallback when no ladder rules", () => {
		const result = resolveMonthStartCapital({
			ladderRules: [],
			initialCapitalCents: 500_000,
			realPnlByMonth: [],
			planStartMonth: 1,
			month: 7,
			snapshotOneRCents: 750,
		})
		expect(result.capitalCents).toBe(500_000)
		expect(result.oneRCents).toBe(750)
		expect(result.isRealCarryForward).toBe(false)
	})

	it("handles capital loss that reduces below ladder floor", () => {
		const realPnlByMonth = [0, -250_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		// Initial 500_000, - 250_000 from Feb → March capital = 250_000
		// 250_000 falls below tier 0 floor (0) but above 0, so it clamps to tier 0 → 1R = 250
		const result = resolveMonthStartCapital({
			ladderRules: ladder,
			initialCapitalCents: 500_000,
			realPnlByMonth,
			planStartMonth: 1,
			month: 3,
			snapshotOneRCents: 999,
		})
		expect(result.capitalCents).toBe(250_000)
		expect(result.oneRCents).toBe(250) // Lowest tier 1R
		expect(result.isRealCarryForward).toBe(true)
	})

	it("resolves capital to highest tier when above ladder ceiling", () => {
		const realPnlByMonth = [2_000_000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
		// Initial 500_000, +2_000_000 from month 1 → capital at start of month 2 = 2_500_000
		// resolveTier clamps to highest tier → 1R = 1000
		const result = resolveMonthStartCapital({
			ladderRules: ladder,
			initialCapitalCents: 500_000,
			realPnlByMonth,
			planStartMonth: 1,
			month: 2,
			snapshotOneRCents: 999,
		})
		expect(result.capitalCents).toBe(2_500_000)
		expect(result.oneRCents).toBe(1000) // Highest tier 1R
		expect(result.isRealCarryForward).toBe(true)
	})

	it("handles plan start mid-year correctly", () => {
		const realPnlByMonth = [0, 0, 0, 0, 0, 0, 50_000, 0, 0, 0, 0, 0]
		// Plan starts June (6), month 8 capital = init + June + July
		const result = resolveMonthStartCapital({
			ladderRules: ladder,
			initialCapitalCents: 500_000,
			realPnlByMonth,
			planStartMonth: 6,
			month: 8,
			snapshotOneRCents: 999,
		})
		expect(result.capitalCents).toBe(550_000) // init + June 50k
		expect(result.isRealCarryForward).toBe(true)
	})
})
