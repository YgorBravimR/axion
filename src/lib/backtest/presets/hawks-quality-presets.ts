import type { QualityGatesConfig, TierThresholds } from "@/types/backtest"

// Five-level disclosure model for the Hawks quality registry. Named bundles
// give traders one-click coverage from "audit-style autonomous engine only"
// to "every gate + every quality score on". Custom is implicit: any deviation
// from a named bundle's exact shape resolves to "custom".
type QualityPresetLevel = "off" | "lite" | "standard" | "strict" | "custom"

// Engine-side defaults for every QualityGatesConfig field. Mirrors the
// fallbacks documented in src/types/backtest.ts and used by
// hawks-quality-rules.ts. Keep in sync if either side changes.
const DEFAULT_TIER_THRESHOLDS: TierThresholds = { AAA: 3, AA: 2, A: 1 }

// "Filled" = every legacy field present, no undefineds. Required for stable
// equality checks: a partially-set config (e.g. only htfMaBlock: false) is
// normalized to this shape before matching. New dual-mode fields (v5→v6) are
// NOT included here — they're optional and handled separately by Piece B.
type FilledQualityGates = Required<
	Omit<
		QualityGatesConfig,
		"tierThresholds" | "keltnerInner" | "macd" | "volume" | "aggression"
	>
> & {
	tierThresholds: TierThresholds
}

const DEFAULT_QUALITY: FilledQualityGates = {
	srLevelBlock: false,
	srLevelFavor: false,
	keltnerOuterBlock: false,
	keltnerInnerPenalty: false,
	macdAlignmentScore: false,
	aggressionMode: "off",
	volumeScore: false,
	srBlockBufferBricks: 2,
	srFavorRangeBricks: 3,
	keltnerNearBricks: 2,
	aggressionThreshold: 15000,
	volumeEmaPeriod: 500,
	macdSlopeWindow: 3,
	tierThresholds: DEFAULT_TIER_THRESHOLDS,
	htfMaBlock: false,
}

// Named bundles. Choices are deliberate, not exhaustive:
//   off      — engine baseline; quality scoring still runs but no rule modifies it.
//   lite     — one favor signal (sr-level cushion). No blocks. Safest test.
//   standard — all favor/penalty/score signals on, aggression reversed (the
//              polarity supported by the 20-day probe). No blocks.
//   strict   — standard + the two block rules (sr-level ahead, keltner outer).
//              Reduces fire rate; raises catalog-share-of-fires.
const QUALITY_BUNDLES: Record<
	Exclude<QualityPresetLevel, "custom">,
	FilledQualityGates
> = {
	off: { ...DEFAULT_QUALITY },
	lite: {
		...DEFAULT_QUALITY,
		srLevelFavor: true,
	},
	standard: {
		...DEFAULT_QUALITY,
		srLevelFavor: true,
		keltnerInnerPenalty: true,
		macdAlignmentScore: true,
		volumeScore: true,
		aggressionMode: "reversed",
	},
	strict: {
		...DEFAULT_QUALITY,
		srLevelBlock: true,
		srLevelFavor: true,
		keltnerOuterBlock: true,
		keltnerInnerPenalty: true,
		macdAlignmentScore: true,
		volumeScore: true,
		aggressionMode: "reversed",
	},
}

