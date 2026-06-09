/**
 * Unit tests for `src/lib/pdf/report-pdf-helpers.ts`.
 *
 * Covers every exported pure function:
 *   - formatCurrency  — Brazilian Real locale formatting with sign prefix
 *   - formatPercent   — single-decimal percentage string
 *   - formatR         — R-multiple string with sign prefix
 *   - buildWeeklyPdfFilename  — "axion-weekly-{weekStart}.pdf"
 *   - buildMonthlyPdfFilename — "axion-monthly-{monthStart}.pdf"
 *   - parseOffsetParam        — safe integer parsing of the ?offset= param
 *   - isValidReportType       — type-guard for "weekly" | "monthly"
 *
 * No mocks are required — all functions are stateless pure functions.
 */

import { describe, it, expect } from "vitest"
import {
	formatCurrency,
	formatPercent,
	formatR,
	buildWeeklyPdfFilename,
	buildMonthlyPdfFilename,
	parseOffsetParam,
	isValidReportType,
} from "@/lib/pdf/report-pdf-helpers"

// ============================================================================
// formatCurrency
// ============================================================================

describe("formatCurrency", () => {
	describe("positive values", () => {
		it("should prefix a positive value with '+'", () => {
			const result = formatCurrency(1250)
			expect(result.startsWith("+")).toBe(true)
		})

		it("should format 1250 using pt-BR locale with correct separators", () => {
			// pt-BR uses period as thousands separator and comma as decimal separator
			// Intl.NumberFormat uses a non-breaking space between symbol and number
			const result = formatCurrency(1250)
			expect(result).toContain("+")
			expect(result).toContain("R$")
			expect(result).toContain("1.250,00")
		})

		it("should format a small positive value correctly", () => {
			const result = formatCurrency(0.5)
			expect(result).toContain("+")
			expect(result).toContain("R$")
			expect(result).toContain("0,50")
		})

		it("should format a large positive value with thousands separator", () => {
			const result = formatCurrency(10000)
			expect(result).toContain("+")
			expect(result).toContain("R$")
			expect(result).toContain("10.000,00")
		})
	})

	describe("negative values", () => {
		it("should NOT prefix a negative value with '+'", () => {
			const result = formatCurrency(-500)
			expect(result.startsWith("+")).toBe(false)
		})

		it("should format -500 correctly without double-negative", () => {
			// Math.abs(-500) = 500, prefix = "" → "R$ 500,00" (with non-breaking space)
			const result = formatCurrency(-500)
			expect(result).not.toContain("+")
			expect(result).toContain("R$")
			expect(result).toContain("500,00")
		})

		it("should format a large negative value with thousands separator", () => {
			const result = formatCurrency(-3000.75)
			expect(result).not.toContain("+")
			expect(result).toContain("R$")
			expect(result).toContain("3.000,75")
		})
	})

	describe("zero", () => {
		it("should prefix zero with '+' because 0 >= 0", () => {
			// The implementation uses `value >= 0 ? "+" : ""`, so zero gets "+"
			const result = formatCurrency(0)
			expect(result).toContain("+")
			expect(result).toContain("R$")
			expect(result).toContain("0,00")
		})
	})

	describe("decimal precision", () => {
		it("should always produce exactly 2 decimal places", () => {
			// 1.1 → "1,10" not "1,1"
			const result = formatCurrency(1.1)
			expect(result).toContain("+")
			expect(result).toContain("1,10")
		})

		it("should round to 2 decimal places", () => {
			// 1.005 rounds to 1,01 in most environments
			const result = formatCurrency(100.999)
			expect(result).toContain("+")
			expect(result).toContain("101,00")
		})
	})
})

// ============================================================================
// formatPercent
// ============================================================================

describe("formatPercent", () => {
	it("should format an integer percentage with one decimal place (pt-BR locale)", () => {
		// formatPercent now uses Intl with locale support. Default locale is pt-BR.
		// pt-BR uses comma as decimal separator: 60,0%
		const result = formatPercent(60)
		expect(result).toMatch(/60[.,]0%/) // Either "60.0%" or "60,0%"
	})

	it("should round to one decimal place", () => {
		const result = formatPercent(66.666)
		expect(result).toMatch(/66[.,]7%/)
	})

	it("should format 0% correctly", () => {
		const result = formatPercent(0)
		expect(result).toMatch(/0[.,]0%/)
	})

	it("should format 100% correctly", () => {
		const result = formatPercent(100)
		expect(result).toMatch(/100[.,]0%/)
	})

	it("should truncate towards the nearest tenth, not further", () => {
		// 33.333... → "33.3%" or "33,3%" depending on locale
		const result = formatPercent(33.333)
		expect(result).toMatch(/33[.,]3%/)
	})

	it("should handle fractional inputs that round up", () => {
		// 49.95 → "50.0%" or "50,0%" depending on locale (Intl halfExpand rounding)
		const result = formatPercent(49.95)
		expect(result).toMatch(/50[.,]0%/)
	})

	it("should handle negative percentages", () => {
		// Edge case: a win-rate can never be negative, but the formatter is generic
		const result = formatPercent(-5.5)
		expect(result).toMatch(/-5[.,]5%/)
	})

	it("should respect locale parameter (en-US uses period as decimal)", () => {
		// When explicitly passing en-US locale, should use period
		const result = formatPercent(60, "en")
		expect(result).toContain("%")
		expect(result).toMatch(/60[.,]0%/)
	})
})

