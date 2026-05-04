import { accountFeeRates, monthlyTaxLedger } from "@/db/schema"
import { describe, it, expect } from "vitest"
import { computeDayFees } from "@/lib/tax/fee-allocator"

describe("schema: accountFeeRates", () => {
	it("exports the accountFeeRates table definition", () => {
		expect(accountFeeRates).toBeDefined()
		expect(typeof accountFeeRates).toBe("object")
	})
})

describe("schema: monthlyTaxLedger", () => {
	it("exports the monthlyTaxLedger table definition", () => {
		expect(monthlyTaxLedger).toBeDefined()
	})
})

// Hand-computed fixture (planilha validation):
// 2 contracts, txCorretagem=5c, txRegistro=74c, emolumentos=40c, issRatePercent=5.00
//   txCorretagem = 2 × 5 = 10
//   txRegistro   = 2 × 74 = 148
//   emolumentos  = 2 × 40 = 80
//   iss          = round(10 × 5.00/100) = round(0.5) = 1  (rounds 0.5 → 1)
//   subtotal     = 10 + 148 + 80 + 1 = 239
const BASE_RATES = {
	txCorretagemCents: 5,
	txRegistroCents: 74,
	emolumentosCents: 40,
	issRatePercent: 5.00,
}

describe("computeDayFees", () => {
	it("2 contracts, standard BR rates → correct breakdown", () => {
		const result = computeDayFees({ contractsExecuted: 2, rates: BASE_RATES })
		expect(result.txCorretagem).toBe(10)
		expect(result.txRegistro).toBe(148)
		expect(result.emolumentos).toBe(80)
		expect(result.iss).toBe(1)
		expect(result.subtotal).toBe(239)
	})

	it("ISS rate 0 → iss = 0", () => {
		const result = computeDayFees({
			contractsExecuted: 2,
			rates: { ...BASE_RATES, issRatePercent: 0 },
		})
		expect(result.iss).toBe(0)
		expect(result.subtotal).toBe(10 + 148 + 80)
	})

	it("0 contracts → all zeros", () => {
		const result = computeDayFees({ contractsExecuted: 0, rates: BASE_RATES })
		expect(result.txCorretagem).toBe(0)
		expect(result.txRegistro).toBe(0)
		expect(result.emolumentos).toBe(0)
		expect(result.iss).toBe(0)
		expect(result.subtotal).toBe(0)
	})

	it("fractional contracts (1.5) → rounds to nearest cent", () => {
		// 1.5 × 5 = 7.5 → rounds to 8 (Math.round)
		const result = computeDayFees({ contractsExecuted: 1.5, rates: BASE_RATES })
		expect(result.txCorretagem).toBe(8)
		// iss = round(8 × 0.05) = round(0.4) = 0
		expect(result.iss).toBe(0)
	})

	it("10 contracts, standard rates → scales linearly", () => {
		const result = computeDayFees({ contractsExecuted: 10, rates: BASE_RATES })
		expect(result.txCorretagem).toBe(50)
		expect(result.txRegistro).toBe(740)
		expect(result.emolumentos).toBe(400)
		expect(result.iss).toBe(3)  // round(50 × 0.05) = round(2.5) = 3
		expect(result.subtotal).toBe(50 + 740 + 400 + 3)
	})
})
