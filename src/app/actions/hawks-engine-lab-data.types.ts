import type { Direction, QualityTier } from "@/types/backtest"
import type { HtfWalkerState } from "@/lib/backtest/hawks-htf-walker"

/**
 * Per-brick trace row returned by the engine lab action.
 * Captures both the input state (gate, cooldown, trading window) and
 * the orchestrator's output decision for this brick.
 */
export interface EngineLabBrick {
	brickIndexInDay: number
	timestamp: string
	open: number
	high: number
	low: number
	close: number
	// Gate state from the HTF walker (before this brick's evaluation).
	gate60m: HtfWalkerState
	gate15m: HtfWalkerState
	// Was the brick inside the trading window (startTime ≤ HHMM < endTime)?
	inTradingWindow: boolean
	// Direction the 60m gate allowed at this brick, null if NO_SIGNAL.
	directionAllowed: Direction | null
	// Was the cooldown active at this brick?
	cooldownActive: boolean
	// Orchestrator output:
	fired: boolean
	direction: Direction | null
	price: number | null
	stopReference: number | null
	label: string | null
	tier: QualityTier | null
}

export interface EngineLabDayPayload {
	dayKey: string
	bricks: EngineLabBrick[]
}

export interface HawksEngineLabData {
	from: string
	to: string
	assetSymbol: string
	days: EngineLabDayPayload[]
	stats: {
		totalDays: number
		totalBricks: number
		totalFires: number
		bricksGateBull: number
		bricksGateBear: number
		bricksGateNoSignal: number
	}
}
