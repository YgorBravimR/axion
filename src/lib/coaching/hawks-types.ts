import type { TradeForCoaching } from "@/lib/coaching/types"

interface HawksStopEvent {
	methodViolation: boolean
	directionVsPosition: "with" | "against" | "same"
}

interface TradeForHawks extends TradeForCoaching {
	tripleScreenConfirmed: boolean
	biasAtEntry: "long" | "short" | "neutral"
	dailyTradeOrdinal: number
	stopEvents: readonly HawksStopEvent[]
}

export type { HawksStopEvent, TradeForHawks }
