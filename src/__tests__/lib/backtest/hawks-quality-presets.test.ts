import { describe, it, expect } from "vitest"
import {
	DEFAULT_QUALITY,
	getQualityPresetBundle,
	matchQualityPreset,
	normalizeQualityGates,
} from "@/lib/backtest/presets/hawks-quality-presets"

describe("matchQualityPreset", () => {
	it("returns 'off' for undefined / empty config", () => {
		expect(matchQualityPreset(undefined)).toBe("off")
		expect(matchQualityPreset({})).toBe("off")
	})

	it("returns 'off' for legacy hawksV0 shape (only htfMaBlock: false)", () => {
		expect(matchQualityPreset({ htfMaBlock: false })).toBe("off")
	})

	it("round-trips every named bundle through getQualityPresetBundle", () => {
		for (const level of ["off", "lite", "standard", "strict"] as const) {
			const bundle = getQualityPresetBundle(level)
			expect(matchQualityPreset(bundle)).toBe(level)
		}
	})

	it("returns 'custom' when one field deviates from a bundle", () => {
		const standard = getQualityPresetBundle("standard")
		// Flip a single tunable; should no longer match standard.
		expect(
			matchQualityPreset({ ...standard, aggressionThreshold: 20000 })
		).toBe("custom")
	})

	it("returns 'custom' when only a partial deviation is set", () => {
		// User toggles srLevelBlock on top of the default 'off' state ⇒ no
		// named bundle has only that flag set + nothing else changed.
		expect(matchQualityPreset({ srLevelBlock: true })).toBe("custom")
	})

	it("normalizes missing tier thresholds against the engine defaults", () => {
		const view = normalizeQualityGates({ srLevelFavor: true })
		expect(view.tierThresholds).toEqual({ AAA: 3, AA: 2, A: 1 })
	})

	it("'strict' picks up both block rules", () => {
		const strict = getQualityPresetBundle("strict")
		expect(strict.srLevelBlock).toBe(true)
		expect(strict.keltnerOuterBlock).toBe(true)
	})

	it("'standard' carries aggression in reversed polarity", () => {
		const standard = getQualityPresetBundle("standard")
		expect(standard.aggressionMode).toBe("reversed")
		expect(standard.srLevelBlock).toBe(false)
		expect(standard.keltnerOuterBlock).toBe(false)
	})

	it("DEFAULT_QUALITY matches 'off'", () => {
		expect(matchQualityPreset(DEFAULT_QUALITY)).toBe("off")
	})
})
