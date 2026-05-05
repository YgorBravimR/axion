import type { DecisionTreeConfig } from "@/types/risk-profile"

// ==========================================
// RISK PROFILE TEMPLATES
// ==========================================

/**
 * A code-defined template for pre-filling the risk profile creation form.
 * Users select a template, customize values, then save as a real profile.
 *
 * Phase 4b: templates are R-shape only. Caps live on the fractal plan; the
 * profile owns the decision tree.
 */
interface RiskProfileTemplate {
	id: string
	nameKey: string
	descriptionKey: string
	author: string
	category: "sizing" | "drawdown" | "r-based" | "kelly"
	defaults: {
		decisionTree: DecisionTreeConfig
	}
}

const RISK_PROFILE_TEMPLATES: RiskProfileTemplate[] = [
	// Template 1: Fixed Fractional (Van Tharp)
	{
		id: "fixed-fractional",
		nameKey: "fixedFractional.name",
		descriptionKey: "fixedFractional.description",
		author: "Van Tharp",
		category: "sizing",
		defaults: {
			decisionTree: {
				baseTrade: {
					riskR: 1,
					maxContracts: null,
					minStopPoints: null,
				},
				lossRecovery: {
					sequence: [
						{ riskCalculation: { type: "percentOfBase", percent: 50 }, maxContractsOverride: null },
					],
					executeAllRegardless: false,
					stopAfterSequence: true,
				},
				gainMode: {
					type: "singleTarget",
					dailyTargetR: 6,
				},
				cascadingLimits: {
					weeklyLossR: 5,
					weeklyAction: "stopTrading",
					monthlyLossR: 10,
					monthlyAction: "stopTrading",
				},
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				riskSizing: { type: "percentOfBalance", riskPercent: 0.75 },
				limitMode: "percentOfInitial",
				limitsPercent: { daily: 2, weekly: 5, monthly: 10 },
				drawdownControl: {
					tiers: [
						{ drawdownPercent: 10, action: "reduceRisk", reducePercent: 50 },
					],
					recoveryThresholdPercent: 50,
				},
				consecutiveLossRules: [
					{ consecutiveDays: 3, action: "reduceRisk", reducePercent: 50 },
					{ consecutiveDays: 5, action: "stopDay", reducePercent: 0 },
				],
			},
		},
	},

	// Template 2: Fixed Ratio (Ralph Vince)
	{
		id: "fixed-ratio",
		nameKey: "fixedRatio.name",
		descriptionKey: "fixedRatio.description",
		author: "Ralph Vince",
		category: "sizing",
		defaults: {
			decisionTree: {
				baseTrade: {
					riskR: 1,
					maxContracts: null,
					minStopPoints: null,
				},
				lossRecovery: {
					sequence: [
						{ riskCalculation: { type: "percentOfBase", percent: 75 }, maxContractsOverride: null },
						{ riskCalculation: { type: "percentOfBase", percent: 50 }, maxContractsOverride: null },
					],
					executeAllRegardless: false,
					stopAfterSequence: false,
				},
				gainMode: {
					type: "compounding",
					reinvestmentPercent: 30,
					stopOnFirstLoss: true,
					dailyTargetR: null,
				},
				cascadingLimits: {
					weeklyLossR: 6,
					weeklyAction: "stopTrading",
					monthlyLossR: 12,
					monthlyAction: "stopTrading",
				},
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				riskSizing: { type: "fixedRatio", deltaR: 10, baseContractRiskR: 1 },
				limitMode: "rMultiples",
				limitsR: { daily: 3, weekly: 6, monthly: 12 },
				consecutiveLossRules: [
					{ consecutiveDays: 2, action: "reduceRisk", reducePercent: 33 },
					{ consecutiveDays: 4, action: "reduceRisk", reducePercent: 75 },
				],
			},
		},
	},

	// Template 3: Institutional (CTA/Quant Funds)
	{
		id: "institutional",
		nameKey: "institutional.name",
		descriptionKey: "institutional.description",
		author: "CTA/Quant Funds",
		category: "drawdown",
		defaults: {
			decisionTree: {
				baseTrade: {
					riskR: 1,
					maxContracts: null,
					minStopPoints: null,
				},
				lossRecovery: {
					sequence: [
						{ riskCalculation: { type: "percentOfBase", percent: 50 }, maxContractsOverride: null },
					],
					executeAllRegardless: false,
					stopAfterSequence: true,
				},
				gainMode: {
					type: "singleTarget",
					dailyTargetR: 2,
				},
				cascadingLimits: {
					weeklyLossR: 4,
					weeklyAction: "stopTrading",
					monthlyLossR: 8,
					monthlyAction: "stopTrading",
				},
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				riskSizing: { type: "percentOfBalance", riskPercent: 0.5 },
				limitMode: "percentOfInitial",
				limitsPercent: { daily: 1.5, weekly: 4, monthly: 8 },
				drawdownControl: {
					tiers: [
						{ drawdownPercent: 5, action: "reduceRisk", reducePercent: 25 },
						{ drawdownPercent: 8, action: "reduceRisk", reducePercent: 50 },
						{ drawdownPercent: 12, action: "pause", reducePercent: 0 },
					],
					recoveryThresholdPercent: 50,
				},
			},
		},
	},

	// Template 4: R-Multiples (Van Tharp / Larry Williams)
	{
		id: "r-multiples",
		nameKey: "rMultiples.name",
		descriptionKey: "rMultiples.description",
		author: "Van Tharp / Larry Williams",
		category: "r-based",
		defaults: {
			decisionTree: {
				baseTrade: {
					riskR: 1,
					maxContracts: null,
					minStopPoints: null,
				},
				lossRecovery: {
					sequence: [
						{ riskCalculation: { type: "sameAsPrevious" }, maxContractsOverride: null },
						{ riskCalculation: { type: "percentOfBase", percent: 75 }, maxContractsOverride: null },
					],
					executeAllRegardless: false,
					stopAfterSequence: false,
				},
				gainMode: {
					type: "singleTarget",
					dailyTargetR: 4,
				},
				cascadingLimits: {
					weeklyLossR: 5,
					weeklyAction: "stopTrading",
					monthlyLossR: 10,
					monthlyAction: "stopTrading",
				},
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				riskSizing: { type: "fixed" },
				limitMode: "rMultiples",
				limitsR: { daily: 3, weekly: 5, monthly: 10 },
			},
		},
	},

	// Template 5: Kelly Fractional (Kelly / Shannon)
	{
		id: "kelly-fractional",
		nameKey: "kellyFractional.name",
		descriptionKey: "kellyFractional.description",
		author: "Kelly / Shannon",
		category: "kelly",
		defaults: {
			decisionTree: {
				baseTrade: {
					riskR: 1,
					maxContracts: null,
					minStopPoints: null,
				},
				lossRecovery: {
					sequence: [
						{ riskCalculation: { type: "percentOfBase", percent: 50 }, maxContractsOverride: null },
					],
					executeAllRegardless: false,
					stopAfterSequence: true,
				},
				gainMode: {
					type: "compounding",
					reinvestmentPercent: 25,
					stopOnFirstLoss: true,
					dailyTargetR: null,
				},
				cascadingLimits: {
					weeklyLossR: 7,
					weeklyAction: "stopTrading",
					monthlyLossR: 15,
					monthlyAction: "stopTrading",
				},
				executionConstraints: {
					minStopPoints: null,
					maxContracts: null,
					operatingHoursStart: null,
					operatingHoursEnd: null,
				},
				riskSizing: { type: "kellyFractional", divisor: 4 },
				limitMode: "percentOfInitial",
				limitsPercent: { daily: 3, weekly: 7, monthly: 15 },
				drawdownControl: {
					tiers: [
						{ drawdownPercent: 10, action: "reduceRisk", reducePercent: 50 },
						{ drawdownPercent: 15, action: "pause", reducePercent: 0 },
					],
					recoveryThresholdPercent: 50,
				},
			},
		},
	},
]

export { RISK_PROFILE_TEMPLATES }
export type { RiskProfileTemplate }
