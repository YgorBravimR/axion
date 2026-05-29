"use client"

import { useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
	HAWKS_LEAVES,
	HAWKS_VALIDATORS,
} from "@/lib/backtest/presets/hawks-leaves"
import { countConditionalGridBreakdown } from "@/lib/optimize/grid-conditional"
import type {
	LeafSelection,
	PrimitiveValue,
	SweepableLeaf,
} from "@/lib/optimize/sweep-leaf"
import {
	NumberOrSweep,
	BoolOrSweep,
	EnumOrSweep,
	type NumberSelection,
	type BoolSelection,
	type EnumSelection,
} from "./leaf-controls"

interface WalkForwardConfig {
	enabled: boolean
	inSamplePct: number
}

interface HawksSweepBuilderProps {
	/** Per-leaf selection map. Builder is fully controlled — parent owns state. */
	selections: Map<string, LeafSelection>
	/** Emitted when the user changes any leaf's selection. */
	onSelectionsChange: (_next: Map<string, LeafSelection>) => void
	/** Walk-forward optimization config. `null` = disabled. */
	walkForwardConfig: WalkForwardConfig | null
	/** Emitted when the user toggles or adjusts walk-forward. */
	onWalkForwardChange: (_config: WalkForwardConfig | null) => void
}

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Resolve the value(s) a leaf contributes to combinations under the
 * current selections. For fix → just the fix value; for sweep_set →
 * its values; for sweep_range → expanded range. Used to determine
 * whether a CHILD leaf's condition is satisfied: a condition is
 * satisfied iff at least one of the parent's resolved values matches.
 */
const resolveLeafValues = (
	selection: LeafSelection | undefined
): PrimitiveValue[] => {
	if (!selection) {
		return []
	}
	if (selection.kind === "fixed") {
		return [selection.value]
	}
	if (selection.kind === "sweep_set") {
		return selection.values
	}
	// Range — collect endpoint values; for hide/show purposes we only need
	// to know whether *any* value would activate a child, which is implied
	// by any sweep_range producing at least one value (always true if step
	// is valid). Returning [min] is enough — children only check `===`.
	return [selection.min]
}

/**
 * Is this leaf "active" right now given parent conditions? Returns
 * true when:
 *   - no condition at all, OR
 *   - parent's selection includes at least one allowedValue.
 *
 * For bundle ownership, the leaf is HIDDEN (not just inactive) so this
 * function isn't the right check — see `isLeafLockedByBundle`.
 */
const isLeafActive = (
	leaf: SweepableLeaf,
	selections: Map<string, LeafSelection>
): boolean => {
	if (!leaf.condition) {
		return true
	}
	const parentSelection = selections.get(leaf.condition.parentPath)
	const parentValues = resolveLeafValues(parentSelection)
	return parentValues.some(
		(v) => leaf.condition?.allowedValues.includes(v as never) ?? false
	)
}

/**
 * Is this leaf locked by a fix-mode named bundle owner? Locked leaves
 * are hidden from the UI entirely — the user can't fix or sweep them
 * while the bundle owns them.
 *
 * Locked when: managedBy is set AND owner is fix-mode AND owner value
 * is NOT "custom" (custom doesn't lock anything).
 */
const isLeafLockedByBundle = (
	leaf: SweepableLeaf,
	selections: Map<string, LeafSelection>
): boolean => {
	if (!leaf.managedBy) {
		return false
	}
	const ownerSelection = selections.get(leaf.managedBy)
	if (!ownerSelection || ownerSelection.kind !== "fixed") {
		// Owner being swept means EACH combination has its own bundle, so
		// the owned leaf's user-configured selection applies inside the
		// `custom` sub-tree. UI surfaces the leaf in that case.
		return false
	}
	return ownerSelection.value !== "custom"
}

// ── Section grouping ────────────────────────────────────────────────

interface Section {
	id: string
	titleKey: string
	pathPrefixes: string[]
}

const SECTIONS: Section[] = [
	{
		id: "entry",
		titleKey: "sectionEntry",
		pathPrefixes: [
			"entry.config.startTime",
			"entry.config.endTime",
			"entry.config.fireCooldownBricks",
			"entry.config.wave1MinBricks",
			"entry.config.retracementMinBricks",
		],
	},
	{
		id: "quality",
		titleKey: "sectionQuality",
		pathPrefixes: ["entry.config.qualityGates"],
	},
	{
		id: "stop",
		titleKey: "sectionStop",
		pathPrefixes: ["stop."],
	},
	{
		id: "reversal",
		titleKey: "sectionReversal",
		pathPrefixes: ["reversal."],
	},
	{
		id: "target",
		titleKey: "sectionTarget",
		pathPrefixes: ["target."],
	},
	{
		id: "execution",
		titleKey: "sectionExecution",
		pathPrefixes: ["slippageTicks"],
	},
]

