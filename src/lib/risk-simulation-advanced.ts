/**
 * Advanced mode simulation engine — full decision tree from risk profile.
 *
 * Pure function: receives decrypted trades + DecisionTreeConfig-based params.
 * Implements T1 branching, loss recovery sequences, gain modes, cascading limits.
 */

import type {
	TradeForSimulation,
	AdvancedSimulationParams,
	SimulatedTrade,
	SimulatedTradeStatus,
	DayPhase,
	SimulationSummary,
	RiskSimulationResult,
	EquityCurvePoint,
} from "@/types/risk-simulation"
import type { RiskCalculation, DecisionTreeConfig } from "@/types/risk-profile"
import {
	calculateTickBasedPositionSize,
	calculateAssetPnL,
	calculateRMultiple,
	calculateDrawdown,
	determineOutcome,
} from "@/lib/calculations"
import { formatDateKey } from "@/lib/dates"
import { buildWeekKey, buildWeekTraces, buildSimulatedStats, buildOriginalStats } from "@/lib/risk-simulation"

// ==========================================
// RISK CALCULATION RESOLVER
// ==========================================

const resolveRiskCalculation = (
	calc: RiskCalculation,
	baseRiskCents: number,
	previousRiskCents: number
): number => {
	switch (calc.type) {
		case "percentOfBase":
			return Math.round(baseRiskCents * calc.percent / 100)
		case "sameAsPrevious":
			return previousRiskCents
		case "fixedCents":
			return calc.amountCents
	}
}

// ==========================================
// MAIN ENGINE
// ==========================================

