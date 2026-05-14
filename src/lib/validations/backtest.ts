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
// Hawks Triple-Screen Entry Config
// ═══════════════════════════════════════════════════════════════════

const hawksTripleScreenConfigSchema = z.object({
	ema27_60m_key: z.string().min(1),
	ema55_60m_key: z.string().min(1),
	ema27_15m_key: z.string().min(1),
	macd_key: z.string().min(1),
	startTime: z.number().int().min(800).max(1200),
	endTime: z.number().int().min(800).max(1800),
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
		triggerPct: z.number().min(1).max(100),
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
