import { describe, it, expect } from "vitest"
import { formatFinite, formatCompactCurrency } from "@/lib/formatting"

describe("formatFinite", () => {
	it("returns toFixed for finite numbers", () => {
		expect(formatFinite(42.5678, 2)).toBe("42.57")
		expect(formatFinite(0, 2)).toBe("0.00")
		expect(formatFinite(-15.3, 2)).toBe("-15.30")
	})

	it("returns fallback for Infinity", () => {
		expect(formatFinite(Infinity, 2)).toBe("—")
		expect(formatFinite(Infinity, 2, "N/A")).toBe("N/A")
	})

	it("returns fallback for -Infinity", () => {
		expect(formatFinite(-Infinity, 2)).toBe("—")
		expect(formatFinite(-Infinity, 2, "unbounded")).toBe("unbounded")
	})

	it("returns fallback for NaN", () => {
		expect(formatFinite(NaN, 2)).toBe("—")
		expect(formatFinite(NaN, 1, "undefined")).toBe("undefined")
	})

	it("uses em-dash as default fallback", () => {
		expect(formatFinite(Infinity)).toContain("—")
		expect(formatFinite(Infinity).charCodeAt(0)).toBe(0x2014) // em-dash U+2014
	})

	it("respects custom fallback", () => {
		expect(formatFinite(NaN, 2, "--")).toBe("--")
		expect(formatFinite(Infinity, 1, "∞")).toBe("∞")
	})

	it("respects custom decimals", () => {
		expect(formatFinite(3.14159, 1)).toBe("3.1")
		expect(formatFinite(3.14159, 3)).toBe("3.142")
		expect(formatFinite(3.14159, 0)).toBe("3")
	})

	it("handles edge cases", () => {
		expect(formatFinite(0.00001, 5)).toBe("0.00001")
		expect(formatFinite(-0, 2)).toBe("0.00") // toFixed drops -0 sign
		expect(formatFinite(1e-10, 2)).toBe("0.00")
	})
})

// Regression: monte-carlo V2DistributionHistogram crashed in production with
// "RangeError: Invalid currency code : $" because the component defaulted
// `currency` to "$" (a symbol) and passed it directly into
// `Intl.NumberFormat({ currency })`, which requires an ISO 4217 code.
describe("formatCompactCurrency — currency code validation", () => {
	it("accepts valid ISO 4217 codes (BRL default)", () => {
		expect(() => formatCompactCurrency(1000)).not.toThrow()
		expect(() => formatCompactCurrency(1000, "BRL")).not.toThrow()
		expect(() => formatCompactCurrency(1000, "USD")).not.toThrow()
	})

	it("throws RangeError when given a currency symbol instead of ISO code", () => {
		expect(() => formatCompactCurrency(1000, "$")).toThrow(RangeError)
		expect(() => formatCompactCurrency(1000, "R$")).toThrow(RangeError)
	})
})
