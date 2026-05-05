"use client"

import { useState } from "react"
import { Moon, Sun } from "lucide-react"
import { DailyPlanEditor, type DailyPlanEditorProps } from "./daily-plan-editor"

interface DayModeSwitcherProps {
	dailyPlanId: string
	defaultMode: "pre" | "post"
	existing: DailyPlanEditorProps["existing"]
}

const DayModeSwitcher = ({ dailyPlanId, defaultMode, existing }: DayModeSwitcherProps) => {
	const [mode, setMode] = useState<"pre" | "post">(defaultMode)

	return (
		<div className="space-y-m-300">
			<div className="inline-flex rounded-md border border-bg-300 bg-bg-200 p-1">
				<button
					type="button"
					onClick={() => setMode("pre")}
					aria-pressed={mode === "pre"}
					className={`flex items-center gap-1 rounded-sm px-s-300 py-s-200 text-tiny transition-colors ${
						mode === "pre"
							? "bg-acc-100/10 text-acc-100"
							: "text-txt-200 hover:text-txt-100"
					}`}
				>
					<Sun className="h-3.5 w-3.5" />
					Pre-market
				</button>
				<button
					type="button"
					onClick={() => setMode("post")}
					aria-pressed={mode === "post"}
					className={`flex items-center gap-1 rounded-sm px-s-300 py-s-200 text-tiny transition-colors ${
						mode === "post"
							? "bg-acc-100/10 text-acc-100"
							: "text-txt-200 hover:text-txt-100"
					}`}
				>
					<Moon className="h-3.5 w-3.5" />
					Post-market
				</button>
			</div>
			<DailyPlanEditor dailyPlanId={dailyPlanId} mode={mode} existing={existing} />
		</div>
	)
}

export type { DayModeSwitcherProps }
export { DayModeSwitcher }
