/**
 * Per-axis sweep diagnosis — surfaces WHY a sweep selection isn't
 * contributing to the cardinality grid.
 *
 * Background: a user marks N leaves as Sweep but `cardinality.raw` is much
 * smaller than the multiplicative product they expect. There are two
 * silent collapse vectors:
 *
 *   1. Owner-lock — `qualityBundle` (and other enum owners) force every
 *      `managedBy` leaf to a preset value when the owner is fixed to
 *      anything other than `"custom"`. The leaf's own sweep selection is
 *      ignored at grid-generation time.
 *   2. Conditional gate — a leaf with `condition.parentPath` is skipped
 *      when the current combo's parent value isn't in `allowedValues`.
 *      Its sweep selection contributes 0 values to multiplication.
 *
 * This module returns one `SweepAxisDiagnosis` per sweep selection so the
 * UI can render a row-per-axis status badge (ACTIVE × N / LOCKED / GATED).
 */
import {
	countSelectionValues,
	type LeafSelection,
	type PrimitiveValue,
	type SweepableLeaf,
} from "./sweep-leaf"

type SweepAxisStatus = "active" | "locked" | "gated"

interface SweepAxisDiagnosis {
	leafPath: string
	labelKey: string
	status: SweepAxisStatus
	/** For `active`: the value count contributing to the grid. */
	valueCount?: number
	/** For `locked`: the owner path + the resolved owner value forcing the lock. */
	ownerPath?: string
	ownerValue?: PrimitiveValue
	/** For `gated`: the parent path + allowed values + current parent value. */
	conditionParentPath?: string
	conditionAllowedValues?: ReadonlyArray<PrimitiveValue>
	conditionParentValue?: PrimitiveValue | undefined
}

const readFixedValue = (
	selections: Map<string, LeafSelection>,
	path: string
): PrimitiveValue | undefined => {
	const sel = selections.get(path)
	if (!sel || sel.kind !== "fixed") {
		return undefined
	}
	return sel.value
}

/**
 * Diagnose each non-fixed selection. Returns one entry per sweep axis,
 * in `leaves` topological order (so the UI list mirrors the form).
 *
 * Locked detection (matches `generateConditionalGrid`):
 *   - leaf has `managedBy` (owner path)
 *   - owner is fixed
 *   - owner's fixed value is NOT `"custom"`
 *
 * Gated detection: simplified — we only flag gates the user can SEE in
 * the current selection map. If the parent is in sweep mode (multiple
 * values), at least one combo will satisfy the gate, so we report it as
 * active. The accurate per-combo breakdown lives in the grid generator
 * itself; this is the at-a-glance overview.
 */
const diagnoseSweepAxes = (
	leaves: SweepableLeaf[],
	selections: Map<string, LeafSelection>
): SweepAxisDiagnosis[] => {
	const out: SweepAxisDiagnosis[] = []
	for (const leaf of leaves) {
		const sel = selections.get(leaf.path)
		if (!sel || sel.kind === "fixed") {
			continue
		}

		// 1. Owner-lock check — only when owner is fixed AND not "custom".
		if (leaf.managedBy) {
			const ownerValue = readFixedValue(selections, leaf.managedBy)
			if (ownerValue !== undefined && ownerValue !== "custom") {
				out.push({
					leafPath: leaf.path,
					labelKey: leaf.labelKey,
					status: "locked",
					ownerPath: leaf.managedBy,
					ownerValue,
				})
				continue
			}
		}

		// 2. Conditional gate check — only when parent is fixed AND not in
		//    allowedValues. Sweep parents always satisfy the gate for at
		//    least one combo, so we treat them as active.
		if (leaf.condition) {
			const parentSel = selections.get(leaf.condition.parentPath)
			const parentIsFixed = parentSel?.kind === "fixed"
			if (parentIsFixed) {
				const parentValue = (parentSel as { value: PrimitiveValue }).value
				const satisfied = leaf.condition.allowedValues.some(
					(v) => v === parentValue
				)
				if (!satisfied) {
					out.push({
						leafPath: leaf.path,
						labelKey: leaf.labelKey,
						status: "gated",
						conditionParentPath: leaf.condition.parentPath,
						conditionAllowedValues: leaf.condition.allowedValues,
						conditionParentValue: parentValue,
					})
					continue
				}
			}
		}

		// 3. Active — selection contributes valueCount(sel) values.
		out.push({
			leafPath: leaf.path,
			labelKey: leaf.labelKey,
			status: "active",
			valueCount: countSelectionValues(sel),
		})
	}
	return out
}

const countByStatus = (
	diagnoses: SweepAxisDiagnosis[]
): { active: number; locked: number; gated: number } => {
	let active = 0
	let locked = 0
	let gated = 0
	for (const d of diagnoses) {
		if (d.status === "active") {
			active++
		} else if (d.status === "locked") {
			locked++
		} else {
			gated++
		}
	}
	return { active, locked, gated }
}

export { diagnoseSweepAxes, countByStatus }
export type { SweepAxisDiagnosis, SweepAxisStatus }
