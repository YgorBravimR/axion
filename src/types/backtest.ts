import type { CandleRow } from "./candle"

// ═══════════════════════════════════════════════════════════════════
// Direction & Identity
// ═══════════════════════════════════════════════════════════════════

type Direction = "long" | "short"

type StrategyPresetId =
	| "orb_test_1"
	| "orb_test_2"
	| "orb_test_3"
	| "orb_test_4"
	| "hawks_v0"
	| "custom"

// ═══════════════════════════════════════════════════════════════════
// Asset Configuration
// ═══════════════════════════════════════════════════════════════════

interface AssetConfig {
	tickSize: number // minimum price increment (e.g., 5 for WINFUT)
	tickValueCents: number // cents per tick (e.g., 100 for WINFUT = R$1.00/tick)
	currency: string // "BRL"
}

// ═══════════════════════════════════════════════════════════════════
// Day Context — passed to modules on each candle
// ═══════════════════════════════════════════════════════════════════

interface DayContext {
	dayKey: string // "YYYY-MM-DD"
	candleIndexInDay: number // 0-based within the trading day
	brtHour: number
	brtMinute: number
	brtHHMM: number // e.g., 930 for 09:30
}

// ═══════════════════════════════════════════════════════════════════
// Entry Module
// ═══════════════════════════════════════════════════════════════════

interface EntrySignal {
	direction: Direction
	price: number // entry price (before slippage)
	stopReference?: number // pre-computed stop price (entry module can suggest)
	rangeHigh?: number // optional — only for range-based strategies
	rangeLow?: number // optional
	rangeWidth?: number // optional
	label: string
}

interface EntryState {
	[key: string]: unknown
}

// --- Entry module configs (union for all strategy types) ---

interface OrbEntryConfig {
	startTime: number // HHMM, e.g., 900
	endTime: number // HHMM, e.g., 905
	ticksBuffer: number // ticks added to range for breakout trigger
	ignorarGaps: boolean // use body (open/close) instead of high/low for range
}

interface MACDWMAConfig {
	macdFast: number // 12
	macdSlow: number // 26
	macdSignal: number // 15
	wmaFast: number // 9
	wmaSlow: number // 21
	candlesAfterAlignment: number // 2 (v4) or 0 (v3 = same bar)
	stopBufferPoints: number // 30 (v4) or 10 (v3)
	requireZeroCross: boolean // false (v4) or true (v3)
	startTime: number // 903
	endTime: number // 1630
}

// Hawks triple-screen: 5m brick + 15m EMA aligned + 60m EMA aligned + MACD direction.
// Stop = 1 brick back, handled via signal.stopReference = candle.open (Renko geometry).
// Indicator keys must match candle-header-mappings.ts and the candle JSONB.
interface HawksTripleScreenConfig {
	ema27_60m_key: string // default: "mme27_60m"
	ema55_60m_key: string // default: "mme55_60m"
	ema27_15m_key: string // default: "mme27_15m"
	macd_key: string // default: "macd"
	startTime: number // 930
	endTime: number // 1730
}

type EntryModuleConfig =
	| { type: "orb_breakout"; config: OrbEntryConfig }
	| { type: "macd_wma_alignment"; config: MACDWMAConfig }
	| { type: "hawks_triple_screen"; config: HawksTripleScreenConfig }

interface EntryModule {
	init: (_config: OrbEntryConfig) => EntryState
	onCandle: (
		_candle: CandleRow,
		_state: EntryState,
		_ctx: DayContext,
		_tickSize: number
	) => {
		state: EntryState
		signal: EntrySignal | null
	}
	onDayEnd: (_state: EntryState) => EntryState
}

// ═══════════════════════════════════════════════════════════════════
// Stop Module — state machine: initial → breakeven → trailing
// ═══════════════════════════════════════════════════════════════════

type StopPhase = "initial" | "breakeven" | "trailing"

// --- Initial stop types ---

interface PctRangeStopConfig {
	type: "pct_range"
	pct: number // % of range (e.g., 30 = stop at 30% of range from entry)
}

interface FixedPointsStopConfig {
	type: "fixed_points"
	points: number // fixed points from entry
}

interface FullRangeStopConfig {
	type: "full_range"
	ticksBuffer: number // ticks beyond opposite range end
}

type InitialStopConfig =
	| PctRangeStopConfig
	| FixedPointsStopConfig
	| FullRangeStopConfig

// --- Breakeven types ---

interface OnPartialBreakevenConfig {
	type: "on_partial"
}

interface OnPctRiskBreakevenConfig {
	type: "on_pct_risk"
	triggerPct: number // % of risk distance in favorable direction
}

type BreakevenConfig = OnPartialBreakevenConfig | OnPctRiskBreakevenConfig

// --- Trailing types ---

interface PriceDistanceTrailingConfig {
	type: "price_distance"
	distance: number // points behind best price
	activationPct?: number // optional: start trailing after X% of risk recovered
}

interface IndicatorTrailingConfig {
	type: "indicator"
	wmaPeriod: number // WMA period for trailing (e.g., 9)
	offset: number // lookback offset (e.g., 1 = previous bar's WMA)
}

