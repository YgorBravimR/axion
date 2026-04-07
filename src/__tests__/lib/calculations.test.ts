/**
 * Unit tests for `calculateTickBasedPositionSize` and `calculateAssetPnL`
 * in src/lib/calculations.ts.
 *
 * All scenarios use realistic WIN parameters:
 *   tickSize  = 5 (points per tick)
 *   tickValue = 100 (cents per tick per contract, i.e. R$1.00)
 *
 * For WIN:
 *   - 1 point   = R$0.20
 *   - 1 tick    = 5 points = R$1.00
 *   - 10 ticks  = 50 points = R$10.00 per contract
 */

import { describe, it, expect } from "vitest"
import {
	calculateTickBasedPositionSize,
	calculateAssetPnL,
	calculateRMultiple,
	calculateDrawdown,
	determineOutcome,
	calculateProfitFactor,
	calculateWinRate,
} from "@/lib/calculations"

// ==========================================
// calculateTickBasedPositionSize
// ==========================================

describe("calculateTickBasedPositionSize", () => {
	// WIN baseline constants
	const WINFUT_TICK_SIZE = 5
	const WINFUT_TICK_VALUE = 100 // R$1.00 per tick in cents

	describe("normal cases", () => {
		it("should return 50 contracts when risk budget is R$500 and SL is 10 ticks away", () => {
			// 10 ticks × R$1 = R$10 risk per contract → R$500 / R$10 = 50 contracts
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 50000, // R$500
				entryPrice: 128000,
				stopLoss: 127950, // 50 points = 10 ticks
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
			})

			expect(result.contracts).toBe(50)
			expect(result.ticksAtRisk).toBe(10)
			expect(result.riskPerContractCents).toBe(1000) // 10 ticks × 100 cents
			expect(result.actualRiskCents).toBe(50000)
		})

		it("should return 5 contracts when risk budget is R$50 and SL is 10 ticks away", () => {
			// R$50 / (10 ticks × R$1) = 5 contracts
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 5000,
				entryPrice: 128000,
				stopLoss: 127950,
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
			})

			expect(result.contracts).toBe(5)
			expect(result.actualRiskCents).toBe(5000)
		})

		it("should floor fractional contracts correctly", () => {
			// R$150 / (10 ticks × R$1) = 15 contracts exactly → floor = 15
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 15000,
				entryPrice: 128000,
				stopLoss: 127950,
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
			})

			expect(result.contracts).toBe(15)
		})

		it("should floor when risk budget does not divide evenly", () => {
			// R$55 / (10 ticks × R$1) = 5.5 → floor = 5 contracts
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 5500,
				entryPrice: 128000,
				stopLoss: 127950,
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
			})

			expect(result.contracts).toBe(5)
			// actualRiskCents = 5 × (10 × 100) = 5000, not 5500
			expect(result.actualRiskCents).toBe(5000)
		})

		it("should correctly compute ticks at risk for a short trade (entry > SL)", () => {
			// Short trade: entry=128000, SL=128050, distance=50 points=10 ticks
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 10000,
				entryPrice: 128000,
				stopLoss: 128050,
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
			})

			expect(result.ticksAtRisk).toBe(10)
			expect(result.contracts).toBe(10)
		})
	})

	describe("WIN realistic example from docstring", () => {
		it("should return 22 contracts for a typical WIN trade", () => {
			// riskBudget=49500 cents, SL=110 ticks → floor(49500 / (22*100)) ≠ 22
			// Correct: 49500 / (110 × 100) = 4.5 → floor = 4
			// The docstring example in the prompt says: riskBudget=49500, SL=22 ticks → floor(49500/(22×100)) = 22
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 49500,
				entryPrice: 128000,
				stopLoss: 127890, // 110 points = 22 ticks
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
			})

			// 49500 / (22 ticks × 100) = 49500 / 2200 = 22.5 → floor = 22
			expect(result.ticksAtRisk).toBe(22)
			expect(result.contracts).toBe(22)
		})
	})

	describe("minimum contract enforcement", () => {
		it("should return 1 contract when risk budget is smaller than risk per contract", () => {
			// Risk per contract = 10 ticks × R$1 = R$10 (1000 cents)
			// Risk budget = R$5 (500 cents) < R$10 → minimum 1 contract
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 500, // R$5, too small for even 1 contract
				entryPrice: 128000,
				stopLoss: 127950, // 10 ticks
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
			})

			expect(result.contracts).toBe(1)
			// actualRiskCents reflects the true risk of 1 contract, not the budget
			expect(result.actualRiskCents).toBe(1000)
		})

		it("should return 1 contract when risk budget is exactly 1 cent", () => {
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 1,
				entryPrice: 128000,
				stopLoss: 127950,
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
			})

			expect(result.contracts).toBe(1)
		})
	})

	describe("maxContracts cap", () => {
		it("should cap contracts at maxContracts when calculated exceeds limit", () => {
			// Calculated: 50 contracts, cap: 10
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 50000,
				entryPrice: 128000,
				stopLoss: 127950, // 10 ticks
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
				maxContracts: 10,
			})

			expect(result.contracts).toBe(10)
			expect(result.actualRiskCents).toBe(10 * 1000) // 10 contracts × 1000 cents
		})

		it("should not apply cap when calculated is below maxContracts", () => {
			// Calculated: 5 contracts, cap: 20 → no cap applied
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 5000,
				entryPrice: 128000,
				stopLoss: 127950,
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
				maxContracts: 20,
			})

			expect(result.contracts).toBe(5)
		})

		it("should not apply cap when maxContracts is null", () => {
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 50000,
				entryPrice: 128000,
				stopLoss: 127950,
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
				maxContracts: null,
			})

			expect(result.contracts).toBe(50)
		})

		it("should not apply cap when maxContracts is 0", () => {
			// maxContracts=0 means no cap (guard condition: maxContracts > 0)
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 50000,
				entryPrice: 128000,
				stopLoss: 127950,
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
				maxContracts: 0,
			})

			expect(result.contracts).toBe(50)
		})
	})

	describe("zero SL distance (entry equals SL)", () => {
		it("should return 0 contracts when entry equals stop loss", () => {
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 50000,
				entryPrice: 128000,
				stopLoss: 128000, // same as entry — zero risk
				tickSize: WINFUT_TICK_SIZE,
				tickValue: WINFUT_TICK_VALUE,
			})

			expect(result.contracts).toBe(0)
			expect(result.ticksAtRisk).toBe(0)
			expect(result.riskPerContractCents).toBe(0)
			expect(result.actualRiskCents).toBe(0)
		})

		it("should return 0 contracts when tickValue is 0", () => {
			const result = calculateTickBasedPositionSize({
				riskBudgetCents: 50000,
				entryPrice: 128000,
				stopLoss: 127950,
				tickSize: WINFUT_TICK_SIZE,
				tickValue: 0, // degenerate: no monetary value per tick
			})

			expect(result.contracts).toBe(0)
		})
	})
})

