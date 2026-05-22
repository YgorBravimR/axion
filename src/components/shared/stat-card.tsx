import { memo, useMemo } from "react"
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
		value: "text-h3",
		subValue: "text-tiny",
	},
	lg: {
		container: "p-m-400 sm:p-m-500 lg:p-m-600",
		label: "text-tiny sm:text-small",
		value: "text-h2 sm:text-h1",
		subValue: "text-tiny sm:text-small",
	},
}

interface TrendIconProps {
	trend: TrendType
}

const TrendIcon = ({ trend }: TrendIconProps) => {
	switch (trend) {
		case "up":
			return <TrendingUp className="text-trade-buy h-4 w-4" />
		case "down":
			return <TrendingDown className="text-trade-sell h-4 w-4" />
		case "stable":
			return <Minus className="text-txt-300 h-4 w-4" />
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
 * @param indicator - Optional element rendered top-right alongside label+value block
 * @param size - Size variant (sm, md, lg)
 * @param className - Additional CSS classes
 */
const StatCard = memo(
	({
		label,
		value,
		subValue,
		trend,
		valueColorClass,
		indicator,
		size = "md",
		className,
	}: StatCardProps) => {
		const sizes = sizeClasses[size]

		const { labelId, valueId } = useMemo(() => {
			const slug = label.toLowerCase().replace(/\s+/g, "-")
			return {
				labelId: `stat-label-${slug}`,
				valueId: `stat-value-${slug}`,
			}
		}, [label])

		const labelAndValue = (
			<dl className="min-w-0">
				<dt
					id={labelId}
					className={cn(
						"text-txt-300 font-medium tracking-wide uppercase",
						sizes.label
					)}
				>
					{label}
				</dt>
				<div className="mt-s-100 gap-s-200 flex items-baseline">
					{typeof value === "string" ? (
						<dd
							id={valueId}
							className={cn(
								"font-semibold",
								sizes.value,
								valueColorClass || "text-txt-100"
							)}
						>
							{value}
						</dd>
					) : (
						<dd id={valueId}>{value}</dd>
					)}
					{trend && <TrendIcon trend={trend} />}
				</div>
			</dl>
		)

		return (
			<div
				className={cn(
					"border-bg-300 bg-bg-200 flex min-w-0 flex-col justify-between rounded-xl border",
					sizes.container,
					className
				)}
				role="region"
				aria-labelledby={`${labelId} ${valueId}`}
			>
				{indicator ? (
					<div className="gap-s-200 flex items-start justify-between">
						{labelAndValue}
						<div className="shrink-0">{indicator}</div>
					</div>
				) : (
					labelAndValue
				)}
				{subValue &&
					(typeof subValue === "string" ? (
						<p className={cn("text-txt-300", sizes.subValue)}>{subValue}</p>
					) : (
						<div className={cn("text-txt-300", sizes.subValue)}>{subValue}</div>
					))}
			</div>
		)
	}
)

StatCard.displayName = "StatCard"

export { StatCard, TrendIcon, type StatCardProps, type TrendType }