const sectionForLeaf = (leaf: SweepableLeaf): Section | undefined =>
	SECTIONS.find((s) => s.pathPrefixes.some((p) => leaf.path.startsWith(p)))

// ── Component ────────────────────────────────────────────────────────

const HawksSweepBuilder = ({
	selections,
	onSelectionsChange,
	walkForwardConfig,
	onWalkForwardChange,
}: HawksSweepBuilderProps) => {
	const tBuilder = useTranslations("optimize.sweepBuilder")
	const tInvariant = useTranslations("optimize.invariants")
	const tWf = useTranslations("optimize.walkForward")

	// Live cardinality breakdown — recomputed when selections change.
	// Reports `raw` (before validator filtering), `valid` (after), and
	// per-validator drop counts so the user can see WHY combos are filtered.
	const cardinality = useMemo(() => {
		const fallback = new Map<string, PrimitiveValue>()
		for (const [path, sel] of selections) {
			if (sel.kind === "fixed") {
				fallback.set(path, sel.value)
			}
		}
		return countConditionalGridBreakdown(
			HAWKS_LEAVES,
			selections,
			fallback,
			HAWKS_VALIDATORS
		)
	}, [selections])

	const sweepAxisCount = useMemo(() => {
		let count = 0
		for (const sel of selections.values()) {
			if (sel.kind !== "fixed") {
				count++
			}
		}
		return count
	}, [selections])

	// Per-leaf change handler — produces a new Map (immutable update).
	const handleLeafChange = useCallback(
		(path: string, next: LeafSelection) => {
			const updated = new Map(selections)
			updated.set(path, next)
			onSelectionsChange(updated)
		},
		[selections, onSelectionsChange]
	)

	// Compute the visible leaf set ONCE per render: skip inactive, skip locked.
	const visibleBySection = useMemo(() => {
		const map = new Map<string, SweepableLeaf[]>()
		for (const leaf of HAWKS_LEAVES) {
			if (isLeafLockedByBundle(leaf, selections)) {
				continue
			}
			if (!isLeafActive(leaf, selections)) {
				continue
			}
			const section = sectionForLeaf(leaf)
			if (!section) {
				continue
			}
			const list = map.get(section.id) ?? []
			list.push(leaf)
			map.set(section.id, list)
		}
		return map
	}, [selections])

	return (
		<div className="space-y-m-500">
			{/* Header — sweep summary at top of builder. */}
			<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
				<div className="flex items-center justify-between">
					<div>
						<h2 className="text-h3 text-txt-100 font-semibold">
							{tBuilder("title")}
						</h2>
						<p className="text-tiny text-txt-300 mt-s-100">
							{tBuilder("description")}
						</p>
					</div>
					<div className="text-right">
						<p className="text-tiny text-txt-300">{tBuilder("combinations")}</p>
						<p
							className={`text-h2 font-semibold tabular-nums ${cardinality.valid === 0 ? "text-fb-error" : "text-txt-100"}`}
						>
							{cardinality.valid.toLocaleString()}
						</p>
						{cardinality.raw !== cardinality.valid && (
							<p className="text-tiny text-txt-300">
								{tBuilder("rawDroppedSummary", {
									raw: cardinality.raw.toLocaleString(),
									dropped: (
										cardinality.raw - cardinality.valid
									).toLocaleString(),
								})}
							</p>
						)}
						<p className="text-tiny text-txt-300">
							{tBuilder("sweepAxisCount", { count: sweepAxisCount })}
						</p>
					</div>
				</div>
				{cardinality.droppedByReason.size > 0 && (
					<div className="gap-s-200 mt-s-300 flex flex-wrap">
						{Array.from(cardinality.droppedByReason.entries()).map(
							([reason, count]) => (
								<span
									key={reason}
									className="bg-bg-300 text-txt-200 px-s-200 py-s-100 text-tiny rounded-full"
									title={tBuilder("dropChipTooltip", {
										count: count.toLocaleString(),
									})}
								>
									{tInvariant(reason)}: −{count.toLocaleString()}
								</span>
							)
						)}
					</div>
				)}
			</div>

			{/* Walk-forward toggle + in-sample slider. Lives outside the
			    sections so users see it before scrolling through leaves. */}
			<div className="border-bg-300 bg-bg-200 p-m-400 space-y-s-300 rounded-lg border">
				<label
					htmlFor="builder-walk-forward-enable"
					className="gap-s-200 flex cursor-pointer items-start"
				>
					<Checkbox
						id="builder-walk-forward-enable"
						checked={walkForwardConfig?.enabled ?? false}
						onCheckedChange={(checked) => {
							if (checked === true) {
								onWalkForwardChange({ enabled: true, inSamplePct: 70 })
							} else {
								onWalkForwardChange(null)
							}
						}}
						className="mt-s-100"
					/>
					<div className="space-y-s-100 flex-1">
						<span className="text-small text-txt-100 font-medium">
							{tWf("enableLabel")}
						</span>
						<p className="text-tiny text-txt-300">{tWf("hint")}</p>
					</div>
				</label>

				{walkForwardConfig?.enabled && (
					<div className="pl-s-300 space-y-s-200">
						<div className="flex items-center justify-between">
							<span className="text-tiny text-txt-300">
								{tWf("splitLabel")}
							</span>
							<span className="text-small text-txt-100 font-medium tabular-nums">
								{tWf("splitValue", {
									pct: walkForwardConfig.inSamplePct,
									oos: 100 - walkForwardConfig.inSamplePct,
								})}
							</span>
						</div>
						<div className="gap-s-200 flex items-center">
							<input
								id="builder-walk-forward-pct"
								type="range"
								min="50"
								max="90"
								step="5"
								value={walkForwardConfig.inSamplePct}
								onChange={(e) => {
									const pct = parseInt(e.target.value, 10)
									onWalkForwardChange({ enabled: true, inSamplePct: pct })
								}}
								className="flex-1"
								aria-label={tWf("splitLabel")}
							/>
							<Input
								id="builder-walk-forward-pct-input"
								type="number"
								min="50"
								max="90"
								step="5"
								value={walkForwardConfig.inSamplePct}
								onChange={(e) => {
									const pct = Math.max(
										50,
										Math.min(90, parseInt(e.target.value, 10) || 50)
									)
									onWalkForwardChange({ enabled: true, inSamplePct: pct })
								}}
								className="text-small h-8 w-14 tabular-nums"
							/>
						</div>
					</div>
				)}
			</div>

			{/* Sections */}
			{SECTIONS.map((section) => {
				const leaves = visibleBySection.get(section.id) ?? []
				if (leaves.length === 0) {
					return null
				}
				return (
					<section
						key={section.id}
						className="border-bg-300 bg-bg-200 space-y-m-400 p-m-400 rounded-lg border"
					>
						<h3 className="text-body text-txt-100 font-semibold">
							{tBuilder(section.titleKey)}
						</h3>
						<div className="space-y-m-400">
							{leaves.map((leaf) => (
								<LeafControl
									key={leaf.path}
									leaf={leaf}
									selection={selections.get(leaf.path)}
									onChange={(next) => handleLeafChange(leaf.path, next)}
								/>
							))}
						</div>
					</section>
				)
			})}
		</div>
	)
}