const runAdvancedSimulation = (
	trades: TradeForSimulation[],
	params: AdvancedSimulationParams
): RiskSimulationResult => {
	const {
		accountBalanceCents,
		decisionTree,
		dailyLossCents,
		dailyProfitTargetCents,
		weeklyLossCents,
		monthlyLossCents,
	} = params

	const { baseTrade, lossRecovery, gainMode, cascadingLimits } = decisionTree
	const baseRiskCents = baseTrade.riskCents

	// Running state
	let equity = accountBalanceCents
	let peak = accountBalanceCents
	let monthlyPnlCents = 0
	let weeklyPnlCents = 0
	let currentDayKey = ""
	let currentMonthKey = ""
	let currentWeekKey = ""
	let dailyPnlCents = 0
	let dailyTradeCount = 0
	let stepCount = 0
	let dayGainsCents = 0
	let dayPhase: DayPhase = "base"
	let recoveryIndex = 0
	let gainSequenceIndex = 0
	let previousRiskCents = baseRiskCents
	let dailyLimitHit = false
	let dailyTargetHit = false
	let consecutiveLosses = 0

	const simulatedTrades: SimulatedTrade[] = []
	const equityCurve: EquityCurvePoint[] = []
	let originalEquity = accountBalanceCents

	// Summary counters
	let skippedNoSl = 0
	let skippedDailyLimit = 0
	let skippedDailyTarget = 0
	let skippedMaxTrades = 0
	let skippedConsecutiveLoss = 0
	let skippedMonthlyLimit = 0
	let skippedWeeklyLimit = 0
	let daysHitDailyLimit = 0
	let daysHitDailyTarget = 0

	for (let i = 0; i < trades.length; i++) {
		const trade = trades[i]
		const dayKey = formatDateKey(trade.entryDate)
		const monthKey = dayKey.slice(0, 7)
		const weekKey = buildWeekKey(trade.entryDate)

		// ── Day boundary reset ──
		if (dayKey !== currentDayKey) {
			if (currentDayKey && dailyLimitHit) daysHitDailyLimit++
			if (currentDayKey && dailyTargetHit) daysHitDailyTarget++

			currentDayKey = dayKey
			dailyPnlCents = 0
			dailyTradeCount = 0
			stepCount = 0
			dayGainsCents = 0
			dayPhase = "base"
			recoveryIndex = 0
			gainSequenceIndex = 0
			previousRiskCents = baseRiskCents
			dailyLimitHit = false
			dailyTargetHit = false
		}

		// ── Month boundary reset ──
		if (monthKey !== currentMonthKey) {
			currentMonthKey = monthKey
			monthlyPnlCents = 0
		}

		// ── Week boundary reset (simplified) ──
		if (weekKey !== currentWeekKey) {
			currentWeekKey = weekKey
			weeklyPnlCents = 0
		}

		dailyTradeCount++
		originalEquity += trade.pnlCents

		// ── SKIP CHECKS (cascading limits + daily) ──
		let skipStatus: SimulatedTradeStatus | null = null

		if (!trade.stopLoss || Math.abs(trade.entryPrice - trade.stopLoss) === 0) {
			skipStatus = "skipped_no_sl"
			skippedNoSl++
		} else if (monthlyPnlCents <= -monthlyLossCents) {
			skipStatus = "skipped_monthly_limit"
			skippedMonthlyLimit++
		} else if (weeklyLossCents && weeklyPnlCents <= -weeklyLossCents) {
			skipStatus = "skipped_weekly_limit"
			skippedWeeklyLimit++
		} else if (dailyLimitHit || dailyPnlCents <= -dailyLossCents) {
			skipStatus = "skipped_daily_limit"
			skippedDailyLimit++
			dailyLimitHit = true
		} else if (dailyTargetHit || (dailyProfitTargetCents && dailyPnlCents >= dailyProfitTargetCents)) {
			skipStatus = "skipped_daily_target"
			skippedDailyTarget++
			dailyTargetHit = true
		}

		if (skipStatus) {
			const drawdownPercent = calculateDrawdown(equity, peak)
			simulatedTrades.push(buildSkippedTrade(trade, dayKey, dailyTradeCount, skipStatus, dayPhase, equity, dailyPnlCents, consecutiveLosses, drawdownPercent))
			equityCurve.push({ tradeIndex: i, dayKey, originalEquityCents: originalEquity, simulatedEquityCents: equity })
			continue
		}

		// ── DECISION TREE LOGIC ──
		let riskCents = baseRiskCents
		let riskReason = "Base risk"
		let maxContracts = baseTrade.maxContracts
		let currentPhase: DayPhase = dayPhase
		let currentRecoveryIndex: number | null = null

		const isT1 = stepCount === 0

		if (isT1) {
			// T1: always use base risk
			riskCents = baseRiskCents
			riskReason = "T1 base risk"
			currentPhase = "base"
		} else if (dayPhase === "loss_recovery") {
			// Recovery sequence
			if (recoveryIndex >= lossRecovery.sequence.length) {
				if (lossRecovery.stopAfterSequence) {
					const drawdownPercent = calculateDrawdown(equity, peak)
					simulatedTrades.push(buildSkippedTrade(trade, dayKey, dailyTradeCount, "skipped_recovery_complete", dayPhase, equity, dailyPnlCents, consecutiveLosses, drawdownPercent))
					equityCurve.push({ tradeIndex: i, dayKey, originalEquityCents: originalEquity, simulatedEquityCents: equity })
					continue
				}
				// Fall through to normal mode
				currentPhase = "normal"
				riskCents = baseRiskCents
				riskReason = "Post-recovery base risk"
			} else {
				const step = lossRecovery.sequence[recoveryIndex]
				riskCents = resolveRiskCalculation(step.riskCalculation, baseRiskCents, previousRiskCents)
				riskReason = `Recovery #${recoveryIndex + 1} (${describeRiskCalc(step.riskCalculation)})`
				maxContracts = step.maxContractsOverride ?? baseTrade.maxContracts
				currentRecoveryIndex = recoveryIndex
				currentPhase = "loss_recovery"
			}
		} else if (dayPhase === "gain_mode") {
			if (gainMode.type === "singleTarget") {
				// Single target gain mode — skip further trades
				const drawdownPercent = calculateDrawdown(equity, peak)
				simulatedTrades.push(buildSkippedTrade(trade, dayKey, dailyTradeCount, "skipped_gain_stop", dayPhase, equity, dailyPnlCents, consecutiveLosses, drawdownPercent))
				equityCurve.push({ tradeIndex: i, dayKey, originalEquityCents: originalEquity, simulatedEquityCents: equity })
				continue
			}
			if (gainMode.type === "compounding") {
				// Compounding gain mode — reinvest % of accumulated gains
				riskCents = Math.max(1, Math.round(dayGainsCents * (gainMode.reinvestmentPercent / 100)))
				riskReason = `Gain reinvest (${gainMode.reinvestmentPercent}% of day gains)`
				currentPhase = "gain_mode"
			}
			if (gainMode.type === "gainSequence") {
				const seqLen = gainMode.sequence.length
				if (gainSequenceIndex < seqLen) {
					const step = gainMode.sequence[gainSequenceIndex]
					riskCents = resolveRiskCalculation(step.riskCalculation, baseRiskCents, previousRiskCents)
					riskReason = `Gain #${gainSequenceIndex + 1} (${describeRiskCalc(step.riskCalculation)})`
					maxContracts = step.maxContractsOverride ?? baseTrade.maxContracts
				} else if (gainMode.repeatLastStep && seqLen > 0) {
					const lastStep = gainMode.sequence[seqLen - 1]
					riskCents = resolveRiskCalculation(lastStep.riskCalculation, baseRiskCents, previousRiskCents)
					riskReason = `Gain repeat (${describeRiskCalc(lastStep.riskCalculation)})`
					maxContracts = lastStep.maxContractsOverride ?? baseTrade.maxContracts
				} else {
					// Sequence exhausted, no repeat — skip
					const drawdownPercent = calculateDrawdown(equity, peak)
					simulatedTrades.push(buildSkippedTrade(trade, dayKey, dailyTradeCount, "skipped_gain_stop", dayPhase, equity, dailyPnlCents, consecutiveLosses, drawdownPercent))
					equityCurve.push({ tradeIndex: i, dayKey, originalEquityCents: originalEquity, simulatedEquityCents: equity })
					continue
				}
				currentPhase = "gain_mode"
			}
		} else {
			// Normal mode (post-recovery or default)
			riskCents = baseRiskCents
			riskReason = "Base risk"
			currentPhase = "normal"
		}

		// Apply drawdown tier adjustments if configured
		if (decisionTree.drawdownControl?.tiers.length) {
			const currentDd = calculateDrawdown(equity, peak)
			for (const tier of decisionTree.drawdownControl.tiers) {
				if (currentDd >= tier.drawdownPercent && tier.action === "reduceRisk") {
					riskCents = Math.round(riskCents * (1 - tier.reducePercent / 100))
					riskReason += ` (DD tier: -${tier.reducePercent}%)`
					break
				}
			}
		}

		// Minimum 1 cent risk
		if (riskCents < 1) riskCents = 1

		// ── CALCULATE POSITION + P&L ──
		const sizing = calculateTickBasedPositionSize({
			riskBudgetCents: riskCents,
			entryPrice: trade.entryPrice,
			stopLoss: trade.stopLoss!,
			tickSize: trade.tickSize,
			tickValue: trade.tickValue,
			maxContracts,
		})

		const pnlResult = calculateAssetPnL({
			entryPrice: trade.entryPrice,
			exitPrice: trade.exitPrice,
			positionSize: sizing.contracts,
			direction: trade.direction,
			tickSize: trade.tickSize,
			tickValue: trade.tickValue / 100,
			commission: trade.commissionPerExecution / 100,
			fees: trade.feesPerExecution / 100,
			contractsExecuted: sizing.contracts * 2,
		})

		const simulatedPnlCents = Math.round(pnlResult.netPnl * 100)
		const simulatedOutcome = determineOutcome({ pnl: pnlResult.netPnl })
		const simulatedRMultiple = sizing.actualRiskCents > 0
			? calculateRMultiple(simulatedPnlCents, sizing.actualRiskCents)
			: null

		// ── UPDATE STATE ──
		equity += simulatedPnlCents
		if (equity > peak) peak = equity
		dailyPnlCents += simulatedPnlCents
		monthlyPnlCents += simulatedPnlCents
		weeklyPnlCents += simulatedPnlCents
		previousRiskCents = riskCents

		if (simulatedOutcome === "loss") {
			consecutiveLosses++
		} else if (simulatedOutcome === "win") {
			consecutiveLosses = 0
		}

		// Breakeven trades: update equity/limits but skip phase transitions entirely
		if (simulatedOutcome === "breakeven") {
			if (dailyPnlCents <= -dailyLossCents) dailyLimitHit = true
			if (dailyProfitTargetCents && dailyPnlCents >= dailyProfitTargetCents) dailyTargetHit = true

			const drawdownPercent = calculateDrawdown(equity, peak)
			simulatedTrades.push({
				tradeId: trade.id,
				dayKey,
				dayTradeNumber: dailyTradeCount,
				status: "executed",
				asset: trade.asset,
				direction: trade.direction,
				entryPrice: trade.entryPrice,
				exitPrice: trade.exitPrice,
				stopLoss: trade.stopLoss,
				originalPositionSize: trade.positionSize,
				originalPnlCents: trade.pnlCents,
				originalRMultiple: trade.rMultiple,
				simulatedPositionSize: sizing.contracts,
				simulatedPnlCents,
				simulatedRMultiple,
				riskAmountCents: sizing.actualRiskCents,
				dayPhase: currentPhase,
				riskReason,
				recoveryStepIndex: currentRecoveryIndex,
				equityAfterCents: equity,
				dailyPnlCents,
				consecutiveLosses,
				drawdownPercent,
			})
			equityCurve.push({ tradeIndex: i, dayKey, originalEquityCents: originalEquity, simulatedEquityCents: equity })
			continue
		}

		// Non-breakeven: advance the logical step counter
		stepCount++

		// ── T1 BRANCHING ──
		if (isT1) {
			if (simulatedOutcome === "loss") {
				dayPhase = "loss_recovery"
				recoveryIndex = 0
			} else if (simulatedOutcome === "win") {
				dayGainsCents += simulatedPnlCents
				dayPhase = "gain_mode"
				gainSequenceIndex = 0
				// Check single target
				if (gainMode.type === "singleTarget" && dayGainsCents >= gainMode.dailyTargetCents) {
					dailyTargetHit = true
				}
				if (gainMode.type === "compounding" && gainMode.dailyTargetCents && dayGainsCents >= gainMode.dailyTargetCents) {
					dailyTargetHit = true
				}
				if (gainMode.type === "gainSequence" && gainMode.dailyTargetCents && dayGainsCents >= gainMode.dailyTargetCents) {
					dailyTargetHit = true
				}
			}
		} else if (dayPhase === "loss_recovery") {
			if (simulatedOutcome === "win" && !lossRecovery.executeAllRegardless) {
				// Recovery win: if stopAfterSequence, the day is done (any gain after
				// the loss path starts = exit). Otherwise transition to gain mode.
				if (lossRecovery.stopAfterSequence) {
					dailyTargetHit = true
				} else {
					dayGainsCents += simulatedPnlCents
					dayPhase = "gain_mode"
					gainSequenceIndex = 0
				}
			} else {
				recoveryIndex++
			}
		} else if (dayPhase === "gain_mode" && gainMode.type === "compounding") {
			if (simulatedOutcome === "loss" && gainMode.stopOnFirstLoss) {
				dailyTargetHit = true
			} else if (simulatedOutcome === "win") {
				dayGainsCents += simulatedPnlCents
				if (gainMode.dailyTargetCents && dayGainsCents >= gainMode.dailyTargetCents) {
					dailyTargetHit = true
				}
			}
		} else if (dayPhase === "gain_mode" && gainMode.type === "gainSequence") {
			if (simulatedOutcome === "loss" && gainMode.stopOnFirstLoss) {
				dailyTargetHit = true
			} else if (simulatedOutcome === "win") {
				dayGainsCents += simulatedPnlCents
				gainSequenceIndex++
				if (gainMode.dailyTargetCents && dayGainsCents >= gainMode.dailyTargetCents) {
					dailyTargetHit = true
				}
			}
		}

		// Check if limits were just hit
		if (dailyPnlCents <= -dailyLossCents) dailyLimitHit = true
		if (dailyProfitTargetCents && dailyPnlCents >= dailyProfitTargetCents) dailyTargetHit = true

		const drawdownPercent = calculateDrawdown(equity, peak)

		simulatedTrades.push({
			tradeId: trade.id,
			dayKey,
			dayTradeNumber: dailyTradeCount,
			status: "executed",
			asset: trade.asset,
			direction: trade.direction,
			entryPrice: trade.entryPrice,
			exitPrice: trade.exitPrice,
			stopLoss: trade.stopLoss,
			originalPositionSize: trade.positionSize,
			originalPnlCents: trade.pnlCents,
			originalRMultiple: trade.rMultiple,
			simulatedPositionSize: sizing.contracts,
			simulatedPnlCents,
			simulatedRMultiple,
			riskAmountCents: sizing.actualRiskCents,
			dayPhase: currentPhase,
			riskReason,
			recoveryStepIndex: currentRecoveryIndex,
			equityAfterCents: equity,
			dailyPnlCents,
			consecutiveLosses,
			drawdownPercent,
		})

		equityCurve.push({
			tradeIndex: i,
			dayKey,
			originalEquityCents: originalEquity,
			simulatedEquityCents: equity,
		})
	}

	// Final day boundary counters
	if (currentDayKey && dailyLimitHit) daysHitDailyLimit++
	if (currentDayKey && dailyTargetHit) daysHitDailyTarget++

	// ── BUILD RESULT ──
	const weeks = buildWeekTraces(trades, simulatedTrades)
	const originalStats = buildOriginalStats(trades, accountBalanceCents)
	const simStats = buildSimulatedStats(simulatedTrades, accountBalanceCents)

	const summary: SimulationSummary = {
		totalTrades: trades.length,
		executedTrades: simulatedTrades.filter((t) => t.status === "executed").length,
		skippedNoSl,
		skippedDailyLimit,
		skippedDailyTarget,
		skippedMaxTrades,
		skippedConsecutiveLoss,
		skippedMonthlyLimit,
		skippedWeeklyLimit,
		originalTotalPnlCents: originalStats.totalPnlCents,
		originalWinRate: originalStats.winRate,
		originalProfitFactor: originalStats.profitFactor === Infinity ? 999 : originalStats.profitFactor,
		originalMaxDrawdownPercent: originalStats.maxDrawdownPercent,
		originalAvgR: originalStats.avgR,
		simulatedTotalPnlCents: simStats.totalPnlCents,
		simulatedWinRate: simStats.winRate,
		simulatedProfitFactor: simStats.profitFactor === Infinity ? 999 : simStats.profitFactor,
		simulatedMaxDrawdownPercent: simStats.maxDrawdownPercent,
		simulatedAvgR: simStats.avgR,
		pnlDeltaCents: simStats.totalPnlCents - originalStats.totalPnlCents,
		daysHitDailyLimit,
		daysHitDailyTarget,
	}

	const dateRange = trades.length > 0
		? { from: formatDateKey(trades[0].entryDate), to: formatDateKey(trades[trades.length - 1].entryDate) }
		: { from: "", to: "" }

	return { params, summary, trades: simulatedTrades, equityCurve, weeks, dateRange }
}

