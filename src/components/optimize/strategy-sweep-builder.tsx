"use client"

import { useCallback, useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronDown, RotateCcw, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { countConditionalGridBreakdown } from "@/lib/optimize/grid-conditional"
import { isLabelOnlyAxis } from "@/lib/backtest/presets/hawks-axis-roles"
import type {
	LeafGroupValidator,
	LeafSelection,
	PrimitiveValue,
	SweepableLeaf,
} from "@/lib/optimize/sweep-leaf"
import {
	NumberOrSweep,
	BoolOrSweep,
	EnumOrSweep,
	TimeOrSweep,
	type NumberSelection,
	type BoolSelection,
	type EnumSelection,
	type TimeSelection,
} from "./leaf-controls"

// ── Strategy-specific configuration ──────────────────────────────────

interface SweepBuilderSection {
	id: string
	titleKey: string
	pathPrefixes: string[]
}

/**
 * Per-strategy bundle owner — used by Hawks for the quality bundle.
 * When set and the bundle owner is fixed to a named (non-custom) value,
 * the builder renders a hint in the matching section explaining that
 * owned gates are locked. ORB has no bundle and omits this entirely.
 */
interface SweepBuilderBundleConfig {
	path: string
	ownedPaths: string[]
	/** i18n key prefix for the bundle option label, e.g. `hawksQualityBundle_`. */
	labelKeyPrefix: string
	/** Which section's id should show the bundle-lock hint. */
	sectionId: string
}

interface StrategySweepConfig {
	leaves: SweepableLeaf[]
	validators: LeafGroupValidator[]
	sections: SweepBuilderSection[]
	bundle?: SweepBuilderBundleConfig
	/** Default time leaf baseline (HHMM int). Used when a time leaf has no
	    explicit `defaultValues` and no current selection. */
	defaultTimeBaseline: number
}

interface WalkForwardConfig {
	enabled: boolean
	inSamplePct: number
}

interface StrategySweepBuilderProps {
	config: StrategySweepConfig
	/** Per-leaf selection map. Builder is fully controlled — parent owns state. */
	selections: Map<string, LeafSelection>
	/** Emitted when the user changes any leaf's selection. */
	onSelectionsChange: (_next: Map<string, LeafSelection>) => void
	/** Walk-forward optimization config. `null` = disabled. */
	walkForwardConfig: WalkForwardConfig | null
	/** Emitted when the user toggles or adjusts walk-forward. */
	onWalkForwardChange: (_config: WalkForwardConfig | null) => void
	/** Reset selections to recipe baseline. Parent re-derives via deriveInitialSelections. */
	onReset: () => void
}

// Cardinality warning thresholds. ≤ WARN_SOFT_THRESHOLD: neutral.
// Between thresholds: amber (soft warning). > MAX_CARDINALITY: red.
const WARN_SOFT_THRESHOLD = 500
const MAX_CARDINALITY = 2000

// ── Helpers ──────────────────────────────────────────────────────────

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
	return [selection.min]
}

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
 * The "escape hatch" value an owner takes to release its managed leaves
 * back to user control. Today only `qualityBundle = "custom"` qualifies;
 * lift this if another owner ships with a different unlock value.
 */
const UNLOCK_OWNER_VALUE: PrimitiveValue = "custom"

/**
 * True when every possible value of the owner forces a lock — i.e. the
 * user's sweep on the managed leaf cannot affect ANY combo in the grid.
 *
 * Cases:
 *   - owner missing / undefined: not locked (owner free to take any value)
 *   - owner fixed = "custom": not locked (escape hatch active)
 *   - owner fixed ≠ "custom": locked (every combo uses preset)
 *   - owner sweep_set including "custom": NOT locked (some combos unlock)
 *   - owner sweep_set excluding "custom": LOCKED (every combo forces preset)
 *   - owner sweep_range: not locked (numeric owners don't manage bundles)
 *
 * Mirrors the runtime behaviour of `generateConditionalGrid` — there the
 * lock is decided per-combo by the owner's value in that row. We aggregate
 * across combos: a leaf is "fully" locked only when no row escapes.
 */
