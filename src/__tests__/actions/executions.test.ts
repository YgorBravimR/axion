import { describe, it, expect, beforeEach, vi } from "vitest"
import type { ActionResponse, ExecutionSummary } from "@/types"
import type { TradeExecution } from "@/db/schema"

// Mock all external dependencies before importing actions
vi.mock("@/db/drizzle", () => ({
	db: {
		query: {
			trades: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			tradeExecutions: {
				findFirst: vi.fn(),
				findMany: vi.fn(),
			},
			assets: {
				findFirst: vi.fn(),
			},
		},
		insert: vi.fn(),
		update: vi.fn(),
		delete: vi.fn(),
	},
}))

vi.mock("@/lib/cache/invalidate", () => ({
	invalidateTradeData: vi.fn(),
}))

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn(),
}))

vi.mock("@/lib/error-utils", () => ({
	toSafeErrorMessage: (error: unknown, _context?: string) => {
		if (error instanceof Error) {
			return error.message
		}
		return "Unknown error"
	},
}))

vi.mock("next-intl/server", () => ({
	getTranslations: vi.fn(() => (key: string) => {
		const translations: Record<string, string> = {
			"actions.tradeNotFound": "Trade not found",
			"actions.executionCreated": "Execution created",
			"actions.executionUpdated": "Execution updated",
			"actions.executionDeleted": "Execution deleted",
			"actions.executionsRetrieved": "Executions retrieved",
			"actions.summaryCalculated": "Summary calculated",
			"actions.validationError": "Validation error",
			"actions.createFailed": "Create failed",
			"actions.updateFailed": "Update failed",
			"actions.deleteFailed": "Delete failed",
			"actions.fetchFailed": "Fetch failed",
			"actions.calculationFailed": "Calculation failed",
			"actions.convertedToScaled": "Converted to scaled",
			"actions.convertFailed": "Convert failed",
			"actions.recalculated": "Recalculated",
			"actions.recalculateFailed": "Recalculate failed",
			"errors.exitQuantityExceeds": "Exit quantity exceeds entries",
			"errors.alreadyScaledMode": "Already in scaled mode",
			"errors.notScaledMode": "Not in scaled mode",
		}
		return translations[key] || key
	}),
}))

vi.mock("@/lib/calculations", () => ({
	calculateAssetPnL: vi.fn((_params: unknown) => ({
		netPnl: 1000,
		ticksGained: 10,
	})),
	determineOutcome: vi.fn(
		(params: {
			pnl: number
			ticksGained?: number
			breakevenTicks?: number
		}) => {
			return params.pnl > 0 ? "win" : params.pnl < 0 ? "loss" : "breakeven"
		}
	),
	calculateExecutionSummary: vi.fn((_executions: unknown) => ({
		totalEntryQuantity: 100,
		totalExitQuantity: 100,
		avgEntryPrice: 50,
		avgExitPrice: 52,
		remainingQuantity: 0,
		totalCommission: 50,
		totalFees: 30,
	})),
}))

vi.mock("@/app/actions/accounts", () => ({
	getBreakevenTicks: vi.fn().mockResolvedValue(2),
}))

vi.mock("@/auth", () => ({
	auth: vi.fn(),
}))

// Import after all mocks are configured
const { db } = await import("@/db/drizzle")
const { requireAuth } = await import("@/app/actions/auth")
const {
	createExecution,
	updateExecution,
	deleteExecution,
	getExecutions,
	getExecutionSummary,
	convertToScaledMode,
	recalculateTradeFromExecutions,
} = await import("@/app/actions/executions")

// ============================================
// MOCK DATA FACTORIES
// ============================================

const createMockExecution = (
	overrides: Partial<TradeExecution> = {}
): TradeExecution => ({
	id: "550e8400-e29b-41d4-a716-446655440010",
	tradeId: "550e8400-e29b-41d4-a716-446655440011",
	executionType: "entry",
	executionDate: new Date("2025-01-15"),
	price: "50.00",
	quantity: "100",
	orderType: "market",
	notes: null,
	commission: "50",
	fees: "30",
	slippage: "0.10",
	executionValue: "5000",
	createdAt: new Date(),
	updatedAt: new Date(),
	...overrides,
})

const mockUserId = "550e8400-e29b-41d4-a716-446655440000"
const mockAccountId = "550e8400-e29b-41d4-a716-446655440001"
const mockTradeId = "550e8400-e29b-41d4-a716-446655440002"

// ============================================
// TESTS
// ============================================

