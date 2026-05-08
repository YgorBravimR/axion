import { describe, it, expect, vi, beforeEach } from "vitest"

const { findFirstMock } = vi.hoisted(() => ({ findFirstMock: vi.fn() }))
vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			accountFeeRates: {
				findFirst: findFirstMock,
			},
		},
	},
}))

import { resolveFeeSnapshot } from "@/lib/tax/fee-resolver"
import { ASSET_FEE_DEFAULTS } from "@/lib/tax/asset-defaults"

describe("resolveFeeSnapshot", () => {
	beforeEach(() => {
		findFirstMock.mockReset()
	})

	it("returns per-asset row when present", async () => {
		findFirstMock.mockResolvedValueOnce({
			txCorretagemCents: 5,
			txRegistroCents: 74,
			emolumentosCents: 40,
			issRatePercent: "5.00",
		})
		const result = await resolveFeeSnapshot({
			accountId: "acct-1",
			assetSymbol: "WDO",
		})
		// commission = 5 + round(5 * 5 / 100) = 5 + 0 = 5
		// fees = 74 + 40 = 114
		expect(result).toEqual({ commissionCents: 5, feesCents: 114 })
	})

	it("falls back to NULL-symbol default row", async () => {
		findFirstMock.mockResolvedValueOnce(null).mockResolvedValueOnce({
			txCorretagemCents: 100,
			txRegistroCents: 50,
			emolumentosCents: 25,
			issRatePercent: "10.00",
		})
		const result = await resolveFeeSnapshot({
			accountId: "acct-1",
			assetSymbol: "WDO",
		})
		// commission = 100 + round(100 * 10 / 100) = 110
		// fees = 50 + 25 = 75
		expect(result).toEqual({ commissionCents: 110, feesCents: 75 })
	})

	it("falls back to ASSET_FEE_DEFAULTS hardcoded values", async () => {
		findFirstMock.mockResolvedValue(null)
		const result = await resolveFeeSnapshot({
			accountId: "acct-1",
			assetSymbol: "WDO",
		})
		const wdo = ASSET_FEE_DEFAULTS.WDO
		if (!wdo) {
			throw new Error("ASSET_FEE_DEFAULTS.WDO must exist for this test")
		}
		const expectedCommission =
			wdo.txCorretagemCents +
			Math.round((wdo.txCorretagemCents * parseFloat(wdo.issRatePercent)) / 100)
		const expectedFees = wdo.txRegistroCents + wdo.emolumentosCents
		expect(result).toEqual({
			commissionCents: expectedCommission,
			feesCents: expectedFees,
		})
	})

	it("returns zero as last resort for unknown symbol with no DB rows", async () => {
		findFirstMock.mockResolvedValue(null)
		const result = await resolveFeeSnapshot({
			accountId: "acct-1",
			assetSymbol: "ZZZUNKNOWN",
		})
		expect(result).toEqual({ commissionCents: 0, feesCents: 0 })
	})
})
