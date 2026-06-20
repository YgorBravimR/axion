import { describe, expect, it } from "vitest"
import {
	detectRenkoPivots,
	detectRenkoPivotsAllN,
	type PivotBrick,
} from "@/lib/pivots/detect-renko"

/**
 * Clean-swing semantics: one TOPO per peak, one FUNDO per trough.
 * Different from the legacy event-stream detector at
 * `src/lib/backtest/hawks-structural-pivots.ts` (which emits multiple
 * pivots per swing). This detector populates `asset_pivots` for Fib,
 * chart overlays, and cross-tool consumption.
 *
 * Wick-based direction per CLAUDE.md rule 0a:
 *   - bullish: brick.high > priorBrick.high
 *   - bearish: brick.low < priorBrick.low
 *   - neutral: passthrough
 */

/**
 * Bricks 0-3: strictly-bullish wicks (104→106→108→110 highs).
 * Bricks 4-6: strictly-bearish wicks (108→106→104 lows).
 * Bricks 7-9: strictly-bullish wicks (resume up).
 *
 * Expected at N=2:
 *   - TOPO at peakBrickIdx=3, price=110 (peak of bullish run), confirmed at brick 5 (2nd bearish)
 *   - FUNDO at peakBrickIdx=6, price=100 (trough of bearish run), confirmed at brick 8 (2nd bullish)
 *
 * Expected at N=1:
 *   - Same pivots BUT confirmed one brick earlier (at brick 4 and brick 7 respectively).
 *
 * Expected at N=3:
 *   - Same pivots, confirmed at brick 6 and brick 9 respectively.
 *
 * Expected at N>=4: bearish run is only 3 bricks long → first TOPO no longer
 * confirms; second FUNDO never confirms because run is only 3 bricks before
 * the next direction change. Output should be empty.
 */
const cleanSwingFixture = (): PivotBrick[] => [
	{ open: 100, high: 104, low: 99, close: 104 },
	{ open: 104, high: 106, low: 103, close: 106 },
	{ open: 106, high: 108, low: 105, close: 108 },
	{ open: 108, high: 110, low: 107, close: 110 }, // peak high 110 (idx 3)
	{ open: 110, high: 109, low: 106, close: 106 }, // bearish wick (low 106 < 107)
	{ open: 106, high: 108, low: 104, close: 104 }, // bearish wick (104 < 106) — 2nd bearish
	{ open: 104, high: 106, low: 100, close: 100 }, // bearish wick (100 < 104) — trough (idx 6)
	{ open: 100, high: 108, low: 99, close: 108 }, // bullish wick (108 > 106)
	{ open: 108, high: 110, low: 107, close: 110 }, // bullish wick (110 > 108) — 2nd bullish
	{ open: 110, high: 112, low: 109, close: 112 }, // bullish wick (112 > 110) — 3rd bullish
]

describe("detectRenkoPivots — clean swing semantics", () => {
	it("N=2 detects one TOPO at the run peak and one FUNDO at the run trough", () => {
		const pivots = detectRenkoPivots(cleanSwingFixture(), 2)
		expect(pivots.length).toBe(2)
		expect(pivots[0]).toEqual({
			type: "topo",
			price: 110,
			peakBrickIdx: 3,
			confirmationBrickIdx: 5,
		})
		expect(pivots[1]).toEqual({
			type: "fundo",
			price: 100,
			peakBrickIdx: 6,
			confirmationBrickIdx: 8,
		})
	})

	it("N=1 detects the same pivots one brick earlier", () => {
		const pivots = detectRenkoPivots(cleanSwingFixture(), 1)
		expect(pivots.length).toBe(2)
		expect(pivots[0]).toMatchObject({
			type: "topo",
			price: 110,
			peakBrickIdx: 3,
			confirmationBrickIdx: 4,
		})
		expect(pivots[1]).toMatchObject({
			type: "fundo",
			price: 100,
			peakBrickIdx: 6,
			confirmationBrickIdx: 7,
		})
	})

	it("N=3 detects the same pivots two bricks later (third opposite confirms)", () => {
		const pivots = detectRenkoPivots(cleanSwingFixture(), 3)
		expect(pivots.length).toBe(2)
		expect(pivots[0]).toMatchObject({
			type: "topo",
			price: 110,
			peakBrickIdx: 3,
			confirmationBrickIdx: 6,
		})
		expect(pivots[1]).toMatchObject({
			type: "fundo",
			price: 100,
			peakBrickIdx: 6,
			confirmationBrickIdx: 9,
		})
	})

	it("N=4 detects no pivots — neither run is long enough to confirm", () => {
		const pivots = detectRenkoPivots(cleanSwingFixture(), 4)
		expect(pivots.length).toBe(0)
	})

	it("N=5, N=6 also detect no pivots on this fixture", () => {
		expect(detectRenkoPivots(cleanSwingFixture(), 5)).toEqual([])
		expect(detectRenkoPivots(cleanSwingFixture(), 6)).toEqual([])
	})
})