describe("createExecution", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should create entry execution and return success response", async () => {
		const mockExecution = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440020",
			tradeId: mockTradeId,
			executionType: "entry",
		})

		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			direction: "long",
			asset: "ES",
			executionMode: "simple",
		} as never)

		vi.mocked(db).insert.mockReturnValue({
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([mockExecution]),
			}),
		} as never)

		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([
			mockExecution,
		] as never)

		const result = (await createExecution({
			tradeId: mockTradeId,
			executionType: "entry",
			executionDate: new Date("2025-01-15"),
			price: 50,
			quantity: 100,
			commission: 50,
			fees: 30,
		})) as ActionResponse<TradeExecution>

		expect(result.status).toBe("success")
		expect(result.data?.executionType).toBe("entry")
		expect(result.data?.price).toBe("50.00")
	})

	it("should return NOT_FOUND when trade does not exist", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue(null as never)

		const result = (await createExecution({
			tradeId: "550e8400-e29b-41d4-a716-446655449999",
			executionType: "entry",
			executionDate: new Date(),
			price: 50,
			quantity: 100,
		})) as ActionResponse<TradeExecution>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})

	it("should reject exit execution that exceeds total entry quantity", async () => {
		const existingEntryExec = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440021",
			tradeId: mockTradeId,
			executionType: "entry",
			quantity: "100",
		})

		const existingExitExec = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440022",
			tradeId: mockTradeId,
			executionType: "exit",
			quantity: "80",
		})

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
		} as never)

		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([
			existingEntryExec,
			existingExitExec,
		] as never)

		const result = (await createExecution({
			tradeId: mockTradeId,
			executionType: "exit",
			executionDate: new Date(),
			price: 52,
			quantity: 30, // 80 + 30 = 110 > 100 entry
		})) as ActionResponse<TradeExecution>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("EXIT_EXCEEDS_ENTRIES")
	})

	it("should return VALIDATION_ERROR for negative price", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		const result = (await createExecution({
			tradeId: mockTradeId,
			executionType: "entry",
			executionDate: new Date(),
			price: -50,
			quantity: 100,
		})) as ActionResponse<TradeExecution>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("VALIDATION_ERROR")
	})

	it("should return VALIDATION_ERROR for zero quantity", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		const result = (await createExecution({
			tradeId: mockTradeId,
			executionType: "entry",
			executionDate: new Date(),
			price: 50,
			quantity: 0,
		})) as ActionResponse<TradeExecution>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("VALIDATION_ERROR")
	})
})

describe("updateExecution", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should update execution successfully with new price", async () => {
		const existing = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440030",
			tradeId: mockTradeId,
			price: "50.00",
			quantity: "100",
			executionType: "entry",
		})

		const updated = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440030",
			tradeId: mockTradeId,
			price: "51.00",
			quantity: "100",
		})

		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([updated]),
				}),
			}),
		}

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.tradeExecutions).findFirst.mockResolvedValue({
			...existing,
			trade: { accountId: mockAccountId },
		} as never)

		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([
			updated,
		] as never)

		const result = (await updateExecution(
			"550e8400-e29b-41d4-a716-446655440030",
			{
				price: 51,
			}
		)) as ActionResponse<TradeExecution>

		expect(result.status).toBe("success")
		expect(result.data?.price).toBe("51.00")
	})

	it("should return NOT_FOUND when execution does not exist", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.tradeExecutions).findFirst.mockResolvedValue(
			null as never
		)

		const result = (await updateExecution(
			"550e8400-e29b-41d4-a716-446655449998",
			{
				price: 51,
			}
		)) as ActionResponse<TradeExecution>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})

	it("should reject exit quantity update that exceeds entries", async () => {
		const existing = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440031",
			tradeId: mockTradeId,
			executionType: "exit",
			quantity: "50",
		})

		const entryExec = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440032",
			tradeId: mockTradeId,
			executionType: "entry",
			quantity: "100",
		})

		const otherExitExec = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440033",
			tradeId: mockTradeId,
			executionType: "exit",
			quantity: "45",
		})

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.tradeExecutions).findFirst.mockResolvedValue({
			...existing,
			tradeId: mockTradeId,
			trade: { accountId: mockAccountId },
		} as never)

		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([
			entryExec,
			existing,
			otherExitExec,
		] as never)

		const result = (await updateExecution(
			"550e8400-e29b-41d4-a716-446655440031",
			{
				quantity: 60, // 45 + 60 = 105 > 100
			}
		)) as ActionResponse<TradeExecution>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("EXIT_EXCEEDS_ENTRIES")
	})

	it("should allow partial execution updates", async () => {
		const existing = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440040",
			tradeId: mockTradeId,
		})
		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockReturnValue({
					returning: vi.fn().mockResolvedValue([existing]),
				}),
			}),
		}

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.tradeExecutions).findFirst.mockResolvedValue({
			...existing,
			trade: { accountId: mockAccountId },
		} as never)

		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([
			existing,
		] as never)

		const result = (await updateExecution(
			"550e8400-e29b-41d4-a716-446655440040",
			{
				notes: "Updated notes only",
			}
		)) as ActionResponse<TradeExecution>

		expect(result.status).toBe("success")
	})
})

