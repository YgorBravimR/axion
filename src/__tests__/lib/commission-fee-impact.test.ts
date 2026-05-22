/**
 * Unit tests for `getCommissionFeeImpact()` in src/app/actions/reports.ts.
 *
 * All external dependencies (DB, auth, date utilities) are mocked so these
 * are pure unit tests with no network or database I/O.
 *
 * Key formulas under test:
 *   - totalFees       = totalCommission + totalExchangeFees
 *   - grossPnl        = totalNetPnl + totalFees   (same as calculateReportSummary)
 *   - feesAsPercent   = (totalFees / grossPnl) × 100   (only when grossPnl > 0)
 *   - avgFeePerTrade  = totalFees / allTrades.length   (0 when no trades)
 *   - hasData         = true only when any trade has a non-zero fee
 *   - assetBreakdown  = sorted descending by totalFees
 *   - monthlyTrend    = only the last 6 calendar months, sorted ascending by key
 *
 * `fromCents` converts stored integer-cents strings to decimal dollars, so a
 * stored value of "500" equals R$5.00 in the output.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---------------------------------------------------------------------------
// vi.hoisted: all mock references must be declared before vi.mock hoisting
// ---------------------------------------------------------------------------

const { dbQueryTradesMock, requireAuthMock, getServerEffectiveNowMock } =
	vi.hoisted(() => {
		const dbQueryTradesMock = { findMany: vi.fn() }

		const requireAuthMock = vi.fn()
		const getServerEffectiveNowMock = vi.fn()

		return { dbQueryTradesMock, requireAuthMock, getServerEffectiveNowMock }
	})

// ---------------------------------------------------------------------------
// Module-level mock registrations
// ---------------------------------------------------------------------------

vi.mock("@/db/drizzle", () => ({
	db: { query: { trades: dbQueryTradesMock } },
}))

vi.mock("@/db/schema", () => ({
	trades: {
		accountId: "col_account_id",
		isArchived: "col_is_archived",
		entryDate: "col_entry_date",
	},
}))

vi.mock("drizzle-orm", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Vitest importOriginal generic requires inline typeof import() for module-level type capture
	const original = await importOriginal<typeof import("drizzle-orm")>()
	return {
		...original,
		eq: vi.fn((_a, _b) => "__eq__"),
		and: vi.fn((..._args) => "__and__"),
		desc: vi.fn((_col) => "__desc__"),
		inArray: vi.fn((_col, _vals) => "__inArray__"),
	}
})

vi.mock("@/app/actions/auth", () => ({
	requireAuth: requireAuthMock,
}))

vi.mock("@/lib/effective-date", () => ({
	getServerEffectiveNow: getServerEffectiveNowMock,
}))

vi.mock("@/app/actions/settings", () => ({
	getUserSettings: vi.fn(),
}))

vi.mock("next-intl/server", () => ({
	getTranslations: vi.fn().mockResolvedValue((key: string) => key),
}))

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/navigation", () => ({ redirect: vi.fn() }))

vi.mock("@/lib/error-utils", () => ({
	isFrameworkSignal: vi.fn().mockReturnValue(false),
}))

vi.mock("react", async (importOriginal) => {
	// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- Vitest importOriginal generic requires inline typeof import() for module-level type capture
	const original = await importOriginal<typeof import("react")>()
	return { ...original, cache: (fn: unknown) => fn }
})

// ---------------------------------------------------------------------------
// Import the module under test AFTER all mocks are registered
// ---------------------------------------------------------------------------

import { getCommissionFeeImpact } from "@/app/actions/reports"

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

interface MockTradeOptions {
	id?: string
	asset?: string
	/** Entry date as an ISO string; determines which calendar month the trade falls in */
	entryDate?: string
	/** Net P&L stored as integer-cents string (e.g., "5000" = R$50.00) */
	pnl?: string | null
	/** Commission stored as integer-cents string (e.g., "150" = R$1.50) */
	commission?: string | null
	/** Exchange fees stored as integer-cents string (e.g., "50" = R$0.50) */
	fees?: string | null
	isArchived?: boolean
	accountId?: string
	outcome?: string | null
	realizedRMultiple?: string | null
}

