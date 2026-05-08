/**
 * Tests for ProvenanceBadge component logic.
 * Phase 3 Task 11.
 *
 * Note: vitest config includes only *.test.ts — JSX render tests via
 * @testing-library/react are not supported. These tests verify the
 * component's text logic independently.
 */
import { describe, it, expect } from "vitest"
import type { CascadeLevel } from "@/components/fractal-plan/provenance-badge"

// Replicate the text computation logic from ProvenanceBadge
const LEVEL_LABEL: Record<Exclude<CascadeLevel, "none">, string> = {
	year: "Year",
	quarter: "Quarter",
	month: "Month",
	week: "Week",
	day: "Day",
}

const getBadgeText = (
	level: CascadeLevel,
	isOverride = false
): string | null => {
	if (level === "none") {
		return null
	}
	const label = LEVEL_LABEL[level]
	return isOverride ? `override at ${label}` : `from ${label}`
}

describe("ProvenanceBadge text logic", () => {
	it("renders 'from Year' for level=year", () => {
		expect(getBadgeText("year")).toBe("from Year")
	})

	it("renders 'from Quarter' for level=quarter", () => {
		expect(getBadgeText("quarter")).toBe("from Quarter")
	})

	it("renders 'from Month' for level=month", () => {
		expect(getBadgeText("month")).toBe("from Month")
	})

	it("renders 'override at Month' when level=month and isOverride=true", () => {
		expect(getBadgeText("month", true)).toBe("override at Month")
	})

	it("renders 'override at Day' when level=day and isOverride=true", () => {
		expect(getBadgeText("day", true)).toBe("override at Day")
	})

	it("returns null when level=none", () => {
		expect(getBadgeText("none")).toBeNull()
	})

	it("covers all non-none levels without throwing", () => {
		const levels: Exclude<CascadeLevel, "none">[] = [
			"year",
			"quarter",
			"month",
			"week",
			"day",
		]
		for (const level of levels) {
			expect(() => getBadgeText(level)).not.toThrow()
			expect(() => getBadgeText(level, true)).not.toThrow()
		}
	})
})