describe("deleteExecution", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should delete execution and revert trade to simple mode when empty", async () => {
		const execution = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440050",
			tradeId: mockTradeId,
		})

		const mockDeleteChain = {
			where: vi.fn().mockResolvedValue(undefined),
		}

		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.tradeExecutions).findFirst.mockResolvedValue({
			...execution,
			trade: { accountId: mockAccountId },
		} as never)

		vi.mocked(db).delete.mockReturnValue(mockDeleteChain as never)
		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)

		// First findMany returns remaining executions (empty), second for aggregate
		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValueOnce([])
		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValueOnce([])

		const result = await deleteExecution("550e8400-e29b-41d4-a716-446655440050")

		expect(result.status).toBe("success")
		expect(mockDeleteChain.where).toHaveBeenCalled()
	})

	it("should return NOT_FOUND when execution does not exist", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.tradeExecutions).findFirst.mockResolvedValue(
			null as never
		)

		const result = await deleteExecution("550e8400-e29b-41d4-a716-446655449997")

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})

	it("should keep scaled mode when executions remain", async () => {
		const execution1 = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440051",
			tradeId: mockTradeId,
		})
		const execution2 = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440052",
			tradeId: mockTradeId,
		})

		const mockDeleteChain = {
			where: vi.fn().mockResolvedValue(undefined),
		}

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.tradeExecutions).findFirst.mockResolvedValue({
			...execution1,
			tradeId: mockTradeId,
			trade: { accountId: mockAccountId },
		} as never)

		vi.mocked(db).delete.mockReturnValue(mockDeleteChain as never)

		// findMany returns remaining execution (still in scaled mode)
		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValueOnce([
			execution2,
		])
		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValueOnce([
			execution2,
		])

		const result = await deleteExecution("550e8400-e29b-41d4-a716-446655440051")

		expect(result.status).toBe("success")
		// Should NOT call update to revert to simple mode
	})
})

describe("getExecutions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should return all executions for a trade", async () => {
		const execution1 = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440060",
			tradeId: mockTradeId,
			executionType: "entry",
		})
		const execution2 = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440061",
			tradeId: mockTradeId,
			executionType: "exit",
		})

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
		} as never)

		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([
			execution1,
			execution2,
		] as never)

		const result = (await getExecutions(mockTradeId)) as ActionResponse<
			TradeExecution[]
		>

		expect(result.status).toBe("success")
		expect(result.data).toHaveLength(2)
		expect(result.data?.[0]?.executionType).toBe("entry")
		expect(result.data?.[1]?.executionType).toBe("exit")
	})

	it("should return empty array when trade has no executions", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
		} as never)

		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([] as never)

		const result = (await getExecutions(mockTradeId)) as ActionResponse<
			TradeExecution[]
		>

		expect(result.status).toBe("success")
		expect(result.data).toEqual([])
	})

	it("should return NOT_FOUND when trade does not exist", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue(null as never)

		const result = (await getExecutions(mockTradeId)) as ActionResponse<
			TradeExecution[]
		>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})
})

describe("getExecutionSummary", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should return execution summary with aggregated data", async () => {
		const execution1 = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440070",
			tradeId: mockTradeId,
			executionType: "entry",
			quantity: "100",
			price: "50.00",
		})
		const execution2 = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440071",
			tradeId: mockTradeId,
			executionType: "exit",
			quantity: "100",
			price: "52.00",
		})

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
		} as never)

		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([
			execution1,
			execution2,
		] as never)

		const result = (await getExecutionSummary(
			mockTradeId
		)) as ActionResponse<ExecutionSummary>

		expect(result.status).toBe("success")
		expect(result.data?.totalEntryQuantity).toBe(100)
		expect(result.data?.avgEntryPrice).toBe(50)
	})

	it("should return NOT_FOUND for nonexistent trade", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue(null as never)

		const result = (await getExecutionSummary(
			mockTradeId
		)) as ActionResponse<ExecutionSummary>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})
})

