import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"

type CascadeLevel = "year" | "quarter" | "month" | "week" | "day" | "none"

interface ProvenanceBadgeProps {
	level: CascadeLevel
	isOverride?: boolean
	showNonOverride?: boolean
}

const LEVEL_LABEL: Record<Exclude<CascadeLevel, "none">, string> = {
	year: "Year",
	quarter: "Quarter",
	month: "Month",
	week: "Week",
	day: "Day",
}

const LEVEL_TOOLTIP: Record<Exclude<CascadeLevel, "none">, string> = {
	year: "Cascaded from annual plan",
	quarter: "Cascaded from quarterly plan",
	month: "Set at monthly level",
	week: "Set at weekly level",
	day: "Set at daily level",
}

const ProvenanceBadge = ({
	level,
	isOverride = false,
	showNonOverride = false,
}: ProvenanceBadgeProps) => {
	if (level === "none") {
		return null
	}

	const label = LEVEL_LABEL[level]
	const tooltip = LEVEL_TOOLTIP[level]

	if (isOverride) {
		const text = `override at ${label}`
		return (
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						aria-label={`source: ${text}`}
						className="bg-acc-100/15 text-micro text-acc-100 px-s-200 inline-flex items-center rounded-md py-px tracking-wide uppercase"
					>
						{text}
					</span>
				</TooltipTrigger>
				<TooltipContent
					id={`tooltip-provenance-override-${level}`}
					side="top"
					className="text-tiny max-w-xs"
				>
					Manual override set at {label} level. Falls back to parent if cleared.
				</TooltipContent>
			</Tooltip>
		)
	}

	if (!showNonOverride) {
		return null
	}

	// Non-override provenance: lighter badge, informational only
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span
					aria-label={`source: ${tooltip}`}
					className="bg-txt-300/15 text-micro text-txt-300 px-s-200 inline-flex items-center rounded-md py-px tracking-wide uppercase"
				>
					{label}
				</span>
			</TooltipTrigger>
			<TooltipContent
				id={`tooltip-provenance-${level}`}
				side="top"
				className="text-tiny max-w-xs"
			>
				{tooltip}
			</TooltipContent>
		</Tooltip>
	)
}

export type { CascadeLevel, ProvenanceBadgeProps }
export { ProvenanceBadge }
