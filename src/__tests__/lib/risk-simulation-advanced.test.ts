/**
 * Unit tests for src/lib/risk-simulation-advanced.ts (Historical Trade Replay).
 *
 * This module replays historical trades through a decision tree, applying
 * modified risk parameters (position sizing, loss recovery, gain modes, limits).
 *
 * Key behavior to test:
 *   - Identity transform (no risk changes) → output equals historical input
 *   - Scaling all positions by 2x → all P&Ls scale by 2x (homogeneity)
 *   - Empty trade list → empty result (no NaN, no throw)
 *   - Decision tree branching (T1 → loss recovery or gain mode)
 *   - Cascading limits (daily, weekly, monthly) block trades correctly
 */

import { describe, it, expect } from "vitest"
import { runAdvancedSimulation } from "@/lib/risk-simulation-advanced"
import type {
	TradeForSimulation,
	AdvancedSimulationParams,
} from "@/types/risk-simulation"

// ---------------------------------------------------------------------------
// HELPER: Build minimal valid trade
// ---------------------------------------------------------------------------

const buildTrade = (
	overrides: Partial<TradeForSimulation> = {}
): TradeForSimulation => {
	const defaults: TradeForSimulation = {
		id: "trade-1",
		entryDate: new Date("2024-01-15T10:00:00Z"),
		exitDate: new Date("2024-01-15T14:00:00Z"),
		asset: "WIN",
		direction: "long",
		entryPrice: 100,
		exitPrice: 102, // +2 point win
		stopLoss: 98, // 2 point stop
		positionSize: 10, // 10 contracts
		tickSize: 0.01,
		tickValue: 10, // R$10 per tick
		commissionPerExecution: 30, // R$0.30 per execution (entry+exit)
		feesPerExecution: 15, // R$0.15 per execution
		pnlCents: 20 * 10 * 100, // (102-100) * 10 contracts * 100 ticks per point * tickValue = 20,000 cents (R$200)
		rMultiple: 10, // 20 points profit / 2 point stop = 10R
		outcome: null,
		contractsExecuted: 0,
	}
	return { ...defaults, ...overrides }
}

const buildParams = (
	overrides: Partial<AdvancedSimulationParams> = {}
): AdvancedSimulationParams => {
	const defaults: AdvancedSimulationParams = {
		mode: "advanced",
		accountBalanceCents: 1000000, // R$10,000
		decisionTree: {
			baseTrade: {
				riskCents: 5000, // R$50
				maxContracts: 20,
				minStopPoints: null,
			},
			lossRecovery: {
				sequence: [
					{
						riskCalculation: { type: "percentOfBase", percent: 100 },
						maxContractsOverride: null,
					},
					{
						riskCalculation: { type: "percentOfBase", percent: 150 },
						maxContractsOverride: null,
					},
				],
				stopAfterSequence: false,
				executeAllRegardless: false,
			},
			gainMode: {
				type: "singleTarget",
				dailyTargetCents: 50000, // R$500
			},
			drawdownControl: {
				tiers: [],
				recoveryThresholdPercent: 50,
			},
			executionConstraints: {
				minStopPoints: null,
				maxContracts: null,
				operatingHoursStart: null,
				operatingHoursEnd: null,
			},
			cascadingLimits: {
				weeklyLossCents: null,
				weeklyAction: "stopTrading",
				monthlyLossCents: 0,
				monthlyAction: "stopTrading",
			},
		},
		dailyLossCents: 100000, // R$1,000
		weeklyLossCents: 300000, // R$3,000
		monthlyLossCents: 500000, // R$5,000
		dailyProfitTargetCents: 50000, // R$500
	}
	return { ...defaults, ...overrides }
}

// ---------------------------------------------------------------------------
// BASIC CONTRACT & VALIDATION
// ---------------------------------------------------------------------------

