interface CreateYearlyPlanResult {
	yearlyPlanId: string
	quarterlyPlanIds: readonly string[]
	monthlyPlanIds: readonly string[]
}

export type { CreateYearlyPlanResult }
