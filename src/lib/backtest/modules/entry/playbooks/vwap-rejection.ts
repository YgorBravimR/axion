/**
 * `vwap_rejection` playbook stub — "rejeição de VWAP".
 *
 * Spec: docs/hawks-strategy/engine-v0.9-playbook-spec.md §4.3
 *
 * Real logic lands in step 6 of the build order.
 */

import type { Playbook, PlaybookContext, PlaybookFire } from "./types"

export const vwapRejectionPlaybook: Playbook = {
	id: "vwap_rejection",
	evaluate(_ctx: PlaybookContext): PlaybookFire | null {
		return null
	},
}
