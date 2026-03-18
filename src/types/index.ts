// API Response Types
export interface ActionResponse<T> {
	status: "success" | "error"
	message: string
	data?: T
	errors?: ActionError[]
}

export interface ActionError {
	code: string
	detail: string
	field?: string
}

export interface PaginatedResponse<T> {
	items: T[]
	pagination: {
		total: number
		limit: number
		offset: number
		hasMore: boolean
	}
}

// Trade Types
export type TradeDirection = "long" | "short"
export type TradeOutcome = "win" | "loss" | "breakeven"
export type TagType = "setup" | "mistake" | "general"

// Filter Types
export interface TradeFilters {
	dateFrom?: Date
	dateTo?: Date
	assets?: string[]
	directions?: TradeDirection[]
	outcomes?: TradeOutcome[]
	strategyIds?: string[]
	tagIds?: string[]
	timeframeIds?: string[]
}

export interface PaginationParams {
	limit?: number
	offset?: number
	sortBy?: string
	sortOrder?: "asc" | "desc"
}

// Stats Types
export interface OverallStats {
	grossPnl: number // P&L before fees
	netPnl: number // P&L after fees
	totalFees: number // Total fees deducted
	winRate: number
	profitFactor: number
	averageR: number
	totalTrades: number
	winCount: number
	lossCount: number
	breakevenCount: number
	avgWin: number
	avgLoss: number
}

export interface DisciplineData {
	score: number
	totalTrades: number
	followedCount: number
	trend: "up" | "down" | "stable"
	recentCompliance: number
}

export interface EquityPoint {
	date: string
	equity: number
	accountEquity: number
	drawdown: number
	tradeNumber?: number
}

export interface DailyPnL {
	date: string
	pnl: number
	tradeCount: number
}

export interface StreakData {
	currentStreak: number
	currentStreakType: "win" | "loss" | "none"
	longestWinStreak: number
	longestLossStreak: number
	bestDay: { date: string; pnl: number } | null
	worstDay: { date: string; pnl: number } | null
}

export interface TagStats {
	tagId: string
	tagName: string
	tagType: TagType
	tradeCount: number
	totalPnl: number
	winRate: number
	avgR: number
}

export interface StrategyStats {
	strategyId: string
	strategyName: string
	tradeCount: number
	compliance: number
	totalPnl: number
}

export interface PerformanceByGroup {
	group: string
	tradeCount: number
	pnl: number
	winRate: number
	avgR: number
	profitFactor: number
}

export interface ExpectedValueData {
	// Capital Expectancy ($)
	winRate: number
	avgWin: number
	avgLoss: number
	expectedValue: number
	projectedPnl100: number
	sampleSize: number
	// Edge Expectancy (R)
	avgWinR: number
	avgLossR: number
	expectedR: number
	projectedR100: number
	rSampleSize: number
}

export interface RDistributionBucket {
	range: string
	rangeMin: number
	rangeMax: number
	count: number
	pnl: number
}

// Execution Types (for position scaling)
export type ExecutionType = "entry" | "exit"
export type OrderType = "market" | "limit" | "stop" | "stop_limit"
export type ExecutionMode = "simple" | "scaled"
export type PositionStatus = "open" | "partial" | "closed" | "over_exit"

export interface ExecutionSummary {
	totalEntryQuantity: number
	totalExitQuantity: number
	avgEntryPrice: number
	avgExitPrice: number
	remainingQuantity: number
	positionStatus: PositionStatus
	entryCount: number
	exitCount: number
	totalCommission: number
	totalFees: number
}

export interface TradeWithExecutions {
	id: string
	executionMode: ExecutionMode
	// Effective values (calculated from executions or direct from trade)
	effectiveEntryPrice: number
	effectiveExitPrice: number | null
	effectiveSize: number
	positionStatus: PositionStatus
	// Execution details (only for scaled mode)
	executions?: ExecutionData[]
	executionSummary?: ExecutionSummary
}

export interface ExecutionData {
	id: string
	tradeId: string
	executionType: ExecutionType
	executionDate: Date
	price: number
	quantity: number
	orderType?: OrderType | null
	notes?: string | null
	commission: number
	fees: number
	slippage: number
	executionValue: number
}

// Phase 11: Time-Based Analytics Types
export interface HourlyPerformance {
	hour: number
	hourLabel: string
	totalTrades: number
	wins: number
	losses: number
	breakevens: number
	winRate: number
	totalPnl: number
	avgPnl: number
	avgR: number
	profitFactor: number
}

export interface DayOfWeekPerformance {
	dayOfWeek: number
	dayName: string
	totalTrades: number
	wins: number
	losses: number
	breakevens: number
	winRate: number
	totalPnl: number
	avgPnl: number
	avgR: number
	profitFactor: number
	bestHour?: number
	worstHour?: number
}

export interface TimeHeatmapCell {
	dayOfWeek: number
	dayName: string
	hour: number
	hourLabel: string
	totalTrades: number
	wins: number
	losses: number
	totalPnl: number
	winRate: number
	avgR: number
}

export interface DaySummary {
	date: string
	netPnl: number
	grossPnl: number
	totalFees: number
	winRate: number
	wins: number
	losses: number
	breakevens: number
	totalTrades: number
	avgR: number
	profitFactor: number
}

export interface DayTrade {
	id: string
	time: string
	asset: string
	direction: TradeDirection
	entryPrice: number
	exitPrice: number | null
	pnl: number
	rMultiple: number | null
	outcome: TradeOutcome | null
}

export interface DayEquityPoint {
	time: string
	cumulativePnl: number
	tradeId?: string
}

export interface RadarChartData {
	metric: string
	metricKey: string
	value: number
	normalized: number
	benchmark?: number
}

// B3 Trading Session Types
export type TradingSession = "preOpen" | "morning" | "afternoon" | "close"

export interface SessionDefinition {
	key: TradingSession
	label: string
	startHour: number // 9 = 09:00, 9.5 = 09:30
	endHour: number // 17.92 ≈ 17:55
}

export interface SessionPerformance {
	session: TradingSession
	sessionLabel: string
	startHour: number
	endHour: number
	totalTrades: number
	wins: number
	losses: number
	breakevens: number
	winRate: number
	totalPnl: number
	avgPnl: number
	avgR: number
	profitFactor: number
}

export interface SessionAssetPerformance {
	asset: string
	sessions: {
		session: TradingSession
		sessionLabel: string
		pnl: number
		winRate: number
		trades: number
		avgR: number
	}[]
	bestSession: TradingSession | null
	totalPnl: number
}

// Journal Grouped by Day Types
export interface TradesByDay {
	date: string // YYYY-MM-DD
	dateFormatted: string // "Friday, Jan 31, 2026"
	summary: DaySummary
	trades: DayTradeCompact[]
}

export interface DayTradeCompact {
	id: string
	time: string // HH:mm
	asset: string
	direction: TradeDirection
	timeframeName: string | null
	strategyName: string | null
	pnl: number
	rMultiple: number | null
	outcome: TradeOutcome | null
}

export type JournalPeriod = "day" | "week" | "month" | "all" | "custom"

// Account Comparison Types
export interface AccountComparisonMetrics {
	accountId: string
	accountName: string
	accountType: "personal" | "prop" | "replay"
	config: {
		defaultCommission: number
		defaultFees: number
		defaultRiskPerTrade: number | null
	}
	stats: OverallStats
	expectedValue: ExpectedValueData
	equityCurve: EquityPoint[]
	maxDrawdown: number
	maxDrawdownPercent: number
	avgRiskPerTrade: number
}

export interface AccountComparisonData {
	accounts: AccountComparisonMetrics[]
}
