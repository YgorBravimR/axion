export interface DailyBreakdown {
	date: string
	tradeCount: number
	winCount: number
	lossCount: number
	pnl: number
	winRate: number
}

export interface WeeklyReport {
	weekStart: string
	weekEnd: string
	summary: {
		totalTrades: number
		winCount: number
		lossCount: number
		breakevenCount: number
		grossPnl: number
		netPnl: number
		totalFees: number
		winRate: number
		avgWin: number
		avgLoss: number
		profitFactor: number
		avgR: number
		bestTrade: number
		worstTrade: number
	}
	dailyBreakdown: DailyBreakdown[]
	topWins: Array<{
		id: string
		asset: string
		pnl: number
		r: number | null
		direction: string
		date: string
	}>
	topLosses: Array<{
		id: string
		asset: string
		pnl: number
		r: number | null
		direction: string
		date: string
	}>
}

export interface MonthlyReport {
	monthStart: string
	monthEnd: string
	summary: {
		totalTrades: number
		winCount: number
		lossCount: number
		breakevenCount: number
		grossPnl: number
		netPnl: number
		totalFees: number
		winRate: number
		avgWin: number
		avgLoss: number
		profitFactor: number
		avgR: number
		bestDay: { date: string; pnl: number } | null
		worstDay: { date: string; pnl: number } | null
	}
	weeklyBreakdown: Array<{
		weekStart: string
		weekEnd: string
		tradeCount: number
		pnl: number
		winRate: number
	}>
	assetBreakdown: Array<{
		asset: string
		tradeCount: number
		pnl: number
		winRate: number
	}>
}

export interface CommissionFeeImpact {
	summary: {
		totalFees: number
		totalCommission: number
		totalExchangeFees: number
		grossPnl: number
		feesAsPercentOfGross: number
		avgFeePerTrade: number
		totalTrades: number
	}
	assetBreakdown: Array<{
		asset: string
		totalFees: number
		tradeCount: number
		avgFeePerTrade: number
	}>
	monthlyTrend: Array<{
		month: string
		totalFees: number
		grossPnl: number
		feesAsPercentOfGross: number
		tradeCount: number
	}>
	hasData: boolean
}

export interface MistakeCostAnalysis {
	mistakes: Array<{
		tagId: string
		tagName: string
		color: string | null
		tradeCount: number
		totalLoss: number
		avgLoss: number
	}>
	totalMistakeCost: number
	mostCostlyMistake: string | null
}

export interface PropProfitCalculation {
	grossProfit: number
	propFirmShare: number
	traderShare: number
	estimatedTax: number
	netProfit: number
}

export interface MonthlyResultsWithProp {
	monthStart: string
	monthEnd: string
	report: MonthlyReport["summary"]
	prop: PropProfitCalculation
	settings: {
		isPropAccount: boolean
		propFirmName: string | null
		profitSharePercentage: number
		dayTradeTaxRate: number
	}
	weeklyBreakdown: MonthlyReport["weeklyBreakdown"]
}

export interface MonthlyProjection {
	daysTraded: number
	totalTradingDays: number
	tradingDaysRemaining: number
	currentProfit: number
	dailyAverage: number
	projectedMonthlyProfit: number
	projectedTraderShare: number
	projectedNetProfit: number
}

export interface MonthComparison {
	currentMonth: MonthlyResultsWithProp
	previousMonth: MonthlyResultsWithProp | null
	changes: {
		profitChange: number
		profitChangePercent: number
		winRateChange: number
		avgRChange: number
		tradeCountChange: number
	}
}

export interface YearlyOverview {
	year: number
	months: Array<{
		month: number
		monthName: string
		netPnl: number
		tradeCount: number
		hasTrades: boolean
	}>
}
