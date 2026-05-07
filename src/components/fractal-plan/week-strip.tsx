interface WeekStripItem {
	isoWeek: number
	isoYear: number
	targetR: string | null
	actualR: string | null
}

interface WeekStripProps {
	weeks: readonly WeekStripItem[]
}

const formatR = (v: string | null): string => {
	if (v == null) return "—"
	const n = Number(v)
	return Number.isFinite(n) ? `${n.toFixed(1)}R` : "—"
}

const WeekStrip = ({ weeks }: WeekStripProps) => {
	if (weeks.length === 0) {
		return <p className="text-tiny text-txt-300">No weeks seeded for this month.</p>
	}
	return (
		<div className="grid grid-cols-2 gap-s-200 sm:grid-cols-4 lg:grid-cols-5">
			{weeks.map((w) => {
				const actualNum = w.actualR != null ? Number(w.actualR) : null
				const positive = actualNum != null && actualNum > 0
				const negative = actualNum != null && actualNum < 0
				return (
					<div
						key={`${w.isoYear}-${w.isoWeek}`}
						className="rounded-md border border-bg-300 bg-bg-200 p-s-300"
					>
						<div className="text-tiny text-txt-300">Week {w.isoWeek}</div>
						<div className="mt-1 flex items-baseline justify-between">
							<span className="text-tiny text-txt-200">Target</span>
							<span className="font-mono text-sm text-txt-100">{formatR(w.targetR)}</span>
						</div>
						<div className="mt-1 flex items-baseline justify-between">
							<span className="text-tiny text-txt-200">Actual</span>
							<span
								className={`font-mono text-sm ${
									positive ? "text-fb-success" : negative ? "text-fb-error" : "text-txt-100"
								}`}
							>
								{formatR(w.actualR)}
							</span>
						</div>
					</div>
				)
			})}
		</div>
	)
}

export type { WeekStripItem, WeekStripProps }
export { WeekStrip }
