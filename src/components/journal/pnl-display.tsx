import { cn } from "@/lib/utils"
import { formatCurrency, formatPercent } from "@/lib/calculations"

interface PnLDisplayProps {
	value: number
	showSign?: boolean
	size?: "sm" | "md" | "lg" | "xl"
	showPercent?: boolean
	percentValue?: number
	className?: string
}

const sizeClasses = {
	sm: "text-small",
	md: "text-body",
	lg: "text-h3",
	xl: "text-h2",
}

export const PnLDisplay = ({
	value,
	showSign = true,
	size = "md",
	showPercent = false,
	percentValue,
	className,
}: PnLDisplayProps) => {
	const isPositive = value > 0
	const isNegative = value < 0

	const formattedValue = formatCurrency(Math.abs(value))
	const sign = showSign ? (isPositive ? "+" : isNegative ? "-" : "") : ""
	const displayValue = `${sign}${formattedValue.replace("-", "")}`

	return (
		<span
			className={cn(
				"font-semibold",
				sizeClasses[size],
				isPositive && "text-trade-buy",
				isNegative && "text-trade-sell",
				!isPositive && !isNegative && "text-txt-100",
				className
			)}
		>
			{displayValue}
			{showPercent && percentValue !== undefined && (
				<span className="ml-s-100 text-txt-300">
					({formatPercent(percentValue)})
				</span>
			)}
		</span>
	)
}
