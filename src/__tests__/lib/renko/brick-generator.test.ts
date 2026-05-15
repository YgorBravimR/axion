import { describe, it, expect } from "vitest"

import { generateRenkoBricks, type RawBar } from "@/lib/renko/brick-generator"

const t = (minute: number): Date => new Date(Date.UTC(2026, 0, 1, 9, minute, 0))

const bar = (minute: number, close: number, open?: number): RawBar => ({
	timestamp: t(minute),
	open: open ?? close,
	high: close,
	low: close,
	close,
})

describe("generateRenkoBricks — seed", () => {
	it("emits no bricks while price stays inside ±R of the anchor", () => {
		const bars: RawBar[] = [
			bar(0, 100, 100),
			bar(1, 104),
			bar(2, 99),
			bar(3, 101),
		]
		const { bricks, warnings } = generateRenkoBricks(bars, { sizeR: 5 })
		expect(bricks).toEqual([])
		expect(warnings.length).toBe(1)
	})

	it("emits a single up brick when close ≥ anchor + R", () => {
		const bars: RawBar[] = [bar(0, 100, 100), bar(1, 102), bar(2, 105)]
		const { bricks } = generateRenkoBricks(bars, { sizeR: 5 })
		expect(bricks).toHaveLength(1)
		expect(bricks[0]).toMatchObject({
			open: 100,
			close: 105,
			direction: "up",
		})
	})

	it("emits a single down brick when close ≤ anchor − R", () => {
		const bars: RawBar[] = [bar(0, 100, 100), bar(1, 98), bar(2, 94)]
		const { bricks } = generateRenkoBricks(bars, { sizeR: 5 })
		expect(bricks).toHaveLength(1)
		expect(bricks[0]).toMatchObject({
			open: 100,
			close: 95,
			direction: "down",
		})
	})
})

describe("generateRenkoBricks — continuation", () => {
	it("emits sequential same-direction bricks at +R each", () => {
		const bars: RawBar[] = [
			bar(0, 100, 100),
			bar(1, 106), // first up brick: 100 → 105 (close drives it)
			bar(2, 111), // continuation: 105 → 110
			bar(3, 116), // continuation: 110 → 115
		]
		const { bricks } = generateRenkoBricks(bars, { sizeR: 5 })
		expect(bricks.map((b) => b.close)).toEqual([105, 110, 115])
		expect(bricks.every((b) => b.direction === "up")).toBe(true)
	})

	it("emits multiple bricks from a single multi-R bar", () => {
		const bars: RawBar[] = [
			bar(0, 100, 100),
			bar(1, 120), // jumps 20 points — should emit 4 up bricks
		]
		const { bricks } = generateRenkoBricks(bars, { sizeR: 5 })
		expect(bricks.map((b) => b.close)).toEqual([105, 110, 115, 120])
		expect(bricks.every((b) => b.direction === "up")).toBe(true)
	})
})

describe("generateRenkoBricks — reversal", () => {
	it("emits a single 2R-body brick on classic up→down reversal", () => {
		const bars: RawBar[] = [
			bar(0, 100, 100),
			bar(1, 106), // up brick 100→105
			bar(2, 94), // reversal: 12 points down ≥ 2R; emit one down brick 100→95
		]
		const { bricks } = generateRenkoBricks(bars, { sizeR: 5 })
		expect(bricks).toHaveLength(2)
		expect(bricks[0]).toMatchObject({ direction: "up", close: 105 })
		expect(bricks[1]).toMatchObject({
			direction: "down",
			open: 100,
			close: 95,
		})
	})

	it("emits a single 2R-body brick on classic down→up reversal", () => {
		const bars: RawBar[] = [
			bar(0, 100, 100),
			bar(1, 94), // down brick 100→95
			bar(2, 106), // reversal: emit one up brick 100→105
		]
		const { bricks } = generateRenkoBricks(bars, { sizeR: 5 })
		expect(bricks).toHaveLength(2)
		expect(bricks[0]).toMatchObject({ direction: "down", close: 95 })
		expect(bricks[1]).toMatchObject({
			direction: "up",
			open: 100,
			close: 105,
		})
	})

	it("rejects sub-2R counter-moves as continuation-only", () => {
		const bars: RawBar[] = [
			bar(0, 100, 100),
			bar(1, 106), // up brick 100→105
			bar(2, 97), // only 8 points down — < 2R; no reversal
			bar(3, 111), // up continuation: 105→110
		]
		const { bricks } = generateRenkoBricks(bars, { sizeR: 5 })
		expect(bricks.map((b) => `${b.direction}:${b.close}`)).toEqual([
			"up:105",
			"up:110",
		])
	})
})

describe("generateRenkoBricks — edge cases", () => {
	it("returns empty result for empty input without warning", () => {
		const { bricks, warnings } = generateRenkoBricks([], { sizeR: 5 })
		expect(bricks).toEqual([])
		expect(warnings).toEqual([])
	})

	it("throws on non-positive brick size", () => {
		expect(() => generateRenkoBricks([], { sizeR: 0 })).toThrow(/positive/)
		expect(() => generateRenkoBricks([], { sizeR: -1 })).toThrow(/positive/)
	})

	it("attributes every brick's closeTimestamp to the bar that triggered it", () => {
		const bars: RawBar[] = [
			bar(0, 100, 100),
			bar(1, 102),
			bar(2, 120), // emits 4 bricks, all at minute 2
		]
		const { bricks } = generateRenkoBricks(bars, { sizeR: 5 })
		expect(bricks).toHaveLength(4)
		for (const b of bricks) {
			expect(b.closeTimestamp).toEqual(t(2))
		}
	})

	it("anchorTimestamp on the very first brick equals the input's first bar timestamp", () => {
		const bars: RawBar[] = [bar(0, 100, 100), bar(1, 105)]
		const { bricks } = generateRenkoBricks(bars, { sizeR: 5 })
		expect(bricks).toHaveLength(1)
		expect(bricks[0]!.openTimestamp).toEqual(t(0))
	})
})
