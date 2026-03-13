import { z } from "zod"
import { drawdownTierSchema, consecutiveLossRuleSchema } from "@/lib/validations/risk-profile"

/** Maximum allowed total iterations (trades x simulations) */
export const SIMULATION_BUDGET_CAP = 3_000_000

export const simulationParamsSchema = z
	.object({
		winRate: z
			.number()
			.min(1, "validation.monteCarlo.winRateMin")
			.max(99, "validation.monteCarlo.winRateMax"),
		rewardRiskRatio: z
			.number()
			.min(0.1, "validation.monteCarlo.rewardRiskMin")
			.max(20, "validation.monteCarlo.rewardRiskMax"),
		numberOfTrades: z
			.number()
			.int()
			.min(10, "validation.monteCarlo.tradesMin")
			.max(10000, "validation.monteCarlo.tradesMax"),
		commissionImpactR: z
			.number()
			.min(0, "validation.monteCarlo.commissionMin")
			.max(50, "validation.monteCarlo.commissionMax"),
		simulationCount: z
			.number()
			.int()
			.min(100, "validation.monteCarlo.simulationsMin")
			.max(50000, "validation.monteCarlo.simulationsMax"),
	})
	.superRefine((data, ctx) => {
		// Budget cap: trades x simulations must not exceed 3,000,000 total iterations
		const totalIterations = data.numberOfTrades * data.simulationCount
		if (totalIterations > SIMULATION_BUDGET_CAP) {
			const maxTrades = Math.floor(SIMULATION_BUDGET_CAP / data.simulationCount)
			const maxSimulations = Math.floor(SIMULATION_BUDGET_CAP / data.numberOfTrades)
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Total iterations (${totalIterations.toLocaleString()}) exceeds the maximum of ${SIMULATION_BUDGET_CAP.toLocaleString()}. Reduce trades to ${maxTrades.toLocaleString()} or simulations to ${maxSimulations.toLocaleString()}.`,
				path: ["simulationCount"],
			})
		}
	})

export type SimulationParamsInput = z.infer<typeof simulationParamsSchema>

export const dataSourceSchema = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("strategy"),
		strategyId: z.string().uuid("validation.monteCarlo.invalidStrategyId"),
	}),
	z.object({
		type: z.literal("all_strategies"),
	}),
	z.object({
		type: z.literal("universal"),
	}),
])

export type DataSourceInput = z.infer<typeof dataSourceSchema>

export const defaultSimulationParams: SimulationParamsInput = {
	winRate: 55,
	rewardRiskRatio: 1.5,
	numberOfTrades: 100,
	commissionImpactR: 0,
	simulationCount: 1000,
}

// ==========================================
// V2 — DAY-AWARE SIMULATION SCHEMAS
// ==========================================

/** Maximum allowed total iterations for V2: 50 trades/day x days x simulations */
export const V2_SIMULATION_BUDGET_CAP = 10_000_000

const riskManagementProfileForSimSchema = z.object({
	name: z.string(),
	baseRiskCents: z.number().int().positive(),
	rewardRiskRatio: z.number().min(0.1).max(20),
	winRate: z.number().min(1).max(99),
	breakevenRate: z.number().min(0).max(80),
	dailyTargetCents: z.number().int().positive().nullable(),
	dailyLossLimitCents: z.number().int().positive(),
	lossRecoverySteps: z.array(
		z.object({
			riskCents: z.number().int().positive(),
			riskMultiplier: z.number().min(0).default(1),
		})
	).max(10),
	executeAllRegardless: z.boolean(),
	stopAfterSequence: z.boolean(),
	compoundingRiskPercent: z.number().min(0).max(100),
	stopOnFirstLoss: z.boolean(),
	weeklyLossLimitCents: z.number().int().positive().nullable(),
	monthlyLossLimitCents: z.number().int().positive(),
	tradingDaysPerMonth: z.number().int().min(1).max(31),
	tradingDaysPerWeek: z.number().int().min(1).max(7),
	commissionPerTradeCents: z.number().min(0),

	// Dynamic risk sizing
	riskSizingMode: z.enum(["fixed", "percentOfBalance", "fixedRatio", "kellyFractional"]).default("fixed"),
	riskPercent: z.number().min(0.1).max(10).nullable().default(null),
	fixedRatioDeltaCents: z.number().int().positive().nullable().default(null),
	fixedRatioBaseContractRiskCents: z.number().int().positive().nullable().default(null),
	kellyDivisor: z.number().min(1).max(10).nullable().default(null),

	// Limit mode
	limitMode: z.enum(["fixedCents", "percentOfInitial", "rMultiples"]).default("fixedCents"),
	dailyLossPercent: z.number().min(0.1).max(100).nullable().default(null),
	weeklyLossPercent: z.number().min(0.1).max(100).nullable().default(null),
	monthlyLossPercent: z.number().min(0.1).max(100).nullable().default(null),
	dailyLossR: z.number().min(0.1).max(100).nullable().default(null),
	weeklyLossR: z.number().min(0.1).max(100).nullable().default(null),
	monthlyLossR: z.number().min(0.1).max(100).nullable().default(null),

	// Drawdown control
	drawdownTiers: z.array(drawdownTierSchema).max(5).default([]),
	drawdownRecoveryPercent: z.number().min(0).max(100).default(50),

	// Consecutive loss rules
	consecutiveLossRules: z.array(consecutiveLossRuleSchema).max(5).default([]),
})

export const simulationParamsV2Schema = z
	.object({
		profile: riskManagementProfileForSimSchema,
		simulationCount: z.number().int().min(100).max(50000),
		initialBalance: z.number().int().positive(),
		monthsToTrade: z.number().int().min(1).max(48),
		ruinThresholdPercent: z.number().min(1).max(99).default(50),
	})
	.superRefine((data, ctx) => {
		// Budget cap: ~50 trades/day x days/month x months x simulations
		const maxTradesPerDay = 50
		const totalIterations =
			maxTradesPerDay *
			data.profile.tradingDaysPerMonth *
			data.monthsToTrade *
			data.simulationCount
		if (totalIterations > V2_SIMULATION_BUDGET_CAP) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Estimated iterations (${totalIterations.toLocaleString()}) exceeds the cap of ${V2_SIMULATION_BUDGET_CAP.toLocaleString()}. Reduce simulations, trading days, or months.`,
				path: ["simulationCount"],
			})
		}
	})

export type SimulationParamsV2Input = z.infer<typeof simulationParamsV2Schema>
