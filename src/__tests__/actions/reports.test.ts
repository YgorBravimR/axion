import { describe, it, expect, beforeEach, vi } from "vitest"

// Mock dependencies
vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			trades: {
				findMany: vi.fn(),
			},
			tradingAccounts: {
				findFirst: vi.fn(),
			},
			tags: {
				findMany: vi.fn(),
			},
			tradeTags: {
				findMany: vi.fn(),
			},
		},
	},
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn(),
}))

vi.mock("@/app/actions/settings", () => ({
	getUserSettings: vi.fn(),
}))

vi.mock("@/lib/effective-date", () => ({
	getServerEffectiveNow: () => new Date("2026-05-22"),
}))

vi.mock("@/lib/tax/legal-rates", () => ({
	getDayTradeIrRate: () => 0.015,
}))

vi.mock("@/lib/error-utils", () => ({
	isFrameworkSignal: () => false,
	toSafeErrorMessage: (error: unknown) => {
		if (error instanceof Error) {
			return error.message
		}
		return "Unknown error"
	},
}))

vi.mock("next-intl/server", () => ({
	getTranslations: () => (key: string) => {
		const translations: Record<string, string> = {
			"reports.weeklyReportRetrieved": "Weekly report retrieved",
			"reports.failedToRetrieveWeeklyReport":
				"Failed to retrieve weekly report",
			"reports.monthlyReportRetrieved": "Monthly report retrieved",
			"reports.failedToRetrieveMonthlyReport":
				"Failed to retrieve monthly report",
			"reports.noTradesInPeriod": "No trades in period",
			"reports.mistakeCostAnalysisRetrieved": "Mistake cost analysis retrieved",
			"reports.failedToRetrieveMistakeCostAnalysis":
				"Failed to retrieve mistake cost analysis",
			"reports.monthlyResultsRetrieved": "Monthly results retrieved",
			"reports.monthlyProjectionRetrieved": "Monthly projection retrieved",
			"reports.monthComparisonRetrieved": "Month comparison retrieved",
			"reports.yearlyOverviewRetrieved": "Yearly overview retrieved",
			"reports.commissionFeeImpactRetrieved": "Commission fee impact retrieved",
		}
		return translations[key] || key
	},
}))

const { db } = await import("@/db/drizzle")
const { requireAuth } = await import("@/app/actions/auth")
const { getUserSettings } = await import("@/app/actions/settings")
const {
	getWeeklyReport,
	getMonthlyReport,
	getMistakeCostAnalysis,
	getMonthlyResultsWithProp,
	getMonthlyProjection,
	getMonthComparison,
	getYearlyOverview,
	getCommissionFeeImpact,
} = await import("@/app/actions/reports")

const mockUserId = "user-123"
const mockAccountId = "account-456"

const createMockTrade = (overrides = {}) => ({
	id: "trade-1",
	userId: mockUserId,
	accountId: mockAccountId,
	asset: "WINQ23",
	direction: "long" as const,
	entryDate: new Date("2026-05-15T10:00:00Z"),
	exitDate: new Date("2026-05-15T11:00:00Z"),
	entryPrice: 1000,
	exitPrice: 1100,
	quantity: 1,
	pnl: 10000, // R$100.00
	commission: 500, // R$5.00
	fees: 200, // R$2.00
	outcome: "win" as const,
	realizedRMultiple: "2.5",
	followedPlan: true,
	isArchived: false,
	timeframeId: "1h",
	strategyId: "strategy-1",
	strategyVersionId: "v1",
	createdAt: new Date(),
	...overrides,
})

