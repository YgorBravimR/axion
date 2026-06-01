import { describe, it, expect } from "vitest"
import {
	numberFixedToSweep,
	numberSweepToFixed,
	toggleNumberMode,
	boolFixedToSweep,
	boolSweepToFixed,
	toggleBoolMode,
	enumFixedToSweep,
	enumSweepToFixed,
	toggleEnumMode,
} from "@/components/optimize/leaf-controls/sweep-transitions"

// ── Number transitions ───────────────────────────────────────────────

describe("numberFixedToSweep", () => {
	it("centers default range around current value when value is in range", () => {
		const result = numberFixedToSweep(
			{ kind: "fixed", value: 30 },
			{ min: 20, max: 40, step: 5 }
		)
		expect(result.kind).toBe("sweep_range")
		expect(result.step).toBe(5)
		// Range is [20, 40] centered on 30 → still [20, 40] (clamped to defaults).
		expect(result.min).toBe(20)
		expect(result.max).toBe(40)
	})

	it("falls back to defaults when current value is outside defaults", () => {
		const result = numberFixedToSweep(
			{ kind: "fixed", value: 999 },
			{ min: 20, max: 40, step: 5 }
		)
		expect(result).toStrictEqual({
			kind: "sweep_range",
			min: 20,
			max: 40,
			step: 5,
		})
	})

	it("preserves the step value from defaults", () => {
		const result = numberFixedToSweep(
			{ kind: "fixed", value: 2 },
			{ min: 2, max: 4, step: 0.5 }
		)
		expect(result.step).toBe(0.5)
	})
})

describe("numberSweepToFixed", () => {
	it("collapses to min — the value the user typed", () => {
		const result = numberSweepToFixed({
			kind: "sweep_range",
			min: 20,
			max: 40,
			step: 5,
		})
		expect(result).toStrictEqual({ kind: "fixed", value: 20 })
	})
})

describe("toggleNumberMode", () => {
	it("fix → sweep uses defaults rule", () => {
		const result = toggleNumberMode(
			{ kind: "fixed", value: 30 },
			{ min: 20, max: 40, step: 5 }
		)
		expect(result.kind).toBe("sweep_range")
	})

	it("sweep → fix collapses to min", () => {
		const result = toggleNumberMode(
			{ kind: "sweep_range", min: 25, max: 35, step: 5 },
			{ min: 20, max: 40, step: 5 }
		)
		expect(result).toStrictEqual({ kind: "fixed", value: 25 })
	})

	it("is involutive when toggled twice from a fix in default range", () => {
		const initial = { kind: "fixed" as const, value: 20 }
		const defaults = { min: 20, max: 40, step: 5 }
		const once = toggleNumberMode(initial, defaults)
		const twice = toggleNumberMode(once, defaults)
		// Toggle x2 should land on the same fix value (round-trip safe).
		expect(twice).toStrictEqual(initial)
	})
})

// ── Bool transitions ─────────────────────────────────────────────────

describe("boolFixedToSweep", () => {
	it("always produces the full {true, false} set", () => {
		const result = boolFixedToSweep()
		expect(result).toStrictEqual({
			kind: "sweep_set",
			values: [true, false],
		})
	})
})

describe("boolSweepToFixed", () => {
	it("collapses to the first value in the set", () => {
		expect(
			boolSweepToFixed({ kind: "sweep_set", values: [true, false] })
		).toStrictEqual({ kind: "fixed", value: true })
		expect(
			boolSweepToFixed({ kind: "sweep_set", values: [false, true] })
		).toStrictEqual({ kind: "fixed", value: false })
	})

	it("falls back to false when set is empty (defensive)", () => {
		expect(boolSweepToFixed({ kind: "sweep_set", values: [] })).toStrictEqual({
			kind: "fixed",
			value: false,
		})
	})
})

describe("toggleBoolMode", () => {
	it("fix → sweep → fix round-trip preserves the first sweep value", () => {
		const initial = { kind: "fixed" as const, value: true }
		const once = toggleBoolMode(initial)
		expect(once).toStrictEqual({
			kind: "sweep_set",
			values: [true, false],
		})
		const twice = toggleBoolMode(once)
		expect(twice).toStrictEqual({ kind: "fixed", value: true })
	})
})

// ── Enum transitions ────────────────────────────────────────────────

describe("enumFixedToSweep", () => {
	it("seeds sweep set with the current fix value", () => {
		expect(enumFixedToSweep({ kind: "fixed", value: "strict" })).toStrictEqual({
			kind: "sweep_set",
			values: ["strict"],
		})
	})
})

describe("enumSweepToFixed", () => {
	it("collapses to the first value in the set", () => {
		expect(
			enumSweepToFixed({ kind: "sweep_set", values: ["off", "strict"] }, "off")
		).toStrictEqual({ kind: "fixed", value: "off" })
	})

	it("falls back to fallbackValue when set is empty (defensive)", () => {
		expect(
			enumSweepToFixed({ kind: "sweep_set", values: [] }, "off")
		).toStrictEqual({ kind: "fixed", value: "off" })
	})
})

describe("toggleEnumMode", () => {
	it("fix → sweep → fix round-trip preserves the original value", () => {
		const initial = { kind: "fixed" as const, value: "strict" }
		const once = toggleEnumMode(initial, "off")
		expect(once).toStrictEqual({ kind: "sweep_set", values: ["strict"] })
		const twice = toggleEnumMode(once, "off")
		expect(twice).toStrictEqual({ kind: "fixed", value: "strict" })
	})
})
