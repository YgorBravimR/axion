import { describe, it, expect, beforeEach, vi } from "vitest"
import type { ActionResponse } from "@/types"
import type { TradeCondition } from "@/db/schema"

// Mock dependencies before importing the server action
vi.mock("@/db/drizzle", () => ({
	db: {
		delete: vi.fn(),
		insert: vi.fn(),
		query: {
			trades: {
				findFirst: vi.fn(),
			},
		},
		select: vi.fn(),
	},
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn(),
}))

vi.mock("@/lib/error-utils", () => ({
	toSafeErrorMessage: (error: unknown) => {
		if (error instanceof Error) {
			return error.message
		}
		return "Unknown error"
	},
}))

// Now import after all mocks are set up
const { db } = await import("@/db/drizzle")
const { requireAuth } = await import("@/app/actions/auth")
const { setTradeConditions, getTradeConditions } =
	await import("@/app/actions/trade-conditions")

const mockTradeId = "trade-123"
const mockUserId = "user-456"
const mockAccountId = "account-789"
const mockConditionId = "condition-abc"
const mockConditionId2 = "condition-def"

const mockTradeCondition: TradeCondition = {
	tradeId: mockTradeId,
	conditionId: mockConditionId,
	met: true,
	createdAt: new Date(),
}

const mockTradeCondition2: TradeCondition = {
	tradeId: mockTradeId,
	conditionId: mockConditionId2,
	met: false,
	createdAt: new Date(),
}

describe("setTradeConditions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should delete existing conditions and insert new ones when items provided", async () => {
		const mockDeleteChain = {
			where: vi.fn().mockResolvedValue(undefined),
		}
		const mockInsertChain = {
			values: vi.fn().mockReturnValue({
				returning: vi
					.fn()
					.mockResolvedValue([mockTradeCondition, mockTradeCondition2]),
			}),
		}

		vi.mocked(db).delete.mockReturnValue(mockDeleteChain as never)
		vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)
		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			account: { userId: mockUserId },
		} as never)
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
		} as never)

		const items = [
			{ conditionId: mockConditionId, met: true },
			{ conditionId: mockConditionId2, met: false },
		]

		const result = (await setTradeConditions(
			mockTradeId,
			items
		)) as ActionResponse<TradeCondition[]>

		expect(result.status).toBe("success")
		expect(result.data).toHaveLength(2)
		expect(mockDeleteChain.where).toHaveBeenCalled()
	})

	it("should delete existing conditions and return empty array when items is empty", async () => {
		const mockDeleteChain = {
			where: vi.fn().mockResolvedValue(undefined),
		}

		vi.mocked(db).delete.mockReturnValue(mockDeleteChain as never)
		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			account: { userId: mockUserId },
		} as never)
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
		} as never)

		const result = (await setTradeConditions(
			mockTradeId,
			[]
		)) as ActionResponse<TradeCondition[]>

		expect(result.status).toBe("success")
		expect(result.data).toEqual([])
		expect(mockDeleteChain.where).toHaveBeenCalled()
		// Insert should not be called
		expect(vi.mocked(db).insert).not.toHaveBeenCalled()
	})

	it("should return NOT_FOUND when trade does not exist", async () => {
		vi.mocked(db.query.trades).findFirst.mockResolvedValue(null as never)
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
		} as never)

		const items = [{ conditionId: mockConditionId, met: true }]
		const result = (await setTradeConditions(
			mockTradeId,
			items
		)) as ActionResponse<TradeCondition[]>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
		expect(vi.mocked(db).insert).not.toHaveBeenCalled()
	})

	it("should return NOT_FOUND when trade belongs to different user", async () => {
		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			account: { userId: "different-user" },
		} as never)
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
		} as never)

		const items = [{ conditionId: mockConditionId, met: true }]
		const result = (await setTradeConditions(
			mockTradeId,
			items
		)) as ActionResponse<TradeCondition[]>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
		expect(vi.mocked(db).insert).not.toHaveBeenCalled()
	})

	it("should return WRITE_FAILED when requireAuth throws", async () => {
		vi.mocked(requireAuth).mockRejectedValue(new Error("Auth failed") as never)

		const items = [{ conditionId: mockConditionId, met: true }]
		const result = (await setTradeConditions(
			mockTradeId,
			items
		)) as ActionResponse<TradeCondition[]>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("WRITE_FAILED")
	})

	it("should return WRITE_FAILED when insert throws", async () => {
		const mockDeleteChain = {
			where: vi.fn().mockResolvedValue(undefined),
		}
		const mockInsertChain = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockRejectedValue(new Error("Insert failed")),
			}),
		}

		vi.mocked(db).delete.mockReturnValue(mockDeleteChain as never)
		vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)
		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			account: { userId: mockUserId },
		} as never)
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
		} as never)

		const items = [{ conditionId: mockConditionId, met: true }]
		const result = (await setTradeConditions(
			mockTradeId,
			items
		)) as ActionResponse<TradeCondition[]>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("WRITE_FAILED")
	})
})

describe("getTradeConditions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should return trade conditions joined with trading condition names", async () => {
		const mockSelectChain = {
			from: vi.fn().mockReturnValue({
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([
						{
							tradeId: mockTradeId,
							conditionId: mockConditionId,
							met: true,
							createdAt: new Date(),
							name: "Price Above MA",
							category: "indicator",
						},
						{
							tradeId: mockTradeId,
							conditionId: mockConditionId2,
							met: false,
							createdAt: new Date(),
							name: "Volume Confirmation",
							category: "price_action",
						},
					]),
				}),
			}),
		}

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			account: { userId: mockUserId },
		} as never)
		vi.mocked(db).select.mockReturnValue(mockSelectChain as never)
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
		} as never)

		const result = await getTradeConditions(mockTradeId)

		expect(result.status).toBe("success")
		expect(result.data).toHaveLength(2)
		expect(result.data?.[0]).toMatchObject({
			conditionId: mockConditionId,
			met: true,
			name: "Price Above MA",
		})
		expect(result.data?.[1]).toMatchObject({
			conditionId: mockConditionId2,
			met: false,
			name: "Volume Confirmation",
		})
	})

	it("should return empty array when trade has no conditions", async () => {
		const mockSelectChain = {
			from: vi.fn().mockReturnValue({
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockResolvedValue([]),
				}),
			}),
		}

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			account: { userId: mockUserId },
		} as never)
		vi.mocked(db).select.mockReturnValue(mockSelectChain as never)
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
		} as never)

		const result = await getTradeConditions(mockTradeId)

		expect(result.status).toBe("success")
		expect(result.data).toEqual([])
	})

	it("should return NOT_FOUND when trade does not exist", async () => {
		vi.mocked(db.query.trades).findFirst.mockResolvedValue(null as never)
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
		} as never)

		const result = await getTradeConditions(mockTradeId)

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})

	it("should return NOT_FOUND when trade belongs to different user", async () => {
		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			account: { userId: "different-user" },
		} as never)
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
		} as never)

		const result = await getTradeConditions(mockTradeId)

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})

	it("should return FETCH_FAILED when query throws", async () => {
		const mockSelectChain = {
			from: vi.fn().mockReturnValue({
				innerJoin: vi.fn().mockReturnValue({
					where: vi.fn().mockRejectedValue(new Error("Query failed")),
				}),
			}),
		}

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			account: { userId: mockUserId },
		} as never)
		vi.mocked(db).select.mockReturnValue(mockSelectChain as never)
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
		} as never)

		const result = await getTradeConditions(mockTradeId)

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("FETCH_FAILED")
	})
})
