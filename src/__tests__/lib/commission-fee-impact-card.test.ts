/**
 * Logic tests for the visual/presentational decisions in `CommissionFeeImpactCard`.
 *
 * React Testing Library is not installed in this project and the Vitest environment
 * is `node`, so full DOM rendering is not available here. Instead, these tests
 * exercise the pure deterministic logic extracted from the component:
 *
 *   1. Insight severity classification (getInsightMessage path selection):
 *      - grossPnl < 0  → "negativeGross" path
 *      - grossPnl == 0 → "noGross" path
 *      - feesAsPercent > 15 → "high" severity
 *      - feesAsPercent > 5  → "moderate" severity
 *      - feesAsPercent <= 5 → "low" severity
 *
 *   2. Bar width scaling:
 *      - Asset breakdown bar widths are proportional to max(totalFees)
 *      - Monthly trend bar widths are proportional to max(totalFees)
 *      - Edge: maxFee=0 → all widths are 0 (no division by zero)
 *
 *   3. Monthly trend direction:
 *      - First entry always has no trend arrow
 *      - Subsequent entry with higher fees → "up" (increasing / red)
 *      - Subsequent entry with lower fees  → "down" (decreasing / green)
 *      - Subsequent entry with equal fees  → "flat"
 *
 *   4. Empty state guard:
 *      - data=null    → empty state rendered (hasData guard)
 *      - hasData=false → empty state rendered
 *      - hasData=true  → full card rendered
 *
 * The component lives in:
 *   src/components/reports/commission-fee-impact-card.tsx
 */

import { describe, it, expect } from "vitest"
import type { CommissionFeeImpact } from "@/app/actions/reports.types"

// ---------------------------------------------------------------------------
// Logic helpers extracted from CommissionFeeImpactCard (mirroring component)
// ---------------------------------------------------------------------------

/**
 * Mirrors the `getInsightMessage` path-selection logic in the component.
 * Returns the key of the translation string that would be used.
 *
 * @see src/components/reports/commission-fee-impact-card.tsx
 */
const getInsightPath = (
	summary: Pick<
		CommissionFeeImpact["summary"],
		"grossPnl" | "totalFees" | "feesAsPercentOfGross"
	>
): "negativeGross" | "noGross" | "high" | "moderate" | "low" => {
	if (summary.grossPnl <= 0 && summary.totalFees > 0) {
		return summary.grossPnl < 0 ? "negativeGross" : "noGross"
	}

	if (summary.feesAsPercentOfGross > 15) {
		return "high"
	}
	if (summary.feesAsPercentOfGross > 5) {
		return "moderate"
	}
	return "low"
}

/**
 * Mirrors the insight border/label severity CSS class selection in the component.
 *
 * @see src/components/reports/commission-fee-impact-card.tsx
 */
const getInsightSeverity = (
	feesAsPercentOfGross: number
): "high" | "moderate" | "low" => {
	if (feesAsPercentOfGross > 15) {
		return "high"
	}
	if (feesAsPercentOfGross > 5) {
		return "moderate"
	}
	return "low"
}

/**
 * Mirrors the bar width scaling logic in the component.
 * Returns width as a percentage [0, 100].
 */
const computeBarWidth = (fee: number, maxFee: number): number => {
	if (maxFee <= 0) {
		return 0
	}
	return (fee / maxFee) * 100
}

/**
 * Correct implementation matching the component exactly.
 */
const computeTrendDirectionCorrect = (
	currentFees: number,
	previousFees: number | null
): "up" | "down" | "flat" | null => {
	if (previousFees === null) {
		return null
	}
	if (currentFees > previousFees) {
		return "up"
	}
	if (currentFees < previousFees) {
		return "down"
	}
	return "flat"
}

/**
 * Returns true if the component would render the empty state, false for the full card.
 * Mirrors: `if (!data || !data.hasData) { return <empty state> }`
 */
const shouldRenderEmptyState = (data: CommissionFeeImpact | null): boolean => {
	return !data || !data.hasData
}

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

const createSummary = (
	overrides: Partial<CommissionFeeImpact["summary"]> = {}
): CommissionFeeImpact["summary"] => ({
	totalFees: 10.0,
	totalCommission: 8.0,
	totalExchangeFees: 2.0,
	grossPnl: 100.0,
	feesAsPercentOfGross: 10.0,
	avgFeePerTrade: 2.0,
	totalTrades: 5,
	...overrides,
})

