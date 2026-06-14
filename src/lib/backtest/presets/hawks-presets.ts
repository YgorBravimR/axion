import type {
	StrategyRecipe,
	QualityGatesConfig,
	HawksTripleScreenConfig,
} from "@/types/backtest"
import type { SweepableParam } from "@/lib/optimize/sweepable-params"
import { getQualityPresetBundle } from "@/lib/backtest/presets/hawks-quality-presets"

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
 *   macd1_histo — 5m MACD histogram (per methodology, MACD config #1 = 5m).
 *   vwap_d      — VWAP daily.
 *   vwap_m      — VWAP monthly.
 *   vwap_w      — VWAP weekly (Portuguese "semanal" — historic key was vwap_s).
 *   ajuste      — Prior day settlement (injected via asset_session_anchors, not parquet).
 *
 * NAMING NOTE: parquet column names are vendor-native (ProfitChart CSV headers).
 * Engine reads keys verbatim from `candle.indicators`. There is NO alias layer —
 * mismatches between engine-expected keys and parquet column names produce silent
 * NULL reads ("rule emits neutral on every brick"). Always reconcile against
 * `data/parquet/candles/hawk_5m_win/WIN.parquet` schema when adding a rule.
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
		type: "hawks_playbook",
		config: {
			// HTF gate keys.
			ema27_60m_key: "mme27_60m",
			ema55_60m_key: "mme55_60m",
			ema27_15m_key: "mme27_15m",
			ema55_15m_key: "mme55_15m",
			prev_15m_open_key: "prev_15m_open",
			prev_15m_close_key: "prev_15m_close",
			prev_60m_open_key: "prev_60m_open",
			prev_60m_close_key: "prev_60m_close",
			// Quality-indicator keys — every literal goes through config so
			// vendor column renames are a one-line preset change, not a
			// rule-code change. See `docs/gotchas.md` → "Hawks: candle-store
			// has NO indicator-key alias layer".
			// MACD: 5m uses config #1 (`macd1_histo`); macd2_* reserved for
			// future higher-TF MACD use (per methodology: macd1=5m, macd2=HTF).
			macd_key: "macd1_histo",
			vwap_d_key: "vwap_d",
			vwap_m_key: "vwap_m",
			vwap_w_key: "vwap_w",
			ajuste_key: "ajuste",
			keltner_inner_inf_key: "kc1_inf",
			keltner_inner_sup_key: "kc1_sup",
			keltner_outer_inf_key: "kc2_inf",
			keltner_outer_sup_key: "kc2_sup",
			aggression_key: "agr_saldo",
			volume_key: "volume_fin",
			// WIN micro-mini Bovespa: 1 tick = 5 points, brick = 20 ticks = 100 points
			brickSize5mPoints: 100,
			// Process from market open so the morning's first pivots are detected
			// via structural analysis. The engine uses 2-brick confirmation on 5m.
			startTime: 900,
			endTime: 1730,
			// Fire cooldown: minimum bricks between re-fires (hardware default 5).
			// Set to 5 to match engine's hardcoded FIRE_COOLDOWN_BRICKS.
			fireCooldownBricks: 5,
			// Wave-1 minimum bricks: structural impulse leg must have at least this
			// many bricks. Engine default is 4; we use the same.
			wave1MinBricks: 4,
			// Retracement minimum bricks: wave-2 bounce must be at least this long.
			// Engine default is 2; we use the same.
			retracementMinBricks: 2,
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
		// Spec §2 (exit-management-spec.md): BE fires when NET favorable price
		// distance reaches 1R (= 2 brick bodies) AND the current brick closes
		// favorable. triggerMode: "brick_close" enforces the second condition —
		// intra-brick wicks do NOT count, only confirmed closes.
		breakeven: { type: "on_pct_risk", triggerPct: 100 },
		triggerMode: "brick_close",
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
		// Group A — HTF gate (4 EMAs + 4 prev OHLC).
		"mme27_60m",
		"mme55_60m",
		"mme27_15m",
		"mme55_15m",
		"prev_15m_open",
		"prev_15m_close",
		"prev_60m_open",
		"prev_60m_close",
		// Group C — S/R levels. `ajuste` is sourced from asset_session_anchors
		// at fetch time; `vwap_d`/`vwap_m`/`vwap_w` from per-brick parquet.
		"vwap_d",
		"vwap_m",
		"vwap_w",
		"ajuste",
		// Group B — MACD config #1 (5m methodology).
		"macd1_histo",
		// Group E — Keltner bands. Inner (kc1) = 1.25× ATR; outer (kc2) = 1.65×.
		"kc1_inf",
		"kc1_sup",
		"kc2_inf",
		"kc2_sup",
		// Group F — order flow + volume.
		"agr_saldo",
		"volume_fin",
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

// ── Hawks sweepable params (OPTIMIZE Tier 1 + 2 + 3A) ─────────────────
// Tier 1: high-leverage outcome knobs (BE, R, slippage).
// Tier 2A: quality bundle (off/lite/standard/strict) — fastest signal.
// Tier 2B: within-bundle numeric drilldown.
// Tier 2C: individual boolean toggles — research mode (user opts in).
// Tier 3A: engine state-machine knobs (cooldown, wave1, retracement).
// Tier 3B (match_rate metric): added on the worker side, not as a sweep axis.
// Tier 3C (deferred): per-day regime, Fib bands, stayArmed flag.

const isHawksTriple = (r: StrategyRecipe): boolean =>
	r.entry.type === "hawks_playbook"

const mutateHawksConfig = (
	recipe: StrategyRecipe,
	mutator: (_cfg: HawksTripleScreenConfig) => HawksTripleScreenConfig
): StrategyRecipe => {
	if (recipe.entry.type !== "hawks_playbook") {
		return recipe
	}
	return {
		...recipe,
		entry: {
			type: "hawks_playbook",
			config: mutator(recipe.entry.config),
		},
	}
}

const mutateQualityGates = (
	recipe: StrategyRecipe,
	mutator: (_qg: QualityGatesConfig) => QualityGatesConfig
): StrategyRecipe =>
	mutateHawksConfig(recipe, (cfg) => ({
		...cfg,
		qualityGates: mutator(cfg.qualityGates ?? {}),
	}))

const HAWKS_SWEEPABLE_PARAMS: SweepableParam[] = [
	// ── Tier 1 — outcome knobs ─────────────────────────────────────
	{
		kind: "numeric",
		path: "stop.breakeven.triggerPct",
		labelKey: "hawksBreakevenTrigger",
		defaultMin: 50,
		defaultMax: 200,
		defaultStep: 25,
		condition: (r) => r.stop.breakeven?.type === "on_pct_risk",
	},
	{
		kind: "numeric",
		path: "target.levels.0.value",
		labelKey: "hawksTargetR",
		defaultMin: 2,
		defaultMax: 4,
		defaultStep: 0.5,
		condition: (r) =>
			r.target.type === "fixed_levels" &&
			r.target.levels[0]?.mode === "r_multiple",
	},
	{
		kind: "numeric",
		path: "slippageTicks",
		labelKey: "slippage",
		defaultMin: 0,
		defaultMax: 3,
		defaultStep: 1,
	},

	// ── Tier 2A — quality bundle (4-way enum, fastest signal) ──────
	{
		kind: "enum",
		path: "entry.config.qualityGates.__bundle__",
		labelKey: "hawksQualityBundle",
		condition: isHawksTriple,
		options: [
			{
				value: "off",
				labelKey: "hawksQualityBundle_off",
				applyOption: (r) =>
					mutateHawksConfig(r, (cfg) => ({
						...cfg,
						qualityGates: getQualityPresetBundle("off"),
					})),
			},
			{
				value: "lite",
				labelKey: "hawksQualityBundle_lite",
				applyOption: (r) =>
					mutateHawksConfig(r, (cfg) => ({
						...cfg,
						qualityGates: getQualityPresetBundle("lite"),
					})),
			},
			{
				value: "standard",
				labelKey: "hawksQualityBundle_standard",
				applyOption: (r) =>
					mutateHawksConfig(r, (cfg) => ({
						...cfg,
						qualityGates: getQualityPresetBundle("standard"),
					})),
			},
			{
				value: "strict",
				labelKey: "hawksQualityBundle_strict",
				applyOption: (r) =>
					mutateHawksConfig(r, (cfg) => ({
						...cfg,
						qualityGates: getQualityPresetBundle("strict"),
					})),
			},
		],
		getCurrentValue: () => "standard",
	},

	// ── Tier 2B — within-bundle numeric drilldown ──────────────────
	{
		kind: "numeric",
		path: "entry.config.qualityGates.srBlockBufferBricks",
		labelKey: "hawksSrBlockBuffer",
		defaultMin: 1,
		defaultMax: 4,
		defaultStep: 1,
		condition: isHawksTriple,
	},
	{
		kind: "numeric",
		path: "entry.config.qualityGates.srFavorRangeBricks",
		labelKey: "hawksSrFavorRange",
		defaultMin: 2,
		defaultMax: 5,
		defaultStep: 1,
		condition: isHawksTriple,
	},
	{
		kind: "numeric",
		path: "entry.config.qualityGates.keltnerNearBricks",
		labelKey: "hawksKeltnerNear",
		defaultMin: 1,
		defaultMax: 3,
		defaultStep: 1,
		condition: isHawksTriple,
	},
	{
		kind: "numeric",
		path: "entry.config.qualityGates.macdSlopeWindow",
		labelKey: "hawksMacdSlope",
		defaultMin: 2,
		defaultMax: 5,
		defaultStep: 1,
		condition: isHawksTriple,
	},
	{
		kind: "numeric",
		path: "entry.config.qualityGates.aggressionThreshold",
		labelKey: "hawksAggressionThreshold",
		defaultMin: 10000,
		defaultMax: 25000,
		defaultStep: 5000,
		condition: isHawksTriple,
	},
	{
		kind: "numeric",
		path: "entry.config.qualityGates.volumeEmaPeriod",
		labelKey: "hawksVolumeEma",
		defaultMin: 300,
		defaultMax: 700,
		defaultStep: 100,
		condition: isHawksTriple,
	},

	// ── Tier 2C — boolean toggles (research mode, user opts in) ────
	...(
		[
			["srLevelBlock", "hawksSrBlockToggle"],
			["srLevelFavor", "hawksSrFavorToggle"],
			["keltnerOuterBlock", "hawksKeltnerBlockToggle"],
			["keltnerInnerPenalty", "hawksKeltnerPenaltyToggle"],
			["macdAlignmentScore", "hawksMacdToggle"],
			["volumeScore", "hawksVolumeToggle"],
			["htfMaBlock", "hawksHtfMaBlockToggle"],
		] as const
	).map<SweepableParam>(([gateKey, labelKey]) => ({
		kind: "enum",
		path: `entry.config.qualityGates.${gateKey}`,
		labelKey,
		condition: isHawksTriple,
		options: [
			{
				value: "off",
				labelKey: "hawksToggle_off",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({ ...qg, [gateKey]: false })),
			},
			{
				value: "on",
				labelKey: "hawksToggle_on",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({ ...qg, [gateKey]: true })),
			},
		],
		getCurrentValue: (r) => {
			if (r.entry.type !== "hawks_playbook") {
				return "off"
			}
			return r.entry.config.qualityGates?.[gateKey] ? "on" : "off"
		},
	})),

	// Aggression polarity is a 3-way enum (not a boolean toggle).
	{
		kind: "enum",
		path: "entry.config.qualityGates.aggressionMode",
		labelKey: "hawksAggressionMode",
		condition: isHawksTriple,
		options: [
			{
				value: "off",
				labelKey: "hawksAggressionMode_off",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({ ...qg, aggressionMode: "off" })),
			},
			{
				value: "original",
				labelKey: "hawksAggressionMode_original",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						aggressionMode: "original",
					})),
			},
			{
				value: "reversed",
				labelKey: "hawksAggressionMode_reversed",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						aggressionMode: "reversed",
					})),
			},
		],
		getCurrentValue: (r) => {
			if (r.entry.type !== "hawks_playbook") {
				return "off"
			}
			return r.entry.config.qualityGates?.aggressionMode ?? "off"
		},
	},

	// ── Tier 2D — new dual-mode axes (added in Piece B) ───────────────
	// Each of these controls the new nested shape (keltnerInner, macd, volume, aggression).
	// These are GATES axes (block/both modes change PnL) except when mode="score".
	{
		kind: "enum",
		path: "entry.config.qualityGates.keltnerInner.mode",
		labelKey: "hawksKeltnerInnerMode",
		condition: isHawksTriple,
		options: [
			{
				value: "off",
				labelKey: "hawksMode_off",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						keltnerInner: { mode: "off" },
					})),
			},
			{
				value: "score",
				labelKey: "hawksMode_score",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						keltnerInner: { mode: "score" },
					})),
			},
			{
				value: "block",
				labelKey: "hawksMode_block",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						keltnerInner: { mode: "block" },
					})),
			},
			{
				value: "both",
				labelKey: "hawksMode_both",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						keltnerInner: { mode: "both" },
					})),
			},
		],
		getCurrentValue: (r) => {
			if (r.entry.type !== "hawks_playbook") {
				return "off"
			}
			return r.entry.config.qualityGates?.keltnerInner?.mode ?? "off"
		},
	},
	{
		kind: "enum",
		path: "entry.config.qualityGates.macd.mode",
		labelKey: "hawksMacdMode",
		condition: isHawksTriple,
		options: [
			{
				value: "off",
				labelKey: "hawksMode_off",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						macd: { ...qg.macd, mode: "off" },
					})),
			},
			{
				value: "score",
				labelKey: "hawksMode_score",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						macd: { ...qg.macd, mode: "score" },
					})),
			},
			{
				value: "block",
				labelKey: "hawksMode_block",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						macd: { ...qg.macd, mode: "block" },
					})),
			},
			{
				value: "both",
				labelKey: "hawksMode_both",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						macd: { ...qg.macd, mode: "both" },
					})),
			},
		],
		getCurrentValue: (r) => {
			if (r.entry.type !== "hawks_playbook") {
				return "off"
			}
			return r.entry.config.qualityGates?.macd?.mode ?? "off"
		},
	},
	{
		kind: "enum",
		path: "entry.config.qualityGates.volume.mode",
		labelKey: "hawksVolumeMode",
		condition: isHawksTriple,
		options: [
			{
				value: "off",
				labelKey: "hawksMode_off",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						volume: { ...qg.volume, mode: "off" },
					})),
			},
			{
				value: "score",
				labelKey: "hawksMode_score",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						volume: { ...qg.volume, mode: "score" },
					})),
			},
			{
				value: "block",
				labelKey: "hawksMode_block",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						volume: { ...qg.volume, mode: "block" },
					})),
			},
			{
				value: "both",
				labelKey: "hawksMode_both",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						volume: { ...qg.volume, mode: "both" },
					})),
			},
		],
		getCurrentValue: (r) => {
			if (r.entry.type !== "hawks_playbook") {
				return "off"
			}
			return r.entry.config.qualityGates?.volume?.mode ?? "off"
		},
	},
	{
		kind: "enum",
		path: "entry.config.qualityGates.aggression.scoreMode",
		labelKey: "hawksAggressionScoreMode",
		condition: isHawksTriple,
		options: [
			{
				value: "off",
				labelKey: "hawksMode_off",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						aggression: { ...qg.aggression, scoreMode: "off" },
					})),
			},
			{
				value: "original",
				labelKey: "hawksAggressionMode_original",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						aggression: { ...qg.aggression, scoreMode: "original" },
					})),
			},
			{
				value: "reversed",
				labelKey: "hawksAggressionMode_reversed",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						aggression: { ...qg.aggression, scoreMode: "reversed" },
					})),
			},
		],
		getCurrentValue: (r) => {
			if (r.entry.type !== "hawks_playbook") {
				return "off"
			}
			return r.entry.config.qualityGates?.aggression?.scoreMode ?? "off"
		},
	},
	{
		kind: "enum",
		path: "entry.config.qualityGates.aggression.blockMode",
		labelKey: "hawksAggressionBlockMode",
		condition: isHawksTriple,
		options: [
			{
				value: "off",
				labelKey: "hawksMode_off",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						aggression: { ...qg.aggression, blockMode: "off" },
					})),
			},
			{
				value: "blockOnAligned",
				labelKey: "hawksAggressionBlockOnAligned",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						aggression: { ...qg.aggression, blockMode: "blockOnAligned" },
					})),
			},
			{
				value: "blockOnAnti",
				labelKey: "hawksAggressionBlockOnAnti",
				applyOption: (r) =>
					mutateQualityGates(r, (qg) => ({
						...qg,
						aggression: { ...qg.aggression, blockMode: "blockOnAnti" },
					})),
			},
		],
		getCurrentValue: (r) => {
			if (r.entry.type !== "hawks_playbook") {
				return "off"
			}
			return r.entry.config.qualityGates?.aggression?.blockMode ?? "off"
		},
	},

	// ── Tier 3A — engine state-machine knobs ───────────────────────
	{
		kind: "numeric",
		path: "entry.config.fireCooldownBricks",
		labelKey: "hawksFireCooldown",
		defaultMin: 3,
		defaultMax: 7,
		defaultStep: 1,
		condition: isHawksTriple,
	},
	{
		kind: "numeric",
		path: "entry.config.wave1MinBricks",
		labelKey: "hawksWave1Min",
		defaultMin: 3,
		defaultMax: 6,
		defaultStep: 1,
		condition: isHawksTriple,
	},
	{
		kind: "numeric",
		path: "entry.config.retracementMinBricks",
		labelKey: "hawksRetracementMin",
		defaultMin: 1,
		defaultMax: 3,
		defaultStep: 1,
		condition: isHawksTriple,
	},
]

export { hawksPresets, hawksV0, hawksUserCatalog, HAWKS_SWEEPABLE_PARAMS }
