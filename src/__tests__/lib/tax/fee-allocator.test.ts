import { accountFeeRates } from "@/db/schema"
import { describe, it, expect } from "vitest"

describe("schema: accountFeeRates", () => {
	it("exports the accountFeeRates table definition", () => {
		expect(accountFeeRates).toBeDefined()
		expect(typeof accountFeeRates).toBe("object")
	})
})
