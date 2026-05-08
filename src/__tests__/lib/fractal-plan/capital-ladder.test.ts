import { describe, it, expect } from "vitest"
import { resolveTier } from "@/lib/fractal-plan/capital-ladder"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

const RULES: LadderRuleR[] = [
	{ minCapitalCents: 0,        maxCapitalCents: 500_000,    oneRCents: 5_000 },
	{ minCapitalCents: 500_001,  maxCapitalCents: 1_000_000,  oneRCents: 10_000 },
	{ minCapitalCents: 1_000_001, maxCapitalCents: 2_000_000, oneRCents: 20_000 },
]

describe("resolveTier", () => {
	it("returns tier 0 + 5000 for capital at the bottom band", () => {
		expect(resolveTier(100_000, RULES)).toEqual({ tierIndex: 0, oneRCents: 5_000 })
	})

	it("returns tier 1 for capital exactly at the band start", () => {
		expect(resolveTier(500_001, RULES)).toEqual({ tierIndex: 1, oneRCents: 10_000 })
	})

	it("returns the highest tier for capital above the top band", () => {
		expect(resolveTier(5_000_000, RULES)).toEqual({ tierIndex: 2, oneRCents: 20_000 })
	})

	it("throws on an empty rules array", () => {
		expect(() => resolveTier(100_000, [])).toThrow("ladder rules cannot be empty")
	})

	it("throws on negative capital", () => {
		expect(() => resolveTier(-1, RULES)).toThrow("capital must be non-negative")
	})
})