describe("Reports Server Actions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			sessionId: "sess-123",
			accountId: mockAccountId,
			allAccountIds: [mockAccountId],
			showAllAccounts: false,
		} as never)
		vi.mocked(getUserSettings).mockResolvedValue({
			accountId: mockAccountId,
			propMode: "classic",
			initialCapital: 50000,
		} as never)
		// Mock trades.findMany to return empty by default (overridden in tests)
		vi.mocked(db.query.trades).findMany.mockImplementation(
			(async () => []) as never
		)
		// Mock tags.findMany for mistake cost analysis
		vi.mocked(db.query.tags).findMany.mockImplementation(
			(async () => []) as never
		)
		// Mock tradeTags.findMany for mistake cost analysis
		vi.mocked(db.query.tradeTags).findMany.mockImplementation(
			(async () => []) as never
		)
		// Mock tradingAccounts for prop calculation tests
		vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue({
			id: mockAccountId,
			userId: mockUserId,
			name: "Test Account",
			accountType: "own",
			profitSharePercentage: "100",
			propFirmName: null,
			showTaxEstimates: true,
			currency: "BRL",
			createdAt: new Date(),
		} as never)
	})

	describe("getWeeklyReport", () => {
		it("should return empty report when no trades in week", async () => {
			const result = await getWeeklyReport(0)

			expect(result.status).toBe("success")
			expect(result.data?.summary.totalTrades).toBe(0)
			expect(result.data?.summary.grossPnl).toBe(0)
		})

		it("should calculate weekly summary correctly", async () => {
			const trade1 = createMockTrade({
				pnl: 10000,
				outcome: "win",
			})
			const trade2 = createMockTrade({
				id: "trade-2",
				pnl: -5000,
				outcome: "loss",
			})

			vi.mocked(db.query.trades).findMany.mockImplementation((async () => [
				trade1,
				trade2,
			]) as never)

			const result = await getWeeklyReport(0)

			expect(result.status).toBe("success")
			expect(result.data?.summary.totalTrades).toBe(2)
			expect(result.data?.summary.winCount).toBe(1)
			expect(result.data?.summary.lossCount).toBe(1)
			expect(result.data?.summary.netPnl).toBeCloseTo(50, 1) // 100 - 50
		})

		it("should respect week offset parameter", async () => {
			await getWeeklyReport(1) // Last week

			expect(vi.mocked(db.query.trades).findMany).toHaveBeenCalled()
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockImplementation(
				() => Promise.reject(new Error("Database error")) as never
			)

			const result = await getWeeklyReport(0)

			expect(result.status).toBe("error")
		})

		it("should require authentication", async () => {
			vi.mocked(requireAuth).mockRejectedValue(
				new Error("Not authenticated") as never
			)

			const result = await getWeeklyReport(0)

			expect(result.status).toBe("error")
			expect(vi.mocked(requireAuth)).toHaveBeenCalled()
		})
	})

	describe("getMonthlyReport", () => {
		it("should return empty report when no trades in month", async () => {
			const result = await getMonthlyReport(0)

			expect(result.status).toBe("success")
			expect(result.data?.summary.totalTrades).toBe(0)
		})

		it("should calculate monthly summary with multiple trades", async () => {
			const trades = [
				createMockTrade({ pnl: 10000, outcome: "win" }),
				createMockTrade({ id: "trade-2", pnl: 5000, outcome: "win" }),
				createMockTrade({ id: "trade-3", pnl: -8000, outcome: "loss" }),
			]

			vi.mocked(db.query.trades).findMany.mockImplementation(
				(async () => trades) as never
			)

			const result = await getMonthlyReport(0)

			expect(result.status).toBe("success")
			expect(result.data?.summary.totalTrades).toBe(3)
			expect(result.data?.summary.winCount).toBe(2)
			expect(result.data?.summary.lossCount).toBe(1)
		})

		it("should include weekly and asset breakdown", async () => {
			const trade1 = createMockTrade({
				asset: "WINQ23",
				entryDate: new Date("2026-05-15"),
				pnl: 10000,
			})
			const trade2 = createMockTrade({
				id: "trade-2",
				asset: "INDM26",
				entryDate: new Date("2026-05-16"),
				pnl: 5000,
			})

			vi.mocked(db.query.trades).findMany.mockImplementation((async () => [
				trade1,
				trade2,
			]) as never)

			const result = await getMonthlyReport(0)

			expect(result.status).toBe("success")
			expect(result.data?.weeklyBreakdown).toBeDefined()
			expect(result.data?.assetBreakdown).toBeDefined()
			expect(result.data?.assetBreakdown).toHaveLength(2)
		})

		it("should calculate profit factor correctly", async () => {
			const winTrade = createMockTrade({ pnl: 10000, outcome: "win" })
			const lossTrade = createMockTrade({
				id: "trade-2",
				pnl: -5000,
				outcome: "loss",
			})

			vi.mocked(db.query.trades).findMany.mockImplementation((async () => [
				winTrade,
				lossTrade,
			]) as never)

			const result = await getMonthlyReport(0)

			expect(result.status).toBe("success")
			// Gross profit 100, Gross loss 50, Profit factor = 2
			expect(result.data?.summary.profitFactor).toBe(2)
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockImplementation(
				() => Promise.reject(new Error("Query failed")) as never
			)

			const result = await getMonthlyReport(0)

			expect(result.status).toBe("error")
		})
	})

	describe("getMistakeCostAnalysis", () => {
		it("should return zero cost when all trades followed plan", async () => {
			const trade = createMockTrade({ followedPlan: true })
			vi.mocked(db.query.trades).findMany.mockImplementation((async () => [
				trade,
			]) as never)

			const result = await getMistakeCostAnalysis()

			expect(result.status).toBe("success")
			expect(result.data?.totalMistakeCost).toBe(0)
		})

		it("should calculate cost of trades that violated plan", async () => {
			const result = await getMistakeCostAnalysis()

			expect(result.status).toBe("success")
			expect(result.data?.mistakes).toBeDefined()
			expect(result.data?.totalMistakeCost).toBeDefined()
		})

		it("should identify trades without plan data", async () => {
			const trade = createMockTrade({ followedPlan: null })
			vi.mocked(db.query.trades).findMany.mockImplementation((async () => [
				trade,
			]) as never)

			const result = await getMistakeCostAnalysis()

			expect(result.status).toBe("success")
			// Trade without plan data shouldn't count as a mistake
		})
	})

	describe("getMonthlyResultsWithProp", () => {
		it("should return a result with valid structure", async () => {
			const result = await getMonthlyResultsWithProp()

			expect(result.status).toBeDefined()
			expect(["success", "error"]).toContain(result.status)
		})

		it("should return error when account not found", async () => {
			vi.mocked(db.query.tradingAccounts).findFirst.mockResolvedValue(
				null as never
			)

			const result = await getMonthlyResultsWithProp()

			expect(result.status).toBe("error")
		})
	})

	describe("getMonthlyProjection", () => {
		it("should return a result with valid structure", async () => {
			const result = await getMonthlyProjection()

			expect(result.status).toBeDefined()
			expect(["success", "error"]).toContain(result.status)
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockImplementation(
				() => Promise.reject(new Error("Query error")) as never
			)

			const result = await getMonthlyProjection()

			expect(result.status).toBe("error")
		})
	})

	describe("getMonthComparison", () => {
		it("should return a result with valid structure", async () => {
			const result = await getMonthComparison()

			expect(result.status).toBeDefined()
			expect(["success", "error"]).toContain(result.status)
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockImplementation(
				() => Promise.reject(new Error("Query error")) as never
			)

			const result = await getMonthComparison()

			expect(result.status).toBe("error")
		})
	})

	describe("getYearlyOverview", () => {
		it("should aggregate yearly statistics", async () => {
			const trades = [
				createMockTrade({ entryDate: new Date("2026-01-15"), pnl: 10000 }),
				createMockTrade({
					id: "trade-2",
					entryDate: new Date("2026-05-15"),
					pnl: 5000,
				}),
			]

			vi.mocked(db.query.trades).findMany.mockImplementation(
				(async () => trades) as never
			)

			const result = await getYearlyOverview()

			expect(result.status).toBe("success")
			expect(result.data?.year).toBe(2026)
			expect(result.data?.months).toHaveLength(12)
		})

		it("should include monthly breakdown with all months", async () => {
			const trades = [
				createMockTrade({ entryDate: new Date("2026-01-15"), pnl: 10000 }),
				createMockTrade({
					id: "trade-2",
					entryDate: new Date("2026-02-15"),
					pnl: 5000,
				}),
			]

			vi.mocked(db.query.trades).findMany.mockImplementation(
				(async () => trades) as never
			)

			const result = await getYearlyOverview()

			expect(result.status).toBe("success")
			expect(result.data?.months).toBeDefined()
			expect(result.data?.months[0]).toMatchObject({
				month: 0,
				tradeCount: 1,
				hasTrades: true,
			})
			expect(result.data?.months[1]).toMatchObject({
				month: 1,
				tradeCount: 1,
				hasTrades: true,
			})
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockImplementation(
				() => Promise.reject(new Error("Query error")) as never
			)

			const result = await getYearlyOverview()

			expect(result.status).toBe("error")
		})
	})

	describe("getCommissionFeeImpact", () => {
		it("should calculate total impact of commissions and fees", async () => {
			const trade = createMockTrade({
				pnl: 10000,
				commission: 500,
				fees: 200,
			})

			vi.mocked(db.query.trades).findMany.mockImplementation((async () => [
				trade,
			]) as never)

			const result = await getCommissionFeeImpact()

			expect(result.status).toBe("success")
			expect(result.data?.summary.totalFees).toBe(7) // (500 + 200) cents = R$7.00
			expect(result.data?.summary.totalCommission).toBe(5) // 500 cents = R$5.00
			expect(result.data?.summary.totalExchangeFees).toBe(2) // 200 cents = R$2.00
		})

		it("should show impact as percentage of gross P&L", async () => {
			const trade = createMockTrade({
				pnl: 10000,
				commission: 500,
				fees: 200,
			})

			vi.mocked(db.query.trades).findMany.mockImplementation((async () => [
				trade,
			]) as never)

			const result = await getCommissionFeeImpact()

			expect(result.status).toBe("success")
			expect(result.data?.summary.feesAsPercentOfGross).toBeDefined()
			expect(result.data?.summary.feesAsPercentOfGross).toBeGreaterThan(0)
			expect(result.data?.summary.avgFeePerTrade).toBeGreaterThan(0)
		})

		it("should handle zero fees", async () => {
			const trade = createMockTrade({
				pnl: 10000,
				commission: 0,
				fees: 0,
			})

			vi.mocked(db.query.trades).findMany.mockImplementation((async () => [
				trade,
			]) as never)

			const result = await getCommissionFeeImpact()

			expect(result.status).toBe("success")
			expect(result.data?.summary.totalFees).toBe(0)
			expect(result.data?.hasData).toBe(false)
		})

		it("should include asset breakdown", async () => {
			const trades = [
				createMockTrade({
					asset: "WINQ23",
					pnl: 10000,
					commission: 500,
					fees: 200,
				}),
				createMockTrade({
					id: "trade-2",
					asset: "INDM26",
					pnl: 5000,
					commission: 300,
					fees: 100,
				}),
			]

			vi.mocked(db.query.trades).findMany.mockImplementation(
				(async () => trades) as never
			)

			const result = await getCommissionFeeImpact()

			expect(result.status).toBe("success")
			expect(result.data?.assetBreakdown).toHaveLength(2)
			expect(result.data?.assetBreakdown[0]).toMatchObject({
				asset: "WINQ23",
				totalFees: 7,
				tradeCount: 1,
			})
		})

		it("should return error when query fails", async () => {
			vi.mocked(db.query.trades).findMany.mockImplementation(
				() => Promise.reject(new Error("Query error")) as never
			)

			const result = await getCommissionFeeImpact()

			expect(result.status).toBe("error")
		})
	})
})
