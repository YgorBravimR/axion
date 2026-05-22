interface CoachingInsight {
	id: string
	category: "time" | "strategy" | "risk" | "psychology" | "fees"
	severity: "info" | "attention" | "warning"
	titleKey: string
	descriptionKey: string
	params: Record<string, string | number>
	confidence: number
}

interface TradeForCoaching {
	entryDate: Date
	exitDate: Date | null
	pnl: number | string | null
	outcome: "win" | "loss" | "breakeven" | null
	realizedRMultiple: string | null
	asset: string
	direction: "long" | "short"
	strategyName: string | null
	setupRank: "A" | "AA" | "AAA" | null
	rating: "A" | "B" | "C" | "D" | "F" | null
	followedPlan: boolean | null
	commission: number | string | null
	fees: number | string | null
}

export type { CoachingInsight, TradeForCoaching }