// ==========================================
// calculateAssetPnL
// ==========================================

describe("calculateAssetPnL", () => {
	const WINFUT_TICK_SIZE = 5
	const WINFUT_TICK_VALUE = 1.0 // R$1.00 per tick (not cents — this function takes dollars)

	it("should calculate gross P&L for a long winning trade", () => {
		// Entry: 128000, Exit: 128050, 10 ticks gained × R$1 × 2 contracts = R$20
		const result = calculateAssetPnL({
			entryPrice: 128000,
			exitPrice: 128050,
			positionSize: 2,
			direction: "long",
			tickSize: WINFUT_TICK_SIZE,
			tickValue: WINFUT_TICK_VALUE,
		})

		expect(result.ticksGained).toBe(10)
		expect(result.grossPnl).toBeCloseTo(20.0)
		expect(result.netPnl).toBeCloseTo(20.0) // no costs
	})

	it("should calculate net P&L after commissions and fees", () => {
		// 10 ticks × R$1 × 2 contracts = R$20 gross
		// 2 contracts × 2 executions = 4 contract-executions
		// Costs: (R$0.50 commission + R$0.10 fees) × 4 = R$2.40
		const result = calculateAssetPnL({
			entryPrice: 128000,
			exitPrice: 128050,
			positionSize: 2,
			direction: "long",
			tickSize: WINFUT_TICK_SIZE,
			tickValue: WINFUT_TICK_VALUE,
			commission: 0.50,
			fees: 0.10,
		})

		expect(result.grossPnl).toBeCloseTo(20.0)
		expect(result.totalCosts).toBeCloseTo(2.40)
		expect(result.netPnl).toBeCloseTo(17.60)
	})

	it("should calculate negative P&L for a losing short trade", () => {
		// Short: entry=128000, exit=128100 → price moved against → -20 ticks × R$1 × 1 = -R$20
		const result = calculateAssetPnL({
			entryPrice: 128000,
			exitPrice: 128100,
			positionSize: 1,
			direction: "short",
			tickSize: WINFUT_TICK_SIZE,
			tickValue: WINFUT_TICK_VALUE,
		})

		expect(result.ticksGained).toBe(-20)
		expect(result.grossPnl).toBeCloseTo(-20.0)
	})

	it("should use contractsExecuted to compute costs when provided", () => {
		// Scaled position: 4 contract executions instead of default 2×2=4
		const result = calculateAssetPnL({
			entryPrice: 128000,
			exitPrice: 128050,
			positionSize: 2,
			direction: "long",
			tickSize: WINFUT_TICK_SIZE,
			tickValue: WINFUT_TICK_VALUE,
			commission: 0.50,
			fees: 0.10,
			contractsExecuted: 6, // 3 entry + 3 exit executions
		})

		// Costs: (0.50 + 0.10) × 6 = R$3.60
		expect(result.totalCosts).toBeCloseTo(3.60)
		expect(result.netPnl).toBeCloseTo(20.0 - 3.60)
	})
})

