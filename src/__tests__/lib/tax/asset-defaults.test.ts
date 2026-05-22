import { describe, it, expect } from "vitest"
import { ASSET_FEE_DEFAULTS } from "@/lib/tax/asset-defaults"

describe("ASSET_FEE_DEFAULTS", () => {
	it("contains exactly four known assets: WDO, DOL, WIN, IND", () => {
		const keys = Object.keys(ASSET_FEE_DEFAULTS)
		expect(keys).toHaveLength(4)
		expect(keys).toEqual(["WDO", "DOL", "WIN", "IND"])
	})

	it("WDO entry has mini-contract fees (lowest per-contract costs)", () => {
		const wdo = ASSET_FEE_DEFAULTS.WDO
		expect(wdo).toBeDefined()
		expect(wdo!.assetSymbol).toBe("WDO")
		expect(wdo!.txCorretagemCents).toBe(5)
		expect(wdo!.txRegistroCents).toBe(74)
		expect(wdo!.emolumentosCents).toBe(40)
		// WDO total fixed costs
		expect(wdo!.txRegistroCents + wdo!.emolumentosCents).toBe(114)
	})

	it("DOL entry has full-contract fees (~5x WDO notional)", () => {
		const dol = ASSET_FEE_DEFAULTS.DOL
		expect(dol).toBeDefined()
		expect(dol!.assetSymbol).toBe("DOL")
		expect(dol!.txCorretagemCents).toBe(5)
		expect(dol!.txRegistroCents).toBe(370)
		expect(dol!.emolumentosCents).toBe(200)
		// Verify DOL is ~5x more expensive than WDO
		const wdo = ASSET_FEE_DEFAULTS.WDO!
		const dolTotal = dol!.txRegistroCents + dol!.emolumentosCents
		const wdoTotal = wdo.txRegistroCents + wdo.emolumentosCents
		expect(dolTotal / wdoTotal).toBeGreaterThan(3)
	})

	it("WIN entry has mini-contract fees (comparable to WDO)", () => {
		const win = ASSET_FEE_DEFAULTS.WIN
		expect(win).toBeDefined()
		expect(win!.assetSymbol).toBe("WIN")
		expect(win!.txCorretagemCents).toBe(5)
		expect(win!.txRegistroCents).toBe(16)
		expect(win!.emolumentosCents).toBe(9)
		// WIN is slightly cheaper than WDO
		expect(win!.txRegistroCents + win!.emolumentosCents).toBeLessThan(114)
	})

	it("IND entry has full-contract fees", () => {
		const ind = ASSET_FEE_DEFAULTS.IND
		expect(ind).toBeDefined()
		expect(ind!.assetSymbol).toBe("IND")
		expect(ind!.txCorretagemCents).toBe(5)
		expect(ind!.txRegistroCents).toBe(80)
		expect(ind!.emolumentosCents).toBe(45)
	})

	it("all entries share common tax rates via SHARED_RATES", () => {
		const entries = Object.values(ASSET_FEE_DEFAULTS)
		for (const entry of entries) {
			expect(entry.issRatePercent).toBe("5.00")
			expect(entry.irrfRateBps).toBe(100)
			expect(entry.irRateBps).toBe(2000)
			expect(entry.subjectToPersonalIr).toBe(true)
		}
	})

	it("corretagem rate is 5 cents (same for all assets)", () => {
		const entries = Object.values(ASSET_FEE_DEFAULTS)
		for (const entry of entries) {
			expect(entry.txCorretagemCents).toBe(5)
		}
	})

	it("ISS rate is 5.00% (applies to corretagem)", () => {
		const entries = Object.values(ASSET_FEE_DEFAULTS)
		for (const entry of entries) {
			const issRate = parseFloat(entry.issRatePercent)
			expect(issRate).toBe(5.0)
			expect(Number.isFinite(issRate)).toBe(true)
		}
	})

	it("all IRRF rates are 100 bps (1%)", () => {
		const entries = Object.values(ASSET_FEE_DEFAULTS)
		for (const entry of entries) {
			expect(entry.irrfRateBps).toBe(100)
		}
	})

	it("all IR rates are 2000 bps (20%)", () => {
		const entries = Object.values(ASSET_FEE_DEFAULTS)
		for (const entry of entries) {
			expect(entry.irRateBps).toBe(2000)
		}
	})

	it("all entries are subject to personal IR", () => {
		const entries = Object.values(ASSET_FEE_DEFAULTS)
		for (const entry of entries) {
			expect(entry.subjectToPersonalIr).toBe(true)
		}
	})

	it("asset lookup is case-sensitive (uppercase keys only)", () => {
		// Ensure lowercase keys don't exist
		expect(ASSET_FEE_DEFAULTS["wdo"]).toBeUndefined()
		expect(ASSET_FEE_DEFAULTS["dol"]).toBeUndefined()
		expect(ASSET_FEE_DEFAULTS["win"]).toBeUndefined()
		expect(ASSET_FEE_DEFAULTS["ind"]).toBeUndefined()
		// But uppercase keys work
		expect(ASSET_FEE_DEFAULTS.WDO).toBeDefined()
		expect(ASSET_FEE_DEFAULTS.DOL).toBeDefined()
		expect(ASSET_FEE_DEFAULTS.WIN).toBeDefined()
		expect(ASSET_FEE_DEFAULTS.IND).toBeDefined()
	})

	it("unknown asset symbol returns undefined on property access", () => {
		expect(ASSET_FEE_DEFAULTS["ZZZUNKNOWN"]).toBeUndefined()
		expect(ASSET_FEE_DEFAULTS["XYZ"]).toBeUndefined()
	})

	it("all entries have required FeeRatesEntry fields", () => {
		const entries = Object.values(ASSET_FEE_DEFAULTS)
		for (const entry of entries) {
			expect(entry).toHaveProperty("assetSymbol")
			expect(entry).toHaveProperty("txCorretagemCents")
			expect(entry).toHaveProperty("txRegistroCents")
			expect(entry).toHaveProperty("emolumentosCents")
			expect(entry).toHaveProperty("issRatePercent")
			expect(entry).toHaveProperty("irrfRateBps")
			expect(entry).toHaveProperty("irRateBps")
			expect(entry).toHaveProperty("subjectToPersonalIr")
		}
	})

	it("all numeric fee amounts are non-negative", () => {
		const entries = Object.values(ASSET_FEE_DEFAULTS)
		for (const entry of entries) {
			expect(entry.txCorretagemCents).toBeGreaterThanOrEqual(0)
			expect(entry.txRegistroCents).toBeGreaterThanOrEqual(0)
			expect(entry.emolumentosCents).toBeGreaterThanOrEqual(0)
			expect(entry.irrfRateBps).toBeGreaterThanOrEqual(0)
			expect(entry.irRateBps).toBeGreaterThanOrEqual(0)
		}
	})

	it("ISS rate parses to a valid positive number", () => {
		const entries = Object.values(ASSET_FEE_DEFAULTS)
		for (const entry of entries) {
			const rate = parseFloat(entry.issRatePercent)
			expect(Number.isFinite(rate)).toBe(true)
			expect(rate).toBeGreaterThan(0)
		}
	})
})
