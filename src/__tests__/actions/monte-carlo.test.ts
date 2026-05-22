import { describe, it, expect, beforeEach, vi } from "vitest"
import type { ActionResponse } from "@/types"
import type {
	DataSourceOption,
	SourceStats,
	MonteCarloResult,
	MonteCarloResultV2,
	SimulationParams,
	SimulationParamsV2,
	StrategyComparisonResult,
} from "@/types/monte-carlo"

// Mock external dependencies before importing actions
vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			strategies: {
				findMany: vi.fn(),
				findFirst: vi.fn(),
			},
			trades: {
				findMany: vi.fn(),
				select: vi.fn(),
			},
		},
		select: vi.fn(),
	},
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn(),
}))

vi.mock("@/lib/monte-carlo", () => ({
	runMonteCarloSimulation: vi.fn((params: unknown) => ({
		statistics: {
			medianFinalR: 25.5,
			profitablePct: 72.5,
			medianMaxRDrawdown: -5.2,
			sharpeRatio: 1.8,
			winRate: 55,
			rewardRiskRatio: 1.5,
		},
		paths: [
			[100, 102, 105, 103],
			[100, 98, 101, 104],
		],
	})),
}))

vi.mock("@/lib/monte-carlo-v2", () => ({
	runMonteCarloV2: vi.fn(() => ({
		statistics: {
			medianEndingBalance: 12500,
			percentProfitable: 68,
			maxDrawdown: -8.5,
			winRate: 55,
			expectedReturn: 2500,
		},
		dailyMetrics: [],
	})),
}))

vi.mock("next-intl/server", () => ({
	getTranslations: vi.fn((namespace: string) => (key: string) => {
		const translations: Record<string, Record<string, string>> = {
			monteCarlo: {
				"actions.dataSourcesRetrieved": "Data sources retrieved",
				"actions.failedToGetDataSources": "Failed to get data sources",
				"actions.statsRetrieved": "Stats retrieved",
				"actions.failedToGetSimulationStats": "Failed to get stats",
				"actions.validationFailed": "Validation failed",
				"actions.edgeExpectancySimulationCompleted": "Simulation completed",
				"actions.failedToRunEdgeExpectancy": "Simulation failed",
				"actions.comparisonCompleted": "Comparison completed",
				"actions.failedToRunComparison": "Comparison failed",
				"actions.capitalExpectancySimulationCompleted":
					"V2 Simulation completed",
				"actions.failedToRunCapitalExpectancy": "V2 Simulation failed",
				"dataSources.allStrategies": "All Strategies",
				"dataSources.allStrategiesDesc": "Combined data from all strategies",
				"dataSources.allAccountsStrategies": "All Accounts",
				"dataSources.allAccountsStrategiesDesc":
					"Combined data across all accounts",
				"dataSources.needMinTrades": "Need at least 10 trades",
				"errors.failedToLoadStats": "Failed to load stats",
				"errors.noTradesForSource": "No trades found",
				"errors.universalRequiresAllAccounts":
					"Universal requires all accounts enabled",
				"allocation.excellent": "Excellent",
				"allocation.good": "Good",
				"allocation.moderate": "Moderate",
				"allocation.pause": "Pause",
			},
		}
		return translations[namespace]?.[key] || key
	}),
}))

// Import after mocks configured
const { db } = await import("@/db/drizzle")
const { requireAuth } = await import("@/app/actions/auth")
const {
	getDataSourceOptions,
	getSimulationStats,
	runSimulation,
	runComparisonSimulation,
	runSimulationV2,
} = await import("@/app/actions/monte-carlo")
const { rankComparisonResults, buildComparisonRecommendations } =
	await import("@/lib/monte-carlo/comparison-orchestration")
const { validateV2SimulationSetup } =
	await import("@/lib/monte-carlo/v2-validation")
const { annotateStrategyEligibility } =
	await import("@/lib/monte-carlo/strategy-eligibility")

