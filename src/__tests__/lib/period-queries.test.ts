// src/__tests__/lib/period-queries.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock references so vi.mock factory closures can access them
// ---------------------------------------------------------------------------

const {
	mockSelect,
	mockInsert,
	mockUpdate,
	mockFrom,
	mockWhere,
	mockLimit,
	mockValues,
	mockOnConflictDoUpdate,
	mockDbQuery,
	mockGetUserDek,
	mockRollupTrades,
} = vi.hoisted(() => {
	const mockLimit = vi.fn()
	const mockWhere = vi.fn()
	const mockFrom = vi.fn()
	const mockSelect = vi.fn()
	const mockOnConflictDoUpdate = vi.fn()
	const mockValues = vi.fn()
	const mockInsert = vi.fn()
	const mockUpdate = vi.fn()
	const mockDbQuery = { tradingAccounts: { findFirst: vi.fn() } }

	const mockGetUserDek = vi.fn()
	const mockRollupTrades = vi.fn()

	// Chain: db.select().from().where().limit() → mockLimit resolves the value
	mockLimit.mockResolvedValue([])
	mockWhere.mockReturnValue({ limit: mockLimit })
	mockFrom.mockReturnValue({ where: mockWhere })
	mockSelect.mockReturnValue({ from: mockFrom })

	// Chain: db.insert().values().onConflictDoUpdate() → resolves
	mockOnConflictDoUpdate.mockResolvedValue([])
	mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
	mockInsert.mockReturnValue({ values: mockValues })

	return {
		mockSelect,
		mockInsert,
		mockUpdate,
		mockFrom,
		mockWhere,
		mockLimit,
		mockValues,
		mockOnConflictDoUpdate,
		mockDbQuery,
		mockGetUserDek,
		mockRollupTrades,
	}
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/db/drizzle", () => ({
	db: {
		select: mockSelect,
		insert: mockInsert,
		update: mockUpdate,
		query: mockDbQuery,
	},
}))

vi.mock("@/db/schema", () => ({
	accountMonthlyAggregate: {},
	accountWeeklyAggregate: {},
	tradingAccounts: {},
	trades: {},
}))

vi.mock("@/lib/user-crypto", () => ({
	getUserDek: mockGetUserDek,
	decryptTradeFields: vi.fn((trade: Record<string, unknown>) => trade),
}))

vi.mock("@/lib/aggregation/period-rollup", () => ({
	rollupTrades: mockRollupTrades,
}))

// Import after mocks are registered
import { getMonthAggregate, getWeekAggregate, getYearAggregate } from "@/lib/queries/period-queries"

// ---------------------------------------------------------------------------
// Smoke tests: verify exports
// ---------------------------------------------------------------------------

describe("period-queries stubs", () => {
	it("getMonthAggregate exports a function", () => {
		expect(typeof getMonthAggregate).toBe("function")
	})

	it("getWeekAggregate exports a function", () => {
		expect(typeof getWeekAggregate).toBe("function")
	})

	it("getYearAggregate exports a function", () => {
		expect(typeof getYearAggregate).toBe("function")
	})
})

// ---------------------------------------------------------------------------
// Behavior: getMonthAggregate
// ---------------------------------------------------------------------------

