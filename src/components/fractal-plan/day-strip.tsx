interface DayStripItem {
	date: string
	dayLabel: string
	targetR: string | null
	actualR: string | null
	hasOverride: boolean
}

interface DayStripProps {
	days: readonly DayStripItem[]
	year: number
	quarter: number
	month: number
	isoWeek: number
	locale: string
}

const formatR = (v: string | null): string => {
	if (v == null) return "—"
	const n = Number(v)
	return Number.isFinite(n) ? `${n.toFixed(1)}R` : "—"
}

const DayStrip = ({ days, year, quarter, month, isoWeek, locale }: DayStripProps) => {
	if (days.length === 0) {
		return <p className="text-tiny text-txt-300">No days populated yet.</p>
	}
	return (
		<div className="grid grid-cols-1 gap-s-200 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
			{days.map((d) => {
				const href = `/${locale}/plan/${year}/${quarter}/${month}/${isoWeek}/${d.date}`
				const actualNum = d.actualR != null ? Number(d.actualR) : null
				return (
					<a
						key={d.date}
						href={href}
						className="rounded-md border border-bg-300 bg-bg-200 p-s-300 hover:border-acc-100/40 hover:bg-bg-300"
					>
						<div className="flex items-baseline justify-between">
							<span className="text-tiny font-medium text-txt-200">{d.dayLabel}</span>
							{d.hasOverride ? (
								<span className="text-tiny text-acc-100" aria-label="has override">●</span>
							) : null}
						</div>
						<div className="mt-1 flex items-baseline justify-between">
							<span className="text-tiny text-txt-300">T</span>
							<span className="font-mono text-tiny text-txt-100">{formatR(d.targetR)}</span>
						</div>
						<div className="mt-1 flex items-baseline justify-between">
							<span className="text-tiny text-txt-300">A</span>
							<span
								className={`font-mono text-tiny ${
									actualNum != null && actualNum > 0
										? "text-fb-success"
										: actualNum != null && actualNum < 0
											? "text-fb-error"
											: "text-txt-100"
								}`}
							>
								{formatR(d.actualR)}
							</span>
						</div>
					</a>
				)
			})}
		</div>
	)
}

export type { DayStripItem, DayStripProps }
export { DayStrip }