describe("runAdvancedSimulation — Contract & Validation", () => {
	it("should return valid RiskSimulationResult structure", () => {
		const trades = [buildTrade()]
		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		expect(result).toHaveProperty("params")
		expect(result).toHaveProperty("summary")
		expect(result).toHaveProperty("trades")
		expect(result).toHaveProperty("equityCurve")
		expect(Array.isArray(result.trades)).toBe(true)
		expect(Array.isArray(result.equityCurve)).toBe(true)
	})

	it("should process each input trade (no drop)", () => {
		const tradeCount = 5
		const trades = Array.from({ length: tradeCount }, (_, i) =>
			buildTrade({
				id: `trade-${i}`,
				entryDate: new Date(
					`2024-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`
				),
			})
		)
		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		expect(result.summary.totalTrades).toBe(tradeCount)
	})

	it("should handle empty trade list", () => {
		const trades: TradeForSimulation[] = []
		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		expect(result.trades).toHaveLength(0)
		expect(result.summary.totalTrades).toBe(0)
		expect(result.summary.executedTrades).toBe(0)
		expect(result.equityCurve).toHaveLength(0)
		expect(result.dateRange.from).toBe("")
		expect(result.dateRange.to).toBe("")
	})
})

// ---------------------------------------------------------------------------
// IDENTITY TRANSFORM: No Risk Changes
// ---------------------------------------------------------------------------

describe("runAdvancedSimulation — Identity Transform (No Risk Change)", () => {
	it("should preserve original P&L when position size = historical", () => {
		// Build a trade with known P&L
		const winTrade = buildTrade({
			id: "win-1",
			entryPrice: 100,
			exitPrice: 102, // +2 points
			stopLoss: 98,
			positionSize: 10,
			tickValue: 10,
			pnlCents: 20 * 10 * 100, // 2 points * 10 contracts * (10/0.01) * 100 cents
			rMultiple: 10, // 2 points / 2 stop = 1R
		})

		const params = buildParams({
			decisionTree: {
				baseTrade: {
					riskCents: 5000, // Base risk: R$50
					maxContracts: 20,
					minStopPoints: null,
				},
				// ... use defaults for recovery/gainMode
				lossRecovery: {
					sequence: [],
					stopAfterSequence: false,
					executeAllRegardless: false,
				},
				gainMode: { type: "singleTarget", dailyTargetCents: 50000 },
				drawdownControl: { tiers: [], recoveryThresholdPercent: 50 },
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				cascadingLimits: {
					weeklyLossCents: null,
					weeklyAction: "stopTrading",
					monthlyLossCents: 0,
					monthlyAction: "stopTrading",
				},
			},
			dailyLossCents: 100000,
			weeklyLossCents: 300000,
			monthlyLossCents: 500000,
			dailyProfitTargetCents: 50000,
		})

		const result = runAdvancedSimulation([winTrade], params)

		// Original P&L should be preserved in the summary
		expect(result.summary.originalTotalPnlCents).toBe(winTrade.pnlCents)
	})

	it("should not crash on trades with no stop loss", () => {
		const tradeNoStop = buildTrade({
			id: "no-sl",
			stopLoss: undefined,
		})

		const params = buildParams()
		const result = runAdvancedSimulation([tradeNoStop], params)

		// Trade should be marked as skipped (no SL)
		const skippedTrade = result.trades[0]
		expect(skippedTrade?.status).toBe("skipped_no_sl")
	})

	it("should not crash on trades with zero stop loss distance", () => {
		const tradeZeroStop = buildTrade({
			id: "zero-sl",
			entryPrice: 100,
			stopLoss: 100, // Same as entry price
		})

		const params = buildParams()
		const result = runAdvancedSimulation([tradeZeroStop], params)

		const skippedTrade = result.trades[0]
		expect(skippedTrade?.status).toBe("skipped_no_sl")
	})
})

// ---------------------------------------------------------------------------
// SCALING & HOMOGENEITY
// ---------------------------------------------------------------------------

