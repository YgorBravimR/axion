"use client"

import { useState, useEffect, useRef, memo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"

interface SweepProgressBarProps {
	current: number
	total: number
	onCancel: () => void
}

const SweepProgressBar = memo(({ current, total, onCancel }: SweepProgressBarProps) => {
	const t = useTranslations("optimize")
	const startTimeRef = useRef(Date.now())
	const [elapsed, setElapsed] = useState(0)

	// Tick elapsed time every 100ms while sweep is running
	useEffect(() => {
		startTimeRef.current = Date.now()
		setElapsed(0)

		const interval = setInterval(() => {
			setElapsed(Date.now() - startTimeRef.current)
		}, 100)

		return () => clearInterval(interval)
	}, [])

	const pct = total > 0 ? Math.round((current / total) * 100) : 0
	const elapsedSeconds = (elapsed / 1000).toFixed(1)

	// Estimate remaining time based on current pace
	const estimatedRemaining = current > 0
		? ((elapsed / current) * (total - current) / 1000).toFixed(1)
		: "..."

	return (
		<div className="border-bg-300 bg-bg-200 space-y-s-200 rounded-lg border p-m-400">
			{/* Header row: text + cancel */}
			<div className="flex items-center justify-between">
				<span className="text-small text-txt-100 tabular-nums">
					{t("sweepProgress", { current, total })}
				</span>
				<Button
					id="sweep-cancel"
					variant="ghost"
					size="sm"
					onClick={onCancel}
					className="text-txt-300 hover:text-fb-error h-7 gap-s-100 px-s-200"
					aria-label={t("sweepCancel")}
				>
					<X className="h-3.5 w-3.5" />
					{t("sweepCancel")}
				</Button>
			</div>

			{/* Progress bar */}
			<div className="bg-bg-300 h-2 w-full overflow-hidden rounded-full">
				<div
					className="bg-acc-100 h-full rounded-full transition-all duration-150"
					style={{ width: `${pct}%` }}
					role="progressbar"
					aria-valuenow={current}
					aria-valuemin={0}
					aria-valuemax={total}
					aria-label={t("sweepProgress", { current, total })}
				/>
			</div>

			{/* Footer: elapsed + estimated remaining */}
			<div className="flex items-center justify-between">
				<span className="text-tiny text-txt-300 tabular-nums">
					{t("sweepElapsed", { seconds: elapsedSeconds })}
				</span>
				<span className="text-tiny text-txt-300 tabular-nums">
					~{estimatedRemaining}s {t("sweepRemaining")}
				</span>
			</div>
		</div>
	)
})
SweepProgressBar.displayName = "SweepProgressBar"

export { SweepProgressBar }
