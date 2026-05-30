/**
 * Journey utilities — lazy journeyId minting + back-fill.
 *
 * Per the locked PR2 decision (eng review 2026-05-30):
 *
 *   "Broad runs ship with stage='broad' and NO journeyId. The journeyId is
 *    minted when the user clicks 'Breed selected' on the Pareto scatter; the
 *    resulting refine run owns it and back-fills it onto its parent broad
 *    run(s) in localStorage. Ad-hoc sweeps stay journeyId-free forever."
 *
 * This file provides:
 *   - `mintJourneyId()`            — generate a short, sortable journey ID
 *   - `backfillJourneyId(runs, parentIds, journeyId)`
 *                                  — propagate journeyId onto parent broad
 *                                    runs that didn't already have one
 */
import type { OptimizationRun } from "@/types/backtest"

/**
 * Mint a journey id of the form `j-<base36 timestamp>-<base36 random>`.
 * Sortable by creation time; collision-safe enough for single-user localStorage.
 */
const mintJourneyId = (): string => {
	const ts = Date.now().toString(36)
	const rand = Math.floor(Math.random() * 0xffffff)
		.toString(36)
		.padStart(4, "0")
	return `j-${ts}-${rand}`
}

/**
 * Walk `runs` and stamp `journeyId` onto every run whose id is in `parentIds`
 * AND that does not already have a journeyId. Runs already in a journey keep
 * their original id (refine-of-refine — see locked decision: nested lineage).
 *
 * Returns a NEW array; does not mutate inputs.
 */
const backfillJourneyId = (
	runs: OptimizationRun[],
	parentIds: string[],
	journeyId: string
): OptimizationRun[] => {
	const parentSet = new Set(parentIds)
	return runs.map((run) => {
		if (!parentSet.has(run.id)) {
			return run
		}
		if (run.provenance?.journeyId) {
			return run
		}
		return {
			...run,
			provenance: {
				...(run.provenance ?? {}),
				journeyId,
				stage: run.provenance?.stage ?? "broad",
			} as OptimizationRun["provenance"],
		}
	})
}

export { mintJourneyId, backfillJourneyId }
