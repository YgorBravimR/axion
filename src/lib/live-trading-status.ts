/**
 * Pure function that resolves the live trading status for the current day.
 *
 * Replays today's completed trades through the active risk profile's decision tree
 * and computes what the NEXT trade's risk/phase/constraints should be.
 */

import type { DecisionTreeConfig } from "@/types/risk-profile"
import type { LiveTradingStatus, TradeOutcomeInput, DayPhase } from "@/types/live-trading-status"
import { resolveRiskCalculation, describeRiskCalc } from "@/lib/risk-simulation-advanced"

interface ResolveLiveStatusParams {
	trades: TradeOutcomeInput[]
	decisionTree: DecisionTreeConfig
	profileName: string
	dailyLossCents: number
	dailyProfitTargetCents: number | null
	maxTrades: number | null
}

const resolveLiveStatus = ({
	trades,
	decisionTree,
	profileName,
	dailyLossCents,
	dailyProfitTargetCents,
	maxTrades,
}: ResolveLiveStatusParams): LiveTradingStatus => {
	const { baseTrade, lossRecovery, gainMode } = decisionTree
	const baseRiskCents = baseTrade.riskCents
	const totalRecoverySteps = lossRecovery.sequence.length

	// Running state — mirrors the simulation engine's day-level tracking
	let dayPhase: DayPhase = "base"
	let recoveryIndex = 0
	let gainSequenceIndex = 0
	let previousRiskCents = baseRiskCents
	let dayGainsCents = 0
	let dailyPnlCents = 0
	let consecutiveLosses = 0
	let dailyTargetHit = false
	let recoveryWinExit = false
	let lastUsedRiskCents = baseRiskCents

	// Logical step counter — breakeven trades are invisible to the phase machine
	let currentStepNumber = 0
	const tradeStepNumbers: number[] = []

	// Replay each completed trade
	for (let i = 0; i < trades.length; i++) {
		const trade = trades[i]

		dailyPnlCents += trade.pnlCents

		// Breakeven trades: accumulate P&L but skip ALL phase logic
		if (trade.outcome === "breakeven") {
			tradeStepNumbers.push(currentStepNumber || 1)
			continue
		}

		// Non-breakeven: advance logical step
		currentStepNumber++
		tradeStepNumbers.push(currentStepNumber)

		const isT1 = currentStepNumber === 1

		// Track consecutive losses
		if (trade.outcome === "loss") {
			consecutiveLosses++
		} else if (trade.outcome === "win") {
			consecutiveLosses = 0
		}

		// Compute what risk was used for this trade (to track previousRiskCents)
		let usedRiskCents = baseRiskCents

		if (isT1) {
			usedRiskCents = baseRiskCents
		} else if (dayPhase === "loss_recovery") {
			if (recoveryIndex < totalRecoverySteps) {
				const step = lossRecovery.sequence[recoveryIndex]
				usedRiskCents = resolveRiskCalculation(step.riskCalculation, baseRiskCents, previousRiskCents)
			}
		} else if (dayPhase === "gain_mode" && gainMode.type === "compounding") {
			usedRiskCents = Math.max(1, Math.round(dayGainsCents * (gainMode.reinvestmentPercent / 100)))
		} else if (dayPhase === "gain_mode" && gainMode.type === "gainSequence") {
			const seqLen = gainMode.sequence.length
			if (gainSequenceIndex < seqLen) {
				const step = gainMode.sequence[gainSequenceIndex]
				usedRiskCents = resolveRiskCalculation(step.riskCalculation, baseRiskCents, previousRiskCents)
			} else if (gainMode.repeatLastStep && seqLen > 0) {
				const lastStep = gainMode.sequence[seqLen - 1]
				usedRiskCents = resolveRiskCalculation(lastStep.riskCalculation, baseRiskCents, previousRiskCents)
			}
		}

		previousRiskCents = usedRiskCents
		lastUsedRiskCents = usedRiskCents

		// T1 branching: determine phase after this trade
		if (isT1) {
			if (trade.outcome === "loss") {
				dayPhase = "loss_recovery"
				recoveryIndex = 0
			} else if (trade.outcome === "win") {
				dayGainsCents += trade.pnlCents
				dayPhase = "gain_mode"
				gainSequenceIndex = 0
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
			if (trade.outcome === "win" && !lossRecovery.executeAllRegardless) {
				// Recovery win: if stopAfterSequence, the day is done (any gain after
				// the loss path starts = exit). Otherwise transition to gain mode.
				if (lossRecovery.stopAfterSequence) {
					recoveryWinExit = true
				} else {
					dayGainsCents += trade.pnlCents
					dayPhase = "gain_mode"
					gainSequenceIndex = 0
				}
			} else {
				recoveryIndex++
			}
		} else if (dayPhase === "gain_mode" && gainMode.type === "compounding") {
			if (trade.outcome === "loss" && gainMode.stopOnFirstLoss) {
				dailyTargetHit = true
			} else if (trade.outcome === "win") {
				dayGainsCents += trade.pnlCents
				if (gainMode.dailyTargetCents && dayGainsCents >= gainMode.dailyTargetCents) {
					dailyTargetHit = true
				}
			}
		} else if (dayPhase === "gain_mode" && gainMode.type === "gainSequence") {
			if (trade.outcome === "loss" && gainMode.stopOnFirstLoss) {
				dailyTargetHit = true
			} else if (trade.outcome === "win") {
				dayGainsCents += trade.pnlCents
				gainSequenceIndex++
				if (gainMode.dailyTargetCents && dayGainsCents >= gainMode.dailyTargetCents) {
					dailyTargetHit = true
				}
			}
		}

	}

	// Evaluate daily limits on FINAL P&L (non-sticky — recovery wins can clear them)
	const dailyLimitHit = dailyPnlCents <= -dailyLossCents
	if (dailyProfitTargetCents && dailyPnlCents >= dailyProfitTargetCents) dailyTargetHit = true

	// Now compute the NEXT trade's state
	const isNextT1 = currentStepNumber === 0

	let nextTradeRiskCents = baseRiskCents
	let nextTradeMaxContracts = baseTrade.maxContracts
	let riskReason = "T1 base risk"
	let nextRecoveryStepIndex: number | null = null
	let recoverySequenceExhausted = false
	let shouldStopTrading = false
	let stopReason: string | null = null

	// Check stop conditions first
	if (dailyLimitHit) {
		shouldStopTrading = true
		stopReason = "dailyLossLimit"
	} else if (dailyTargetHit) {
		shouldStopTrading = true
		stopReason = "dailyTargetReached"
	} else if (recoveryWinExit) {
		shouldStopTrading = true
		stopReason = "recoveryWinExit"
	} else if (maxTrades !== null && currentStepNumber >= maxTrades) {
		shouldStopTrading = true
		stopReason = "maxTradesReached"
	}

	if (isNextT1) {
		// No trades yet — T1 base risk
		nextTradeRiskCents = baseRiskCents
		riskReason = "T1 base risk"
	} else if (dayPhase === "loss_recovery") {
		if (recoveryIndex >= totalRecoverySteps) {
			recoverySequenceExhausted = true
			if (lossRecovery.stopAfterSequence) {
				shouldStopTrading = true
				stopReason = "recoverySequenceExhausted"
				riskReason = "Recovery sequence exhausted"
			} else {
				// Fall through to normal base risk
				nextTradeRiskCents = baseRiskCents
				riskReason = "Post-recovery base risk"
			}
		} else {
			const step = lossRecovery.sequence[recoveryIndex]
			nextTradeRiskCents = resolveRiskCalculation(step.riskCalculation, baseRiskCents, previousRiskCents)
			riskReason = `Recovery #${recoveryIndex + 1} (${describeRiskCalc(step.riskCalculation)})`
			nextTradeMaxContracts = step.maxContractsOverride ?? baseTrade.maxContracts
			nextRecoveryStepIndex = recoveryIndex
		}
	} else if (dayPhase === "gain_mode") {
		if (gainMode.type === "singleTarget") {
			shouldStopTrading = true
			stopReason = "singleTargetGainMode"
			riskReason = "Single target reached"
		} else if (gainMode.type === "compounding") {
			if (dayGainsCents > 0) {
				nextTradeRiskCents = Math.max(1, Math.round(dayGainsCents * (gainMode.reinvestmentPercent / 100)))
				riskReason = `Gain reinvest (${gainMode.reinvestmentPercent}% of day gains)`
			} else {
				nextTradeRiskCents = baseRiskCents
				riskReason = "Base risk (no gains to reinvest)"
			}
		} else if (gainMode.type === "gainSequence") {
			const seqLen = gainMode.sequence.length
			if (gainSequenceIndex < seqLen) {
				const step = gainMode.sequence[gainSequenceIndex]
				nextTradeRiskCents = resolveRiskCalculation(step.riskCalculation, baseRiskCents, previousRiskCents)
				riskReason = `Gain #${gainSequenceIndex + 1} (${describeRiskCalc(step.riskCalculation)})`
				nextTradeMaxContracts = step.maxContractsOverride ?? baseTrade.maxContracts
			} else if (gainMode.repeatLastStep && seqLen > 0) {
				const lastStep = gainMode.sequence[seqLen - 1]
				nextTradeRiskCents = resolveRiskCalculation(lastStep.riskCalculation, baseRiskCents, previousRiskCents)
				riskReason = `Gain repeat (${describeRiskCalc(lastStep.riskCalculation)})`
				nextTradeMaxContracts = lastStep.maxContractsOverride ?? baseTrade.maxContracts
			} else {
				shouldStopTrading = true
				stopReason = "gainSequenceExhausted"
				riskReason = "Gain sequence exhausted"
			}
		}
	} else {
		// Normal phase
		nextTradeRiskCents = baseRiskCents
		riskReason = "Base risk"
	}

	// Minimum 1 cent risk
	if (nextTradeRiskCents < 1) nextTradeRiskCents = 1

	// Size direction signals
	const shouldIncreaseSize = nextTradeRiskCents > baseRiskCents
	const shouldDecreaseSize = nextTradeRiskCents < baseRiskCents
	let sizeDirectionReason: string | null = null

	if (shouldIncreaseSize) {
		sizeDirectionReason = `${Math.round((nextTradeRiskCents / baseRiskCents) * 100)}% of base`
	} else if (shouldDecreaseSize) {
		sizeDirectionReason = `${Math.round((nextTradeRiskCents / baseRiskCents) * 100)}% of base`
	}

	return {
		dayPhase: isNextT1 ? "base" : dayPhase,
		dayTradeNumber: currentStepNumber,
		recoveryStepIndex: nextRecoveryStepIndex,
		totalRecoverySteps,
		nextTradeRiskCents,
		nextTradeMaxContracts,
		riskReason,
		dayGainsCents,
		dailyPnlCents,
		consecutiveLosses,
		shouldStopTrading,
		stopReason,
		shouldIncreaseSize,
		shouldDecreaseSize,
		sizeDirectionReason,
		profileName,
		baseRiskCents,
		gainModeType: gainMode.type,
		gainModeReinvestPercent: gainMode.type === "compounding" ? gainMode.reinvestmentPercent : null,
		gainSequenceStepIndex: gainMode.type === "gainSequence" ? gainSequenceIndex : null,
		totalGainSequenceSteps: gainMode.type === "gainSequence" ? gainMode.sequence.length : 0,
		dailyTargetCents: gainMode.dailyTargetCents ?? null,
		recoverySequenceExhausted,
		tradeStepNumbers,
	}
}

export { resolveLiveStatus }
