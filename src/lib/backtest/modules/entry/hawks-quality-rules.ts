/**
 * Hawks quality rule registry with dual-mode support.
 *
 * Decouples per-indicator rules from the entry state machine. Each rule is
 * a small pure function (or stateful, via QualityContext) gated by a config
 * flag in QualityGatesConfig. The engine calls evaluateQuality() once per
 * fire site; this module decides:
 *
 *   1. Is the fire BLOCKED (hard disqualifier)?
 *   2. What's the trade's quality score + per-indicator contributions?
 *
 * Dual-mode architecture (4 indicators: keltnerInner, macd, volume, aggression):
 *   - Each rule emits a signal: "favor" | "penalty" | "neutral" | "block"
 *   - Mode resolves new nested shape OR legacy flat flags, with fallback order
 *   - "block" signal fires when mode is "block" or "both"
 *   - Score-side fires when mode is "score" or "both" (block→penalty for score)
 *
 * Group ownership of rules:
 *   A — S/R levels (4 HTF MAs + vwap_d + ajuste)   [wired, score-only]
 *   B — Keltner outer block + inner dual-mode     [wired, outer=block only, inner=dual]
 *   C — MACD sign + slope, dual-mode              [wired]
 *   D — aggression, split scoreMode + blockMode   [wired, independent]
 *   E — volume, dual-mode                          [wired]
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

// Dual-mode rule interface: evaluates both scoring and blocking signals independently.
interface DualModeRule {
	key: string
	weight: number
	// Resolve the current mode: new nested shape takes precedence, fallback to legacy flag.
	resolveMode: (
		_config: HawksTripleScreenConfig
	) => "off" | "score" | "block" | "both"
	// Evaluate the rule's signal: "favor" | "penalty" | "neutral" | "block".
	// The caller interprets "block" only when resolveMode returns "block" or "both".
	evaluateSignal: (
		_candle: CandleRow,
		_direction: "short" | "long",
		_brickSize: number,
		_config: HawksTripleScreenConfig,
		_ctx: QualityContext
	) => IndicatorSignal | "block"
}

// Aggression has split modes: scoreMode and blockMode are independent.
interface AggressionDualModeRule extends DualModeRule {
	resolveScoreMode: (
		_config: HawksTripleScreenConfig
	) => "off" | "original" | "reversed"
	resolveBlockMode: (
		_config: HawksTripleScreenConfig
	) => "off" | "blockOnAligned" | "blockOnAnti"
	// For aggression, we return both a score signal and a block signal.
	evaluateScoreSignal: (
		_candle: CandleRow,
		_direction: "short" | "long",
		_config: HawksTripleScreenConfig
	) => IndicatorSignal
	evaluateBlockSignal: (
		_candle: CandleRow,
		_direction: "short" | "long",
		_config: HawksTripleScreenConfig
	) => "block" | "neutral"
}

// ════════════════════════════════════════════════════════════════════
// S/R level set — shared between BLOCK and FAVOR rules
// ════════════════════════════════════════════════════════════════════
//
// Active set: 4 HTF MAs + vwap_d + ajuste.
// Deferred (probe was anti-predictive — re-probe with more data):
//   vwap_m, vwap_w
// `ajuste` comes from `asset_session_anchors` (one row per day), injected
// into candle.indicators at fetch time by daily-anchors.ts. The others are
// per-brick indicators stored in price_candles.indicators JSONB.
// See docs/hawks-strategy/indicator-inventory.md for reasoning.
const ACTIVE_SR_LEVEL_KEYS = [
	"mme27_60m",
	"mme55_60m",
	"mme27_15m",
	"mme55_15m",
	"vwap_d",
	"ajuste",
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

// Group B DUAL-MODE: Keltner inner band (125).
// Trigger: within N bricks of the 125 band (same threshold for both score and block).
// Score signal: penalty (legacy behavior).
// Block signal: block when trigger fires.
const keltnerInnerDualRule: DualModeRule = {
	key: "keltner_inner",
	weight: 1.0,
	resolveMode: (c) => {
		if (c.qualityGates?.keltnerInner?.mode !== undefined) {
			return c.qualityGates.keltnerInner.mode
		}
		return c.qualityGates?.keltnerInnerPenalty === true ? "score" : "off"
	},
	evaluateSignal: (candle, direction, brickSize, config) => {
		const d = keltnerDistance(candle, direction, "125")
		if (d === null) {
			return "neutral"
		}
		const window =
			(config.qualityGates?.keltnerNearBricks ?? DEFAULT_KELTNER_NEAR_BRICKS) *
			brickSize
		// Trigger: within the window, favorable side only (0 < d ≤ window).
		if (d > 0 && d <= window) {
			return "block"
		}
		return "neutral"
	},
}

// Group D SPLIT DUAL-MODE: aggression with independent score + block modes.
// The rule has independent scoreMode and blockMode, both controlled by separate
// config knobs and both optional. Threshold is shared.
const aggressionSplitRule: AggressionDualModeRule = {
	key: "aggression",
	weight: 1.0,
	resolveMode: (c) => {
		const scoreMode = c.qualityGates?.aggression?.scoreMode ?? "off"
		const blockMode = c.qualityGates?.aggression?.blockMode ?? "off"
		if (scoreMode === "off" && blockMode === "off") {
			return "off"
		}
		if (scoreMode !== "off" && blockMode === "off") {
			return "score"
		}
		if (scoreMode === "off" && blockMode !== "off") {
			return "block"
		}
		return "both"
	},
	resolveScoreMode: (c) =>
		c.qualityGates?.aggression?.scoreMode ??
		c.qualityGates?.aggressionMode ??
		"off",
	resolveBlockMode: (c) => c.qualityGates?.aggression?.blockMode ?? "off",
	evaluateSignal: (candle, direction, brickSize, config, _ctx) => {
		const scoreMode = config.qualityGates?.aggression?.scoreMode ?? "off"
		const blockMode = config.qualityGates?.aggression?.blockMode ?? "off"
		const scoreSignal =
			scoreMode === "off"
				? "neutral"
				: aggressionSplitRule.evaluateScoreSignal(candle, direction, config)
		const blockSignal =
			blockMode === "off"
				? "neutral"
				: aggressionSplitRule.evaluateBlockSignal(candle, direction, config)
		// Return the "stronger" signal for the caller to dispatch on mode.
		if (blockSignal === "block") {
			return "block"
		}
		return scoreSignal
	},
	evaluateScoreSignal: (candle, direction, config) => {
		const agg = candle.indicators["aggression_balance"]
		if (typeof agg !== "number") {
			return "neutral"
		}
		const threshold =
			config.qualityGates?.aggression?.threshold ??
			config.qualityGates?.aggressionThreshold ??
			DEFAULT_AGGRESSION_THRESHOLD
		if (Math.abs(agg) < threshold) {
			return "neutral"
		}
		const aligned =
			(direction === "long" && agg >= threshold) ||
			(direction === "short" && agg <= -threshold)
		const scoreMode = config.qualityGates?.aggression?.scoreMode ?? "off"
		if (scoreMode === "original") {
			return aligned ? "favor" : "penalty"
		}
		if (scoreMode === "reversed") {
			return aligned ? "penalty" : "favor"
		}
		return "neutral"
	},
	evaluateBlockSignal: (candle, direction, config) => {
		const agg = candle.indicators["aggression_balance"]
		if (typeof agg !== "number") {
			return "neutral"
		}
		const threshold =
			config.qualityGates?.aggression?.threshold ??
			config.qualityGates?.aggressionThreshold ??
			DEFAULT_AGGRESSION_THRESHOLD
		if (Math.abs(agg) < threshold) {
			return "neutral"
		}
		const aligned =
			(direction === "long" && agg >= threshold) ||
			(direction === "short" && agg <= -threshold)
		const blockMode = config.qualityGates?.aggression?.blockMode ?? "off"
		if (blockMode === "blockOnAligned" && aligned) {
			return "block"
		}
		if (blockMode === "blockOnAnti" && !aligned) {
			return "block"
		}
		return "neutral"
	},
}

// Group C DUAL-MODE: MACD sign + slope.
// Score signal: favor when sign aligned + slope aligned; penalty when opposed; neutral mixed.
// Block signal: block on anything other than pure favor (sign opposed OR mixed).
const macdDualRule: DualModeRule = {
	key: "macd",
	weight: 1.0,
	resolveMode: (c) => {
		if (c.qualityGates?.macd?.mode !== undefined) {
			return c.qualityGates.macd.mode
		}
		return c.qualityGates?.macdAlignmentScore === true ? "score" : "off"
	},
	evaluateSignal: (candle, direction, _brickSize, config, ctx) => {
		const macd = candle.indicators[config.macd_key]
		if (typeof macd !== "number") {
			return "neutral"
		}
		const signAligned =
			(direction === "long" && macd > 0) || (direction === "short" && macd < 0)
		const signOpposed =
			(direction === "long" && macd < 0) || (direction === "short" && macd > 0)
		if (signOpposed) {
			return "block"
		}
		if (!signAligned) {
			return "neutral"
		}
		const buf = ctx.recentMacd
		if (buf.length < 2) {
			return "favor"
		}
		const slope = buf[buf.length - 1]! - buf[0]!
		const slopeAligned =
			(direction === "long" && slope > 0) ||
			(direction === "short" && slope < 0)
		if (slopeAligned) {
			return "favor"
		}
		return "block"
	},
}

// Group E DUAL-MODE: volume vs running EMA.
// Score signal: favor when volume > EMA (legacy behavior).
// Block signal: block when volume < EMA (complement of score trigger).
const volumeDualRule: DualModeRule = {
	key: "volume",
	weight: 1.0,
	resolveMode: (c) => {
		if (c.qualityGates?.volume?.mode !== undefined) {
			return c.qualityGates.volume.mode
		}
		return c.qualityGates?.volumeScore === true ? "score" : "off"
	},
	evaluateSignal: (candle, _direction, _brickSize, config, ctx) => {
		const vol = candle.indicators["volume"]
		if (typeof vol !== "number" || ctx.volumeEma === null) {
			return "neutral"
		}
		if (vol > ctx.volumeEma) {
			return "favor"
		}
		return "block"
	},
}

const scoreRules: ScoreRule[] = [...ACTIVE_SR_LEVEL_KEYS.map(buildSrFavorRule)]

const dualModeRules: DualModeRule[] = [
	keltnerInnerDualRule,
	macdDualRule,
	volumeDualRule,
]

// Aggression is treated separately due to split scoreMode/blockMode architecture.
const aggressionRule = aggressionSplitRule

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
	// Check legacy block rules (S/R, Keltner outer).
	for (const rule of blockRules) {
		if (!rule.configFlag(config)) {
			continue
		}
		if (rule.evaluate(candle, direction, brickSize, config, ctx)) {
			return { blocked: true, quality: emptyQuality(config) }
		}
	}

	// Process dual-mode rules (keltner inner, MACD, volume).
	for (const rule of dualModeRules) {
		const mode = rule.resolveMode(config)
		if (mode === "off") {
			continue
		}
		const signal = rule.evaluateSignal(
			candle,
			direction,
			brickSize,
			config,
			ctx
		)
		if ((mode === "block" || mode === "both") && signal === "block") {
			return { blocked: true, quality: emptyQuality(config) }
		}
	}

	// Process aggression's split modes (scoreMode and blockMode independent).
	{
		const blockMode = aggressionRule.resolveBlockMode(config)
		if (blockMode !== "off") {
			const blockSignal = aggressionRule.evaluateBlockSignal(
				candle,
				direction,
				config
			)
			if (blockSignal === "block") {
				return { blocked: true, quality: emptyQuality(config) }
			}
		}
	}

	// Compute quality score from legacy score rules + dual-mode rules.
	const contributions: IndicatorContribution[] = []
	let score = 0

	// Legacy score rules (S/R favor).
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

	// Dual-mode rules (score side only, or score side when in "both" mode).
	for (const rule of dualModeRules) {
		const mode = rule.resolveMode(config)
		if (mode === "off" || mode === "block") {
			continue
		}
		// mode is "score" or "both": emit a score signal.
		const signal = rule.evaluateSignal(
			candle,
			direction,
			brickSize,
			config,
			ctx
		)
		// Map "block" signal to "penalty" for score side.
		const scoreSignal: IndicatorSignal =
			signal === "block" ? "penalty" : (signal as IndicatorSignal)
		const contribution =
			scoreSignal === "favor"
				? rule.weight
				: scoreSignal === "penalty"
					? -rule.weight
					: 0
		contributions.push({
			key: rule.key,
			signal: scoreSignal,
			weight: rule.weight,
			contribution,
		})
		score += contribution
	}

	// Aggression's scoreMode contribution.
	{
		const scoreMode = aggressionRule.resolveScoreMode(config)
		if (scoreMode !== "off") {
			const scoreSignal = aggressionRule.evaluateScoreSignal(
				candle,
				direction,
				config
			)
			const contribution =
				scoreSignal === "favor"
					? aggressionRule.weight
					: scoreSignal === "penalty"
						? -aggressionRule.weight
						: 0
			contributions.push({
				key: aggressionRule.key,
				signal: scoreSignal,
				weight: aggressionRule.weight,
				contribution,
			})
			score += contribution
		}
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
	keltnerInnerDualRule,
	macdDualRule,
	volumeDualRule,
	aggressionSplitRule,
}
export type {
	QualityContext,
	EvaluateQualityResult,
	DualModeRule,
	AggressionDualModeRule,
}
