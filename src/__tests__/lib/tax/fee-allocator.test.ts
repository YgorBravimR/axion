import { accountFeeRates, monthlyTaxLedger } from "@/db/schema"
import { describe, it, expect } from "vitest"

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
