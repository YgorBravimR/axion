/**
 * Simple mode simulation engine.
 *
 * Pure function: receives decrypted trades + flat params, returns simulation result.
 * No I/O, no encryption — all of that lives in the server action layer.
 */

import type {
	TradeForSimulation,
	SimpleSimulationParams,
	SimulatedTrade,
	SimulatedTradeStatus,
	DayTrace,
	WeekTrace,
	EquityCurvePoint,
	SimulationSummary,
	RiskSimulationResult,
} from "@/types/risk-simulation"
import {
	calculateTickBasedPositionSize,
	calculateAssetPnL,
	calculateRMultiple,
	calculateDrawdown,
	determineOutcome,
} from "@/lib/calculations"
import { formatDateKey, getWeekBoundaries, APP_TIMEZONE } from "@/lib/dates"

// ==========================================
// HELPERS
// ==========================================

/** Build a "YYYY-WNN" week key for grouping */
const buildWeekKey = (date: Date): string => {
	const { start } = getWeekBoundaries(date)
	return formatDateKey(start)
}

/** Build a human-readable week label like "Feb 17-21" */
const buildWeekLabel = (date: Date, locale = "en-US"): string => {
	const { start, end } = getWeekBoundaries(date)
	const fmt = new Intl.DateTimeFormat(locale, {
		month: "short",
		day: "numeric",
		timeZone: APP_TIMEZONE,
	})
	const startStr = fmt.format(start)
	const endDay = new Intl.DateTimeFormat(locale, {
		day: "numeric",
		timeZone: APP_TIMEZONE,
	}).format(end)
	return `${startStr}-${endDay}`
}

/** Calculate summary stats for a set of original trades */
const buildOriginalStats = (
	trades: TradeForSimulation[],
	initialEquityCents: number
): {
	totalPnlCents: number
	winRate: number
	profitFactor: number
	maxDrawdownPercent: number
	avgR: number
} => {
	let grossProfitCents = 0
	let grossLossCents = 0
	let wins = 0
	let losses = 0
	let totalR = 0
	let rCount = 0
	let equity = initialEquityCents
	let peak = initialEquityCents
	let maxDd = 0

	for (const trade of trades) {
		if (trade.outcome === "win") {
			grossProfitCents += trade.pnlCents
			wins++
		} else if (trade.outcome === "loss") {
			grossLossCents += Math.abs(trade.pnlCents)
			losses++
		}
		if (trade.rMultiple !== null) {
			totalR += trade.rMultiple
			rCount++
		}
		equity += trade.pnlCents
		if (equity > peak) {
			peak = equity
		}
		const dd = calculateDrawdown(equity, peak)
		if (dd > maxDd) {
			maxDd = dd
		}
	}

	const totalDecided = wins + losses
	return {
		totalPnlCents: trades.reduce((sum, t) => sum + t.pnlCents, 0),
		winRate: totalDecided > 0 ? (wins / totalDecided) * 100 : 0,
		profitFactor:
			grossLossCents > 0
				? grossProfitCents / grossLossCents
				: grossProfitCents > 0
					? Infinity
					: 0,
		maxDrawdownPercent: maxDd,
		avgR: rCount > 0 ? totalR / rCount : 0,
	}
}

// ==========================================
// MAIN ENGINE
// ==========================================

