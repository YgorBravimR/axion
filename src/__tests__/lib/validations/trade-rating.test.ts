/**
 * Unit tests for the Trade Execution Rating feature.
 *
 * Covers three logical layers:
 *
 * 1. **Schema validation** — `createTradeSchema` and `updateTradeSchema`
 *    accept / reject rating values correctly according to the Zod enum
 *    definition in `src/lib/validations/trade.ts`.
 *
 * 2. **Grade selector logic** — The toggle behavior and color-class mapping
 *    used by the grade selector in `src/components/journal/trade-form.tsx`
 *    are pure-logic derivations that can be tested without a DOM.
 *
 * 3. **Trade detail display logic** — The badge color mapping and the
 *    null-guard that suppresses the badge when no rating is stored, both
 *    sourced from `src/app/[locale]/(app)/journal/[id]/page.tsx`.
 */

import { describe, it, expect } from "vitest"
import { createTradeSchema, updateTradeSchema } from "@/lib/validations/trade"

// ---------------------------------------------------------------------------
// Shared test helpers
// ---------------------------------------------------------------------------

/**
 * Minimal payload that satisfies all required fields of `createTradeSchema`.
 * Only `rating` is varied across rating-specific tests.
 */
const buildMinimalTradePayload = (overrides: Record<string, unknown> = {}) => ({
	asset: "WIN",
	direction: "long" as const,
	entryDate: "2026-01-06T09:00",
	entryPrice: 128000,
	positionSize: 5,
	...overrides,
})

// ---------------------------------------------------------------------------
// Pure logic extracted from trade-form.tsx (grade selector)
// ---------------------------------------------------------------------------

/** The exact grade list rendered by the form's radiogroup. */
const TRADE_RATING_GRADES = ["A", "B", "C", "D", "F"] as const
type TradeRating = (typeof TRADE_RATING_GRADES)[number]

/**
 * Mirrors the onClick handler in trade-form.tsx:
 *   setValue("rating", isSelected ? undefined : grade)
 *
 * Returns `undefined` when the same grade is clicked again (clear),
 * or the new grade when a different one is selected.
 */
const resolveGradeToggle = (
	currentRating: TradeRating | undefined | null,
	clickedGrade: TradeRating
): TradeRating | undefined => {
	const isSelected = currentRating === clickedGrade
	return isSelected ? undefined : clickedGrade
}

/** Color-class mapping from trade-form.tsx (used when a grade is selected). */
const GRADE_COLOR_CLASSES: Record<TradeRating, string> = {
	A: "border-trade-buy bg-trade-buy/10 text-trade-buy",
	B: "border-trade-buy/70 bg-trade-buy/5 text-trade-buy/70",
	C: "border-warning bg-warning/10 text-warning",
	D: "border-trade-sell/70 bg-trade-sell/5 text-trade-sell/70",
	F: "border-trade-sell bg-trade-sell/10 text-trade-sell",
}

// ---------------------------------------------------------------------------
// Pure logic extracted from journal/[id]/page.tsx (detail badge)
// ---------------------------------------------------------------------------

/**
 * Derives the Tailwind class string for the rating badge on the trade-detail
 * page, exactly mirroring the `cn(...)` expression in page.tsx.
 *
 * Returns `null` when no rating is present (badge is not rendered).
 */
const resolveRatingBadgeClass = (
	rating: string | null | undefined
): string | null => {
	if (!rating) {
		return null
	}

	if (rating === "A") {
		return "bg-trade-buy/20 text-trade-buy"
	}
	if (rating === "B") {
		return "bg-trade-buy/10 text-trade-buy/70"
	}
	if (rating === "C") {
		return "bg-warning/20 text-warning"
	}
	if (rating === "D") {
		return "bg-trade-sell/10 text-trade-sell/70"
	}
	if (rating === "F") {
		return "bg-trade-sell/20 text-trade-sell"
	}

	return null
}

