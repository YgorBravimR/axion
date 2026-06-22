/**
 * Tests for `src/lib/ai-assistant/budget.ts`.
 *
 * Strategy: mock @/db/drizzle so each test wires the exact query-builder
 * terminal it cares about (config read, usage read, usage upsert). Vitest
 * `vi.useFakeTimers()` pins the clock so year-month boundary tests are
 * deterministic.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const { configSelectMock, usageSelectMock, insertMock } = vi.hoisted(() => ({
	configSelectMock: vi.fn(),
	usageSelectMock: vi.fn(),
	insertMock: vi.fn(),
}))

// Route each select to its own mock based on the "from" target. We use a
// pair of nested no-op chains; the call-count and call-args on the mocked
// terminal `limit()` is what the assertion checks.
vi.mock("@/db/drizzle", () => ({
	db: {
		select: () => ({
			from: (table: { __tag?: string }) => {
				const isConfig = table?.__tag === "config"
				return {
					where: () => ({
						limit: isConfig ? configSelectMock : usageSelectMock,
					}),
				}
			},
		}),
		insert: insertMock,
	},
}))

vi.mock("@/db/schema", () => ({
	aiAssistantConfig: {
		__tag: "config",
		id: "id",
		monthlyCostCapCents: "monthly_cost_cap_cents",
	},
	aiAssistantUsage: {
		__tag: "usage",
		userId: "user_id",
		yearMonth: "year_month",
		costCents: "cost_cents",
		tokensIn: "tokens_in",
		tokensOut: "tokens_out",
		messageCount: "message_count",
	},
}))

import {
	assertWithinBudget,
	currentYearMonth,
	getCapCents,
	getMonthlySpend,
	recordSpend,
} from "@/lib/ai-assistant/budget"

describe("currentYearMonth", () => {
	beforeEach(() => {
		vi.useFakeTimers()
	})
	afterEach(() => {
		vi.useRealTimers()
	})

	it("returns YYYY-MM in UTC", () => {
		vi.setSystemTime(new Date("2026-06-22T12:34:56Z"))
		expect(currentYearMonth()).toBe("2026-06")
	})

	it("pads single-digit months", () => {
		vi.setSystemTime(new Date("2026-01-01T00:00:00Z"))
		expect(currentYearMonth()).toBe("2026-01")
	})

	it("month-boundary midnight UTC bumps to next month", () => {
		vi.setSystemTime(new Date("2026-12-31T23:59:59Z"))
		expect(currentYearMonth()).toBe("2026-12")
		vi.setSystemTime(new Date("2027-01-01T00:00:00Z"))
		expect(currentYearMonth()).toBe("2027-01")
	})
})

describe("getCapCents", () => {
	beforeEach(() => {
		configSelectMock.mockReset()
	})

	it("returns the configured cap when the row exists", async () => {
		configSelectMock.mockResolvedValueOnce([{ monthlyCostCapCents: 1000 }])
		expect(await getCapCents()).toBe(1000)
	})

	it("falls back to DEFAULT_CAP_CENTS (500) when no row", async () => {
		configSelectMock.mockResolvedValueOnce([])
		expect(await getCapCents()).toBe(500)
	})
})

describe("getMonthlySpend", () => {
	beforeEach(() => {
		usageSelectMock.mockReset()
	})

	it("returns the user's accumulated spend for the current month", async () => {
		usageSelectMock.mockResolvedValueOnce([{ costCents: 237 }])
		expect(await getMonthlySpend("u-1")).toBe(237)
	})

	it("returns 0 when the user has no row this month (first turn)", async () => {
		usageSelectMock.mockResolvedValueOnce([])
		expect(await getMonthlySpend("u-1")).toBe(0)
	})
})

describe("assertWithinBudget", () => {
	beforeEach(() => {
		configSelectMock.mockReset()
		usageSelectMock.mockReset()
	})

	it("allows when spend is below cap", async () => {
		configSelectMock.mockResolvedValueOnce([{ monthlyCostCapCents: 500 }])
		usageSelectMock.mockResolvedValueOnce([{ costCents: 100 }])
		const result = await assertWithinBudget("u-1")
		expect(result.allowed).toBe(true)
		expect(result.capCents).toBe(500)
		expect(result.spentCents).toBe(100)
	})

	it("denies when spend equals cap (strict less-than gate)", async () => {
		configSelectMock.mockResolvedValueOnce([{ monthlyCostCapCents: 500 }])
		usageSelectMock.mockResolvedValueOnce([{ costCents: 500 }])
		const result = await assertWithinBudget("u-1")
		expect(result.allowed).toBe(false)
	})

	it("denies when spend exceeds cap (e.g. a turn pushed over)", async () => {
		configSelectMock.mockResolvedValueOnce([{ monthlyCostCapCents: 500 }])
		usageSelectMock.mockResolvedValueOnce([{ costCents: 503 }])
		const result = await assertWithinBudget("u-1")
		expect(result.allowed).toBe(false)
	})

	it("falls back to 500 cap when config row is missing (defensive)", async () => {
		configSelectMock.mockResolvedValueOnce([])
		usageSelectMock.mockResolvedValueOnce([{ costCents: 100 }])
		const result = await assertWithinBudget("u-1")
		expect(result.capCents).toBe(500)
		expect(result.allowed).toBe(true)
	})

	it("returns the current year-month in the status", async () => {
		vi.useFakeTimers()
		vi.setSystemTime(new Date("2026-06-22T12:00:00Z"))
		configSelectMock.mockResolvedValueOnce([{ monthlyCostCapCents: 500 }])
		usageSelectMock.mockResolvedValueOnce([{ costCents: 0 }])
		const result = await assertWithinBudget("u-1")
		expect(result.yearMonth).toBe("2026-06")
		vi.useRealTimers()
	})
})

describe("recordSpend", () => {
	beforeEach(() => {
		insertMock.mockReset()
	})

	it("calls insert().values().onConflictDoUpdate() with the right shape", async () => {
		const onConflictDoUpdate = vi.fn().mockResolvedValueOnce(undefined)
		const values = vi.fn().mockReturnValue({ onConflictDoUpdate })
		insertMock.mockReturnValueOnce({ values })

		await recordSpend({
			userId: "u-1",
			costCents: 42,
			tokensIn: 1000,
			tokensOut: 200,
		})

		expect(insertMock).toHaveBeenCalledTimes(1)
		expect(values).toHaveBeenCalledTimes(1)
		const insertedRow = values.mock.calls[0]?.[0]
		expect(insertedRow).toBeDefined()
		expect(insertedRow.userId).toBe("u-1")
		expect(insertedRow.costCents).toBe(42)
		expect(insertedRow.tokensIn).toBe(1000)
		expect(insertedRow.tokensOut).toBe(200)
		expect(insertedRow.messageCount).toBe(1)
		expect(insertedRow.yearMonth).toMatch(/^\d{4}-\d{2}$/)
		expect(onConflictDoUpdate).toHaveBeenCalledTimes(1)
	})
})
