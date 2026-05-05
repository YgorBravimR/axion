import { db } from "@/db/drizzle"
import { monthlyPlan, yearlyPlans, tierChangeLog } from "@/db/schema"
import { eq, and } from "drizzle-orm"
import { evaluateDrawdownTrigger } from "./tier-eval"

interface CheckInput {
	readonly accountId: string
	readonly year: number
	readonly month: number
	readonly currentCapitalCents: number
}

interface CheckResult {
	readonly fromTierIndex: number
	readonly toTierIndex: number
	readonly fromOneRCents: number
	readonly toOneRCents: number
	readonly monthlyPlanId: string
}

const checkDrawdownTrigger = async (input: CheckInput): Promise<CheckResult | null> => {
	const yearRow = await db.query.yearlyPlans.findFirst({
		where: and(
			eq(yearlyPlans.accountId, input.accountId),
			eq(yearlyPlans.year, input.year),
		),
	})
	if (!yearRow) return null

	const monthRow = await db.query.monthlyPlan.findFirst({
		where: and(
			eq(monthlyPlan.year, input.year),
			eq(monthlyPlan.month, input.month),
		),
	})
	if (!monthRow) return null

	const ladderRules = yearRow.ladderRules as unknown as ReadonlyArray<{
		minCapitalCents: number
		maxCapitalCents: number
		oneRCents: number
	}>
	const thresholdR = parseFloat(
		String((yearRow as typeof yearRow & { drawdownTriggerThresholdR?: string | null }).drawdownTriggerThresholdR ?? "2.00")
	)

	const newSnapshot = evaluateDrawdownTrigger({
		currentCapitalCents: input.currentCapitalCents,
		currentTierIndex: monthRow.snapshotTierIndex,
		currentOneRCents: monthRow.snapshotOneRCents,
		ladderRules,
		thresholdR,
	})
	if (!newSnapshot) return null

	const now = new Date()
	await db
		.update(monthlyPlan)
		.set({
			snapshotCapitalCents: newSnapshot.snapshotCapitalCents,
			snapshotOneRCents: newSnapshot.snapshotOneRCents,
			snapshotTierIndex: newSnapshot.snapshotTierIndex,
			snapshotComputedAt: now,
			snapshotReason: "drawdown_trigger",
		})
		.where(eq(monthlyPlan.id, monthRow.id))

	await db.insert(tierChangeLog).values({
		accountId: input.accountId,
		monthlyPlanId: monthRow.id,
		fromTierIndex: monthRow.snapshotTierIndex,
		toTierIndex: newSnapshot.snapshotTierIndex,
		fromOneRCents: monthRow.snapshotOneRCents,
		toOneRCents: newSnapshot.snapshotOneRCents,
		triggerReason: "drawdown_trigger",
		triggeredAt: now,
	})

	return {
		fromTierIndex: monthRow.snapshotTierIndex,
		toTierIndex: newSnapshot.snapshotTierIndex,
		fromOneRCents: monthRow.snapshotOneRCents,
		toOneRCents: newSnapshot.snapshotOneRCents,
		monthlyPlanId: monthRow.id,
	}
}

export type { CheckInput, CheckResult }
export { checkDrawdownTrigger }
