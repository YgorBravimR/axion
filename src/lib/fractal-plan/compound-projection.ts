import { resolveTier } from "./capital-ladder"
import type { LadderRuleR } from "./capital-ladder"

const DEFAULT_COMPOUND_DAYS_PER_MONTH = 22

/**
 * Projects the 1R value (in cents) at the start of a given month by simulating
 * each prior month's assertivity-adjusted plan goal compounding into capital.
 *
 * Month 1 always returns the tier from initialCapitalCents (no prior months).
 * Month 2 returns the tier after one month of compounding, etc.
 *
 * Uses the yearly-plan dailyTargetR for all months — callers that have per-month
 * resolved values should pass those instead.
 */
const computeProjectedOneRCents = (
	targetMonth: number,
	params: {
		initialCapitalCents: number
		ladderRules: LadderRuleR[]
		dailyTargetR: number
		assertivityPct: number
		tradingDaysPerMonth?: number
		/** Calendar month (1–12) where the plan starts. Defaults to 1 (January). */
		planStartMonth?: number
	}
): number => {
	const {
		initialCapitalCents,
		ladderRules,
		dailyTargetR,
		assertivityPct,
		tradingDaysPerMonth = DEFAULT_COMPOUND_DAYS_PER_MONTH,
		planStartMonth = 1,
	} = params

	if (dailyTargetR <= 0 || ladderRules.length === 0) {
		return resolveTier(initialCapitalCents, ladderRules).oneRCents
	}

	const assertivity = Math.min(100, Math.max(1, assertivityPct)) / 100
	let capital = initialCapitalCents

	// Only compound months that are actually part of this plan
	for (let m = planStartMonth; m < targetMonth; m++) {
		const { oneRCents } = resolveTier(capital, ladderRules)
		const monthGoal = Math.round(
			dailyTargetR * tradingDaysPerMonth * assertivity * oneRCents
		)
		capital += monthGoal
	}

	return resolveTier(capital, ladderRules).oneRCents
}

export { computeProjectedOneRCents }