const runSimpleSimulation = (
	trades: TradeForSimulation[],
	params: SimpleSimulationParams
): RiskSimulationResult => {
	const {
		accountBalanceCents,
		riskPerTradePercent,
		dailyLossPercent,
		dailyProfitTargetPercent,
		maxDailyTrades,
		maxConsecutiveLosses,
		consecutiveLossScope,
		reduceRiskAfterLoss,
		riskReductionFactor,
		increaseRiskAfterWin,
		profitReinvestmentPercent,
		monthlyLossPercent,
		weeklyLossPercent,
	} = params

	// Derived cent values
	const baseRiskCents = Math.round(
		(accountBalanceCents * riskPerTradePercent) / 100
	)
	const dailyLossCents = Math.round(
		(accountBalanceCents * dailyLossPercent) / 100
	)
	const dailyProfitTargetCents = dailyProfitTargetPercent
		? Math.round((accountBalanceCents * dailyProfitTargetPercent) / 100)
		: null
	const monthlyLossCents = monthlyLossPercent
		? Math.round((accountBalanceCents * monthlyLossPercent) / 100)
		: null
	const weeklyLossCents = weeklyLossPercent
		? Math.round((accountBalanceCents * weeklyLossPercent) / 100)
		: null

	// Running state
	let equity = accountBalanceCents
	let peak = accountBalanceCents
	let consecutiveLosses = 0
	let monthlyPnlCents = 0
	let weeklyPnlCents = 0
	let currentDayKey = ""
	let currentMonthKey = ""
	let currentWeekKey = ""
	let dailyPnlCents = 0
	let dailyTradeCount = 0
	let dailyLimitHit = false
	let dailyTargetHit = false
	let lastOutcome: "win" | "loss" | "breakeven" | null = null
	let lastSimulatedPnlCents = 0

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
			// Track previous day's limit/target hits
			if (currentDayKey && dailyLimitHit) {
				daysHitDailyLimit++
			}
			if (currentDayKey && dailyTargetHit) {
				daysHitDailyTarget++
			}

			currentDayKey = dayKey
			dailyPnlCents = 0
			dailyTradeCount = 0
			dailyLimitHit = false
			dailyTargetHit = false
			if (consecutiveLossScope === "daily") {
				consecutiveLosses = 0
			}
		}

		// ── Month boundary reset ──
		if (monthKey !== currentMonthKey) {
			currentMonthKey = monthKey
			monthlyPnlCents = 0
		}

		// ── Week boundary reset ──
		if (weekKey !== currentWeekKey) {
			currentWeekKey = weekKey
			weeklyPnlCents = 0
		}

		dailyTradeCount++

		// Track original equity curve regardless of skip/execute
		originalEquity += trade.pnlCents

		// ── SKIP CHECKS (order matters) ──
		let skipStatus: SimulatedTradeStatus | null = null

		if (!trade.stopLoss || Math.abs(trade.entryPrice - trade.stopLoss) === 0) {
			skipStatus = "skipped_no_sl"
			skippedNoSl++
		} else if (monthlyLossCents && monthlyPnlCents <= -monthlyLossCents) {
			skipStatus = "skipped_monthly_limit"
			skippedMonthlyLimit++
		} else if (weeklyLossCents && weeklyPnlCents <= -weeklyLossCents) {
			skipStatus = "skipped_weekly_limit"
			skippedWeeklyLimit++
		} else if (dailyLimitHit || dailyPnlCents <= -dailyLossCents) {
			skipStatus = "skipped_daily_limit"
			skippedDailyLimit++
			dailyLimitHit = true
		} else if (
			dailyTargetHit ||
			(dailyProfitTargetCents && dailyPnlCents >= dailyProfitTargetCents)
		) {
			skipStatus = "skipped_daily_target"
			skippedDailyTarget++
			dailyTargetHit = true
		} else if (maxDailyTrades && dailyTradeCount > maxDailyTrades) {
			skipStatus = "skipped_max_trades"
			skippedMaxTrades++
		} else if (
			maxConsecutiveLosses &&
			consecutiveLosses >= maxConsecutiveLosses
		) {
			skipStatus = "skipped_consecutive_loss"
			skippedConsecutiveLoss++
		}

		if (skipStatus) {
			const drawdownPercent = calculateDrawdown(equity, peak)
			simulatedTrades.push({
				tradeId: trade.id,
				dayKey,
				dayTradeNumber: dailyTradeCount,
				status: skipStatus,
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
				dayPhase: "normal",
				riskReason: skipStatus,
				recoveryStepIndex: null,
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
			continue
		}

		// ── CALCULATE RISK ──
		let adjustedRiskCents = baseRiskCents
		let riskReason = "riskSimulation.reasons.baseRisk"

		if (reduceRiskAfterLoss && consecutiveLosses > 0) {
			adjustedRiskCents = Math.round(
				baseRiskCents * Math.pow(riskReductionFactor, consecutiveLosses)
			)
			riskReason = `riskSimulation.reasons.reducedLoss|${consecutiveLosses}|${Math.pow(riskReductionFactor, consecutiveLosses).toFixed(2)}`
		} else if (
			increaseRiskAfterWin &&
			lastOutcome === "win" &&
			profitReinvestmentPercent &&
			lastSimulatedPnlCents > 0
		) {
			const bonus = Math.round(
				lastSimulatedPnlCents * (profitReinvestmentPercent / 100)
			)
			adjustedRiskCents = baseRiskCents + bonus
			riskReason = `riskSimulation.reasons.winBonus|${profitReinvestmentPercent}`
		}

		// Minimum 1 cent risk
		if (adjustedRiskCents < 1) {
			adjustedRiskCents = 1
		}

		// ── CALCULATE POSITION + P&L ──
		const sizing = calculateTickBasedPositionSize({
			riskBudgetCents: adjustedRiskCents,
			entryPrice: trade.entryPrice,
			stopLoss: trade.stopLoss!,
			tickSize: trade.tickSize,
			tickValue: trade.tickValue,
		})

		// Calculate P&L with the new position size
		const pnlResult = calculateAssetPnL({
			entryPrice: trade.entryPrice,
			exitPrice: trade.exitPrice,
			positionSize: sizing.contracts,
			direction: trade.direction,
			tickSize: trade.tickSize,
			tickValue: trade.tickValue / 100, // tickValue in the engine is cents, calculateAssetPnL expects dollars
			commission: trade.commissionPerExecution / 100,
			fees: trade.feesPerExecution / 100,
			contractsExecuted: sizing.contracts * 2, // entry + exit
		})

		const simulatedPnlCents = Math.round(pnlResult.netPnl * 100)
		const simulatedOutcome = determineOutcome({ pnl: pnlResult.netPnl })
		const simulatedRMultiple =
			sizing.actualRiskCents > 0
				? calculateRMultiple(simulatedPnlCents, sizing.actualRiskCents)
				: null

		// ── UPDATE STATE ──
		equity += simulatedPnlCents
		if (equity > peak) {
			peak = equity
		}
		dailyPnlCents += simulatedPnlCents
		monthlyPnlCents += simulatedPnlCents
		weeklyPnlCents += simulatedPnlCents

		if (simulatedOutcome === "loss") {
			consecutiveLosses++
		} else if (simulatedOutcome === "win") {
			consecutiveLosses = 0
		}

		lastOutcome = simulatedOutcome
		lastSimulatedPnlCents = simulatedPnlCents

		// Check if limits were just hit
		if (dailyPnlCents <= -dailyLossCents) {
			dailyLimitHit = true
		}
		if (dailyProfitTargetCents && dailyPnlCents >= dailyProfitTargetCents) {
			dailyTargetHit = true
		}

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
			dayPhase: "normal",
			riskReason,
			recoveryStepIndex: null,
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
	if (currentDayKey && dailyLimitHit) {
		daysHitDailyLimit++
	}
	if (currentDayKey && dailyTargetHit) {
		daysHitDailyTarget++
	}

	// ── BUILD WEEK/DAY TRACE ──
	const weeks = buildWeekTraces(trades, simulatedTrades)

	// ── BUILD SUMMARY ──
	const originalStats = buildOriginalStats(trades, accountBalanceCents)
	const simStats = buildSimulatedStats(simulatedTrades, accountBalanceCents)

	const summary: SimulationSummary = {
		totalTrades: trades.length,
		executedTrades: simulatedTrades.filter((t) => t.status === "executed")
			.length,
		skippedNoSl,
		skippedDailyLimit,
		skippedDailyTarget,
		skippedMaxTrades,
		skippedConsecutiveLoss,
		skippedMonthlyLimit,
		skippedWeeklyLimit,
		originalTotalPnlCents: originalStats.totalPnlCents,
		originalWinRate: originalStats.winRate,
		originalProfitFactor:
			originalStats.profitFactor === Infinity
				? 999
				: originalStats.profitFactor,
		originalMaxDrawdownPercent: originalStats.maxDrawdownPercent,
		originalAvgR: originalStats.avgR,
		simulatedTotalPnlCents: simStats.totalPnlCents,
		simulatedWinRate: simStats.winRate,
		simulatedProfitFactor:
			simStats.profitFactor === Infinity ? 999 : simStats.profitFactor,
		simulatedMaxDrawdownPercent: simStats.maxDrawdownPercent,
		simulatedAvgR: simStats.avgR,
		pnlDeltaCents: simStats.totalPnlCents - originalStats.totalPnlCents,
		daysHitDailyLimit,
		daysHitDailyTarget,
	}

	const dateRange =
		trades.length > 0
			? {
					from: formatDateKey(trades[0].entryDate),
					to: formatDateKey(trades[trades.length - 1].entryDate),
				}
			: { from: "", to: "" }

	return {
		params,
		summary,
		trades: simulatedTrades,
		equityCurve,
		weeks,
		dateRange,
	}
}

// ==========================================
// SHARED HELPERS
// ==========================================

const buildSimulatedStats = (
	simulatedTrades: SimulatedTrade[],
	initialEquityCents: number
): {
	totalPnlCents: number
	winRate: number
	profitFactor: number
	maxDrawdownPercent: number
	avgR: number
} => {
	const executed = simulatedTrades.filter((t) => t.status === "executed")
	let grossProfitCents = 0
	let grossLossCents = 0
	let wins = 0
	let losses = 0
	let totalR = 0
	let rCount = 0
	let equity = initialEquityCents
	let peak = initialEquityCents
	let maxDd = 0

	for (const trade of executed) {
		const pnl = trade.simulatedPnlCents ?? 0
		if (pnl > 0) {
			grossProfitCents += pnl
			wins++
		} else if (pnl < 0) {
			grossLossCents += Math.abs(pnl)
			losses++
		}
		if (trade.simulatedRMultiple !== null) {
			totalR += trade.simulatedRMultiple
			rCount++
		}
		equity += pnl
		if (equity > peak) {
			peak = equity
		}
		const dd = calculateDrawdown(equity, peak)
		if (dd > maxDd) {
			maxDd = dd
		}
	}

	const totalDecided = wins + losses
	return {
		totalPnlCents: executed.reduce(
			(sum, t) => sum + (t.simulatedPnlCents ?? 0),
			0
		),
		winRate: totalDecided > 0 ? (wins / totalDecided) * 100 : 0,
		profitFactor:
			grossLossCents > 0
				? grossProfitCents / grossLossCents
				: grossProfitCents > 0
					? Infinity
					: 0,
		maxDrawdownPercent: maxDd,
		avgR: rCount > 0 ? totalR / rCount : 0,
	}
}

/** Group simulated trades into week/day structure for the trace modal */
const buildWeekTraces = (
	originalTrades: TradeForSimulation[],
	simulatedTrades: SimulatedTrade[]
): WeekTrace[] => {
	const dayMap = new Map<string, SimulatedTrade[]>()

	for (const trade of simulatedTrades) {
		const existing = dayMap.get(trade.dayKey) ?? []
		existing.push(trade)
		dayMap.set(trade.dayKey, existing)
	}

	const weekMap = new Map<string, DayTrace[]>()

	for (const [dayKey, dayTrades] of dayMap) {
		const firstTrade = originalTrades.find(
			(t) => formatDateKey(t.entryDate) === dayKey
		)
		if (!firstTrade) {
			continue
		}

		const weekKey = buildWeekKey(firstTrade.entryDate)
		const executedTrades = dayTrades.filter((t) => t.status === "executed")
		const skippedTrades = dayTrades.filter((t) => t.status !== "executed")

		const dayTrace: DayTrace = {
			dayKey,
			weekKey,
			trades: dayTrades,
			dayResult: {
				totalPnlCents: executedTrades.reduce(
					(sum, t) => sum + (t.simulatedPnlCents ?? 0),
					0
				),
				executedCount: executedTrades.length,
				skippedCount: skippedTrades.length,
				hitDailyLimit: dayTrades.some(
					(t) => t.status === "skipped_daily_limit"
				),
				hitDailyTarget: dayTrades.some(
					(t) => t.status === "skipped_daily_target"
				),
				finalPhase: dayTrades[dayTrades.length - 1]?.dayPhase ?? "normal",
			},
		}

		const existing = weekMap.get(weekKey) ?? []
		existing.push(dayTrace)
		weekMap.set(weekKey, existing)
	}

	// Convert to sorted WeekTrace array
	const weeks: WeekTrace[] = []
	for (const [weekKey, days] of weekMap) {
		const sortedDays = days.toSorted((a, b) => a.dayKey.localeCompare(b.dayKey))
		const firstTrade = originalTrades.find(
			(t) => buildWeekKey(t.entryDate) === weekKey
		)

		weeks.push({
			weekKey,
			weekLabel: firstTrade ? buildWeekLabel(firstTrade.entryDate) : weekKey,
			days: sortedDays,
			weekPnlCents: sortedDays.reduce(
				(sum, d) => sum + d.dayResult.totalPnlCents,
				0
			),
		})
	}

	return weeks.toSorted((a, b) => a.weekKey.localeCompare(b.weekKey))
}

export {
	runSimpleSimulation,
	buildWeekKey,
	buildWeekTraces,
	buildSimulatedStats,
	buildOriginalStats,
}
