import { z } from "zod"
import { decisionTreeConfigSchema } from "./risk-profile"

// ==========================================
// RISK SIMULATION VALIDATION SCHEMAS
// ==========================================

const simpleSimulationParamsSchema = z.object({
	mode: z.literal("simple"),
	accountBalanceCents: z.number().int().positive("validation.riskSimulation.accountBalancePositive"),
	riskPerTradePercent: z.number().min(0.01).max(100),
	dailyLossPercent: z.number().min(0.01).max(100),
	dailyProfitTargetPercent: z.number().min(0.01).max(100).nullable(),
	maxDailyTrades: z.number().int().min(1).max(100).nullable(),
	maxConsecutiveLosses: z.number().int().min(1).max(50).nullable(),
	consecutiveLossScope: z.enum(["global", "daily"]),
	reduceRiskAfterLoss: z.boolean(),
	riskReductionFactor: z.number().min(1).max(100).default(50).transform((v) => v / 100),
	increaseRiskAfterWin: z.boolean(),
	profitReinvestmentPercent: z.number().min(0).max(100).nullable(),
	monthlyLossPercent: z.number().min(0.01).max(100).nullable(),
	weeklyLossPercent: z.number().min(0.01).max(100).nullable(),
})

const advancedSimulationParamsSchema = z.object({
	mode: z.literal("advanced"),
	accountBalanceCents: z.number().int().positive("validation.riskSimulation.accountBalancePositive"),
	decisionTree: decisionTreeConfigSchema,
	dailyLossCents: z.number().int().positive(),
	dailyProfitTargetCents: z.number().int().positive().nullable(),
	weeklyLossCents: z.number().int().positive().nullable(),
	monthlyLossCents: z.number().int().positive(),
})

const riskSimulationParamsSchema = z.discriminatedUnion("mode", [
	simpleSimulationParamsSchema,
	advancedSimulationParamsSchema,
])

const dateRangeSchema = z.object({
	dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.riskSimulation.dateFormat"),
	dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "validation.riskSimulation.dateFormat"),
})

type SimpleSimulationParamsInput = z.infer<typeof simpleSimulationParamsSchema>
type AdvancedSimulationParamsInput = z.infer<typeof advancedSimulationParamsSchema>
type RiskSimulationParamsInput = z.infer<typeof riskSimulationParamsSchema>
type DateRangeInput = z.infer<typeof dateRangeSchema>

export {
	simpleSimulationParamsSchema,
	advancedSimulationParamsSchema,
	riskSimulationParamsSchema,
	dateRangeSchema,
}

export type {
	SimpleSimulationParamsInput,
	AdvancedSimulationParamsInput,
	RiskSimulationParamsInput,
	DateRangeInput,
}
