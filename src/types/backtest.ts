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
	| "hawks_user_catalog"
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
	breakevenReference?: number // absolute price at which BE should activate (overrides triggerPct)
	rangeHigh?: number // optional — only for range-based strategies
	rangeLow?: number // optional
	rangeWidth?: number // optional
	label: string
	// Optional quality score attached at fire time. The engine threads this
	// through unchanged into the trade row; pure metadata, no behavior.
	quality?: TradeQuality
}

// Quality tiering — signed-score model.
// Each registered indicator contributes one IndicatorContribution at fire
// time: "favor" ⇒ +weight, "penalty" ⇒ -weight, "neutral" ⇒ 0. Score is the
// sum. Tier is the bucketed score per QualityGatesConfig.tierThresholds
// (defaults: AAA ≥ 3, AA = 2, A = 1, B otherwise).
//
// Weights are 1.0 across all indicators today. The shape supports per-
// indicator weighting later — once enough data exists to set them honestly.
type QualityTier = "AAA" | "AA" | "A" | "B"
type IndicatorSignal = "favor" | "penalty" | "neutral"

interface IndicatorContribution {
	key: string
	signal: IndicatorSignal
	weight: number
	contribution: number // weight when favor, -weight when penalty, 0 otherwise
}

interface TradeQuality {
	tier: QualityTier
	score: number
	contributions: IndicatorContribution[]
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
// Stop = 2 bricks back (Hawks 1R = 2 Renko boxes), via signal.stopReference = 2·open − close.
// Indicator keys must match candle-header-mappings.ts and the candle JSONB.
interface HawksTripleScreenConfig {
	ema27_60m_key: string // default: "mme27_60m"
	ema55_60m_key: string // default: "mme55_60m"
	ema27_15m_key: string // default: "mme27_15m"
	ema55_15m_key: string // default: "mme55_15m"
	macd_key: string // default: "macd"
	// ProfitChart "TOPOS E FUNDOS" pivot column. Sparse — a value (the pivot
	// price) appears only on bars that are confirmed pivots; the rest are
	// empty. Alternation TOPO↔FUNDO is implicit; the engine classifies by
	// comparing each pivot value to the previous one.
	topos_fundos_key: string // default: "topos_fundos"
	// Previous-closed-candle OHLC projected from 15m / 60m at ingest time.
	// Used by the higher-TF gate: the brick BEFORE the current one must have
	// opened AND closed below both EMAs (for SHORT) / above both (for LONG).
	prev_15m_open_key: string // default: "prev_15m_open"
	prev_15m_close_key: string // default: "prev_15m_close"
	prev_60m_open_key: string // default: "prev_60m_open"
	prev_60m_close_key: string // default: "prev_60m_close"
	// Renko box size in points for the 5m chart. Used as the unit for the
	// "wave-1 ≥ 4 boxes" and "retracement ≥ 2 boxes" structural checks.
	// Currently a constant per recipe; future revision can swap to a
	// per-week lookup via hawks_renko_sizes.
	brickSize5mPoints: number // default: 100 (= 20 ticks × 5 points/tick on WIN)
	startTime: number // 930
	endTime: number // 1730
	// State-machine overrides (optional — engine falls back to hardcoded
	// defaults when undefined). Exposed for OPTIMIZE Tier-3 sweeps.
	fireCooldownBricks?: number // default 5 (post-fire 5m brick cooldown)
	wave1MinBricks?: number // default 4 (wave-1 minimum bricks)
	retracementMinBricks?: number // default 2 (wave-2 retracement minimum bricks)
	// Optional user-toggleable quality gates. Each flag is independent and
	// additive: when true, the engine refuses an otherwise-valid fire if the
	// gate's condition holds. Default off ⇒ baseline engine behavior preserved.
	// Sign convention for any level L vs entry price P:
	//   signedDelta = direction === "short" ? (L - P) : (P - L)
	//     positive ⇒ level is BEHIND the trade (favorable side, cushion)
	//     negative ⇒ level is AHEAD of the trade (adverse side, blocks move)
	qualityGates?: QualityGatesConfig
}

interface QualityGatesConfig {
	// ── Group A: S/R levels (4 HTF MAs + vwap_d + ajuste) ─────────────────
	// BLOCK entry if any S/R level is AHEAD of trade within srBlockBufferBricks.
	srLevelBlock?: boolean
	// SCORE +weight per S/R level BEHIND trade within srFavorRangeBricks.
	srLevelFavor?: boolean
	// ── Group B: Keltner (planned, not yet wired) ─────────────────────────
	keltnerOuterBlock?: boolean // hard reject when 165 band acts as floor/ceiling
	keltnerInnerPenalty?: boolean // -weight when price past 125 band on trade side
	// ── Group C: MACD (planned) ───────────────────────────────────────────
	macdAlignmentScore?: boolean // ±weight by sign + slope streak
	// ── Group D: aggression ───────────────────────────────────────────────
	// Tri-state polarity switch. "off" = rule disabled (default, baseline
	// behavior). "original" = aggression aligned with trade direction is
	// FAVOR (your intuitive heuristic). "reversed" = aligned is PENALTY
	// ("late to the move"); probe data on 20 days supports this polarity
	// at threshold 15K with 1.67× selectivity. Recommended setting when
	// enabling the rule is "reversed".
	aggressionMode?: "off" | "original" | "reversed"
	// ── Group E: volume (planned) ─────────────────────────────────────────
	volumeScore?: boolean // +weight if brick volume > running EMA
	// ── Tunable parameters (defaults preserve current behavior) ───────────
	srBlockBufferBricks?: number // default 2
	srFavorRangeBricks?: number // default 3
	keltnerNearBricks?: number // default 2 — distance (in bricks) considered "near" the band
	aggressionThreshold?: number // default 15000
	volumeEmaPeriod?: number // default 500
	macdSlopeWindow?: number // default 3
	// ── Tier thresholds (config so we can re-tier as score range grows) ───
	tierThresholds?: TierThresholds
	// ── Legacy alias for backwards-compat. Equivalent to srLevelBlock on
	// just the 4 HTF MAs (no vwap_d / ajuste). Prefer srLevelBlock. ───────
	htfMaBlock?: boolean
}

interface TierThresholds {
	AAA: number // default 3 — score >= AAA
	AA: number // default 2 — score >= AA && < AAA
	A: number // default 1 — score >= A && < AA
	// B is anything below A (including negative)
}

// User-served entry catalog: the user manually specifies which brick on which
// day fires an entry. No structural gates — outcome simulation uses the same
// stop/target recipe as any other strategy. Brick index is 1-indexed, matching
// ProfitChart's per-day "CANDLE" counter (= DB candle_index).
interface UserEntry {
	date: string // BRT day "YYYY-MM-DD"
	brickIndex: number // 1-indexed (ProfitChart box number = DB candle_index)
	direction: Direction
	label?: string // "T1", "T2", etc.
	notes?: string
}

interface UserCatalogConfig {
	catalog: UserEntry[]
	startTime?: number // HHMM — optional: skip bricks before this time
	endTime?: number // HHMM — optional: skip bricks after this time
}

type EntryModuleConfig =
	| { type: "orb_breakout"; config: OrbEntryConfig }
	| { type: "macd_wma_alignment"; config: MACDWMAConfig }
	| { type: "hawks_triple_screen"; config: HawksTripleScreenConfig }
	| { type: "user_catalog"; config: UserCatalogConfig }

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

// "intrabar" (default): stop fires when candle.low/high crosses the level
// "brick_close": stop fires only when a Renko brick CLOSES against the trade
// (used by Renko strategies where wicks don't close bricks)
type StopTriggerMode = "intrabar" | "brick_close"

interface StopConfig {
	initial: InitialStopConfig
	breakeven?: BreakevenConfig
	trailing?: TrailingConfig
	triggerMode?: StopTriggerMode
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
	breakevenReference?: number // absolute price at which BE should activate (signal-supplied override)
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
		_ctx: DayContext,
		_triggerMode?: StopTriggerMode
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
	quality?: TradeQuality
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
	quality?: TradeQuality
	entryBrickIndex?: number // 1-indexed candle index matching the entry time
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
	// Methodology-engine version stamp. Set when a strategy's engine math has revisions
	// users should be aware of (e.g. Hawks v0.2 corrected the 2-brick stop). Surface in
	// the UI so cached exports/screenshots are traceable to the engine that produced them.
	engineVersion?: string
}

// ═══════════════════════════════════════════════════════════════════
// Optimization — compare multiple runs
// ═══════════════════════════════════════════════════════════════════

type FunnelStage = "broad" | "refine" | "freeze"

/**
 * A frozen offspring of the hero-hunt funnel — a recipe captured at freeze
 * time, persisted to localStorage, and surfaced in the strategy dropdown as a
 * shadow of its source preset (e.g. `hawks_v0_tuned_2026-05-30` shadows
 * `hawks_v0`). The `metrics` snapshot is what the freeze modal saw at freeze
 * time — it does NOT auto-recompute. `engineVersion` lets us flag stale presets
 * when the engine math changes between freeze and now.
 */
interface HeroWinPreset {
	presetId: string
	sourcePresetId: string
	recipe: StrategyRecipe
	frozenAt: string
	journeyId: string
	engineVersion: string
	metrics: {
		profitFactor: number
		profitFactorOOS?: number
		matchRate?: number
		trades: number
		oosRobust: boolean
		maxDrawdownCents: number
		winRate: number
	}
	notes?: string
}

interface OptimizationRunProvenance {
	sweepId: string
	datasetHash: string
	candleCount: number
	dateRangeHash: string
	dateFrom: string
	dateTo: string
	engineVersion: string
	recipeHash: string
	schemaVersion: number
	stage?: FunnelStage
	parentRunIds?: string[]
	journeyId?: string
}

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
	// Phase 1b — provenance. Optional for back-compat with legacy localStorage entries.
	provenance?: OptimizationRunProvenance
	// Phase 1a — walk-forward / OOS split. Optional until Phase 1a ships and the user
	// enables the split in the sweep config. When present, summary still reflects
	// the in-sample result (the optimization target); summaryOOS is the held-out report.
	summaryIS?: BacktestSummary
	summaryOOS?: BacktestSummary
	equityCurveIS?: EquityCurvePoint[]
	equityCurveOOS?: EquityCurvePoint[]
	oosRobust?: boolean
	// Phase 3B — match rate. Fraction of trades matching catalog by (date, brickIndex).
	matchRate?: number // 0..1
	matchRateIS?: number // in-sample match rate (walk-forward mode)
	matchRateOOS?: number // out-of-sample match rate (walk-forward mode)
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
	QualityGatesConfig,
	QualityTier,
	IndicatorSignal,
	IndicatorContribution,
	TierThresholds,
	TradeQuality,
	UserEntry,
	UserCatalogConfig,
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
	StopTriggerMode,
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
	OptimizationRunProvenance,
	FunnelStage,
	HeroWinPreset,
}