type TrailingConfig = PriceDistanceTrailingConfig | IndicatorTrailingConfig

// --- Combined stop config ---

interface StopConfig {
	initial: InitialStopConfig
	breakeven?: BreakevenConfig
	trailing?: TrailingConfig
}

interface StopState {
	phase: StopPhase
	currentStopPrice: number
	entryPrice: number
	direction: Direction
	initialStopDistance: number // absolute distance from entry to initial stop
	bestPrice: number // best favorable price seen (for trailing)
	breakevenTriggered: boolean
	partialExitOccurred: boolean // set by engine when partial TP fills
}

interface StopResult {
	state: StopState
	currentStopPrice: number
	isHit: boolean
	hitPrice: number | null
}

interface StopModule {
	init: (
		_entryPrice: number,
		_direction: Direction,
		_signal: EntrySignal,
		_config: StopConfig,
		_tickSize: number
	) => StopState
	onCandle: (
		_candle: CandleRow,
		_state: StopState,
		_config: StopConfig
	) => StopResult
	notifyPartialExit: (_state: StopState, _config: StopConfig) => StopState
}

// ═══════════════════════════════════════════════════════════════════
// Target Module
// ═══════════════════════════════════════════════════════════════════

/**
 * Target pricing mode — strategy-agnostic.
 *
 * - r_multiple: target at N × risk distance (e.g., 2R = 2× the stop distance)
 * - pct_range: target at N% of the entry range width (ORB-specific but universal)
 * - pct_stop: target at N% of the stop distance
 * - fixed_points: target at fixed N points from entry
 */
type TargetMode = "r_multiple" | "pct_range" | "pct_stop" | "fixed_points"

interface TargetLevel {
	value: number // interpreted based on mode (e.g., 2 for 2R, 100 for 100% range)
	mode: TargetMode
	exitPct: number // % of total position to exit at this level (1-100)
	label: string // "target1", "target2", etc.
}

interface FixedLevelsTargetConfig {
	type: "fixed_levels"
	levels: TargetLevel[]
	eodTime: number // HHMM for end-of-day forced exit (e.g., 1730)
}

type TargetConfig = FixedLevelsTargetConfig

interface TargetState {
	levelsHit: boolean[] // track which levels have been reached
	targetPrices: number[] // computed absolute prices
}

interface TargetExit {
	price: number
	fraction: number
	reason: string
}

interface TargetResult {
	state: TargetState
	exits: TargetExit[]
}

interface TargetModule {
	init: (
		_entryPrice: number,
		_direction: Direction,
		_signal: EntrySignal,
		_config: TargetConfig,
		_stopDistance?: number
	) => TargetState
	onCandle: (
		_candle: CandleRow,
		_state: TargetState,
		_config: TargetConfig,
		_direction: Direction,
		_ctx: DayContext
	) => TargetResult
}

// ═══════════════════════════════════════════════════════════════════
// Sizing Module
// ═══════════════════════════════════════════════════════════════════

/**
 * Risk distribution when reversal is active:
 * - "per_trade": riskAmountCents is risked on each trade independently
 * - "per_day": riskAmountCents is the total daily budget, split across entry + reversals
 *   e.g., R$2000 with 4 max reversals → R$400 per trade (5 total trades: 1 entry + 4 reversals)
 */
type RiskDistribution = "per_trade" | "per_day"

interface MonetaryRiskSizingConfig {
	type: "monetary_risk"
	riskAmountCents: number // max risk in cents (e.g., 8000 = R$80)
	valuePerPointCents: number // cents per point per contract (e.g., 20 = R$0.20)
	riskDistribution: RiskDistribution
}

interface FixedLotsSizingConfig {
	type: "fixed_lots"
	lots: number
}

// Future: pct_capital (see docs/BACKTEST_ROADMAP.md v3)
// interface PctCapitalSizingConfig {
//   type: "pct_capital"
//   pctRisk: number
//   valuePerPointCents: number
//   initialCapitalCents: number
// }

type SizingConfig = MonetaryRiskSizingConfig | FixedLotsSizingConfig

interface SizingModule {
	calculate: (_stopDistance: number, _config: SizingConfig) => number
}

// ═══════════════════════════════════════════════════════════════════
// Reversal Module
// ═══════════════════════════════════════════════════════════════════

interface NoReversalConfig {
	type: "none"
}

interface ReverseOnStopConfig {
	type: "reverse_on_stop"
	maxReversals: number // max reversals per day (typically 1)
	virarNoBE: boolean // allow reversal when stopped at breakeven? false = block
}

type ReversalConfig = NoReversalConfig | ReverseOnStopConfig

interface ReversalState {
	reversalsToday: number
	lastExitWasBreakeven: boolean
}

interface ReversalResult {
	shouldReverse: boolean
	state: ReversalState
}

interface ReversalModule {
	init: () => ReversalState
	check: (
		_exitReason: string,
		_state: ReversalState,
		_config: ReversalConfig
	) => ReversalResult
}

// ═══════════════════════════════════════════════════════════════════
// Strategy Recipe — wires all modules together
// ═══════════════════════════════════════════════════════════════════

