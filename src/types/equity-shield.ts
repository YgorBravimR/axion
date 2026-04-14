// ==========================================
// EQUITY SHIELD TYPES
// Discipline-based equity curve management
// for prop firm combine accounts
// ==========================================

// ==========================================
// TRADING MODE
// ==========================================

type TradingMode = "live" | "sim"

// ==========================================
// EQUITY SHIELD PARAMETERS
// ==========================================

interface EquityShieldParams {
	/** Multiplier applied to observed MDD to get sim-start threshold (default: 1.3) */
	mddMultiplier: number
	/** % retracement from valley required to return to live (default: 0.30) */
	recoveryPercent: number
	/** SMA period for equity curve moving average (default: 10) */
	smaPeriod: number
	/** Starting account balance in cents */
	initialBalanceCents: number
	/** Prop firm drawdown limit in cents (shown as red line) */
	drawdownLimitCents: number
}

// ==========================================
// TRADE INPUT (minimal fields from DB)
// ==========================================

interface TradeForShield {
	id: string
	entryDate: Date
	exitDate: Date | null
	pnlCents: number
	outcome: "win" | "loss" | "breakeven" | null
	asset: string
}

// ==========================================
// EQUITY SHIELD POINT (per trade)
// ==========================================

interface EquityShieldPoint {
	/** Position in original trade sequence (1-based) */
	tradeNumber: number
	/** Position in live-only sequence (1-based, only set for live trades) */
	liveTradeNumber: number | null
	/** Trade exit date as string key */
	date: string
	/** This trade's P&L in dollars */
	pnl: number
	/** Cumulative P&L in dollars (original, unfiltered) */
	originalEquity: number
	/** Account equity: initialBalance + cumulative live P&L */
	accountEquity: number
	/** Drawdown from peak as dollar amount (for the managed curve) */
	drawdownFromPeak: number
	/** Whether this trade was live or sim */
	mode: TradingMode
	/** SMA value at this point (Method 2 only) */
	smaValue: number | null
}

// ==========================================
// METHOD STATS
// ==========================================

interface MethodStats {
	liveTrades: number
	simTrades: number
	/** Max drawdown in the managed curve (dollars) */
	maxDrawdown: number
	/** Max drawdown as % of peak equity */
	maxDrawdownPercent: number
	/** Final account equity (dollars) */
	finalEquity: number
	/** Final P&L of live-only trades (dollars) */
	livePnl: number
	/** Whether the DD limit was ever breached in the managed curve */
	wouldPass: boolean
	/** Number of sim-to-live transitions */
	modeTransitions: number
}

// ==========================================
// EQUITY SHIELD RESULT
// ==========================================

interface EquityShieldResult {
	original: EquityShieldPoint[]
	method1: EquityShieldPoint[]
	method2: EquityShieldPoint[]
	method1LiveOnly: EquityShieldPoint[]
	method2LiveOnly: EquityShieldPoint[]
	stats: {
		totalTrades: number
		/** Observed max drawdown in the raw curve (dollars) */
		observedMDD: number
		/** Observed max drawdown as % of peak */
		observedMDDPercent: number
		/** Threshold used for Method 1: MDD * multiplier */
		method1Threshold: number
		/** Original final equity (dollars) */
		originalFinalEquity: number
		/** Whether original curve would pass the combine */
		originalWouldPass: boolean
		method1: MethodStats
		method2: MethodStats
	}
}

export type {
	TradingMode,
	EquityShieldParams,
	TradeForShield,
	EquityShieldPoint,
	MethodStats,
	EquityShieldResult,
}
