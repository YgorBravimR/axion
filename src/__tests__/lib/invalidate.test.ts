// src/__tests__/lib/invalidate.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// Hoist mock references so vi.mock factory closures can access them.
//
// Chain: db.insert(table).values(payload).onConflictDoUpdate(opts)
// We need to inspect what `.values()` was called with AND that both upserts
// carry isDirty: true in both the values payload and the conflict-update set.
// ---------------------------------------------------------------------------

const {
	mockInsert,
	mockValues,
	mockOnConflictDoUpdate,
} = vi.hoisted(() => {
	const mockOnConflictDoUpdate = vi.fn()
	const mockValues = vi.fn()
	const mockInsert = vi.fn()

	mockOnConflictDoUpdate.mockResolvedValue([])
	mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
	mockInsert.mockReturnValue({ values: mockValues })

	return {
		mockInsert,
		mockValues,
		mockOnConflictDoUpdate,
	}
})

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock("@/db/drizzle", () => ({
	db: {
		insert: mockInsert,
	},
}))

vi.mock("@/db/schema", () => ({
	accountMonthlyAggregate: { _tag: "monthly" },
	accountWeeklyAggregate: { _tag: "weekly" },
}))

import { invalidateAggregates } from "@/lib/aggregation/invalidate"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const restoreChainDefaults = () => {
	mockOnConflictDoUpdate.mockResolvedValue([])
	mockValues.mockReturnValue({ onConflictDoUpdate: mockOnConflictDoUpdate })
	mockInsert.mockReturnValue({ values: mockValues })
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("invalidateAggregates", () => {
	const ACCOUNT_ID = "acc-test-123"

	beforeEach(() => {
		vi.clearAllMocks()
		restoreChainDefaults()
	})

	it("exports a function", () => {
		expect(typeof invalidateAggregates).toBe("function")
	})

	it("cross-year ISO boundary: Dec 29 2025 → week 1/2026 monthly but stays in month 12/2025", async () => {
		// Mon Dec 29 2025 is ISO week 1 of 2026, but calendar month is December 2025.
		// Use Date.UTC to avoid the ISO date-string UTC-midnight trap.
		const date = new Date(Date.UTC(2025, 11, 29)) // Dec 29 2025 in UTC

		await invalidateAggregates(ACCOUNT_ID, date)

		// Both upserts must have run
		expect(mockInsert).toHaveBeenCalledTimes(2)

		// Gather the two .values(...) call args
		const [monthlyPayload, weeklyPayload] = mockValues.mock.calls.map(
			(call: unknown[]) => call[0] as Record<string, unknown>,
		)

		// Monthly: calendar year 2025, month 12 (December)
		expect(monthlyPayload).toMatchObject({
			accountId: ACCOUNT_ID,
			year: 2025,
			month: 12,
			isDirty: true,
		})

		// Weekly: ISO week-year 2026, week 1 — the cross-year divergence
		expect(weeklyPayload).toMatchObject({
			accountId: ACCOUNT_ID,
			isoYear: 2026,
			isoWeek: 1,
			isDirty: true,
		})
	})

	it("both upserts carry isDirty: true in values AND in onConflictDoUpdate set", async () => {
		const date = new Date(Date.UTC(2025, 11, 29))

		await invalidateAggregates(ACCOUNT_ID, date)

		expect(mockInsert).toHaveBeenCalledTimes(2)

		// Both values() calls carry isDirty: true
		for (const call of mockValues.mock.calls) {
			const payload = call[0] as Record<string, unknown>
			expect(payload.isDirty).toBe(true)
		}

		// Both onConflictDoUpdate() calls carry isDirty: true in .set
		for (const call of mockOnConflictDoUpdate.mock.calls) {
			const opts = call[0] as { set: Record<string, unknown> }
			expect(opts.set.isDirty).toBe(true)
		}
	})

	it("mid-year sanity: May 6 2026 → monthly (2026, 5) + weekly (2026, 19)", async () => {
		// May 6 2026 is ISO week 19 of 2026. Calendar month is May (5).
		const date = new Date(Date.UTC(2026, 4, 6)) // May 6 2026 UTC

		await invalidateAggregates(ACCOUNT_ID, date)

		expect(mockInsert).toHaveBeenCalledTimes(2)

		const [monthlyPayload, weeklyPayload] = mockValues.mock.calls.map(
			(call: unknown[]) => call[0] as Record<string, unknown>,
		)

		expect(monthlyPayload).toMatchObject({
			accountId: ACCOUNT_ID,
			year: 2026,
			month: 5,
			isDirty: true,
		})

		expect(weeklyPayload).toMatchObject({
			accountId: ACCOUNT_ID,
			isoYear: 2026,
			isoWeek: 19,
			isDirty: true,
		})
	})
})