// ===========================================================================
// 1. createTradeSchema — rating field validation
// ===========================================================================

describe("createTradeSchema — rating field", () => {
	describe("valid ratings", () => {
		const validGrades: TradeRating[] = ["A", "B", "C", "D", "F"]

		for (const grade of validGrades) {
			it(`should accept rating "${grade}"`, () => {
				const result = createTradeSchema.safeParse(
					buildMinimalTradePayload({ rating: grade })
				)
				expect(result.success).toBe(true)
				if (result.success) {
					expect(result.data.rating).toBe(grade)
				}
			})
		}

		it("should accept when rating is omitted (optional field)", () => {
			const result = createTradeSchema.safeParse(buildMinimalTradePayload())
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.rating).toBeUndefined()
			}
		})

		it("should accept when rating is explicitly null (nullable field)", () => {
			const result = createTradeSchema.safeParse(
				buildMinimalTradePayload({ rating: null })
			)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.rating).toBeNull()
			}
		})

		it("should accept when rating is undefined (treated as absent)", () => {
			const result = createTradeSchema.safeParse(
				buildMinimalTradePayload({ rating: undefined })
			)
			expect(result.success).toBe(true)
		})
	})

	describe("invalid ratings", () => {
		const invalidValues = ["E", "G", "1", "", "a", "AB", "f"]

		for (const value of invalidValues) {
			it(`should reject rating "${value}"`, () => {
				const result = createTradeSchema.safeParse(
					buildMinimalTradePayload({ rating: value })
				)
				expect(result.success).toBe(false)
				if (!result.success) {
					const paths = result.error.issues.map((issue) => issue.path[0])
					expect(paths).toContain("rating")
				}
			})
		}

		it("should reject a numeric rating value", () => {
			const result = createTradeSchema.safeParse(
				buildMinimalTradePayload({ rating: 1 })
			)
			expect(result.success).toBe(false)
		})

		it("should reject a boolean rating value", () => {
			const result = createTradeSchema.safeParse(
				buildMinimalTradePayload({ rating: true })
			)
			expect(result.success).toBe(false)
		})
	})

	describe("rating persistence through schema parse", () => {
		it("should return the exact rating value after parsing, not a transformed copy", () => {
			const result = createTradeSchema.safeParse(
				buildMinimalTradePayload({ rating: "C" })
			)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.rating).toBe("C")
				// Confirm it is not coerced or transformed
				expect(typeof result.data.rating).toBe("string")
			}
		})

		it("should not affect other fields when rating is provided", () => {
			const result = createTradeSchema.safeParse(
				buildMinimalTradePayload({
					rating: "A",
					direction: "long",
					entryPrice: 5000,
				})
			)
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.rating).toBe("A")
				expect(result.data.direction).toBe("long")
				expect(result.data.entryPrice).toBe(5000)
			}
		})
	})
})

// ===========================================================================
// 2. updateTradeSchema — rating field validation
// ===========================================================================

describe("updateTradeSchema — rating field", () => {
	it("should accept a partial payload containing only a valid rating", () => {
		const result = updateTradeSchema.safeParse({ rating: "B" })
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.rating).toBe("B")
		}
	})

	it("should accept an empty object (all fields optional in update)", () => {
		const result = updateTradeSchema.safeParse({})
		expect(result.success).toBe(true)
	})

	it("should accept null rating in a partial update (clearing the field)", () => {
		const result = updateTradeSchema.safeParse({ rating: null })
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.rating).toBeNull()
		}
	})

	it("should accept all five valid grades in a partial update", () => {
		const grades: TradeRating[] = ["A", "B", "C", "D", "F"]
		for (const grade of grades) {
			const result = updateTradeSchema.safeParse({ rating: grade })
			expect(result.success).toBe(true)
			if (result.success) {
				expect(result.data.rating).toBe(grade)
			}
		}
	})

	it("should reject an invalid rating value in a partial update", () => {
		const result = updateTradeSchema.safeParse({ rating: "E" })
		expect(result.success).toBe(false)
		if (!result.success) {
			const paths = result.error.issues.map((issue) => issue.path[0])
			expect(paths).toContain("rating")
		}
	})

	it("should reject lowercase grade letters", () => {
		const result = updateTradeSchema.safeParse({ rating: "b" })
		expect(result.success).toBe(false)
	})
})

