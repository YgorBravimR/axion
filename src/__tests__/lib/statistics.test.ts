import { describe, it, expect } from "vitest"
import {
	wilsonInterval,
	wilsonLowerBound,
	meanCi,
	shrinkMean,
	classifySample,
	rankingScore,
	SAMPLE_THRESHOLDS,
} from "@/lib/statistics"

describe("wilsonInterval", () => {
	it("returns [0,0] for empty sample", () => {
		expect(wilsonInterval(0, 0)).toEqual([0, 0])
	})

	it("produces wide bounds for n=1 win", () => {
		const [lo, hi] = wilsonInterval(1, 1)
		// 1/1 should NOT show ~100% as confident — Wilson keeps lower bound near ~20%
		expect(lo).toBeLessThan(0.3)
		expect(hi).toBeGreaterThan(0.95)
	})

	it("tightens around the observed rate for large n", () => {
		const [lo, hi] = wilsonInterval(50, 100)
		expect(lo).toBeGreaterThan(0.39)
		expect(lo).toBeLessThan(0.42)
		expect(hi).toBeGreaterThan(0.58)
		expect(hi).toBeLessThan(0.61)
	})

	it("respects [0,1] domain", () => {
		const [lo, hi] = wilsonInterval(100, 100)
		expect(lo).toBeGreaterThan(0.9)
		expect(hi).toBeLessThanOrEqual(1)
	})
})

describe("wilsonLowerBound — ranking sanity", () => {
	it("ranks 30/50 above 1/1 despite lower raw win rate", () => {
		// THE critical n-size test: if this fails, n=1 cells win "best window".
		expect(wilsonLowerBound(30, 50)).toBeGreaterThan(wilsonLowerBound(1, 1))
	})
})

describe("meanCi", () => {
	it("returns infinite band for n=1", () => {
		const ci = meanCi([2])
		expect(ci.mean).toBe(2)
		expect(ci.lower).toBe(Number.NEGATIVE_INFINITY)
		expect(ci.upper).toBe(Number.POSITIVE_INFINITY)
	})

	it("computes a finite CI for n>=2", () => {
		const ci = meanCi([1, 2, 3, 4, 5])
		expect(ci.mean).toBe(3)
		expect(ci.lower).toBeLessThan(3)
		expect(ci.upper).toBeGreaterThan(3)
		expect(Number.isFinite(ci.stderr)).toBe(true)
	})
})

describe("shrinkMean", () => {
	it("pulls low-n cells toward global mean", () => {
		const shrunk = shrinkMean(5, 1, 0)
		expect(Math.abs(shrunk)).toBeLessThan(0.5)
	})

	it("respects high-n cell means", () => {
		const shrunk = shrinkMean(0.5, 200, 0)
		expect(shrunk).toBeGreaterThan(0.4)
	})
})

describe("classifySample", () => {
	it("buckets n=1 as insufficient", () => {
		expect(classifySample(1)).toBe("insufficient")
	})
	it("buckets n=10 as low", () => {
		expect(classifySample(10)).toBe("low")
	})
	it("buckets n=50 as reliable", () => {
		expect(classifySample(50)).toBe("reliable")
	})
})

describe("rankingScore", () => {
	it("returns NaN below MIN_FOR_RANKING", () => {
		expect(
			Number.isNaN(rankingScore({ metric: "winRate", successes: 1, n: 1 }))
		).toBe(true)
	})

	it("ranks well-sampled cells higher than n=1 cells", () => {
		const big = rankingScore({ metric: "winRate", successes: 30, n: 50 })
		const tiny = rankingScore({ metric: "winRate", successes: 1, n: 1 })
		expect(Number.isNaN(tiny)).toBe(true)
		expect(big).toBeGreaterThan(0)
	})
})

describe("SAMPLE_THRESHOLDS", () => {
	it("has sane ordering", () => {
		expect(SAMPLE_THRESHOLDS.MIN_VISIBLE).toBeLessThan(
			SAMPLE_THRESHOLDS.MIN_FOR_RANKING
		)
		expect(SAMPLE_THRESHOLDS.MIN_FOR_RANKING).toBeLessThanOrEqual(
			SAMPLE_THRESHOLDS.MIN_RELIABLE
		)
	})
})
