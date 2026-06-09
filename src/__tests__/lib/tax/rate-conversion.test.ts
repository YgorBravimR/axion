import { describe, it, expect } from "vitest"
import {
	asBasisPoints,
	fromBasisPoints,
	fromPercentString,
} from "@/lib/tax/rate-conversion"

describe("rate-conversion helpers", () => {
	describe("asBasisPoints", () => {
		it("accepts valid zero (0 bps)", () => {
			const result = asBasisPoints(0)
			expect(result).toBe(0)
		})

		it("accepts valid lower bound (1 bps)", () => {
			const result = asBasisPoints(1)
			expect(result).toBe(1)
		})

		it("accepts valid middle value (2000 bps = 20%)", () => {
			const result = asBasisPoints(2000)
			expect(result).toBe(2000)
		})

		it("accepts valid upper bound (10000 bps = 100%)", () => {
			const result = asBasisPoints(10000)
			expect(result).toBe(10000)
		})

		it("throws on negative value in dev", () => {
			expect(() => asBasisPoints(-100)).toThrow(
				/asBasisPoints: -100 is outside the 0–10000 range/
			)
		})

		it("throws on value above 10000 in dev", () => {
			expect(() => asBasisPoints(10001)).toThrow(
				/asBasisPoints: 10001 is outside the 0–10000 range/
			)
		})

		it("throws on Infinity in dev", () => {
			expect(() => asBasisPoints(Infinity)).toThrow(
				/asBasisPoints: Infinity is outside the 0–10000 range/
			)
		})

		it("throws on NaN in dev", () => {
			expect(() => asBasisPoints(NaN)).toThrow(
				/asBasisPoints: NaN is outside the 0–10000 range/
			)
		})
	})

	describe("fromBasisPoints", () => {
		it("converts 0 bps to 0", () => {
			expect(fromBasisPoints(asBasisPoints(0))).toBe(0)
		})

		it("converts 100 bps to 0.01", () => {
			expect(fromBasisPoints(asBasisPoints(100))).toBe(0.01)
		})

		it("converts 2000 bps to 0.2 (20%)", () => {
			expect(fromBasisPoints(asBasisPoints(2000))).toBe(0.2)
		})

		it("converts 10000 bps to 1 (100%)", () => {
			expect(fromBasisPoints(asBasisPoints(10000))).toBe(1)
		})

		it("converts 5000 bps to 0.5 (50%)", () => {
			expect(fromBasisPoints(asBasisPoints(5000))).toBe(0.5)
		})
	})

	describe("fromPercentString", () => {
		it("converts '0' to 0", () => {
			expect(fromPercentString("0")).toBe(0)
		})

		it("converts '5' to 0.05 (5%)", () => {
			expect(fromPercentString("5")).toBe(0.05)
		})

		it("converts '5.00' to 0.05 (5%)", () => {
			expect(fromPercentString("5.00")).toBe(0.05)
		})

		it("converts '100' to 1 (100%)", () => {
			expect(fromPercentString("100")).toBe(1)
		})

		it("converts '0.5' to 0.005 (0.5%)", () => {
			expect(fromPercentString("0.5")).toBe(0.005)
		})

		it("returns 0 for 'invalid' string", () => {
			expect(fromPercentString("invalid")).toBe(0)
		})

		it("returns 0 for empty string", () => {
			expect(fromPercentString("")).toBe(0)
		})

		it("returns 0 for non-numeric string", () => {
			expect(fromPercentString("abc")).toBe(0)
		})
	})
})
