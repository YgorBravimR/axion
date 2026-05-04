import { describe, it, expect, vi } from "vitest"

// ---------------------------------------------------------------------------
// Minimal mocks so the "use server" module resolves without a real DB/auth
// ---------------------------------------------------------------------------

const { dbMock } = vi.hoisted(() => {
	const dbMock = {
		query: {
			yearlyPlans: { findFirst: vi.fn(), findMany: vi.fn() },
			weeklyTargets: { findFirst: vi.fn(), findMany: vi.fn() },
			monthlyPlans: { findFirst: vi.fn(), findMany: vi.fn() },
		},
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
		execute: vi.fn(),
	}
	return { dbMock }
})

vi.mock("@/db/drizzle", () => ({ db: dbMock }))

vi.mock("@/db/schema", () => ({
	yearlyPlans: {},
	weeklyTargets: {},
	monthlyPlans: {},
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn().mockResolvedValue({ accountId: "mock-account-id", userId: "mock-user-id" }),
}))

vi.mock("@/lib/effective-date", () => ({
	getServerEffectiveNow: vi.fn().mockResolvedValue(new Date("2026-01-01")),
}))

vi.mock("@/lib/yearly-plan/capital-ladder", () => ({
	buildCapitalLadder: vi.fn().mockReturnValue([]),
	contractsForBalance: vi.fn().mockReturnValue(1),
}))

vi.mock("@/lib/error-utils", () => ({
	toSafeErrorMessage: vi.fn().mockReturnValue("mock error"),
}))

vi.mock("drizzle-orm", async (importOriginal) => {
	const original = await importOriginal<typeof import("drizzle-orm")>()
	return {
		...original,
		eq: vi.fn(),
		and: vi.fn(),
		sql: vi.fn(),
	}
})

// ---------------------------------------------------------------------------

describe("yearly-plan action exports", () => {
	it("exports all required actions", async () => {
		const mod = await import("@/app/actions/yearly-plan")
		expect(typeof mod.getYearlyPlan).toBe("function")
		expect(typeof mod.upsertYearlyPlan).toBe("function")
		expect(typeof mod.upsertWeeklyTargets).toBe("function")
		expect(typeof mod.syncWeeklyActuals).toBe("function")
		expect(typeof mod.syncCapitalBetweenPlans).toBe("function")
		expect(typeof mod.deleteYearlyPlan).toBe("function")
	})
})
