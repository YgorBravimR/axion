import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, Minus } from "lucide-react"

type TrendType = "up" | "down" | "stable"

interface StatCardProps {
	label: string
	value: string | ReactNode
	subValue?: string | ReactNode
	trend?: TrendType
	valueColorClass?: string
	accentColorClass?: string
	indicator?: ReactNode
	size?: "sm" | "md" | "lg"
	className?: string
}

const sizeClasses = {
	sm: {
		container: "p-s-200 sm:p-s-300",
		label: "text-tiny",
		value: "text-small",
		subValue: "text-tiny",
	},
	md: {
		container: "p-s-300 sm:p-m-400 lg:p-m-500",
		label: "text-tiny",
		value: "text-body sm:text-h3",
		subValue: "text-tiny",
	},
	lg: {
		container: "p-m-400 sm:p-m-500 lg:p-m-600",
		label: "text-tiny sm:text-small",
		value: "text-h3 sm:text-h2",
		subValue: "text-tiny sm:text-small",
	},
}

interface TrendIconProps {
	trend: TrendType
}

const TrendIcon = ({ trend }: TrendIconProps) => {
	switch (trend) {
		case "up":
			return <TrendingUp className="h-4 w-4 text-trade-buy" />
		case "down":
			return <TrendingDown className="h-4 w-4 text-trade-sell" />
		case "stable":
			return <Minus className="h-4 w-4 text-txt-300" />
	}
}

/**
 * A reusable stat card component for displaying KPI metrics.
 * Uses a two-zone flex layout: top zone (label + value + optional indicator)
 * and bottom zone (subValue), pushed apart by justify-between for consistent
 * bottom alignment across sibling cards.
 *
 * @param label - The stat label/title
 * @param value - The main value (can be string or ReactNode)
 * @param subValue - Optional secondary value or description (string or ReactNode)
 * @param trend - Optional trend indicator (up, down, stable)
 * @param valueColorClass - Optional color class for the value
 * @param accentColorClass - Optional left border color class (e.g. "border-l-trade-buy")
 * @param indicator - Optional element rendered top-right alongside label+value block
 * @param size - Size variant (sm, md, lg)
 * @param className - Additional CSS classes
 */
const StatCard = ({
	label,
	value,
	subValue,
	trend,
	valueColorClass,
	accentColorClass,
	indicator,
	size = "md",
	className,
}: StatCardProps) => {
	const sizes = sizeClasses[size]

	const labelAndValue = (
		<div className="min-w-0">
			<span className={cn("font-medium uppercase tracking-wider text-txt-300", sizes.label)}>
				{label}
			</span>
			<div className="mt-s-100 flex items-baseline gap-s-200">
				{typeof value === "string" ? (
					<p className={cn("font-semibold", sizes.value, valueColorClass || "text-txt-100")}>
						{value}
					</p>
				) : (
					value
				)}
				{trend && <TrendIcon trend={trend} />}
			</div>
		</div>
	)

	return (
		<div
			className={cn(
				"rounded-xl border border-bg-300 bg-bg-200 min-w-0 flex flex-col justify-between",
				accentColorClass && "border-l-2",
				accentColorClass,
				sizes.container,
				className
			)}
			aria-label={label}
		>
			{indicator ? (
				<div className="flex justify-between items-start gap-s-200">
					{labelAndValue}
					<div className="shrink-0">{indicator}</div>
				</div>
			) : (
				labelAndValue
			)}
			{subValue && (
				typeof subValue === "string" ? (
					<p className={cn("text-txt-300", sizes.subValue)}>{subValue}</p>
				) : (
					<div className={cn("text-txt-300", sizes.subValue)}>{subValue}</div>
				)
			)}
		</div>
	)
}

export { StatCard, TrendIcon, type StatCardProps, type TrendType }