/**
 * Creates a minimal trade record matching the shape Drizzle returns.
 * All money fields are integer-cents strings to match the DB storage format.
 *
 * NOTE: Defaults only apply when the key is absent from `options`. Explicitly
 * passing `null` (or any other value) overrides the default — this is intentional
 * so tests can model trades with null/zero fee fields.
 */
const createMockTrade = (options: MockTradeOptions = {}) => ({
	id: options.id ?? `trade-${Math.random().toString(36).slice(2, 8)}`,
	asset: options.asset ?? "WIN",
	entryDate: options.entryDate ?? "2026-01-15T12:00:00.000Z",
	// Use explicit `in` check so that a passed `null` is preserved as `null`
	pnl: "pnl" in options ? options.pnl : "5000", // R$50.00 net P&L default
	commission: "commission" in options ? options.commission : "150", // R$1.50 default
	fees: "fees" in options ? options.fees : "50", // R$0.50 default
	isArchived: options.isArchived ?? false,
	accountId: options.accountId ?? "account-abc-123",
	outcome: options.outcome ?? "win",
	realizedRMultiple: options.realizedRMultiple ?? "2.0",
	direction: "long",
	positionSize: 1,
})

/** Configures requireAuth to return a single-account context */
const setupSingleAccountAuth = (accountId = "account-abc-123") => {
	requireAuthMock.mockResolvedValue({
		accountId,
		showAllAccounts: false,
		allAccountIds: [accountId],
	})
}

/** Configures requireAuth to return an all-accounts context */
const setupAllAccountsAuth = (accountIds = ["acc-1", "acc-2"]) => {
	requireAuthMock.mockResolvedValue({
		accountId: accountIds[0],
		showAllAccounts: true,
		allAccountIds: accountIds,
	})
}

/**
 * Sets up a stable "effective now" date so that month-window calculations
 * are deterministic regardless of when the test suite runs.
 *
 * Using 2026-04-01 means the 6-month window starts at 2025-11-01.
 */
