import type {
	RiskManagementProfileForSim,
	SimulationParamsV2,
	SimulatedTradeV2,
	SimulatedDay,
	SimulationRunV2,
	SimulationStatisticsV2,
	MonteCarloResultV2,
	DistributionBucket,
	TradeMode,
} from "@/types/monte-carlo"
import {
	assertNonEmpty,
	mapNonEmpty,
	mean,
	median,
	percentile,
	toSortedNonEmpty,
	type NonEmptyArray,
} from "@/lib/non-empty"

// ==========================================
// MONTE CARLO V2 — DAY-AWARE SIMULATION
// ==========================================

// ==========================================
// DYNAMIC RISK SIZING HELPERS
// ==========================================

/**
 * Computes effective base risk in cents based on the active sizing mode.
 *
 * - fixed: returns profile.baseRiskCents (unchanged behavior)
 * - percentOfBalance: risk = currentBalance × riskPercent / 100
 * - fixedRatio: Ralph Vince's formula — contract count scales with accumulated profit
 * - kellyFractional: Kelly Criterion divided by safety divisor
 *
 * @param profile - Flat simulation profile
 * @param currentBalance - Current account balance in cents
 * @param accumulatedProfit - Total profit since simulation start (for fixedRatio)
 */
const computeEffectiveBaseRisk = (
	profile: RiskManagementProfileForSim,
	currentBalance: number,
	accumulatedProfit: number
): number => {
	switch (profile.riskSizingMode) {
		case "fixed":
			return profile.baseRiskCents

		case "percentOfBalance": {
			if (!profile.riskPercent) {
				return profile.baseRiskCents
			}
			return Math.max(
				1,
				Math.round((currentBalance * profile.riskPercent) / 100)
			)
		}

		case "fixedRatio": {
			if (
				!profile.fixedRatioDeltaCents ||
				!profile.fixedRatioBaseContractRiskCents
			) {
				return profile.baseRiskCents
			}
			// Ralph Vince formula: N = floor((-1 + sqrt(1 + 8*P/Δ)) / 2) + 1
			// where P = accumulated profit, Δ = delta (profit needed per unit increase)
			const profitForCalc = Math.max(0, accumulatedProfit)
			const delta = profile.fixedRatioDeltaCents
			const contractCount = Math.max(
				1,
				Math.floor((-1 + Math.sqrt(1 + (8 * profitForCalc) / delta)) / 2) + 1
			)
			return contractCount * profile.fixedRatioBaseContractRiskCents
		}

		case "kellyFractional": {
			if (!profile.kellyDivisor) {
				return profile.baseRiskCents
			}
			const winProb = profile.winRate / 100
			const rr = profile.rewardRiskRatio
			// Kelly formula: f* = W - (1-W)/R
			const kellyFraction = Math.max(0, winProb - (1 - winProb) / rr)
			const adjustedFraction = kellyFraction / profile.kellyDivisor
			return Math.max(1, Math.round(currentBalance * adjustedFraction))
		}
	}
}

/**
 * Computes effective loss limits in absolute cents based on the limit mode.
 *
 * - fixedCents: returns profile limits directly (unchanged behavior)
 * - percentOfInitial: limits as % of initial balance
 * - rMultiples: limits as multiples of effective base risk
 */
const computeEffectiveLimits = (
	profile: RiskManagementProfileForSim,
	initialBalance: number,
	effectiveBaseRisk: number
): { daily: number; weekly: number | null; monthly: number } => {
	switch (profile.limitMode) {
		case "fixedCents":
			return {
				daily: profile.dailyLossLimitCents,
				weekly: profile.weeklyLossLimitCents,
				monthly: profile.monthlyLossLimitCents,
			}

		case "percentOfInitial":
			return {
				daily: profile.dailyLossPercent
					? Math.round((initialBalance * profile.dailyLossPercent) / 100)
					: profile.dailyLossLimitCents,
				weekly: profile.weeklyLossPercent
					? Math.round((initialBalance * profile.weeklyLossPercent) / 100)
					: profile.weeklyLossLimitCents,
				monthly: profile.monthlyLossPercent
					? Math.round((initialBalance * profile.monthlyLossPercent) / 100)
					: profile.monthlyLossLimitCents,
			}

		case "rMultiples":
			return {
				daily: profile.dailyLossR
					? Math.round(effectiveBaseRisk * profile.dailyLossR)
					: profile.dailyLossLimitCents,
				weekly: profile.weeklyLossR
					? Math.round(effectiveBaseRisk * profile.weeklyLossR)
					: profile.weeklyLossLimitCents,
				monthly: profile.monthlyLossR
					? Math.round(effectiveBaseRisk * profile.monthlyLossR)
					: profile.monthlyLossLimitCents,
			}
	}
}

