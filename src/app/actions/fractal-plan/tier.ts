"use server"

import { z } from "zod"
import { requireAuth } from "@/app/actions/auth"
import { db } from "@/db/drizzle"
import { yearlyPlans, monthlyPlan, tierChangeLog } from "@/db/schema"
import { and, eq } from "drizzle-orm"
import { evaluateMonthStart } from "@/lib/fractal-plan/tier-eval"
import { toSafeErrorMessage } from "@/lib/error-utils"
import type { ActionResponse } from "@/types"
import type { LadderRuleR } from "@/lib/fractal-plan/capital-ladder"

const inputSchema = z.object({
	asOf: z.coerce.date(),
})

interface ForceTierReevalResult {
	newTierIndex: number
	newOneRCents: number
	wrote: boolean
}

export const forceTierReeval = async (
	input: z.infer<typeof inputSchema>
): Promise<ActionResponse<ForceTierReevalResult>> => {
	try {
		const { accountId } = await requireAuth()
		const { asOf } = inputSchema.parse(input)
		const year = asOf.getFullYear()
		const month = asOf.getMonth() + 1

		const yearly = await db.query.yearlyPlans.findFirst({
			where: and(
				eq(yearlyPlans.accountId, accountId),
				eq(yearlyPlans.year, year)
			),
		})

		if (!yearly) {
			return {
				status: "error",
				message: "No yearly plan for the requested year",
				errors: [{ code: "NO_YEARLY_PLAN", detail: `year=${year}` }],
			}
		}

		const monthly = await db.query.monthlyPlan.findFirst({
			where: and(eq(monthlyPlan.year, year), eq(monthlyPlan.month, month)),
		})

		if (!monthly) {
			return {
				status: "error",
				message: "No monthly plan for the requested month",
				errors: [
					{ code: "NO_MONTHLY_PLAN", detail: `year=${year} month=${month}` },
				],
			}
		}

		const ladderRules = yearly.ladderRules as unknown as LadderRuleR[]
		const newSnapshot = evaluateMonthStart({
			capitalCents: monthly.snapshotCapitalCents,
			ladderRules,
			now: asOf,
		})

		const changed = newSnapshot.snapshotTierIndex !== monthly.snapshotTierIndex

		let wrote = false
		if (changed) {
			await db.insert(tierChangeLog).values({
				accountId,
				monthlyPlanId: monthly.id,
				fromTierIndex: monthly.snapshotTierIndex,
				toTierIndex: newSnapshot.snapshotTierIndex,
				fromOneRCents: monthly.snapshotOneRCents,
				toOneRCents: newSnapshot.snapshotOneRCents,
				triggerReason: "manual",
				triggeredAt: asOf,
			})
			wrote = true
		}

		return {
			status: "success",
			message: "Tier re-evaluation complete",
			data: {
				newTierIndex: newSnapshot.snapshotTierIndex,
				newOneRCents: newSnapshot.snapshotOneRCents,
				wrote,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "forceTierReeval failed",
			errors: [
				{
					code: "FORCE_TIER_REEVAL_FAILED",
					detail: toSafeErrorMessage(error, "forceTierReeval"),
				},
			],
		}
	}
}