const isLeafLockedByBundle = (
	leaf: SweepableLeaf,
	selections: Map<string, LeafSelection>
): boolean => {
	if (!leaf.managedBy) {
		return false
	}
	const ownerSelection = selections.get(leaf.managedBy)
	if (!ownerSelection) {
		return false
	}
	if (ownerSelection.kind === "fixed") {
		return ownerSelection.value !== UNLOCK_OWNER_VALUE
	}
	if (ownerSelection.kind === "sweep_set") {
		return !ownerSelection.values.includes(UNLOCK_OWNER_VALUE)
	}
	return false
}

const sectionForLeaf = (
	leaf: SweepableLeaf,
	sections: SweepBuilderSection[]
): SweepBuilderSection | undefined =>
	sections.find((s) => s.pathPrefixes.some((p) => leaf.path.startsWith(p)))

// ── Component ────────────────────────────────────────────────────────

const StrategySweepBuilder = ({
	config,
	selections,
	onSelectionsChange,
	walkForwardConfig,
	onWalkForwardChange,
	onReset,
}: StrategySweepBuilderProps) => {
	const tBuilder = useTranslations("optimize.sweepBuilder")
	const tInvariant = useTranslations("optimize.invariants")
	const tWf = useTranslations("optimize.walkForward")
	const tLeaf = useTranslations("optimize.sweepLeaf")

	const { leaves, validators, sections, bundle, defaultTimeBaseline } = config

	// First section expanded by default; users expand others as needed.
	const [expandedSections, setExpandedSections] = useState<Set<string>>(
		() => new Set(sections[0] ? [sections[0].id] : [])
	)
	const toggleSection = useCallback((id: string) => {
		setExpandedSections((prev) => {
			const next = new Set(prev)
			if (next.has(id)) {
				next.delete(id)
			} else {
				next.add(id)
			}
			return next
		})
	}, [])

	/**
	 * The bundle "lock identity" used to render the section hint. When the
	 * bundle is fixed to a named preset, we show that name (e.g. "Balanced").
	 * When the bundle is a sweep_set of presets with no "custom", we still
	 * need a hint — render the set joined for readability. Returns `null`
	 * when the bundle is unset, fixed to "custom", or includes "custom" in
	 * a sweep (escape hatch present ⇒ owned axes contribute on some combos
	 * ⇒ no lock to advertise).
	 */
	/**
	 * The bundle's current "locking identity" used to render the section
	 * hint. Two shapes:
	 *   - `{ mode: "fixed", value }`: bundle is fixed to a single named
	 *     preset (e.g. "balanced"). The hint resolves that key via tLeaf
	 *     so the localized label appears.
	 *   - `{ mode: "sweep", values }`: bundle is a sweep_set of presets
	 *     with no "custom". The hint joins localized labels for each.
	 * Returns `null` when the bundle is unset, fixed to "custom", or the
	 * sweep includes "custom" — in those cases there's no lock to advertise.
	 */
	const lockingBundleValue = useMemo<
		| { mode: "fixed"; value: string }
		| { mode: "sweep"; values: string[] }
		| null
	>(() => {
		if (!bundle) {
			return null
		}
		const bundleSel = selections.get(bundle.path)
		if (!bundleSel) {
			return null
		}
		if (bundleSel.kind === "fixed") {
			if (typeof bundleSel.value !== "string" || bundleSel.value === "custom") {
				return null
			}
			return { mode: "fixed", value: bundleSel.value }
		}
		if (bundleSel.kind === "sweep_set") {
			if (bundleSel.values.includes("custom")) {
				return null
			}
			const stringValues = bundleSel.values.filter(
				(v): v is string => typeof v === "string"
			)
			if (stringValues.length === 0) {
				return null
			}
			return { mode: "sweep", values: stringValues }
		}
		return null
	}, [selections, bundle])

	const cardinality = useMemo(() => {
		const fallback = new Map<string, PrimitiveValue>()
		for (const [path, sel] of selections) {
			if (sel.kind === "fixed") {
				fallback.set(path, sel.value)
			}
		}
		return countConditionalGridBreakdown(
			leaves,
			selections,
			fallback,
			validators
		)
	}, [selections, leaves, validators])

	const sweepAxisCount = useMemo(() => {
		let count = 0
		for (const sel of selections.values()) {
			if (sel.kind !== "fixed") {
				count++
			}
		}
		return count
	}, [selections])

	const handleLeafChange = useCallback(
		(path: string, next: LeafSelection) => {
			const updated = new Map(selections)
			updated.set(path, next)
			onSelectionsChange(updated)
		},
		[selections, onSelectionsChange]
	)

	const visibleBySection = useMemo(() => {
		const map = new Map<string, SweepableLeaf[]>()
		for (const leaf of leaves) {
			if (isLeafLockedByBundle(leaf, selections)) {
				continue
			}
			if (!isLeafActive(leaf, selections)) {
				continue
			}
			const section = sectionForLeaf(leaf, sections)
			if (!section) {
				continue
			}
			const list = map.get(section.id) ?? []
			list.push(leaf)
			map.set(section.id, list)
		}
		return map
	}, [selections, leaves, sections])

	return (
		<div className="space-y-m-500">
			{/* Header — sweep summary at top of builder. */}
			<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
				<div className="flex items-start justify-between">
					<div>
						<h2 className="text-h3 text-txt-100 font-semibold">
							{tBuilder("title")}
						</h2>
						<p className="text-tiny text-txt-300 mt-s-100">
							{tBuilder("description")}
						</p>
						<Button
							id="builder-reset"
							size="sm"
							variant="outline"
							onClick={onReset}
							className="gap-s-100 mt-s-200"
						>
							<RotateCcw className="h-3 w-3" aria-hidden="true" />
							{tBuilder("resetToBaseline")}
						</Button>
					</div>
					<div className="text-right">
						<p className="text-tiny text-txt-300">{tBuilder("combinations")}</p>
						<p
							className={cn(
								"text-h2 font-semibold tabular-nums",
								cardinality.valid === 0 || cardinality.valid > MAX_CARDINALITY
									? "text-fb-error"
									: cardinality.valid >= WARN_SOFT_THRESHOLD
										? "text-warning"
										: "text-txt-100"
							)}
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

			{/* Walk-forward toggle + in-sample slider. */}
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

			{/* Sections — collapsible, first open by default. */}
			{sections.map((section) => {
				const sectionLeaves = visibleBySection.get(section.id) ?? []
				if (sectionLeaves.length === 0) {
					return null
				}
				const showBundleHint =
					bundle !== undefined &&
					section.id === bundle.sectionId &&
					lockingBundleValue !== null
				const isOpen = expandedSections.has(section.id)
				const sweptInSection = sectionLeaves.filter(
					(leaf) => selections.get(leaf.path)?.kind !== "fixed"
				).length
				return (
					<section
						key={section.id}
						className="border-bg-300 bg-bg-200 rounded-lg border"
					>
						<button
							type="button"
							onClick={() => toggleSection(section.id)}
							aria-expanded={isOpen}
							aria-controls={`section-panel-${section.id}`}
							className="hover:bg-bg-300/50 p-m-400 flex w-full items-center justify-between transition-colors"
						>
							<span className="gap-s-200 flex items-center">
								<h3 className="text-body text-txt-100 font-semibold">
									{tBuilder(section.titleKey)}
								</h3>
								<span className="text-tiny text-txt-300 tabular-nums">
									{tBuilder("sectionLeafCount", {
										total: sectionLeaves.length,
										swept: sweptInSection,
									})}
								</span>
							</span>
							<ChevronDown
								className={cn(
									"text-txt-300 h-4 w-4 transition-transform",
									isOpen && "rotate-180"
								)}
								aria-hidden="true"
							/>
						</button>
						{isOpen && (
							<div
								id={`section-panel-${section.id}`}
								className="border-bg-300 p-m-400 space-y-m-400 border-t"
							>
								{showBundleHint && (
									<div className="border-bg-400 bg-bg-300 p-s-300 text-tiny text-txt-200 rounded-md border">
										{tBuilder("bundleLockHint", {
											bundle:
												lockingBundleValue.mode === "fixed"
													? tLeaf(
															`${bundle.labelKeyPrefix}${lockingBundleValue.value}`
														)
													: lockingBundleValue.values
															.map((v) => tLeaf(`${bundle.labelKeyPrefix}${v}`))
															.join(", "),
											count: bundle.ownedPaths.length,
										})}
									</div>
								)}
								<div className="space-y-m-400">
									{sectionLeaves.map((leaf) => (
										<LeafControl
											key={leaf.path}
											leaf={leaf}
											selection={selections.get(leaf.path)}
											defaultTimeBaseline={defaultTimeBaseline}
											onChange={(next) => handleLeafChange(leaf.path, next)}
										/>
									))}
								</div>
							</div>
						)}
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
	defaultTimeBaseline: number
	onChange: (_next: LeafSelection) => void
}

const LeafControl = ({
	leaf,
	selection,
	defaultTimeBaseline,
	onChange,
}: LeafControlProps) => {
	const tLeaf = useTranslations("optimize.sweepLeaf")
	const tAxisRole = useTranslations("optimize.sweepAxisRole")
	const label = tLeaf(leaf.labelKey)
	// Axes that only feed `trade.quality.tier` (AAA/AA/A/B) without affecting
	// PnL/PF/Sharpe. Render a tiny info badge so the user doesn't waste
	// optimizer budget sweeping a score-only knob when they expect PnL impact.
	// Source of truth: src/lib/backtest/presets/hawks-axis-roles.ts
	const labelOnly = isLabelOnlyAxis(leaf.path)
	const labelSuffix = labelOnly ? (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					className="text-txt-300 hover:text-txt-200 gap-s-100 border-bg-300 px-s-200 text-micro inline-flex cursor-help items-center rounded-full border py-[1px] font-medium"
					aria-label={tAxisRole("labelOnlyAria")}
				>
					<Info className="size-3" aria-hidden />
					{tAxisRole("labelOnlyTag")}
				</span>
			</TooltipTrigger>
			<TooltipContent
				id={`${leaf.path}-label-only-tooltip`}
				className="max-w-xs"
			>
				{tAxisRole("labelOnlyTooltip")}
			</TooltipContent>
		</Tooltip>
	) : undefined

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
				labelSuffix={labelSuffix}
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
				labelSuffix={labelSuffix}
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
				labelSuffix={labelSuffix}
				options={leaf.options.map((o) => ({
					value: o.value,
					label: tLeaf(o.labelKey),
				}))}
				selection={sel}
				onSelectionChange={onChange}
			/>
		)
	}

	if (leaf.kind === "time") {
		const baseline =
			leaf.defaultValues && leaf.defaultValues.length > 0
				? leaf.defaultValues[0]!
				: defaultTimeBaseline

		const sel: TimeSelection =
			selection?.kind === "sweep_set" &&
			selection.values.every((v) => typeof v === "number")
				? { kind: "sweep_set", values: selection.values as number[] }
				: {
						kind: "fixed",
						value:
							selection?.kind === "fixed" && typeof selection.value === "number"
								? selection.value
								: baseline,
					}
		return (
			<TimeOrSweep
				id={`leaf-${leaf.path}`}
				label={label}
				labelSuffix={labelSuffix}
				selection={sel}
				onSelectionChange={onChange}
			/>
		)
	}

	return null
}

export { StrategySweepBuilder }
export type {
	StrategySweepBuilderProps,
	StrategySweepConfig,
	SweepBuilderSection,
	SweepBuilderBundleConfig,
	WalkForwardConfig,
}