// ============================================
// MOCK DATA FACTORIES
// ============================================

interface MockStrategy {
	id: string
	userId: string
	name: string
	description?: string | null
	isActive: boolean
}

interface MockTrade {
	id: string
	accountId: string
	strategyId: string | null
	outcome: "win" | "loss" | "breakeven" | null
	pnl: number | string | null
	realizedRMultiple: string | null
	plannedRiskAmount: number | string | null
	commission: number | string | null
	fees: number | string | null
	entryDate: Date
}

const createMockStrategy = (
	overrides: Partial<MockStrategy> = {}
): MockStrategy => ({
	id: "5a4310dd-be6f-46c5-abd6-fda9b111f5d6",
	userId: "c1a8f8d4-b2e5-4c89-a1d7-e9f2b3c4d5e6",
	name: "Trend Following",
	description: "A trend following strategy",
	isActive: true,
	...overrides,
})

const createMockTrade = (overrides: Partial<MockTrade> = {}): MockTrade => ({
	id: "a7b8c9d0-e1f2-4a5b-8c9d-e0f1a2b3c4d5",
	accountId: "d1e2f3a4-b5c6-4d7e-8f9a-b0c1d2e3f4a5",
	strategyId: "5a4310dd-be6f-46c5-abd6-fda9b111f5d6",
	outcome: "win",
	pnl: 1000,
	realizedRMultiple: "2.5",
	plannedRiskAmount: 400,
	commission: 50,
	fees: 30,
	entryDate: new Date("2025-01-01"),
	...overrides,
})

const mockUserId = "c1a8f8d4-b2e5-4c89-a1d7-e9f2b3c4d5e6"
const mockAccountId = "d1e2f3a4-b5c6-4d7e-8f9a-b0c1d2e3f4a5"

// ============================================
// TESTS
// ============================================