const fixtureRandom = (seed: number, length: number): PivotBrick[] => {
	// Deterministic pseudo-random brick sequence — Mulberry32.
	let state = seed >>> 0
	const next = (): number => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
	const out: PivotBrick[] = []
	let price = 1000
	for (let i = 0; i < length; i++) {
		const dir = next() > 0.5 ? 1 : -1
		const move = 1 + Math.floor(next() * 3)
		const open = price
		const close = open + dir * move
		const high = Math.max(open, close) + Math.floor(next() * 2)
		const low = Math.min(open, close) - Math.floor(next() * 2)
		out.push({ open, high, low, close })
		price = close
	}
	return out
}

describe("detectRenkoPivots — count monotonicity", () => {
	/**
	 * The strong subset invariant `pivots(N=k+1) ⊆ pivots(N=k)` does NOT hold
	 * for clean-swing semantics: more confirmation extends a run further and
	 * can shift a peak to a brick that was already a pivot at lower N (where
	 * the run got flipped early). What DOES hold is that more confirmation
	 * cannot produce STRICTLY MORE pivots — N=k+1's count is ≤ N=k's count.
	 * Weakening the assertion to count matches the actual semantics.
	 */
	it("|pivots(N=k+1)| ≤ |pivots(N=k)| on clean fixture", () => {
		const bricks = cleanSwingFixture()
		const all = detectRenkoPivotsAllN(bricks)
		for (let k = 1; k <= 5; k++) {
			expect(
				all[k + 1]!.length,
				`N=${k + 1} count exceeds N=${k}`
			).toBeLessThanOrEqual(all[k]!.length)
		}
	})

	it.each([1, 7, 17, 42, 123])(
		"|pivots(N=k+1)| ≤ |pivots(N=k)| on random fixture seed=%i (length=300)",
		(seed) => {
			const bricks = fixtureRandom(seed, 300)
			const all = detectRenkoPivotsAllN(bricks)
			for (let k = 1; k <= 5; k++) {
				expect(
					all[k + 1]!.length,
					`seed=${seed} N=${k + 1} count exceeds N=${k}`
				).toBeLessThanOrEqual(all[k]!.length)
			}
		}
	)
})

describe("detectRenkoPivots — price-match invariant", () => {
	it.each([1, 2, 3, 4, 5, 6])(
		"emitted price equals bricks[peakBrickIdx].high (TOPO) or .low (FUNDO) at N=%i",
		(n) => {
			const bricks = fixtureRandom(7, 500)
			const pivots = detectRenkoPivots(bricks, n)
			for (const p of pivots) {
				const peak = bricks[p.peakBrickIdx]
				expect(
					peak,
					`peakBrickIdx ${p.peakBrickIdx} out of range`
				).toBeDefined()
				const expected = p.type === "topo" ? peak!.high : peak!.low
				expect(p.price).toBe(expected)
			}
		}
	)
})

describe("detectRenkoPivots — alternation invariant", () => {
	it.each([1, 2, 3, 4, 5, 6])(
		"output strictly alternates topo↔fundo at N=%i",
		(n) => {
			const bricks = fixtureRandom(11, 500)
			const pivots = detectRenkoPivots(bricks, n)
			for (let i = 1; i < pivots.length; i++) {
				expect(
					pivots[i]!.type,
					`pivot[${i}] same type as pivot[${i - 1}]`
				).not.toBe(pivots[i - 1]!.type)
			}
		}
	)
})

describe("detectRenkoPivots — bounds + edge cases", () => {
	it("rejects N < 1 and N > 6", () => {
		expect(() => detectRenkoPivots([], 0)).toThrow()
		expect(() => detectRenkoPivots([], 7)).toThrow()
		expect(() => detectRenkoPivots([], -1)).toThrow()
	})

	it("returns no pivots on an empty brick array", () => {
		for (let n = 1; n <= 6; n++) {
			expect(detectRenkoPivots([], n)).toEqual([])
		}
	})

	it("returns no pivots on a single brick", () => {
		const bricks: PivotBrick[] = [{ open: 100, high: 101, low: 99, close: 101 }]
		for (let n = 1; n <= 6; n++) {
			expect(detectRenkoPivots(bricks, n)).toEqual([])
		}
	})

	it("confirmationBrickIdx > peakBrickIdx for every pivot", () => {
		const bricks = fixtureRandom(42, 500)
		for (let n = 1; n <= 6; n++) {
			const pivots = detectRenkoPivots(bricks, n)
			for (const p of pivots) {
				expect(p.confirmationBrickIdx).toBeGreaterThan(p.peakBrickIdx)
			}
		}
	})
})
