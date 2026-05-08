/**
 * Comprehensive tests for `resolveLiveStatus` — the pure function that replays
 * today's trades through the Bravo decision tree and determines the NEXT trade's state.
 *
 * Tests verify breakeven-invisible coordination: BEs affect P&L but NOT trade counts,
 * consecutive losses, max trades, or decision tree step progression.
 *
 * Uses the Bravo Risk Management profile from seed-risk-profiles.ts as the fixture.
 */

import { describe, it, expect } from "vitest"
import { resolveLiveStatus } from "@/lib/live-trading-status"
import type { DecisionTreeCents } from "@/lib/risk-profiles/cents-shape"
import type { TradeOutcomeInput } from "@/types/live-trading-status"

// ==========================================
// SHARED BRAVO FIXTURE
// ==========================================

/** Bravo decision tree — mirrors seed-risk-profiles.ts exactly */
const bravoTree: DecisionTreeCents = {
	baseTrade: {
		riskCents: 50000,
		maxContracts: 20,
		minStopPoints: 100,
	},
	lossRecovery: {
		sequence: [
			{ riskCalculation: { type: "percentOfBase", percent: 50 }, maxContractsOverride: null },
			{ riskCalculation: { type: "percentOfBase", percent: 25 }, maxContractsOverride: null },
			{ riskCalculation: { type: "percentOfBase", percent: 25 }, maxContractsOverride: null },
		],
		executeAllRegardless: false,
		stopAfterSequence: true,
	},
	gainMode: {
		type: "gainSequence",
		sequence: [
			{ riskCalculation: { type: "percentOfBase", percent: 100 }, maxContractsOverride: null },
			{ riskCalculation: { type: "percentOfBase", percent: 50 }, maxContractsOverride: null },
			{ riskCalculation: { type: "percentOfBase", percent: 25 }, maxContractsOverride: null },
		],
		repeatLastStep: true,
		stopOnFirstLoss: true,
		dailyTargetCents: 150000,
	},
	cascadingLimits: {
		weeklyLossCents: 200000,
		weeklyAction: "stopTrading",
		monthlyLossCents: 750000,
		monthlyAction: "stopTrading",
	},
	executionConstraints: {
		minStopPoints: 100,
		maxContracts: 20,
		operatingHoursStart: "09:01",
		operatingHoursEnd: "17:00",
	},
}

const defaultParams = {
	decisionTree: bravoTree,
	profileName: "Bravo Risk Management",
	dailyLossCents: 100000,
	dailyProfitTargetCents: 150000,
	maxTrades: null as number | null,
}

/** Shorthand trade factory */
const trade = (outcome: TradeOutcomeInput["outcome"], pnlCents: number): TradeOutcomeInput => ({
	outcome,
	pnlCents,
})

const L = (pnlCents: number) => trade("loss", pnlCents)
const W = (pnlCents: number) => trade("win", pnlCents)
const BE = (pnlCents: number) => trade("breakeven", pnlCents)

// ==========================================
// 5a. LOSS RECOVERY PATHS (PURE)
// ==========================================

describe("Loss Recovery Paths (pure)", () => {
	it("L-W: recovery win exits after first recovery step", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000), W(25000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoveryWinExit")
		expect(result.dayTradeNumber).toBe(2)
		expect(result.dayPhase).toBe("loss_recovery")
		expect(result.consecutiveLosses).toBe(0)
		expect(result.dailyPnlCents).toBe(-25000)
		expect(result.tradeStepNumbers).toEqual([1, 2])
	})

	it("L-L-W: recovery win after two losses", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000), L(-25000), W(12500)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoveryWinExit")
		expect(result.dayTradeNumber).toBe(3)
		expect(result.dayPhase).toBe("loss_recovery")
		expect(result.consecutiveLosses).toBe(0)
		expect(result.dailyPnlCents).toBe(-62500)
		expect(result.tradeStepNumbers).toEqual([1, 2, 3])
	})

	it("L-L-L-W: recovery win after full sequence", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000), L(-25000), L(-12500), W(12500)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoveryWinExit")
		expect(result.dayTradeNumber).toBe(4)
		expect(result.dayPhase).toBe("loss_recovery")
		expect(result.consecutiveLosses).toBe(0)
		expect(result.dailyPnlCents).toBe(-75000)
		expect(result.tradeStepNumbers).toEqual([1, 2, 3, 4])
	})

	it("L-L-L-L: recovery sequence exhausted", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000), L(-25000), L(-12500), L(-12500)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoverySequenceExhausted")
		expect(result.dayTradeNumber).toBe(4)
		expect(result.dayPhase).toBe("loss_recovery")
		expect(result.consecutiveLosses).toBe(4)
		expect(result.recoverySequenceExhausted).toBe(true)
		expect(result.dailyPnlCents).toBe(-100000)
	})
})

