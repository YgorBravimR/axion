"use client"

import { useMemo, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { expandRange } from "@/lib/optimize/sweep-leaf"
import { SweepModeToggle } from "./sweep-mode-toggle"
import {
	toggleNumberMode,
	type NumberSelection,
	type NumberRangeDefaults,
} from "./sweep-transitions"

interface NumberOrSweepProps {
	/** Unique id used for label htmlFor and DOM scoping. */
	id: string
	/** Human-readable label (already i18n-resolved by the parent). */
	label: string
	/** Optional badge/icon rendered to the right of the label text. */
	labelSuffix?: ReactNode
	/** Optional hint shown beneath the label. */
	hint?: string
	/** Current selection — fix value or sweep range. */
	selection: NumberSelection
	/** Called when the user changes value, range, or mode. */
	onSelectionChange: (_next: NumberSelection) => void
	/** Default range used when switching from fix → sweep. */
	defaults: NumberRangeDefaults
}

const NumberOrSweep = ({
	id,
	label,
	labelSuffix,
	hint,
	selection,
	onSelectionChange,
	defaults,
}: NumberOrSweepProps) => {
	const isSweep = selection.kind === "sweep_range"

	// Live-compute the value count so the user sees grid impact as they type.
	const valueCount = useMemo(() => {
		if (selection.kind !== "sweep_range") {
			return 0
		}
		return expandRange(selection.min, selection.max, selection.step).length
	}, [selection])

	const handleModeToggle = () => {
		onSelectionChange(toggleNumberMode(selection, defaults))
	}

	const handleFixedChange = (raw: string) => {
		const parsed = Number(raw)
		if (!Number.isFinite(parsed)) {
			return
		}
		onSelectionChange({ kind: "fixed", value: parsed })
	}

	const handleSweepFieldChange = (
		field: "min" | "max" | "step",
		raw: string
	) => {
		if (selection.kind !== "sweep_range") {
			return
		}
		const parsed = Number(raw)
		if (!Number.isFinite(parsed)) {
			return
		}
		onSelectionChange({ ...selection, [field]: parsed })
	}

	return (
		<div className="space-y-s-200">
			<div className="gap-s-200 flex items-center justify-between">
				<div className="min-w-0">
					<Label
						id={`${id}-label`}
						htmlFor={id}
						className="gap-s-200 inline-flex items-center"
					>
						<span>{label}</span>
						{labelSuffix}
					</Label>
					{hint && <p className="text-tiny text-txt-300 mt-s-100">{hint}</p>}
				</div>
				<SweepModeToggle
					id={`${id}-mode-toggle`}
					isSweepMode={isSweep}
					onToggle={handleModeToggle}
					aria-label={`Toggle sweep mode for ${label}`}
				/>
			</div>

			{selection.kind === "fixed" && (
				<Input
					id={id}
					type="number"
					value={selection.value}
					onChange={(e) => handleFixedChange(e.target.value)}
				/>
			)}

			{selection.kind === "sweep_range" && (
				<div className="space-y-s-100">
					<div className="gap-s-200 grid grid-cols-3">
						<div className="space-y-s-100">
							<Label
								id={`${id}-min-label`}
								htmlFor={`${id}-min`}
								className="text-tiny text-txt-300"
							>
								Min
							</Label>
							<Input
								id={`${id}-min`}
								type="number"
								value={selection.min}
								onChange={(e) => handleSweepFieldChange("min", e.target.value)}
							/>
						</div>
						<div className="space-y-s-100">
							<Label
								id={`${id}-max-label`}
								htmlFor={`${id}-max`}
								className="text-tiny text-txt-300"
							>
								Max
							</Label>
							<Input
								id={`${id}-max`}
								type="number"
								value={selection.max}
								onChange={(e) => handleSweepFieldChange("max", e.target.value)}
							/>
						</div>
						<div className="space-y-s-100">
							<Label
								id={`${id}-step-label`}
								htmlFor={`${id}-step`}
								className="text-tiny text-txt-300"
							>
								Step
							</Label>
							<Input
								id={`${id}-step`}
								type="number"
								value={selection.step}
								onChange={(e) => handleSweepFieldChange("step", e.target.value)}
							/>
						</div>
					</div>
					<p className="text-tiny text-txt-300 tabular-nums">
						{valueCount} values
					</p>
				</div>
			)}
		</div>
	)
}

export { NumberOrSweep }
export type { NumberOrSweepProps }