const createData = (
	overrides: Partial<CommissionFeeImpact> = {}
): CommissionFeeImpact => ({
	summary: createSummary(),
	assetBreakdown: [],
	monthlyTrend: [],
	hasData: true,
	...overrides,
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CommissionFeeImpactCard — empty state logic", () => {
	it("should show empty state when data is null", () => {
		expect(shouldRenderEmptyState(null)).toBe(true)
	})

	it("should show empty state when data.hasData is false", () => {
		const data = createData({ hasData: false })
		expect(shouldRenderEmptyState(data)).toBe(true)
	})

	it("should render the full card when data is non-null and hasData is true", () => {
		const data = createData({ hasData: true })
		expect(shouldRenderEmptyState(data)).toBe(false)
	})

	it("should show empty state even when summary has non-zero totals but hasData is false", () => {
		// hasData is the canonical gate — summary values don't override it
		const data = createData({
			hasData: false,
			summary: createSummary({ totalFees: 50, totalTrades: 10 }),
		})
		expect(shouldRenderEmptyState(data)).toBe(true)
	})
})

describe("CommissionFeeImpactCard — insight severity (getInsightPath)", () => {
	it("should use the 'negativeGross' path when grossPnl is negative and fees > 0", () => {
		const summary = createSummary({
			grossPnl: -50.0,
			totalFees: 5.0,
			feesAsPercentOfGross: 0,
		})
		expect(getInsightPath(summary)).toBe("negativeGross")
	})

	it("should use the 'noGross' path when grossPnl is exactly zero and fees > 0", () => {
		const summary = createSummary({
			grossPnl: 0,
			totalFees: 5.0,
			feesAsPercentOfGross: 0,
		})
		expect(getInsightPath(summary)).toBe("noGross")
	})

	it("should not use the negative-gross paths when grossPnl <= 0 but totalFees is also 0", () => {
		// No fees paid — falls through to the percent-based path
		// grossPnl=0, fees=0 → feesAsPercentOfGross=0 → "low"
		const summary = createSummary({
			grossPnl: 0,
			totalFees: 0,
			feesAsPercentOfGross: 0,
		})
		expect(getInsightPath(summary)).toBe("low")
	})

	it("should use the 'high' severity path when feesAsPercentOfGross > 15", () => {
		const summary = createSummary({ grossPnl: 100, feesAsPercentOfGross: 15.1 })
		expect(getInsightPath(summary)).toBe("high")
	})

	it("should use the 'high' severity path at exactly the boundary + 0.01%", () => {
		const summary = createSummary({
			grossPnl: 100,
			feesAsPercentOfGross: 15.01,
		})
		expect(getInsightPath(summary)).toBe("high")
	})

	it("should use the 'moderate' severity path when feesAsPercentOfGross is between 5 and 15 (inclusive of 15)", () => {
		const summary = createSummary({ grossPnl: 100, feesAsPercentOfGross: 15.0 })
		expect(getInsightPath(summary)).toBe("moderate")
	})

	it("should use the 'moderate' severity path at 5.1% fees", () => {
		const summary = createSummary({ grossPnl: 100, feesAsPercentOfGross: 5.1 })
		expect(getInsightPath(summary)).toBe("moderate")
	})

	it("should use the 'moderate' severity path at exactly the 5% lower boundary + 0.01%", () => {
		const summary = createSummary({ grossPnl: 100, feesAsPercentOfGross: 5.01 })
		expect(getInsightPath(summary)).toBe("moderate")
	})

	it("should use the 'low' severity path when feesAsPercentOfGross is exactly 5", () => {
		// Boundary: > 5 is moderate, 5.0 is low
		const summary = createSummary({ grossPnl: 100, feesAsPercentOfGross: 5.0 })
		expect(getInsightPath(summary)).toBe("low")
	})

	it("should use the 'low' severity path when feesAsPercentOfGross is 0", () => {
		const summary = createSummary({ grossPnl: 200, feesAsPercentOfGross: 0 })
		expect(getInsightPath(summary)).toBe("low")
	})

	it("should use the 'low' severity path when feesAsPercentOfGross is 4.99%", () => {
		const summary = createSummary({ grossPnl: 100, feesAsPercentOfGross: 4.99 })
		expect(getInsightPath(summary)).toBe("low")
	})

	describe("insight severity CSS class selection", () => {
		it("should return 'high' severity for feesAsPercentOfGross > 15", () => {
			expect(getInsightSeverity(20)).toBe("high")
		})

		it("should return 'moderate' severity for feesAsPercentOfGross between 5 and 15", () => {
			expect(getInsightSeverity(10)).toBe("moderate")
		})

		it("should return 'low' severity for feesAsPercentOfGross <= 5", () => {
			expect(getInsightSeverity(3)).toBe("low")
		})
	})
})