// ==========================================
// 5b. LOSS RECOVERY PATHS + BREAKEVENS
// ==========================================

describe("Loss Recovery Paths + Breakevens", () => {
	it("BE before T1: does not affect step numbers", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [BE(0), L(-50000), W(25000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoveryWinExit")
		expect(result.dayTradeNumber).toBe(2)
		expect(result.tradeStepNumbers).toEqual([1, 1, 2])
		expect(result.dailyPnlCents).toBe(-25000)
	})

	it("BE between L and R1: invisible to recovery sequence", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000), BE(-10), W(25000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoveryWinExit")
		expect(result.dayTradeNumber).toBe(2)
		expect(result.tradeStepNumbers).toEqual([1, 1, 2])
		expect(result.dailyPnlCents).toBe(-25010)
	})

	it("BE after recovery win: does not change outcome", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000), W(25000), BE(5)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoveryWinExit")
		expect(result.dayTradeNumber).toBe(2)
		expect(result.dailyPnlCents).toBe(-24995)
	})

	it("Multiple consecutive BEs: all invisible to step counting", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [BE(0), BE(0), L(-50000), BE(0), L(-25000), BE(0), W(12500)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoveryWinExit")
		expect(result.dayTradeNumber).toBe(3)
		expect(result.dailyPnlCents).toBe(-62500)
	})

	it("User's actual scenario: L, L, BE, L, BE, W → recoveryWinExit with correct P&L", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [
				L(-25000),
				L(-15000),
				BE(-1000),
				L(-10000),
				BE(1500),
				W(25000),
			],
		})

		expect(result.dayTradeNumber).toBe(4)
		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoveryWinExit")
		expect(result.dailyPnlCents).toBe(-24500)
		expect(result.consecutiveLosses).toBe(0)
	})
})

// ==========================================
// 5c. GAIN SEQUENCE PATHS (PURE)
// ==========================================

describe("Gain Sequence Paths (pure)", () => {
	it("W-L: stopOnFirstLoss triggers dailyTargetReached", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [W(50000), L(-50000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyTargetReached")
		expect(result.dayTradeNumber).toBe(2)
		expect(result.dayGainsCents).toBe(50000)
		expect(result.dayPhase).toBe("gain_mode")
	})

	it("W-W-L: loss after two gain steps", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [W(50000), W(50000), L(-25000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyTargetReached")
		expect(result.dayTradeNumber).toBe(3)
		expect(result.dayGainsCents).toBe(100000)
		expect(result.shouldDecreaseSize).toBe(true)
	})

	it("W-W-W-L: loss after three gain steps", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [W(30000), W(30000), W(30000), L(-12500)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyTargetReached")
		expect(result.dayTradeNumber).toBe(4)
		expect(result.dayGainsCents).toBe(90000)
	})

	it("W-W-W-W (under target): should continue trading", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [W(30000), W(30000), W(30000), W(30000)],
		})

		expect(result.shouldStopTrading).toBe(false)
		expect(result.dayTradeNumber).toBe(4)
		expect(result.dayGainsCents).toBe(120000)
		// Gain sequence index should be 3 (past last step, using repeatLastStep)
		expect(result.gainSequenceStepIndex).toBe(3)
		// Next risk should be 25% of base (repeat last step)
		expect(result.nextTradeRiskCents).toBe(12500)
	})

	it("W-W-W (hits daily target): should stop", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [W(50000), W(50000), W(50000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyTargetReached")
		expect(result.dayTradeNumber).toBe(3)
		expect(result.dayGainsCents).toBe(150000)
		expect(result.dailyPnlCents).toBe(150000)
	})
})

// ==========================================
// 5d. GAIN SEQUENCE PATHS + BREAKEVENS
// ==========================================

