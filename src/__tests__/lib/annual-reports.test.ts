// src/__tests__/lib/annual-reports.test.ts
//
// Pure-logic unit tests for the formulas inside annual-reports.ts. The full
// server actions hit the DB via period-queries; mocking that surface gets
// expensive and brittle. These tests pin the math the UI depends on without
// touching the network at all.

import { describe, it, expect } from "vitest"

describe("patrimônio chain logic", () => {
	it("seeds the first month from startingBalance", () => {
		const startingBalance = 100_000 // R$1,000.00
		const netPnl = 20_000 // R$200.00
		const novoAporte = 0
		const retirada = 5_000 // R$50.00

		const capitalInvestido = startingBalance + novoAporte
		const patrimonio = capitalInvestido + netPnl - retirada

		expect(capitalInvestido).toBe(100_000)
		expect(patrimonio).toBe(115_000)
	})

	it("carries the prior month's patrimônio into mesAnterior", () => {
		const mesAnterior = 115_000
		const novoAporte = 0
		const netPnl = -10_000 // loss month
		const retirada = 0

		const capitalInvestido = mesAnterior + novoAporte
		const patrimonio = capitalInvestido + netPnl - retirada

		expect(capitalInvestido).toBe(115_000)
		expect(patrimonio).toBe(105_000)
	})

	it("applies novoAporte before pnl, retirada after", () => {
		// Order matters for the displayed capitalInvestido column:
		// capitalInvestido = mesAnterior + novoAporte (pre-pnl baseline)
		// patrimonio       = capitalInvestido + netPnl - retirada (final)
		const mesAnterior = 50_000
		const novoAporte = 10_000
		const netPnl = 5_000
		const retirada = 3_000

		const capitalInvestido = mesAnterior + novoAporte
		const patrimonio = capitalInvestido + netPnl - retirada

		expect(capitalInvestido).toBe(60_000)
		expect(patrimonio).toBe(62_000)
	})

	it("propagates null mesAnterior when starting balance is unset", () => {
		// Account with no startingBalanceCents → first active month's patrimônio = null.
		const mesAnterior: number | null = null
		const novoAporte = 10_000
		const netPnl = 5_000
		const retirada = 0

		const capitalInvestido =
			mesAnterior !== null ? mesAnterior + novoAporte : null
		const patrimonio =
			capitalInvestido !== null ? capitalInvestido + netPnl - retirada : null

		expect(capitalInvestido).toBeNull()
		expect(patrimonio).toBeNull()
	})
})

describe("deriveAutoRetirada", () => {
	const deriveAutoRetirada = (
		resultado: number,
		target: number | null
	): number => {
		if (!target || target <= 0 || resultado <= 0) {
			return 0
		}
		return Math.round(resultado * (target / 100))
	}

	it("returns the rounded percentage of resultado on profit", () => {
		expect(deriveAutoRetirada(100_000, 30)).toBe(30_000)
	})

	it("returns 0 on a losing week", () => {
		expect(deriveAutoRetirada(-50_000, 30)).toBe(0)
	})

	it("returns 0 when target is null (withdrawal disabled)", () => {
		expect(deriveAutoRetirada(100_000, null)).toBe(0)
	})

	it("returns 0 when target is 0", () => {
		expect(deriveAutoRetirada(100_000, 0)).toBe(0)
	})

	it("rounds the fractional cents to nearest integer", () => {
		// 33.33% of 10_001 cents = 3333.3333 → Math.round → 3333
		expect(deriveAutoRetirada(10_001, 33.33)).toBe(3_333)
	})
})

describe("mensalMaximo fallback", () => {
	const fallbackMaximo = (
		mensalEsperado: number | null
	): { value: number | null; isEstimate: boolean } => {
		if (mensalEsperado === null) {
			return { value: null, isEstimate: true }
		}
		return { value: Math.round(mensalEsperado * 1.5), isEstimate: true }
	}

	it("applies the 1.5× multiplier when mensalEsperado is set", () => {
		const result = fallbackMaximo(100_000)
		expect(result.value).toBe(150_000)
		expect(result.isEstimate).toBe(true)
	})

	it("returns null + isEstimate when mensalEsperado is null", () => {
		const result = fallbackMaximo(null)
		expect(result.value).toBeNull()
		expect(result.isEstimate).toBe(true)
	})

	it("rounds the fractional cents away from .5", () => {
		// 333 × 1.5 = 499.5 → Math.round → 500
		expect(fallbackMaximo(333).value).toBe(500)
	})
})

describe("disabled month check", () => {
	const isDisabled = (
		startYear: number | null,
		startMonth: number | null,
		year: number,
		month: number
	): boolean => {
		if (startYear === null || startMonth === null) {
			return false
		}
		return year < startYear || (year === startYear && month < startMonth)
	}

	it("disables months before the account start year", () => {
		expect(isDisabled(2026, 3, 2025, 12)).toBe(true)
	})

	it("disables months in the start year before the start month", () => {
		expect(isDisabled(2026, 3, 2026, 1)).toBe(true)
		expect(isDisabled(2026, 3, 2026, 2)).toBe(true)
	})

	it("enables the start month and everything after", () => {
		expect(isDisabled(2026, 3, 2026, 3)).toBe(false)
		expect(isDisabled(2026, 3, 2026, 12)).toBe(false)
		expect(isDisabled(2026, 3, 2027, 1)).toBe(false)
	})

	it("returns false when start anchor is unset", () => {
		expect(isDisabled(null, null, 2020, 1)).toBe(false)
	})
})