describe("getDataSourceOptions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should return strategy options with trade counts", async () => {
		const strategy1 = createMockStrategy({
			id: "11111111-1111-4111-8111-111111111111",
			name: "Strategy 1",
		})
		const strategy2 = createMockStrategy({
			id: "22222222-2222-4222-8222-222222222222",
			name: "Strategy 2",
		})

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.strategies).findMany.mockResolvedValueOnce([
			strategy1,
			strategy2,
		] as never)

		// Mock trade counts: 15 for s1, 5 for s2
		const tradesChain = {
			where: vi.fn().mockReturnValue({
				then: vi
					.fn()
					.mockResolvedValueOnce(Array(15).fill(null))
					.mockResolvedValueOnce(Array(5).fill(null)),
			}),
		}

		// Mock the select chain for trades
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockReturnValue(tradesChain),
		} as never)

		// Also mock findMany call for "All Strategies" option
		const allAccountTradesChain = {
			where: vi.fn().mockReturnValue({
				then: vi.fn().mockResolvedValueOnce(Array(20).fill(null)),
			}),
		}

		// Replace the mock for the all-strategies query
		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockReturnValue(allAccountTradesChain),
		} as never)

		const result = (await getDataSourceOptions()) as ActionResponse<
			DataSourceOption[]
		>

		expect(result.status).toBe("success")
		expect(result.data).toBeInstanceOf(Array)
		expect(result.data?.some((opt) => opt.type === "strategy")).toBe(true)
		expect(result.data?.some((opt) => opt.type === "all_strategies")).toBe(true)
	})

	it("should mark strategies with fewer than 10 trades as disabled", () => {
		// Test pure orchestration function without action layer
		const strategies = [
			{
				id: "s1",
				name: "Trend Following",
				isActive: true,
				tradesCount: 5,
			},
			{
				id: "s2",
				name: "Mean Reversion",
				isActive: true,
				tradesCount: 15,
			},
			{
				id: "s3",
				name: "Low Trades",
				isActive: true,
				tradesCount: 0,
			},
		]

		const annotated = annotateStrategyEligibility(strategies, 10)

		// s1: 5 trades < 10 → disabled
		const s1 = annotated.find((s) => s.id === "s1")
		expect(s1?.disabled).toBe(true)
		expect(s1?.disabledReason).toContain("at least 10")

		// s2: 15 trades >= 10 → enabled
		const s2 = annotated.find((s) => s.id === "s2")
		expect(s2?.disabled).toBe(false)
		expect(s2?.disabledReason).toBeUndefined()

		// s3: 0 trades < 10 → disabled
		const s3 = annotated.find((s) => s.id === "s3")
		expect(s3?.disabled).toBe(true)
		expect(s3?.disabledReason).toContain("at least 10")
	})

	it("should include universal option when show all accounts enabled", async () => {
		const strategy = createMockStrategy()

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: true,
			allAccountIds: [mockAccountId, "account-2"],
		} as never)

		vi.mocked(db.query.strategies).findMany.mockResolvedValueOnce([
			strategy,
		] as never)

		const tradesChain = {
			where: vi.fn().mockReturnValue({
				then: vi
					.fn()
					.mockResolvedValueOnce(Array(15).fill(null))
					.mockResolvedValueOnce(Array(20).fill(null))
					.mockResolvedValueOnce(Array(25).fill(null)),
			}),
		}

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockReturnValue(tradesChain),
		} as never)

		const result = (await getDataSourceOptions()) as ActionResponse<
			DataSourceOption[]
		>

		expect(result.status).toBe("success")
		expect(result.data?.some((opt) => opt.type === "universal")).toBe(true)
	})

	it("should not include universal option when single account", async () => {
		const strategy = createMockStrategy()

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: true,
			allAccountIds: [mockAccountId], // Single account
		} as never)

		vi.mocked(db.query.strategies).findMany.mockResolvedValueOnce([
			strategy,
		] as never)

		const tradesChain = {
			where: vi.fn().mockReturnValue({
				then: vi
					.fn()
					.mockResolvedValueOnce(Array(15).fill(null))
					.mockResolvedValueOnce(Array(20).fill(null)),
			}),
		}

		vi.mocked(db.select).mockReturnValue({
			from: vi.fn().mockReturnValue(tradesChain),
		} as never)

		const result = (await getDataSourceOptions()) as ActionResponse<
			DataSourceOption[]
		>

		expect(result.status).toBe("success")
		expect(result.data?.some((opt) => opt.type === "universal")).toBe(false)
	})
})

