interface LadderRuleR {
	readonly minCapitalCents: number
	readonly maxCapitalCents: number
	readonly oneRCents: number
}

interface TierResolution {
	readonly tierIndex: number
	readonly oneRCents: number
}

const resolveTier = (
	capitalCents: number,
	rules: readonly LadderRuleR[]
): TierResolution => {
	if (rules.length === 0) {
		throw new Error("ladder rules cannot be empty")
	}
	if (capitalCents < 0) {
		throw new Error("capital must be non-negative")
	}

	for (let i = 0; i < rules.length; i++) {
		const rule = rules[i]!
		if (
			capitalCents >= rule.minCapitalCents &&
			capitalCents <= rule.maxCapitalCents
		) {
			return { tierIndex: i, oneRCents: rule.oneRCents }
		}
	}

	// Below the bottom band: clamp to lowest tier (don't reward sub-floor capital
	// with the highest 1R — that would scale up risk catastrophically).
	const bottom = rules[0]!
	if (capitalCents < bottom.minCapitalCents) {
		return { tierIndex: 0, oneRCents: bottom.oneRCents }
	}

	// Above the top band: clamp to highest tier.
	const top = rules[rules.length - 1]!
	return { tierIndex: rules.length - 1, oneRCents: top.oneRCents }
}

interface LadderRunwayStep {
	readonly tierIndex: number
	readonly rule: LadderRuleR
	/**
	 * Total R-multiples a trader could lose starting at this tier's floor until
	 * capital reaches zero, walking the downgrade chain. After each downgrade
	 * 1R shrinks, so the per-tier R contribution compounds non-linearly.
	 */
	readonly rUntilRuin: number
	/**
	 * R-multiples lost from this tier's floor before the drawdown trigger fires
	 * and the snapshot tier downgrades. For tier 0 (the bottom), this equals
	 * `rUntilRuin` since there is no further downgrade.
	 */
	readonly rToNextDowngrade: number
}

/**
 * Per-tier runway: how many R-multiples could be lost from each tier's floor
 * until capital is exhausted, accounting for the drawdown-trigger downgrades.
 *
 * Mirrors the live `evaluateDrawdownTrigger` rule: starting at the floor of
 * tier `t`, downgrade fires when capital drops to `min[t] - thresholdR · 1R[t]`,
 * 1R then shrinks to `1R[t-1]`, and the walk continues until tier 0 — where no
 * further downgrade is possible and the remaining capital is consumed at the
 * floor 1R.
 */
const computeLadderRunway = (
	rules: readonly LadderRuleR[],
	thresholdR = 2
): readonly LadderRunwayStep[] =>
	rules.map((rule, idx) => {
		let cap = rule.minCapitalCents
		let tier = idx
		let totalR = 0
		let rToNext: number | null = null

		while (cap > 0 && tier >= 0) {
			const tierRule = rules[tier]!
			const oneR = tierRule.oneRCents
			if (oneR <= 0) {
				break
			}
			if (tier === 0) {
				const chunk = cap / oneR
				totalR += chunk
				if (rToNext === null) {
					rToNext = chunk
				}
				break
			}
			const downgradeFloor = Math.max(
				0,
				tierRule.minCapitalCents - thresholdR * oneR
			)
			const lossToDowngrade = Math.max(0, cap - downgradeFloor)
			const chunk = lossToDowngrade / oneR
			totalR += chunk
			if (rToNext === null) {
				rToNext = chunk
			}
			cap = downgradeFloor
			tier -= 1
		}

		return {
			tierIndex: idx,
			rule,
			rUntilRuin: totalR,
			rToNextDowngrade: rToNext ?? totalR,
		}
	})

export type { LadderRuleR, TierResolution, LadderRunwayStep }
export { resolveTier, computeLadderRunway }