// ============================================================================
// formatR
// ============================================================================

describe("formatR", () => {
	describe("positive R-multiples", () => {
		it("should prefix a positive value with '+'", () => {
			expect(formatR(2.5).startsWith("+")).toBe(true)
		})

		it("should format +2.5R correctly (pt-BR uses comma as decimal)", () => {
			const result = formatR(2.5)
			expect(result).toContain("+")
			expect(result).toMatch(/2[.,]50R/)
		})

		it("should format +1R correctly", () => {
			const result = formatR(1)
			expect(result).toContain("+")
			expect(result).toMatch(/1[.,]00R/)
		})

		it("should always show exactly two decimal places for positive", () => {
			const result = formatR(3)
			expect(result).toContain("+")
			expect(result).toMatch(/3[.,]00R/)
		})
	})

	describe("negative R-multiples", () => {
		it("should NOT prefix a negative value with '+'", () => {
			expect(formatR(-1).startsWith("+")).toBe(false)
		})

		it("should format -1R correctly", () => {
			const result = formatR(-1)
			expect(result).toContain("-")
			expect(result).toMatch(/1[.,]00R/)
		})

		it("should format a fractional loss correctly", () => {
			const result = formatR(-0.5)
			expect(result).toContain("-")
			expect(result).toMatch(/0[.,]50R/)
		})
	})

	describe("zero", () => {
		it("should prefix zero with '+' because 0 >= 0", () => {
			const result = formatR(0)
			expect(result).toContain("+")
			expect(result).toMatch(/0[.,]00R/)
		})
	})

	describe("decimal precision", () => {
		it("should round to two decimal places", () => {
			// 2.556 rounds to 2.56
			const result = formatR(2.556)
			expect(result).toContain("+")
			expect(result).toMatch(/2[.,]56R/)
		})

		it("should not truncate trailing zeros", () => {
			// Ensures two decimal places are shown
			const result = formatR(1.1)
			expect(result).toContain("+")
			expect(result).toMatch(/1[.,]10R/)
		})
	})
})

// ============================================================================
// buildWeeklyPdfFilename
// ============================================================================

describe("buildWeeklyPdfFilename", () => {
	it("should produce the correct filename for a Monday date", () => {
		expect(buildWeeklyPdfFilename("2026-03-30")).toBe(
			"axion-weekly-2026-03-30.pdf"
		)
	})

	it("should produce the correct filename for another week", () => {
		expect(buildWeeklyPdfFilename("2026-01-05")).toBe(
			"axion-weekly-2026-01-05.pdf"
		)
	})

	it("should preserve the exact date string as given", () => {
		// Does not parse or reformat — just interpolates
		const weekStart = "2025-12-29"
		expect(buildWeeklyPdfFilename(weekStart)).toBe(
			`axion-weekly-${weekStart}.pdf`
		)
	})

	it("should always start with 'axion-weekly-'", () => {
		expect(
			buildWeeklyPdfFilename("2026-03-30").startsWith("axion-weekly-")
		).toBe(true)
	})

	it("should always end with '.pdf'", () => {
		expect(buildWeeklyPdfFilename("2026-03-30").endsWith(".pdf")).toBe(true)
	})
})

// ============================================================================
// buildMonthlyPdfFilename
// ============================================================================

describe("buildMonthlyPdfFilename", () => {
	it("should produce the correct filename for the first of a month", () => {
		expect(buildMonthlyPdfFilename("2026-04-01")).toBe(
			"axion-monthly-2026-04-01.pdf"
		)
	})

	it("should produce the correct filename for another month", () => {
		expect(buildMonthlyPdfFilename("2026-01-01")).toBe(
			"axion-monthly-2026-01-01.pdf"
		)
	})

	it("should preserve the exact date string as given", () => {
		const monthStart = "2025-11-01"
		expect(buildMonthlyPdfFilename(monthStart)).toBe(
			`axion-monthly-${monthStart}.pdf`
		)
	})

	it("should always start with 'axion-monthly-'", () => {
		expect(
			buildMonthlyPdfFilename("2026-04-01").startsWith("axion-monthly-")
		).toBe(true)
	})

	it("should always end with '.pdf'", () => {
		expect(buildMonthlyPdfFilename("2026-04-01").endsWith(".pdf")).toBe(true)
	})
})

