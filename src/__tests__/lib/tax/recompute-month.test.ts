// src/__tests__/lib/tax/recompute-month.test.ts
// Integration test — uses in-memory fixtures, mocks DB calls
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Mock } from "vitest"

// We mock the DB module so tests run without a live DB
vi.mock("@/db/drizzle", () => ({
	db: {
		select: vi.fn(),
		insert: vi.fn(),
		update: vi.fn(),
		transaction: vi.fn(),
	},
}))

vi.mock("@/lib/user-crypto", () => ({
	getUserDek: vi.fn().mockResolvedValue(null),
	decryptTradeFields: vi.fn((val: unknown) => val),
}))

import { recomputeAccountMonth } from "@/lib/tax/recompute-month"

describe("recomputeAccountMonth", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("exports recomputeAccountMonth as a function", () => {
		expect(typeof recomputeAccountMonth).toBe("function")
	})

	it("returns a recomputed ledger row shape", async () => {
		// The function is integration-heavy; unit test verifies the return shape
		// Full DB integration tested in e2e
		const { db } = await import("@/db/drizzle")
		const mockSelect = db.select as Mock
		// Simulate: no existing trades → all-zero ledger.
		// where() chain serves three call sites:
		//   1. tradingAccounts lookup (uses .then)
		//   2. accountFeeRates lookup (awaited directly = thenable)
		//   3. trades query (uses .orderBy)
		const whereChain = {
			orderBy: vi.fn().mockResolvedValue([]),
			then: (resolve: (_v: unknown[]) => unknown) =>
				Promise.resolve([]).then(resolve),
		}
		mockSelect.mockReturnValue({
			from: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue(whereChain),
			}),
		})

		const mockInsert = db.insert as Mock
		mockInsert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				onConflictDoUpdate: vi.fn().mockResolvedValue([]),
			}),
		})

		const result = await recomputeAccountMonth({
			accountId: "acc-001",
			year: 2026,
			month: 1,
			carryoverInCents: 0,
			userId: "user-001",
		})

		expect(result).toHaveProperty("grossGainCents")
		expect(result).toHaveProperty("darfDueCents")
		expect(result).toHaveProperty("carryoverOutCents")
		expect(result).toHaveProperty("isDirty")
		expect(result.isDirty).toBe(false)
	})
})

import { markTaxLedgerDirty } from "@/lib/tax/mark-dirty"

describe("markTaxLedgerDirty", () => {
	it("exports markTaxLedgerDirty as a function", () => {
		expect(typeof markTaxLedgerDirty).toBe("function")
	})
})

describe("recomputeAccountMonth — per-asset fee rates", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("applies distinct fee rates per asset on the same day", async () => {
		const { db } = await import("@/db/drizzle")
		const mockSelect = db.select as Mock
		const mockInsert = db.insert as Mock

		// 1st select: all accountFeeRates rows (awaited on .where directly)
		const feeRatesWhere = Promise.resolve([
			{
				assetSymbol: null,
				txCorretagemCents: 5,
				txRegistroCents: 74,
				emolumentosCents: 40,
				issRatePercent: "5.00",
				irrfRateBps: 100,
				irRateBps: 2000,
				subjectToPersonalIr: true,
			},
			{
				assetSymbol: "WDO",
				txCorretagemCents: 5,
				txRegistroCents: 74,
				emolumentosCents: 40,
				issRatePercent: "5.00",
				irrfRateBps: 100,
				irRateBps: 2000,
				subjectToPersonalIr: true,
			},
			{
				assetSymbol: "WIN",
				txCorretagemCents: 10,
				txRegistroCents: 43,
				emolumentosCents: 7,
				issRatePercent: "5.00",
				irrfRateBps: 100,
				irRateBps: 2000,
				subjectToPersonalIr: true,
			},
		])
		// 2nd select: trades — 2 day-trades same calendar day, distinct assets.
		const sameDay = new Date(2026, 0, 15, 14, 30, 0)
		const tradesOrderBy = Promise.resolve([
			{
				id: "t-wdo",
				asset: "WDO",
				entryDate: sameDay,
				exitDate: sameDay,
				pnl: "10000", // +R$100
				contractsExecuted: 4,
			},
			{
				id: "t-win",
				asset: "WIN",
				entryDate: sameDay,
				exitDate: sameDay,
				pnl: "5000", // +R$50
				contractsExecuted: 10,
			},
		])

		mockSelect
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue(feeRatesWhere),
				}),
			})
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue({
						orderBy: vi.fn().mockReturnValue(tradesOrderBy),
					}),
				}),
			})

		mockInsert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				onConflictDoUpdate: vi.fn().mockResolvedValue([]),
			}),
		})

		const result = await recomputeAccountMonth({
			accountId: "acc-multi",
			year: 2026,
			month: 1,
			carryoverInCents: 0,
			userId: "user-001",
		})

		// Gross + counts cover both assets
		expect(result.grossGainCents).toBe(15000)
		expect(result.totalContractsExecuted).toBe(14)
		expect(result.tradeCount).toBe(2)

		// Fees split: WDO (4 contracts × 5/74/40) + WIN (10 contracts × 10/43/7)
		// txCorretagem: 4·5 + 10·10 = 20 + 100 = 120
		// txRegistro:   4·74 + 10·43 = 296 + 430 = 726
		// emolumentos:  4·40 + 10·7  = 160 + 70  = 230
		// iss = txCorretagem · 5% = 120·0.05 = 6
		expect(result.totalTxCorretagemCents).toBe(120)
		expect(result.totalTxRegistroCents).toBe(726)
		expect(result.totalEmolumentosCents).toBe(230)
		expect(result.totalIssCents).toBe(6)
	})
})

describe("tax-engine server actions — import", () => {
	it("tax-engine module placeholder smoke test", () => {
		// Cannot import a "use server" module in vitest runtime.
		// Actual behavior tested in e2e (Phase 10).
		expect(true).toBe(true)
	})
})
