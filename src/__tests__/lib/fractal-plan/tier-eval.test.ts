import { describe, it, expect } from "vitest"
import { evaluateMonthStart, evaluateDrawdownTrigger } from "@/lib/fractal-plan/tier-eval"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

const RULES: LadderRuleR[] = [
	{ minCapitalCents: 0,        maxCapitalCents: 500_000,    oneRCents: 5_000 },
	{ minCapitalCents: 500_001,  maxCapitalCents: 1_000_000,  oneRCents: 10_000 },
	{ minCapitalCents: 1_000_001, maxCapitalCents: 2_000_000, oneRCents: 20_000 },
]

describe("evaluateMonthStart", () => {
	it("returns a snapshot at month start regardless of prior tier", () => {
		const snap = evaluateMonthStart({
			capitalCents: 600_000,
			ladderRules: RULES,
			now: new Date("2026-05-01T03:00:00Z"),
		})
		expect(snap.snapshotTierIndex).toBe(1)
		expect(snap.snapshotOneRCents).toBe(10_000)
		expect(snap.snapshotReason).toBe("month_start")
	})
})

describe("evaluateDrawdownTrigger", () => {
	it("fires when capital drops below tier floor by thresholdR×oneR", () => {
		const result = evaluateDrawdownTrigger({
			currentCapitalCents: 480_000,  // dropped from tier-1 (500k floor) into tier-0
			currentTierIndex: 1,
			currentOneRCents: 10_000,
			ladderRules: RULES,
			thresholdR: 2.0, // need drop ≥ 20_000 below floor: 500_001 - 480_000 = 20_001 ✓
		})
		expect(result).not.toBeNull()
		expect(result!.snapshotTierIndex).toBe(0)
		expect(result!.snapshotOneRCents).toBe(5_000)
		expect(result!.snapshotReason).toBe("drawdown_trigger")
	})

	it("does NOT fire when drop is below threshold", () => {
		const result = evaluateDrawdownTrigger({
			currentCapitalCents: 495_000,  // 5,001 below floor — under 2R threshold (20k)
			currentTierIndex: 1,
			currentOneRCents: 10_000,
			ladderRules: RULES,
			thresholdR: 2.0,
		})
		expect(result).toBeNull()
	})

	it("does NOT fire when capital still inside current tier", () => {
		const result = evaluateDrawdownTrigger({
			currentCapitalCents: 750_000,
			currentTierIndex: 1,
			currentOneRCents: 10_000,
			ladderRules: RULES,
			thresholdR: 2.0,
		})
		expect(result).toBeNull()
	})

	it("does NOT fire when already at lowest tier (cannot deescalate further)", () => {
		const result = evaluateDrawdownTrigger({
			currentCapitalCents: 1,
			currentTierIndex: 0,
			currentOneRCents: 5_000,
			ladderRules: RULES,
			thresholdR: 2.0,
		})
		expect(result).toBeNull()
	})
})
