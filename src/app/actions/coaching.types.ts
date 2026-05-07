import type { CoachingInsight } from "@/lib/coaching/pattern-detector"
import type { CoachingPrompt } from "@/lib/coaching/prompt-builder"
import type { OverallStats } from "@/types"

export interface CoachingContext {
	insights: CoachingInsight[]
	prompt: CoachingPrompt
	stats: OverallStats | null
	tradeCount: number
	periodDays: number
}