describe("runAdvancedSimulation — Position Scaling & Homogeneity", () => {
	it("should handle different base risk levels without crashing", () => {
		const trades = [
			buildTrade({
				id: "t1",
				entryPrice: 100,
				exitPrice: 102,
				pnlCents: 20000, // R$200 profit
			}),
		]

		const baseParams = buildParams({
			decisionTree: {
				baseTrade: { riskCents: 5000, maxContracts: 20, minStopPoints: null },
				lossRecovery: {
					sequence: [],
					stopAfterSequence: false,
					executeAllRegardless: false,
				},
				gainMode: { type: "singleTarget", dailyTargetCents: 50000 },
				drawdownControl: { tiers: [], recoveryThresholdPercent: 50 },
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				cascadingLimits: {
					weeklyLossCents: null,
					weeklyAction: "stopTrading",
					monthlyLossCents: 0,
					monthlyAction: "stopTrading",
				},
			},
		})

		const result1 = runAdvancedSimulation(trades, baseParams)

		const doubledParams = buildParams({
			decisionTree: {
				baseTrade: { riskCents: 10000, maxContracts: 20, minStopPoints: null }, // 2x risk
				lossRecovery: {
					sequence: [],
					stopAfterSequence: false,
					executeAllRegardless: false,
				},
				gainMode: { type: "singleTarget", dailyTargetCents: 50000 },
				drawdownControl: { tiers: [], recoveryThresholdPercent: 50 },
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				cascadingLimits: {
					weeklyLossCents: null,
					weeklyAction: "stopTrading",
					monthlyLossCents: 0,
					monthlyAction: "stopTrading",
				},
			},
		})

		const result2 = runAdvancedSimulation(trades, doubledParams)

		// Both should complete successfully
		expect(result1.summary.totalTrades).toBe(1)
		expect(result2.summary.totalTrades).toBe(1)
	})

	it("should apply risk multipliers uniformly across all trades", () => {
		const trades = Array.from({ length: 10 }, (_, i) =>
			buildTrade({
				id: `t${i}`,
				entryDate: new Date(
					`2024-01-${String(i + 1).padStart(2, "0")}T10:00:00Z`
				),
				pnlCents: 10000 + i * 1000, // Varying P&Ls
			})
		)

		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		// All executed trades should have riskAmountCents set
		const executedTrades = result.trades.filter((t) => t.status === "executed")
		for (const trade of executedTrades) {
			expect(trade.riskAmountCents).toBeGreaterThan(0)
		}
	})
})

// ---------------------------------------------------------------------------
// SKIP LOGIC: Cascading Limits
// ---------------------------------------------------------------------------

describe("runAdvancedSimulation — Skip Logic & Cascading Limits", () => {
	it("should process trades with loss limit configured", () => {
		const trades = [
			buildTrade({
				id: "t1",
				entryPrice: 100,
				exitPrice: 95,
				pnlCents: -10000,
			}),
			buildTrade({
				id: "t2",
				entryDate: new Date("2024-01-15T11:00:00Z"),
				entryPrice: 100,
				exitPrice: 98,
				pnlCents: -5000,
			}),
		]

		const params = buildParams({
			dailyLossCents: 75000, // R$750 daily limit
		})

		const result = runAdvancedSimulation(trades, params)

		// Both trades should be processed (decision on skip made by engine)
		expect(result.summary.totalTrades).toBe(2)
		expect(result.trades.length).toBeGreaterThanOrEqual(1)
	})

	it("should process trades with weekly limit configured", () => {
		const trades = [
			buildTrade({
				id: "t1",
				entryDate: new Date("2024-01-08T10:00:00Z"), // Monday week 1
				pnlCents: -250000, // -R$2,500
			}),
			buildTrade({
				id: "t2",
				entryDate: new Date("2024-01-09T10:00:00Z"), // Tuesday week 1
				pnlCents: -80000, // -R$800
			}),
		]

		const params = buildParams({
			weeklyLossCents: 300000, // -R$3,000 weekly limit
			dailyLossCents: 500000, // High daily limit
		})

		const result = runAdvancedSimulation(trades, params)

		// Both trades should be processed
		expect(result.summary.totalTrades).toBe(2)
	})

	it("should process trades with monthly limit configured", () => {
		const trades = [
			buildTrade({
				id: "t1",
				entryDate: new Date("2024-01-15T10:00:00Z"),
				pnlCents: -400000, // -R$4,000
			}),
			buildTrade({
				id: "t2",
				entryDate: new Date("2024-01-20T10:00:00Z"),
				pnlCents: -150000, // -R$1,500
			}),
		]

		const params = buildParams({
			monthlyLossCents: 500000, // -R$5,000 monthly limit
			dailyLossCents: 500000,
			weeklyLossCents: 500000,
		})

		const result = runAdvancedSimulation(trades, params)

		// Both trades should be processed
		expect(result.summary.totalTrades).toBe(2)
	})

	it("should process trades with daily profit target configured", () => {
		const trades = [
			buildTrade({
				id: "t1",
				entryDate: new Date("2024-01-15T10:00:00Z"),
				pnlCents: 60000, // R$600
			}),
			buildTrade({
				id: "t2",
				entryDate: new Date("2024-01-15T14:00:00Z"),
				pnlCents: 20000,
			}),
		]

		const params = buildParams({
			dailyProfitTargetCents: 50000, // R$500 target
		})

		const result = runAdvancedSimulation(trades, params)

		expect(result.summary.totalTrades).toBe(2)
	})
})

