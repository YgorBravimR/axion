import type { OptimizationRun } from "@/types/backtest"

interface ParetoRetainOpts {
	axes?: ("profitFactor" | "totalPnlCents" | "sharpeRatio")[]
}

/**
 * Pareto retention policy: keep full trade arrays only for runs on the 3-axis
 * Pareto front (profitFactor × totalPnlCents × sharpeRatio) plus single-metric
 * extremes (best PF, best PnL, best Sharpe). All other runs are compressed:
 * trades array becomes empty, tradesRetained is set to false, summary metrics
 * remain unchanged.
 *
 * This ensures localStorage quota stays manageable while preserving the most
 * actionable runs (Pareto-optimal and individual metric extremes).
 */
const paretoRetain = (runs: OptimizationRun[]): OptimizationRun[] => {
	if (runs.length === 0) {
		return []
	}

	// Identify single-metric extremes (best run by each individual metric).
	let bestByPf: OptimizationRun | undefined
	let bestByPnl: OptimizationRun | undefined
	let bestBySharpe: OptimizationRun | undefined

	for (const run of runs) {
		const pf = run.summary.profitFactor ?? 0
		const pnl = run.summary.totalPnlCents ?? 0
		const sharpe = run.summary.sharpeRatio ?? 0

		const bestPf = bestByPf ? (bestByPf.summary.profitFactor ?? 0) : -Infinity
		const bestPnl = bestByPnl
			? (bestByPnl.summary.totalPnlCents ?? 0)
			: -Infinity
		const bestSharpe = bestBySharpe
			? (bestBySharpe.summary.sharpeRatio ?? 0)
			: -Infinity

		if (pf > bestPf) {
			bestByPf = run
		}
		if (pnl > bestPnl) {
			bestByPnl = run
		}
		if (sharpe > bestSharpe) {
			bestBySharpe = run
		}
	}

	// Compute 3-axis Pareto front using sorted-sweep O(N log N).
	// Sort by profitFactor descending; sweep linearly tracking running max of (pnl, sharpe).
	// A point is on the frontier iff it dominates the running max of one of the other axes.
	const onFront = new Set<OptimizationRun>()

	const sorted = [...runs].sort((a, b) => {
		const pfA = a.summary.profitFactor ?? 0
		const pfB = b.summary.profitFactor ?? 0
		return pfB - pfA // descending
	})

	let maxPnlSeen = -Infinity
	let maxSharpeSeen = -Infinity

	for (const run of sorted) {
		const pf = run.summary.profitFactor ?? 0
		const pnl = run.summary.totalPnlCents ?? 0
		const sharpe = run.summary.sharpeRatio ?? 0

		// On frontier if pnl or sharpe exceeds the max seen so far (in sweep order).
		if (pnl > maxPnlSeen || sharpe > maxSharpeSeen) {
			onFront.add(run)
		}

		maxPnlSeen = Math.max(maxPnlSeen, pnl)
		maxSharpeSeen = Math.max(maxSharpeSeen, sharpe)
	}

	// Union: Pareto front + single-metric extremes.
	const retained = new Set<OptimizationRun>()

	for (const r of onFront) {
		retained.add(r)
	}

	if (bestByPf) {
		retained.add(bestByPf)
	}
	if (bestByPnl) {
		retained.add(bestByPnl)
	}
	if (bestBySharpe) {
		retained.add(bestBySharpe)
	}

	// Return runs with trades stripped for non-retained, kept for retained.
	return runs.map((run) => {
		if (retained.has(run)) {
			return {
				...run,
				tradesRetained: true,
			}
		}

		return {
			...run,
			trades: [],
			tradesRetained: false,
		}
	})
}

export { paretoRetain }
export type { ParetoRetainOpts }
