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

		if (!bestByPf || pf > (bestByPf.summary.profitFactor ?? 0)) {
			bestByPf = run
		}
		if (!bestByPnl || pnl > (bestByPnl.summary.totalPnlCents ?? 0)) {
			bestByPnl = run
		}
		if (!bestBySharpe || sharpe > (bestBySharpe.summary.sharpeRatio ?? 0)) {
			bestBySharpe = run
		}
	}

	// Compute 3-axis Pareto front using incremental dominance check.
	const onFront = new Set<OptimizationRun>()

	for (const candidate of runs) {
		let isDominated = false

		for (const other of runs) {
			if (candidate === other) {
				continue
			}

			// other dominates candidate if it's >= on all axes and > on at least one.
			const candPf = candidate.summary.profitFactor ?? 0
			const candPnl = candidate.summary.totalPnlCents ?? 0
			const candSharpe = candidate.summary.sharpeRatio ?? 0

			const otherPf = other.summary.profitFactor ?? 0
			const otherPnl = other.summary.totalPnlCents ?? 0
			const otherSharpe = other.summary.sharpeRatio ?? 0

			const pfOk = otherPf >= candPf
			const pnlOk = otherPnl >= candPnl
			const sharpeOk = otherSharpe >= candSharpe

			const hasStrictWin =
				otherPf > candPf || otherPnl > candPnl || otherSharpe > candSharpe

			if (pfOk && pnlOk && sharpeOk && hasStrictWin) {
				isDominated = true
				break
			}
		}

		if (!isDominated) {
			onFront.add(candidate)
		}
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