/**
 * Evaluates drawdown tiers and returns a risk multiplier and pause flag.
 * Uses the "highest matching tier" — if DD is 9% and tiers are at 5% and 8%, the 8% tier wins.
 *
 * @param currentDrawdownPercent - Current drawdown % from peak
 * @param hasRecovered - Whether account has recovered past the recovery threshold
 */
const applyDrawdownAdjustment = (
	profile: RiskManagementProfileForSim,
	currentDrawdownPercent: number,
	hasRecovered: boolean
): { riskMultiplier: number; shouldPause: boolean } => {
	if (profile.drawdownTiers.length === 0 || hasRecovered) {
		return { riskMultiplier: 1, shouldPause: false }
	}

	// Find highest-DD tier that applies
	const applicableTiers = profile.drawdownTiers
		.filter((tier) => currentDrawdownPercent >= tier.drawdownPercent)
		.toSorted((a, b) => b.drawdownPercent - a.drawdownPercent)

	const [activeTier] = applicableTiers
	if (!activeTier) {
		return { riskMultiplier: 1, shouldPause: false }
	}

	if (activeTier.action === "pause") {
		return { riskMultiplier: 0, shouldPause: true }
	}

	return {
		riskMultiplier: 1 - activeTier.reducePercent / 100,
		shouldPause: false,
	}
}

/**
 * Evaluates consecutive losing day rules and returns a risk multiplier + action flags.
 */
const applyConsecutiveLossRules = (
	profile: RiskManagementProfileForSim,
	consecutiveLosingDays: number
): {
	riskMultiplier: number
	shouldStopDay: boolean
	shouldPauseWeek: boolean
} => {
	if (
		profile.consecutiveLossRules.length === 0 ||
		consecutiveLosingDays === 0
	) {
		return { riskMultiplier: 1, shouldStopDay: false, shouldPauseWeek: false }
	}

	// Find highest-count rule that applies
	const applicableRules = profile.consecutiveLossRules
		.filter((rule) => consecutiveLosingDays >= rule.consecutiveDays)
		.toSorted((a, b) => b.consecutiveDays - a.consecutiveDays)

	const [activeRule] = applicableRules
	if (!activeRule) {
		return { riskMultiplier: 1, shouldStopDay: false, shouldPauseWeek: false }
	}

	switch (activeRule.action) {
		case "reduceRisk":
			return {
				riskMultiplier: 1 - activeRule.reducePercent / 100,
				shouldStopDay: false,
				shouldPauseWeek: false,
			}
		case "stopDay":
			return { riskMultiplier: 0, shouldStopDay: true, shouldPauseWeek: false }
		case "pauseWeek":
			return { riskMultiplier: 0, shouldStopDay: false, shouldPauseWeek: true }
	}
}

// ==========================================
// MAIN SIMULATION RUNNER
// ==========================================

/**
 * Runs the full V2 Monte Carlo simulation: N simulated months,
 * each respecting the decision tree (loss recovery, gain compounding,
 * cascading weekly/monthly limits).
 *
 * Key difference from V1: V1 treats trades as independent coin flips.
 * V2 simulates **days** — each day follows the decision tree to determine
 * how many trades to take and at what risk, producing a daily P&L that
 * accumulates into weekly and monthly results.
 */
