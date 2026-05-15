import { describe, it, expect, beforeEach, vi } from "vitest"

vi.mock("@/db/drizzle", () => ({
	db: {
		select: vi.fn(),
		query: {
			strategies: {
				findFirst: vi.fn(),
			},
			strategyVersions: {
				findFirst: vi.fn(),
			},
		},
	},
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn(),
}))

vi.mock("@/lib/cache/invalidate", () => ({
	invalidatePlaybookData: vi.fn(),
}))

vi.mock("next-intl/server", () => ({
	getTranslations: () => Promise.resolve((key: string) => key),
}))

vi.mock("@/lib/error-utils", () => ({
	toSafeErrorMessage: (error: unknown) =>
		error instanceof Error ? error.message : "Unknown error",
}))

const { db } = await import("@/db/drizzle")
const { requireAuth } = await import("@/app/actions/auth")
const { getStrategyConditionsRollup } =
	await import("@/app/actions/strategy-conditions")

const userId = "user-1"
const strategyId = "strat-1"
const versionId = "ver-1"
const c1 = "cond-1"
const c2 = "cond-2"

// Default ownership mock — returns the strategy with currentVersion so the
// rollup can resolve the version pin via getCurrentVersionId.
const mockOwnedStrategy = () => {
	vi.mocked(db.query.strategies).findFirst.mockResolvedValue({
		id: strategyId,
		currentVersion: 1,
	} as never)
	vi.mocked(db.query.strategyVersions).findFirst.mockResolvedValue({
		id: versionId,
	} as never)
}

const expectedChain = (rows: unknown[]) => ({
	from: vi.fn().mockReturnValue({
		innerJoin: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				orderBy: vi.fn().mockResolvedValue(rows),
			}),
		}),
	}),
})

const tradeIdsChain = (rows: unknown[]) => ({
	from: vi.fn().mockReturnValue({
		where: vi.fn().mockResolvedValue(rows),
	}),
})

const statsChain = (rows: unknown[]) => ({
	from: vi.fn().mockReturnValue({
		where: vi.fn().mockReturnValue({
			groupBy: vi.fn().mockResolvedValue(rows),
		}),
	}),
})

const hawksChain = (rows: unknown[]) => ({
	from: vi.fn().mockReturnValue({
		innerJoin: vi.fn().mockReturnValue({
			where: vi.fn().mockReturnValue({
				limit: vi.fn().mockResolvedValue(rows),
			}),
		}),
	}),
})

