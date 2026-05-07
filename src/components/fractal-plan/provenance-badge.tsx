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

const ProvenanceBadge = ({
	level,
	isOverride = false,
}: ProvenanceBadgeProps) => {
	if (level === "none") {
		return null
	}
	if (!isOverride) {
		return null
	}
	const label = LEVEL_LABEL[level]
	const text = `override at ${label}`
	return (
		<span
			aria-label={`source: ${text}`}
			className="bg-acc-100/15 text-micro text-acc-100 inline-flex items-center rounded-md px-1.5 py-0.5 tracking-wide uppercase"
		>
			{text}
		</span>
	)
}

export type { CascadeLevel, ProvenanceBadgeProps }
export { ProvenanceBadge }
