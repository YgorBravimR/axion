/**
 * Tests for backfillTradesForAccount.
 * Phase 3 Task 9.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import type * as RSnapshot from "@/lib/fractal-plan/r-snapshot"

const { mockSelect, mockCaptureROnEntry, mockDbUpdate } = vi.hoisted(() => ({
	mockSelect: vi.fn(),
	mockCaptureROnEntry: vi.fn(),
	mockDbUpdate: vi.fn(),
}))

vi.mock("@/db/drizzle", () => {
	const mockWhere = vi.fn()
	const mockOrderBy = vi.fn().mockResolvedValue([])
	mockWhere.mockReturnValue({ orderBy: mockOrderBy })
	mockSelect.mockReturnValue({
		from: vi.fn().mockReturnValue({ where: mockWhere }),
	})
	return {
		db: {
			select: mockSelect,
			update: mockDbUpdate,
		},
	}
})

vi.mock("@/lib/fractal-plan/r-snapshot", async (importOriginal) => {
	const actual = await importOriginal<typeof RSnapshot>()
	return { ...actual, captureROnEntry: mockCaptureROnEntry }
})

import { backfillTradesForAccount } from "@/lib/fractal-plan/backfill-trades"

describe("backfillTradesForAccount", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("populates oneRSnapshotCents on rows where it is null", async () => {
		const fakeRows = [
			{
				id: "t1",
				entryDate: new Date("2026-01-10"),
				pnl: "50000",
				oneRSnapshotCents: null,
				rOutcome: null,
			},
			{
				id: "t2",
				entryDate: new Date("2026-01-11"),
				pnl: "75000",
				oneRSnapshotCents: null,
				rOutcome: null,
			},
			{
				id: "t3",
				entryDate: new Date("2026-01-12"),
				pnl: "-10000",
				oneRSnapshotCents: null,
				rOutcome: null,
			},
		]

		const mockOrderBy = vi.fn().mockResolvedValue(fakeRows)
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockSelect.mockReturnValue({ from: mockFrom })

		const mockSetWhere = vi.fn().mockResolvedValue([])
		const mockSet = vi.fn().mockReturnValue({ where: mockSetWhere })
		mockDbUpdate.mockReturnValue({ set: mockSet })

		mockCaptureROnEntry.mockResolvedValue(50000)

		const result = await backfillTradesForAccount({
			accountId: "acc-1",
			dryRun: false,
		})
		expect(result.scanned).toBe(3)
		expect(result.wrote).toBe(3)
		expect(mockCaptureROnEntry).toHaveBeenCalledTimes(3)
	})

	it("computes rOutcome from pnl / oneRSnapshotCents when both present", async () => {
		const fakeRows = [
			{
				id: "t1",
				entryDate: new Date("2026-01-10"),
				pnl: "75000",
				oneRSnapshotCents: null,
				rOutcome: null,
			},
		]

		const mockOrderBy = vi.fn().mockResolvedValue(fakeRows)
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockSelect.mockReturnValue({ from: mockFrom })

		let capturedUpdate: { rOutcome?: string } | null = null
		const mockSetWhere = vi.fn().mockResolvedValue([])
		const mockSet = vi.fn().mockImplementation((updates) => {
			capturedUpdate = updates
			return { where: mockSetWhere }
		})
		mockDbUpdate.mockReturnValue({ set: mockSet })

		mockCaptureROnEntry.mockResolvedValue(50000) // pnl=75000, snapshot=50000 → R=1.50

		await backfillTradesForAccount({ accountId: "acc-1", dryRun: false })
		const update = capturedUpdate as { rOutcome?: string } | null
		expect(update?.rOutcome).toBe("1.50")
	})

	it("returns count of rows modified in dryRun mode without writing", async () => {
		const fakeRows = [
			{
				id: "t1",
				entryDate: new Date("2026-01-10"),
				pnl: "50000",
				oneRSnapshotCents: null,
				rOutcome: null,
			},
			{
				id: "t2",
				entryDate: new Date("2026-01-11"),
				pnl: "75000",
				oneRSnapshotCents: null,
				rOutcome: null,
			},
			{
				id: "t3",
				entryDate: new Date("2026-01-12"),
				pnl: "-10000",
				oneRSnapshotCents: null,
				rOutcome: null,
			},
		]

		const mockOrderBy = vi.fn().mockResolvedValue(fakeRows)
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockSelect.mockReturnValue({ from: mockFrom })

		mockCaptureROnEntry.mockResolvedValue(50000)

		const result = await backfillTradesForAccount({
			accountId: "acc-1",
			dryRun: true,
		})
		expect(result.wouldWrite).toBe(3)
		expect(result.wrote).toBe(0)
		expect(mockDbUpdate).not.toHaveBeenCalled()
	})

	it("skips rows where captureROnEntry returns null", async () => {
		const fakeRows = [
			{
				id: "t1",
				entryDate: new Date("2026-01-10"),
				pnl: "50000",
				oneRSnapshotCents: null,
				rOutcome: null,
			},
		]

		const mockOrderBy = vi.fn().mockResolvedValue(fakeRows)
		const mockWhere = vi.fn().mockReturnValue({ orderBy: mockOrderBy })
		const mockFrom = vi.fn().mockReturnValue({ where: mockWhere })
		mockSelect.mockReturnValue({ from: mockFrom })

		mockCaptureROnEntry.mockResolvedValue(null)

		const result = await backfillTradesForAccount({
			accountId: "acc-1",
			dryRun: false,
		})
		expect(result.wrote).toBe(0)
		expect(mockDbUpdate).not.toHaveBeenCalled()
	})
})
