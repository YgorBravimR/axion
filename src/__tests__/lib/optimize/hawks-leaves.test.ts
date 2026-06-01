import { describe, it, expect } from "vitest"
import {
	HAWKS_LEAVES,
	HAWKS_VALIDATORS,
	BUNDLE_PATH,
	BUNDLE_OWNED_PATHS,
} from "@/lib/backtest/presets/hawks-leaves"
import { generateConditionalGrid } from "@/lib/optimize/grid-conditional"
import { getQualityPresetBundle } from "@/lib/backtest/presets/hawks-quality-presets"
import type { LeafSelection, PrimitiveValue } from "@/lib/optimize/sweep-leaf"

// Build a fix-mode fallback covering every leaf in the catalog. Needed
// because the generator falls back to fix mode when a leaf has no
// selection, and the recipe baseline values aren't loaded here.
const buildDefaultFallback = (): Map<string, PrimitiveValue> => {
	const fallback = new Map<string, PrimitiveValue>()
	for (const leaf of HAWKS_LEAVES) {
		if (leaf.kind === "bool") {
			fallback.set(leaf.path, false)
		} else if (leaf.kind === "number") {
			fallback.set(leaf.path, leaf.defaultMin)
		} else if (leaf.kind === "enum") {
			fallback.set(leaf.path, leaf.options[0]?.value ?? "")
		} else if (leaf.kind === "time") {
			fallback.set(leaf.path, 910)
		}
	}
	return fallback
}

describe("HAWKS_LEAVES catalog — Phase A smoke tests", () => {
	it("is in topological order: every condition.parentPath appears earlier", () => {
		const seenPaths = new Set<string>()
		for (const leaf of HAWKS_LEAVES) {
			if (leaf.condition) {
				expect(
					seenPaths.has(leaf.condition.parentPath),
					`leaf "${leaf.path}" depends on "${leaf.condition.parentPath}" but parent not seen yet`
				).toBe(true)
			}
			if (leaf.managedBy) {
				expect(
					seenPaths.has(leaf.managedBy),
					`leaf "${leaf.path}" is managed by "${leaf.managedBy}" but owner not seen yet`
				).toBe(true)
			}
			seenPaths.add(leaf.path)
		}
	})

	it("every BUNDLE_OWNED_PATHS entry is a leaf with managedBy = BUNDLE_PATH", () => {
		for (const ownedPath of BUNDLE_OWNED_PATHS) {
			const leaf = HAWKS_LEAVES.find((l) => l.path === ownedPath)
			expect(leaf, `expected leaf at "${ownedPath}"`).toBeDefined()
			expect(leaf?.managedBy).toBe(BUNDLE_PATH)
		}
	})

	it("bundle = strict locks owned leaves to the strict preset's values", () => {
		const fallback = buildDefaultFallback()

		const selections = new Map<string, LeafSelection>([
			[BUNDLE_PATH, { kind: "fixed", value: "strict" }],
		])

		const combos = generateConditionalGrid(HAWKS_LEAVES, selections, fallback)
		expect(combos).toHaveLength(1)

		const combo = combos[0]!
		const strictBundle = getQualityPresetBundle("strict")

		// Spot-check a handful of locked values match the strict bundle.
		expect(combo["entry.config.qualityGates.srLevelBlock"]).toBe(
			strictBundle.srLevelBlock
		)
		expect(combo["entry.config.qualityGates.srBlockBufferBricks"]).toBe(
			strictBundle.srBlockBufferBricks
		)
		expect(combo["entry.config.qualityGates.aggressionMode"]).toBe(
			strictBundle.aggressionMode
		)
		expect(combo["entry.config.qualityGates.tierThresholds.AAA"]).toBe(
			strictBundle.tierThresholds?.AAA
		)
	})

	it("bundle swept over {off, custom} with srBlockBufferBricks user sweep — off is locked, custom expands", () => {
		const fallback = buildDefaultFallback()

		const selections = new Map<string, LeafSelection>([
			[BUNDLE_PATH, { kind: "sweep_set", values: ["off", "custom"] }],
			[
				"entry.config.qualityGates.srBlockBufferBricks",
				{ kind: "sweep_range", min: 1, max: 3, step: 1 },
			],
		])

		const combos = generateConditionalGrid(HAWKS_LEAVES, selections, fallback)

		const offCombos = combos.filter(
			(c) => c["entry.config.qualityGates.__bundle__"] === "off"
		)
		// off bundle locks every owned leaf — including srBlockBuffer — so user
		// sweep over srBlockBuffer is suppressed → 1 combo for off.
		expect(offCombos).toHaveLength(1)

		const customCombos = combos.filter(
			(c) => c["entry.config.qualityGates.__bundle__"] === "custom"
		)
		// custom doesn't lock → srBlockBuffer sweep [1, 2, 3] applies → 3 combos.
		expect(customCombos).toHaveLength(3)
		expect(
			new Set(
				customCombos.map(
					(c) => c["entry.config.qualityGates.srBlockBufferBricks"]
				)
			)
		).toStrictEqual(new Set([1, 2, 3]))
	})

	it("stop type swept + dependent values swept produces the conditional-ranges count", () => {
		const fallback = buildDefaultFallback()

		const selections = new Map<string, LeafSelection>([
			[
				"stop.initial.type",
				{ kind: "sweep_set", values: ["pct_range", "fixed_points"] },
			],
			["stop.initial.pct", { kind: "sweep_range", min: 20, max: 40, step: 5 }],
			[
				"stop.initial.points",
				{ kind: "sweep_range", min: 100, max: 300, step: 50 },
			],
		])

		const combos = generateConditionalGrid(HAWKS_LEAVES, selections, fallback)

		const pctRangeCombos = combos.filter(
			(c) => c["stop.initial.type"] === "pct_range"
		)
		const fixedPointsCombos = combos.filter(
			(c) => c["stop.initial.type"] === "fixed_points"
		)

		// pct sweeps [20, 25, 30, 35, 40] → 5 values
		expect(pctRangeCombos).toHaveLength(5)
		// points sweeps [100, 150, 200, 250, 300] → 5 values
		expect(fixedPointsCombos).toHaveLength(5)

		// In pct_range combos, points should be ABSENT (inactive condition).
		expect(
			pctRangeCombos.every((c) => c["stop.initial.points"] === undefined)
		).toBe(true)
		// And vice versa.
		expect(
			fixedPointsCombos.every((c) => c["stop.initial.pct"] === undefined)
		).toBe(true)
	})
})

