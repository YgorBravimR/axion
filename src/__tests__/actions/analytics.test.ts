import { describe, it, expect, beforeEach, vi } from "vitest"
import type { ActionResponse, OverallStats, DisciplineData } from "@/types"

// Mock dependencies before importing the server action
vi.mock("@/db/drizzle", () => {
	// Chainable stub for `db.select(...).from(...).where(...)` — getRadarChartData
	// now reads starting balances from `tradingAccounts` to anchor the drawdown
	// axis. Default to an empty result so tests that don't care about capital
	// continue to pass; tests that exercise drawdown can override the
	// .where() resolution per-spec.
	const emptySelectChain = {
		from: () => ({
			where: async () => [] as Array<{ startingBalanceCents: number | null }>,
		}),
	}
	return {
		db: {
			query: {
				trades: {
					findMany: vi.fn(),
				},
				settings: {
					findFirst: vi.fn(),
				},
				accountCapitalEvents: {
					findMany: vi.fn(),
				},
			},
			select: vi.fn(() => emptySelectChain),
		},
	}
})

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn(),
}))

vi.mock("@/lib/cache/cached-queries", () => ({
	getCachedAnalyticsDashboard: vi.fn(),
	getCachedDashboardData: vi.fn(),
}))

vi.mock("@/lib/calculations", () => ({
	calculateProfitFactor: (profit: number, loss: number) => {
		if (loss === 0) {
			return profit > 0 ? 5 : 0
		}
		return profit / loss
	},
	calculateWinRate: (wins: number, total: number) => {
		if (total === 0) {
			return 0
		}
		return (wins / total) * 100
	},
}))

vi.mock("next-intl/server", () => ({
	getTranslations: () => async (key: string) => {
		const translations: Record<string, string> = {
			"actions.noTradesFound": "No trades found",
			"actions.statsRetrieved": "Stats retrieved",
			"actions.failedToRetrieveStats": "Failed to retrieve stats",
			"actions.disciplineRetrieved": "Discipline score retrieved",
			"actions.failedToRetrieveDiscipline": "Failed to retrieve discipline",
			"actions.equityCurveRetrieved": "Equity curve retrieved",
			"actions.failedToRetrieveEquityCurve": "Failed to retrieve equity curve",
			"actions.dailyPnLRetrieved": "Daily P&L retrieved",
			"actions.failedToRetrieveDailyPnL": "Failed to retrieve daily P&L",
			"actions.noTradesFoundForDay": "No trades found for day",
			"actions.radarChartDataRetrieved": "Radar chart data retrieved",
			"actions.failedToRetrieveRadarChartData":
				"Failed to retrieve radar chart data",
			"actions.analyticsDashboardRetrieved": "Analytics dashboard retrieved",
			"actions.failedToRetrieveAnalyticsDashboard":
				"Failed to retrieve analytics dashboard",
			"actions.dashboardDataRetrieved": "Dashboard data retrieved",
			"actions.failedToRetrieveDashboardData":
				"Failed to retrieve dashboard data",
		}
		return translations[key] || key
	},
}))

vi.mock("@/lib/error-utils", () => ({
	toSafeErrorMessage: (error: unknown) => {
		if (error instanceof Error) {
			return error.message
		}
		return "Unknown error"
	},
}))

const { db } = await import("@/db/drizzle")
const { requireAuth } = await import("@/app/actions/auth")
const {
	getOverallStats,
	getDisciplineScore,
	getEquityCurve,
	getDailyPnL,
	getRadarChartData,
	getAnalyticsDashboard,
	getDashboardBatch,
} = await import("@/app/actions/analytics")
const { getCachedAnalyticsDashboard, getCachedDashboardData } =
	await import("@/lib/cache/cached-queries")

const mockUserId = "user-123"
const mockAccountId = "account-456"

