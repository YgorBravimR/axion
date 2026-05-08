import type { RiskManagementProfile } from "@/types/risk-profile"
import type { RiskManagementProfileForSim } from "@/types/monte-carlo"
import { DEFAULT_TRADING_DAYS_PER_MONTH } from "@/lib/fractal-plan/month-labels"

/**
 * Converts a risk management profile (R-shape) into a flat simulation config (cents).
 * Pure function — caller must supply `oneRCents` plus the per-period caps that
 * historically lived on the profile but now live on the fractal plan.
 */
export const buildProfileForSim = (
	profile: RiskManagementProfile,
	overrides: {
		winRate: number
		rewardRiskRatio: number
		oneRCents: number
		dailyLossCents: number
		weeklyLossCents: number | null
		monthlyLossCents: number
		dailyProfitTargetCents?: number | null
		breakevenRate?: number
		commissionPerTradeCents?: number
		tradingDaysPerMonth?: number
		tradingDaysPerWeek?: number
	}
): RiskManagementProfileForSim => {
	const tree = profile.decisionTree
	const oneRCents = overrides.oneRCents

	const baseRiskCents = Math.round(tree.baseTrade.riskR * oneRCents)
	const lossRecoverySteps = tree.lossRecovery.sequence.reduce<
		Array<{ riskCents: number; riskMultiplier: number }>
	>((acc, step) => {
		let riskCents: number
		const previousRisk =
			acc.length > 0 ? acc[acc.length - 1]!.riskCents : baseRiskCents

		switch (step.riskCalculation.type) {
			case "percentOfBase":
				riskCents = Math.round(
					(baseRiskCents * step.riskCalculation.percent) / 100
				)
				break
			case "sameAsPrevious":
				riskCents = previousRisk
				break
			case "fixedR":
				riskCents = Math.round(step.riskCalculation.amountR * oneRCents)
				break
		}

		const riskMultiplier = baseRiskCents > 0 ? riskCents / baseRiskCents : 1
		acc.push({ riskCents, riskMultiplier })
		return acc
	}, [])

	const compoundingRiskPercent =
		tree.gainMode.type === "compounding" ? tree.gainMode.reinvestmentPercent : 0

	const stopOnFirstLoss =
		tree.gainMode.type === "compounding" ||
		tree.gainMode.type === "gainSequence"
			? tree.gainMode.stopOnFirstLoss
			: true

	const gainTargetR =
		tree.gainMode.type === "singleTarget"
			? tree.gainMode.dailyTargetR
			: tree.gainMode.dailyTargetR
	const dailyTargetCents =
		gainTargetR !== null && gainTargetR !== undefined
			? Math.round(gainTargetR * oneRCents)
			: (overrides.dailyProfitTargetCents ?? null)

	const riskSizing = tree.riskSizing ?? { type: "fixed" as const }
	const limitMode = tree.limitMode ?? "rMultiples"

	const riskSizingMode = riskSizing.type
	const riskPercent =
		riskSizing.type === "percentOfBalance" ? riskSizing.riskPercent : null
	const fixedRatioDeltaCents =
		riskSizing.type === "fixedRatio"
			? Math.round(riskSizing.deltaR * oneRCents)
			: null
	const fixedRatioBaseContractRiskCents =
		riskSizing.type === "fixedRatio"
			? Math.round(riskSizing.baseContractRiskR * oneRCents)
			: null
	const kellyDivisor =
		riskSizing.type === "kellyFractional" ? riskSizing.divisor : null

	const drawdownTiers = tree.drawdownControl?.tiers ?? []
	const drawdownRecoveryPercent =
		tree.drawdownControl?.recoveryThresholdPercent ?? 50
	const consecutiveLossRules = tree.consecutiveLossRules ?? []

	return {
		name: profile.name,
		baseRiskCents,
		rewardRiskRatio: overrides.rewardRiskRatio,
		winRate: overrides.winRate,
		breakevenRate: overrides.breakevenRate ?? 0,
		dailyTargetCents,
		dailyLossLimitCents: overrides.dailyLossCents,
		lossRecoverySteps,
		executeAllRegardless: tree.lossRecovery.executeAllRegardless,
		stopAfterSequence: tree.lossRecovery.stopAfterSequence,
		compoundingRiskPercent,
		stopOnFirstLoss,
		weeklyLossLimitCents: overrides.weeklyLossCents,
		monthlyLossLimitCents: overrides.monthlyLossCents,
		tradingDaysPerMonth:
			overrides.tradingDaysPerMonth ?? DEFAULT_TRADING_DAYS_PER_MONTH,
		tradingDaysPerWeek: overrides.tradingDaysPerWeek ?? 5,
		commissionPerTradeCents: overrides.commissionPerTradeCents ?? 0,

		riskSizingMode,
		riskPercent,
		fixedRatioDeltaCents,
		fixedRatioBaseContractRiskCents,
		kellyDivisor,

		limitMode,
		dailyLossPercent: tree.limitsPercent?.daily ?? null,
		weeklyLossPercent: tree.limitsPercent?.weekly ?? null,
		monthlyLossPercent: tree.limitsPercent?.monthly ?? null,
		dailyLossR: tree.limitsR?.daily ?? null,
		weeklyLossR: tree.limitsR?.weekly ?? null,
		monthlyLossR: tree.limitsR?.monthly ?? null,

		drawdownTiers,
		drawdownRecoveryPercent,

		consecutiveLossRules,
	}
}
