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

// Hoisted mock for DB
const { mockFindMany } = vi.hoisted(() => ({
	mockFindMany: vi.fn(),
}))

vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			tradeEnrichmentSnapshots: {
				findMany: mockFindMany,
			},
		},
	},
}))

import { getDryRunImpl } from "@/lib/enrichment/actions/get-dry-run-impl"

describe("getDryRunImpl", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns error on auth failure", async () => {
		const { requireAuth } = await import("@/app/actions/auth")
		vi.mocked(requireAuth).mockRejectedValueOnce(new Error("Auth failed"))

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("error")
		expect(result.message).toBe("Failed to get dry run snapshots")
	})

	it("returns empty snapshots list when no draft snapshots exist", async () => {
		mockFindMany.mockResolvedValueOnce([])

		const result = await getDryRunImpl("nonexistent-run-id")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toEqual([])
		expect(result.data?.runId).toBe("nonexistent-run-id")
	})

	it("returns hydrated snapshots for a draft run", async () => {
		const snapshots = [
			{
				id: "snap-1",
				tradeId: "trade-1",
				version: 1,
				status: "draft",
				enrichedAt: new Date("2026-01-15T10:00:00Z"),
				dryRunOutput: {
					result: {
						trade: { id: "trade-1" },
						passes: {},
						mergedFields: {},
						computedStatus: "no-changes",
					},
					baseline: {
						stopLoss: "74500",
						takeProfit: "75500",
					},
				},
				trade: {
					id: "trade-1",
					accountId: "acc-1",
				},
			},
			{
				id: "snap-2",
				tradeId: "trade-2",
				version: 1,
				status: "draft",
				enrichedAt: new Date("2026-01-20T11:00:00Z"),
				dryRunOutput: {
					result: {
						trade: { id: "trade-2" },
						passes: {},
						mergedFields: {},
						computedStatus: "partial",
					},
					baseline: {
						stopLoss: "4900",
						takeProfit: "5100",
					},
				},
				trade: {
					id: "trade-2",
					accountId: "acc-1",
				},
			},
		]

		mockFindMany.mockResolvedValueOnce(snapshots)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toHaveLength(2)
		expect(result.data?.snapshots[0].snapshotId).toBe("snap-1")
		expect(result.data?.snapshots[0].tradeId).toBe("trade-1")
		expect(result.data?.snapshots[0].version).toBe(1)
		expect(result.data?.snapshots[0].status).toBe("draft")
		expect(result.data?.snapshots[0].baseline.stopLoss).toBe("74500")
	})

	it("filters out snapshots for foreign accounts", async () => {
		const snapshots = [
			{
				id: "snap-1",
				tradeId: "trade-1",
				version: 1,
				status: "draft",
				enrichedAt: new Date(),
				dryRunOutput: { result: {}, baseline: {} },
				trade: {
					id: "trade-1",
					accountId: "acc-1",
				},
			},
			{
				id: "snap-2",
				tradeId: "trade-2",
				version: 1,
				status: "draft",
				enrichedAt: new Date(),
				dryRunOutput: { result: {}, baseline: {} },
				trade: {
					id: "trade-2",
					accountId: "acc-2", // Foreign account
				},
			},
		]

		mockFindMany.mockResolvedValueOnce(snapshots)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toHaveLength(1)
		expect(result.data?.snapshots[0].tradeId).toBe("trade-1")
	})

	it("respects showAllAccounts flag for multi-account access", async () => {
		const { requireAuth } = await import("@/app/actions/auth")
		vi.mocked(requireAuth).mockResolvedValueOnce({
			accountId: "acc-1",
			userId: "user-1",
			showAllAccounts: true,
			allAccountIds: ["acc-1", "acc-2"],
		})

		const snapshots = [
			{
				id: "snap-1",
				tradeId: "trade-1",
				version: 1,
				status: "draft",
				enrichedAt: new Date(),
				dryRunOutput: { result: {}, baseline: {} },
				trade: { id: "trade-1", accountId: "acc-1" },
			},
			{
				id: "snap-2",
				tradeId: "trade-2",
				version: 1,
				status: "draft",
				enrichedAt: new Date(),
				dryRunOutput: { result: {}, baseline: {} },
				trade: { id: "trade-2", accountId: "acc-2" },
			},
		]

		mockFindMany.mockResolvedValueOnce(snapshots)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toHaveLength(2)
	})

	it("handles null trade reference gracefully", async () => {
		const snapshots = [
			{
				id: "snap-1",
				tradeId: "trade-1",
				version: 1,
				status: "draft",
				enrichedAt: new Date(),
				dryRunOutput: { result: {}, baseline: {} },
				trade: null,
			},
		]

		mockFindMany.mockResolvedValueOnce(snapshots)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toHaveLength(0)
	})

	it("handles missing dryRunOutput gracefully", async () => {
		const snapshots = [
			{
				id: "snap-1",
				tradeId: "trade-1",
				version: 1,
				status: "draft",
				enrichedAt: new Date(),
				dryRunOutput: null,
				trade: { id: "trade-1", accountId: "acc-1" },
			},
		]

		mockFindMany.mockResolvedValueOnce(snapshots)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toHaveLength(1)
		expect(result.data?.snapshots[0].dryRun).toEqual({})
		expect(result.data?.snapshots[0].baseline).toEqual({})
	})

	it("returns correct runId in response", async () => {
		mockFindMany.mockResolvedValueOnce([])

		const testRunId = "test-run-uuid-12345"
		const result = await getDryRunImpl(testRunId)

		expect(result.status).toBe("success")
		expect(result.data?.runId).toBe(testRunId)
	})

	it("includes correct snapshot status enum values", async () => {
		const snapshots = [
			{
				id: "snap-1",
				tradeId: "trade-1",
				version: 1,
				status: "draft",
				enrichedAt: new Date(),
				dryRunOutput: { result: {}, baseline: {} },
				trade: { id: "trade-1", accountId: "acc-1" },
			},
		]

		mockFindMany.mockResolvedValueOnce(snapshots)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		const snap = result.data?.snapshots[0]
		expect(["draft", "committed", "abandoned"]).toContain(snap?.status)
	})
})
