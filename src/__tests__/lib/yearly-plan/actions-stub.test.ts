import { describe, it, expect, vi } from "vitest"

const { dbMock } = vi.hoisted(() => {
	const dbMock = {
		query: {
			yearlyPlans: { findFirst: vi.fn(), findMany: vi.fn() },
			monthlyRiskConfig: { findFirst: vi.fn(), findMany: vi.fn() },
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
	monthlyRiskConfig: {},
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn().mockResolvedValue({ accountId: "mock-account-id", userId: "mock-user-id" }),
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
	}
})

describe("yearly-plan action exports", () => {
	it("exports syncCapitalBetweenPlans", async () => {
		const mod = await import("@/app/actions/yearly-plan")
		expect(typeof mod.syncCapitalBetweenPlans).toBe("function")
	})
})
