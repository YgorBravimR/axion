import type { OptimizationRun } from "@/types/backtest"
import { METRIC_KEYS, DEFAULT_PARETO_AXES, type MetricKey } from "./metric-keys"

interface ParetoPoint {
	runId: string
	x: number
	y: number
	isFrontier: boolean
	isRobust: boolean | null
	label: string
}

interface ParetoConstraints {
	/** Always true in the funnel — PF<1 runs structurally excluded. Surface as opt-out only for non-funnel debug views. */
	profitOnly?: boolean
	/** Minimum trades inclusive. */
	minTrades?: number
	/** Minimum matchRate inclusive (0..1). Runs without matchRate are dropped. */
	minMatchRate?: number
	/** Only `oosRobust === true` survive. */
	robustOnly?: boolean
}

const DEFAULT_CONSTRAINTS: Required<ParetoConstraints> = {
	profitOnly: true,
	minTrades: 0,
	minMatchRate: 0,
	robustOnly: false,
}

const passesConstraints = (
	run: OptimizationRun,
	constraints: Required<ParetoConstraints>
): boolean => {
	if (constraints.profitOnly && run.summary.profitFactor < 1) {
		return false
	}
	if (run.summary.totalTrades < constraints.minTrades) {
		return false
	}
	if (constraints.minMatchRate > 0) {
		if (typeof run.matchRate !== "number") {
			return false
		}
		if (run.matchRate < constraints.minMatchRate) {
			return false
		}
	}
	if (constraints.robustOnly && run.oosRobust !== true) {
		return false
	}
	return true
}

/**
 * Compute Pareto frontier for an arbitrary axis pair.
 *
 * A point P is on the frontier iff no other point Q dominates P. Q dominates P
 * iff Q is at least as good as P on both axes AND strictly better on at least
 * one. "Better" is direction-aware: for "max" axes higher is better, for "min"
 * axes lower is better.
 *
 * Algorithm: sort points by x in direction-aware order, then sweep tracking
 * running-best on y. O(n log n) from the sort; O(n) sweep.
 *
 * Runs failing any constraint, or producing `null` on either axis extractor,
 * are excluded entirely (not just dimmed).
 */
const computeParetoFrontier = (
	runs: OptimizationRun[],
	xKey: MetricKey = DEFAULT_PARETO_AXES.x,
	yKey: MetricKey = DEFAULT_PARETO_AXES.y,
	constraints: ParetoConstraints = {}
): ParetoPoint[] => {
	const xAxis = METRIC_KEYS[xKey]
	const yAxis = METRIC_KEYS[yKey]
	const merged: Required<ParetoConstraints> = {
		...DEFAULT_CONSTRAINTS,
		...constraints,
	}

	const points: ParetoPoint[] = []
	for (const run of runs) {
		if (!passesConstraints(run, merged)) {
			continue
		}
		const x = xAxis.extract(run)
		const y = yAxis.extract(run)
		if (x === null || y === null) {
			continue
		}
		points.push({
			runId: run.id,
			x,
			y,
			isFrontier: false,
			isRobust: run.oosRobust ?? null,
			label: run.label,
		})
	}

	// Sort by x in the direction that makes "left side of sweep" the better x values.
	// For x="min" axis: ascending (smaller x first; better x comes first).
	// For x="max" axis: descending (larger x first; better x comes first).
	const xAsc = xAxis.direction === "min"
	const sorted = [...points].sort((a, b) => (xAsc ? a.x - b.x : b.x - a.x))

	// Sweep keeping running best-y. A point is on the frontier when its y is strictly
	// better than the best y from points seen so far (same-or-better-x neighbors can't
	// dominate it via x; they need strictly-better y, which we just disproved).
	const yBetter = (a: number, b: number) =>
		yAxis.direction === "max" ? a > b : a < b
	let bestY = yAxis.direction === "max" ? -Infinity : Infinity
	for (const p of sorted) {
		if (yBetter(p.y, bestY)) {
			p.isFrontier = true
			bestY = p.y
		}
	}
	return points
}

export { computeParetoFrontier }
export type { ParetoPoint, ParetoConstraints }
