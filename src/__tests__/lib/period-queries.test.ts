// src/__tests__/lib/period-queries.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock references so vi.mock factory closures can access them.
//
// Drizzle's query builder is PromiseLike at every chain step. We model that:
//   - .select().from().where()           → awaited directly (returns rows)
//   - .select().from().where().limit(N)  → also awaited (returns rows)
// `mockWhereResolve` drives the direct-await path; `mockLimit` drives the
// terminal .limit(N) path. Aggregate-row reads use .limit(1); trades-range
// reads await `.where()` directly (no row cap by design — silent truncation
// would corrupt aggregates).
// ---------------------------------------------------------------------------

const {
	mockSelect,
	mockInsert,
	mockUpdate,
	mockFrom,
	mockWhere,
	mockLimit,
	mockWhereResolve,
	mockValues,
	mockOnConflictDoUpdate,
	mockDbQuery,
	mockGetUserDek,
	mockRollupTrades,
} = vi.hoisted(() => {
	const mockLimit = vi.fn()
	const mockWhereResolve = vi.fn()
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

	mockLimit.mockResolvedValue([])
	mockWhereResolve.mockResolvedValue([])

	const whereResult = {
		limit: mockLimit,
		then: (
			onFulfilled?: ((value: unknown) => unknown) | null,
			onRejected?: ((reason: unknown) => unknown) | null,
		) => mockWhereResolve().then(onFulfilled, onRejected),
	}
	mockWhere.mockReturnValue(whereResult)
	mockFrom.mockReturnValue({ where: mockWhere })
	mockSelect.mockReturnValue({ from: mockFrom })

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
		mockWhereResolve,
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

import { getMonthAggregate, getWeekAggregate, getYearAggregate } from "@/lib/queries/period-queries"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const restoreChainDefaults = () => {
	mockLimit.mockResolvedValue([])
	mockWhereResolve.mockResolvedValue([])

	const whereResult = {
		limit: mockLimit,
		then: (
			onFulfilled?: ((value: unknown) => unknown) | null,
			onRejected?: ((reason: unknown) => unknown) | null,
		) => mockWhereResolve().then(onFulfilled, onRejected),
	}
	mockWhere.mockReturnValue(whereResult)
	mockFrom.mockReturnValue({ where: mockWhere })
	mockSelect.mockReturnValue({ from: mockFrom })

	mockOnConflictDoUpdate.mockResolvedValue([])
	mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
	mockInsert.mockReturnValue({ values: mockValues })
}

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
		restoreChainDefaults()

		mockDbQuery.tradingAccounts.findFirst.mockResolvedValue({ userId: USER_ID })
		mockGetUserDek.mockResolvedValue(null)

		mockRollupTrades.mockReturnValue({
			grossCents: 0,
			netCents: 0,
			points: 0,
			tradingDays: 0,
			gainDays: 0,
			lossDays: 0,
		})
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
		mockLimit.mockResolvedValueOnce([cachedRow])

		const result = await getMonthAggregate(ACCOUNT_ID, 2026, 1)

		expect(result.netCents).toBe(45000)
		expect(result.grossCents).toBe(50000)
		expect(result.points).toBe(250)
		expect(result.tradingDays).toBe(10)
		expect(result.gainDays).toBe(7)
		expect(result.lossDays).toBe(3)

		expect(mockRollupTrades).not.toHaveBeenCalled()
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
		// aggregate row read uses .limit(1) → mockLimit
		mockLimit.mockResolvedValueOnce([dirtyRow])
		// trades range read awaits .where() directly → mockWhereResolve
		mockWhereResolve.mockResolvedValueOnce([mockTrade])

		mockRollupTrades.mockReturnValue(recomputedResult)

		const result = await getMonthAggregate(ACCOUNT_ID, 2026, 1)

		expect(result.netCents).toBe(28000)
		expect(result.grossCents).toBe(30000)
		expect(result.points).toBe(100)

		expect(mockRollupTrades).toHaveBeenCalledOnce()

		expect(mockInsert).toHaveBeenCalledOnce()
		expect(mockValues).toHaveBeenCalledWith(
			expect.objectContaining({ isDirty: false, accountId: ACCOUNT_ID, year: 2026, month: 1 }),
		)
	})

	it("recomputes when no aggregate row exists (missing row)", async () => {
		mockLimit.mockResolvedValueOnce([])           // no aggregate row
		mockWhereResolve.mockResolvedValueOnce([])    // no trades either

		mockRollupTrades.mockReturnValue({
			grossCents: 0,
			netCents: 0,
			points: 0,
			tradingDays: 0,
			gainDays: 0,
			lossDays: 0,
		})

		const result = await getMonthAggregate(ACCOUNT_ID, 2026, 3)

		expect(result.netCents).toBe(0)
		expect(result.tradingDays).toBe(0)

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
		restoreChainDefaults()

		mockDbQuery.tradingAccounts.findFirst.mockResolvedValue({ userId: "user-789" })
		mockGetUserDek.mockResolvedValue(null)
		mockRollupTrades.mockReturnValue({
			grossCents: 0,
			netCents: 0,
			points: 0,
			tradingDays: 0,
			gainDays: 0,
			lossDays: 0,
		})
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

	it("week 1 of 2026 triggers a trades range query when aggregate is missing", async () => {
		mockLimit.mockResolvedValueOnce([])           // no aggregate row
		mockWhereResolve.mockResolvedValueOnce([])    // no trades

		await getWeekAggregate(ACCOUNT_ID, 2026, 1)

		// Aggregate select + trades select = 2 where calls minimum
		expect(mockWhere.mock.calls.length).toBeGreaterThanOrEqual(2)
		expect(mockInsert).toHaveBeenCalledOnce()
	})
})