// ── Per-leaf render switch ──────────────────────────────────────────

interface LeafControlProps {
	leaf: SweepableLeaf
	selection: LeafSelection | undefined
	onChange: (_next: LeafSelection) => void
}

const LeafControl = ({ leaf, selection, onChange }: LeafControlProps) => {
	const tLeaf = useTranslations("optimize.sweepLeaf")
	const label = tLeaf(leaf.labelKey)

	if (leaf.kind === "number") {
		const sel: NumberSelection =
			selection?.kind === "sweep_range"
				? selection
				: {
						kind: "fixed",
						value:
							selection?.kind === "fixed" && typeof selection.value === "number"
								? selection.value
								: leaf.defaultMin,
					}
		return (
			<NumberOrSweep
				id={`leaf-${leaf.path}`}
				label={label}
				selection={sel}
				onSelectionChange={onChange}
				defaults={{
					min: leaf.defaultMin,
					max: leaf.defaultMax,
					step: leaf.defaultStep,
				}}
			/>
		)
	}

	if (leaf.kind === "bool") {
		const sel: BoolSelection =
			selection?.kind === "sweep_set" &&
			selection.values.every((v) => typeof v === "boolean")
				? { kind: "sweep_set", values: selection.values as boolean[] }
				: {
						kind: "fixed",
						value:
							selection?.kind === "fixed" &&
							typeof selection.value === "boolean"
								? selection.value
								: false,
					}
		return (
			<BoolOrSweep
				id={`leaf-${leaf.path}`}
				label={label}
				selection={sel}
				onSelectionChange={onChange}
			/>
		)
	}

	if (leaf.kind === "enum") {
		const sel: EnumSelection =
			selection?.kind === "sweep_set" &&
			selection.values.every((v) => typeof v === "string")
				? { kind: "sweep_set", values: selection.values as string[] }
				: {
						kind: "fixed",
						value:
							selection?.kind === "fixed" && typeof selection.value === "string"
								? selection.value
								: (leaf.options[0]?.value ?? ""),
					}
		return (
			<EnumOrSweep
				id={`leaf-${leaf.path}`}
				label={label}
				options={leaf.options.map((o) => ({
					value: o.value,
					label: tLeaf(o.labelKey),
				}))}
				selection={sel}
				onSelectionChange={onChange}
			/>
		)
	}

	// time leaves — Phase B punts on these (per design doc §11 open question).
	return null
}

export { HawksSweepBuilder }
export type { HawksSweepBuilderProps }
