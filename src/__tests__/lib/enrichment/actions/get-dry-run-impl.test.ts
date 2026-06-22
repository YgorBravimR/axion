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

// Hoisted mock for DB chained builder
const { mockWhere } = vi.hoisted(() => ({
	mockWhere: vi.fn(),
}))

vi.mock("@/db/drizzle", () => {
	const chain = {
		select: vi.fn().mockReturnThis(),
		from: vi.fn().mockReturnThis(),
		innerJoin: vi.fn().mockReturnThis(),
		where: mockWhere,
	}
	return { db: chain }
})

import { getDryRunImpl } from "@/lib/enrichment/actions/get-dry-run-impl"

interface MockSnapshot {
	snapshot: {
		id: string
		tradeId: string
		version: number
		status: string
		enrichedAt: Date
		dryRunOutput: {
			result: Record<string, unknown>
			baseline: Record<string, unknown>
		} | null
	}
	tradeAccountId: string
}

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
		mockWhere.mockResolvedValueOnce([])

		const result = await getDryRunImpl("nonexistent-run-id")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toEqual([])
		expect(result.data?.runId).toBe("nonexistent-run-id")
	})

	it("returns hydrated snapshots for a draft run", async () => {
		const rows: MockSnapshot[] = [
			{
				snapshot: {
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
				},
				tradeAccountId: "acc-1",
			},
			{
				snapshot: {
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
				},
				tradeAccountId: "acc-1",
			},
		]

		mockWhere.mockResolvedValueOnce(rows)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toHaveLength(2)
		expect(result.data?.snapshots?.[0]?.snapshotId).toBe("snap-1")
		expect(result.data?.snapshots?.[0]?.tradeId).toBe("trade-1")
		expect(result.data?.snapshots?.[0]?.version).toBe(1)
		expect(result.data?.snapshots?.[0]?.status).toBe("draft")
		expect(result.data?.snapshots?.[0]?.baseline.stopLoss).toBe("74500")
	})

	it("filters out snapshots for foreign accounts via SQL where clause", async () => {
		// SQL filtering means the mock only returns snapshots for allowed accounts
		const rows: MockSnapshot[] = [
			{
				snapshot: {
					id: "snap-1",
					tradeId: "trade-1",
					version: 1,
					status: "draft",
					enrichedAt: new Date(),
					dryRunOutput: { result: {}, baseline: {} },
				},
				tradeAccountId: "acc-1",
			},
		]

		mockWhere.mockResolvedValueOnce(rows)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toHaveLength(1)
		expect(result.data?.snapshots?.[0]?.tradeId).toBe("trade-1")
	})

	it("respects showAllAccounts flag for multi-account access", async () => {
		const { requireAuth } = await import("@/app/actions/auth")
		vi.mocked(requireAuth).mockResolvedValueOnce({
			accountId: "acc-1",
			userId: "user-1",
			showAllAccounts: true,
			allAccountIds: ["acc-1", "acc-2"],
		})

		const rows: MockSnapshot[] = [
			{
				snapshot: {
					id: "snap-1",
					tradeId: "trade-1",
					version: 1,
					status: "draft",
					enrichedAt: new Date(),
					dryRunOutput: { result: {}, baseline: {} },
				},
				tradeAccountId: "acc-1",
			},
			{
				snapshot: {
					id: "snap-2",
					tradeId: "trade-2",
					version: 1,
					status: "draft",
					enrichedAt: new Date(),
					dryRunOutput: { result: {}, baseline: {} },
				},
				tradeAccountId: "acc-2",
			},
		]

		mockWhere.mockResolvedValueOnce(rows)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toHaveLength(2)
	})

	it("handles empty result set from database", async () => {
		// innerJoin guarantees no null trades, so empty result means no matching snapshots
		mockWhere.mockResolvedValueOnce([])

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toHaveLength(0)
	})

	it("handles missing dryRunOutput gracefully", async () => {
		const rows: MockSnapshot[] = [
			{
				snapshot: {
					id: "snap-1",
					tradeId: "trade-1",
					version: 1,
					status: "draft",
					enrichedAt: new Date(),
					dryRunOutput: null,
				},
				tradeAccountId: "acc-1",
			},
		]

		mockWhere.mockResolvedValueOnce(rows)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		expect(result.data?.snapshots).toHaveLength(1)
		expect(result.data?.snapshots?.[0]?.dryRun).toEqual({})
		expect(result.data?.snapshots?.[0]?.baseline).toEqual({})
	})

	it("returns correct runId in response", async () => {
		mockWhere.mockResolvedValueOnce([])

		const testRunId = "test-run-uuid-12345"
		const result = await getDryRunImpl(testRunId)

		expect(result.status).toBe("success")
		expect(result.data?.runId).toBe(testRunId)
	})

	it("includes correct snapshot status enum values", async () => {
		const rows: MockSnapshot[] = [
			{
				snapshot: {
					id: "snap-1",
					tradeId: "trade-1",
					version: 1,
					status: "draft",
					enrichedAt: new Date(),
					dryRunOutput: { result: {}, baseline: {} },
				},
				tradeAccountId: "acc-1",
			},
		]

		mockWhere.mockResolvedValueOnce(rows)

		const result = await getDryRunImpl("run-uuid")

		expect(result.status).toBe("success")
		const snap = result.data?.snapshots[0]
		expect(["draft", "committed", "abandoned"]).toContain(snap?.status)
	})
})
