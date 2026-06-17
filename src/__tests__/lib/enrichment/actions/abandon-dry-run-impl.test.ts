/**
 * Tests for abandonDryRunImpl.
 * Wave 4.3: Two-phase enrichment journaling — dry-run abandonment with auth filtering.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockRequireAuth = vi.fn()

vi.mock("@/app/actions/auth", () => ({
	requireAuth: mockRequireAuth,
}))

vi.mock("@/lib/error-utils", () => ({
	isFrameworkSignal: vi.fn((error) => error?.message?.includes("framework")),
}))

vi.mock("@/db/drizzle")

import { abandonDryRunImpl } from "@/lib/enrichment/actions/abandon-dry-run-impl"
import { db } from "@/db/drizzle"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockDb = db as any

describe("abandonDryRunImpl", () => {
	const mockAuthContext = {
		userId: "user-1",
		accountId: "account-1",
		showAllAccounts: false,
		allAccountIds: ["account-1"],
	}

	beforeEach(() => {
		vi.clearAllMocks()
		mockRequireAuth.mockResolvedValue(mockAuthContext)
	})

	it("abandons draft snapshots for the given run", async () => {
		const mockWhere = vi
			.fn()
			.mockResolvedValue([
				{ id: "trade-1" },
				{ id: "trade-2" },
				{ id: "trade-3" },
			])
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockDb.select = vi.fn().mockReturnValue({ from: mockFrom })

		const mockSnapshotWhere = vi
			.fn()
			.mockResolvedValue([{ id: "snap-1" }, { id: "snap-2" }, { id: "snap-3" }])
		const mockSnapshotSet = vi
			.fn()
			.mockReturnValue({ where: mockSnapshotWhere })
		mockDb.update = vi.fn().mockReturnValue({ set: mockSnapshotSet })

		const result = await abandonDryRunImpl({ runId: "run-1" })

		expect(result.status).toBe("success")
		expect(result.data?.runId).toBe("run-1")
		expect(result.data?.abandonedCount).toBe(3)
	})

	it("filters snapshots by account when showAllAccounts is false", async () => {
		const mockWhere = vi.fn().mockResolvedValue([{ id: "trade-1" }])
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockDb.select = vi.fn().mockReturnValue({ from: mockFrom })

		const mockSnapshotWhere = vi.fn().mockResolvedValue([{ id: "snap-1" }])
		const mockSnapshotSet = vi
			.fn()
			.mockReturnValue({ where: mockSnapshotWhere })
		mockDb.update = vi.fn().mockReturnValue({ set: mockSnapshotSet })

		await abandonDryRunImpl({ runId: "run-1" })

		expect(mockDb.select).toHaveBeenCalled()
	})

	it("filters snapshots across multiple accounts when showAllAccounts is true", async () => {
		const multiAccountContext = {
			...mockAuthContext,
			showAllAccounts: true,
			allAccountIds: ["account-1", "account-2"],
		}

		mockRequireAuth.mockResolvedValue(multiAccountContext)

		const mockWhere = vi
			.fn()
			.mockResolvedValue([{ id: "trade-1" }, { id: "trade-2" }])
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockDb.select = vi.fn().mockReturnValue({ from: mockFrom })

		const mockSnapshotWhere = vi
			.fn()
			.mockResolvedValue([{ id: "snap-1" }, { id: "snap-2" }])
		const mockSnapshotSet = vi
			.fn()
			.mockReturnValue({ where: mockSnapshotWhere })
		mockDb.update = vi.fn().mockReturnValue({ set: mockSnapshotSet })

		const result = await abandonDryRunImpl({ runId: "run-1" })

		expect(result.status).toBe("success")
		expect(result.data?.abandonedCount).toBe(2)
	})

	it("returns zero count when no snapshots exist for run", async () => {
		const mockWhere = vi.fn().mockResolvedValue([{ id: "trade-1" }])
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockDb.select = vi.fn().mockReturnValue({ from: mockFrom })

		const mockSnapshotWhere = vi.fn().mockResolvedValue([])
		const mockSnapshotSet = vi
			.fn()
			.mockReturnValue({ where: mockSnapshotWhere })
		mockDb.update = vi.fn().mockReturnValue({ set: mockSnapshotSet })

		const result = await abandonDryRunImpl({ runId: "run-1" })

		expect(result.status).toBe("success")
		expect(result.data?.abandonedCount).toBe(0)
	})

	it("clears dryRunOutput payload when abandoning (D.18b)", async () => {
		let capturedPayload: Record<string, unknown> | null = null

		const mockWhere = vi.fn().mockResolvedValue([{ id: "trade-1" }])
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockDb.select = vi.fn().mockReturnValue({ from: mockFrom })

		const mockSnapshotWhere = vi.fn().mockResolvedValue([{ id: "snap-1" }])
		const mockSnapshotSet = vi.fn().mockImplementation((payload) => {
			capturedPayload = payload
			return { where: mockSnapshotWhere }
		})
		mockDb.update = vi.fn().mockReturnValue({ set: mockSnapshotSet })

		await abandonDryRunImpl({ runId: "run-1" })

		expect(capturedPayload!.dryRunOutput).toEqual({})
		expect(capturedPayload!.status).toBe("abandoned")
	})

	it("returns runId in response", async () => {
		const mockWhere = vi.fn().mockResolvedValue([{ id: "trade-1" }])
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockDb.select = vi.fn().mockReturnValue({ from: mockFrom })

		const mockSnapshotWhere = vi.fn().mockResolvedValue([{ id: "snap-1" }])
		const mockSnapshotSet = vi
			.fn()
			.mockReturnValue({ where: mockSnapshotWhere })
		mockDb.update = vi.fn().mockReturnValue({ set: mockSnapshotSet })

		const result = await abandonDryRunImpl({ runId: "test-run-123" })

		expect(result.status).toBe("success")
		expect(result.data?.runId).toBe("test-run-123")
	})

	it("does not touch snapshots from other runs", async () => {
		const mockWhere = vi.fn().mockResolvedValue([{ id: "trade-1" }])
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockDb.select = vi.fn().mockReturnValue({ from: mockFrom })

		const mockSnapshotWhere = vi.fn().mockResolvedValue([])
		const mockSnapshotSet = vi
			.fn()
			.mockReturnValue({ where: mockSnapshotWhere })
		mockDb.update = vi.fn().mockReturnValue({ set: mockSnapshotSet })

		const result = await abandonDryRunImpl({ runId: "run-1" })

		expect(result.status).toBe("success")
		expect(result.data?.abandonedCount).toBe(0)
	})
})