const createMockTrade = (overrides = {}) => ({
	id: "trade-1",
	userId: mockUserId,
	accountId: mockAccountId,
	asset: "WINQ23",
	direction: "long" as const,
	entryDate: new Date("2026-05-15"),
	exitDate: new Date("2026-05-16"),
	entryPrice: 1000,
	exitPrice: 1100,
	quantity: 1,
	pnl: 10000, // R$100.00 net P&L (in cents)
	commission: 500, // R$5.00
	fees: 200, // R$2.00
	outcome: "win" as const,
	realizedRMultiple: 2.5,
	followedPlan: true,
	isArchived: false,
	timeframeId: "1h",
	strategyId: "strategy-1",
	strategyVersionId: "v1",
	createdAt: new Date(),
	...overrides,
})

describe("Analytics Server Actions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
			accountId: mockAccountId,
			allAccountIds: [mockAccountId],
			showAllAccounts: false,
		} as never)
	})

	describe("getOverallStats", () => {
		it("should return empty stats when no trades found", async () => {
			vi.mocked(db.query.trades).findMany.mockResolvedValue([] as never)

			const result = (await getOverallStats()) as ActionResponse<OverallStats>

			expect(result.status).toBe("success")
			expect(result.data?.totalTrades).toBe(0)
			expect(result.data?.grossPnl).toBe(0)
			expect(result.data?.netPnl).toBe(0)
			expect(result.data?.winRate).toBe(0)
		})

		it("should calculate stats correctly with single winning trade", async () => {
			const mockTrade = createMockTrade()
			vi.mocked(db.query.trades).findMany.mockResolvedValue([
				mockTrade,
			] as never)

			const result = (await getOverallStats()) as ActionResponse<OverallStats>

			expect(result.status).toBe("success")
			expect(result.data?.totalTrades).toBe(1)
			expect(result.data?.winCount).toBe(1)
			expect(result.data?.lossCount).toBe(0)
			expect(result.data?.netPnl).toBe(100) // 10000 cents = R$100.00
			expect(result.data?.totalFees).toBe(7) // 500 + 200 = 700 cents = R$7.00
			expect(result.data?.grossPnl).toBe(107) // 100 + 7
			expect(result.data?.winRate).toBe(100)
			expect(result.data?.averageR).toBe(2.5)
		})

		it("should calculate profit factor with winning and losing trades", async () => {
			const winTrade = createMockTrade({ pnl: 10000, outcome: "win" })
			const lossTrade = createMockTrade({
				id: "trade-2",
				pnl: -5000,
				outcome: "loss",
				realizedRMultiple: -1.0,
			})

			vi.mocked(db.query.trades).findMany.mockResolvedValue([
				winTrade,
				lossTrade,
			] as never)

			const result = (await getOverallStats()) as ActionResponse<OverallStats>

			expect(result.status).toBe("success")
			expect(result.data?.totalTrades).toBe(2)
			expect(result.data?.winCount).toBe(1)
			expect(result.data?.lossCount).toBe(1)
			expect(result.data?.netPnl).toBe(50) // 100 - 50 net P&L
			// Gross profit = 100, Gross loss = 50, Profit factor = 2
			expect(result.data?.profitFactor).toBe(2)
		})

		it("should handle breakeven trades", async () => {
			const trade = createMockTrade({
				pnl: 0,
				outcome: "breakeven",
				realizedRMultiple: null,
			})
			vi.mocked(db.query.trades).findMany.mockResolvedValue([trade] as never)

			const result = (await getOverallStats()) as ActionResponse<OverallStats>

			expect(result.status).toBe("success")
			expect(result.data?.breakevenCount).toBe(1)
			expect(result.data?.netPnl).toBe(0)
		})

		it("should apply date filters when provided", async () => {
			const dateFrom = new Date("2026-05-01")
			const dateTo = new Date("2026-05-31")
			const mockTrade = createMockTrade()

			vi.mocked(db.query.trades).findMany.mockResolvedValue([
				mockTrade,
			] as never)

			await getOverallStats(dateFrom, dateTo)

			expect(vi.mocked(db.query.trades).findMany).toHaveBeenCalledWith(
				expect.objectContaining({
					where: expect.anything(),
				})
			)
		})

		it("should return error when DB query fails", async () => {
			const error = new Error("Database connection failed")
			vi.mocked(db.query.trades).findMany.mockRejectedValue(error as never)

			const result = (await getOverallStats()) as ActionResponse<OverallStats>

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("FETCH_FAILED")
			expect(result.errors?.[0]?.detail).toContain("Database connection failed")
		})

		it("should require authentication", async () => {
			vi.mocked(requireAuth).mockRejectedValue(
				new Error("Not authenticated") as never
			)

			const result = (await getOverallStats()) as ActionResponse<OverallStats>

			expect(result.status).toBe("error")
			expect(vi.mocked(requireAuth)).toHaveBeenCalled()
		})
	})

	describe("getDisciplineScore", () => {
		it("should return zero score when no trades have plan data", async () => {
			const trade = createMockTrade({ followedPlan: null })
			vi.mocked(db.query.trades).findMany.mockResolvedValue([trade] as never)

			const result =
				(await getDisciplineScore()) as ActionResponse<DisciplineData>

			expect(result.status).toBe("success")
			expect(result.data?.score).toBe(0)
			expect(result.data?.totalTrades).toBe(0)
		})

		it("should calculate discipline score correctly", async () => {
			const followedTrade = createMockTrade({ followedPlan: true })
			const missedTrade = createMockTrade({
				id: "trade-2",
				followedPlan: false,
			})

			vi.mocked(db.query.trades).findMany.mockResolvedValue([
				followedTrade,
				missedTrade,
			] as never)

			const result =
				(await getDisciplineScore()) as ActionResponse<DisciplineData>

			expect(result.status).toBe("success")
			expect(result.data?.score).toBe(50)
			expect(result.data?.followedCount).toBe(1)
			expect(result.data?.totalTrades).toBe(2)
		})

		it("should return 100% discipline when all trades followed plan", async () => {
			const trade1 = createMockTrade({ followedPlan: true })
			const trade2 = createMockTrade({ id: "trade-2", followedPlan: true })

			vi.mocked(db.query.trades).findMany.mockResolvedValue([
				trade1,
				trade2,
			] as never)

			const result =
				(await getDisciplineScore()) as ActionResponse<DisciplineData>

			expect(result.status).toBe("success")
			expect(result.data?.score).toBe(100)
		})

		it("should include trend analysis in discipline data", async () => {
			const trades = Array.from({ length: 15 }, (_, i) =>
				createMockTrade({
					id: `trade-${i}`,
					followedPlan: i < 10,
				})
			)
			vi.mocked(db.query.trades).findMany.mockResolvedValue(trades as never)

			const result =
				(await getDisciplineScore()) as ActionResponse<DisciplineData>

			expect(result.status).toBe("success")
			expect(result.data?.trend).toBeOneOf(["up", "down", "stable"])
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockRejectedValue(
				new Error("Query error") as never
			)

			const result =
				(await getDisciplineScore()) as ActionResponse<DisciplineData>

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("FETCH_FAILED")
		})
	})

	describe("getEquityCurve", () => {
		beforeEach(() => {
			vi.mocked(db.query.accountCapitalEvents).findMany.mockResolvedValue(
				[] as never
			)
		})

		it("should return empty equity curve when no trades found", async () => {
			vi.mocked(db.query.trades).findMany.mockResolvedValue([] as never)
			vi.mocked(db.query.settings).findFirst.mockResolvedValue(null as never)

			const result = await getEquityCurve(undefined, undefined, "trade")

			expect(result.status).toBe("success")
			expect(result.data).toEqual([])
		})

		it("should build trade-mode equity curve with per-trade points", async () => {
			const trade1 = createMockTrade({
				id: "trade-1",
				pnl: 5000,
				entryDate: new Date("2026-05-15T10:00:00Z"),
			})
			const trade2 = createMockTrade({
				id: "trade-2",
				pnl: 3000,
				entryDate: new Date("2026-05-15T11:00:00Z"),
			})

			vi.mocked(db.query.trades).findMany.mockResolvedValue([
				trade1,
				trade2,
			] as never)
			vi.mocked(db.query.settings).findFirst.mockResolvedValue(null as never)

			const result = await getEquityCurve(undefined, undefined, "trade")

			expect(result.status).toBe("success")
			expect(result.data).toHaveLength(2)
			expect(result.data?.[0]?.equity).toBe(50) // 5000 cents
			expect(result.data?.[0]?.tradeNumber).toBe(1)
			expect(result.data?.[1]?.equity).toBe(80) // 5000 + 3000
			expect(result.data?.[1]?.tradeNumber).toBe(2)
		})

		it("should build daily-mode equity curve aggregating by date", async () => {
			const trade1 = createMockTrade({
				pnl: 5000,
				entryDate: new Date("2026-05-15T10:00:00Z"),
			})
			const trade2 = createMockTrade({
				id: "trade-2",
				pnl: 3000,
				entryDate: new Date("2026-05-15T11:00:00Z"),
			})

			vi.mocked(db.query.trades).findMany.mockResolvedValue([
				trade1,
				trade2,
			] as never)
			vi.mocked(db.query.settings).findFirst.mockResolvedValue(null as never)

			const result = await getEquityCurve(undefined, undefined, "daily")

			expect(result.status).toBe("success")
			// Both trades on same day should be aggregated to 1 point
			expect(result.data).toHaveLength(1)
			expect(result.data?.[0]?.equity).toBe(80) // 5000 + 3000 = 8000 cents = 80
		})

		it("should calculate drawdown from peak equity", async () => {
			const trade1 = createMockTrade({ pnl: 10000 })
			const trade2 = createMockTrade({
				id: "trade-2",
				pnl: -3000,
			})

			vi.mocked(db.query.trades).findMany.mockResolvedValue([
				trade1,
				trade2,
			] as never)
			vi.mocked(db.query.settings).findFirst.mockResolvedValue(null as never)

			const result = await getEquityCurve(undefined, undefined, "trade")

			expect(result.status).toBe("success")
			expect(result.data).toBeDefined()
			expect(result.data).toHaveLength(2)
			expect(result.data?.[0]?.drawdown).toBe(0) // First trade is peak
			expect(result.data?.[1]?.drawdown).toBeGreaterThan(0) // Second trade has drawdown
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockRejectedValue(
				new Error("Connection failed") as never
			)

			const result = await getEquityCurve(undefined, undefined, "trade")

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("FETCH_FAILED")
		})
	})

	describe("getDailyPnL", () => {
		it("should return empty array when no trades for month", async () => {
			vi.mocked(db.query.trades).findMany.mockResolvedValue([] as never)

			const result = await getDailyPnL(2026, 4) // May 2026

			expect(result.status).toBe("success")
			expect(result.data).toEqual([])
		})

		it("should aggregate daily P&L for calendar month", async () => {
			const trade1 = createMockTrade({
				pnl: 5000,
				entryDate: new Date("2026-05-15"),
			})
			const trade2 = createMockTrade({
				id: "trade-2",
				pnl: 3000,
				entryDate: new Date("2026-05-15"),
			})

			vi.mocked(db.query.trades).findMany.mockResolvedValue([
				trade1,
				trade2,
			] as never)

			const result = await getDailyPnL(2026, 4)

			expect(result.status).toBe("success")
			expect(result.data).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						date: expect.any(String),
						pnl: expect.any(Number),
					}),
				])
			)
		})

		it("should separate P&L by date", async () => {
			const trade1 = createMockTrade({
				pnl: 5000,
				entryDate: new Date("2026-05-15"),
			})
			const trade2 = createMockTrade({
				id: "trade-2",
				pnl: 3000,
				entryDate: new Date("2026-05-16"),
			})

			vi.mocked(db.query.trades).findMany.mockResolvedValue([
				trade1,
				trade2,
			] as never)

			const result = await getDailyPnL(2026, 4)

			expect(result.status).toBe("success")
			expect(result.data).toHaveLength(2)
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockRejectedValue(
				new Error("Query failed") as never
			)

			const result = await getDailyPnL(2026, 4)

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("FETCH_FAILED")
		})
	})

	describe("getRadarChartData", () => {
		it("should return empty radar data when no trades", async () => {
			vi.mocked(db.query.trades).findMany.mockResolvedValue([] as never)

			const result = await getRadarChartData()

			expect(result.status).toBe("success")
			expect(result.data).toEqual([])
		})

		it("should calculate radar metrics correctly", async () => {
			const trade = createMockTrade({
				outcome: "win",
				realizedRMultiple: 2.5,
			})

			vi.mocked(db.query.trades).findMany.mockResolvedValue([trade] as never)

			const result = await getRadarChartData()

			expect(result.status).toBe("success")
			expect(result.data).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						metricKey: "winRate",
						value: 100,
					}),
					expect.objectContaining({
						metricKey: "avgR",
					}),
					expect.objectContaining({
						metricKey: "profitFactor",
					}),
					expect.objectContaining({
						metricKey: "discipline",
					}),
					expect.objectContaining({
						metricKey: "consistency",
					}),
				])
			)
		})

		it("should normalize radar values to 0-100 range", async () => {
			const trade = createMockTrade()
			vi.mocked(db.query.trades).findMany.mockResolvedValue([trade] as never)

			const result = await getRadarChartData()

			expect(result.status).toBe("success")
			if (result.data) {
				for (const metric of result.data) {
					expect(metric.normalized).toBeGreaterThanOrEqual(0)
					expect(metric.normalized).toBeLessThanOrEqual(100)
				}
			}
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockRejectedValue(
				new Error("Query error") as never
			)

			const result = await getRadarChartData()

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("FETCH_FAILED")
		})
	})

	describe("getAnalyticsDashboard", () => {
		it("should return cached analytics dashboard data", async () => {
			const mockDashboardData = {
				overallStats: {
					grossPnl: 500,
					netPnl: 400,
					totalFees: 100,
					winRate: 60,
					profitFactor: 2,
					averageR: 1.5,
					totalTrades: 10,
					winCount: 6,
					lossCount: 4,
					breakevenCount: 0,
					avgWin: 100,
					avgLoss: 50,
				},
			}

			vi.mocked(getCachedAnalyticsDashboard).mockResolvedValue(
				mockDashboardData as never
			)

			const result = await getAnalyticsDashboard()

			expect(result.status).toBe("success")
			expect(result.data).toEqual(mockDashboardData)
			expect(getCachedAnalyticsDashboard).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: mockUserId,
				}),
				undefined
			)
		})

		it("should return error when cache query fails", async () => {
			vi.mocked(getCachedAnalyticsDashboard).mockRejectedValue(
				new Error("Cache miss") as never
			)

			const result = await getAnalyticsDashboard()

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("FETCH_FAILED")
		})
	})

	describe("getDashboardBatch", () => {
		it("should return batched dashboard data for specific month", async () => {
			const mockBatchData = {
				overallStats: {
					totalTrades: 15,
					winRate: 70,
					profitFactor: 2.5,
					grossPnl: 1000,
					netPnl: 800,
					totalFees: 200,
					averageR: 2,
					winCount: 10,
					lossCount: 5,
					breakevenCount: 0,
					avgWin: 120,
					avgLoss: 60,
				},
				dailyPnL: {},
				equityCurve: [],
			}

			vi.mocked(getCachedDashboardData).mockResolvedValue(
				mockBatchData as never
			)

			const result = await getDashboardBatch(2026, 4) // May 2026

			expect(result.status).toBe("success")
			expect(result.data).toEqual(mockBatchData)
			expect(getCachedDashboardData).toHaveBeenCalledWith(
				expect.objectContaining({
					userId: mockUserId,
				}),
				2026,
				4
			)
		})

		it("should handle month index 0 as January", async () => {
			const mockData = { overallStats: {} }
			vi.mocked(getCachedDashboardData).mockResolvedValue(mockData as never)

			await getDashboardBatch(2026, 0)

			expect(getCachedDashboardData).toHaveBeenCalledWith(
				expect.anything(),
				2026,
				0
			)
		})

		it("should handle month index 11 as December", async () => {
			const mockData = { overallStats: {} }
			vi.mocked(getCachedDashboardData).mockResolvedValue(mockData as never)

			await getDashboardBatch(2026, 11)

			expect(getCachedDashboardData).toHaveBeenCalledWith(
				expect.anything(),
				2026,
				11
			)
		})

		it("should return error when batch query fails", async () => {
			vi.mocked(getCachedDashboardData).mockRejectedValue(
				new Error("Batch error") as never
			)

			const result = await getDashboardBatch(2026, 4)

			expect(result.status).toBe("error")
			expect(result.errors?.[0]?.code).toBe("FETCH_FAILED")
		})
	})
})