const runMonteCarloV2 = (params: SimulationParamsV2): MonteCarloResultV2 => {
	if (params.simulationCount < 1) {
		throw new Error("monte-carlo-v2: simulationCount must be ≥ 1")
	}

	const runs: SimulationRunV2[] = []
	const months = params.monthsToTrade

	for (let i = 0; i < params.simulationCount; i++) {
		// Chain months: each month starts with the previous month's ending balance
		let balance = params.initialBalance
		let peakBalance = balance
		let runMinBalance = balance // cross-month minimum balance tracking
		let accumulatedProfit = 0 // cross-month profit for fixedRatio mode
		const combinedDays: SimulatedDay[] = []
		let combinedTotalPnl = 0
		let combinedTotalTrades = 0
		let combinedTotalTradingDays = 0
		let combinedDaysInLossRecovery = 0
		let combinedDaysInGainCompounding = 0
		let combinedDaysSkippedWeeklyLimit = 0
		let combinedDaysSkippedMonthlyLimit = 0
		let combinedDaysSkippedConsecutiveLossDay = 0
		let combinedDaysSkippedConsecutiveLossWeek = 0
		let combinedDaysSkippedDrawdownPause = 0
		let combinedDaysTargetHit = 0
		let combinedTimesWeeklyLimitHit = 0
		let combinedMonthlyLimitHit = false
		let combinedMaxDrawdown = 0
		let combinedMaxDrawdownPercent = 0

		for (let m = 0; m < months; m++) {
			const monthResult = simulateMonth(
				params.profile,
				params.initialBalance,
				balance,
				accumulatedProfit
			)

			// Re-number days sequentially across months so DailyPnlChart works
			const dayOffset = m * params.profile.tradingDaysPerMonth
			for (const day of monthResult.days) {
				combinedDays.push({ ...day, dayNumber: day.dayNumber + dayOffset })
			}

			// Accumulate counters
			combinedTotalPnl += monthResult.totalPnl
			combinedTotalTrades += monthResult.totalTrades
			combinedTotalTradingDays += monthResult.totalTradingDays
			combinedDaysInLossRecovery += monthResult.daysInLossRecovery
			combinedDaysInGainCompounding += monthResult.daysInGainCompounding
			combinedDaysSkippedWeeklyLimit += monthResult.daysSkippedWeeklyLimit
			combinedDaysSkippedMonthlyLimit += monthResult.daysSkippedMonthlyLimit
			combinedDaysSkippedConsecutiveLossDay +=
				monthResult.daysSkippedConsecutiveLossDay
			combinedDaysSkippedConsecutiveLossWeek +=
				monthResult.daysSkippedConsecutiveLossWeek
			combinedDaysSkippedDrawdownPause += monthResult.daysSkippedDrawdownPause
			combinedDaysTargetHit += monthResult.daysTargetHit
			combinedTimesWeeklyLimitHit += monthResult.timesWeeklyLimitHit
			if (monthResult.monthlyLimitHit) {
				combinedMonthlyLimitHit = true
			}

			// Track cross-month minimum balance (the month tracks its own minBalance)
			runMinBalance = Math.min(runMinBalance, monthResult.minBalance)

			// Update accumulated profit for fixedRatio mode
			accumulatedProfit += monthResult.totalPnl

			// Carry forward balance for next month
			balance = monthResult.finalBalance

			// Cross-month drawdown tracking
			peakBalance = Math.max(peakBalance, balance)
			const drawdown = peakBalance - balance
			const drawdownPct = peakBalance > 0 ? (drawdown / peakBalance) * 100 : 0
			if (drawdownPct > combinedMaxDrawdownPercent) {
				combinedMaxDrawdown = drawdown
				combinedMaxDrawdownPercent = drawdownPct
			}
		}

		const ruinLevel =
			params.initialBalance * (1 - params.ruinThresholdPercent / 100)

		runs.push({
			days: combinedDays,
			totalPnl: combinedTotalPnl,
			totalTrades: combinedTotalTrades,
			totalTradingDays: combinedTotalTradingDays,
			daysInLossRecovery: combinedDaysInLossRecovery,
			daysInGainCompounding: combinedDaysInGainCompounding,
			daysSkippedWeeklyLimit: combinedDaysSkippedWeeklyLimit,
			daysSkippedMonthlyLimit: combinedDaysSkippedMonthlyLimit,
			daysSkippedConsecutiveLossDay: combinedDaysSkippedConsecutiveLossDay,
			daysSkippedConsecutiveLossWeek: combinedDaysSkippedConsecutiveLossWeek,
			daysSkippedDrawdownPause: combinedDaysSkippedDrawdownPause,
			daysTargetHit: combinedDaysTargetHit,
			timesWeeklyLimitHit: combinedTimesWeeklyLimitHit,
			monthlyLimitHit: combinedMonthlyLimitHit,
			maxDrawdown: combinedMaxDrawdown,
			maxDrawdownPercent: combinedMaxDrawdownPercent,
			finalBalance: balance,
			totalReturnPercent:
				((balance - params.initialBalance) / params.initialBalance) * 100,
			minBalance: runMinBalance,
			reachedRuin: runMinBalance <= ruinLevel,
		})
	}

	assertNonEmpty(
		runs,
		"monte-carlo-v2: runs must be non-empty after simulation"
	)

	const statistics = aggregateStatisticsV2(runs, params)
	const distributionBuckets = calculateDistributionV2(runs)

	// Find median run by total P&L
	const sortedByPnl = runs.toSorted((a, b) => a.totalPnl - b.totalPnl)
	assertNonEmpty(sortedByPnl, "monte-carlo-v2: sortedByPnl must be non-empty")
	const medianIndex = Math.floor(sortedByPnl.length / 2)
	const sampleRun = sortedByPnl[medianIndex] ?? sortedByPnl[0]

	return { params, statistics, distributionBuckets, sampleRun }
}