// ==========================================
// determineOutcome
// ==========================================

describe("determineOutcome", () => {
	it("should return 'win' when P&L is positive", () => {
		expect(determineOutcome({ pnl: 100 })).toBe("win")
	})

	it("should return 'loss' when P&L is negative", () => {
		expect(determineOutcome({ pnl: -50 })).toBe("loss")
	})

	it("should return 'breakeven' when P&L is zero", () => {
		expect(determineOutcome({ pnl: 0 })).toBe("breakeven")
	})

	it("should return 'breakeven' when ticks gained are within breakeven threshold", () => {
		// Trade gained +2 ticks but breakevenTicks=5 → classified as breakeven
		expect(determineOutcome({ pnl: 10, ticksGained: 2, breakevenTicks: 5 })).toBe("breakeven")
	})

	it("should return 'loss' when ticks gained are negative beyond breakeven threshold", () => {
		expect(determineOutcome({ pnl: -50, ticksGained: -8, breakevenTicks: 5 })).toBe("loss")
	})

	it("should ignore ticksGained when breakevenTicks is 0", () => {
		// Falls back to P&L-based classification
		expect(determineOutcome({ pnl: 10, ticksGained: 2, breakevenTicks: 0 })).toBe("win")
	})
})

// ==========================================
// calculateRMultiple
// ==========================================

describe("calculateRMultiple", () => {
	it("should return 2 when P&L is 2× the risk amount", () => {
		expect(calculateRMultiple(2000, 1000)).toBeCloseTo(2.0)
	})

	it("should return -1 when the entire risk amount is lost", () => {
		expect(calculateRMultiple(-1000, 1000)).toBeCloseTo(-1.0)
	})

	it("should return 0 when riskAmount is 0 to avoid division by zero", () => {
		expect(calculateRMultiple(500, 0)).toBe(0)
	})
})

// ==========================================
// calculateDrawdown
// ==========================================

describe("calculateDrawdown", () => {
	it("should return 0 when equity equals peak", () => {
		expect(calculateDrawdown(100000, 100000)).toBe(0)
	})

	it("should return 10% when equity is 10% below peak", () => {
		expect(calculateDrawdown(90000, 100000)).toBeCloseTo(10.0)
	})

	it("should return 0 when peak is 0 to avoid division by zero", () => {
		expect(calculateDrawdown(0, 0)).toBe(0)
	})

	it("should return correct drawdown for partial loss", () => {
		// Peak=120000, equity=100000 → (120000-100000)/120000 = 16.67%
		expect(calculateDrawdown(100000, 120000)).toBeCloseTo(16.67, 1)
	})
})

// ==========================================
// calculateProfitFactor
// ==========================================

describe("calculateProfitFactor", () => {
	it("should return 2 when gross profit is double the gross loss", () => {
		expect(calculateProfitFactor(2000, 1000)).toBeCloseTo(2.0)
	})

	it("should return Infinity when there are no losses", () => {
		expect(calculateProfitFactor(5000, 0)).toBe(Infinity)
	})

	it("should return 0 when there are no profits and no losses", () => {
		expect(calculateProfitFactor(0, 0)).toBe(0)
	})
})

// ==========================================
// calculateWinRate
// ==========================================

describe("calculateWinRate", () => {
	it("should return 60 when 3 of 5 trades are wins", () => {
		expect(calculateWinRate(3, 5)).toBe(60)
	})

	it("should return 100 when all trades are wins", () => {
		expect(calculateWinRate(10, 10)).toBe(100)
	})

	it("should return 0 when no wins", () => {
		expect(calculateWinRate(0, 5)).toBe(0)
	})

	it("should return 0 when total is 0 to avoid division by zero", () => {
		expect(calculateWinRate(0, 0)).toBe(0)
	})
})