describe("Gain Sequence Paths + Breakevens", () => {
	it("BE before T1 win: does not affect step numbers", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [BE(0), W(50000), L(-50000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyTargetReached")
		expect(result.dayTradeNumber).toBe(2)
		expect(result.dayGainsCents).toBe(50000)
	})

	it("BE between W and G1: invisible to gain sequence", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [W(50000), BE(5), L(-50000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyTargetReached")
		expect(result.dayTradeNumber).toBe(2)
		expect(result.dailyPnlCents).toBe(5)
	})

	it("BE between G1 and G2: invisible to gain sequence", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [W(50000), W(50000), BE(-5), L(-25000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyTargetReached")
		expect(result.dayTradeNumber).toBe(3)
		expect(result.dailyPnlCents).toBe(74995)
	})

	it("Multiple BEs in gain sequence: all invisible", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [BE(0), W(30000), BE(0), W(30000), BE(0), W(30000), BE(0), L(-12500)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyTargetReached")
		expect(result.dayTradeNumber).toBe(4)
		expect(result.dayGainsCents).toBe(90000)
	})
})

// ==========================================
// 5e. DAILY LIMIT — STICKY FIX VERIFICATION
// ==========================================

describe("Daily Limit — Sticky Fix Verification", () => {
	it("P&L crosses limit then recovers: dailyLimitHit should be false", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-60000), L(-50000), W(80000)],
		})

		// Final P&L = -30000, well within -100000 limit
		expect(result.dailyPnlCents).toBe(-30000)
		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoveryWinExit")
		// The key assertion: dailyLimitHit is NOT the stop reason
		expect(result.stopReason).not.toBe("dailyLossLimit")
	})

	it("P&L stays past limit: dailyLimitHit should be true", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-60000), L(-50000)],
		})

		// Final P&L = -110000, exceeds -100000 limit
		expect(result.dailyPnlCents).toBe(-110000)
		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyLossLimit")
	})

	it("BE pushes P&L past limit then win recovers: dailyLimitHit should be false", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000), BE(-60000), W(80000)],
		})

		// Final P&L = -30000
		expect(result.dailyPnlCents).toBe(-30000)
		expect(result.stopReason).not.toBe("dailyLossLimit")
		expect(result.stopReason).toBe("recoveryWinExit")
	})

	it("User's exact scenario: should NOT show dailyLossLimit", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [
				L(-25000),
				L(-15000),
				BE(-1000),
				L(-10000),
				BE(1500),
				W(25000),
			],
		})

		expect(result.dailyPnlCents).toBe(-24500)
		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoveryWinExit")
		expect(result.stopReason).not.toBe("dailyLossLimit")
	})

	it("Daily limit exactly at boundary with sequence exhausted: sequence takes precedence", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000), L(-25000), L(-12500), L(-12500)],
		})

		// Final P&L = -100000, exactly at -100000 limit
		// Both dailyLossLimit AND recoverySequenceExhausted are true,
		// but recoverySequenceExhausted overwrites in the "compute next trade" section
		expect(result.dailyPnlCents).toBe(-100000)
		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("recoverySequenceExhausted")
		expect(result.recoverySequenceExhausted).toBe(true)
	})

	it("Daily limit hit without sequence exhaustion: dailyLossLimit", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-60000), L(-50000)],
		})

		// Final P&L = -110000, only 2 losses so recovery not exhausted
		expect(result.dailyPnlCents).toBe(-110000)
		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyLossLimit")
	})
})

// ==========================================
// 5f. MAX TRADES (with maxTrades: 4)
// ==========================================

describe("Max Trades", () => {
	it("4 non-BE trades: maxTradesReached", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			maxTrades: 4,
			trades: [W(30000), W(30000), W(30000), W(30000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("maxTradesReached")
		expect(result.dayTradeNumber).toBe(4)
	})

	it("6 physical trades (2 BE + 4 non-BE): only counts non-BEs", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			maxTrades: 4,
			trades: [BE(0), W(30000), BE(0), W(30000), W(30000), W(30000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("maxTradesReached")
		expect(result.dayTradeNumber).toBe(4)
	})

	it("3 non-BE + 5 BEs: not maxed", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			maxTrades: 4,
			trades: [W(30000), BE(0), BE(0), BE(0), BE(0), BE(0), W(30000), W(30000)],
		})

		expect(result.dayTradeNumber).toBe(3)
		expect(result.shouldStopTrading).toBe(false)
	})
})

// ==========================================
// 5g. EDGE CASES
// ==========================================

