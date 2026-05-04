import type { LadderRule } from "@/db/schema"

interface LadderLevel {
	contracts: number
	valorOperacionalCents: number
	multiplier: number
	tier: number
}

const buildCapitalLadder = (
	rules: LadderRule[],
	valorPorContratoCents: number,
): LadderLevel[] => {
	const levels: LadderLevel[] = []

	for (let contracts = 1; contracts <= 20; contracts++) {
		const ruleIndex = rules.findIndex(
			(r) => contracts >= r.minContracts && contracts <= r.maxContracts,
		)
		const rule = ruleIndex >= 0 ? rules[ruleIndex] : rules[rules.length - 1]

		levels.push({
			contracts,
			valorOperacionalCents: contracts * valorPorContratoCents,
			multiplier: rule.multiplier,
			tier: ruleIndex >= 0 ? ruleIndex : rules.length - 1,
		})
	}

	return levels
}

const contractsForBalance = (
	balanceCents: number,
	ladder: LadderLevel[],
): number => {
	let result = 1

	for (const level of ladder) {
		if (level.valorOperacionalCents <= balanceCents) {
			result = level.contracts
		}
	}

	return result
}

export { buildCapitalLadder, contractsForBalance }
export type { LadderLevel }
