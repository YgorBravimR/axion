import { describe, it, expect } from "vitest"
import {
	remediateForReason,
	remediateAll,
	hasRemediation,
} from "@/lib/optimize/validator-remediation"
import { HAWKS_VALIDATORS } from "@/lib/backtest/presets/hawks-leaves"
import { ORB_VALIDATORS } from "@/lib/backtest/presets/orb-leaves"
import type { LeafSelection } from "@/lib/optimize/sweep-leaf"

const sel = (entries: [string, LeafSelection][]): Map<string, LeafSelection> =>
	new Map(entries)

const QG = "entry.config.qualityGates."

describe("hasRemediation", () => {
	it("returns true for every Hawks validator reasonKey", () => {
		for (const v of HAWKS_VALIDATORS) {
			expect(hasRemediation(v.reasonKey)).toBe(true)
		}
	})

	it("returns true for every ORB validator reasonKey", () => {
		for (const v of ORB_VALIDATORS) {
			expect(hasRemediation(v.reasonKey)).toBe(true)
		}
	})

	it("returns false for unknown reasons", () => {
		expect(hasRemediation("madeUpReason")).toBe(false)
	})
})

describe("remediateForReason — tierMonotonic", () => {
	it("collapses AAA, AA, A to a strictly descending triple", () => {
		const initial = sel([
			[
				`${QG}tierThresholds.AAA`,
				{ kind: "sweep_range", min: 1, max: 7, step: 1 },
			],
			[
				`${QG}tierThresholds.AA`,
				{ kind: "sweep_range", min: 1, max: 7, step: 1 },
			],
			[`${QG}tierThresholds.A`, { kind: "fixed", value: 6 }],
		])
		const fixed = remediateForReason("tierMonotonic", initial)
		expect(fixed).not.toBeNull()
		expect(fixed!.get(`${QG}tierThresholds.AAA`)).toEqual({
			kind: "fixed",
			value: 5,
		})
		expect(fixed!.get(`${QG}tierThresholds.AA`)).toEqual({
			kind: "fixed",
			value: 3,
		})
		expect(fixed!.get(`${QG}tierThresholds.A`)).toEqual({
			kind: "fixed",
			value: 1,
		})
	})

	it("does not mutate the input map", () => {
		const initial = sel([
			[`${QG}tierThresholds.AAA`, { kind: "fixed", value: 9 }],
		])
		remediateForReason("tierMonotonic", initial)
		expect(initial.get(`${QG}tierThresholds.AAA`)).toEqual({
			kind: "fixed",
			value: 9,
		})
	})
})

describe("remediateForReason — sessionWindow", () => {
	it("collapses start/end to 09:00 — 17:30 HHMM", () => {
		const initial = sel([
			["entry.config.startTime", { kind: "fixed", value: 1800 }],
			["entry.config.endTime", { kind: "fixed", value: 900 }],
		])
		const fixed = remediateForReason("sessionWindow", initial)!
		expect(fixed.get("entry.config.startTime")).toEqual({
			kind: "fixed",
			value: 900,
		})
		expect(fixed.get("entry.config.endTime")).toEqual({
			kind: "fixed",
			value: 1730,
		})
	})
})

describe("remediateForReason — wave1OverRetracement", () => {
	it("collapses wave1/retracement to 5/2", () => {
		const initial = sel([
			["entry.config.wave1MinBricks", { kind: "fixed", value: 1 }],
			["entry.config.retracementMinBricks", { kind: "fixed", value: 5 }],
		])
		const fixed = remediateForReason("wave1OverRetracement", initial)!
		expect(fixed.get("entry.config.wave1MinBricks")).toEqual({
			kind: "fixed",
			value: 5,
		})
		expect(fixed.get("entry.config.retracementMinBricks")).toEqual({
			kind: "fixed",
			value: 2,
		})
	})
})

describe("remediateForReason — breakevenBeforeFirstTarget", () => {
	it("collapses BE trigger and TP1 to a valid pair", () => {
		const initial = sel([
			["stop.breakeven.triggerPct", { kind: "fixed", value: 400 }],
			["target.levels.0.value", { kind: "fixed", value: 1 }],
		])
		const fixed = remediateForReason("breakevenBeforeFirstTarget", initial)!
		expect(fixed.get("stop.breakeven.triggerPct")).toEqual({
			kind: "fixed",
			value: 100,
		})
		expect(fixed.get("target.levels.0.value")).toEqual({
			kind: "fixed",
			value: 3,
		})
	})
})

describe("remediateForReason — target2OverTarget1", () => {
	it("collapses TP1/TP2 to 2/4", () => {
		const initial = sel([
			["target.levels.0.value", { kind: "fixed", value: 5 }],
			["target.levels.1.value", { kind: "fixed", value: 2 }],
		])
		const fixed = remediateForReason("target2OverTarget1", initial)!
		expect(fixed.get("target.levels.0.value")).toEqual({
			kind: "fixed",
			value: 2,
		})
		expect(fixed.get("target.levels.1.value")).toEqual({
			kind: "fixed",
			value: 4,
		})
	})
})

describe("remediateForReason — unknown reason", () => {
	it("returns null", () => {
		expect(remediateForReason("madeUpReason", sel([]))).toBeNull()
	})
})

describe("remediateAll", () => {
	it("applies every reason's remediation sequentially", () => {
		const initial = sel([
			[`${QG}tierThresholds.AAA`, { kind: "fixed", value: 1 }],
			["entry.config.wave1MinBricks", { kind: "fixed", value: 0 }],
		])
		const fixed = remediateAll(
			["tierMonotonic", "wave1OverRetracement"],
			initial
		)
		expect(fixed.get(`${QG}tierThresholds.AAA`)).toEqual({
			kind: "fixed",
			value: 5,
		})
		expect(fixed.get("entry.config.wave1MinBricks")).toEqual({
			kind: "fixed",
			value: 5,
		})
	})

	it("ignores unknown reasons", () => {
		const initial = sel([
			["entry.config.wave1MinBricks", { kind: "fixed", value: 1 }],
		])
		const fixed = remediateAll(
			["madeUpReason", "wave1OverRetracement"],
			initial
		)
		expect(fixed.get("entry.config.wave1MinBricks")).toEqual({
			kind: "fixed",
			value: 5,
		})
	})
})