describe("Edge Cases", () => {
	it("No trades: fresh day base state", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [],
		})

		expect(result.dayTradeNumber).toBe(0)
		expect(result.dayPhase).toBe("base")
		expect(result.nextTradeRiskCents).toBe(50000)
		expect(result.shouldStopTrading).toBe(false)
		expect(result.stopReason).toBeNull()
		expect(result.consecutiveLosses).toBe(0)
	})

	it("Only breakevens: treated as fresh day", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [BE(0), BE(-5), BE(10)],
		})

		expect(result.dayTradeNumber).toBe(0)
		expect(result.dayPhase).toBe("base")
		expect(result.nextTradeRiskCents).toBe(50000)
		expect(result.dailyPnlCents).toBe(5)
	})

	it("Null outcome trades: treated as non-breakeven", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [{ outcome: null, pnlCents: 100 }],
		})

		// Null outcome is non-breakeven, so it increments step
		expect(result.dayTradeNumber).toBe(1)
	})

	it("Single T1 loss: enters loss recovery, ready for R1", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000)],
		})

		expect(result.dayPhase).toBe("loss_recovery")
		expect(result.nextTradeRiskCents).toBe(25000) // 50% of base
		expect(result.shouldStopTrading).toBe(false)
		expect(result.consecutiveLosses).toBe(1)
		expect(result.recoveryStepIndex).toBe(0)
	})

	it("Single T1 win: enters gain mode, ready for G1", () => {
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [W(50000)],
		})

		expect(result.dayPhase).toBe("gain_mode")
		expect(result.nextTradeRiskCents).toBe(50000) // 100% of base (G1)
		expect(result.shouldStopTrading).toBe(false)
		expect(result.dayGainsCents).toBe(50000)
		expect(result.gainSequenceStepIndex).toBe(0)
	})
})

// ==========================================
// DAILY TARGET — BEHAVIORAL STICKINESS
// ==========================================

describe("Daily Target — Behavioral Stickiness", () => {
	it("stopOnFirstLoss is sticky: subsequent win does not un-stop", () => {
		// W, L triggers stopOnFirstLoss → dailyTargetHit = true (behavioral)
		// Even though we add another W, the flag should stay
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [W(50000), L(-30000), W(40000)],
		})

		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyTargetReached")
	})

	it("Daily profit target from net P&L: evaluates final state", () => {
		// Three wins summing to exactly the daily target
		const result = resolveLiveStatus({
			...defaultParams,
			trades: [W(50000), W(50000), W(50000)],
		})

		expect(result.dailyPnlCents).toBe(150000)
		expect(result.shouldStopTrading).toBe(true)
		expect(result.stopReason).toBe("dailyTargetReached")
	})
})

// ==========================================
// RISK SIZING VERIFICATION
// ==========================================

describe("Risk Sizing through Decision Tree", () => {
	it("Recovery steps use correct percentages: 50%, 25%, 25%", () => {
		// After T1 loss, next risk should be 50% of base
		const afterT1Loss = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000)],
		})
		expect(afterT1Loss.nextTradeRiskCents).toBe(25000) // 50% of 50000

		// After T1 loss + R1 loss, next risk should be 25% of base
		const afterR1Loss = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000), L(-25000)],
		})
		expect(afterR1Loss.nextTradeRiskCents).toBe(12500) // 25% of 50000

		// After T1 loss + R1 loss + R2 loss, next risk should be 25% of base (R3)
		const afterR2Loss = resolveLiveStatus({
			...defaultParams,
			trades: [L(-50000), L(-25000), L(-12500)],
		})
		expect(afterR2Loss.nextTradeRiskCents).toBe(12500) // 25% of 50000
	})

	it("Gain sequence steps use correct percentages: 100%, 50%, 25%", () => {
		// After T1 win, next risk should be 100% of base (G1)
		const afterT1Win = resolveLiveStatus({
			...defaultParams,
			trades: [W(50000)],
		})
		expect(afterT1Win.nextTradeRiskCents).toBe(50000) // 100% of 50000

		// After T1 win + G1 win, next risk should be 50% of base (G2)
		const afterG1Win = resolveLiveStatus({
			...defaultParams,
			trades: [W(30000), W(30000)],
		})
		expect(afterG1Win.nextTradeRiskCents).toBe(25000) // 50% of 50000

		// After T1 + G1 + G2 wins, next risk should be 25% of base (G3)
		const afterG2Win = resolveLiveStatus({
			...defaultParams,
			trades: [W(30000), W(30000), W(30000)],
		})
		expect(afterG2Win.nextTradeRiskCents).toBe(12500) // 25% of 50000
	})
})
