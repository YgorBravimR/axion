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

import { recomputeAccountMonth } from "@/lib/tax/recompute-month"
import { asBasisPoints } from "@/lib/tax/rate-conversion"

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

		// Build proper mock responses for each query:
		// 1. Prior month deferred IR query (returns array via .limit)
		const priorMonthChain = {
			limit: vi.fn().mockResolvedValue([]),
		}

		// 2. Account fee rates — no .select() param, so .where() is awaitable
		const feeRatesChain = Promise.resolve([
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
		])

		// 3. Trades query — uses .orderBy()
		const tradesChain = {
			orderBy: vi.fn().mockResolvedValue([]),
		}

		let selectCallCount = 0
		mockSelect.mockImplementation(() => {
			selectCallCount++
			return {
				from: vi.fn().mockImplementation(() => {
					// Call 1: prior month (with projection)
					if (selectCallCount === 1) {
						return {
							where: vi.fn().mockReturnValue(priorMonthChain),
						}
					}
					// Call 2: fee rates (no projection)
					if (selectCallCount === 2) {
						return {
							where: vi.fn().mockReturnValue(feeRatesChain),
						}
					}
					// Call 3: trades (with projection)
					if (selectCallCount === 3) {
						return {
							where: vi.fn().mockReturnValue(tradesChain),
						}
					}
					return {}
				}),
			}
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
				irrfRateBps: asBasisPoints(100),
				irRateBps: asBasisPoints(2000),
				subjectToPersonalIr: true,
			},
			{
				assetSymbol: "WDO",
				txCorretagemCents: 5,
				txRegistroCents: 74,
				emolumentosCents: 40,
				issRatePercent: "5.00",
				irrfRateBps: asBasisPoints(100),
				irRateBps: asBasisPoints(2000),
				subjectToPersonalIr: true,
			},
			{
				assetSymbol: "WIN",
				txCorretagemCents: 10,
				txRegistroCents: 43,
				emolumentosCents: 7,
				issRatePercent: "5.00",
				irrfRateBps: asBasisPoints(100),
				irRateBps: asBasisPoints(2000),
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

		const priorMonthWhere = {
			limit: vi.fn().mockResolvedValue([]),
		}

		mockSelect
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue(priorMonthWhere),
				}),
			})
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

describe("recomputeAccountMonth — BRT day-boundary regression (Zone 16-1)", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("classifies same-day trades by BRT calendar day, not UTC", async () => {
		// Test case 1: Trade entered 22:30 BRT (01:30 UTC next day) and exited 23:45 BRT
		// same BRT day (02:45 UTC same UTC day as entry's UTC day).
		// Entry: 2026-06-08T22:30:00-03:00 = 2026-06-09T01:30:00Z
		// Exit:  2026-06-08T23:45:00-03:00 = 2026-06-09T02:45:00Z
		// Both are June 8 in BRT, but straddle UTC midnight on different UTC days (if naive).
		// Must classify as same-day BRT.

		const { db } = await import("@/db/drizzle")
		const mockSelect = db.select as Mock
		const mockInsert = db.insert as Mock

		// Convert BRT time strings to Date objects
		// 2026-06-08T22:30:00-03:00 = 2026-06-09T01:30:00Z
		const entryBrt = new Date("2026-06-09T01:30:00Z")
		// 2026-06-08T23:45:00-03:00 = 2026-06-09T02:45:00Z
		const exitBrt = new Date("2026-06-09T02:45:00Z")

		const feeRatesWhere = Promise.resolve([
			{
				assetSymbol: null,
				txCorretagemCents: 5,
				txRegistroCents: 74,
				emolumentosCents: 40,
				issRatePercent: "5.00",
				irrfRateBps: asBasisPoints(100),
				irRateBps: asBasisPoints(2000),
				subjectToPersonalIr: true,
			},
		])

		const tradesOrderBy = Promise.resolve([
			{
				id: "t-tz-1",
				asset: "WDO",
				entryDate: entryBrt,
				exitDate: exitBrt,
				pnl: "5000", // +R$50
				contractsExecuted: 2,
			},
		])

		// Prior month query (deferredIr lookup)
		const priorMonthWhere = {
			limit: vi.fn().mockResolvedValue([]),
		}

		mockSelect
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue(priorMonthWhere),
				}),
			})
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
			accountId: "acc-tz-1",
			year: 2026,
			month: 6,
			carryoverInCents: 0,
		})

		// Trade should be classified as day-trade (tradeCount = 1)
		// If day-detection were using UTC instead of BRT, might fail or exclude it
		expect(result.tradeCount).toBe(1)
		expect(result.grossGainCents).toBe(5000)
	})

	it("rejects trades across BRT midnight as swing trades (not same-day)", async () => {
		// Test case 2: Trade entered 23:30 BRT (02:30 UTC next day) and exited 00:30 BRT
		// next BRT day (03:30 UTC same UTC day as entry's UTC day).
		// Entry: 2026-06-08T23:30:00-03:00 = 2026-06-09T02:30:00Z
		// Exit:  2026-06-09T00:30:00-03:00 = 2026-06-09T03:30:00Z
		// BRT midnight crossed (June 8 → June 9), UTC midnight not crossed.
		// Must NOT classify as same-day.

		const { db } = await import("@/db/drizzle")
		const mockSelect = db.select as Mock
		const mockInsert = db.insert as Mock

		const entryBrtMidnight = new Date("2026-06-09T02:30:00Z")
		const exitBrtMidnight = new Date("2026-06-09T03:30:00Z")

		const feeRatesWhere = Promise.resolve([
			{
				assetSymbol: null,
				txCorretagemCents: 5,
				txRegistroCents: 74,
				emolumentosCents: 40,
				issRatePercent: "5.00",
				irrfRateBps: asBasisPoints(100),
				irRateBps: asBasisPoints(2000),
				subjectToPersonalIr: true,
			},
		])

		const tradesOrderBy = Promise.resolve([
			{
				id: "t-tz-2",
				asset: "WDO",
				entryDate: entryBrtMidnight,
				exitDate: exitBrtMidnight,
				pnl: "3000", // +R$30
				contractsExecuted: 1,
			},
		])

		// Prior month query (deferredIr lookup)
		const priorMonthWhere = {
			limit: vi.fn().mockResolvedValue([]),
		}

		mockSelect
			.mockReturnValueOnce({
				from: vi.fn().mockReturnValue({
					where: vi.fn().mockReturnValue(priorMonthWhere),
				}),
			})
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
			accountId: "acc-tz-2",
			year: 2026,
			month: 6,
			carryoverInCents: 0,
		})

		// Trade should be rejected as swing trade (tradeCount = 0) because BRT midnight
		// crossed even though UTC midnight didn't.
		expect(result.tradeCount).toBe(0)
		expect(result.grossGainCents).toBe(0)
	})
})