// ==========================================
// MONTH SIMULATION
// ==========================================

/**
 * Simulates one month of trading. Before each day:
 * 1. Compute effective base risk via sizing mode
 * 2. Compute effective limits via limit mode
 * 3. Check drawdown tiers → may pause or reduce risk
 * 4. Check consecutive loss rules → may stop/reduce
 * 5. Apply combined risk multiplier
 * 6. Scale recovery step risks relative to effective base
 */
const simulateMonth = (
	profile: RiskManagementProfileForSim,
	simInitialBalance: number,
	monthStartBalance: number,
	accumulatedProfit: number
): SimulationRunV2 => {
	let balance = monthStartBalance
	let peakBalance = balance
	let minBalance = balance
	let monthlyPnl = 0
	let weeklyPnl = 0
	let maxDrawdown = 0
	let maxDrawdownPercent = 0
	let consecutiveLosingDays = 0
	let weekPausedUntil = 0 // if > 0, skip until this week boundary

	const days: SimulatedDay[] = []
	let daysInLossRecovery = 0
	let daysInGainCompounding = 0
	let daysSkippedWeeklyLimit = 0
	let daysSkippedMonthlyLimit = 0
	let daysSkippedConsecutiveLossDay = 0
	let daysSkippedConsecutiveLossWeek = 0
	let daysSkippedDrawdownPause = 0
	let daysTargetHit = 0
	let timesWeeklyLimitHit = 0
	let monthlyLimitHit = false
	let totalTrades = 0

	for (let dayNum = 1; dayNum <= profile.tradingDaysPerMonth; dayNum++) {
		const weekNumber = Math.ceil(dayNum / profile.tradingDaysPerWeek)

		// Reset weekly P&L on week boundary
		if ((dayNum - 1) % profile.tradingDaysPerWeek === 0) {
			weeklyPnl = 0
			// Reset week pause on new week
			if (weekNumber > weekPausedUntil) {
				weekPausedUntil = 0
			}
		}

		// 1. Compute effective base risk for today
		const effectiveBaseRisk = computeEffectiveBaseRisk(
			profile,
			balance,
			accumulatedProfit + monthlyPnl
		)

		// 2. Compute effective limits
		const effectiveLimits = computeEffectiveLimits(
			profile,
			simInitialBalance,
			effectiveBaseRisk
		)

		// Check monthly loss limit
		if (monthlyPnl <= -effectiveLimits.monthly) {
			monthlyLimitHit = true
			days.push(makeSkippedDay(dayNum, weekNumber, "monthlyLimit"))
			daysSkippedMonthlyLimit++
			continue
		}

		// Check weekly loss limit
		if (
			effectiveLimits.weekly !== null &&
			weeklyPnl <= -effectiveLimits.weekly
		) {
			days.push(makeSkippedDay(dayNum, weekNumber, "weeklyLimit"))
			daysSkippedWeeklyLimit++
			continue
		}

		// Check week pause from consecutive loss rule
		if (weekPausedUntil >= weekNumber) {
			days.push(makeSkippedDay(dayNum, weekNumber, "weeklyLimit"))
			daysSkippedWeeklyLimit++
			continue
		}

		// 3. Drawdown-tiered risk adjustment
		const currentDrawdownPercent =
			peakBalance > 0 ? ((peakBalance - balance) / peakBalance) * 100 : 0
		// "Recovered" means current drawdown shrunk to or below the recovery
		// threshold (e.g. recoveryPercent=50 → recovered once DD ≤ 50% of the
		// triggering tier's depth). Previous logic compared against MAX tier
		// depth, which cleared protection too aggressively on partial recoveries.
		const drawdownFromPeak = peakBalance - balance
		const lowestActiveTierDepth = profile.drawdownTiers
			.filter((t) => currentDrawdownPercent >= t.drawdownPercent)
			.reduce((min, t) => Math.min(min, t.drawdownPercent), Infinity)
		const hasRecovered =
			profile.drawdownTiers.length > 0 &&
			drawdownFromPeak > 0 &&
			lowestActiveTierDepth !== Infinity &&
			currentDrawdownPercent <
				(profile.drawdownRecoveryPercent / 100) * lowestActiveTierDepth
		const ddAdjustment = applyDrawdownAdjustment(
			profile,
			currentDrawdownPercent,
			hasRecovered
		)

		if (ddAdjustment.shouldPause) {
			days.push(makeSkippedDay(dayNum, weekNumber, "drawdownPause"))
			daysSkippedDrawdownPause++
			continue
		}

		// 4. Consecutive loss rule adjustment
		const lossRuleAdj = applyConsecutiveLossRules(
			profile,
			consecutiveLosingDays
		)

		if (lossRuleAdj.shouldStopDay) {
			days.push(makeSkippedDay(dayNum, weekNumber, "consecutiveLossDay"))
			daysSkippedConsecutiveLossDay++
			continue
		}

		if (lossRuleAdj.shouldPauseWeek) {
			weekPausedUntil = weekNumber
			days.push(makeSkippedDay(dayNum, weekNumber, "consecutiveLossWeek"))
			daysSkippedConsecutiveLossWeek++
			continue
		}

		// 5. Combine risk multipliers
		const combinedMultiplier =
			ddAdjustment.riskMultiplier * lossRuleAdj.riskMultiplier
		const adjustedBaseRisk = Math.max(
			1,
			Math.round(effectiveBaseRisk * combinedMultiplier)
		)

		// 6. Scale recovery step risks relative to effective base
		const effectiveRecoveryRisks = profile.lossRecoverySteps.map((step) =>
			Math.max(1, Math.round(step.riskMultiplier * adjustedBaseRisk))
		)

		// Simulate the day with effective values
		const day = simulateDay(
			profile,
			balance,
			dayNum,
			weekNumber,
			adjustedBaseRisk,
			effectiveLimits.daily,
			effectiveRecoveryRisks
		)
		days.push(day)

		// Update accumulators
		balance += day.dayPnl
		monthlyPnl += day.dayPnl
		weeklyPnl += day.dayPnl
		totalTrades += day.trades.length

		// Track mode distribution
		if (day.mode === "lossRecovery") {
			daysInLossRecovery++
		}
		if (day.mode === "gainCompounding") {
			daysInGainCompounding++
		}
		if (day.targetHit) {
			daysTargetHit++
		}

		// Update consecutive losing days counter
		if (day.dayPnl < 0) {
			consecutiveLosingDays++
		} else {
			consecutiveLosingDays = 0
		}

		// Track lowest balance ever reached within this month
		minBalance = Math.min(minBalance, balance)

		// Drawdown tracking
		peakBalance = Math.max(peakBalance, balance)
		const drawdown = peakBalance - balance
		const drawdownPct = peakBalance > 0 ? (drawdown / peakBalance) * 100 : 0
		if (drawdownPct > maxDrawdownPercent) {
			maxDrawdown = drawdown
			maxDrawdownPercent = drawdownPct
		}

		// Re-check weekly limit after day completes (for counting purposes)
		if (
			effectiveLimits.weekly !== null &&
			weeklyPnl <= -effectiveLimits.weekly
		) {
			timesWeeklyLimitHit++
		}
	}

	return {
		days,
		totalPnl: monthlyPnl,
		totalTrades,
		totalTradingDays: days.filter((d) => !d.skipped).length,
		daysInLossRecovery,
		daysInGainCompounding,
		daysSkippedWeeklyLimit,
		daysSkippedMonthlyLimit,
		daysSkippedConsecutiveLossDay,
		daysSkippedConsecutiveLossWeek,
		daysSkippedDrawdownPause,
		daysTargetHit,
		timesWeeklyLimitHit,
		monthlyLimitHit,
		maxDrawdown,
		maxDrawdownPercent,
		finalBalance: balance,
		totalReturnPercent:
			((balance - monthStartBalance) / monthStartBalance) * 100,
		minBalance,
		reachedRuin: false, // will be set by runMonteCarloV2 with cross-month tracking
	}
}