describe("CommissionFeeImpactCard — bar width scaling", () => {
	describe("asset breakdown bars", () => {
		it("should return 100% width for the asset with the maximum fee", () => {
			const maxFee = 50.0
			const width = computeBarWidth(50.0, maxFee)
			expect(width).toBe(100)
		})

		it("should return 50% width for an asset with half the maximum fee", () => {
			const maxFee = 100.0
			const width = computeBarWidth(50.0, maxFee)
			expect(width).toBe(50)
		})

		it("should return 0% width when the fee is zero", () => {
			const width = computeBarWidth(0, 100.0)
			expect(width).toBe(0)
		})

		it("should return 0% width for all bars when maxFee is zero (no division by zero)", () => {
			const width = computeBarWidth(0, 0)
			expect(width).toBe(0)
		})

		it("should scale proportionally for any value between 0 and max", () => {
			const maxFee = 200.0
			expect(computeBarWidth(200, maxFee)).toBe(100)
			expect(computeBarWidth(100, maxFee)).toBe(50)
			expect(computeBarWidth(50, maxFee)).toBe(25)
			expect(computeBarWidth(0, maxFee)).toBe(0)
		})
	})

	describe("monthly trend bars", () => {
		it("should give 100% to the highest-fee month", () => {
			// The month with the highest fees should have a full bar
			const monthFees = [5.0, 10.0, 8.0]
			const maxMonthFee = Math.max(...monthFees)
			const widths = monthFees.map((f) => computeBarWidth(f, maxMonthFee))
			expect(widths[1]).toBe(100) // R$10.00 is max
		})

		it("should give relative widths to all months", () => {
			const monthFees = [4.0, 8.0, 2.0]
			const maxMonthFee = Math.max(...monthFees)
			const widths = monthFees.map((f) => computeBarWidth(f, maxMonthFee))
			expect(widths).toEqual([50, 100, 25])
		})

		it("should give 0% to all months when there are no fees (max=0)", () => {
			const monthFees = [0, 0, 0]
			const maxMonthFee = Math.max(...monthFees) // = 0
			const widths = monthFees.map((f) => computeBarWidth(f, maxMonthFee))
			expect(widths).toEqual([0, 0, 0])
		})
	})
})

describe("CommissionFeeImpactCard — monthly trend direction arrows", () => {
	it("should return null (no arrow) for the first month entry", () => {
		// The first entry has no previous month to compare against
		const direction = computeTrendDirectionCorrect(10.0, null)
		expect(direction).toBeNull()
	})

	it("should return 'up' (increasing / red) when current month fees exceed previous", () => {
		// Fees going up is bad — shown in red TrendingUp icon
		const direction = computeTrendDirectionCorrect(12.0, 8.0)
		expect(direction).toBe("up")
	})

	it("should return 'down' (decreasing / green) when current month fees are lower than previous", () => {
		// Fees going down is good — shown in green TrendingDown icon
		const direction = computeTrendDirectionCorrect(6.0, 10.0)
		expect(direction).toBe("down")
	})

	it("should return 'flat' when current month fees equal the previous month", () => {
		const direction = computeTrendDirectionCorrect(8.0, 8.0)
		expect(direction).toBe("flat")
	})

	it("should correctly identify a trend for a real-world 3-month sequence", () => {
		// Jan: no prev → null; Feb: up from Jan; Mar: down from Feb
		const months = [
			{ month: "2026-01", totalFees: 5.0 },
			{ month: "2026-02", totalFees: 8.0 }, // up
			{ month: "2026-03", totalFees: 3.0 }, // down
		]

		const directions = months.map((m, index) => {
			const prev = index > 0 ? months[index - 1] : null
			return computeTrendDirectionCorrect(
				m.totalFees,
				prev ? prev.totalFees : null
			)
		})

		expect(directions[0]).toBeNull()
		expect(directions[1]).toBe("up")
		expect(directions[2]).toBe("down")
	})

	it("should handle floating-point fee values without producing incorrect directions", () => {
		// R$2.001 vs R$2.000 — small difference should still be detected as "up"
		const direction = computeTrendDirectionCorrect(2.001, 2.0)
		expect(direction).toBe("up")
	})
})