describe("HAWKS_VALIDATORS catalog", () => {
	const findValidator = (reasonKey: string) => {
		const v = HAWKS_VALIDATORS.find((x) => x.reasonKey === reasonKey)
		if (!v) {
			throw new Error(`validator ${reasonKey} not found`)
		}
		return v
	}

	describe("tierMonotonic", () => {
		const v = findValidator("tierMonotonic")
		const make = (aaa: number, aa: number, a: number) => ({
			"entry.config.qualityGates.tierThresholds.AAA": aaa,
			"entry.config.qualityGates.tierThresholds.AA": aa,
			"entry.config.qualityGates.tierThresholds.A": a,
		})

		it("accepts strict descending", () => {
			expect(v.validate(make(6, 5, 4))).toBe(true)
		})
		it("rejects equal AAA == AA", () => {
			expect(v.validate(make(5, 5, 4))).toBe(false)
		})
		it("rejects inverted AA > AAA", () => {
			expect(v.validate(make(3, 5, 4))).toBe(false)
		})
		it("rejects equal AA == A", () => {
			expect(v.validate(make(6, 4, 4))).toBe(false)
		})
	})

	describe("sessionWindow", () => {
		const v = findValidator("sessionWindow")
		it("accepts 09:10 < 12:00", () => {
			expect(
				v.validate({
					"entry.config.startTime": 910,
					"entry.config.endTime": 1200,
				})
			).toBe(true)
		})
		it("rejects equal start == end", () => {
			expect(
				v.validate({
					"entry.config.startTime": 910,
					"entry.config.endTime": 910,
				})
			).toBe(false)
		})
		it("rejects start > end", () => {
			expect(
				v.validate({
					"entry.config.startTime": 1500,
					"entry.config.endTime": 910,
				})
			).toBe(false)
		})
	})

	describe("wave1OverRetracement", () => {
		const v = findValidator("wave1OverRetracement")
		it("accepts wave1 > retracement", () => {
			expect(
				v.validate({
					"entry.config.wave1MinBricks": 4,
					"entry.config.retracementMinBricks": 2,
				})
			).toBe(true)
		})
		it("rejects retracement >= wave1", () => {
			expect(
				v.validate({
					"entry.config.wave1MinBricks": 3,
					"entry.config.retracementMinBricks": 3,
				})
			).toBe(false)
			expect(
				v.validate({
					"entry.config.wave1MinBricks": 2,
					"entry.config.retracementMinBricks": 5,
				})
			).toBe(false)
		})
	})

	describe("breakevenBeforeFirstTarget", () => {
		const v = findValidator("breakevenBeforeFirstTarget")
		it("inactive when BE disabled — passes vacuously", () => {
			expect(
				v.validate({
					"stop.breakeven.enabled": false,
					"stop.breakeven.type": "on_pct_risk",
					"stop.breakeven.triggerPct": 999,
					"target.levels.0.mode": "r_multiple",
					"target.levels.0.value": 1,
				})
			).toBe(true)
		})
		it("inactive when target mode isn't r_multiple — passes vacuously", () => {
			expect(
				v.validate({
					"stop.breakeven.enabled": true,
					"stop.breakeven.type": "on_pct_risk",
					"stop.breakeven.triggerPct": 999,
					"target.levels.0.mode": "fixed_points",
					"target.levels.0.value": 1,
				})
			).toBe(true)
		})
		it("accepts BE trigger 100% (=1R) below target 2R", () => {
			expect(
				v.validate({
					"stop.breakeven.enabled": true,
					"stop.breakeven.type": "on_pct_risk",
					"stop.breakeven.triggerPct": 100,
					"target.levels.0.mode": "r_multiple",
					"target.levels.0.value": 2,
				})
			).toBe(true)
		})
		it("rejects BE trigger 250% above target 2R", () => {
			expect(
				v.validate({
					"stop.breakeven.enabled": true,
					"stop.breakeven.type": "on_pct_risk",
					"stop.breakeven.triggerPct": 250,
					"target.levels.0.mode": "r_multiple",
					"target.levels.0.value": 2,
				})
			).toBe(false)
		})
	})
})
