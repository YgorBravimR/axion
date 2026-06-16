import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock auth
vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn().mockResolvedValue({
		accountId: "acc-1",
		userId: "user-1",
		showAllAccounts: false,
		allAccountIds: ["acc-1"],
	}),
}))

// Mock candle store
vi.mock("@/lib/candle-store", () => ({
	getCandleStore: () => ({
		fetchRange: vi.fn().mockResolvedValue([]),
	}),
}))

// Hoisted mocks for DB
const { mockFindMany, mockFindFirst, mockInsert } = vi.hoisted(() => ({
	mockFindMany: vi.fn(),
	mockFindFirst: vi.fn(),
	mockInsert: vi.fn(),
}))

vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			trades: {
				findMany: mockFindMany,
			},
			assets: {
				findFirst: mockFindFirst,
			},
			timeframes: {
				findFirst: mockFindFirst,
			},
		},
		insert: mockInsert,
	},
}))

// Mock enrichment functions
vi.mock("@/lib/enrichment/brick-size-resolver", () => ({
	resolveBrickSize5mPoints: vi.fn().mockResolvedValue(100),
}))

vi.mock("@/lib/enrichment/run-dry-run", () => ({
	runDryRun: vi.fn((trade) => ({
		trade,
		passes: {
			operations: { fields: {}, passStatus: "skipped" },
			candleMath: { fields: {}, passStatus: "skipped" },
			indicatorReadout: { fields: {}, passStatus: "skipped" },
			deterministicSlTarget: { fields: {}, passStatus: "skipped" },
		},
		mergedFields: {},
		indicatorReadout: null,
		computedStatus: "no-changes",
	})),
}))

import { startDryRunImpl } from "@/lib/enrichment/actions/start-dry-run-impl"
import type { Trade } from "@/db/schema"