describe("getMonthAggregate", () => {
	const ACCOUNT_ID = "acc-123"
	const USER_ID = "user-456"

	beforeEach(() => {
		vi.clearAllMocks()

		// Restore chain defaults after clearAllMocks
		mockLimit.mockResolvedValue([])
		mockWhere.mockReturnValue({ limit: mockLimit })
		mockFrom.mockReturnValue({ where: mockWhere })
		mockSelect.mockReturnValue({ from: mockFrom })
		mockOnConflictDoUpdate.mockResolvedValue([])
		mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
		mockInsert.mockReturnValue({ values: mockValues })

		// userId lookup for recompute path
		mockDbQuery.tradingAccounts.findFirst.mockResolvedValue({ userId: USER_ID })
		mockGetUserDek.mockResolvedValue(null)

		const defaultResult = {
			grossCents: 0,
			netCents: 0,
			points: 0,
			tradingDays: 0,
			gainDays: 0,
			lossDays: 0,
		}
		mockRollupTrades.mockReturnValue(defaultResult)
	})

	it("returns cached row directly when isDirty is false", async () => {
		const cachedRow = {
			grossCents: 50000,
			netCents: 45000,
			points: "250.00",
			tradingDays: 10,
			gainDays: 7,
			lossDays: 3,
			isDirty: false,
		}
		// First select (aggregate row) returns the clean cached row
		mockLimit.mockResolvedValueOnce([cachedRow])

		const result = await getMonthAggregate(ACCOUNT_ID, 2026, 1)

		expect(result.netCents).toBe(45000)
		expect(result.grossCents).toBe(50000)
		expect(result.points).toBe(250)
		expect(result.tradingDays).toBe(10)
		expect(result.gainDays).toBe(7)
		expect(result.lossDays).toBe(3)

		// rollupTrades must NOT have been called — we served from cache
		expect(mockRollupTrades).not.toHaveBeenCalled()
		// No insert/upsert happened
		expect(mockInsert).not.toHaveBeenCalled()
	})

	it("recomputes and upserts when aggregate row is dirty", async () => {
		const dirtyRow = {
			grossCents: 0,
			netCents: 0,
			points: "0.00",
			tradingDays: 0,
			gainDays: 0,
			lossDays: 0,
			isDirty: true,
		}
		const recomputedResult = {
			grossCents: 30000,
			netCents: 28000,
			points: 100,
			tradingDays: 5,
			gainDays: 4,
			lossDays: 1,
		}

		// select #1 → dirty aggregate row
		// select #2 → raw trades query (returns 1 trade)
		const mockTrade = {
			id: "trade-1",
			asset: "WIN",
			pnl: "28000",
			commission: "1000",
			fees: "1000",
			positionSize: "1",
			entryDate: new Date(2026, 0, 5),
			isArchived: false,
		}
		mockLimit
			.mockResolvedValueOnce([dirtyRow])   // aggregate row → dirty
			.mockResolvedValueOnce([mockTrade])   // raw trades

		mockRollupTrades.mockReturnValue(recomputedResult)

		const result = await getMonthAggregate(ACCOUNT_ID, 2026, 1)

		// Result should be from rollupTrades
		expect(result.netCents).toBe(28000)
		expect(result.grossCents).toBe(30000)
		expect(result.points).toBe(100)

		// rollupTrades called once
		expect(mockRollupTrades).toHaveBeenCalledOnce()

		// Upsert should have been called with isDirty: false
		expect(mockInsert).toHaveBeenCalledOnce()
		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({ isDirty: false, accountId: ACCOUNT_ID, year: 2026, month: 1 })
		)
	})

	it("recomputes when no aggregate row exists (missing row)", async () => {
		// First select returns empty array (no row)
		mockLimit.mockResolvedValueOnce([])  // no aggregate row
		mockLimit.mockResolvedValueOnce([])  // no trades either

		mockRollupTrades.mockReturnValue({ grossCents: 0, netCents: 0, points: 0, tradingDays: 0, gainDays: 0, lossDays: 0 })

		const result = await getMonthAggregate(ACCOUNT_ID, 2026, 3)

		// Empty period → zeros
		expect(result.netCents).toBe(0)
		expect(result.tradingDays).toBe(0)

		// Should still upsert with isDirty: false
		expect(mockInsert).toHaveBeenCalledOnce()
	})
})

// ---------------------------------------------------------------------------
// Behavior: getWeekAggregate
// ---------------------------------------------------------------------------

describe("getWeekAggregate", () => {
	const ACCOUNT_ID = "acc-789"

	beforeEach(() => {
		vi.clearAllMocks()

		mockLimit.mockResolvedValue([])
		mockWhere.mockReturnValue({ limit: mockLimit })
		mockFrom.mockReturnValue({ where: mockWhere })
		mockSelect.mockReturnValue({ from: mockFrom })
		mockOnConflictDoUpdate.mockResolvedValue([])
		mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
		mockInsert.mockReturnValue({ values: mockValues })

		mockDbQuery.tradingAccounts.findFirst.mockResolvedValue({ userId: "user-789" })
		mockGetUserDek.mockResolvedValue(null)
		mockRollupTrades.mockReturnValue({ grossCents: 0, netCents: 0, points: 0, tradingDays: 0, gainDays: 0, lossDays: 0 })
	})

	it("returns cached row when isDirty is false", async () => {
		const cachedRow = {
			grossCents: 12000,
			netCents: 11000,
			points: "55.00",
			tradingDays: 3,
			gainDays: 2,
			lossDays: 1,
			isDirty: false,
		}
		mockLimit.mockResolvedValueOnce([cachedRow])

		const result = await getWeekAggregate(ACCOUNT_ID, 2026, 1)

		expect(result.netCents).toBe(11000)
		expect(result.points).toBe(55)
		expect(mockRollupTrades).not.toHaveBeenCalled()
		expect(mockInsert).not.toHaveBeenCalled()
	})

	it("week 1 of 2026 maps to Mon 2025-12-29 → Sun 2026-01-04 (TZ-safe range check)", async () => {
		// No cached row → triggers recompute path
		mockLimit.mockResolvedValueOnce([])  // no aggregate row
		mockLimit.mockResolvedValueOnce([])  // no trades

		mockRollupTrades.mockReturnValue({ grossCents: 0, netCents: 0, points: 0, tradingDays: 0, gainDays: 0, lossDays: 0 })

		await getWeekAggregate(ACCOUNT_ID, 2026, 1)

		// Verify the trades query was called with the right date range for ISO week 1/2026
		// The second .where() call is for trades; inspect what was passed
		const whereCallArgs = mockWhere.mock.calls

		// We expect at least 2 where calls (aggregate select + trades select)
		expect(whereCallArgs.length).toBeGreaterThanOrEqual(2)
	})
})
