"use client"

import { useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { SweepModeToggle } from "./sweep-mode-toggle"
import { toggleTimeMode, type TimeSelection } from "./sweep-transitions"

// HHMM (e.g. 910 = 09:10) ↔ "HH:MM" ("09:10") conversion utilities.
// HHMM encoding is the source of truth — it's an int, sortable, swept
// without unit awareness, and consumed by the backtest engine directly.

const hhmmToTimeString = (hhmm: number): string => {
	const safeInt = Math.max(0, Math.min(2359, Math.floor(hhmm)))
	const hh = Math.floor(safeInt / 100)
	const mm = safeInt % 100
	return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`
}

const timeStringToHHmm = (s: string): number | null => {
	const m = /^(\d{1,2}):(\d{2})$/.exec(s)
	if (!m) {
		return null
	}
	const hh = parseInt(m[1]!, 10)
	const mm = parseInt(m[2]!, 10)
	if (hh < 0 || hh > 23 || mm < 0 || mm > 59) {
		return null
	}
	return hh * 100 + mm
}

interface TimeOrSweepProps {
	id: string
	label: string
	labelSuffix?: ReactNode
	hint?: string
	selection: TimeSelection
	onSelectionChange: (_next: TimeSelection) => void
}

const TimeOrSweep = ({
	id,
	label,
	labelSuffix,
	hint,
	selection,
	onSelectionChange,
}: TimeOrSweepProps) => {
	const isSweep = selection.kind === "sweep_set"
	const [draft, setDraft] = useState<string>("")

	const handleModeToggle = () => {
		onSelectionChange(toggleTimeMode(selection))
	}

	const handleFixedChange = (raw: string) => {
		const hhmm = timeStringToHHmm(raw)
		if (hhmm === null) {
			return
		}
		onSelectionChange({ kind: "fixed", value: hhmm })
	}

	const handleAddSweepValue = () => {
		if (selection.kind !== "sweep_set") {
			return
		}
		const hhmm = timeStringToHHmm(draft)
		if (hhmm === null) {
			return
		}
		if (selection.values.includes(hhmm)) {
			setDraft("")
			return
		}
		onSelectionChange({
			kind: "sweep_set",
			values: [...selection.values, hhmm].sort((a, b) => a - b),
		})
		setDraft("")
	}

	const handleRemoveSweepValue = (hhmm: number) => {
		if (selection.kind !== "sweep_set") {
			return
		}
		// Don't drop to zero — user should toggle out of sweep mode instead.
		if (selection.values.length <= 1) {
			return
		}
		onSelectionChange({
			kind: "sweep_set",
			values: selection.values.filter((v) => v !== hhmm),
		})
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
				<Input
					id={id}
					type="time"
					value={hhmmToTimeString(selection.value)}
					onChange={(e) => handleFixedChange(e.target.value)}
				/>
			)}

			{selection.kind === "sweep_set" && (
				<div className="space-y-s-200">
					<div className="gap-s-200 flex flex-wrap">
						{selection.values.map((hhmm) => (
							<span
								key={hhmm}
								className={cn(
									"gap-s-100 px-s-300 py-s-100 inline-flex items-center rounded-md border",
									"border-acc-100/50 bg-acc-100/10 text-txt-100"
								)}
							>
								<span className="text-small tabular-nums">
									{hhmmToTimeString(hhmm)}
								</span>
								<button
									type="button"
									onClick={() => handleRemoveSweepValue(hhmm)}
									aria-label={`Remove ${hhmmToTimeString(hhmm)}`}
									className="text-txt-300 hover:text-txt-100"
								>
									<X className="h-3 w-3" aria-hidden="true" />
								</button>
							</span>
						))}
					</div>
					<div className="gap-s-200 flex">
						<Input
							id={`${id}-add`}
							type="time"
							value={draft}
							onChange={(e) => setDraft(e.target.value)}
							className="flex-1"
						/>
						<Button
							id={`${id}-add-btn`}
							type="button"
							size="sm"
							variant="outline"
							onClick={handleAddSweepValue}
							disabled={timeStringToHHmm(draft) === null}
						>
							Add
						</Button>
					</div>
				</div>
			)}
		</div>
	)
}

export { TimeOrSweep, hhmmToTimeString, timeStringToHHmm }
export type { TimeOrSweepProps }