describe("getSimulationStats", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should calculate stats from strategy trades with win rate and R-multiples", async () => {
		const strategy = createMockStrategy()
		const winTrade = createMockTrade({
			outcome: "win",
			realizedRMultiple: "2.5",
		})
		const lossTrade = createMockTrade({
			id: "trade-2",
			outcome: "loss",
			pnl: -500,
			realizedRMultiple: "-1.0",
		})
		const breakevenTrade = createMockTrade({
			id: "trade-3",
			outcome: "breakeven",
			pnl: 0,
			realizedRMultiple: "0.0",
		})

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.strategies).findFirst.mockResolvedValueOnce(
			strategy as never
		)
		vi.mocked(db.query.trades).findMany.mockResolvedValueOnce([
			winTrade,
			lossTrade,
			breakevenTrade,
		] as never)

		const result = (await getSimulationStats({
			type: "strategy",
			strategyId: "5a4310dd-be6f-46c5-abd6-fda9b111f5d6",
		})) as ActionResponse<SourceStats>

		expect(result.status).toBe("success")
		expect(result.data?.winRate).toBe(50) // 1 win, 1 loss out of 2 decided
		expect(result.data?.totalTrades).toBe(3)
		expect(result.data?.breakevenRate).toBeGreaterThan(0)
	})

	it("should calculate stats for all strategies in account", async () => {
		const strategy1 = createMockStrategy({
			id: "11111111-1111-4111-8111-111111111111",
		})
		const strategy2 = createMockStrategy({
			id: "22222222-2222-4222-8222-222222222222",
		})
		const trades = [
			createMockTrade({
				strategyId: "11111111-1111-4111-8111-111111111111",
				outcome: "win",
			}),
			createMockTrade({
				id: "a7b8c9d0-e1f2-4a5b-8c9d-e0f1a2b3c4d6",
				strategyId: "22222222-2222-4222-8222-222222222222",
				outcome: "loss",
			}),
			createMockTrade({
				id: "a7b8c9d0-e1f2-4a5b-8c9d-e0f1a2b3c4d7",
				strategyId: "11111111-1111-4111-8111-111111111111",
				outcome: "win",
			}),
		]

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		// First call to findMany gets strategies list, second call gets strategy records for breakdown
		vi.mocked(db.query.strategies)
			.findMany.mockResolvedValueOnce([strategy1, strategy2] as never)
			.mockResolvedValueOnce([strategy1, strategy2] as never)
		vi.mocked(db.query.trades).findMany.mockResolvedValueOnce(trades as never)

		const result = (await getSimulationStats({
			type: "all_strategies",
		})) as ActionResponse<SourceStats>

		expect(result.status).toBe("success")
		expect(result.data?.totalTrades).toBe(3)
		expect(result.data?.strategiesBreakdown).toBeDefined()
	})

	it("should return error when strategy not found", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.strategies).findFirst.mockResolvedValueOnce(
			null as never
		)

		const result = (await getSimulationStats({
			type: "strategy",
			strategyId: "99999999-9999-4999-8999-999999999999",
		})) as ActionResponse<SourceStats>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})

	it("should return error when no completed trades found", async () => {
		const strategy = createMockStrategy()

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.strategies).findFirst.mockResolvedValueOnce(
			strategy as never
		)
		vi.mocked(db.query.trades).findMany.mockResolvedValueOnce([] as never)

		const result = (await getSimulationStats({
			type: "strategy",
			strategyId: "5a4310dd-be6f-46c5-abd6-fda9b111f5d6",
		})) as ActionResponse<SourceStats>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NO_TRADES")
	})

	it("should calculate profit factor from PnL values", async () => {
		const strategy = createMockStrategy()
		const winTrade = createMockTrade({ outcome: "win", pnl: 2000 })
		const lossTrade = createMockTrade({
			id: "trade-2",
			outcome: "loss",
			pnl: -1000,
		})

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.strategies).findFirst.mockResolvedValueOnce(
			strategy as never
		)
		vi.mocked(db.query.trades).findMany.mockResolvedValueOnce([
			winTrade,
			lossTrade,
		] as never)

		const result = (await getSimulationStats({
			type: "strategy",
			strategyId: "5a4310dd-be6f-46c5-abd6-fda9b111f5d6",
		})) as ActionResponse<SourceStats>

		expect(result.status).toBe("success")
		expect(result.data?.profitFactor).toBe(2) // 2000 / 1000
	})

	it("should return infinity profit factor when no losses", async () => {
		const strategy = createMockStrategy()
		const winTrade = createMockTrade({ outcome: "win", pnl: 1000 })

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.strategies).findFirst.mockResolvedValueOnce(
			strategy as never
		)
		vi.mocked(db.query.trades).findMany.mockResolvedValueOnce([
			winTrade,
		] as never)

		const result = (await getSimulationStats({
			type: "strategy",
			strategyId: "5a4310dd-be6f-46c5-abd6-fda9b111f5d6",
		})) as ActionResponse<SourceStats>

		expect(result.status).toBe("success")
		expect(result.data?.profitFactor).toBe(Infinity)
	})

	it("should validate data source schema", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		const result = (await getSimulationStats({
			type: "invalid_type",
		} as never)) as ActionResponse<SourceStats>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("VALIDATION_ERROR")
	})
})

