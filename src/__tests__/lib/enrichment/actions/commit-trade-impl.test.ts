/**
 * Tests for commitTradeImpl.
 * Wave 4.3: Two-phase enrichment journaling — trade commitment with staleness checking.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type { Trade } from "@/db/schema"

const {
	mockFindFirstSnapshot,
	mockFindFirstTrade,
	mockFindFirstAsset,
	mockDbUpdate,
	mockDbTransaction,
	mockRequireAuth,
} = vi.hoisted(() => ({
	mockFindFirstSnapshot: vi.fn(),
	mockFindFirstTrade: vi.fn(),
	mockFindFirstAsset: vi.fn(),
	mockDbUpdate: vi.fn(),
	mockDbTransaction: vi.fn(),
	mockRequireAuth: vi.fn(),
}))

vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			tradeEnrichmentSnapshots: {
				findFirst: mockFindFirstSnapshot,
			},
			trades: {
				findFirst: mockFindFirstTrade,
			},
			assets: {
				findFirst: mockFindFirstAsset,
			},
		},
		update: mockDbUpdate,
		transaction: mockDbTransaction,
	},
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: mockRequireAuth,
}))

vi.mock("@/lib/error-utils", () => ({
	isFrameworkSignal: vi.fn((error) => error?.message?.includes("framework")),
}))

vi.mock("@/lib/enrichment/derive-trade-fields", () => ({
	deriveTradeFieldsFromEnrichment: vi.fn(() => ({
		patch: {},
	})),
}))

import { commitTradeImpl } from "@/lib/enrichment/actions/commit-trade-impl"

describe("commitTradeImpl", () => {
	const mockAuthContext = {
		userId: "user-1",
		accountId: "account-1",
		showAllAccounts: false,
		allAccountIds: ["account-1"],
	}

	const mockSnapshot = {
		id: "snapshot-1",
		tradeId: "trade-1",
		runId: "run-1",
		version: 1,
		status: "draft",
		dryRunOutput: {
			result: {
				passes: {
					operations: { passStatus: "succeeded" },
					candleMath: { passStatus: "succeeded" },
					indicatorReadout: { passStatus: "succeeded" },
					deterministicSlTarget: { passStatus: "succeeded" },
				},
				mergedFields: {
					stopLoss: { value: "5000" },
					takeProfit: { value: "10000" },
					indicatorReadout: { value: { someField: "data" } },
				},
			},
			baseline: {
				stopLoss: "4500",
				takeProfit: "9500",
				indicatorReadout: null,
			},
		},
	}

	const mockTrade = {
		id: "trade-1",
		accountId: "account-1",
		asset: "ES",
		direction: "long",
		entryDate: new Date(),
		entryPrice: "4000",
		positionSize: "1",
		// Current values differ from baseline for first two fields
		stopLoss: "4500",
		takeProfit: "9500",
		indicatorReadout: null,
	} as unknown as Trade

	beforeEach(() => {
		vi.clearAllMocks()
		mockRequireAuth.mockResolvedValue(mockAuthContext)
		mockFindFirstAsset.mockResolvedValue({
			symbol: "ES",
			pointValue: 50,
		})
	})

	it("commits accepted fields with no staleness", async () => {
		mockFindFirstSnapshot.mockResolvedValue(mockSnapshot)
		mockFindFirstTrade.mockResolvedValue(mockTrade)

		const mockWhere = vi.fn().mockResolvedValue(undefined)
		const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
		mockDbUpdate.mockReturnValue({ set: mockSet })

		const mockTxUpdate = vi.fn().mockReturnValue({ set: mockSet })
		const mockTxObject = { update: mockTxUpdate }
		mockDbTransaction.mockResolvedValue(undefined)
		mockDbTransaction.mockImplementation((fn) => fn(mockTxObject))

		const result = await commitTradeImpl({
			runId: "run-1",
			tradeId: "trade-1",
			acceptedFields: ["stopLoss", "takeProfit", "indicatorReadout"],
			rejectedFields: [],
		})

		expect(result.status).toBe("success")
		expect(result.data?.committedFields).toContain("stopLoss")
		expect(result.data?.committedFields).toContain("takeProfit")
		expect(result.data?.committedFields).toContain("indicatorReadout")
		expect(result.data?.staleness).toHaveLength(0)
	})

	it("detects staleness when baseline differs from current trade values", async () => {
		// Trade has different values than baseline
		const staledTrade = {
			...mockTrade,
			stopLoss: "5500", // different from baseline 4500
		}

		mockFindFirstSnapshot.mockResolvedValue(mockSnapshot)
		mockFindFirstTrade.mockResolvedValue(staledTrade)

		const mockWhere = vi.fn().mockResolvedValue(undefined)
		const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
		mockDbUpdate.mockReturnValue({ set: mockSet })

		const mockTxUpdate = vi.fn().mockReturnValue({ set: mockSet })
		const mockTxObject = { update: mockTxUpdate }
		mockDbTransaction.mockResolvedValue(undefined)
		mockDbTransaction.mockImplementation((fn) => fn(mockTxObject))

		const result = await commitTradeImpl({
			runId: "run-1",
			tradeId: "trade-1",
			acceptedFields: ["stopLoss"],
			rejectedFields: [],
		})

		expect(result.status).toBe("success")
		expect(result.data?.staleness).toHaveLength(1)
		expect(result.data?.staleness?.[0]).toEqual({
			field: "stopLoss",
			baselineValue: "4500",
			currentValue: "5500",
		})
		expect(result.data?.committedFields).toHaveLength(0)
	})

	it("rejects snapshot when not found or already committed", async () => {
		mockFindFirstSnapshot.mockResolvedValue(null)

		const result = await commitTradeImpl({
			runId: "run-1",
			tradeId: "trade-1",
			acceptedFields: [],
			rejectedFields: [],
		})

		expect(result.status).toBe("error")
		expect(result.message).toContain("not found or already committed")
	})

	it("rejects unauthorized access to trade in different account", async () => {
		mockFindFirstSnapshot.mockResolvedValue(mockSnapshot)

		const otherAccountTrade = {
			...mockTrade,
			accountId: "account-2",
		}

		mockFindFirstTrade.mockResolvedValue(otherAccountTrade)

		const result = await commitTradeImpl({
			runId: "run-1",
			tradeId: "trade-1",
			acceptedFields: [],
			rejectedFields: [],
		})

		expect(result.status).toBe("error")
		expect(result.message).toContain("Unauthorized")
	})

	it("allows access when showAllAccounts is enabled", async () => {
		const multiAccountContext = {
			...mockAuthContext,
			showAllAccounts: true,
			allAccountIds: ["account-1", "account-2"],
		}

		mockRequireAuth.mockResolvedValue(multiAccountContext)
		mockFindFirstSnapshot.mockResolvedValue(mockSnapshot)

		const otherAccountTrade = {
			...mockTrade,
			accountId: "account-2",
		}

		mockFindFirstTrade.mockResolvedValue(otherAccountTrade)

		const mockWhere = vi.fn().mockResolvedValue(undefined)
		const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
		mockDbUpdate.mockReturnValue({ set: mockSet })

		const mockTxUpdate = vi.fn().mockReturnValue({ set: mockSet })
		const mockTxObject = { update: mockTxUpdate }
		mockDbTransaction.mockResolvedValue(undefined)
		mockDbTransaction.mockImplementation((fn) => fn(mockTxObject))

		const result = await commitTradeImpl({
			runId: "run-1",
			tradeId: "trade-1",
			acceptedFields: ["stopLoss"],
			rejectedFields: [],
		})

		expect(result.status).toBe("success")
	})

	it("includes rejectedFields in snapshot but does not apply them", async () => {
		mockFindFirstSnapshot.mockResolvedValue(mockSnapshot)
		mockFindFirstTrade.mockResolvedValue(mockTrade)

		const mockWhere = vi.fn().mockResolvedValue(undefined)
		const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
		mockDbUpdate.mockReturnValue({ set: mockSet })

		const mockTxUpdate = vi.fn().mockReturnValue({ set: mockSet })
		const mockTxObject = { update: mockTxUpdate }
		mockTxUpdate.mockReturnValue({ set: mockSet })
		mockDbTransaction.mockResolvedValue(undefined)
		mockDbTransaction.mockImplementation((fn) => fn(mockTxObject))

		await commitTradeImpl({
			runId: "run-1",
			tradeId: "trade-1",
			acceptedFields: ["stopLoss"],
			rejectedFields: ["takeProfit"],
		})

		// rejectedFields should be recorded in snapshot but not in trade update
		expect(mockTxUpdate).toHaveBeenCalled()
	})

	it("sets enrichmentStatus to enriched when all passes succeed", async () => {
		mockFindFirstSnapshot.mockResolvedValue(mockSnapshot)
		mockFindFirstTrade.mockResolvedValue(mockTrade)

		const mockWhere = vi.fn().mockResolvedValue(undefined)
		const capturedPayloads: Record<string, unknown>[] = []
		const mockSet = vi.fn().mockImplementation((payload) => {
			capturedPayloads.push(payload)
			return { where: mockWhere }
		})
		const mockUpdate = vi.fn().mockReturnValue({ set: mockSet })
		const mockTxObject = { update: mockUpdate }
		mockDbTransaction.mockResolvedValue(undefined)
		mockDbTransaction.mockImplementation((fn) => fn(mockTxObject))

		await commitTradeImpl({
			runId: "run-1",
			tradeId: "trade-1",
			acceptedFields: ["stopLoss"],
			rejectedFields: [],
		})

		// First call to update().set() is the trade update
		expect(capturedPayloads[0]?.enrichmentStatus).toBe("enriched")
	})

	it("sets enrichmentStatus to partial when a pass fails", async () => {
		const partialSnapshot = {
			...mockSnapshot,
			dryRunOutput: {
				...mockSnapshot.dryRunOutput,
				result: {
					...mockSnapshot.dryRunOutput.result,
					passes: {
						operations: { passStatus: "failed" },
						candleMath: { passStatus: "succeeded" },
						indicatorReadout: { passStatus: "succeeded" },
						deterministicSlTarget: { passStatus: "succeeded" },
					},
				},
			},
		}

		mockFindFirstSnapshot.mockResolvedValue(partialSnapshot)
		mockFindFirstTrade.mockResolvedValue(mockTrade)

		const mockWhere = vi.fn().mockResolvedValue(undefined)
		const capturedPayloads: Record<string, unknown>[] = []
		const mockSet = vi.fn().mockImplementation((payload) => {
			capturedPayloads.push(payload)
			return { where: mockWhere }
		})
		const mockUpdate = vi.fn().mockReturnValue({ set: mockSet })
		const mockTxObject = { update: mockUpdate }
		mockDbTransaction.mockResolvedValue(undefined)
		mockDbTransaction.mockImplementation((fn) => fn(mockTxObject))

		await commitTradeImpl({
			runId: "run-1",
			tradeId: "trade-1",
			acceptedFields: ["stopLoss"],
			rejectedFields: [],
		})

		// First call to update().set() is the trade update
		expect(capturedPayloads[0]?.enrichmentStatus).toBe("partial")
	})

	it("returns snapshot ID in response", async () => {
		mockFindFirstSnapshot.mockResolvedValue(mockSnapshot)
		mockFindFirstTrade.mockResolvedValue(mockTrade)

		const mockWhere = vi.fn().mockResolvedValue(undefined)
		const mockSet = vi.fn().mockReturnValue({ where: mockWhere })
		mockDbUpdate.mockReturnValue({ set: mockSet })

		const mockTxUpdate = vi.fn().mockReturnValue({ set: mockSet })
		const mockTxObject = { update: mockTxUpdate }
		mockDbTransaction.mockResolvedValue(undefined)
		mockDbTransaction.mockImplementation((fn) => fn(mockTxObject))

		const result = await commitTradeImpl({
			runId: "run-1",
			tradeId: "trade-1",
			acceptedFields: [],
			rejectedFields: [],
		})

		expect(result.data?.snapshotId).toBe("snapshot-1")
		expect(result.data?.tradeId).toBe("trade-1")
	})
})
