import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface TradeMetricProps {
	label: string
	value: string | number
	subValue?: string
	icon?: ReactNode
	variant?: "default" | "positive" | "negative" | "neutral"
	size?: "sm" | "md" | "lg"
	className?: string
}

const variantClasses = {
	default: "text-txt-100",
	positive: "text-trade-buy",
	negative: "text-trade-sell",
	neutral: "text-txt-200",
}

const sizeClasses = {
	sm: {
		label: "text-tiny",
		value: "text-small",
	},
	md: {
		label: "text-small",
		value: "text-body",
	},
	lg: {
		label: "text-small",
		value: "text-h3",
	},
}

export const TradeMetric = ({
	label,
	value,
	subValue,
	icon,
	variant = "default",
	size = "md",
	className,
}: TradeMetricProps) => {
	return (
		<div className={cn("flex flex-col", className)}>
			<span className={cn("text-txt-300", sizeClasses[size].label)}>
				{label}
			</span>
			<div className="flex items-center gap-s-200">
				{icon && <span className="text-txt-300">{icon}</span>}
				<span
					className={cn(
						"font-medium",
						sizeClasses[size].value,
						variantClasses[variant]
					)}
				>
					{value}
				</span>
				{subValue && (
					<span className="text-tiny text-txt-300">({subValue})</span>
				)}
			</div>
		</div>
	)
}
