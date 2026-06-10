import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			trades: {
				findMany: vi.fn(),
			},
		},
	},
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn(),
}))

vi.mock("@/lib/hawks/account-context", () => ({
	getActiveHawksAccount: vi.fn(),
}))

vi.mock("@/lib/effective-date", () => ({
	getServerEffectiveNow: vi.fn(),
}))

vi.mock("@/lib/coaching/hawks-pattern-detector", () => ({
	detectAllHawksPatterns: vi.fn(() => []),
}))

const { db } = await import("@/db/drizzle")
const { requireAuth } = await import("@/app/actions/auth")
const { getActiveHawksAccount } = await import("@/lib/hawks/account-context")
const { getServerEffectiveNow } = await import("@/lib/effective-date")
const { detectAllHawksPatterns } =
	await import("@/lib/coaching/hawks-pattern-detector")
const { getHawksCoachingInsights } =
	await import("@/app/actions/hawks-coaching")

const findMany = vi.mocked(db.query.trades.findMany)
const requireAuthMock = vi.mocked(requireAuth)
const getActiveHawksAccountMock = vi.mocked(getActiveHawksAccount)
const getServerEffectiveNowMock = vi.mocked(getServerEffectiveNow)
const detectAllHawksPatternsMock = vi.mocked(detectAllHawksPatterns)

const buildTradeRow = (
	overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> => ({
	entryDate: new Date("2026-06-01T10:00:00Z"),
	exitDate: new Date("2026-06-01T11:00:00Z"),
	pnl: 100,
	outcome: "win",
	realizedRMultiple: 1.5,
	asset: "WINFUT",
	direction: "long",
	strategy: { name: "Hawks" },
	setupRank: "AA",
	rating: "B",
	followedPlan: true,
	commission: 0,
	fees: 0,
	hawksMetadata: null,
	stopAuditEvents: [],
	...overrides,
})

describe("getHawksCoachingInsights — null hawksMetadata regression", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		requireAuthMock.mockResolvedValue({
			userId: "user-1",
			sessionId: "sess-1",
		} as unknown as Awaited<ReturnType<typeof requireAuth>>)
		getActiveHawksAccountMock.mockResolvedValue({
			accountId: "acct-1",
		} as unknown as Awaited<ReturnType<typeof getActiveHawksAccount>>)
		getServerEffectiveNowMock.mockResolvedValue(
			new Date("2026-06-10T00:00:00Z")
		)
		detectAllHawksPatternsMock.mockReturnValue([])
	})

	it("does not throw when a trade row has null hawksMetadata (sentry PROFIT-JOURNAL-C)", async () => {
		findMany.mockResolvedValue([
			buildTradeRow({ hawksMetadata: null }),
		] as never)

		const result = await getHawksCoachingInsights(90)

		expect(result.status).toBe("success")
		if (result.status !== "success") {
			throw new Error("expected success result")
		}
		expect(result.data.tradeCount).toBe(1)

		const passedTrades = detectAllHawksPatternsMock.mock.calls[0]?.[0]
		expect(passedTrades).toBeDefined()
		expect(passedTrades?.[0]?.tripleScreenConfirmed).toBe(false)
		expect(passedTrades?.[0]?.biasAtEntry).toBe("neutral")
		expect(passedTrades?.[0]?.dailyTradeOrdinal).toBe(0)
	})

	it("uses present hawksMetadata values when populated", async () => {
		findMany.mockResolvedValue([
			buildTradeRow({
				hawksMetadata: {
					tripleScreenConfirmed: true,
					biasAtEntry: "long",
					dailyTradeOrdinal: 3,
				},
			}),
		] as never)

		const result = await getHawksCoachingInsights(90)

		expect(result.status).toBe("success")
		const passedTrades = detectAllHawksPatternsMock.mock.calls[0]?.[0]
		expect(passedTrades?.[0]?.tripleScreenConfirmed).toBe(true)
		expect(passedTrades?.[0]?.biasAtEntry).toBe("long")
		expect(passedTrades?.[0]?.dailyTradeOrdinal).toBe(3)
	})

	it("handles a mix of trades with and without hawksMetadata", async () => {
		findMany.mockResolvedValue([
			buildTradeRow({ hawksMetadata: null }),
			buildTradeRow({
				hawksMetadata: {
					tripleScreenConfirmed: true,
					biasAtEntry: "short",
					dailyTradeOrdinal: 2,
				},
			}),
		] as never)

		const result = await getHawksCoachingInsights(90)

		expect(result.status).toBe("success")
		if (result.status !== "success") {
			throw new Error("expected success result")
		}
		expect(result.data.tradeCount).toBe(2)
	})
})
