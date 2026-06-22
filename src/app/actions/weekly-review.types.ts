import type { CoachingInsight } from "@/lib/coaching/pattern-detector"

export interface ReviewTrade {
	id: string
	asset: string
	direction: "long" | "short"
	entryDate: string
	pnl: number
	r: number | null
	outcome: "win" | "loss" | "breakeven" | null
	rating: "A" | "B" | "C" | "D" | "F" | null
	followedPlan: boolean | null
	lessonLearned: string | null
	postTradeReflection: string | null
	disciplineNotes: string | null
	mistakeTags: string[]
}

export interface DayBucket {
	date: string
	tradeCount: number
	pnl: number
	winCount: number
	lossCount: number
}

export interface AdherenceSummary {
	totalDecided: number
	followedCount: number
	deviatedCount: number
	uncategorizedCount: number
	deviationRate: number
	deviatingTradeIds: string[]
}

export interface MistakeRollup {
	tagId: string
	tagName: string
	color: string | null
	weekCount: number
	weekLossCents: number
	last90Count: number
}

export interface RiscoFlags {
	hasConsecutiveLossDay: boolean
	maxConsecutiveLossesInDay: number
	worstDayPnl: number
	worstDayDate: string | null
}

export interface WeeklyReviewPayload {
	isoYear: number
	isoWeek: number
	weekStart: string
	weekEnd: string
	hasTrades: boolean
	summary: {
		totalTrades: number
		netPnl: number
		winRate: number
		profitFactor: number
		avgR: number
		bestTrade: number
		worstTrade: number
	}
	trades: ReviewTrade[]
	dailyBreakdown: DayBucket[]
	adherence: AdherenceSummary
	insights: CoachingInsight[]
	mistakes: MistakeRollup[]
	risco: RiscoFlags
	saved: {
		lesson: string
		ruleChange: string
		focusNextWeek: string
		completedAt: string | null
	}
}
