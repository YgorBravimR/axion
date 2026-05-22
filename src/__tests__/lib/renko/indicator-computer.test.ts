import { describe, it, expect } from "vitest"

import { computeEma, computeMacd } from "@/lib/renko/indicator-computer"

const round = (x: number | null, dp = 6): number | null =>
	x === null ? null : Number(x.toFixed(dp))

describe("computeEma", () => {
	it("returns all-null when series is shorter than period", () => {
		expect(computeEma([1, 2], 3)).toEqual([null, null])
	})

	it("seeds with SMA of the first `period` values", () => {
		const out = computeEma([1, 2, 3, 4, 5], 3)
		// Warmup: null, null, then SMA(1,2,3)=2
		expect(out.slice(0, 3)).toEqual([null, null, 2])
	})

	it("rolls forward with alpha = 2/(period+1)", () => {
		const period = 3
		const values = [1, 2, 3, 4, 5]
		const out = computeEma(values, period)
		// alpha = 0.5; after seed=2, next = 0.5*4 + 0.5*2 = 3
		// next = 0.5*5 + 0.5*3 = 4
		expect(out.map((v) => round(v))).toEqual([null, null, 2, 3, 4])
	})

	it("matches a hand-computed reference for period=5", () => {
		const values = [10, 11, 12, 13, 14, 15, 16, 17]
		const out = computeEma(values, 5).map((v) => round(v))
		// seed at idx 4: SMA(10..14)=12; alpha=1/3
		// idx 5: 15/3 + 12*2/3 = 13
		// idx 6: 16/3 + 13*2/3 = 14
		// idx 7: 17/3 + 14*2/3 = 15
		expect(out).toEqual([null, null, null, null, 12, 13, 14, 15])
	})

	it("throws on non-positive or non-integer period", () => {
		expect(() => computeEma([], 0)).toThrow(/positive integer/)
		expect(() => computeEma([], -1)).toThrow(/positive integer/)
		expect(() => computeEma([], 2.5)).toThrow(/positive integer/)
	})
})

describe("computeMacd", () => {
	it("returns aligned all-null arrays when series is shorter than slow", () => {
		const { line, signal, histogram } = computeMacd([1, 2, 3], {
			fast: 12,
			slow: 26,
			signal: 9,
		})
		expect(line).toHaveLength(3)
		expect(line.every((v) => v === null)).toBe(true)
		expect(signal.every((v) => v === null)).toBe(true)
		expect(histogram.every((v) => v === null)).toBe(true)
	})

	it("computes line as fastEma − slowEma", () => {
		// 30 ascending values; slow=5, fast=3, signal=4
		const values = Array.from({ length: 30 }, (_, i) => i + 1)
		const { line } = computeMacd(values, { fast: 3, slow: 5, signal: 4 })

		const fast = computeEma(values, 3)
		const slow = computeEma(values, 5)
		for (let i = 0; i < values.length; i++) {
			const f = fast[i] ?? null
			const s = slow[i] ?? null
			const expected = f !== null && s !== null ? round(f - s) : null
			expect(round(line[i] ?? null)).toEqual(expected)
		}
	})

	it("signal lags line by (signal - 1) further bars", () => {
		const values = Array.from({ length: 30 }, (_, i) => i + 1)
		const { line, signal } = computeMacd(values, {
			fast: 3,
			slow: 5,
			signal: 4,
		})

		// line first non-null at idx 4 (slow=5 → idx slow-1). signal seeded
		// at idx 4 + (4-1) = 7.
		expect(line[3]).toBeNull()
		expect(line[4]).not.toBeNull()
		expect(signal[6]).toBeNull()
		expect(signal[7]).not.toBeNull()
	})

	it("histogram = line − signal exactly where both exist", () => {
		const values = Array.from({ length: 50 }, (_, i) => Math.sin(i / 3) * 10)
		const { line, signal, histogram } = computeMacd(values, {
			fast: 12,
			slow: 26,
			signal: 9,
		})
		for (let i = 0; i < values.length; i++) {
			const l = line[i] ?? null
			const s = signal[i] ?? null
			const h = histogram[i] ?? null
			if (l !== null && s !== null) {
				expect(round(h)).toEqual(round(l - s))
			} else {
				expect(h).toBeNull()
			}
		}
	})

	it("throws when fast ≥ slow", () => {
		expect(() =>
			computeMacd([1, 2, 3], { fast: 12, slow: 12, signal: 9 })
		).toThrow(/strictly less/)
		expect(() =>
			computeMacd([1, 2, 3], { fast: 26, slow: 12, signal: 9 })
		).toThrow(/strictly less/)
	})

	it("throws on non-positive integer params", () => {
		expect(() => computeMacd([], { fast: 0, slow: 26, signal: 9 })).toThrow(
			/positive integer/
		)
		expect(() => computeMacd([], { fast: 12, slow: -1, signal: 9 })).toThrow(
			/positive integer/
		)
		expect(() => computeMacd([], { fast: 12, slow: 26, signal: 1.5 })).toThrow(
			/positive integer/
		)
	})
})
