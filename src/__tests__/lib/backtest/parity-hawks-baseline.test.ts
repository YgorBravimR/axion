import { describe, it, expect } from "vitest"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import { deriveInitialSelections } from "@/lib/optimize/recipe-to-selections"
import { HAWKS_LEAVES } from "@/lib/backtest/presets/hawks-leaves"
import type { LeafSelection, PrimitiveValue } from "@/lib/optimize/sweep-leaf"

/**
 * Regression test for Hawks v0 baseline parity bug (2026-06-08).
 *
 * The /backtest and /optimize paths diverged because:
 * 1. The /backtest path started from `hawksV0` preset which lacked
 *    `fireCooldownBricks`, `wave1MinBricks`, `retracementMinBricks`.
 * 2. The /optimize path used `deriveInitialSelections` which fell back to
 *    the leaves' defaultMin (1, 3, 1) when those fields weren't in the recipe.
 * 3. This caused a 177-trade divergence (325 vs 502).
 *
 * The fix: add these three fields to the hawksV0 preset with values matching
 * the engine's hardcoded defaults (5, 4, 2).
 *
 * This test verifies that:
 * 1. The hawksV0 preset includes all three config fields.
 * 2. The values match the engine defaults.
 * 3. Both code paths (direct recipe + sweep-derived baseline) produce
 *    identical leaf selections, ensuring parity on the baseline run.
 */
interface HawksConfig {
	fireCooldownBricks?: number
	wave1MinBricks?: number
	retracementMinBricks?: number
}

describe("Hawks v0 baseline parity", () => {
	it("should have fireCooldownBricks set to engine default (5)", () => {
		const config = hawksV0.entry.config as HawksConfig
		expect(config.fireCooldownBricks).toBe(5)
	})

	it("should have wave1MinBricks set to engine default (4)", () => {
		const config = hawksV0.entry.config as HawksConfig
		expect(config.wave1MinBricks).toBe(4)
	})

	it("should have retracementMinBricks set to engine default (2)", () => {
		const config = hawksV0.entry.config as HawksConfig
		expect(config.retracementMinBricks).toBe(2)
	})

	it("sweep-derived baseline should match hawksV0 preset values", () => {
		// When the optimize page loads, it calls deriveInitialSelections to map
		// the recipe baseline into leaf selections. This should read the three
		// config fields from the recipe, not fall back to leaf defaults.
		const selections = deriveInitialSelections(HAWKS_LEAVES, hawksV0)

		// Extract the three fields from selections
		const fireCooldown = selections.get("entry.config.fireCooldownBricks")
		const wave1Min = selections.get("entry.config.wave1MinBricks")
		const retracementMin = selections.get("entry.config.retracementMinBricks")

		// All should exist (not fall back to leaf defaults)
		expect(fireCooldown).toBeDefined()
		expect(wave1Min).toBeDefined()
		expect(retracementMin).toBeDefined()

		// Verify they match the preset
		expect(fireCooldown?.kind).toBe("fixed")
		const fc = fireCooldown as LeafSelection
		expect((fc as unknown as { value: PrimitiveValue }).value).toBe(5)

		expect(wave1Min?.kind).toBe("fixed")
		const w1 = wave1Min as LeafSelection
		expect((w1 as unknown as { value: PrimitiveValue }).value).toBe(4)

		expect(retracementMin?.kind).toBe("fixed")
		const rm = retracementMin as LeafSelection
		expect((rm as unknown as { value: PrimitiveValue }).value).toBe(2)
	})

	it("should not fall back to sweep leaf defaults", () => {
		// The HAWKS_LEAVES have defaultMin values:
		// - fireCooldownBricks: defaultMin 1
		// - wave1MinBricks: defaultMin 3
		// - retracementMinBricks: defaultMin 1
		//
		// With the fix, deriveInitialSelections should read from the preset,
		// NOT from these defaults.
		const selections = deriveInitialSelections(HAWKS_LEAVES, hawksV0)

		const fireCooldown = selections.get("entry.config.fireCooldownBricks")
		const wave1Min = selections.get("entry.config.wave1MinBricks")
		const retracementMin = selections.get("entry.config.retracementMinBricks")

		const fcVal = (fireCooldown as unknown as { value: PrimitiveValue }).value
		const w1Val = (wave1Min as unknown as { value: PrimitiveValue }).value
		const rmVal = (retracementMin as unknown as { value: PrimitiveValue }).value

		// Verify they do NOT match the leaf defaults
		expect(fcVal).not.toBe(1) // leaf default
		expect(w1Val).not.toBe(3) // leaf default
		expect(rmVal).not.toBe(1) // leaf default

		// And verify they match the engine defaults (and preset)
		expect(fcVal).toBe(5)
		expect(w1Val).toBe(4)
		expect(rmVal).toBe(2)
	})
})