interface StrategyRecipe {
	presetId: StrategyPresetId
	displayName: string
	entry: EntryModuleConfig
	stop: StopConfig
	target: TargetConfig
	sizing: SizingConfig
	reversal: ReversalConfig
	slippageTicks: number
	/** Indicator keys the strategy needs from candle JSONB (e.g., ["vwap_d", "ema_200"]).
	 *  Empty = skip indicator fetch entirely (fastest).
	 *  The query only transfers these keys, not the full JSONB. */
	requiredIndicators: string[]
}

// ═══════════════════════════════════════════════════════════════════
// Backtest Configuration (sent from UI → server action)
// ═══════════════════════════════════════════════════════════════════

interface BacktestInput {
	assetId: string
	timeframeId: string
	dateRange: { from: string; to: string } // ISO date strings
	recipe: StrategyRecipe
}

// ═══════════════════════════════════════════════════════════════════
// Position — managed by the engine during execution
// ═══════════════════════════════════════════════════════════════════

interface Position {
	direction: Direction
	entryPrice: number // after slippage
	contracts: number
	contractsRemaining: number // decreases on partial exits
	stopState: StopState
	targetState: TargetState
	riskCents: number // initial risk for R-multiple calculation
	entryTimestamp: string // ISO timestamp of entry candle
	entryDayKey: string
	label: string
}

// ═══════════════════════════════════════════════════════════════════
// Results
// ═══════════════════════════════════════════════════════════════════

interface BacktestTrade {
	id: number
	dayKey: string
	direction: Direction
	entryPrice: number
	entryTime: string
	exitPrice: number
	exitTime: string
	exitReason:
		| "target1"
		| "target2"
		| "stop"
		| "breakeven_stop"
		| "eod"
		| "reverse_stop"
	contracts: number
	grossPnlCents: number
	slippageCostCents: number
	netPnlCents: number
	rMultiple: number
	label: string
}

interface EquityCurvePoint {
	tradeIndex: number
	cumulativePnlCents: number
	drawdownCents: number
	dayKey: string
}

interface BacktestSummary {
	totalTrades: number
	wins: number
	losses: number
	breakevens: number
	winRate: number // 0-100
	profitFactor: number
	totalPnlCents: number
	avgPnlCents: number
	avgWinCents: number
	avgLossCents: number
	avgRMultiple: number
	maxDrawdownCents: number
	maxConsecutiveLosses: number
	maxConsecutiveWins: number
	sharpeRatio: number
	expectancy: number // avg R-multiple (same as avgRMultiple, kept for clarity)
	totalDays: number
	tradingDays: number // days with at least one trade
}

interface DayBreakdown {
	dayKey: string
	trades: number
	pnlCents: number
	rangeHigh: number | null
	rangeLow: number | null
}

interface BacktestResult {
	trades: BacktestTrade[]
	equityCurve: EquityCurvePoint[]
	summary: BacktestSummary
	dayBreakdown: DayBreakdown[]
}

// ═══════════════════════════════════════════════════════════════════
// Optimization — compare multiple runs
// ═══════════════════════════════════════════════════════════════════

interface OptimizationRun {
	id: string
	label: string
	recipe: StrategyRecipe
	summary: BacktestSummary
	equityCurve: EquityCurvePoint[]
	trades: BacktestTrade[]
	dayBreakdown: DayBreakdown[]
	pinned: boolean
	createdAt: string
}

// ═══════════════════════════════════════════════════════════════════
// Exports
// ═══════════════════════════════════════════════════════════════════

export type {
	// Core
	Direction,
	StrategyPresetId,
	AssetConfig,
	DayContext,
	// Entry
	EntrySignal,
	EntryState,
	EntryModuleConfig,
	OrbEntryConfig,
	MACDWMAConfig,
	HawksTripleScreenConfig,
	EntryModule,
	// Stop
	StopPhase,
	InitialStopConfig,
	PctRangeStopConfig,
	FixedPointsStopConfig,
	FullRangeStopConfig,
	BreakevenConfig,
	OnPartialBreakevenConfig,
	OnPctRiskBreakevenConfig,
	TrailingConfig,
	PriceDistanceTrailingConfig,
	IndicatorTrailingConfig,
	StopConfig,
	StopState,
	StopResult,
	StopModule,
	// Target
	TargetMode,
	TargetLevel,
	FixedLevelsTargetConfig,
	TargetConfig,
	TargetState,
	TargetExit,
	TargetResult,
	TargetModule,
	// Sizing
	RiskDistribution,
	MonetaryRiskSizingConfig,
	FixedLotsSizingConfig,
	SizingConfig,
	SizingModule,
	// Reversal
	NoReversalConfig,
	ReverseOnStopConfig,
	ReversalConfig,
	ReversalState,
	ReversalResult,
	ReversalModule,
	// Recipe
	StrategyRecipe,
	BacktestInput,
	// Position
	Position,
	// Results
	BacktestTrade,
	EquityCurvePoint,
	BacktestSummary,
	DayBreakdown,
	BacktestResult,
	// Optimization
	OptimizationRun,
}
