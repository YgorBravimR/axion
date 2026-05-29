import type { OptimizationRun } from "@/types/backtest"

interface ParetoPoint {
	runId: string
	x: number
	y: number
	isFrontier: boolean
	isRobust: boolean | null
	label: string
}

/**
 * Compute Pareto frontier for `(maxDrawdown, profitFactor)`.
 * Frontier rule: minimize x (drawdown), maximize y (PF).
 *
 * A point P is on the frontier iff no other point strictly dominates it —
 * i.e. no Q exists with `Q.x <= P.x && Q.y >= P.y` and at least one strict.
 *
 * Algorithm: sort by x ascending; sweep keeping running max of y. A point is
 * on the frontier when its y exceeds the running max from points to its left.
 * O(n log n) from the sort; O(n) sweep.
 */
const computeParetoFrontier = (runs: OptimizationRun[]): ParetoPoint[] => {
	const points = runs.map<ParetoPoint>((run) => ({
		runId: run.id,
		x: Math.abs(run.summary.maxDrawdownCents),
		y:
			run.summary.profitFactor === Infinity
				? Number.MAX_SAFE_INTEGER
				: run.summary.profitFactor,
		isFrontier: false,
		isRobust: run.oosRobust ?? null,
		label: run.label,
	}))

	const sorted = [...points].sort((a, b) => a.x - b.x)
	let bestY = -Infinity
	for (const p of sorted) {
		if (p.y > bestY) {
			p.isFrontier = true
			bestY = p.y
		}
	}
	return points
}

export { computeParetoFrontier }
export type { ParetoPoint }
