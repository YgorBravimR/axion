import { db } from "@/db/drizzle"
import { yearlyPlans, quarterlyPlan, monthlyPlan, weeklyPlan } from "@/db/schema"
import type { LadderRuleR } from "./capital-ladder"
import { resolveTier } from "./capital-ladder"
import { getWeeksInYear } from "@/lib/calendar/iso-week"

interface AutoSeedInput {
	readonly accountId: string
	readonly year: number
	readonly initialCapitalCents: number
	readonly ladderRules: readonly LadderRuleR[]
	readonly defaultDailyLossR: number
	readonly defaultWeeklyLossR: number
	readonly defaultMonthlyLossR: number
	readonly defaultDailyTargetR: number
	readonly drawdownTriggerThresholdR: number
	readonly tradingDaysPerWeek: number
	readonly annualGoalCents?: number
	readonly now: Date
}

interface AutoSeedResult {
	readonly yearlyPlanId: string
	readonly quarterlyPlanIds: readonly string[]
	readonly monthlyPlanIds: readonly string[]
}

const autoSeedYearlyTree = async (input: AutoSeedInput): Promise<AutoSeedResult> => {
	const { tierIndex, oneRCents } = resolveTier(input.initialCapitalCents, input.ladderRules)

	return await db.transaction(async (tx) => {
		const [yearRow] = await tx
			.insert(yearlyPlans)
			.values({
				accountId: input.accountId,
				year: input.year,
				initialCapitalCents: input.initialCapitalCents,
				ladderRules: input.ladderRules as never,
				tradingDaysPerWeek: input.tradingDaysPerWeek,
			})
			.returning({ id: yearlyPlans.id })

		const quarters = await tx
			.insert(quarterlyPlan)
			.values(
				[1, 2, 3, 4].map((q) => ({
					yearlyPlanId: yearRow.id,
					quarter: q,
				})),
			)
			.returning({ id: quarterlyPlan.id })

		const monthsByQuarter: { quarterlyPlanId: string; year: number; month: number }[] = []
		for (let m = 1; m <= 12; m++) {
			const q = Math.ceil(m / 3) - 1
			monthsByQuarter.push({
				quarterlyPlanId: quarters[q].id,
				year: input.year,
				month: m,
			})
		}

		const months = await tx
			.insert(monthlyPlan)
			.values(
				monthsByQuarter.map((m) => ({
					quarterlyPlanId: m.quarterlyPlanId,
					year: m.year,
					month: m.month,
					snapshotCapitalCents: input.initialCapitalCents,
					snapshotOneRCents: oneRCents,
					snapshotTierIndex: tierIndex,
					snapshotComputedAt: input.now,
					snapshotReason: "month_start" as const,
				})),
			)
			.returning({ id: monthlyPlan.id, month: monthlyPlan.month })

		const totalIsoWeeks = getWeeksInYear(input.year)
		const weeklyRows: { monthlyPlanId: string; isoWeek: number; isoYear: number }[] = []
		for (let w = 1; w <= totalIsoWeeks; w++) {
			// Map ISO week → calendar month using mid-week (Wednesday) for stable assignment.
			const midWeekDate = new Date(input.year, 0, 1 + (w - 1) * 7 + 3)
			const month = midWeekDate.getMonth() + 1
			const monthRow = months.find((row) => row.month === month)
			if (monthRow) {
				weeklyRows.push({
					monthlyPlanId: monthRow.id,
					isoWeek: w,
					isoYear: input.year,
				})
			}
		}
		if (weeklyRows.length > 0) {
			await tx.insert(weeklyPlan).values(weeklyRows).returning()
		}

		return {
			yearlyPlanId: yearRow.id,
			quarterlyPlanIds: quarters.map((q) => q.id),
			monthlyPlanIds: months.map((m) => m.id),
		}
	})
}

export type { AutoSeedInput, AutoSeedResult }
export { autoSeedYearlyTree }