// ==========================================
// DAY SIMULATION
// ==========================================

/**
 * Simulates a single trading day following the decision tree:
 *
 * 1. Take T1 (base trade) at effective base risk
 * 2. If T1 LOSES → enter loss recovery mode (T2, T3, T4... at effective recovery risks)
 * 3. If T1 WINS → enter gain compounding mode (reinvest % of gain, repeat until loss or target)
 *
 * The daily loss limit acts as a circuit breaker regardless of mode.
 *
 * Parameters are "effective" — already adjusted for dynamic sizing, drawdown tiers,
 * and consecutive loss rules by the caller (simulateMonth).
 */
const simulateDay = (
	profile: RiskManagementProfileForSim,
	currentBalance: number,
	dayNumber: number,
	weekNumber: number,
	effectiveBaseRisk: number,
	effectiveDailyLimit: number,
	effectiveRecoveryRisks: number[]
): SimulatedDay => {
	const trades: SimulatedTradeV2[] = []
	let dayPnl = 0
	let targetHit = false
	let dayMode: SimulatedDay["mode"]

	// T1 — base trade
	const t1 = simulateTrade({
		profile,
		riskAmount: effectiveBaseRisk,
		dayNumber,
		tradeNumberInDay: 1,
		mode: "base",
		dayPnl: 0,
		currentBalance,
	})
	trades.push(t1)
	dayPnl += t1.pnl

	if (t1.isBreakeven) {
		// Breakeven -- day ends with just T1
		dayMode = "gainCompounding"
	} else if (!t1.isWin) {
		// Loss recovery mode
		dayMode = "lossRecovery"

		for (const stepRisk of effectiveRecoveryRisks) {
			// Check daily loss limit before each recovery trade
			if (dayPnl <= -effectiveDailyLimit) {
				break
			}
			// Cap risk to remaining budget before hitting daily loss limit
			const remainingBudget = effectiveDailyLimit + dayPnl // dayPnl is negative
			const cappedRisk = Math.min(stepRisk, Math.max(0, remainingBudget))

			const recoveryTrade = simulateTrade({
				profile,
				riskAmount: cappedRisk,
				dayNumber,
				tradeNumberInDay: trades.length + 1,
				mode: "lossRecovery",
				dayPnl,
				currentBalance: currentBalance + dayPnl,
			})
			trades.push(recoveryTrade)
			dayPnl += recoveryTrade.pnl

			// If the recovery trade won and profile does NOT require executing all
			// remaining steps regardless, stop the recovery sequence early
			if (recoveryTrade.isWin && !profile.executeAllRegardless) {
				break
			}
		}
	} else {
		// Gain compounding mode
		dayMode = "gainCompounding"

		// Single target mode: first win = done
		if (profile.compoundingRiskPercent === 0) {
			if (
				profile.dailyTargetCents !== null &&
				dayPnl >= profile.dailyTargetCents
			) {
				targetHit = true
			}
		} else {
			// Compounding: risk % of accumulated gains
			let accumulatedGain = dayPnl
			const MAX_COMPOUNDING_TRADES = 50 // safety valve

			for (let ci = 0; ci < MAX_COMPOUNDING_TRADES; ci++) {
				// Check daily target
				if (
					profile.dailyTargetCents !== null &&
					dayPnl >= profile.dailyTargetCents
				) {
					targetHit = true
					break
				}

				// Calculate compounding risk
				const compoundingRisk = Math.round(
					accumulatedGain * (profile.compoundingRiskPercent / 100)
				)

				// Need meaningful risk to continue
				if (compoundingRisk <= 0) {
					break
				}

				// Check daily loss limit (protect against giving back more than limit)
				if (dayPnl - compoundingRisk < -effectiveDailyLimit) {
					break
				}

				const compoundTrade = simulateTrade({
					profile,
					riskAmount: compoundingRisk,
					dayNumber,
					tradeNumberInDay: trades.length + 1,
					mode: "gainCompounding",
					dayPnl,
					currentBalance: currentBalance + dayPnl,
				})
				trades.push(compoundTrade)
				dayPnl += compoundTrade.pnl

				if (compoundTrade.isBreakeven) {
					// Breakeven in compounding: no gain to compound, but not a "loss"
					// Accumulated gain doesn't change, compound off same base next iteration
					continue
				} else if (compoundTrade.isWin) {
					accumulatedGain = dayPnl
				} else if (profile.stopOnFirstLoss) {
					break
				} else {
					// Loss in compounding: recalculate accumulated gain from current day P&L
					accumulatedGain = Math.max(0, dayPnl)
					if (accumulatedGain <= 0) {
						break
					}
				}
			}

			// Check target one more time after loop
			if (
				!targetHit &&
				profile.dailyTargetCents !== null &&
				dayPnl >= profile.dailyTargetCents
			) {
				targetHit = true
			}
		}
	}

	return {
		dayNumber,
		weekNumber,
		mode: dayMode,
		trades,
		dayPnl,
		targetHit,
		skipped: false,
		skipReason: null,
	}
}

