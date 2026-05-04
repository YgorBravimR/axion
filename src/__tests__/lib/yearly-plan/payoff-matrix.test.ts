import { describe, it, expect } from "vitest"
import {
	generateCombinations,
	combinationEv,
	buildPayoffMatrix,
} from "@/lib/yearly-plan/payoff-matrix"
import { DEFAULT_EXIT_CONVENTION } from "@/lib/yearly-plan/exit-convention"

describe("generateCombinations", () => {
	it("N=1 → [{gains:1,stops:0},{gains:0,stops:1}]", () => {
		const combos = generateCombinations(1)
		expect(combos).toEqual([
			{ gains: 1, stops: 0 },
			{ gains: 0, stops: 1 },
		])
	})
	it("N=3 → 4 combos", () => {
		const combos = generateCombinations(3)
		expect(combos).toHaveLength(4)
		expect(combos[0]).toEqual({ gains: 3, stops: 0 })
		expect(combos[1]).toEqual({ gains: 2, stops: 1 })
		expect(combos[2]).toEqual({ gains: 1, stops: 2 })
		expect(combos[3]).toEqual({ gains: 0, stops: 3 })
	})
	it("N=10 → 11 combos", () => {
		expect(generateCombinations(10)).toHaveLength(11)
	})
})

describe("combinationEv (default convention, 1 contract)", () => {
	it("3G = 3×6.5 = 19.5 pts", () => {
		expect(combinationEv({ gains: 3, stops: 0 }, DEFAULT_EXIT_CONVENTION, 1)).toBeCloseTo(19.5, 5)
	})
	it("2G1S = 2×6.5 − 3.5 = 9.5 pts", () => {
		expect(combinationEv({ gains: 2, stops: 1 }, DEFAULT_EXIT_CONVENTION, 1)).toBeCloseTo(9.5, 5)
	})
	it("1G2S = 6.5 − 7.0 = -0.5 pts", () => {
		expect(combinationEv({ gains: 1, stops: 2 }, DEFAULT_EXIT_CONVENTION, 1)).toBeCloseTo(-0.5, 5)
	})
	it("3S = -10.5 pts", () => {
		expect(combinationEv({ gains: 0, stops: 3 }, DEFAULT_EXIT_CONVENTION, 1)).toBeCloseTo(-10.5, 5)
	})
	it("2 contracts: 3G = 39 pts", () => {
		expect(combinationEv({ gains: 3, stops: 0 }, DEFAULT_EXIT_CONVENTION, 2)).toBeCloseTo(39, 5)
	})
})

describe("combinationEv sensitivity to exit convention", () => {
	it("lower parcialPts reduces gainEv", () => {
		const modified = { ...DEFAULT_EXIT_CONVENTION, parcialPts: 3.0 }
		expect(combinationEv({ gains: 3, stops: 0 }, modified, 1)).toBeCloseTo(15.3, 5)
	})
})

describe("buildPayoffMatrix", () => {
	it("returns 10 rows for default maxOps=10", () => {
		const matrix = buildPayoffMatrix(DEFAULT_EXIT_CONVENTION, 1)
		expect(matrix).toHaveLength(10)
	})
	it("row for N=1 has 2 entries", () => {
		const matrix = buildPayoffMatrix(DEFAULT_EXIT_CONVENTION, 1)
		expect(matrix[0].combinations).toHaveLength(2)
	})
	it("row for N=3: first entry ev = 19.5", () => {
		const matrix = buildPayoffMatrix(DEFAULT_EXIT_CONVENTION, 1)
		const row3 = matrix[2]
		expect(row3.nOps).toBe(3)
		expect(row3.combinations[0].evPoints).toBeCloseTo(19.5, 5)
	})
})
