interface LadderRuleR {
	readonly minCapitalCents: number
	readonly maxCapitalCents: number
	readonly oneRCents: number
}

interface TierResolution {
	readonly tierIndex: number
	readonly oneRCents: number
}

const resolveTier = (capitalCents: number, rules: readonly LadderRuleR[]): TierResolution => {
	if (rules.length === 0) {
		throw new Error("ladder rules cannot be empty")
	}
	if (capitalCents < 0) {
		throw new Error("capital must be non-negative")
	}

	for (let i = 0; i < rules.length; i++) {
		const rule = rules[i]
		if (capitalCents >= rule.minCapitalCents && capitalCents <= rule.maxCapitalCents) {
			return { tierIndex: i, oneRCents: rule.oneRCents }
		}
	}

	// Above the top band: clamp to highest tier.
	const top = rules[rules.length - 1]
	return { tierIndex: rules.length - 1, oneRCents: top.oneRCents }
}

export type { LadderRuleR, TierResolution }
export { resolveTier }
