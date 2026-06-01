import type { StrategyRecipe } from "@/types/backtest"

/**
 * Hawks triple-screen v0.3 preset.
 *
 * Entry (the structural BASE — all required):
 *   1. ProfitChart TOPOS E FUNDOS pivot sequence: TOPO MAIOR → FUNDO → TOPO MENOR < TOPO MAIOR
 *      (descending tops for SHORT; mirrored for LONG).
 *   2. Wave 1 (TOPO MAIOR → FUNDO): net drop ≥ 4 boxes AND no 2 consecutive
 *      bullish bricks within the wave (for SHORT).
 *   3. Wave 2 (FUNDO → TOPO MENOR): net bounce ≥ 2 boxes.
 *   4. Wave 3 trigger: first bearish 5m brick (close < open) after TOPO MENOR.
 *   5. Higher-TF gate (BOTH must hold): the most recently CLOSED 15m candle
 *      AND the most recently CLOSED 60m candle each have open AND close both
 *      below MME27 AND MME55 of their own timeframe (for SHORT) / above both
 *      (for LONG).
 *
 * ─── Indicator classification ────────────────────────────────────────────────
 * GATES (all required — missing key ⇒ brick skipped):
 *   mme27_60m, mme55_60m, mme27_15m, mme55_15m  — cross-TF EMAs (pre-joined
 *     from 5m CSV cols 5-8 AND verified against 15m/60m CSVs in Step 6).
 *   topos_fundos    — ProfitChart TOPOS E FUNDOS pivot value (5m CSV col 16).
 *   prev_15m_open, prev_15m_close  — OHLC of most-recently closed 15m brick.
 *   prev_60m_open, prev_60m_close  — OHLC of most-recently closed 60m brick.
 *   Gate rule: STRICT — prev brick open AND close BOTH strictly below MME27
 *     AND MME55 (for SHORT). No 1-box-buffer applied. Decision Step 6.
 *
 * QUALITY (present but do NOT gate entry — reserved for AAA/AA/A tier tagging):
 *   macd       — 5m MACD histogram (5m CSV col 17).
 *   vwap_d_5m  — VWAP daily    (5m CSV col 9).
 *   vwap_m_5m  — VWAP monthly  (5m CSV col 10).
 *   vwap_s_5m  — VWAP weekly   (5m CSV col 11).
 *   ajuste_d1  — Prior day settlement price (5m CSV col 13, sparse).
 *
 * NOT YET LOADED (in CSV but unmapped — future quality multipliers):
 *   mme17_5m (col 14), mme74_5m (col 15) — native 5m EMAs periods 17/74.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * Stop: 1 brick against entry (Hawks 1R = 2 Renko bricks via signal.stopReference = 2·open − close).
 * Break-even: when price reaches 1R favorable (100% of risk distance), stop trails to entry.
 * Target: 3R single exit (= 6 Renko bricks in favor).
 */
const hawksV0: StrategyRecipe = {
	presetId: "hawks_v0",
	displayName: "Hawks v0 — Triple Screen",
	entry: {
		type: "hawks_triple_screen",
		config: {
			ema27_60m_key: "mme27_60m",
			ema55_60m_key: "mme55_60m",
			ema27_15m_key: "mme27_15m",
			ema55_15m_key: "mme55_15m",
			macd_key: "macd",
			topos_fundos_key: "topos_fundos",
			prev_15m_open_key: "prev_15m_open",
			prev_15m_close_key: "prev_15m_close",
			prev_60m_open_key: "prev_60m_open",
			prev_60m_close_key: "prev_60m_close",
			// WIN micro-mini Bovespa: 1 tick = 5 points, brick = 20 ticks = 100 points
			brickSize5mPoints: 100,
			// Process from market open so the morning's first pivots (FUNDO
			// painted around 09:04, TOPO around 09:10) update state. The
			// "first wave" structural anchors are established here; gating
			// at 09:30 would silently skip them and inherit stale pivots
			// from the previous session.
			startTime: 900,
			endTime: 1730,
			// Quality gates default OFF — the audit toggles them on per run.
			// Enable per audit via `hawksV0WithHtfMaBlock` (see below) or via
			// runtime override before calling runBacktest.
			qualityGates: {
				htfMaBlock: false,
			},
		},
	},
	stop: {
		// points=0 activates signal.stopReference escape hatch — stop = 2·open − close = 2 bricks back
		initial: { type: "fixed_points", points: 0 },
		// Pedro's rule: when price moves 1R in favor (100% of risk distance), shift stop to BE
		breakeven: { type: "on_pct_risk", triggerPct: 100 },
	},
	target: {
		type: "fixed_levels",
		levels: [{ value: 3, mode: "r_multiple", exitPct: 100, label: "target1" }],
		eodTime: 1730,
	},
	sizing: { type: "fixed_lots", lots: 1 },
	reversal: { type: "none" },
	slippageTicks: 0,
	requiredIndicators: [
		"mme27_60m",
		"mme55_60m",
		"mme27_15m",
		"mme55_15m",
		"topos_fundos",
		"prev_15m_open",
		"prev_15m_close",
		"prev_60m_open",
		"prev_60m_close",
	],
}

// User-served entries preset — same stop/target/sizing as hawks_v0 but entry
// comes from an explicit catalog (UserEntry[]) instead of the structural engine.
// The catalog is populated at call-site (script or server action) by loading
// JSON files from data/hawks/user-entries/. Default catalog is empty.
const hawksUserCatalog: StrategyRecipe = {
	presetId: "hawks_user_catalog",
	displayName: "Hawks — User Catalog",
	entry: {
		type: "user_catalog",
		config: {
			catalog: [], // populated at call-site from data/hawks/user-entries/*.json
			startTime: 900,
			endTime: 1700,
		},
	},
	stop: {
		initial: { type: "fixed_points", points: 0 }, // stopReference from entry signal
		breakeven: { type: "on_pct_risk", triggerPct: 100 }, // overridden by signal.breakevenReference
		triggerMode: "brick_close", // Renko: only against-brick CLOSES trigger stops/BE
	},
	target: {
		type: "fixed_levels",
		// Hawks user-catalog: positions stay open through the day; the engine's
		// last-candle-of-day force-close handles unfilled positions. eodTime=1800
		// is a sentinel above the cash-market close so the time-based check in
		// fixed-levels.ts never preempts a brick exit.
		levels: [{ value: 3, mode: "r_multiple", exitPct: 100, label: "target1" }],
		eodTime: 1800,
	},
	sizing: { type: "fixed_lots", lots: 1 },
	reversal: { type: "none" },
	slippageTicks: 0,
	requiredIndicators: [],
}

const hawksPresets: readonly [StrategyRecipe, ...StrategyRecipe[]] = [
	hawksV0,
	hawksUserCatalog,
]

export { hawksPresets, hawksV0, hawksUserCatalog }