// ==========================================
// SINGLE TRADE SIMULATION
// ==========================================

interface SimulateTradeParams {
	profile: RiskManagementProfileForSim
	riskAmount: number
	dayNumber: number
	tradeNumberInDay: number
	mode: TradeMode
	dayPnl: number
	currentBalance: number
}

const simulateTrade = ({
	profile,
	riskAmount,
	dayNumber,
	tradeNumberInDay,
	mode,
	dayPnl,
	currentBalance,
}: SimulateTradeParams): SimulatedTradeV2 => {
	const commission = profile.commissionPerTradeCents

	// Three-outcome roll: breakeven first, then win/loss among decisive trades
	// breakevenRate is % of ALL trades; winRate is % of decisive (non-BE) trades
	const roll = Math.random() * 100
	const isBreakeven = roll < profile.breakevenRate
	const isWin =
		!isBreakeven &&
		((roll - profile.breakevenRate) / (100 - profile.breakevenRate)) * 100 <
			profile.winRate

	const pnl = isBreakeven
		? -commission // breakeven: no gain/loss, just commission
		: isWin
			? Math.round(riskAmount * profile.rewardRiskRatio) - commission
			: -riskAmount - commission

	return {
		dayNumber,
		tradeNumberInDay,
		mode,
		riskAmount,
		isWin,
		isBreakeven,
		pnl,
		commission,
		accumulatedDayPnl: dayPnl + pnl,
		balanceAfter: currentBalance + pnl,
	}
}

