import { z } from "zod"

// ═══════════════════════════════════════════════════════════════════
// ORB Entry Config
// ═══════════════════════════════════════════════════════════════════

const orbEntryConfigSchema = z.object({
	startTime: z.number().int().min(800).max(1200),
	endTime: z.number().int().min(800).max(1400),
	ticksBuffer: z.number().int().min(0).max(50),
	ignorarGaps: z.boolean(),
})

// ═══════════════════════════════════════════════════════════════════
// 10K (MACD+WMA) Entry Config
// ═══════════════════════════════════════════════════════════════════

const macdWmaConfigSchema = z.object({
	macdFast: z.number().int().min(2).max(100),
	macdSlow: z.number().int().min(2).max(200),
	macdSignal: z.number().int().min(2).max(100),
	wmaFast: z.number().int().min(2).max(100),
	wmaSlow: z.number().int().min(2).max(200),
	candlesAfterAlignment: z.number().int().min(0).max(10),
	stopBufferPoints: z.number().min(0).max(500),
	requireZeroCross: z.boolean(),
	startTime: z.number().int().min(800).max(1200),
	endTime: z.number().int().min(800).max(1800),
})

// ═══════════════════════════════════════════════════════════════════
// Hawks Quality Gates (all fields optional — engine fills defaults via
// normalizeQualityGates). Must be listed here or Zod silently strips the
// whole `qualityGates` object before the engine ever sees it.
// ═══════════════════════════════════════════════════════════════════

const tierThresholdsSchema = z.object({
	AAA: z.number(),
	AA: z.number(),
	A: z.number(),
})

const qualityGatesConfigSchema = z.object({
	srLevelBlock: z.boolean().optional(),
	srLevelFavor: z.boolean().optional(),
	keltnerOuterBlock: z.boolean().optional(),
	keltnerInnerPenalty: z.boolean().optional(),
	macdAlignmentScore: z.boolean().optional(),
	aggressionMode: z.enum(["off", "original", "reversed"]).optional(),
	volumeScore: z.boolean().optional(),
	srBlockBufferBricks: z.number().int().min(0).max(50).optional(),
	srFavorRangeBricks: z.number().int().min(0).max(50).optional(),
	keltnerNearBricks: z.number().int().min(0).max(50).optional(),
	aggressionThreshold: z.number().min(0).optional(),
	volumeEmaPeriod: z.number().int().min(1).max(10000).optional(),
	macdSlopeWindow: z.number().int().min(1).max(100).optional(),
	tierThresholds: tierThresholdsSchema.optional(),
	htfMaBlock: z.boolean().optional(),
})

// ═══════════════════════════════════════════════════════════════════
// Hawks Triple-Screen Entry Config
// ═══════════════════════════════════════════════════════════════════

const hawksTripleScreenConfigSchema = z.object({
	ema27_60m_key: z.string().min(1),
	ema55_60m_key: z.string().min(1),
	ema27_15m_key: z.string().min(1),
	ema55_15m_key: z.string().min(1),
	macd_key: z.string().min(1),
	topos_fundos_key: z.string().min(1),
	prev_15m_open_key: z.string().min(1),
	prev_15m_close_key: z.string().min(1),
	prev_60m_open_key: z.string().min(1),
	prev_60m_close_key: z.string().min(1),
	brickSize5mPoints: z.number().positive().max(10000),
	startTime: z.number().int().min(800).max(1200),
	endTime: z.number().int().min(800).max(1800),
	qualityGates: qualityGatesConfigSchema.optional(),
})

// ═══════════════════════════════════════════════════════════════════
// User-served Entry Catalog (manual entries supplied by the trader)
// ═══════════════════════════════════════════════════════════════════

const userEntrySchema = z.object({
	date: z.string().min(1),
	brickIndex: z.number().int(),
	direction: z.enum(["long", "short"]),
	label: z.string().optional(),
	notes: z.string().optional(),
	// Dev/test catalog files carry these for the audit pipeline; pass-through
	// so the engine/UI can read them without Zod stripping them.
	expectedResult: z.enum(["BE", "GA", "ST"]).nullable().optional(),
	closingBrickPrice: z.number().nullable().optional(),
})

const userCatalogConfigSchema = z.object({
	catalog: z.array(userEntrySchema),
	startTime: z.number().int().min(0).max(2359).optional(),
	endTime: z.number().int().min(0).max(2359).optional(),
})

// ═══════════════════════════════════════════════════════════════════
// Stop Config
// ═══════════════════════════════════════════════════════════════════

const initialStopConfigSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("pct_range"), pct: z.number().min(1).max(100) }),
	// min(0) allows points=0, activating the signal.stopReference escape hatch (used by Hawks)
	z.object({
		type: z.literal("fixed_points"),
		points: z.number().min(0).max(10000),
	}),
	z.object({
		type: z.literal("full_range"),
		ticksBuffer: z.number().int().min(0).max(50),
	}),
])

const breakevenConfigSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("on_partial") }),
	z.object({
		type: z.literal("on_pct_risk"),
		triggerPct: z.number().min(1).max(500),
	}),
])

const trailingConfigSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("price_distance"),
		distance: z.number().min(1).max(10000),
		activationPct: z.number().min(1).max(100).optional(),
	}),
	z.object({
		type: z.literal("indicator"),
		wmaPeriod: z.number().int().min(2).max(200),
		offset: z.number().int().min(0).max(10),
	}),
])

const stopConfigSchema = z.object({
	initial: initialStopConfigSchema,
	breakeven: breakevenConfigSchema.optional(),
	trailing: trailingConfigSchema.optional(),
})

// ═══════════════════════════════════════════════════════════════════
// Target Config
// ═══════════════════════════════════════════════════════════════════

const targetLevelSchema = z.object({
	value: z.number().min(0.01).max(100000),
	mode: z.enum(["r_multiple", "pct_range", "pct_stop", "fixed_points"]),
	exitPct: z.number().int().min(1).max(100),
	label: z.string().min(1),
})

const targetConfigSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("fixed_levels"),
		levels: z.array(targetLevelSchema).min(1).max(10),
		eodTime: z.number().int().min(1200).max(1800),
	}),
])

// ═══════════════════════════════════════════════════════════════════
// Sizing Config
// ═══════════════════════════════════════════════════════════════════

const sizingConfigSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("monetary_risk"),
		riskAmountCents: z.number().int().min(100),
		valuePerPointCents: z.number().int().min(1),
		riskDistribution: z.enum(["per_trade", "per_day"]),
	}),
	z.object({
		type: z.literal("fixed_lots"),
		lots: z.number().int().min(1).max(1000),
	}),
])

// ═══════════════════════════════════════════════════════════════════
// Reversal Config
// ═══════════════════════════════════════════════════════════════════

const reversalConfigSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("none") }),
	z.object({
		type: z.literal("reverse_on_stop"),
		maxReversals: z.number().int().min(1).max(5),
		virarNoBE: z.boolean(),
	}),
])

// ═══════════════════════════════════════════════════════════════════
// Full Strategy Recipe
// ═══════════════════════════════════════════════════════════════════

const strategyRecipeSchema = z.object({
	presetId: z.enum([
		"orb_test_1",
		"orb_test_2",
		"orb_test_3",
		"orb_test_4",
		"hawks_v0",
		"hawks_user_catalog",
		"custom",
	]),
	displayName: z.string().min(1),
	entry: z.discriminatedUnion("type", [
		z.object({ type: z.literal("orb_breakout"), config: orbEntryConfigSchema }),
		z.object({
			type: z.literal("macd_wma_alignment"),
			config: macdWmaConfigSchema,
		}),
		z.object({
			type: z.literal("hawks_triple_screen"),
			config: hawksTripleScreenConfigSchema,
		}),
		z.object({
			type: z.literal("user_catalog"),
			config: userCatalogConfigSchema,
		}),
	]),
	stop: stopConfigSchema,
	target: targetConfigSchema,
	sizing: sizingConfigSchema,
	reversal: reversalConfigSchema,
	slippageTicks: z.number().int().min(0).max(50),
	requiredIndicators: z.array(z.string()).default([]),
})

// ═══════════════════════════════════════════════════════════════════
// Full Backtest Input
// ═══════════════════════════════════════════════════════════════════

const backtestInputSchema = z.object({
	assetId: z.string().uuid(),
	timeframeId: z.string().uuid(),
	dateRange: z.object({
		from: z.string().min(1),
		to: z.string().min(1),
	}),
	recipe: strategyRecipeSchema,
})

// ═══════════════════════════════════════════════════════════════════
// Defaults
// ═══════════════════════════════════════════════════════════════════

const defaultOrbEntryConfig = {
	startTime: 900,
	endTime: 905,
	ticksBuffer: 2,
	ignorarGaps: true,
} as const

const defaultSizingConfig = {
	type: "monetary_risk" as const,
	riskAmountCents: 8000,
	valuePerPointCents: 20,
	riskDistribution: "per_trade" as const,
}

const defaultTargetConfig = {
	type: "fixed_levels" as const,
	levels: [
		{ value: 1, mode: "r_multiple" as const, exitPct: 50, label: "target1" },
		{ value: 2, mode: "r_multiple" as const, exitPct: 100, label: "target2" },
	],
	eodTime: 1730,
}

export {
	orbEntryConfigSchema,
	hawksTripleScreenConfigSchema,
	stopConfigSchema,
	targetConfigSchema,
	sizingConfigSchema,
	reversalConfigSchema,
	strategyRecipeSchema,
	backtestInputSchema,
	defaultOrbEntryConfig,
	defaultSizingConfig,
	defaultTargetConfig,
}