describe("runSimulation", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should run monte carlo simulation with valid parameters", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		const result = (await runSimulation({
			winRate: 55,
			rewardRiskRatio: 1.5,
			numberOfTrades: 100,
			commissionImpactR: 0.5,
			simulationCount: 1000,
		})) as ActionResponse<MonteCarloResult>

		expect(result.status).toBe("success")
		expect(result.data?.statistics.medianFinalR).toBe(25.5)
		expect(result.data?.statistics.profitablePct).toBe(72.5)
	})

	it("should reject winRate outside 1-99 range", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		const result = (await runSimulation({
			winRate: 100, // Out of range
			rewardRiskRatio: 1.5,
			numberOfTrades: 100,
			commissionImpactR: 0.5,
			simulationCount: 1000,
		})) as ActionResponse<MonteCarloResult>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("VALIDATION_ERROR")
	})

	it("should reject zero or negative reward risk ratio", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		const result = (await runSimulation({
			winRate: 55,
			rewardRiskRatio: 0, // Out of range
			numberOfTrades: 100,
			commissionImpactR: 0.5,
			simulationCount: 1000,
		})) as ActionResponse<MonteCarloResult>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("VALIDATION_ERROR")
	})

	it("should enforce simulation budget cap", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		const result = (await runSimulation({
			winRate: 55,
			rewardRiskRatio: 1.5,
			numberOfTrades: 10000, // Way too many
			commissionImpactR: 0.5,
			simulationCount: 50000, // Way too many simulations
		})) as ActionResponse<MonteCarloResult>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("VALIDATION_ERROR")
	})

	it("should accept boundary win rates", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		const result = (await runSimulation({
			winRate: 1, // Minimum boundary
			rewardRiskRatio: 0.1, // Minimum boundary
			numberOfTrades: 10, // Minimum boundary
			commissionImpactR: 0,
			simulationCount: 100, // Minimum boundary
		})) as ActionResponse<MonteCarloResult>

		expect(result.status).toBe("success")
	})
})