// ==========================================
// HELPERS
// ==========================================

const makeSkippedDay = (
	dayNumber: number,
	weekNumber: number,
	reason:
		| "weeklyLimit"
		| "monthlyLimit"
		| "consecutiveLossDay"
		| "consecutiveLossWeek"
		| "drawdownPause"
): SimulatedDay => ({
	dayNumber,
	weekNumber,
	mode: "lossRecovery",
	trades: [],
	dayPnl: 0,
	targetHit: false,
	skipped: true,
	skipReason: reason,
})

// ==========================================
// STATISTICS AGGREGATION
// ==========================================

const aggregateStatisticsV2 = (
	runs: NonEmptyArray<SimulationRunV2>,
	params: SimulationParamsV2
): SimulationStatisticsV2 => {
	const pnls = toSortedNonEmpty(
		mapNonEmpty(runs, (r) => r.totalPnl),
		(a, b) => a - b
	)
	const returns = toSortedNonEmpty(
		mapNonEmpty(runs, (r) => r.totalReturnPercent),
		(a, b) => a - b
	)
	const drawdowns = toSortedNonEmpty(
		mapNonEmpty(runs, (r) => r.maxDrawdownPercent),
		(a, b) => a - b
	)

	const meanOrZero = (arr: readonly number[]): number =>
		arr.length === 0 ? 0 : mean(arr as NonEmptyArray<number>)

	const stdDev = (values: readonly number[]): number => {
		if (values.length === 0) {
			return 0
		}
		const avg = meanOrZero(values)
		const squaredDiffs = values.map((v) => Math.pow(v - avg, 2))
		return Math.sqrt(meanOrZero(squaredDiffs))
	}

	const profitableRuns = runs.filter((r) => r.totalPnl > 0).length
	const limitHitRuns = runs.filter((r) => r.monthlyLimitHit).length

	// Sharpe/Sortino need PERIODIC returns (constant Δt), not cross-scenario
	// terminal returns. Compute per-run from each run's daily P&L series
	// (% of initial balance), then average across runs.
	const perRunSharpes: number[] = []
	const perRunSortinos: number[] = []
	for (const run of runs) {
		const dailyReturns = run.days
			.filter((d) => !d.skipped)
			.map((d) => (d.dayPnl / params.initialBalance) * 100)
		if (dailyReturns.length < 2) {
			perRunSharpes.push(0)
			perRunSortinos.push(0)
			continue
		}
		const m = meanOrZero(dailyReturns)
		const sd = stdDev(dailyReturns)
		const dd = Math.sqrt(
			dailyReturns.reduce((sum, r) => (r < 0 ? sum + r * r : sum), 0) /
				dailyReturns.length
		)
		perRunSharpes.push(sd > 0 ? m / sd : 0)
		perRunSortinos.push(dd > 0 ? m / dd : 0)
	}
	const sharpeRatio = meanOrZero(perRunSharpes)
	const sortinoRatio = meanOrZero(perRunSortinos)

	// Expected daily P&L: total P&L / total trading days across all runs
	const totalDays = runs.reduce((sum, r) => sum + r.totalTradingDays, 0)
	const totalPnl = runs.reduce((sum, r) => sum + r.totalPnl, 0)
	const expectedDailyPnl = totalDays > 0 ? totalPnl / totalDays : 0

	// Risk of Ruin: % of runs that hit the ruin threshold at any point
	const ruinCount = runs.filter((r) => r.reachedRuin).length
	const riskOfRuinPercent = (ruinCount / runs.length) * 100

	// Median lowest balance as % of initial
	const minBalPcts = toSortedNonEmpty(
		mapNonEmpty(runs, (r) => (r.minBalance / params.initialBalance) * 100),
		(a, b) => a - b
	)
	const medianMinBalancePercent = median(minBalPcts)

	return {
		medianMonthlyPnl: median(pnls),
		meanMonthlyPnl: mean(pnls),
		bestCaseMonthlyPnl: percentile(pnls, 95),
		worstCaseMonthlyPnl: percentile(pnls, 5),
		medianReturnPercent: median(returns),
		profitableMonthsPct: (profitableRuns / runs.length) * 100,
		monthlyLimitHitPct: (limitHitRuns / runs.length) * 100,
		avgTradingDaysPerMonth: mean(mapNonEmpty(runs, (r) => r.totalTradingDays)),
		avgDaysInLossRecovery: mean(mapNonEmpty(runs, (r) => r.daysInLossRecovery)),
		avgDaysInGainCompounding: mean(
			mapNonEmpty(runs, (r) => r.daysInGainCompounding)
		),
		avgDaysTargetHit: mean(mapNonEmpty(runs, (r) => r.daysTargetHit)),
		avgDaysSkippedWeeklyLimit: mean(
			mapNonEmpty(runs, (r) => r.daysSkippedWeeklyLimit)
		),
		avgDaysSkippedMonthlyLimit: mean(
			mapNonEmpty(runs, (r) => r.daysSkippedMonthlyLimit)
		),
		avgTradesPerMonth: mean(mapNonEmpty(runs, (r) => r.totalTrades)),
		medianMaxDrawdownPercent: median(drawdowns),
		worstMaxDrawdownPercent: percentile(drawdowns, 95),
		sharpeRatio,
		sortinoRatio,
		expectedDailyPnl,
		riskOfRuinPercent,
		medianMinBalancePercent,
	}
}

// ==========================================
// DISTRIBUTION (reuse V1's bucket approach)
// ==========================================

const calculateDistributionV2 = (
	runs: SimulationRunV2[]
): DistributionBucket[] => {
	const pnls = runs.map((r) => r.totalPnl)
	let min = Infinity
	let max = -Infinity
	for (const pnl of pnls) {
		if (pnl < min) {
			min = pnl
		}
		if (pnl > max) {
			max = pnl
		}
	}
	const bucketCount = 20
	const bucketSize = (max - min) / bucketCount || 1

	const buckets: DistributionBucket[] = []

	for (let i = 0; i < bucketCount; i++) {
		const rangeStart = min + i * bucketSize
		const rangeEnd = min + (i + 1) * bucketSize
		const isLastBucket = i === bucketCount - 1

		const count = pnls.filter(
			(p) => p >= rangeStart && (isLastBucket ? p <= rangeEnd : p < rangeEnd)
		).length

		buckets.push({
			rangeStart,
			rangeEnd,
			count,
			percentage: (count / runs.length) * 100,
		})
	}

	return buckets
}

export { runMonteCarloV2 }
