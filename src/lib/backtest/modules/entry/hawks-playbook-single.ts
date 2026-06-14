/**
 * Single-playbook orchestrator wrapper (spec §9, Phase F).
 *
 * `processHawksPlaybookCandle` dispatches to all three playbooks and
 * picks a primary by `PLAYBOOK_PRIORITY`. The validation scrub (Phase J)
 * needs an isolated view of each playbook so the user can tune entry
 * rules without contamination from siblings. This wrapper takes the
 * same arguments as the multi-playbook orchestrator but only fires when
 * the named playbook itself evaluates favourably.
 *
 * Implementation is intentionally a thin filter over the existing
 * orchestrator: re-run, then drop the signal if the primary playbook
 * id does not match the target id. The full orchestrator's gate /
 * cooldown / day-boundary semantics are preserved verbatim — only the
 * playbook-id check differs.
 */

import type {
	HawksTripleScreenConfig,
	EntrySignal,
	DayContext,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"
import type { HtfWalkerSnapshot } from "../../hawks-htf-walker"
import {
	processHawksPlaybookCandle,
	type HawksPlaybookState,
} from "./hawks-playbook"
import type { PlaybookId } from "./playbooks/types"

export const processHawksSinglePlaybookCandle = (
	candle: CandleRow,
	state: HawksPlaybookState,
	ctx: DayContext,
	tickSize: number,
	config: HawksTripleScreenConfig,
	htfSnapshot: HtfWalkerSnapshot | null,
	playbookId: PlaybookId
): { state: HawksPlaybookState; signal: EntrySignal | null } => {
	const result = processHawksPlaybookCandle(
		candle,
		state,
		ctx,
		tickSize,
		config,
		htfSnapshot
	)
	if (result.signal === null) {
		return result
	}
	// `label` format from the multi-orchestrator is
	// `<primary.label> [<id1>,<id2>,...]`. We accept this fire only if
	// the requested playbookId appears in that list — i.e. that playbook
	// also fired on this brick. We do NOT require it to be primary,
	// because PLAYBOOK_PRIORITY is a tagging order, not an exclusion
	// rule. A user inspecting `mean_reversion` should still see a fire
	// where mean_reversion fired alongside retracement.
	if (!result.signal.label.includes(playbookId)) {
		return { state: result.state, signal: null }
	}
	return result
}