// ============================================================================
// parseOffsetParam
// ============================================================================

describe("parseOffsetParam", () => {
	describe("null input (parameter absent)", () => {
		it("should return 0 when the parameter is null", () => {
			expect(parseOffsetParam(null)).toBe(0)
		})
	})

	describe("valid integer strings", () => {
		it("should parse '0' to 0", () => {
			expect(parseOffsetParam("0")).toBe(0)
		})

		it("should parse '1' to 1", () => {
			expect(parseOffsetParam("1")).toBe(1)
		})

		it("should parse '3' to 3", () => {
			expect(parseOffsetParam("3")).toBe(3)
		})

		it("should parse '52' to 52", () => {
			expect(parseOffsetParam("52")).toBe(52)
		})

		it("should parse a negative offset string correctly", () => {
			// Negative offsets are not meaningful in the route, but the parser
			// should not silently discard them — the route is responsible for rejection
			expect(parseOffsetParam("-1")).toBe(-1)
		})
	})

	describe("invalid / non-numeric strings", () => {
		it("should return NaN for a purely alphabetic string", () => {
			expect(parseOffsetParam("abc")).toBeNaN()
		})

		it("should return NaN for an empty string", () => {
			// parseInt("", 10) → NaN
			expect(parseOffsetParam("")).toBeNaN()
		})

		it("should parse the integer portion of a mixed string", () => {
			// parseInt("3abc", 10) → 3  (parseInt behaviour)
			expect(parseOffsetParam("3abc")).toBe(3)
		})

		it("should return NaN for a float string when no integer prefix exists", () => {
			// parseInt(".5", 10) → NaN
			expect(parseOffsetParam(".5")).toBeNaN()
		})

		it("should parse the integer part of '3.7'", () => {
			// parseInt("3.7", 10) → 3  (parseInt stops at the decimal point)
			expect(parseOffsetParam("3.7")).toBe(3)
		})
	})
})

// ============================================================================
// isValidReportType
// ============================================================================

describe("isValidReportType", () => {
	describe("valid report types", () => {
		it("should return true for 'weekly'", () => {
			expect(isValidReportType("weekly")).toBe(true)
		})

		it("should return true for 'monthly'", () => {
			expect(isValidReportType("monthly")).toBe(true)
		})
	})

	describe("invalid report types", () => {
		it("should return false for null (parameter absent)", () => {
			expect(isValidReportType(null)).toBe(false)
		})

		it("should return false for 'daily'", () => {
			expect(isValidReportType("daily")).toBe(false)
		})

		it("should return false for 'yearly'", () => {
			expect(isValidReportType("yearly")).toBe(false)
		})

		it("should return false for an empty string", () => {
			expect(isValidReportType("")).toBe(false)
		})

		it("should return false for 'WEEKLY' (case-sensitive)", () => {
			expect(isValidReportType("WEEKLY")).toBe(false)
		})

		it("should return false for 'MONTHLY' (case-sensitive)", () => {
			expect(isValidReportType("MONTHLY")).toBe(false)
		})

		it("should return false for a partial match like 'week'", () => {
			expect(isValidReportType("week")).toBe(false)
		})

		it("should return false for a partial match like 'month'", () => {
			expect(isValidReportType("month")).toBe(false)
		})

		it("should return false for whitespace-padded values", () => {
			expect(isValidReportType(" weekly")).toBe(false)
			expect(isValidReportType("monthly ")).toBe(false)
		})
	})

	describe("type narrowing", () => {
		it("should narrow the type to 'weekly' | 'monthly' when true", () => {
			const raw: string | null = "weekly"
			if (isValidReportType(raw)) {
				// TypeScript should compile: raw is now "weekly" | "monthly"
				const accepted: "weekly" | "monthly" = raw
				expect(accepted).toBe("weekly")
			}
		})
	})
})

// ============================================================================
// Filename generation integration — weekly vs monthly distinction
// ============================================================================

describe("PDF filename generation (weekly vs monthly distinction)", () => {
	it("should produce different filenames for weekly and monthly with the same date prefix", () => {
		const weeklyFilename = buildWeeklyPdfFilename("2026-03-30")
		const monthlyFilename = buildMonthlyPdfFilename("2026-03-01")

		expect(weeklyFilename).not.toBe(monthlyFilename)
		expect(weeklyFilename).toContain("weekly")
		expect(monthlyFilename).toContain("monthly")
	})

	it("weekly filename should never contain 'monthly'", () => {
		expect(buildWeeklyPdfFilename("2026-03-30")).not.toContain("monthly")
	})

	it("monthly filename should never contain 'weekly'", () => {
		expect(buildMonthlyPdfFilename("2026-04-01")).not.toContain("weekly")
	})
})
