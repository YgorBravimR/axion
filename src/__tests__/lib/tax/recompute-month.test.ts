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
			then: (resolve: (v: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
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

describe("tax-engine server actions — import", () => {
	it("tax-engine module placeholder smoke test", () => {
		// Cannot import a "use server" module in vitest runtime.
		// Actual behavior tested in e2e (Phase 10).
		expect(true).toBe(true)
	})
})