describe("runComparisonSimulation", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should orchestrate comparison ranking and recommendations", () => {
		// Test pure orchestration functions without action layer
		const mockResults: StrategyComparisonResult[] = [
			{
				strategyId: "s1",
				strategyName: "Trend",
				tradesCount: 15,
				winRate: 52,
				rewardRiskRatio: 1.3,
				medianFinalR: 20.5,
				profitablePct: 65,
				maxRDrawdown: -6.2,
				sharpeRatio: 1.5,
				rank: 0,
				result: {
					statistics: {
						medianFinalR: 20.5,
						profitablePct: 65,
						medianMaxRDrawdown: -6.2,
						sharpeRatio: 1.5,
						winRate: 52,
						rewardRiskRatio: 1.3,
					},
					paths: [[100, 102, 101]],
				},
			},
			{
				strategyId: "s2",
				strategyName: "Mean Reversion",
				tradesCount: 12,
				winRate: 58,
				rewardRiskRatio: 1.6,
				medianFinalR: 28.2,
				profitablePct: 72,
				maxRDrawdown: -4.1,
				sharpeRatio: 1.9,
				rank: 0,
				result: {
					statistics: {
						medianFinalR: 28.2,
						profitablePct: 72,
						medianMaxRDrawdown: -4.1,
						sharpeRatio: 1.9,
						winRate: 58,
						rewardRiskRatio: 1.6,
					},
					paths: [[100, 103, 105]],
				},
			},
		]

		// Test ranking function
		const ranked = rankComparisonResults(mockResults)

		expect(ranked).toHaveLength(2)
		expect(ranked[0]?.strategyName).toBe("Mean Reversion")
		expect(ranked[0]?.rank).toBe(1)
		expect(ranked[1]?.strategyName).toBe("Trend")
		expect(ranked[1]?.rank).toBe(2)

		// Test recommendation building function
		const recommendations = buildComparisonRecommendations(ranked)

		expect(recommendations.topPerformers).toContain("Mean Reversion")
		expect(recommendations.needsImprovement).toHaveLength(0)
		expect(recommendations.suggestedAllocations).toHaveLength(2)
	})

	it("should rank strategies by profitable percentage", async () => {
		const strategy1 = createMockStrategy({
			id: "11111111-1111-4111-8111-111111111111",
			name: "High Win Rate",
		})
		const strategy2 = createMockStrategy({
			id: "22222222-2222-4222-8222-222222222222",
			name: "Low Win Rate",
		})

		const winTrades = Array(8)
			.fill(null)
			.map((_, i) =>
				createMockTrade({
					id: `a1111111-1111-4111-8111-11111111111${i}`,
					strategyId: "11111111-1111-4111-8111-111111111111",
					outcome: "win",
				})
			)
		const lossTrades = Array(2)
			.fill(null)
			.map((_, i) =>
				createMockTrade({
					id: `a2222222-2222-4222-8222-22222222222${i}`,
					strategyId: "11111111-1111-4111-8111-111111111111",
					outcome: "loss",
				})
			)

		const lowerWinTrades = Array(4)
			.fill(null)
			.map((_, i) =>
				createMockTrade({
					id: `a3333333-3333-4333-8333-33333333333${i}`,
					strategyId: "22222222-2222-4222-8222-222222222222",
					outcome: "win",
				})
			)
		const lowerLossTrades = Array(6)
			.fill(null)
			.map((_, i) =>
				createMockTrade({
					id: `a4444444-4444-4444-8444-44444444444${i}`,
					strategyId: "22222222-2222-4222-8222-222222222222",
					outcome: "loss",
				})
			)

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.strategies).findMany.mockResolvedValueOnce([
			strategy1,
			strategy2,
		] as never)
		vi.mocked(db.query.strategies).findFirst.mockResolvedValueOnce(
			strategy1 as never
		)
		vi.mocked(db.query.trades).findMany.mockResolvedValueOnce([
			...winTrades,
			...lossTrades,
		] as never)
		vi.mocked(db.query.strategies).findFirst.mockResolvedValueOnce(
			strategy2 as never
		)
		vi.mocked(db.query.trades).findMany.mockResolvedValueOnce([
			...lowerWinTrades,
			...lowerLossTrades,
		] as never)

		const result = await runComparisonSimulation({
			numberOfTrades: 100,
			commissionImpactR: 0.5,
			simulationCount: 1000,
		})

		expect(result.status).toBe("success")
		expect(result.data?.results[0]?.strategyName).toBe("High Win Rate")
	})
})

