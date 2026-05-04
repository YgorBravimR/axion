type CascadeLevel = "year" | "quarter" | "month" | "week" | "day" | "none"

interface ProvenanceBadgeProps {
	level: CascadeLevel
	isOverride?: boolean
}

const LEVEL_LABEL: Record<Exclude<CascadeLevel, "none">, string> = {
	year: "Year",
	quarter: "Quarter",
	month: "Month",
	week: "Week",
	day: "Day",
}

const ProvenanceBadge = ({ level, isOverride = false }: ProvenanceBadgeProps) => {
	if (level === "none") return null
	const label = LEVEL_LABEL[level]
	const text = isOverride ? `override at ${label}` : `from ${label}`
	return (
		<span
			aria-label={`source: ${text}`}
			className="inline-flex items-center rounded-md bg-bg-200 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-text-200"
		>
			{text}
		</span>
	)
}

export type { CascadeLevel, ProvenanceBadgeProps }
export { ProvenanceBadge }