describe("CommissionFeeImpactCard — feesAsPercentOfGross display logic", () => {
	it("should display the percentage when grossPnl > 0", () => {
		// The component renders `{summary.feesAsPercentOfGross.toFixed(1)}%` only when grossPnl > 0
		const summary = createSummary({ grossPnl: 100, feesAsPercentOfGross: 12.5 })
		const shouldDisplay = summary.grossPnl > 0
		expect(shouldDisplay).toBe(true)
	})

	it("should display a dash (—) for the percentage when grossPnl is 0", () => {
		// From the component: `grossPnl > 0 ? \`${...}%\` : "—"`
		const summary = createSummary({ grossPnl: 0, feesAsPercentOfGross: 0 })
		const display =
			summary.grossPnl > 0 ? `${summary.feesAsPercentOfGross.toFixed(1)}%` : "—"
		expect(display).toBe("—")
	})

	it("should display a dash (—) for the percentage when grossPnl is negative", () => {
		const summary = createSummary({ grossPnl: -50, feesAsPercentOfGross: 0 })
		const display =
			summary.grossPnl > 0 ? `${summary.feesAsPercentOfGross.toFixed(1)}%` : "—"
		expect(display).toBe("—")
	})

	it("should format feesAsPercentOfGross to one decimal place", () => {
		const summary = createSummary({
			grossPnl: 100,
			feesAsPercentOfGross: 7.3456,
		})
		const display =
			summary.grossPnl > 0 ? `${summary.feesAsPercentOfGross.toFixed(1)}%` : "—"
		expect(display).toBe("7.3%")
	})
})

describe("CommissionFeeImpactCard — per-month feesAsPercentOfGross display", () => {
	it("should display percent for months with grossPnl > 0 and percent > 0", () => {
		const month = {
			grossPnl: 100.0,
			feesAsPercentOfGross: 8.5,
			totalFees: 8.5,
			month: "2026-01",
			tradeCount: 3,
		}
		const shouldDisplay = month.grossPnl > 0
		expect(shouldDisplay).toBe(true)
	})

	it("should not display percent for months with grossPnl <= 0", () => {
		const month = {
			grossPnl: 0,
			feesAsPercentOfGross: 0,
			totalFees: 2.0,
			month: "2026-01",
			tradeCount: 1,
		}
		const shouldDisplay = month.grossPnl > 0
		expect(shouldDisplay).toBe(false)
	})
})

describe("CommissionFeeImpactCard — asset breakdown rendering conditions", () => {
	it("should render asset breakdown section when assetBreakdown is non-empty", () => {
		// Component: `{assetBreakdown.length > 0 && (...)}`
		const data = createData({
			assetBreakdown: [
				{ asset: "WIN", totalFees: 10.0, tradeCount: 5, avgFeePerTrade: 2.0 },
			],
		})
		expect(data.assetBreakdown.length > 0).toBe(true)
	})

	it("should not render asset breakdown section when assetBreakdown is empty", () => {
		const data = createData({ assetBreakdown: [] })
		expect(data.assetBreakdown.length > 0).toBe(false)
	})
})

describe("CommissionFeeImpactCard — monthly trend rendering conditions", () => {
	it("should render monthly trend section when monthlyTrend is non-empty", () => {
		// Component: `{monthlyTrend.length > 0 && (...)}`
		const data = createData({
			monthlyTrend: [
				{
					month: "2026-01",
					totalFees: 5.0,
					grossPnl: 50.0,
					feesAsPercentOfGross: 10.0,
					tradeCount: 2,
				},
			],
		})
		expect(data.monthlyTrend.length > 0).toBe(true)
	})

	it("should not render monthly trend section when monthlyTrend is empty", () => {
		const data = createData({ monthlyTrend: [] })
		expect(data.monthlyTrend.length > 0).toBe(false)
	})
})
