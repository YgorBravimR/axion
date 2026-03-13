import { z } from "zod"

// ==========================================
// RISK PROFILE VALIDATION SCHEMAS
// ==========================================

/**
 * Discriminated union for how risk is calculated at each loss recovery step.
 */
const riskCalculationSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("percentOfBase"),
		percent: z.number().min(1).max(200),
	}),
	z.object({
		type: z.literal("sameAsPrevious"),
	}),
	z.object({
		type: z.literal("fixedCents"),
		amountCents: z.number().int().positive(),
	}),
])

const lossRecoveryStepSchema = z.object({
	riskCalculation: riskCalculationSchema,
	maxContractsOverride: z.number().int().positive().nullable(),
})

/**
 * Discriminated union for gain mode after a winning first trade.
 */
const gainModeSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("compounding"),
		reinvestmentPercent: z.number().min(0).max(100),
		stopOnFirstLoss: z.boolean(),
		dailyTargetCents: z.number().int().positive().nullable(),
	}),
	z.object({
		type: z.literal("singleTarget"),
		dailyTargetCents: z.number().int().positive(),
	}),
	z.object({
		type: z.literal("gainSequence"),
		sequence: z.array(lossRecoveryStepSchema).max(10, "validation.riskProfile.maxGainSteps"),
		repeatLastStep: z.boolean(),
		stopOnFirstLoss: z.boolean(),
		dailyTargetCents: z.number().int().positive().nullable(),
	}),
])

// ==========================================
// DYNAMIC RISK SIZING SCHEMAS (Phase 2)
// ==========================================

const riskSizingModeSchema = z.discriminatedUnion("type", [
	z.object({ type: z.literal("fixed") }),
	z.object({
		type: z.literal("percentOfBalance"),
		riskPercent: z.number().min(0.1).max(10),
	}),
	z.object({
		type: z.literal("fixedRatio"),
		deltaCents: z.number().int().positive(),
		baseContractRiskCents: z.number().int().positive(),
	}),
	z.object({
		type: z.literal("kellyFractional"),
		divisor: z.number().min(1).max(10),
	}),
])

const drawdownTierSchema = z.object({
	drawdownPercent: z.number().min(1).max(99),
	action: z.enum(["reduceRisk", "pause"]),
	reducePercent: z.number().min(0).max(100),
})

const consecutiveLossRuleSchema = z.object({
	consecutiveDays: z.number().int().min(1).max(20),
	action: z.enum(["reduceRisk", "stopDay", "pauseWeek"]),
	reducePercent: z.number().min(0).max(100),
})

const limitModeSchema = z.enum(["fixedCents", "percentOfInitial", "rMultiples"])

const limitsPercentSchema = z.object({
	daily: z.number().min(0.1).max(100),
	weekly: z.number().min(0.1).max(100).nullable(),
	monthly: z.number().min(0.1).max(100),
})

const limitsRSchema = z.object({
	daily: z.number().min(0.1).max(100),
	weekly: z.number().min(0.1).max(100).nullable(),
	monthly: z.number().min(0.1).max(100),
})

/**
 * Full decision tree configuration schema.
 * Validated when creating/updating a risk management profile.
 * All Phase 2 fields are optional for backward compatibility.
 */
const decisionTreeConfigSchema = z.object({
	baseTrade: z.object({
		riskCents: z.number().int().positive("validation.riskProfile.baseRiskPositive"),
		maxContracts: z.number().int().positive().nullable(),
		minStopPoints: z.number().int().positive().nullable(),
	}),
	lossRecovery: z.object({
		sequence: z.array(lossRecoveryStepSchema).max(10, "validation.riskProfile.maxRecoverySteps"),
		executeAllRegardless: z.boolean(),
		stopAfterSequence: z.boolean(),
	}),
	gainMode: gainModeSchema,
	cascadingLimits: z.object({
		weeklyLossCents: z.number().int().positive().nullable(),
		weeklyAction: z.enum(["stopTrading", "reduceRisk"]),
		monthlyLossCents: z.number().int().positive(),
		monthlyAction: z.enum(["stopTrading", "reduceRisk"]),
	}),
	executionConstraints: z.object({
		minStopPoints: z.number().int().positive().nullable(),
		maxContracts: z.number().int().positive().nullable(),
		operatingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
		operatingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
	}),
	// Dynamic risk sizing (optional — backward compatible)
	riskSizing: riskSizingModeSchema.optional(),
	limitMode: limitModeSchema.optional(),
	drawdownControl: z.object({
		tiers: z.array(drawdownTierSchema).max(5),
		recoveryThresholdPercent: z.number().min(0).max(100),
	}).optional(),
	consecutiveLossRules: z.array(consecutiveLossRuleSchema).max(5).optional(),
	limitsPercent: limitsPercentSchema.optional(),
	limitsR: limitsRSchema.optional(),
})

/**
 * Schema for creating or updating a risk management profile.
 */
const riskProfileSchema = z.object({
	name: z.string().min(1, "validation.riskProfile.nameRequired").max(100, "validation.riskProfile.nameMax"),
	description: z.string().max(2000, "validation.riskProfile.descriptionMax").optional().nullable(),
	baseRiskCents: z.number().int().positive("validation.riskProfile.baseRiskPositive"),
	dailyLossCents: z.number().int().positive("validation.riskProfile.dailyLossPositive"),
	weeklyLossCents: z.number().int().positive("validation.riskProfile.weeklyLossPositive").optional().nullable(),
	monthlyLossCents: z.number().int().positive("validation.riskProfile.monthlyLossPositive"),
	dailyProfitTargetCents: z.number().int().positive("validation.riskProfile.dailyProfitTargetPositive").optional().nullable(),
	decisionTree: decisionTreeConfigSchema,
})

type RiskProfileSchemaInput = z.infer<typeof riskProfileSchema>
type DecisionTreeConfigInput = z.infer<typeof decisionTreeConfigSchema>

export {
	riskProfileSchema,
	decisionTreeConfigSchema,
	riskCalculationSchema,
	gainModeSchema,
	riskSizingModeSchema,
	drawdownTierSchema,
	consecutiveLossRuleSchema,
}

export type { RiskProfileSchemaInput, DecisionTreeConfigInput }