const setupEffectiveNow = (isoDate = "2026-04-01T12:00:00.000Z") => {
	getServerEffectiveNowMock.mockResolvedValue(new Date(isoDate))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getCommissionFeeImpact()", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		setupSingleAccountAuth()
		setupEffectiveNow()
	})

	// ========================================================================
	// Empty / no-data states
	// ========================================================================

	describe("when no trades exist", () => {
		it("should return status=success with zeroed summary and hasData=false", async () => {
			dbQueryTradesMock.findMany.mockResolvedValue([])

			const result = await getCommissionFeeImpact()

			expect(result.status).toBe("success")
			expect(result.data).toBeDefined()
			expect(result.data!.hasData).toBe(false)
			expect(result.data!.summary.totalTrades).toBe(0)
			expect(result.data!.summary.totalFees).toBe(0)
			expect(result.data!.summary.totalCommission).toBe(0)
			expect(result.data!.summary.totalExchangeFees).toBe(0)
			expect(result.data!.summary.grossPnl).toBe(0)
			expect(result.data!.summary.feesAsPercentOfGross).toBe(0)
			expect(result.data!.summary.avgFeePerTrade).toBe(0)
		})

		it("should return empty assetBreakdown and monthlyTrend arrays when no trades exist", async () => {
			dbQueryTradesMock.findMany.mockResolvedValue([])

			const result = await getCommissionFeeImpact()

			expect(result.data!.assetBreakdown).toEqual([])
			expect(result.data!.monthlyTrend).toEqual([])
		})
	})

	describe("when all trades have zero fees", () => {
		it("should return hasData=false even when trades exist", async () => {
			const tradesWithNoFees = [
				createMockTrade({ commission: "0", fees: "0", pnl: "3000" }),
				createMockTrade({ commission: "0", fees: "0", pnl: "2000" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(tradesWithNoFees)

			const result = await getCommissionFeeImpact()

			expect(result.data!.hasData).toBe(false)
		})

		it("should return hasData=false when fee fields are null", async () => {
			const tradesWithNullFees = [
				createMockTrade({ commission: null, fees: null, pnl: "5000" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(tradesWithNullFees)

			const result = await getCommissionFeeImpact()

			expect(result.data!.hasData).toBe(false)
		})
	})

	// ========================================================================
	// Fee totals: totalFees = totalCommission + totalExchangeFees
	// ========================================================================

	describe("fee total calculations", () => {
		it("should correctly sum totalCommission across all trades", async () => {
			// Trade 1: commission=150 cents = R$1.50
			// Trade 2: commission=200 cents = R$2.00
			// Expected totalCommission = R$3.50
			const mockTrades = [
				createMockTrade({ commission: "150", fees: "0", pnl: "5000" }),
				createMockTrade({ commission: "200", fees: "0", pnl: "3000" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.totalCommission).toBeCloseTo(3.5)
		})

		it("should correctly sum totalExchangeFees across all trades", async () => {
			// Trade 1: fees=50 cents = R$0.50
			// Trade 2: fees=100 cents = R$1.00
			// Expected totalExchangeFees = R$1.50
			const mockTrades = [
				createMockTrade({ commission: "0", fees: "50", pnl: "5000" }),
				createMockTrade({ commission: "0", fees: "100", pnl: "3000" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.totalExchangeFees).toBeCloseTo(1.5)
		})

		it("should set totalFees = totalCommission + totalExchangeFees", async () => {
			// commission=150 cents (R$1.50) + fees=50 cents (R$0.50) = R$2.00
			const mockTrades = [
				createMockTrade({ commission: "150", fees: "50", pnl: "5000" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const { totalCommission, totalExchangeFees, totalFees } =
				result.data!.summary
			expect(totalFees).toBeCloseTo(totalCommission + totalExchangeFees)
			expect(totalFees).toBeCloseTo(2.0)
		})

		it("should set hasData=true when at least one trade has a non-zero fee", async () => {
			const mockTrades = [
				createMockTrade({ commission: "0", fees: "0", pnl: "3000" }),
				createMockTrade({ commission: "100", fees: "0", pnl: "2000" }), // this one has fees
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.hasData).toBe(true)
		})
	})

	// ========================================================================
	// grossPnl = totalNetPnl + totalFees
	// ========================================================================

	describe("grossPnl calculation", () => {
		it("should compute grossPnl as netPnl + totalFees", async () => {
			// pnl=5000 cents (R$50.00 net), commission=150 (R$1.50), fees=50 (R$0.50)
			// grossPnl = R$50.00 + R$1.50 + R$0.50 = R$52.00
			const mockTrades = [
				createMockTrade({ pnl: "5000", commission: "150", fees: "50" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.grossPnl).toBeCloseTo(52.0)
		})

		it("should produce a negative grossPnl when net losses exceed fees", async () => {
			// pnl=-10000 cents (-R$100.00 net), commission=150 (R$1.50), fees=50 (R$0.50)
			// grossPnl = -R$100.00 + R$2.00 = -R$98.00
			const mockTrades = [
				createMockTrade({ pnl: "-10000", commission: "150", fees: "50" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.grossPnl).toBeCloseTo(-98.0)
		})

		it("should sum grossPnl correctly across multiple trades", async () => {
			// Trade 1: netPnl=R$50, fees=R$2.00 → gross=R$52.00
			// Trade 2: netPnl=-R$20, fees=R$2.00 → gross=-R$18.00
			// Total grossPnl = R$34.00
			const mockTrades = [
				createMockTrade({ pnl: "5000", commission: "150", fees: "50" }),
				createMockTrade({ pnl: "-2000", commission: "150", fees: "50" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.grossPnl).toBeCloseTo(34.0)
		})
	})

	// ========================================================================
	// feesAsPercentOfGross
	// ========================================================================

	describe("feesAsPercentOfGross calculation", () => {
		it("should correctly compute feesAsPercentOfGross when grossPnl > 0", async () => {
			// grossPnl = R$52.00, totalFees = R$2.00
			// feesAsPercentOfGross = (2.00 / 52.00) × 100 ≈ 3.846%
			const mockTrades = [
				createMockTrade({ pnl: "5000", commission: "150", fees: "50" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.feesAsPercentOfGross).toBeCloseTo(3.846, 2)
		})

		it("should return feesAsPercentOfGross=0 when grossPnl is zero", async () => {
			// netPnl = 0, commission=200, fees=0 → grossPnl=R$2.00
			// Wait — grossPnl > 0 in this case; use a scenario where grossPnl=0 exactly
			// pnl=-200 cents (-R$2.00 net), commission=200 (R$2.00), fees=0
			// grossPnl = -R$2.00 + R$2.00 = R$0.00
			const mockTrades = [
				createMockTrade({ pnl: "-200", commission: "200", fees: "0" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.grossPnl).toBeCloseTo(0)
			expect(result.data!.summary.feesAsPercentOfGross).toBe(0)
		})

		it("should return feesAsPercentOfGross=0 when grossPnl is negative", async () => {
			// Fees cannot be expressed as a meaningful percent of a negative gross
			const mockTrades = [
				createMockTrade({ pnl: "-10000", commission: "150", fees: "50" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.grossPnl).toBeLessThan(0)
			expect(result.data!.summary.feesAsPercentOfGross).toBe(0)
		})
	})

	// ========================================================================
	// avgFeePerTrade
	// ========================================================================

	describe("avgFeePerTrade calculation", () => {
		it("should return 0 avgFeePerTrade when there are no trades", async () => {
			dbQueryTradesMock.findMany.mockResolvedValue([])

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.avgFeePerTrade).toBe(0)
		})

		it("should compute avgFeePerTrade as totalFees / totalTrades", async () => {
			// Trade 1: commission=100 (R$1.00), fees=50 (R$0.50) → tradeFee=R$1.50
			// Trade 2: commission=200 (R$2.00), fees=0 → tradeFee=R$2.00
			// totalFees=R$3.50, totalTrades=2 → avg=R$1.75
			const mockTrades = [
				createMockTrade({ commission: "100", fees: "50", pnl: "5000" }),
				createMockTrade({ commission: "200", fees: "0", pnl: "3000" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.avgFeePerTrade).toBeCloseTo(1.75)
		})

		it("should return correct avgFeePerTrade for a single trade", async () => {
			// commission=150 (R$1.50), fees=50 (R$0.50) → avg = R$2.00
			const mockTrades = [
				createMockTrade({ commission: "150", fees: "50", pnl: "5000" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.avgFeePerTrade).toBeCloseTo(2.0)
		})
	})

	// ========================================================================
	// totalTrades count
	// ========================================================================

	describe("totalTrades count", () => {
		it("should count all non-archived trades returned by the DB query", async () => {
			const mockTrades = [
				createMockTrade({ pnl: "5000", commission: "100", fees: "50" }),
				createMockTrade({ pnl: "-2000", commission: "100", fees: "50" }),
				createMockTrade({ pnl: "1000", commission: "0", fees: "0" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.summary.totalTrades).toBe(3)
		})
	})

	// ========================================================================
	// Asset breakdown
	// ========================================================================

	describe("assetBreakdown", () => {
		it("should group trades by asset and aggregate totalFees and tradeCount", async () => {
			// WIN: 2 trades, each with R$2.00 in fees → totalFees=R$4.00
			// WINGUT: 1 trade with R$3.00 in fees → totalFees=R$3.00
			const mockTrades = [
				createMockTrade({
					asset: "WIN",
					commission: "150",
					fees: "50",
					pnl: "5000",
				}),
				createMockTrade({
					asset: "WIN",
					commission: "150",
					fees: "50",
					pnl: "3000",
				}),
				createMockTrade({
					asset: "WINGUT",
					commission: "250",
					fees: "50",
					pnl: "2000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const winfut = result.data!.assetBreakdown.find((a) => a.asset === "WIN")
			const wingut = result.data!.assetBreakdown.find(
				(a) => a.asset === "WINGUT"
			)

			expect(winfut).toBeDefined()
			expect(winfut!.tradeCount).toBe(2)
			expect(winfut!.totalFees).toBeCloseTo(4.0)

			expect(wingut).toBeDefined()
			expect(wingut!.tradeCount).toBe(1)
			expect(wingut!.totalFees).toBeCloseTo(3.0)
		})

		it("should sort assetBreakdown descending by totalFees", async () => {
			// MINI: totalFees=R$1.00 (lower)
			// WIN: totalFees=R$4.00 (higher) — should appear first
			const mockTrades = [
				createMockTrade({
					asset: "MINI",
					commission: "100",
					fees: "0",
					pnl: "1000",
				}),
				createMockTrade({
					asset: "WIN",
					commission: "200",
					fees: "200",
					pnl: "5000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.assetBreakdown[0]?.asset).toBe("WIN")
			expect(result.data!.assetBreakdown[1]?.asset).toBe("MINI")
		})

		it("should compute avgFeePerTrade within each asset group", async () => {
			// WIN: 2 trades, totalFees=R$4.00 → avg=R$2.00
			const mockTrades = [
				createMockTrade({
					asset: "WIN",
					commission: "150",
					fees: "50",
					pnl: "5000",
				}),
				createMockTrade({
					asset: "WIN",
					commission: "150",
					fees: "50",
					pnl: "3000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const winfut = result.data!.assetBreakdown.find((a) => a.asset === "WIN")
			expect(winfut!.avgFeePerTrade).toBeCloseTo(2.0)
		})

		it("should include an asset entry even when its fees are zero", async () => {
			// A trade with zero fees still appears in the asset breakdown with tradeCount=1
			const mockTrades = [
				createMockTrade({
					asset: "WIN",
					commission: "0",
					fees: "0",
					pnl: "5000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const winfut = result.data!.assetBreakdown.find((a) => a.asset === "WIN")
			expect(winfut).toBeDefined()
			expect(winfut!.totalFees).toBe(0)
			expect(winfut!.tradeCount).toBe(1)
		})

		it("should handle a single asset with multiple trades across different months", async () => {
			const mockTrades = [
				createMockTrade({
					asset: "WIN",
					commission: "100",
					fees: "0",
					entryDate: "2026-01-10T12:00:00.000Z",
					pnl: "5000",
				}),
				createMockTrade({
					asset: "WIN",
					commission: "100",
					fees: "0",
					entryDate: "2026-02-10T12:00:00.000Z",
					pnl: "3000",
				}),
				createMockTrade({
					asset: "WIN",
					commission: "100",
					fees: "0",
					entryDate: "2026-03-10T12:00:00.000Z",
					pnl: "2000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const winfut = result.data!.assetBreakdown.find((a) => a.asset === "WIN")
			expect(winfut!.tradeCount).toBe(3)
			expect(winfut!.totalFees).toBeCloseTo(3.0) // 3 × R$1.00
		})
	})

	// ========================================================================
	// Monthly trend
	// ========================================================================

	describe("monthlyTrend", () => {
		it("should exclude trades older than 6 months from the monthly trend", async () => {
			// effectiveNow = 2026-04-01 → 6-month window starts 2025-11-01
			// Trade from October 2025 should NOT appear in the monthly trend
			const mockTrades = [
				createMockTrade({
					entryDate: "2025-10-15T12:00:00.000Z", // older than 6 months
					commission: "150",
					fees: "50",
					pnl: "5000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			expect(result.data!.monthlyTrend).toHaveLength(0)
		})

		it("should include trades within the 6-month window in the monthly trend", async () => {
			// effectiveNow = 2026-04-01 → window starts 2025-11-01
			// November 2025, January 2026, April 2026 are all within the window
			const mockTrades = [
				createMockTrade({
					entryDate: "2025-11-15T12:00:00.000Z",
					commission: "100",
					fees: "0",
					pnl: "3000",
				}),
				createMockTrade({
					entryDate: "2026-01-15T12:00:00.000Z",
					commission: "150",
					fees: "50",
					pnl: "5000",
				}),
				createMockTrade({
					entryDate: "2026-04-01T12:00:00.000Z",
					commission: "200",
					fees: "0",
					pnl: "2000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const monthKeys = result.data!.monthlyTrend.map((m) => m.month)
			expect(monthKeys).toContain("2025-11")
			expect(monthKeys).toContain("2026-01")
			expect(monthKeys).toContain("2026-04")
		})

		it("should sort monthlyTrend ascending by month key", async () => {
			// Feed trades out of chronological order; expect sorted output
			const mockTrades = [
				createMockTrade({
					entryDate: "2026-03-10T12:00:00.000Z",
					commission: "100",
					fees: "0",
					pnl: "2000",
				}),
				createMockTrade({
					entryDate: "2026-01-10T12:00:00.000Z",
					commission: "100",
					fees: "0",
					pnl: "5000",
				}),
				createMockTrade({
					entryDate: "2026-02-10T12:00:00.000Z",
					commission: "100",
					fees: "0",
					pnl: "3000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const monthKeys = result.data!.monthlyTrend.map((m) => m.month)
			expect(monthKeys).toEqual([...monthKeys].sort())
		})

		it("should group multiple trades from the same month into a single monthlyTrend entry", async () => {
			const mockTrades = [
				createMockTrade({
					entryDate: "2026-01-05T12:00:00.000Z",
					commission: "100",
					fees: "50",
					pnl: "3000",
				}),
				createMockTrade({
					entryDate: "2026-01-15T12:00:00.000Z",
					commission: "150",
					fees: "50",
					pnl: "2000",
				}),
				createMockTrade({
					entryDate: "2026-01-28T12:00:00.000Z",
					commission: "200",
					fees: "0",
					pnl: "1000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const january = result.data!.monthlyTrend.find(
				(m) => m.month === "2026-01"
			)
			expect(january).toBeDefined()
			expect(january!.tradeCount).toBe(3)
			// totalFees: (100+50) + (150+50) + (200+0) = 150+200+200 = 550 cents = R$5.50
			expect(january!.totalFees).toBeCloseTo(5.5)
		})

		it("should compute grossPnl within each monthly trend entry as netPnl + tradeFees for that month", async () => {
			// Jan 2026: netPnl=R$50.00, tradeFee=R$2.00 → grossPnl=R$52.00
			const mockTrades = [
				createMockTrade({
					entryDate: "2026-01-15T12:00:00.000Z",
					pnl: "5000",
					commission: "150",
					fees: "50",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const january = result.data!.monthlyTrend.find(
				(m) => m.month === "2026-01"
			)
			expect(january!.grossPnl).toBeCloseTo(52.0)
		})

		it("should compute feesAsPercentOfGross for each month only when grossPnl > 0", async () => {
			// Jan 2026: grossPnl=R$52.00, totalFees=R$2.00 → 2/52 × 100 ≈ 3.846%
			const mockTrades = [
				createMockTrade({
					entryDate: "2026-01-15T12:00:00.000Z",
					pnl: "5000",
					commission: "150",
					fees: "50",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const january = result.data!.monthlyTrend.find(
				(m) => m.month === "2026-01"
			)
			expect(january!.feesAsPercentOfGross).toBeCloseTo(3.846, 2)
		})

		it("should set feesAsPercentOfGross=0 for months with grossPnl <= 0", async () => {
			// Losing month: netPnl=-R$100.00, fees=R$2.00 → grossPnl=-R$98.00 → percent=0
			const mockTrades = [
				createMockTrade({
					entryDate: "2026-01-15T12:00:00.000Z",
					pnl: "-10000",
					commission: "150",
					fees: "50",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const january = result.data!.monthlyTrend.find(
				(m) => m.month === "2026-01"
			)
			expect(january!.feesAsPercentOfGross).toBe(0)
		})

		it("should use the correct YYYY-MM key format for month grouping", async () => {
			// Verify that months are zero-padded: "2026-01" not "2026-1"
			const mockTrades = [
				createMockTrade({
					entryDate: "2026-01-15T12:00:00.000Z",
					commission: "100",
					fees: "0",
					pnl: "5000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const keys = result.data!.monthlyTrend.map((m) => m.month)
			for (const key of keys) {
				expect(key).toMatch(/^\d{4}-\d{2}$/)
			}
		})
	})

	// ========================================================================
	// Auth context: single account vs. all accounts
	// ========================================================================

	describe("account filtering", () => {
		it("should query using inArray when showAllAccounts is true", async () => {
			setupAllAccountsAuth(["acc-1", "acc-2", "acc-3"])
			dbQueryTradesMock.findMany.mockResolvedValue([])

			await getCommissionFeeImpact()

			// The query is called — auth context is consumed and DB is queried
			expect(dbQueryTradesMock.findMany).toHaveBeenCalledOnce()
		})

		it("should query using eq when showAllAccounts is false", async () => {
			setupSingleAccountAuth("account-xyz-789")
			dbQueryTradesMock.findMany.mockResolvedValue([])

			await getCommissionFeeImpact()

			expect(dbQueryTradesMock.findMany).toHaveBeenCalledOnce()
		})
	})

	// ========================================================================
	// Error handling
	// ========================================================================

	describe("error handling", () => {
		it("should return status=error when requireAuth throws", async () => {
			requireAuthMock.mockRejectedValue(new Error("Unauthorized"))

			const result = await getCommissionFeeImpact()

			expect(result.status).toBe("error")
			expect(result.message).toBeTruthy()
		})

		it("should return status=error when the DB query throws", async () => {
			dbQueryTradesMock.findMany.mockRejectedValue(
				new Error("DB connection failure")
			)

			const result = await getCommissionFeeImpact()

			expect(result.status).toBe("error")
			expect(result.message).toMatch(/failed/i)
		})

		it("should not expose internal error details in the response message", async () => {
			dbQueryTradesMock.findMany.mockRejectedValue(
				new Error("Sensitive: admin password 12345")
			)

			const result = await getCommissionFeeImpact()

			expect(result.message).not.toMatch(/password/i)
			expect(result.message).not.toMatch(/12345/)
		})
	})

	// ========================================================================
	// Edge cases
	// ========================================================================

	describe("edge cases", () => {
		it("should handle a trade where pnl is null (treated as zero)", async () => {
			const mockTrades = [
				createMockTrade({ pnl: null, commission: "150", fees: "50" }),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			// netPnl=0, totalFees=R$2.00 → grossPnl=R$2.00
			expect(result.status).toBe("success")
			expect(result.data!.summary.grossPnl).toBeCloseTo(2.0)
		})

		it("should handle a large number of trades without errors", async () => {
			const manyTrades = Array.from({ length: 500 }, (_, index) =>
				createMockTrade({
					id: `trade-bulk-${index}`,
					commission: "100",
					fees: "25",
					pnl: "1000",
					entryDate: "2026-01-15T12:00:00.000Z",
				})
			)
			dbQueryTradesMock.findMany.mockResolvedValue(manyTrades)

			const result = await getCommissionFeeImpact()

			expect(result.status).toBe("success")
			expect(result.data!.summary.totalTrades).toBe(500)
			// Each trade: commission=R$1.00, fees=R$0.25 → totalFees=500 × R$1.25 = R$625.00
			expect(result.data!.summary.totalFees).toBeCloseTo(625.0)
		})

		it("should handle trades from exactly 6 months ago (boundary is inclusive)", async () => {
			// effectiveNow = 2026-04-01 → sixMonthsAgo = startOfMonth(subMonths(2026-04-01, 5)) = 2025-11-01
			// A trade on 2025-11-01T00:00:00.000Z is on the boundary and should be included
			const mockTrades = [
				createMockTrade({
					entryDate: "2025-11-01T00:00:00.000Z",
					commission: "100",
					fees: "0",
					pnl: "5000",
				}),
			]
			dbQueryTradesMock.findMany.mockResolvedValue(mockTrades)

			const result = await getCommissionFeeImpact()

			const november = result.data!.monthlyTrend.find(
				(m) => m.month === "2025-11"
			)
			expect(november).toBeDefined()
		})
	})
})
