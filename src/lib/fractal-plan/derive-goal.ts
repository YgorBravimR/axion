// Shared monthly-goal derivation. Same fallback chain at month + quarter level so
// numbers reconcile across pages.

type PlanGoalSource = "manual" | "weeks" | "default" | "none"

interface DeriveMonthGoalInput {
	manualGoalCents: number | null
	weekTargetRs: readonly (string | null)[]
	snapshotOneRCents: number
	cascadeDailyTargetR: string | null
	totalTradingDays: number
	assertivityPct?: number
}

interface DeriveMonthGoalResult {
	planGoalCents: number | null
	planGoalSource: PlanGoalSource
}

const sumWeekTargetRs = (raws: readonly (string | null)[]): number =>
	raws.reduce((acc, raw) => {
		if (raw === null) {
			return acc
		}
		const n = parseFloat(raw)
		return acc + (Number.isFinite(n) ? n : 0)
	}, 0)

const deriveMonthGoal = (
	input: DeriveMonthGoalInput
): DeriveMonthGoalResult => {
	const {
		manualGoalCents,
		weekTargetRs,
		snapshotOneRCents,
		cascadeDailyTargetR,
		totalTradingDays,
		assertivityPct = 100,
	} = input

	const assertivity = Math.min(100, Math.max(1, assertivityPct)) / 100

	if (manualGoalCents !== null && manualGoalCents > 0) {
		return { planGoalCents: manualGoalCents, planGoalSource: "manual" }
	}

	const weeksSum = sumWeekTargetRs(weekTargetRs)
	const fromWeeksCents =
		weeksSum > 0 && snapshotOneRCents > 0
			? Math.round(weeksSum * snapshotOneRCents)
			: 0
	if (fromWeeksCents > 0) {
		return { planGoalCents: fromWeeksCents, planGoalSource: "weeks" }
	}

	const cascadeR =
		cascadeDailyTargetR !== null ? parseFloat(cascadeDailyTargetR) : NaN
	const fromCascadeCents =
		Number.isFinite(cascadeR) &&
		cascadeR > 0 &&
		snapshotOneRCents > 0 &&
		totalTradingDays > 0
			? Math.round(
					cascadeR * totalTradingDays * assertivity * snapshotOneRCents
				)
			: 0
	if (fromCascadeCents > 0) {
		return { planGoalCents: fromCascadeCents, planGoalSource: "default" }
	}

	return { planGoalCents: null, planGoalSource: "none" }
}

export type { PlanGoalSource, DeriveMonthGoalInput, DeriveMonthGoalResult }
export { deriveMonthGoal, sumWeekTargetRs }
