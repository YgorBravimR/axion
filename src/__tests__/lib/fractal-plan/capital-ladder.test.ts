import { describe, it, expect } from "vitest"
import {
	resolveTier,
	computeLadderRunway,
} from "@/lib/fractal-plan/capital-ladder"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

const RULES: LadderRuleR[] = [
	{ minCapitalCents: 0, maxCapitalCents: 500_000, oneRCents: 5_000 },
	{ minCapitalCents: 500_001, maxCapitalCents: 1_000_000, oneRCents: 10_000 },
	{ minCapitalCents: 1_000_001, maxCapitalCents: 2_000_000, oneRCents: 20_000 },
]

describe("resolveTier", () => {
	it("returns tier 0 + 5000 for capital at the bottom band", () => {
		expect(resolveTier(100_000, RULES)).toEqual({
			tierIndex: 0,
			oneRCents: 5_000,
		})
	})

	it("returns tier 1 for capital exactly at the band start", () => {
		expect(resolveTier(500_001, RULES)).toEqual({
			tierIndex: 1,
			oneRCents: 10_000,
		})
	})

	it("returns the highest tier for capital above the top band", () => {
		expect(resolveTier(5_000_000, RULES)).toEqual({
			tierIndex: 2,
			oneRCents: 20_000,
		})
	})

	it("throws on an empty rules array", () => {
		expect(() => resolveTier(100_000, [])).toThrow(
			"ladder rules cannot be empty"
		)
	})

	it("throws on negative capital", () => {
		expect(() => resolveTier(-1, RULES)).toThrow("capital must be non-negative")
	})
})

describe("computeLadderRunway", () => {
	// Matches the user's setup-2026 ladder in the UI screenshot.
	const SCREENSHOT_RULES: LadderRuleR[] = [
		{ minCapitalCents: 300_000, maxCapitalCents: 749_999, oneRCents: 10_000 },
		{ minCapitalCents: 750_000, maxCapitalCents: 1_499_999, oneRCents: 20_000 },
		{
			minCapitalCents: 1_500_000,
			maxCapitalCents: 2_999_999,
			oneRCents: 30_000,
		},
		{
			minCapitalCents: 3_000_000,
			maxCapitalCents: 9_999_999,
			oneRCents: 50_000,
		},
		{
			minCapitalCents: 10_000_000,
			maxCapitalCents: 999_999_999,
			oneRCents: 100_000,
		},
	]

	it("returns one runway step per rule, in order", () => {
		const runway = computeLadderRunway(SCREENSHOT_RULES, 2)
		expect(runway).toHaveLength(5)
		expect(runway.map((s) => s.tierIndex)).toEqual([0, 1, 2, 3, 4])
	})

	it("T1 (bottom tier) consumes floor capital at 1R with no downgrade buffer", () => {
		const [t1] = computeLadderRunway(SCREENSHOT_RULES, 2)
		expect(t1!.rUntilRuin).toBeCloseTo(30, 4) // R$3,000 / R$100
		expect(t1!.rToNextDowngrade).toBeCloseTo(30, 4)
	})

	it("T2 spends 2R to downgrade then walks T1 to zero", () => {
		const [, t2] = computeLadderRunway(SCREENSHOT_RULES, 2)
		// 2R to downgrade (R$400 loss at R$200/R, capital R$7,500 → R$7,100),
		// then R$7,100 / R$100 = 71R in T1 → 73R total.
		expect(t2!.rToNextDowngrade).toBeCloseTo(2, 4)
		expect(t2!.rUntilRuin).toBeCloseTo(73, 4)
	})

	it("higher tiers compound more runway because each downgrade shrinks 1R", () => {
		const runway = computeLadderRunway(SCREENSHOT_RULES, 2)
		// Monotonic: every higher tier has strictly more runway than the one below.
		for (let i = 1; i < runway.length; i++) {
			expect(runway[i]!.rUntilRuin).toBeGreaterThan(runway[i - 1]!.rUntilRuin)
		}
	})

	it("respects custom thresholdR (tighter threshold = more efficient runway)", () => {
		const tight = computeLadderRunway(SCREENSHOT_RULES, 0)
		const loose = computeLadderRunway(SCREENSHOT_RULES, 4)
		// Counter-intuitive but mechanical: with thresholdR=0 the snapshot
		// downgrades the instant capital touches a floor, so 100% of the next
		// tier's capacity is then spent at the smaller (cheaper) 1R. With
		// thresholdR=4, capital first bleeds 4R *at the larger 1R* below the
		// floor — that capital is consumed at the more expensive rate, so the
		// total R-runway is shorter. Lower threshold ⇒ more runway.
		expect(tight[2]!.rUntilRuin).toBeGreaterThan(loose[2]!.rUntilRuin)
	})

	it("returns 0 runway for a zero-floor tier (no capital to lose)", () => {
		const rules: LadderRuleR[] = [
			{ minCapitalCents: 0, maxCapitalCents: 100_000, oneRCents: 1_000 },
		]
		const [step] = computeLadderRunway(rules, 2)
		expect(step!.rUntilRuin).toBe(0)
	})
})
