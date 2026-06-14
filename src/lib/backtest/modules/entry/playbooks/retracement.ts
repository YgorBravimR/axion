/**
 * `retracement` playbook stub — "retração do movimento".
 *
 * Spec: docs/hawks-strategy/engine-v0.9-playbook-spec.md §4.2
 *
 * Real logic lands in step 5 of the build order — this is where the
 * v0.6 / v0.8 wave-2 lower-high / higher-low rule gets ported, but
 * 60m-only gated and stripped of the monolithic state machine.
 */

import type { Playbook, PlaybookContext, PlaybookFire } from "./types"

export const retracementPlaybook: Playbook = {
	id: "retracement",
	evaluate(_ctx: PlaybookContext): PlaybookFire | null {
		return null
	},
}