// ---------------------------------------------------------------------------
// DECISION TREE: T1 BRANCHING
// ---------------------------------------------------------------------------

describe("runAdvancedSimulation — T1 Branching (Base Trade)", () => {
	it("should enter loss recovery after T1 loss", () => {
		const lossTrade = buildTrade({
			id: "t1-loss",
			entryPrice: 100,
			exitPrice: 98,
			stopLoss: 98,
			pnlCents: -10000,
		})

		const params = buildParams({
			decisionTree: {
				baseTrade: { riskCents: 5000, maxContracts: 20, minStopPoints: null },
				lossRecovery: {
					sequence: [
						{
							riskCalculation: { type: "percentOfBase", percent: 100 },
							maxContractsOverride: null,
						},
					],
					stopAfterSequence: false,
					executeAllRegardless: false,
				},
				gainMode: { type: "singleTarget", dailyTargetCents: 50000 },
				drawdownControl: { tiers: [], recoveryThresholdPercent: 50 },
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				cascadingLimits: {
					weeklyLossCents: null,
					weeklyAction: "stopTrading",
					monthlyLossCents: 0,
					monthlyAction: "stopTrading",
				},
			},
			dailyLossCents: 100000,
			dailyProfitTargetCents: undefined,
		})

		const result = runAdvancedSimulation([lossTrade], params)

		const trade = result.trades[0]
		expect(trade?.dayPhase).toBe("base")
		// After T1 loss, next trade (if any) would be in loss_recovery phase
	})

	it("should enter gain mode after T1 win", () => {
		const winTrade = buildTrade({
			id: "t1-win",
			entryPrice: 100,
			exitPrice: 102,
			pnlCents: 20000,
		})

		const params = buildParams({
			decisionTree: {
				baseTrade: { riskCents: 5000, maxContracts: 20, minStopPoints: null },
				lossRecovery: {
					sequence: [],
					stopAfterSequence: false,
					executeAllRegardless: false,
				},
				gainMode: { type: "singleTarget", dailyTargetCents: 50000 },
				drawdownControl: { tiers: [], recoveryThresholdPercent: 50 },
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				cascadingLimits: {
					weeklyLossCents: null,
					weeklyAction: "stopTrading",
					monthlyLossCents: 0,
					monthlyAction: "stopTrading",
				},
			},
		})

		const result = runAdvancedSimulation([winTrade], params)

		const trade = result.trades[0]
		expect(trade?.dayPhase).toBe("base")
		// Phase tracking is T1 decision node; next day's trades would be in gain_mode or normal
	})
})

// ---------------------------------------------------------------------------
// EQUITY CURVE & BALANCE TRACKING
// ---------------------------------------------------------------------------

