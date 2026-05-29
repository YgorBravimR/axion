/**
 * Hawks quality rule registry.
 *
 * Decouples per-indicator rules from the entry state machine. Each rule is
 * a small pure function (or stateful, via QualityContext) gated by a config
 * flag in QualityGatesConfig. The engine calls evaluateQuality() once per
 * fire site; this module decides:
 *
 *   1. Is the fire BLOCKED (hard disqualifier)?
 *   2. What's the trade's quality score + per-indicator contributions?
 *
 * Adding a new indicator = adding one entry to blockRules or scoreRules.
 *
 * Scoring model (signed-score-with-weights):
 *   Each ScoreRule returns "favor" | "penalty" | "neutral".
 *     favor   ⇒ +rule.weight
 *     penalty ⇒ -rule.weight
 *     neutral ⇒ 0
 *   Score = sum of contributions. Tier = bucketed score per tierThresholds.
 *   Weights are 1.0 everywhere today — will tune later when data is richer.
 *
 * Group ownership of rules:
 *   A — S/R levels (4 HTF MAs + vwap_d + ajuste)   [wired]
 *   B — Keltner exhaustion penalty + outer block   [planned]
 *   C — MACD sign + slope                          [planned]
 *   D — aggression_balance threshold               [planned]
 *   E — volume vs running EMA                      [planned]
 */
