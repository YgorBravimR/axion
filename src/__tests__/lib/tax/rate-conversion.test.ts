import { describe, it, expect } from "vitest"
import { fromBasisPoints, fromPercentString } from "@/lib/tax/rate-conversion"

describe("rate-conversion helpers", () => {
	describe("fromBasisPoints", () => {
		it("converts 0 bps to 0", () => {
			expect(fromBasisPoints(0)).toBe(0)
		})

		it("converts 100 bps to 0.01", () => {
			expect(fromBasisPoints(100)).toBe(0.01)
		})

		it("converts 2000 bps to 0.2 (20%)", () => {
			expect(fromBasisPoints(2000)).toBe(0.2)
		})

		it("converts 10000 bps to 1 (100%)", () => {
			expect(fromBasisPoints(10000)).toBe(1)
		})

		it("converts 5000 bps to 0.5 (50%)", () => {
			expect(fromBasisPoints(5000)).toBe(0.5)
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