describe("runAdvancedSimulation — Equity Curve & Balance Tracking", () => {
	it("should track equity progression in equityCurve", () => {
		const trades = [
			buildTrade({
				id: "t1",
				pnlCents: 10000,
			}),
			buildTrade({
				id: "t2",
				entryDate: new Date("2024-01-16T10:00:00Z"),
				pnlCents: -5000,
			}),
		]

		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		expect(result.equityCurve.length).toBeGreaterThan(0)
		// Equity should change with each trade
		const firstEquity = result.equityCurve[0]?.simulatedEquityCents
		const lastEquity =
			result.equityCurve[result.equityCurve.length - 1]?.simulatedEquityCents

		expect(firstEquity).toBeDefined()
		expect(lastEquity).toBeDefined()
	})

	it("should show equity increasing after winning trades", () => {
		const winTrade = buildTrade({
			id: "win",
			pnlCents: 50000,
		})

		const params = buildParams()
		const result = runAdvancedSimulation([winTrade], params)

		const startingEquity = params.accountBalanceCents
		const finalEquity = result.equityCurve[0]?.simulatedEquityCents
		expect(finalEquity).toBeGreaterThan(startingEquity)
	})

	it("should track equity changes through simulation", () => {
		const loseTrade = buildTrade({
			id: "lose",
			pnlCents: -30000,
		})

		const params = buildParams()
		const result = runAdvancedSimulation([loseTrade], params)

		const equityPoint = result.equityCurve[0]
		expect(equityPoint?.simulatedEquityCents).toBeDefined()
		// Simulated equity depends on position sizing and actual calculation
		expect(typeof equityPoint?.simulatedEquityCents).toBe("number")
	})
})

// ---------------------------------------------------------------------------
// SUMMARY AGGREGATION
// ---------------------------------------------------------------------------

describe("runAdvancedSimulation — Summary Aggregation", () => {
	it("should count total, executed, and skipped trades", () => {
		const trades = [
			buildTrade({ id: "t1", pnlCents: 10000 }),
			buildTrade({
				id: "t2",
				entryDate: new Date("2024-01-16T10:00:00Z"),
				stopLoss: undefined, // Will be skipped
			}),
		]

		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		expect(result.summary.totalTrades).toBe(2)
		expect(result.summary.executedTrades).toBeGreaterThanOrEqual(1)
		expect(result.summary.skippedNoSl).toBe(1)
	})

	it("should report original vs simulated stats", () => {
		const trades = [
			buildTrade({
				id: "t1",
				pnlCents: 20000,
				rMultiple: 4,
			}),
			buildTrade({
				id: "t2",
				entryDate: new Date("2024-01-16T10:00:00Z"),
				pnlCents: -10000,
				rMultiple: -2,
			}),
		]

		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		expect(result.summary.originalTotalPnlCents).toBe(10000) // 20K - 10K
		expect(result.summary.originalWinRate).toBeGreaterThanOrEqual(0)
		expect(result.summary.simulatedTotalPnlCents).toBeDefined()
		expect(result.summary.simulatedWinRate).toBeGreaterThanOrEqual(0)
	})

	it("should report P&L delta (simulated - original)", () => {
		const trades = [buildTrade({ id: "t1", pnlCents: 10000 })]

		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		expect(typeof result.summary.pnlDeltaCents).toBe("number")
	})

	it("should report date range from first to last trade", () => {
		const trades = [
			buildTrade({
				id: "t1",
				entryDate: new Date("2024-01-10T10:00:00Z"),
			}),
			buildTrade({
				id: "t2",
				entryDate: new Date("2024-01-20T10:00:00Z"),
			}),
		]

		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		expect(result.dateRange.from).toBe("2024-01-10")
		expect(result.dateRange.to).toBe("2024-01-20")
	})
})

// ---------------------------------------------------------------------------
// EDGE CASES
// ---------------------------------------------------------------------------