// ===========================================================================
// 3. Grade selector logic (trade-form.tsx)
// ===========================================================================

describe("grade selector — grade list", () => {
	it("should contain exactly five grades: A, B, C, D, F", () => {
		expect(TRADE_RATING_GRADES).toHaveLength(5)
		expect(TRADE_RATING_GRADES).toContain("A")
		expect(TRADE_RATING_GRADES).toContain("B")
		expect(TRADE_RATING_GRADES).toContain("C")
		expect(TRADE_RATING_GRADES).toContain("D")
		expect(TRADE_RATING_GRADES).toContain("F")
	})

	it("should not include grade E", () => {
		// E is intentionally absent — the scale is A, B, C, D, F (letter grade)
		expect(TRADE_RATING_GRADES).not.toContain("E")
	})

	it("should list grades in descending quality order: A → F", () => {
		expect(Array.from(TRADE_RATING_GRADES)).toEqual(["A", "B", "C", "D", "F"])
	})
})

describe("grade selector — toggle behavior", () => {
	it("should select the clicked grade when no grade is currently selected", () => {
		const result = resolveGradeToggle(undefined, "A")
		expect(result).toBe("A")
	})

	it("should select the clicked grade when a different grade is currently selected", () => {
		const result = resolveGradeToggle("A", "C")
		expect(result).toBe("C")
	})

	it("should clear the selection (return undefined) when the same grade is clicked again", () => {
		const result = resolveGradeToggle("B", "B")
		expect(result).toBeUndefined()
	})

	it("should clear selection when null is the current value and grade matches (treated as not selected)", () => {
		// null is coerced to null !== grade, so clicking any grade when current is null selects it
		const result = resolveGradeToggle(null, "D")
		expect(result).toBe("D")
	})

	it("should allow toggling through all five grades independently", () => {
		const grades: TradeRating[] = ["A", "B", "C", "D", "F"]
		for (const grade of grades) {
			// Selecting from no prior selection
			expect(resolveGradeToggle(undefined, grade)).toBe(grade)
			// Deselecting the same grade
			expect(resolveGradeToggle(grade, grade)).toBeUndefined()
		}
	})

	it("should switch from one grade to another without clearing", () => {
		// Simulates: user has A selected, then clicks F → should become F, not undefined
		const firstClick = resolveGradeToggle(undefined, "A")
		expect(firstClick).toBe("A")

		const secondClick = resolveGradeToggle(firstClick, "F")
		expect(secondClick).toBe("F")
	})

	it("should return undefined (not null) when deselecting, consistent with form setValue", () => {
		// The form calls setValue("rating", undefined) on deselect — not null
		const result = resolveGradeToggle("C", "C")
		expect(result).toBeUndefined()
		expect(result).not.toBeNull()
	})
})

