import type { RiskManagementProfile } from "@/types/risk-profile"
import type { RiskManagementProfileForSim } from "@/types/monte-carlo"

/**
 * Converts a risk management profile into a flat simulation config.
 * Pre-computes absolute risk amounts for each loss recovery step.
 *
 * This is a pure function (no DB access) so it can be used both server-side
 * and client-side.
 */
export const buildProfileForSim = (
	profile: RiskManagementProfile,
	overrides: {
		winRate: number
		rewardRiskRatio: number
		breakevenRate?: number
		commissionPerTradeCents?: number
		tradingDaysPerMonth?: number
		tradingDaysPerWeek?: number
	}
): RiskManagementProfileForSim => {
	const tree = profile.decisionTree

	// Pre-compute loss recovery step risk amounts in absolute cents.
	// Uses reduce to track previous step's risk for "sameAsPrevious" resolution.
	// Also computes riskMultiplier (relative to base) for dynamic sizing modes.
	const baseRiskCents = tree.baseTrade.riskCents
	const lossRecoverySteps = tree.lossRecovery.sequence.reduce<
		Array<{ riskCents: number; riskMultiplier: number }>
	>((acc, step) => {
		let riskCents: number
		const previousRisk = acc.length > 0
			? acc[acc.length - 1].riskCents
			: baseRiskCents

		switch (step.riskCalculation.type) {
			case "percentOfBase":
				riskCents = Math.round(baseRiskCents * step.riskCalculation.percent / 100)
				break
			case "sameAsPrevious":
				riskCents = previousRisk
				break
			case "fixedCents":
				riskCents = step.riskCalculation.amountCents
				break
		}

		const riskMultiplier = baseRiskCents > 0 ? riskCents / baseRiskCents : 1
		acc.push({ riskCents, riskMultiplier })
		return acc
	}, [])

	const compoundingRiskPercent = tree.gainMode.type === "compounding"
		? tree.gainMode.reinvestmentPercent
		: 0

	const stopOnFirstLoss = (tree.gainMode.type === "compounding" || tree.gainMode.type === "gainSequence")
		? tree.gainMode.stopOnFirstLoss
		: true

	const dailyTargetCents = tree.gainMode.dailyTargetCents ?? profile.dailyProfitTargetCents

	// Read dynamic risk sizing fields (all optional on tree, defaults for backward compat)
	const riskSizing = tree.riskSizing ?? { type: "fixed" as const }
	const limitMode = tree.limitMode ?? "fixedCents"

	const riskSizingMode = riskSizing.type
	const riskPercent = riskSizing.type === "percentOfBalance" ? riskSizing.riskPercent : null
	const fixedRatioDeltaCents = riskSizing.type === "fixedRatio" ? riskSizing.deltaCents : null
	const fixedRatioBaseContractRiskCents = riskSizing.type === "fixedRatio" ? riskSizing.baseContractRiskCents : null
	const kellyDivisor = riskSizing.type === "kellyFractional" ? riskSizing.divisor : null

	const drawdownTiers = tree.drawdownControl?.tiers ?? []
	const drawdownRecoveryPercent = tree.drawdownControl?.recoveryThresholdPercent ?? 50
	const consecutiveLossRules = tree.consecutiveLossRules ?? []

	return {
		name: profile.name,
		baseRiskCents,
		rewardRiskRatio: overrides.rewardRiskRatio,
		winRate: overrides.winRate,
		breakevenRate: overrides.breakevenRate ?? 0,
		dailyTargetCents: dailyTargetCents ?? null,
		dailyLossLimitCents: profile.dailyLossCents,
		lossRecoverySteps,
		executeAllRegardless: tree.lossRecovery.executeAllRegardless,
		stopAfterSequence: tree.lossRecovery.stopAfterSequence,
		compoundingRiskPercent,
		stopOnFirstLoss,
		weeklyLossLimitCents: profile.weeklyLossCents,
		monthlyLossLimitCents: profile.monthlyLossCents,
		tradingDaysPerMonth: overrides.tradingDaysPerMonth ?? 22,
		tradingDaysPerWeek: overrides.tradingDaysPerWeek ?? 5,
		commissionPerTradeCents: overrides.commissionPerTradeCents ?? 0,

		// Dynamic risk sizing
		riskSizingMode,
		riskPercent,
		fixedRatioDeltaCents,
		fixedRatioBaseContractRiskCents,
		kellyDivisor,

		// Limit mode
		limitMode,
		dailyLossPercent: tree.limitsPercent?.daily ?? null,
		weeklyLossPercent: tree.limitsPercent?.weekly ?? null,
		monthlyLossPercent: tree.limitsPercent?.monthly ?? null,
		dailyLossR: tree.limitsR?.daily ?? null,
		weeklyLossR: tree.limitsR?.weekly ?? null,
		monthlyLossR: tree.limitsR?.monthly ?? null,

		// Drawdown control
		drawdownTiers,
		drawdownRecoveryPercent,

		// Consecutive loss rules
		consecutiveLossRules,
	}
}