// ==========================================
// HELPERS
// ==========================================

const buildSkippedTrade = (
	trade: TradeForSimulation,
	dayKey: string,
	dayTradeNumber: number,
	status: SimulatedTradeStatus,
	dayPhase: DayPhase,
	equity: number,
	dailyPnlCents: number,
	consecutiveLosses: number,
	drawdownPercent: number
): SimulatedTrade => ({
	tradeId: trade.id,
	dayKey,
	dayTradeNumber,
	status,
	asset: trade.asset,
	direction: trade.direction,
	entryPrice: trade.entryPrice,
	exitPrice: trade.exitPrice,
	stopLoss: trade.stopLoss,
	originalPositionSize: trade.positionSize,
	originalPnlCents: trade.pnlCents,
	originalRMultiple: trade.rMultiple,
	simulatedPositionSize: null,
	simulatedPnlCents: null,
	simulatedRMultiple: null,
	riskAmountCents: null,
	dayPhase,
	riskReason: status.replace("skipped_", "").replace(/_/g, " "),
	recoveryStepIndex: null,
	equityAfterCents: equity,
	dailyPnlCents,
	consecutiveLosses,
	drawdownPercent,
})

/** Human-readable description of a RiskCalculation */
const describeRiskCalc = (calc: RiskCalculation): string => {
	switch (calc.type) {
		case "percentOfBase":
			return `${calc.percent}% of base`
		case "sameAsPrevious":
			return "same as previous"
		case "fixedCents":
			return `R$${(calc.amountCents / 100).toFixed(2)} fixed`
	}
}

export { runAdvancedSimulation, resolveRiskCalculation, describeRiskCalc }
