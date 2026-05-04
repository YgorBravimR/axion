import type { YearlyPlan, WeeklyTarget } from "@/db/schema"

interface YearlyPlanWithWeeks {
	plan: YearlyPlan
	weeklyTargets: WeeklyTarget[]
}

export type { YearlyPlanWithWeeks }
