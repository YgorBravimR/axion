import { z } from "zod"

/**
 * Validation schema for monthly plan upsert.
 * All money amounts are in cents (integers). Percentages are decimal numbers (e.g. 1.00 = 1%).
 */
export const monthlyPlanSchema = z.object({
	year: z.coerce.number().int().min(2020).max(2100),
	month: z.coerce.number().int().min(1).max(12),

	// Required fields
	accountBalance: z.coerce
		.number()
		.int("validation.monthlyPlan.accountBalanceCents")
		.positive("validation.monthlyPlan.accountBalancePositive")
		.max(100_000_000_00, "validation.monthlyPlan.accountBalanceMax"), // 100M in cents
	riskPerTradePercent: z.coerce
		.number()
		.positive("validation.monthlyPlan.riskPerTradePositive")
		.max(100, "validation.monthlyPlan.riskPerTradeMax"),
	dailyLossPercent: z.coerce
		.number()
		.positive("validation.monthlyPlan.dailyLossPositive")
		.max(100, "validation.monthlyPlan.dailyLossMax"),
	monthlyLossPercent: z.coerce
		.number()
		.positive("validation.monthlyPlan.monthlyLossPositive")
		.max(100, "validation.monthlyPlan.monthlyLossMax"),

	// Optional fields
	dailyProfitTargetPercent: z.coerce
		.number()
		.positive("validation.monthlyPlan.profitTargetPositive")
		.max(1000, "validation.monthlyPlan.profitTargetMax")
		.optional()
		.nullable(),
	maxDailyTrades: z.coerce
		.number()
		.int("validation.monthlyPlan.maxDailyTradesInteger")
		.positive("validation.monthlyPlan.maxDailyTradesPositive")
		.max(1000, "validation.monthlyPlan.maxDailyTradesMax")
		.optional()
		.nullable(),
	maxConsecutiveLosses: z.coerce
		.number()
		.int("validation.monthlyPlan.maxConsecutiveLossesInteger")
		.positive("validation.monthlyPlan.maxConsecutiveLossesPositive")
		.max(100, "validation.monthlyPlan.maxConsecutiveLossesMax")
		.optional()
		.nullable(),
	allowSecondOpAfterLoss: z.boolean().default(true),
	reduceRiskAfterLoss: z.boolean().default(false),
	riskReductionFactor: z.coerce
		.number()
		.positive("validation.monthlyPlan.riskReductionPositive")
		.max(1, "validation.monthlyPlan.riskReductionMax")
		.optional()
		.nullable(),
	increaseRiskAfterWin: z.boolean().default(false),
	capRiskAfterWin: z.boolean().default(false),
	profitReinvestmentPercent: z.coerce
		.number()
		.positive("validation.monthlyPlan.profitReinvestmentPositive")
		.max(100, "validation.monthlyPlan.profitReinvestmentMax")
		.optional()
		.nullable(),
	notes: z
		.string()
		.max(5000, "validation.monthlyPlan.notesMax")
		.optional()
		.nullable(),

	// Risk profile reference (optional — when set, profile's decision tree governs behavior)
	riskProfileId: z.string().uuid("validation.monthlyPlan.invalidRiskProfileId").optional().nullable(),

	// Weekly loss limit (optional, independent of risk profile)
	weeklyLossPercent: z.coerce
		.number()
		.positive("validation.monthlyPlan.weeklyLossPositive")
		.max(100, "validation.monthlyPlan.weeklyLossMax")
		.optional()
		.nullable(),
}).refine(
	(data) => !(data.increaseRiskAfterWin && data.capRiskAfterWin),
	{ message: "validation.monthlyPlan.mutuallyExclusive", path: ["capRiskAfterWin"] }
)

export type MonthlyPlanInput = z.infer<typeof monthlyPlanSchema>

/**
 * Schema for rollover — only requires optional adjusted balance.
 */
export const rolloverMonthlyPlanSchema = z.object({
	adjustedBalance: z.coerce
		.number()
		.int("validation.monthlyPlan.rolloverBalanceCents")
		.positive("validation.monthlyPlan.rolloverBalancePositive")
		.max(100_000_000_00, "validation.monthlyPlan.rolloverBalanceMax")
		.optional()
		.nullable(),
})

export type RolloverMonthlyPlanInput = z.infer<typeof rolloverMonthlyPlanSchema>
