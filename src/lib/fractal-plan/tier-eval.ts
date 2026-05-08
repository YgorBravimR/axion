import { resolveTier, type LadderRuleR } from "./capital-ladder"

type SnapshotReason = "month_start" | "drawdown_trigger" | "manual"

interface TierSnapshot {
	readonly snapshotCapitalCents: number
	readonly snapshotOneRCents: number
	readonly snapshotTierIndex: number
	readonly snapshotComputedAt: Date
	readonly snapshotReason: SnapshotReason
}

interface MonthStartInput {
	readonly capitalCents: number
	readonly ladderRules: readonly LadderRuleR[]
	readonly now: Date
}

const evaluateMonthStart = (input: MonthStartInput): TierSnapshot => {
	const { tierIndex, oneRCents } = resolveTier(
		input.capitalCents,
		input.ladderRules
	)
	return {
		snapshotCapitalCents: input.capitalCents,
		snapshotOneRCents: oneRCents,
		snapshotTierIndex: tierIndex,
		snapshotComputedAt: input.now,
		snapshotReason: "month_start",
	}
}

interface DrawdownInput {
	readonly currentCapitalCents: number
	readonly currentTierIndex: number
	readonly currentOneRCents: number
	readonly ladderRules: readonly LadderRuleR[]
	readonly thresholdR: number
	readonly now?: Date
}

const evaluateDrawdownTrigger = (input: DrawdownInput): TierSnapshot | null => {
	if (input.currentTierIndex === 0) {
		return null
	}

	const currentRule = input.ladderRules[input.currentTierIndex]!
	const dropBelowFloorCents =
		currentRule.minCapitalCents - input.currentCapitalCents
	const thresholdCents = input.thresholdR * input.currentOneRCents

	if (dropBelowFloorCents < thresholdCents) {
		return null
	}

	const { tierIndex, oneRCents } = resolveTier(
		input.currentCapitalCents,
		input.ladderRules
	)
	if (tierIndex >= input.currentTierIndex) {
		return null
	}

	return {
		snapshotCapitalCents: input.currentCapitalCents,
		snapshotOneRCents: oneRCents,
		snapshotTierIndex: tierIndex,
		snapshotComputedAt: input.now ?? new Date(),
		snapshotReason: "drawdown_trigger",
	}
}

export type { TierSnapshot, SnapshotReason }
export { evaluateMonthStart, evaluateDrawdownTrigger }