describe("getStrategyConditionsRollup", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(requireAuth).mockResolvedValue({
			userId,
			sessionId: "sess-1",
		} as never)
	})

	it("returns strategyNotFound when ownership check fails", async () => {
		vi.mocked(db.query.strategies).findFirst.mockResolvedValue(
			undefined as never
		)

		const result = await getStrategyConditionsRollup(strategyId)
		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})

	it("returns empty rollup when strategy has conditions but no trades", async () => {
		mockOwnedStrategy()

		vi.mocked(db)
			.select.mockReturnValueOnce(
				expectedChain([
					{
						conditionId: c1,
						conditionName: "RSI cross",
						category: "indicator",
						tier: "mandatory",
						sortOrder: 0,
					},
					{
						conditionId: c2,
						conditionName: "VWAP reclaim",
						category: "price_action",
						tier: "tier_2",
						sortOrder: 1,
					},
				]) as never
			)
			.mockReturnValueOnce(tradeIdsChain([]) as never)

		const result = await getStrategyConditionsRollup(strategyId)

		expect(result.status).toBe("success")
		expect(result.data?.totalTrades).toBe(0)
		expect(result.data?.isHawksStrategy).toBe(false)
		expect(result.data?.conditions).toHaveLength(2)
		expect(result.data?.conditions[0]).toMatchObject({
			conditionId: c1,
			totalRecorded: 0,
			metCount: 0,
			metRate: 0,
		})
	})

	it("merges per-condition stats with expected list and computes metRate", async () => {
		mockOwnedStrategy()

		vi.mocked(db)
			.select.mockReturnValueOnce(
				expectedChain([
					{
						conditionId: c1,
						conditionName: "RSI cross",
						category: "indicator",
						tier: "mandatory",
						sortOrder: 0,
					},
					{
						conditionId: c2,
						conditionName: "VWAP reclaim",
						category: "price_action",
						tier: "tier_2",
						sortOrder: 1,
					},
				]) as never
			)
			.mockReturnValueOnce(
				tradeIdsChain([
					{ id: "t1" },
					{ id: "t2" },
					{ id: "t3" },
					{ id: "t4" },
				]) as never
			)
			.mockReturnValueOnce(
				statsChain([
					{ conditionId: c1, totalRecorded: 4, metCount: 3 },
					{ conditionId: c2, totalRecorded: 4, metCount: 1 },
				]) as never
			)
			.mockReturnValueOnce(hawksChain([]) as never)

		const result = await getStrategyConditionsRollup(strategyId)

		expect(result.status).toBe("success")
		expect(result.data?.totalTrades).toBe(4)
		expect(result.data?.isHawksStrategy).toBe(false)
		expect(result.data?.conditions[0]).toMatchObject({
			conditionId: c1,
			totalRecorded: 4,
			metCount: 3,
			metRate: 0.75,
		})
		expect(result.data?.conditions[1]).toMatchObject({
			conditionId: c2,
			totalRecorded: 4,
			metCount: 1,
			metRate: 0.25,
		})
	})

	it("defaults missing condition stats to zero recorded/met", async () => {
		mockOwnedStrategy()

		vi.mocked(db)
			.select.mockReturnValueOnce(
				expectedChain([
					{
						conditionId: c1,
						conditionName: "RSI cross",
						category: "indicator",
						tier: "mandatory",
						sortOrder: 0,
					},
					{
						conditionId: c2,
						conditionName: "VWAP reclaim",
						category: "price_action",
						tier: "tier_2",
						sortOrder: 1,
					},
				]) as never
			)
			.mockReturnValueOnce(tradeIdsChain([{ id: "t1" }]) as never)
			.mockReturnValueOnce(
				statsChain([
					{ conditionId: c1, totalRecorded: 1, metCount: 1 },
				]) as never
			)
			.mockReturnValueOnce(hawksChain([]) as never)

		const result = await getStrategyConditionsRollup(strategyId)

		expect(result.status).toBe("success")
		expect(result.data?.conditions[1]).toMatchObject({
			conditionId: c2,
			totalRecorded: 0,
			metCount: 0,
			metRate: 0,
		})
	})

	it("flags isHawksStrategy when any trade uses an active hawks account", async () => {
		mockOwnedStrategy()

		vi.mocked(db)
			.select.mockReturnValueOnce(
				expectedChain([
					{
						conditionId: c1,
						conditionName: "RSI cross",
						category: "indicator",
						tier: "mandatory",
						sortOrder: 0,
					},
				]) as never
			)
			.mockReturnValueOnce(tradeIdsChain([{ id: "t1" }]) as never)
			.mockReturnValueOnce(
				statsChain([
					{ conditionId: c1, totalRecorded: 1, metCount: 1 },
				]) as never
			)
			.mockReturnValueOnce(hawksChain([{ id: "t1" }]) as never)

		const result = await getStrategyConditionsRollup(strategyId)

		expect(result.status).toBe("success")
		expect(result.data?.isHawksStrategy).toBe(true)
	})

	it("uses the supplied versionId without calling getCurrentVersionId", async () => {
		// Strategy ownership passes but the strategyVersions lookup should NOT
		// be exercised when the caller pins a version explicitly.
		vi.mocked(db.query.strategies).findFirst.mockResolvedValue({
			id: strategyId,
			currentVersion: 1,
		} as never)
		// Intentionally do NOT mock strategyVersions.findFirst — if the action
		// fell back to getCurrentVersionId the test would fail with a null id.

		const explicitVersionId = "ver-history-7"

		vi.mocked(db)
			.select.mockReturnValueOnce(
				expectedChain([
					{
						conditionId: c1,
						conditionName: "RSI cross",
						category: "indicator",
						tier: "mandatory",
						sortOrder: 0,
					},
				]) as never
			)
			.mockReturnValueOnce(tradeIdsChain([{ id: "t1" }]) as never)
			.mockReturnValueOnce(
				statsChain([
					{ conditionId: c1, totalRecorded: 1, metCount: 1 },
				]) as never
			)
			.mockReturnValueOnce(hawksChain([]) as never)

		const result = await getStrategyConditionsRollup(
			strategyId,
			explicitVersionId
		)

		expect(result.status).toBe("success")
		expect(result.data?.totalTrades).toBe(1)
		expect(
			vi.mocked(db.query.strategyVersions).findFirst
		).not.toHaveBeenCalled()
	})
})