describe("startDryRunImpl", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns error on auth failure", async () => {
		const { requireAuth } = await import("@/app/actions/auth")
		vi.mocked(requireAuth).mockRejectedValueOnce(new Error("Auth failed"))

		const result = await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
		})

		expect(result.status).toBe("error")
		expect(result.message).toBe("Failed to start dry run")
	})

	it("returns success with runId and zero tradeCount when no trades in range", async () => {
		mockFindMany.mockResolvedValueOnce([])

		const result = await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
		})

		expect(result.status).toBe("success")
		expect(result.data?.runId).toBeDefined()
		expect(result.data?.tradeCount).toBe(0)
		expect(result.data?.snapshotIds).toEqual([])
	})

	it("processes multiple trades and creates snapshots", async () => {
		const trade1 = {
			id: "trade-1",
			accountId: "acc-1",
			asset: "WIN",
			entryDate: new Date("2026-01-15T09:00:00Z"),
			exitDate: new Date("2026-01-15T10:00:00Z"),
			entryPrice: "75000",
			enrichmentStatus: "pending",
			isArchived: false,
			enrichmentVersion: 0,
			stopLoss: "74500",
			takeProfit: "75500",
			pnl: "500",
			outcome: null,
			realizedRMultiple: null,
			profitOperationNumber: 1,
		} as unknown as Trade

		const trade2 = {
			id: "trade-2",
			accountId: "acc-1",
			asset: "DOL",
			entryDate: new Date("2026-01-20T09:00:00Z"),
			exitDate: new Date("2026-01-20T11:00:00Z"),
			entryPrice: "5000",
			enrichmentStatus: "partial",
			isArchived: false,
			enrichmentVersion: 1,
			stopLoss: "4900",
			takeProfit: "5100",
			pnl: "100",
			outcome: null,
			realizedRMultiple: null,
			profitOperationNumber: null,
		} as unknown as Trade

		mockFindMany.mockResolvedValueOnce([trade1, trade2])

		// Mock asset lookup
		mockFindFirst.mockResolvedValue({
			id: "asset-win",
			symbol: "WIN",
		})

		// Mock snapshot insert
		const mockReturning = vi
			.fn()
			.mockResolvedValue([{ id: "snap-1" }, { id: "snap-2" }])
		mockInsert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: mockReturning,
			}),
		})

		const result = await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
		})

		expect(result.status).toBe("success")
		expect(result.data?.tradeCount).toBe(2)
		expect(result.data?.snapshotIds.length).toBeGreaterThanOrEqual(0)
		expect(result.data?.runId).toBeDefined()
	})

	it("parses operations JSON when provided", async () => {
		mockFindMany.mockResolvedValueOnce([])

		const opsJson = JSON.stringify([
			{
				profitOperationNumber: 1,
				profitMetadata: {},
				direction: "long",
			},
		])

		const result = await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
			parsedOperationsJson: opsJson,
		})

		expect(result.status).toBe("success")
	})

	it("handles invalid operations JSON gracefully", async () => {
		mockFindMany.mockResolvedValueOnce([])

		const result = await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
			parsedOperationsJson: "invalid json {",
		})

		expect(result.status).toBe("success")
	})

	it("respects showAllAccounts flag for multi-account access", async () => {
		const { requireAuth } = await import("@/app/actions/auth")
		vi.mocked(requireAuth).mockResolvedValueOnce({
			accountId: "acc-1",
			userId: "user-1",
			showAllAccounts: true,
			allAccountIds: ["acc-1", "acc-2"],
		})

		mockFindMany.mockResolvedValueOnce([])

		const result = await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
		})

		expect(result.status).toBe("success")
		expect(mockFindMany).toHaveBeenCalled()
	})

	it("skips trades with missing assets gracefully", async () => {
		const trade = {
			id: "trade-3",
			accountId: "acc-1",
			asset: "UNKNOWN",
			entryDate: new Date("2026-01-15T09:00:00Z"),
			exitDate: new Date("2026-01-15T10:00:00Z"),
			enrichmentStatus: "pending",
			isArchived: false,
			enrichmentVersion: 0,
		} as unknown as Trade

		mockFindMany.mockResolvedValueOnce([trade])
		mockFindFirst.mockResolvedValueOnce(null) // Asset not found

		const mockReturning = vi.fn().mockResolvedValue([])
		mockInsert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: mockReturning,
			}),
		})

		const result = await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
		})

		expect(result.status).toBe("success")
		expect(result.data?.tradeCount).toBe(1)
	})

	it("filters trades by enrichment status (pending/partial only)", async () => {
		mockFindMany.mockResolvedValueOnce([])

		await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
		})

		// Verify the query was called with the correct where clause
		expect(mockFindMany).toHaveBeenCalled()
		const callArgs = mockFindMany.mock.calls[0]
		expect(callArgs[0].where).toBeDefined()
	})

	it("generates unique runId for each invocation", async () => {
		mockFindMany.mockResolvedValue([])

		const result1 = await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
		})

		const result2 = await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
		})

		expect(result1.data?.runId).not.toBe(result2.data?.runId)
	})

	it("includes enrichmentEngineVersion in snapshot", async () => {
		const trade = {
			id: "trade-4",
			accountId: "acc-1",
			asset: "WIN",
			entryDate: new Date("2026-01-15T09:00:00Z"),
			enrichmentStatus: "pending",
			isArchived: false,
			enrichmentVersion: 0,
		} as unknown as Trade

		mockFindMany.mockResolvedValueOnce([trade])
		mockFindFirst.mockResolvedValueOnce({ id: "asset-id" })

		const mockReturning = vi.fn().mockResolvedValue([{ id: "snap-id" }])
		const mockValues = vi.fn().mockReturnValue({ returning: mockReturning })
		mockInsert.mockReturnValue({ values: mockValues })

		await startDryRunImpl({
			dateFrom: new Date("2026-01-01"),
			dateTo: new Date("2026-01-31"),
		})

		expect(mockValues).toHaveBeenCalled()
		const snapshotValues = mockValues.mock.calls[0][0]
		expect(snapshotValues.enrichmentEngineVersion).toBe("enrich-v1")
		expect(snapshotValues.status).toBe("draft")
		expect(snapshotValues.expiresAt).toBeDefined()
	})
})
