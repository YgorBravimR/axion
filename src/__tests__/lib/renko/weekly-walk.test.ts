import { describe, it, expect } from "vitest"

import {
	generateRenkoBricksWeekly,
	isoWeekMondayKey,
} from "@/lib/renko/weekly-walk"
import type { RawBar } from "@/lib/renko/brick-generator"

const mkBar = (utcDate: Date, close: number, open?: number): RawBar => ({
	timestamp: utcDate,
	open: open ?? close,
	high: close,
	low: close,
	close,
})

describe("isoWeekMondayKey", () => {
	it("returns Monday for a midweek Wednesday", () => {
		// 2026-01-07 is a Wednesday → Monday is 2026-01-05
		expect(isoWeekMondayKey(new Date(Date.UTC(2026, 0, 7, 12)))).toBe(
			"2026-01-05"
		)
	})

	it("returns Monday for a Sunday (back 6 days, not forward 1)", () => {
		// 2026-01-04 is Sunday → previous Monday is 2025-12-29
		expect(isoWeekMondayKey(new Date(Date.UTC(2026, 0, 4, 23)))).toBe(
			"2025-12-29"
		)
	})

	it("returns Monday for a Monday (idempotent)", () => {
		expect(isoWeekMondayKey(new Date(Date.UTC(2026, 0, 5, 0)))).toBe(
			"2026-01-05"
		)
	})
})

describe("generateRenkoBricksWeekly", () => {
	it("returns empty + warning when no weekly sizes are provided", () => {
		const out = generateRenkoBricksWeekly([], {
			sizeByEffectiveDate: new Map(),
		})
		expect(out.bricks).toEqual([])
		expect(out.warnings.length).toBeGreaterThan(0)
	})

	it("drops bars before the earliest size entry", () => {
		const bars: RawBar[] = [
			// Bars in week 2026-01-05 (no size for this week)
			mkBar(new Date(Date.UTC(2026, 0, 7, 9, 0)), 100, 100),
			mkBar(new Date(Date.UTC(2026, 0, 7, 9, 1)), 110),
		]
		const sizes = new Map<string, number>([["2026-01-12", 5]])
		const out = generateRenkoBricksWeekly(bars, {
			sizeByEffectiveDate: sizes,
		})
		expect(out.bricks).toEqual([])
		expect(out.droppedBarsBeforeFirstSize).toBe(2)
	})

	it("hard-resets at week boundary", () => {
		// Week A (2026-01-05): bars rise from 100 → 105, would produce 1 up
		// brick @ R=5. We then cross into week B (2026-01-12) with R=3 and
		// bars from 200 → 203. Hard-reset means we ANCHOR at 200 in week B,
		// not continue from 105.
		const bars: RawBar[] = [
			mkBar(new Date(Date.UTC(2026, 0, 7, 9, 0)), 100, 100),
			mkBar(new Date(Date.UTC(2026, 0, 7, 9, 1)), 105),
			mkBar(new Date(Date.UTC(2026, 0, 13, 9, 0)), 200, 200),
			mkBar(new Date(Date.UTC(2026, 0, 13, 9, 1)), 203),
		]
		const sizes = new Map<string, number>([
			["2026-01-05", 5],
			["2026-01-12", 3],
		])
		const out = generateRenkoBricksWeekly(bars, {
			sizeByEffectiveDate: sizes,
		})
		expect(out.bricks).toHaveLength(2)
		expect(out.bricks[0]).toMatchObject({
			open: 100,
			close: 105,
			direction: "up",
		})
		expect(out.bricks[1]).toMatchObject({
			open: 200,
			close: 203,
			direction: "up",
		})
	})

	it("uses different R per week", () => {
		const bars: RawBar[] = [
			// Week A: needs +5 for a brick
			mkBar(new Date(Date.UTC(2026, 0, 7, 9, 0)), 100, 100),
			mkBar(new Date(Date.UTC(2026, 0, 7, 9, 1)), 103), // < R=5, no brick
			// Week B: same +3 move now triggers a brick at R=3
			mkBar(new Date(Date.UTC(2026, 0, 13, 9, 0)), 200, 200),
			mkBar(new Date(Date.UTC(2026, 0, 13, 9, 1)), 203), // ≥ R=3, brick
		]
		const sizes = new Map<string, number>([
			["2026-01-05", 5],
			["2026-01-12", 3],
		])
		const out = generateRenkoBricksWeekly(bars, {
			sizeByEffectiveDate: sizes,
		})
		expect(out.bricks).toHaveLength(1)
		expect(out.bricks[0]).toMatchObject({ open: 200, close: 203 })
	})
})