import type {
	HawksTripleScreenConfig,
	IndicatorContribution,
	IndicatorSignal,
	QualityTier,
	TierThresholds,
	TradeQuality,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

// ════════════════════════════════════════════════════════════════════
// QualityContext — engine-side state used by stateful rules
// ════════════════════════════════════════════════════════════════════
//
// Stateless rules (S/R, Keltner, MACD sign) ignore this.
// Stateful rules (MACD slope, volume EMA) read and update it.
// The engine calls updateQualityContext() once per brick BEFORE the fire check.
interface QualityContext {
	recentMacd: number[] // ring buffer; tail = most recent
	volumeEma: number | null // running EMA across bricks
}

const createQualityContext = (): QualityContext => ({
	recentMacd: [],
	volumeEma: null,
})

// Default values — keep in sync with QualityGatesConfig defaults.
const DEFAULT_SR_BLOCK_BUFFER_BRICKS = 2
const DEFAULT_SR_FAVOR_RANGE_BRICKS = 3
const DEFAULT_KELTNER_NEAR_BRICKS = 2
const DEFAULT_AGGRESSION_THRESHOLD = 15000
const DEFAULT_TIER_THRESHOLDS: TierThresholds = { AAA: 3, AA: 2, A: 1 }

// ════════════════════════════════════════════════════════════════════
// S/R level set — shared between BLOCK and FAVOR rules
// ════════════════════════════════════════════════════════════════════
//
// Active set: 4 HTF MAs + vwap_d_5m + ajuste_d1.
// Deferred (probe was anti-predictive — re-probe with more data):
//   vwap_m_5m, vwap_s_5m
// See docs/hawks-indicator-inventory.md for reasoning.
const ACTIVE_SR_LEVEL_KEYS = [
	"mme27_60m",
	"mme55_60m",
	"mme27_15m",
	"mme55_15m",
	"vwap_d_5m",
	"ajuste_d1",
] as const

// Sign convention for any level L at entry price P with direction D:
//   signedDelta = D === "short" ? (L - P) : (P - L)
//     positive ⇒ level is BEHIND trade (favorable side, cushion)
//     negative ⇒ level is AHEAD of trade (adverse side, blocks move)
const srSignedDelta = (
	candle: CandleRow,
	levelKey: string,
	direction: "short" | "long"
): number | null => {
	const raw = candle.indicators[levelKey]
	if (typeof raw !== "number") {
		return null
	}
	return direction === "short" ? raw - candle.close : candle.close - raw
}

// ════════════════════════════════════════════════════════════════════
// BLOCK rules — hard disqualifiers
// ════════════════════════════════════════════════════════════════════
interface BlockRule {
	key: string
	configFlag: (_config: HawksTripleScreenConfig) => boolean
	evaluate: (
		_candle: CandleRow,
		_direction: "short" | "long",
		_brickSize: number,
		_config: HawksTripleScreenConfig,
		_ctx: QualityContext
	) => boolean
}

const srLevelBlockRule: BlockRule = {
	key: "sr_level_block",
	configFlag: (c) =>
		c.qualityGates?.srLevelBlock === true ||
		c.qualityGates?.htfMaBlock === true, // legacy alias
	evaluate: (candle, direction, brickSize, config) => {
		const buffer =
			config.qualityGates?.srBlockBufferBricks ?? DEFAULT_SR_BLOCK_BUFFER_BRICKS
		// Legacy htfMaBlock only checks the 4 MAs, not vwap_d / ajuste.
		const keys =
			config.qualityGates?.srLevelBlock !== true &&
			config.qualityGates?.htfMaBlock === true
				? ACTIVE_SR_LEVEL_KEYS.slice(0, 4)
				: ACTIVE_SR_LEVEL_KEYS
		for (const k of keys) {
			const delta = srSignedDelta(candle, k, direction)
			if (delta === null) {
				continue
			}
			if (delta >= -buffer * brickSize && delta < 0) {
				return true
			}
		}
		return false
	},
}

// Distance from trade close to its direction-relevant Keltner band, measured
// in the trade-favorable direction. Positive = trade has room; ≤ 0 = price
// at/past the band. SHORT uses `inf` (lower band); LONG uses `sup` (upper).
const keltnerDistance = (
	candle: CandleRow,
	direction: "short" | "long",
	multiple: "125" | "165"
): number | null => {
	const key =
		direction === "short"
			? `keltner_inf_${multiple}`
			: `keltner_sup_${multiple}`
	const raw = candle.indicators[key]
	if (typeof raw !== "number") {
		return null
	}
	return direction === "short" ? candle.close - raw : raw - candle.close
}

// BLOCK on Keltner outer (165): probe showed price almost never punches
// through 165 — the band acts as a wall. So the trigger is "within N bricks
// of the band, ahead of trade OR already touching." Selectivity in 20-day
// data is ∞× (0 catalog killed, 1 extra killed) — tentative; will earn its
// keep with more data.
const keltnerOuterBlockRule: BlockRule = {
	key: "keltner_outer_block",
	configFlag: (c) => c.qualityGates?.keltnerOuterBlock === true,
	evaluate: (candle, direction, brickSize, config) => {
		const d = keltnerDistance(candle, direction, "165")
		if (d === null) {
			return false
		}
		const window =
			(config.qualityGates?.keltnerNearBricks ?? DEFAULT_KELTNER_NEAR_BRICKS) *
			brickSize
		return d <= window
	},
}

const blockRules: BlockRule[] = [srLevelBlockRule, keltnerOuterBlockRule]

// ════════════════════════════════════════════════════════════════════
// SCORE rules — each returns favor/penalty/neutral
// ════════════════════════════════════════════════════════════════════
interface ScoreRule {
	key: string
	weight: number
	configFlag: (_config: HawksTripleScreenConfig) => boolean
	evaluate: (
		_candle: CandleRow,
		_direction: "short" | "long",
		_brickSize: number,
		_config: HawksTripleScreenConfig,
		_ctx: QualityContext
	) => IndicatorSignal
}

// One ScoreRule per S/R level (so per-indicator contributions show in the
// audit, not a single rollup row).
const buildSrFavorRule = (levelKey: string): ScoreRule => ({
	key: levelKey,
	weight: 1.0,
	configFlag: (c) => c.qualityGates?.srLevelFavor === true,
	evaluate: (candle, direction, brickSize, config) => {
		const delta = srSignedDelta(candle, levelKey, direction)
		if (delta === null) {
			return "neutral"
		}
		const range =
			config.qualityGates?.srFavorRangeBricks ?? DEFAULT_SR_FAVOR_RANGE_BRICKS
		if (delta > 0 && delta <= range * brickSize) {
			return "favor"
		}
		return "neutral"
	},
})

// Group B PENALTY: Keltner inner band (125) approached but NOT crossed yet.
// Probe finding: NEAR_125 selectivity = 4.45× (extras hit it 4× more than
// catalog). PAST_125 is anti-selective and INTENTIONALLY excluded — once
// price punches through the inner band, the move is confirmed and the
// catalog actually fires more often than EXTRAS in that zone.
const keltnerInnerPenaltyRule: ScoreRule = {
	key: "keltner_inner_penalty",
	weight: 1.0,
	configFlag: (c) => c.qualityGates?.keltnerInnerPenalty === true,
	evaluate: (candle, direction, brickSize, config) => {
		const d = keltnerDistance(candle, direction, "125")
		if (d === null) {
			return "neutral"
		}
		const window =
			(config.qualityGates?.keltnerNearBricks ?? DEFAULT_KELTNER_NEAR_BRICKS) *
			brickSize
		// NEAR_125 = 0 < d ≤ window; PAST_125 (d ≤ 0) does NOT penalize.
		if (d > 0 && d <= window) {
			return "penalty"
		}
		return "neutral"
	},
}

// Group D: aggression_balance with tri-state polarity switch.
// Probe (scripts/probe-aggression-balance.ts) at threshold 15K showed:
//   ALIGNED catalog 18.1% / extras 30.3% — 1.67× selectivity for PENALTY.
//   ANTI never fires (EMA gate pre-filters).
// User's discretionary read: catalog entries land BEFORE aggression piles
// in, so "high aligned aggression = late entry = lower quality" = PENALTY.
// Original-polarity stays available behind the same flag for A/B.
const aggressionRule: ScoreRule = {
	key: "aggression_balance",
	weight: 1.0,
	configFlag: (c) => {
		const mode = c.qualityGates?.aggressionMode
		return mode === "original" || mode === "reversed"
	},
	evaluate: (candle, direction, _brickSize, config) => {
		const agg = candle.indicators["aggression_balance"]
		if (typeof agg !== "number") {
			return "neutral"
		}
		const threshold =
			config.qualityGates?.aggressionThreshold ?? DEFAULT_AGGRESSION_THRESHOLD
		if (Math.abs(agg) < threshold) {
			return "neutral"
		}
		const aligned =
			(direction === "long" && agg >= threshold) ||
			(direction === "short" && agg <= -threshold)
		const mode = config.qualityGates?.aggressionMode ?? "off"
		if (mode === "original") {
			return aligned ? "favor" : "penalty"
		}
		if (mode === "reversed") {
			return aligned ? "penalty" : "favor"
		}
		return "neutral"
	},
}

// Group E: volume on the fire brick vs running EMA.
// Probe (scripts/probe-volume-vs-ema.ts) at EMA-500 showed catalog 54.3% /
// extras 40.0% ABOVE — selectivity 0.74× (strongest single signal across
// all five groups). Direction-agnostic; high volume = "something interesting
// is happening here" regardless of LONG/SHORT.
// Note: ctx.volumeEma is the POST-update EMA (current brick folded in). For
// EMA-500 the single-brick contribution is α ≈ 0.4%, so the bias vs
// pre-update EMA is negligible.
const volumeAboveEmaRule: ScoreRule = {
	key: "volume",
	weight: 1.0,
	configFlag: (c) => c.qualityGates?.volumeScore === true,
	evaluate: (candle, _direction, _brickSize, _config, ctx) => {
		const vol = candle.indicators["volume"]
		if (typeof vol !== "number" || ctx.volumeEma === null) {
			return "neutral"
		}
		return vol > ctx.volumeEma ? "favor" : "neutral"
	},
}

const scoreRules: ScoreRule[] = [
	...ACTIVE_SR_LEVEL_KEYS.map(buildSrFavorRule),
	keltnerInnerPenaltyRule,
	aggressionRule,
	volumeAboveEmaRule,
]

// ════════════════════════════════════════════════════════════════════
// Tier mapping
// ════════════════════════════════════════════════════════════════════
const scoreToTier = (
	score: number,
	thresholds: TierThresholds
): QualityTier => {
	if (score >= thresholds.AAA) {
		return "AAA"
	}
	if (score >= thresholds.AA) {
		return "AA"
	}
	if (score >= thresholds.A) {
		return "A"
	}
	return "B"
}

// ════════════════════════════════════════════════════════════════════
// Quality context lifecycle
// ════════════════════════════════════════════════════════════════════
//
// Stateless rules don't need this. Stateful rules (Groups C, E) read history
// from the context. Called once per brick, BEFORE the fire check, so the
// fire's quality reflects pre-fire state (not the fire brick's own movement).
const updateQualityContext = (
	candle: CandleRow,
	ctx: QualityContext,
	config: HawksTripleScreenConfig
): QualityContext => {
	const next: QualityContext = { ...ctx, recentMacd: [...ctx.recentMacd] }
	const macd = candle.indicators[config.macd_key]
	if (typeof macd === "number") {
		next.recentMacd.push(macd)
		const window = config.qualityGates?.macdSlopeWindow ?? 3
		if (next.recentMacd.length > window + 1) {
			next.recentMacd.shift()
		}
	}
	const vol = candle.indicators["volume"]
	if (typeof vol === "number") {
		const period = config.qualityGates?.volumeEmaPeriod ?? 500
		const alpha = 2 / (period + 1)
		next.volumeEma =
			next.volumeEma === null
				? vol
				: next.volumeEma + alpha * (vol - next.volumeEma)
	}
	return next
}

// ════════════════════════════════════════════════════════════════════
// Public entry point
// ════════════════════════════════════════════════════════════════════
interface EvaluateQualityResult {
	blocked: boolean
	quality: TradeQuality
}

const evaluateQuality = (
	candle: CandleRow,
	direction: "short" | "long",
	brickSize: number,
	config: HawksTripleScreenConfig,
	ctx: QualityContext
): EvaluateQualityResult => {
	for (const rule of blockRules) {
		if (!rule.configFlag(config)) {
			continue
		}
		if (rule.evaluate(candle, direction, brickSize, config, ctx)) {
			return { blocked: true, quality: emptyQuality(config) }
		}
	}
	const contributions: IndicatorContribution[] = []
	let score = 0
	for (const rule of scoreRules) {
		if (!rule.configFlag(config)) {
			continue
		}
		const signal = rule.evaluate(candle, direction, brickSize, config, ctx)
		const contribution =
			signal === "favor" ? rule.weight : signal === "penalty" ? -rule.weight : 0
		contributions.push({
			key: rule.key,
			signal,
			weight: rule.weight,
			contribution,
		})
		score += contribution
	}
	const thresholds =
		config.qualityGates?.tierThresholds ?? DEFAULT_TIER_THRESHOLDS
	return {
		blocked: false,
		quality: { tier: scoreToTier(score, thresholds), score, contributions },
	}
}

const emptyQuality = (config: HawksTripleScreenConfig): TradeQuality => {
	const thresholds =
		config.qualityGates?.tierThresholds ?? DEFAULT_TIER_THRESHOLDS
	return { tier: scoreToTier(0, thresholds), score: 0, contributions: [] }
}

export {
	createQualityContext,
	updateQualityContext,
	evaluateQuality,
	ACTIVE_SR_LEVEL_KEYS,
}
export type { QualityContext, EvaluateQualityResult }
