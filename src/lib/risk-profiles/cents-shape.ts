/**
 * Internal cents-shape mirror of the public R-shape `DecisionTreeConfig`.
 *
 * Phase 4b: the persisted JSON is now in R-multiples. Simulation engines
 * (`risk-simulation-advanced`, `live-trading-status`) continue to think in
 * cents to preserve precision when accumulating per-trade `pnlCents`. This
 * module owns the cents-shape types and the boundary adapter that converts
 * R → cents using `oneRCents` resolved from the active fractal plan.
 */
import type { DecisionTreeConfig, RiskCalculation, GainMode } from "@/types/risk-profile"

type RiskCalculationCents =
	| { type: "percentOfBase"; percent: number }
	| { type: "sameAsPrevious" }
	| { type: "fixedCents"; amountCents: number }

type RiskSizingModeCents =
	| { type: "fixed" }
	| { type: "percentOfBalance"; riskPercent: number }
	| { type: "fixedRatio"; deltaCents: number; baseContractRiskCents: number }
	| { type: "kellyFractional"; divisor: number }

interface LossRecoveryStepCents {
	riskCalculation: RiskCalculationCents
	maxContractsOverride: number | null
}

type GainModeCents =
	| {
			type: "compounding"
			reinvestmentPercent: number
			stopOnFirstLoss: boolean
			dailyTargetCents: number | null
	  }
	| { type: "singleTarget"; dailyTargetCents: number }
	| {
			type: "gainSequence"
			sequence: LossRecoveryStepCents[]
			repeatLastStep: boolean
			stopOnFirstLoss: boolean
			dailyTargetCents: number | null
	  }

interface DecisionTreeCents {
	baseTrade: { riskCents: number; maxContracts: number | null; minStopPoints: number | null }
	lossRecovery: {
		sequence: LossRecoveryStepCents[]
		executeAllRegardless: boolean
		stopAfterSequence: boolean
	}
	gainMode: GainModeCents
	cascadingLimits: {
		weeklyLossCents: number | null
		weeklyAction: "stopTrading" | "reduceRisk"
		monthlyLossCents: number
		monthlyAction: "stopTrading" | "reduceRisk"
	}
	executionConstraints: DecisionTreeConfig["executionConstraints"]
	riskSizing?: RiskSizingModeCents
	limitMode?: "fixedCents" | "percentOfInitial" | "rMultiples"
	drawdownControl?: DecisionTreeConfig["drawdownControl"]
	consecutiveLossRules?: DecisionTreeConfig["consecutiveLossRules"]
	limitsPercent?: DecisionTreeConfig["limitsPercent"]
	limitsR?: DecisionTreeConfig["limitsR"]
}

const adaptCalc = (calc: RiskCalculation, oneRCents: number): RiskCalculationCents => {
	if (calc.type === "fixedR") return { type: "fixedCents", amountCents: Math.round(calc.amountR * oneRCents) }
	return calc
}

const adaptGain = (gain: GainMode, oneRCents: number): GainModeCents => {
	if (gain.type === "singleTarget") {
		return { type: "singleTarget", dailyTargetCents: Math.round(gain.dailyTargetR * oneRCents) }
	}
	if (gain.type === "compounding") {
		return {
			type: "compounding",
			reinvestmentPercent: gain.reinvestmentPercent,
			stopOnFirstLoss: gain.stopOnFirstLoss,
			dailyTargetCents:
				gain.dailyTargetR !== null ? Math.round(gain.dailyTargetR * oneRCents) : null,
		}
	}
	return {
		type: "gainSequence",
		sequence: gain.sequence.map((s) => ({
			riskCalculation: adaptCalc(s.riskCalculation, oneRCents),
			maxContractsOverride: s.maxContractsOverride,
		})),
		repeatLastStep: gain.repeatLastStep,
		stopOnFirstLoss: gain.stopOnFirstLoss,
		dailyTargetCents:
			gain.dailyTargetR !== null ? Math.round(gain.dailyTargetR * oneRCents) : null,
	}
}

const adaptRiskSizing = (
	mode: DecisionTreeConfig["riskSizing"],
	oneRCents: number,
): RiskSizingModeCents | undefined => {
	if (!mode) return undefined
	if (mode.type === "fixedRatio") {
		return {
			type: "fixedRatio",
			deltaCents: Math.round(mode.deltaR * oneRCents),
			baseContractRiskCents: Math.round(mode.baseContractRiskR * oneRCents),
		}
	}
	return mode
}

const adaptDecisionTree = (
	tree: DecisionTreeConfig,
	oneRCents: number,
): DecisionTreeCents => ({
	baseTrade: {
		riskCents: Math.round(tree.baseTrade.riskR * oneRCents),
		maxContracts: tree.baseTrade.maxContracts,
		minStopPoints: tree.baseTrade.minStopPoints,
	},
	lossRecovery: {
		sequence: tree.lossRecovery.sequence.map((s) => ({
			riskCalculation: adaptCalc(s.riskCalculation, oneRCents),
			maxContractsOverride: s.maxContractsOverride,
		})),
		executeAllRegardless: tree.lossRecovery.executeAllRegardless,
		stopAfterSequence: tree.lossRecovery.stopAfterSequence,
	},
	gainMode: adaptGain(tree.gainMode, oneRCents),
	cascadingLimits: {
		weeklyLossCents:
			tree.cascadingLimits.weeklyLossR !== null
				? Math.round(tree.cascadingLimits.weeklyLossR * oneRCents)
				: null,
		weeklyAction: tree.cascadingLimits.weeklyAction,
		monthlyLossCents: Math.round(tree.cascadingLimits.monthlyLossR * oneRCents),
		monthlyAction: tree.cascadingLimits.monthlyAction,
	},
	executionConstraints: tree.executionConstraints,
	riskSizing: adaptRiskSizing(tree.riskSizing, oneRCents),
	limitMode: tree.limitMode,
	drawdownControl: tree.drawdownControl,
	consecutiveLossRules: tree.consecutiveLossRules,
	limitsPercent: tree.limitsPercent,
	limitsR: tree.limitsR,
})

export type {
	RiskCalculationCents,
	LossRecoveryStepCents,
	GainModeCents,
	DecisionTreeCents,
}
export { adaptDecisionTree }
