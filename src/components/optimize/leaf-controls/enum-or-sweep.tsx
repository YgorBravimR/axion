"use client"

import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { SegmentedToggle } from "@/components/ui/segmented-toggle"
import { cn } from "@/lib/utils"
import { SweepModeToggle } from "./sweep-mode-toggle"
import { toggleEnumMode, type EnumSelection } from "./sweep-transitions"

interface EnumOption {
	value: string
	label: string
}

interface EnumOrSweepProps {
	/** Unique id used for label htmlFor and DOM scoping. */
	id: string
	/** Human-readable label (already i18n-resolved by the parent). */
	label: string
	/** Optional hint shown beneath the label. */
	hint?: string
	/** Available enum values and their labels. Order matters (top → bottom). */
	options: EnumOption[]
	/** Current selection — fix value or subset. */
	selection: EnumSelection
	/** Called when the user changes value(s) or mode. */
	onSelectionChange: (_next: EnumSelection) => void
}

const EnumOrSweep = ({
	id,
	label,
	hint,
	options,
	selection,
	onSelectionChange,
}: EnumOrSweepProps) => {
	const isSweep = selection.kind === "sweep_set"
	const fallbackValue = options[0]?.value ?? ""

	const handleModeToggle = () => {
		onSelectionChange(toggleEnumMode(selection, fallbackValue))
	}

	const handleFixedChange = (next: string) => {
		onSelectionChange({ kind: "fixed", value: next })
	}

	const handleSweepValueToggle = (value: string, checked: boolean) => {
		if (selection.kind !== "sweep_set") {
			return
		}
		if (checked) {
			if (selection.values.includes(value)) {
				return
			}
			onSelectionChange({
				kind: "sweep_set",
				values: [...selection.values, value],
			})
		} else {
			// Don't allow ticking the last value off — collapsing to 0 is invalid;
			// the user should hit the Sweep toggle to leave sweep mode instead.
			if (selection.values.length <= 1) {
				return
			}
			onSelectionChange({
				kind: "sweep_set",
				values: selection.values.filter((v) => v !== value),
			})
		}
	}

	return (
		<div className="space-y-s-200">
			<div className="gap-s-200 flex items-center justify-between">
				<div className="min-w-0">
					<Label id={`${id}-label`}>{label}</Label>
					{hint && <p className="text-tiny text-txt-300 mt-s-100">{hint}</p>}
				</div>
				<div className="gap-s-200 flex shrink-0 items-center">
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

			{selection.kind === "fixed" && (
				<SegmentedToggle
					value={selection.value}
					options={options.map((o) => ({ value: o.value, label: o.label }))}
					onChange={handleFixedChange}
					aria-labelledby={`${id}-label`}
				/>
			)}

			{selection.kind === "sweep_set" && (
				<div className="gap-s-200 flex flex-wrap">
					{options.map((option) => {
						const isChecked = selection.values.includes(option.value)
						return (
							<label
								key={option.value}
								className={cn(
									"gap-s-200 px-s-300 py-s-100 flex cursor-pointer items-center rounded-md border transition-colors",
									isChecked
										? "border-acc-100/50 bg-acc-100/10 text-txt-100"
										: "border-bg-300 text-txt-300 hover:border-bg-400 hover:text-txt-200"
								)}
							>
								<Checkbox
									id={`${id}-option-${option.value}`}
									checked={isChecked}
									onCheckedChange={(checked) =>
										handleSweepValueToggle(option.value, checked === true)
									}
									className="h-3.5 w-3.5"
								/>
								<span className="text-small">{option.label}</span>
							</label>
						)
					})}
				</div>
			)}
		</div>
	)
}

export { EnumOrSweep }
export type { EnumOrSweepProps, EnumOption }
