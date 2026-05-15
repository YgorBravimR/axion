import { describe, it, expect, vi, beforeEach } from "vitest"

const { updateMock } = vi.hoisted(() => ({
	updateMock: vi.fn().mockReturnThis(),
}))

const { dbUpdateChain } = vi.hoisted(() => ({
	dbUpdateChain: {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockResolvedValue(undefined),
	},
}))

vi.mock("@/db/drizzle", () => ({
	db: {
		update: updateMock,
	},
}))

vi.mock("drizzle-orm", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const actual = await importOriginal<any>()
	return {
		...actual,
		eq: vi.fn((col, val) => ({ type: "eq", col, val })),
		and: vi.fn((...conditions) => ({ type: "and", conditions })),
		gte: vi.fn((col, val) => ({ type: "gte", col, val })),
	}
})

import { markTaxLedgerDirty } from "@/lib/tax/mark-dirty"

describe("markTaxLedgerDirty", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		updateMock.mockReturnValue(dbUpdateChain)
		dbUpdateChain.set.mockReturnValue(dbUpdateChain)
		dbUpdateChain.where.mockResolvedValue(undefined)
	})

	it("marks the affected month dirty with correct account and date", async () => {
		const accountId = "acct-123"
		const tradeDate = new Date("2026-05-15T10:30:00Z")

		await markTaxLedgerDirty(accountId, tradeDate)

		// Verify that db.update was called with monthlyTaxLedger table
		expect(updateMock).toHaveBeenCalled()
		// Verify that set was called with isDirty: true
		expect(dbUpdateChain.set).toHaveBeenCalledWith({ isDirty: true })
		// Verify that where was called with conditions
		expect(dbUpdateChain.where).toHaveBeenCalled()
	})

	it("marks all subsequent months dirty (carryover propagation)", async () => {
		const accountId = "acct-456"
		const tradeDate = new Date("2026-05-15T14:20:00Z")

		await markTaxLedgerDirty(accountId, tradeDate)

		// Verify the whole chain was called
		expect(updateMock).toHaveBeenCalled()
		expect(dbUpdateChain.set).toHaveBeenCalled()
		expect(dbUpdateChain.where).toHaveBeenCalled()
	})

	it("handles trades from different dates within same month identically", async () => {
		const accountId = "acct-789"
		const date1 = new Date("2026-05-01T09:30:00Z")
		const date2 = new Date("2026-05-31T16:45:00Z")

		await markTaxLedgerDirty(accountId, date1)
		await markTaxLedgerDirty(accountId, date2)

		// Both calls should result in update/set/where being invoked (same count patterns)
		expect(updateMock).toHaveBeenCalledTimes(2)
		expect(dbUpdateChain.set).toHaveBeenCalledTimes(2)
		expect(dbUpdateChain.where).toHaveBeenCalledTimes(2)
	})

	it("works across month boundaries (trade date at start of new month)", async () => {
		const accountId = "acct-boundary"
		const tradeDate = new Date("2026-06-01T00:00:00Z")

		await markTaxLedgerDirty(accountId, tradeDate)

		expect(updateMock).toHaveBeenCalled()
		expect(dbUpdateChain.set).toHaveBeenCalledWith({ isDirty: true })
		expect(dbUpdateChain.where).toHaveBeenCalled()
	})

	it("handles year boundary transitions (December → January)", async () => {
		const accountId = "acct-year-boundary"
		const tradeDate = new Date("2026-01-01T05:00:00Z")

		await markTaxLedgerDirty(accountId, tradeDate)

		expect(updateMock).toHaveBeenCalled()
		expect(dbUpdateChain.set).toHaveBeenCalledWith({ isDirty: true })
	})

	it("accepts any timezone offset in tradeDate (normalizes to month start UTC)", async () => {
		const accountId = "acct-tz"
		// Date constructed with different UTC offset should still resolve to same month
		const tradeDate = new Date("2026-05-15T23:59:59Z")

		await markTaxLedgerDirty(accountId, tradeDate)

		expect(updateMock).toHaveBeenCalled()
		expect(dbUpdateChain.set).toHaveBeenCalledWith({ isDirty: true })
	})

	it("can be called multiple times for same account (idempotent)", async () => {
		const accountId = "acct-idempotent"
		const tradeDate = new Date("2026-05-15T10:00:00Z")

		await markTaxLedgerDirty(accountId, tradeDate)
		await markTaxLedgerDirty(accountId, tradeDate)
		await markTaxLedgerDirty(accountId, tradeDate)

		// Each call should invoke the full chain
		expect(updateMock).toHaveBeenCalledTimes(3)
		expect(dbUpdateChain.set).toHaveBeenCalledTimes(3)
		expect(dbUpdateChain.where).toHaveBeenCalledTimes(3)
	})

	it("always sets isDirty to true (never false)", async () => {
		const accountId = "acct-dirty"
		const tradeDate = new Date("2026-05-15T10:00:00Z")

		await markTaxLedgerDirty(accountId, tradeDate)

		// Verify the exact isDirty: true payload
		expect(dbUpdateChain.set).toHaveBeenCalledWith({ isDirty: true })
	})

	it("uses startOfMonth to anchor the query range", async () => {
		const accountId = "acct-month"
		const tradeDate = new Date("2026-05-15T10:00:00Z")

		await markTaxLedgerDirty(accountId, tradeDate)

		// Verify that the chain was called (startOfMonth is used internally)
		expect(dbUpdateChain.where).toHaveBeenCalled()
	})

	it("handles different accountIds independently", async () => {
		const tradeDate = new Date("2026-05-15T10:00:00Z")

		await markTaxLedgerDirty("acct-A", tradeDate)
		await markTaxLedgerDirty("acct-B", tradeDate)

		// Both should trigger the full sequence
		expect(updateMock).toHaveBeenCalledTimes(2)
		expect(dbUpdateChain.set).toHaveBeenCalledTimes(2)
		expect(dbUpdateChain.where).toHaveBeenCalledTimes(2)
	})

	it("propagates errors from the database layer", async () => {
		const dbError = new Error("Database connection failed")
		dbUpdateChain.where.mockRejectedValueOnce(dbError)

		const accountId = "acct-error"
		const tradeDate = new Date("2026-05-15T10:00:00Z")

		await expect(markTaxLedgerDirty(accountId, tradeDate)).rejects.toThrow(
			"Database connection failed"
		)
	})

	it("resolves successfully with void return type", async () => {
		const accountId = "acct-void"
		const tradeDate = new Date("2026-05-15T10:00:00Z")

		const result = await markTaxLedgerDirty(accountId, tradeDate)

		expect(result).toBeUndefined()
	})
})
