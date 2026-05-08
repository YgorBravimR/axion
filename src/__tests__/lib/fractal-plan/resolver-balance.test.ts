import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			yearlyPlans: { findFirst: vi.fn() },
			accountCapitalEvents: { findMany: vi.fn() },
			accountMonthlyAggregate: { findMany: vi.fn() },
		},
	},
}))

import { db } from "@/db/drizzle"
import { resolveBalance } from "@/lib/fractal-plan/resolver"

const mockedDb = db as unknown as {
	query: {
		yearlyPlans: { findFirst: ReturnType<typeof vi.fn> }
		accountCapitalEvents: { findMany: ReturnType<typeof vi.fn> }
		accountMonthlyAggregate: { findMany: ReturnType<typeof vi.fn> }
	}
}

describe("resolveBalance", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("throws when no yearly plan exists", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue(undefined)

		await expect(
			resolveBalance({ accountId: "acc-1", date: new Date("2026-05-04") }),
		).rejects.toThrow(/no yearly plan/i)
	})

	it("returns initial capital when no events or aggregates exist", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			initialCapitalCents: 10_000_00,
		})
		mockedDb.query.accountCapitalEvents.findMany.mockResolvedValue([])
		mockedDb.query.accountMonthlyAggregate.findMany.mockResolvedValue([])

		const result = await resolveBalance({
			accountId: "acc-1",
			date: new Date("2026-05-04"),
		})

		expect(result.initialCapitalCents).toBe(10_000_00)
		expect(result.capitalEventsDelta).toBe(0)
		expect(result.realizedPnlDelta).toBe(0)
		expect(result.balanceCents).toBe(10_000_00)
	})

	it("adds deposits and subtracts withdrawals from balance", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			initialCapitalCents: 10_000_00,
		})
		mockedDb.query.accountCapitalEvents.findMany.mockResolvedValue([
			{ eventType: "deposit", amountCents: 2_000_00 },
			{ eventType: "withdrawal", amountCents: 500_00 },
			{ eventType: "deposit", amountCents: 1_000_00 },
		])
		mockedDb.query.accountMonthlyAggregate.findMany.mockResolvedValue([])

		const result = await resolveBalance({
			accountId: "acc-1",
			date: new Date("2026-05-04"),
		})

		expect(result.capitalEventsDelta).toBe(2_500_00)
		expect(result.balanceCents).toBe(12_500_00)
	})

	it("includes aggregates from prior years and prior months of current year, excludes future months", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			initialCapitalCents: 10_000_00,
		})
		mockedDb.query.accountCapitalEvents.findMany.mockResolvedValue([])
		mockedDb.query.accountMonthlyAggregate.findMany.mockResolvedValue([
			{ year: 2025, month: 12, netCents: 3_000_00 },
			{ year: 2026, month: 4, netCents: 1_000_00 },
			{ year: 2026, month: 5, netCents: 500_00 },
			{ year: 2026, month: 6, netCents: 9_999_00 },
			{ year: 2027, month: 1, netCents: 9_999_00 },
		])

		const result = await resolveBalance({
			accountId: "acc-1",
			date: new Date("2026-05-04"),
		})

		expect(result.realizedPnlDelta).toBe(4_500_00)
		expect(result.balanceCents).toBe(14_500_00)
	})

	it("combines initial capital, events, and aggregates", async () => {
		mockedDb.query.yearlyPlans.findFirst.mockResolvedValue({
			id: "y1",
			initialCapitalCents: 10_000_00,
		})
		mockedDb.query.accountCapitalEvents.findMany.mockResolvedValue([
			{ eventType: "deposit", amountCents: 1_500_00 },
		])
		mockedDb.query.accountMonthlyAggregate.findMany.mockResolvedValue([
			{ year: 2026, month: 4, netCents: 800_00 },
		])

		const result = await resolveBalance({
			accountId: "acc-1",
			date: new Date("2026-05-04"),
		})

		expect(result.balanceCents).toBe(12_300_00)
	})
})
