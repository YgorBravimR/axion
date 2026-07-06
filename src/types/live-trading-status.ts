/**
 * Live Trading Status types — represents the current state of a trader's day
 * as determined by their active risk management profile's decision tree.
 */

type DayPhase = "base" | "loss_recovery" | "gain_mode" | "normal"

/** Hawks never-red governor state surfaced to the live-status panels. */
interface HawksGovernorSnapshot {
	phase: "phase0" | "phaseA" | "phaseB"
	totalR: number
	cushion: number
	armed: boolean
}

interface LiveTradingStatus {
	dayPhase: DayPhase
	dayTradeNumber: number
	recoveryStepIndex: number | null
	totalRecoverySteps: number
	nextTradeRiskCents: number
	nextTradeMaxContracts: number | null
	riskReason: string
	dayGainsCents: number
	dailyPnlCents: number
	consecutiveLosses: number
	shouldStopTrading: boolean
	/**
	 * Existing reasons plus Hawks never-red governor reasons:
	 * - "neverRedFloor": Phase A cushion exhausted, day closed at >=0R.
	 * - "postTargetStop": Phase B, a losing trade after the daily target ended the day.
	 */
	stopReason: string | null
	/** Hawks governor snapshot (null for non-Hawks accounts). */
	hawksGovernor: HawksGovernorSnapshot | null
	shouldIncreaseSize: boolean
	shouldDecreaseSize: boolean
	sizeDirectionReason: string | null
	profileName: string
	baseRiskCents: number
	gainModeType: "compounding" | "singleTarget" | "gainSequence"
	gainModeReinvestPercent: number | null
	gainSequenceStepIndex: number | null
	totalGainSequenceSteps: number
	dailyTargetCents: number | null
	recoverySequenceExhausted: boolean
	/** Maps each input trade to its logical step number (breakevens repeat the previous step) */
	tradeStepNumbers: number[]
}

/** Compact summary of a single completed trade for the UI trade boxes */
interface TradeSummary {
	tradeStepNumber: number
	pnlCents: number
	outcome: "win" | "loss" | "breakeven" | null
	direction: "long" | "short"
	asset: string
	positionSize: number
	riskAmountCents: number | null
}

type LiveTradingStatusResult =
	| { hasProfile: false; fallbackRiskCents: number | null }
	| {
			hasProfile: true
			status: LiveTradingStatus
			tradeSummaries: TradeSummary[]
	  }

/** Minimal trade input for the live status resolver */
interface TradeOutcomeInput {
	pnlCents: number
	outcome: "win" | "loss" | "breakeven" | null
}

export type {
	DayPhase,
	HawksGovernorSnapshot,
	LiveTradingStatus,
	LiveTradingStatusResult,
	TradeSummary,
	TradeOutcomeInput,
}