describe("runSimulationV2", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should validate V2 simulation parameters", () => {
		// Test pure orchestration validation without action layer
		const validParams: SimulationParamsV2 = {
			profile: {
				name: "Balanced",
				baseRiskCents: 100000,
				rewardRiskRatio: 1.5,
				winRate: 55,
				breakevenRate: 10,
				dailyTargetCents: null,
				dailyLossLimitCents: 500000,
				lossRecoverySteps: [],
				executeAllRegardless: true,
				stopAfterSequence: false,
				compoundingRiskPercent: 100,
				stopOnFirstLoss: false,
				weeklyLossLimitCents: null,
				monthlyLossLimitCents: 2000000,
				tradingDaysPerMonth: 20,
				tradingDaysPerWeek: 5,
				commissionPerTradeCents: 50,
				riskSizingMode: "fixed",
				riskPercent: null,
				fixedRatioDeltaCents: null,
				fixedRatioBaseContractRiskCents: null,
				kellyDivisor: null,
				limitMode: "fixedCents",
				dailyLossPercent: null,
				weeklyLossPercent: null,
				monthlyLossPercent: null,
				dailyLossR: null,
				weeklyLossR: null,
				monthlyLossR: null,
				drawdownTiers: [],
				drawdownRecoveryPercent: 50,
				consecutiveLossRules: [],
			},
			simulationCount: 1000,
			initialBalance: 100000,
			monthsToTrade: 12,
		}

		// Test validation passes for good params
		const validation = validateV2SimulationSetup(validParams)
		expect(validation.valid).toBe(true)
		expect(validation.errors).toHaveLength(0)

		// Test validation rejects low simulation count
		const lowSimParams = { ...validParams, simulationCount: 50 }
		const lowValidation = validateV2SimulationSetup(lowSimParams)
		expect(lowValidation.valid).toBe(false)
		expect(lowValidation.errors.length).toBeGreaterThan(0)

		// Test validation rejects high simulation count
		const highSimParams = { ...validParams, simulationCount: 60000 }
		const highValidation = validateV2SimulationSetup(highSimParams)
		expect(highValidation.valid).toBe(false)
		expect(highValidation.errors.length).toBeGreaterThan(0)
	})

	it("should reject invalid simulation count", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		const result = (await runSimulationV2({
			profile: {
				name: "Balanced",
				baseRiskCents: 100000,
				rewardRiskRatio: 1.5,
				winRate: 55,
				breakevenRate: 10,
				dailyTargetCents: null,
				dailyLossLimitCents: 500000,
				lossRecoverySteps: [],
				executeAllRegardless: true,
				stopAfterSequence: false,
				compoundingRiskPercent: 100,
				stopOnFirstLoss: false,
				weeklyLossLimitCents: null,
				monthlyLossLimitCents: 2000000,
				tradingDaysPerMonth: 20,
				tradingDaysPerWeek: 5,
				commissionPerTradeCents: 50,
				riskSizingMode: "fixed",
				riskPercent: null,
				fixedRatioDeltaCents: null,
				fixedRatioBaseContractRiskCents: null,
				kellyDivisor: null,
				limitMode: "fixedCents",
				dailyLossPercent: null,
				weeklyLossPercent: null,
				monthlyLossPercent: null,
				dailyLossR: null,
				weeklyLossR: null,
				monthlyLossR: null,
				drawdownTiers: [],
				drawdownRecoveryPercent: 50,
				consecutiveLossRules: [],
			},
			simulationCount: 1, // Below minimum of 100
			initialBalance: 100000,
			monthsToTrade: 12,
		})) as ActionResponse<MonteCarloResultV2>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("VALIDATION_ERROR")
	})

	it("should enforce V2 simulation budget cap", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		const result = (await runSimulationV2({
			profile: {
				name: "Aggressive",
				baseRiskCents: 100000,
				rewardRiskRatio: 1.5,
				winRate: 55,
				breakevenRate: 10,
				dailyTargetCents: null,
				dailyLossLimitCents: 500000,
				lossRecoverySteps: [],
				executeAllRegardless: true,
				stopAfterSequence: false,
				compoundingRiskPercent: 100,
				stopOnFirstLoss: false,
				weeklyLossLimitCents: null,
				monthlyLossLimitCents: 2000000,
				tradingDaysPerMonth: 20,
				tradingDaysPerWeek: 5,
				commissionPerTradeCents: 50,
				riskSizingMode: "fixed",
				riskPercent: null,
				fixedRatioDeltaCents: null,
				fixedRatioBaseContractRiskCents: null,
				kellyDivisor: null,
				limitMode: "fixedCents",
				dailyLossPercent: null,
				weeklyLossPercent: null,
				monthlyLossPercent: null,
				dailyLossR: null,
				weeklyLossR: null,
				monthlyLossR: null,
				drawdownTiers: [],
				drawdownRecoveryPercent: 50,
				consecutiveLossRules: [],
			},
			simulationCount: 50000,
			initialBalance: 100000,
			monthsToTrade: 48, // 50 trades/day * 20 days/month * 48 months * 50k simulations exceeds cap
		})) as ActionResponse<MonteCarloResultV2>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("VALIDATION_ERROR")
	})
})