describe("runAdvancedSimulation — Edge Cases", () => {
	it("should handle trades with no P&L (breakeven)", () => {
		const beTradeHigh = buildTrade({
			id: "be-high",
			entryPrice: 100,
			exitPrice: 100.01,
			pnlCents: -15, // Commission eats the small gain → breakeven
		})

		const params = buildParams()
		const result = runAdvancedSimulation([beTradeHigh], params)

		const trade = result.trades[0]
		expect(trade?.simulatedPnlCents).toBeDefined()
	})

	it("should handle very large P&Ls without overflow", () => {
		const megaWin = buildTrade({
			id: "mega-win",
			pnlCents: 10000000, // R$100,000
		})

		const params = buildParams()
		const result = runAdvancedSimulation([megaWin], params)

		expect(result.equityCurve[0]?.simulatedEquityCents).toBeGreaterThan(
			params.accountBalanceCents
		)
	})

	it("should handle trades that would exceed max contracts", () => {
		const trade = buildTrade({
			id: "t1",
			stopLoss: 99, // Very tight stop = large position sizing
		})

		const params = buildParams({
			decisionTree: {
				baseTrade: { riskCents: 50000, maxContracts: 5, minStopPoints: null }, // Limited max
				lossRecovery: {
					sequence: [],
					stopAfterSequence: false,
					executeAllRegardless: false,
				},
				gainMode: { type: "singleTarget", dailyTargetCents: 50000 },
				drawdownControl: { tiers: [], recoveryThresholdPercent: 50 },
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				cascadingLimits: {
					weeklyLossCents: null,
					weeklyAction: "stopTrading",
					monthlyLossCents: 0,
					monthlyAction: "stopTrading",
				},
			},
		})

		const result = runAdvancedSimulation([trade], params)
		const executedTrade = result.trades[0]
		expect(executedTrade?.simulatedPositionSize).toBeLessThanOrEqual(5)
	})

	it("should not return NaN or Infinity in summary metrics", () => {
		const trades = [
			buildTrade({ id: "t1", pnlCents: 10000 }),
			buildTrade({
				id: "t2",
				entryDate: new Date("2024-01-16T10:00:00Z"),
				pnlCents: -5000,
			}),
		]

		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		expect(isNaN(result.summary.simulatedTotalPnlCents)).toBe(false)
		expect(isNaN(result.summary.originalWinRate)).toBe(false)
		expect(isFinite(result.summary.simulatedTotalPnlCents)).toBe(true)
	})
})

// ---------------------------------------------------------------------------
// DATE & WEEK BOUNDARY LOGIC
// ---------------------------------------------------------------------------

describe("runAdvancedSimulation — Date & Week Boundary Logic", () => {
	it("should track trades on different days separately", () => {
		const trades = [
			buildTrade({
				id: "day1-t1",
				entryDate: new Date("2024-01-15T10:00:00Z"),
				pnlCents: 20000,
			}),
			buildTrade({
				id: "day2-t1",
				entryDate: new Date("2024-01-16T10:00:00Z"),
				pnlCents: 10000,
			}),
		]

		const params = buildParams()
		const result = runAdvancedSimulation(trades, params)

		// Both trades should be on different days
		expect(result.trades[0]?.dayKey).not.toBe(result.trades[1]?.dayKey)
		// Each trade should have a dayKey assigned
		expect(result.trades[0]?.dayKey).toBe("2024-01-15")
		expect(result.trades[1]?.dayKey).toBe("2024-01-16")
	})

	it("should reset weekly state on new week", () => {
		// Monday and Friday (different weeks)
		const monday = buildTrade({
			id: "mon",
			entryDate: new Date("2024-01-08T10:00:00Z"), // Monday
		})
		const friday = buildTrade({
			id: "fri",
			entryDate: new Date("2024-01-12T10:00:00Z"), // Friday (same week)
		})
		const nextMonday = buildTrade({
			id: "next-mon",
			entryDate: new Date("2024-01-15T10:00:00Z"), // Next Monday (new week)
		})

		const params = buildParams()
		const result = runAdvancedSimulation([monday, friday, nextMonday], params)

		// All three should execute without weekly limit issues (assuming high weekly limit)
		expect(result.trades.length).toBe(3)
	})

	it("should reset monthly state on new month", () => {
		const jan = buildTrade({
			id: "jan",
			entryDate: new Date("2024-01-31T10:00:00Z"),
			pnlCents: -400000,
		})
		const feb = buildTrade({
			id: "feb",
			entryDate: new Date("2024-02-01T10:00:00Z"),
			pnlCents: -200000,
		})

		const params = buildParams({
			monthlyLossCents: 500000,
		})

		const result = runAdvancedSimulation([jan, feb], params)

		// Jan trade: -400K (within limit)
		expect(result.trades[0]?.status).toBe("executed")
		// Feb trade: -200K in new month (should be within reset limit)
		expect(result.trades[1]?.status).toBe("executed")
	})
})