// Coerce a partial config into the fully-filled shape. Missing fields take
// engine-default values so matching never returns "custom" just because the
// user has not yet touched an irrelevant toggle.
const normalizeQualityGates = (
	gates: QualityGatesConfig | undefined
): FilledQualityGates => ({
	srLevelBlock: gates?.srLevelBlock ?? DEFAULT_QUALITY.srLevelBlock,
	srLevelFavor: gates?.srLevelFavor ?? DEFAULT_QUALITY.srLevelFavor,
	keltnerOuterBlock:
		gates?.keltnerOuterBlock ?? DEFAULT_QUALITY.keltnerOuterBlock,
	keltnerInnerPenalty:
		gates?.keltnerInnerPenalty ?? DEFAULT_QUALITY.keltnerInnerPenalty,
	macdAlignmentScore:
		gates?.macdAlignmentScore ?? DEFAULT_QUALITY.macdAlignmentScore,
	aggressionMode: gates?.aggressionMode ?? DEFAULT_QUALITY.aggressionMode,
	volumeScore: gates?.volumeScore ?? DEFAULT_QUALITY.volumeScore,
	srBlockBufferBricks:
		gates?.srBlockBufferBricks ?? DEFAULT_QUALITY.srBlockBufferBricks,
	srFavorRangeBricks:
		gates?.srFavorRangeBricks ?? DEFAULT_QUALITY.srFavorRangeBricks,
	keltnerNearBricks:
		gates?.keltnerNearBricks ?? DEFAULT_QUALITY.keltnerNearBricks,
	aggressionThreshold:
		gates?.aggressionThreshold ?? DEFAULT_QUALITY.aggressionThreshold,
	volumeEmaPeriod: gates?.volumeEmaPeriod ?? DEFAULT_QUALITY.volumeEmaPeriod,
	macdSlopeWindow: gates?.macdSlopeWindow ?? DEFAULT_QUALITY.macdSlopeWindow,
	tierThresholds: {
		AAA: gates?.tierThresholds?.AAA ?? DEFAULT_TIER_THRESHOLDS.AAA,
		AA: gates?.tierThresholds?.AA ?? DEFAULT_TIER_THRESHOLDS.AA,
		A: gates?.tierThresholds?.A ?? DEFAULT_TIER_THRESHOLDS.A,
	},
	htfMaBlock: gates?.htfMaBlock ?? DEFAULT_QUALITY.htfMaBlock,
})

const filledQualityGatesEqual = (
	a: FilledQualityGates,
	b: FilledQualityGates
): boolean =>
	a.srLevelBlock === b.srLevelBlock &&
	a.srLevelFavor === b.srLevelFavor &&
	a.keltnerOuterBlock === b.keltnerOuterBlock &&
	a.keltnerInnerPenalty === b.keltnerInnerPenalty &&
	a.macdAlignmentScore === b.macdAlignmentScore &&
	a.aggressionMode === b.aggressionMode &&
	a.volumeScore === b.volumeScore &&
	a.srBlockBufferBricks === b.srBlockBufferBricks &&
	a.srFavorRangeBricks === b.srFavorRangeBricks &&
	a.keltnerNearBricks === b.keltnerNearBricks &&
	a.aggressionThreshold === b.aggressionThreshold &&
	a.volumeEmaPeriod === b.volumeEmaPeriod &&
	a.macdSlopeWindow === b.macdSlopeWindow &&
	a.tierThresholds.AAA === b.tierThresholds.AAA &&
	a.tierThresholds.AA === b.tierThresholds.AA &&
	a.tierThresholds.A === b.tierThresholds.A &&
	a.htfMaBlock === b.htfMaBlock

// Returns the preset level that the supplied gates exactly match, or "custom"
// when no bundle matches. Used by the UI to keep the segmented toggle in sync
// with the underlying config even when the user edits individual fields.
const matchQualityPreset = (
	gates: QualityGatesConfig | undefined
): QualityPresetLevel => {
	const normalized = normalizeQualityGates(gates)
	const entries = Object.entries(QUALITY_BUNDLES) as [
		Exclude<QualityPresetLevel, "custom">,
		FilledQualityGates,
	][]
	for (const [level, bundle] of entries) {
		if (filledQualityGatesEqual(normalized, bundle)) {
			return level
		}
	}
	return "custom"
}

// Returns the QualityGatesConfig to write into the recipe when a named bundle
// is selected. "custom" is a no-op signal — callers should leave gates alone
// when receiving a "custom" choice from the segmented toggle.
const getQualityPresetBundle = (
	level: Exclude<QualityPresetLevel, "custom">
): QualityGatesConfig => ({ ...QUALITY_BUNDLES[level] })

export {
	DEFAULT_QUALITY,
	DEFAULT_TIER_THRESHOLDS,
	QUALITY_BUNDLES,
	getQualityPresetBundle,
	matchQualityPreset,
	normalizeQualityGates,
	type FilledQualityGates,
	type QualityPresetLevel,
}