describe("convertToScaledMode", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should create entry and exit executions from simple trade data", async () => {
		const tradeData = {
			id: mockTradeId,
			accountId: mockAccountId,
			executionMode: "simple",
			entryPrice: "50.00",
			exitPrice: "52.00",
			positionSize: "100",
			entryDate: new Date("2025-01-10"),
			exitDate: new Date("2025-01-15"),
			commission: "50",
			fees: "30",
		}

		const entryExecution = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440080",
			tradeId: mockTradeId,
			executionType: "entry",
			price: "50.00",
			quantity: "100",
		})

		const exitExecution = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440081",
			tradeId: mockTradeId,
			executionType: "exit",
			price: "52.00",
			quantity: "100",
		})

		const mockInsertChain = {
			values: vi.fn().mockReturnValue({
				returning: vi
					.fn()
					.mockResolvedValueOnce([entryExecution])
					.mockResolvedValueOnce([exitExecution]),
			}),
		}

		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue(tradeData as never)
		vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)
		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([
			entryExecution,
			exitExecution,
		] as never)

		const result = (await convertToScaledMode(mockTradeId)) as ActionResponse<
			TradeExecution[]
		>

		expect(result.status).toBe("success")
		expect(result.data).toHaveLength(2)
		expect(result.data?.[0]?.executionType).toBe("entry")
	})

	it("should return error when trade already in scaled mode", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			executionMode: "scaled",
		} as never)

		const result = (await convertToScaledMode(mockTradeId)) as ActionResponse<
			TradeExecution[]
		>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("ALREADY_SCALED")
	})

	it("should return NOT_FOUND for nonexistent trade", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue(null as never)

		const result = (await convertToScaledMode(mockTradeId)) as ActionResponse<
			TradeExecution[]
		>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})

	it("should create only entry execution when trade has no exit", async () => {
		const tradeData = {
			id: mockTradeId,
			accountId: mockAccountId,
			executionMode: "simple",
			entryPrice: "50.00",
			exitPrice: null,
			exitDate: null,
			positionSize: "100",
			entryDate: new Date("2025-01-10"),
			commission: "50",
			fees: "30",
		}

		const entryExecution = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440082",
			tradeId: mockTradeId,
			executionType: "entry",
		})

		const mockInsertChain = {
			values: vi.fn().mockReturnValue({
				returning: vi.fn().mockResolvedValue([entryExecution]),
			}),
		}

		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue(tradeData as never)
		vi.mocked(db).insert.mockReturnValue(mockInsertChain as never)
		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([
			entryExecution,
		] as never)

		const result = (await convertToScaledMode(mockTradeId)) as ActionResponse<
			TradeExecution[]
		>

		expect(result.status).toBe("success")
		expect(result.data).toHaveLength(1)
		expect(result.data?.[0]?.executionType).toBe("entry")
	})
})

describe("recalculateTradeFromExecutions", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should recalculate trade aggregates from executions", async () => {
		const execution1 = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440090",
			tradeId: mockTradeId,
			executionType: "entry",
			quantity: "100",
			price: "50.00",
		})
		const execution2 = createMockExecution({
			id: "550e8400-e29b-41d4-a716-446655440091",
			tradeId: mockTradeId,
			executionType: "exit",
			quantity: "100",
			price: "52.00",
		})

		const mockUpdateChain = {
			set: vi.fn().mockReturnValue({
				where: vi.fn().mockResolvedValue(undefined),
			}),
		}

		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			executionMode: "scaled",
		} as never)

		vi.mocked(db).update.mockReturnValue(mockUpdateChain as never)
		vi.mocked(db.query.tradeExecutions).findMany.mockResolvedValue([
			execution1,
			execution2,
		] as never)

		const result = (await recalculateTradeFromExecutions(
			mockTradeId
		)) as ActionResponse<ExecutionSummary>

		expect(result.status).toBe("success")
		expect(result.data?.totalEntryQuantity).toBe(100)
	})

	it("should return error when trade is not in scaled mode", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue({
			id: mockTradeId,
			accountId: mockAccountId,
			executionMode: "simple",
		} as never)

		const result = (await recalculateTradeFromExecutions(
			mockTradeId
		)) as ActionResponse<ExecutionSummary>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_SCALED")
	})

	it("should return NOT_FOUND for nonexistent trade", async () => {
		vi.mocked(requireAuth).mockResolvedValue({
			userId: mockUserId,
			accountId: mockAccountId,
			showAllAccounts: false,
			allAccountIds: [mockAccountId],
		} as never)

		vi.mocked(db.query.trades).findFirst.mockResolvedValue(null as never)

		const result = (await recalculateTradeFromExecutions(
			mockTradeId
		)) as ActionResponse<ExecutionSummary>

		expect(result.status).toBe("error")
		expect(result.errors?.[0]?.code).toBe("NOT_FOUND")
	})
})
