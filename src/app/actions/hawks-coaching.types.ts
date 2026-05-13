import type { CoachingInsight } from "@/lib/coaching/types"

interface HawksCoachingResult {
	insights: CoachingInsight[]
	tradeCount: number
	periodDays: number
}

export type { HawksCoachingResult }