describe("grade selector — color class mapping", () => {
	it("should map grade A to the trade-buy (green) color class", () => {
		expect(GRADE_COLOR_CLASSES["A"]).toBe(
			"border-trade-buy bg-trade-buy/10 text-trade-buy"
		)
	})

	it("should map grade B to the muted trade-buy (green/70) color class", () => {
		expect(GRADE_COLOR_CLASSES["B"]).toBe(
			"border-trade-buy/70 bg-trade-buy/5 text-trade-buy/70"
		)
	})

	it("should map grade C to the warning (amber) color class", () => {
		expect(GRADE_COLOR_CLASSES["C"]).toBe(
			"border-warning bg-warning/10 text-warning"
		)
	})

	it("should map grade D to the muted trade-sell (red/70) color class", () => {
		expect(GRADE_COLOR_CLASSES["D"]).toBe(
			"border-trade-sell/70 bg-trade-sell/5 text-trade-sell/70"
		)
	})

	it("should map grade F to the trade-sell (red) color class", () => {
		expect(GRADE_COLOR_CLASSES["F"]).toBe(
			"border-trade-sell bg-trade-sell/10 text-trade-sell"
		)
	})

	it("should have a color entry for every grade in the grade list", () => {
		for (const grade of TRADE_RATING_GRADES) {
			expect(GRADE_COLOR_CLASSES[grade]).toBeDefined()
			expect(typeof GRADE_COLOR_CLASSES[grade]).toBe("string")
			expect(GRADE_COLOR_CLASSES[grade].length).toBeGreaterThan(0)
		}
	})

	it("should use distinct color classes for each grade (no two grades share the same class)", () => {
		const classes = Object.values(GRADE_COLOR_CLASSES)
		const uniqueClasses = new Set(classes)
		expect(uniqueClasses.size).toBe(classes.length)
	})
})

// ===========================================================================
// 4. Trade detail display logic (journal/[id]/page.tsx)
// ===========================================================================

describe("trade detail — rating badge color mapping", () => {
	it("should return the trade-buy class for grade A", () => {
		expect(resolveRatingBadgeClass("A")).toBe("bg-trade-buy/20 text-trade-buy")
	})

	it("should return the muted trade-buy class for grade B", () => {
		expect(resolveRatingBadgeClass("B")).toBe(
			"bg-trade-buy/10 text-trade-buy/70"
		)
	})

	it("should return the warning class for grade C", () => {
		expect(resolveRatingBadgeClass("C")).toBe("bg-warning/20 text-warning")
	})

	it("should return the muted trade-sell class for grade D", () => {
		expect(resolveRatingBadgeClass("D")).toBe(
			"bg-trade-sell/10 text-trade-sell/70"
		)
	})

	it("should return the trade-sell class for grade F", () => {
		expect(resolveRatingBadgeClass("F")).toBe(
			"bg-trade-sell/20 text-trade-sell"
		)
	})

	it("should assign a distinct class to every grade (no two grades produce the same badge class)", () => {
		const grades: TradeRating[] = ["A", "B", "C", "D", "F"]
		const classes = grades.map((grade) => resolveRatingBadgeClass(grade))
		const uniqueClasses = new Set(classes)
		expect(uniqueClasses.size).toBe(grades.length)
	})
})

describe("trade detail — rating badge null-guard", () => {
	it("should return null when rating is null (badge is not rendered)", () => {
		expect(resolveRatingBadgeClass(null)).toBeNull()
	})

	it("should return null when rating is undefined (badge is not rendered)", () => {
		expect(resolveRatingBadgeClass(undefined)).toBeNull()
	})

	it("should return null when rating is an empty string (badge is not rendered)", () => {
		// An empty string is falsy — guard treats it as absent
		expect(resolveRatingBadgeClass("")).toBeNull()
	})

	it("should return a non-null string for every valid grade (badge is rendered)", () => {
		const grades: TradeRating[] = ["A", "B", "C", "D", "F"]
		for (const grade of grades) {
			const badgeClass = resolveRatingBadgeClass(grade)
			expect(badgeClass).not.toBeNull()
			expect(typeof badgeClass).toBe("string")
		}
	})

	it("should return null for an unrecognized grade value (no badge for unknown grades)", () => {
		// Defensive: unknown grades from a future schema change should not render
		expect(resolveRatingBadgeClass("E")).toBeNull()
		expect(resolveRatingBadgeClass("Z")).toBeNull()
		expect(resolveRatingBadgeClass("1")).toBeNull()
	})
})
