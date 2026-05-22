import { describe, it, expect } from "vitest"
import { isMonthFinalized, isMonthCurrent } from "@/lib/tax/month-status"

describe("isMonthFinalized", () => {
	it("returns true for months completely in the past", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		// April 2026 is in the past relative to May 2026
		expect(isMonthFinalized(2026, 4, now)).toBe(true)
	})

	it("returns false for the current month", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		// May 2026 is the current month
		expect(isMonthFinalized(2026, 5, now)).toBe(false)
	})

	it("returns false for future months", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		// June 2026 is in the future
		expect(isMonthFinalized(2026, 6, now)).toBe(false)
	})

	it("handles year boundaries (past year)", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		// December 2025 is finalized relative to May 2026
		expect(isMonthFinalized(2025, 12, now)).toBe(true)
	})

	it("handles year boundaries (future year)", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		// January 2027 is not finalized relative to May 2026
		expect(isMonthFinalized(2027, 1, now)).toBe(false)
	})

	it("correctly indexes multiple years into month sequence", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		// 2025: 12 months, 2026: 5 months (Jan-May)
		// Dec 2025 = month index 11 (year 2025, month 12)
		// May 2026 = month index 16 (year 2026, month 5)
		expect(isMonthFinalized(2025, 12, now)).toBe(true)
		expect(isMonthFinalized(2026, 5, now)).toBe(false)
	})

	it("uses UTC for month boundaries (not wall-clock time)", () => {
		const now = new Date("2026-05-01T00:00:00Z")
		// First instant of May 2026 UTC
		expect(isMonthFinalized(2026, 5, now)).toBe(false)
	})

	it("treats month=1 as January, month=12 as December", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		// Month 1 (January) finalization
		expect(isMonthFinalized(2026, 1, now)).toBe(true) // Before current May
		// Month 12 (December) finalization
		expect(isMonthFinalized(2025, 12, now)).toBe(true) // Before current May
	})

	it("defaults to current time when now parameter omitted", () => {
		// This test verifies the default parameter works; actual past months should be finalized
		// Using a known past date
		expect(isMonthFinalized(2025, 1)).toBe(true) // Jan 2025 is definitely in the past
	})

	it("handles edge case: January of current year (all finalized before current month)", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthFinalized(2026, 1, now)).toBe(true) // January before May
		expect(isMonthFinalized(2026, 2, now)).toBe(true) // February before May
		expect(isMonthFinalized(2026, 3, now)).toBe(true) // March before May
		expect(isMonthFinalized(2026, 4, now)).toBe(true) // April before May
	})

	it("handles edge case: December of previous year (finalized)", () => {
		const now = new Date("2026-01-15T10:00:00Z")
		expect(isMonthFinalized(2025, 12, now)).toBe(true) // Dec 2025 before Jan 2026
	})

	it("handles edge case: months far in the past (many years)", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthFinalized(2020, 3, now)).toBe(true) // 6+ years in the past
	})

	it("handles edge case: months far in the future", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthFinalized(2030, 12, now)).toBe(false) // 4+ years in the future
	})
})

describe("isMonthCurrent", () => {
	it("returns true for the current month", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthCurrent(2026, 5, now)).toBe(true)
	})

	it("returns false for previous months", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthCurrent(2026, 4, now)).toBe(false)
	})

	it("returns false for future months", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthCurrent(2026, 6, now)).toBe(false)
	})

	it("handles year boundaries (previous year not current)", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthCurrent(2025, 5, now)).toBe(false)
	})

	it("handles year boundaries (future year not current)", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthCurrent(2027, 5, now)).toBe(false)
	})

	it("uses UTC month for comparison (not wall-clock)", () => {
		const now = new Date("2026-05-01T00:00:00Z")
		// First instant of May 2026 UTC is still May 2026
		expect(isMonthCurrent(2026, 5, now)).toBe(true)
	})

	it("uses UTC month boundaries correctly", () => {
		const endOfMay = new Date("2026-05-31T23:59:59Z")
		expect(isMonthCurrent(2026, 5, endOfMay)).toBe(true)
	})

	it("transitions to next month at UTC midnight", () => {
		const lastSecondOfMay = new Date("2026-05-31T23:59:59Z")
		const firstSecondOfJune = new Date("2026-06-01T00:00:00Z")

		expect(isMonthCurrent(2026, 5, lastSecondOfMay)).toBe(true)
		expect(isMonthCurrent(2026, 5, firstSecondOfJune)).toBe(false)
		expect(isMonthCurrent(2026, 6, firstSecondOfJune)).toBe(true)
	})

	it("defaults to current time when now parameter omitted", () => {
		// Using a known past month should be false
		expect(isMonthCurrent(2025, 1)).toBe(false)
	})

	it("only one month can be current at a time", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		// May 2026 is current
		expect(isMonthCurrent(2026, 5, now)).toBe(true)
		// All other months must be false
		expect(isMonthCurrent(2026, 1, now)).toBe(false)
		expect(isMonthCurrent(2026, 4, now)).toBe(false)
		expect(isMonthCurrent(2026, 6, now)).toBe(false)
		expect(isMonthCurrent(2025, 5, now)).toBe(false)
		expect(isMonthCurrent(2027, 5, now)).toBe(false)
	})

	it("handles January as month 1 (not month 0)", () => {
		const now = new Date("2026-01-15T10:00:00Z")
		expect(isMonthCurrent(2026, 1, now)).toBe(true)
		expect(isMonthCurrent(2026, 0, now)).toBe(false) // Invalid but shows index is 1-based
	})

	it("handles December as month 12 (not month 0)", () => {
		const now = new Date("2025-12-15T10:00:00Z")
		expect(isMonthCurrent(2025, 12, now)).toBe(true)
	})

	it("year-month index comparison is strictly equal", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		// Index for 2026-05: 2026 * 12 + (5-1) = 24312 + 4 = 24316
		// Index for 2026-04: 2026 * 12 + (4-1) = 24312 + 3 = 24315 (off by 1, not current)
		// Index for 2026-06: 2026 * 12 + (6-1) = 24312 + 5 = 24317 (off by 1, not current)
		expect(isMonthCurrent(2026, 5, now)).toBe(true)
		expect(isMonthCurrent(2026, 4, now)).toBe(false)
		expect(isMonthCurrent(2026, 6, now)).toBe(false)
	})
})

describe("isMonthFinalized and isMonthCurrent relationship", () => {
	it("past month is finalized, not current", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthFinalized(2026, 4, now)).toBe(true)
		expect(isMonthCurrent(2026, 4, now)).toBe(false)
	})

	it("current month is not finalized, is current", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthFinalized(2026, 5, now)).toBe(false)
		expect(isMonthCurrent(2026, 5, now)).toBe(true)
	})

	it("future month is not finalized, not current", () => {
		const now = new Date("2026-05-15T10:00:00Z")
		expect(isMonthFinalized(2026, 6, now)).toBe(false)
		expect(isMonthCurrent(2026, 6, now)).toBe(false)
	})

	it("three states are mutually exclusive and cover all possibilities", () => {
		const now = new Date("2026-05-15T10:00:00Z")

		// Past: finalized=true, current=false
		expect(
			isMonthFinalized(2026, 3, now) && !isMonthCurrent(2026, 3, now)
		).toBe(true)

		// Current: finalized=false, current=true
		expect(
			!isMonthFinalized(2026, 5, now) && isMonthCurrent(2026, 5, now)
		).toBe(true)

		// Future: finalized=false, current=false
		expect(
			!isMonthFinalized(2026, 7, now) && !isMonthCurrent(2026, 7, now)
		).toBe(true)
	})
})
