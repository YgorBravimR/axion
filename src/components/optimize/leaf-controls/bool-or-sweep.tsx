"use client"

import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { SweepModeToggle } from "./sweep-mode-toggle"
import { toggleBoolMode, type BoolSelection } from "./sweep-transitions"

interface BoolOrSweepProps {
	/** Unique id used for label htmlFor and DOM scoping. */
	id: string
	/** Human-readable label (already i18n-resolved by the parent). */
	label: string
	/** Optional hint shown beneath the label. */
	hint?: string
	/** Current selection — fix bool or sweep over {true, false}. */
	selection: BoolSelection
	/** Called when the user changes value or mode. */
	onSelectionChange: (_next: BoolSelection) => void
}

const BoolOrSweep = ({
	id,
	label,
	hint,
	selection,
	onSelectionChange,
}: BoolOrSweepProps) => {
	const isSweep = selection.kind === "sweep_set"

	const handleModeToggle = () => {
		onSelectionChange(toggleBoolMode(selection))
	}

	const handleSwitchChange = (next: boolean) => {
		onSelectionChange({ kind: "fixed", value: next })
	}

	return (
		<div className="gap-s-300 flex items-start justify-between">
			<div className="min-w-0">
				<Label id={`${id}-label`} htmlFor={id} className="cursor-pointer">
					{label}
				</Label>
				{hint && <p className="text-tiny text-txt-300 mt-s-100">{hint}</p>}
			</div>
			<div className="gap-s-200 flex shrink-0 items-center">
				{selection.kind === "fixed" && (
					<Switch
						id={id}
						checked={selection.value}
						onCheckedChange={handleSwitchChange}
					/>
				)}
				{selection.kind === "sweep_set" && (
					<span className="text-tiny text-acc-100 tabular-nums">
						{selection.values.length} values
					</span>
				)}
				<SweepModeToggle
					id={`${id}-mode-toggle`}
					isSweepMode={isSweep}
					onToggle={handleModeToggle}
					aria-label={`Toggle sweep mode for ${label}`}
				/>
			</div>
		</div>
	)
}

export { BoolOrSweep }
export type { BoolOrSweepProps }
