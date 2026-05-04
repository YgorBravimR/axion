import { computeGainEv, computeStopEv } from "@/lib/yearly-plan/exit-convention"
import type { ExitConvention } from "@/lib/yearly-plan/exit-convention"

interface OutcomeCounts {
	gains: number
	stops: number
}

interface PayoffMatrixEntry {
	combo: OutcomeCounts
	label: string
	evPoints: number
}

interface PayoffMatrixRow {
	nOps: number
	combinations: PayoffMatrixEntry[]
}

const generateCombinations = (nOps: number): OutcomeCounts[] => {
	const result: OutcomeCounts[] = []
	for (let gains = nOps; gains >= 0; gains--) {
		result.push({ gains, stops: nOps - gains })
	}
	return result
}

const combinationEv = (
	combo: OutcomeCounts,
	convention: ExitConvention,
	contracts: number,
): number => {
	const gainEv = computeGainEv(convention)
	const stopEv = computeStopEv(convention)
	return (combo.gains * gainEv + combo.stops * stopEv) * contracts
}

const buildComboLabel = (combo: OutcomeCounts): string => {
	const parts: string[] = []
	if (combo.gains > 0) parts.push(`${combo.gains}G`)
	if (combo.stops > 0) parts.push(`${combo.stops}S`)
	return parts.join("") || "0"
}

const buildPayoffMatrix = (
	convention: ExitConvention,
	contracts: number,
	maxOps: number = 10,
): PayoffMatrixRow[] => {
	const rows: PayoffMatrixRow[] = []

	for (let nOps = 1; nOps <= maxOps; nOps++) {
		const combos = generateCombinations(nOps)
		const combinations: PayoffMatrixEntry[] = combos.map((combo) => ({
			combo,
			label: buildComboLabel(combo),
			evPoints: combinationEv(combo, convention, contracts),
		}))
		rows.push({ nOps, combinations })
	}

	return rows
}

export { buildPayoffMatrix, generateCombinations, combinationEv }
export type { OutcomeCounts, PayoffMatrixEntry, PayoffMatrixRow }
