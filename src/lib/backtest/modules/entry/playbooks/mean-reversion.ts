/**
 * `mean_reversion` playbook stub — "retorno à média".
 *
 * Spec: docs/hawks-strategy/engine-v0.9-playbook-spec.md §4.1
 *
 * Real logic lands in step 4 of the build order. For now this stub
 * returns `null` so the orchestrator + engine plumbing can be
 * type-checked and wired end-to-end without any playbook actually
 * firing.
 */

import type { Playbook, PlaybookContext, PlaybookFire } from "./types"

export const meanReversionPlaybook: Playbook = {
	id: "mean_reversion",
	evaluate(_ctx: PlaybookContext): PlaybookFire | null {
		return null
	},
}
