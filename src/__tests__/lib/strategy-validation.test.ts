/**
 * Regression test for bug 543aac13 — "Strategy code with special characters accepted"
 *
 * The Zod schema had `.refine()` before `.transform()`, so the regex check
 * `^[A-Z0-9]+$` ran against the raw (possibly lowercase, possibly with
 * special chars) value instead of the uppercased result.
 *
 * Fix: Reordered to `.transform(toUpperCase)` → `.refine(regex)` so the
 * regex validates the already-uppercased value.
 */

import { describe, it, expect } from "vitest"
import { createStrategySchema } from "@/lib/validations/strategy"

describe("createStrategySchema — code field validation", () => {
	const validBase = { name: "Test Strategy", isActive: true }

	it("should accept valid uppercase alphanumeric codes", () => {
		const result = createStrategySchema.safeParse({ ...validBase, code: "ABC123" })
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.code).toBe("ABC123")
		}
	})

	it("should auto-uppercase lowercase input", () => {
		const result = createStrategySchema.safeParse({ ...validBase, code: "abc" })
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.code).toBe("ABC")
		}
	})

	it("should reject codes with special characters like Ç", () => {
		const result = createStrategySchema.safeParse({ ...validBase, code: "RTÇF" })
		expect(result.success).toBe(false)
	})

	it("should reject codes with accented characters", () => {
		const result = createStrategySchema.safeParse({ ...validBase, code: "CAFÉ" })
		expect(result.success).toBe(false)
	})

	it("should reject codes with spaces", () => {
		const result = createStrategySchema.safeParse({ ...validBase, code: "AB CD" })
		expect(result.success).toBe(false)
	})

	it("should reject codes shorter than 3 characters", () => {
		const result = createStrategySchema.safeParse({ ...validBase, code: "AB" })
		expect(result.success).toBe(false)
	})

	it("should reject codes longer than 10 characters", () => {
		const result = createStrategySchema.safeParse({ ...validBase, code: "ABCDEFGHIJK" })
		expect(result.success).toBe(false)
	})

	it("should accept mixed-case input and uppercase the result", () => {
		const result = createStrategySchema.safeParse({ ...validBase, code: "tEsT1" })
		expect(result.success).toBe(true)
		if (result.success) {
			expect(result.data.code).toBe("TEST1")
		}
	})
})
