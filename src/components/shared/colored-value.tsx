import { cn } from "@/lib/utils"

type ValueType = "currency" | "percent" | "r-multiple" | "number"

interface ColoredValueProps {
	value: number
	type?: ValueType
	showSign?: boolean
	size?: "xs" | "sm" | "md" | "lg" | "xl"
	className?: string
	formatFn?: (value: number) => string
	neutralThreshold?: number
}

const sizeClasses = {
	xs: "text-tiny",
	sm: "text-small",
	md: "text-body",
	lg: "text-h3",
	xl: "text-h2",
}

/**
 * Displays a numeric value with color coding based on positive/negative state.
 * Supports currency, percentage, R-multiple, and generic number formatting.
 *
 * @param value - The numeric value to display
 * @param type - The type of value for default formatting
 * @param showSign - Whether to show + sign for positive values
 * @param size - Text size variant
 * @param className - Additional CSS classes
 * @param formatFn - Custom formatting function (overrides type-based formatting)
 * @param neutralThreshold - Values within this threshold show neutral color (default: 0)
 */
export const ColoredValue = ({
	value,
	type = "number",
	showSign = false,
	size = "md",
	className,
	formatFn,
	neutralThreshold = 0,
}: ColoredValueProps) => {
	const isPositive = value > neutralThreshold
	const isNegative = value < -neutralThreshold
	const isNeutral = !isPositive && !isNegative

	const formatValue = (): string => {
		if (formatFn) {
			return formatFn(value)
		}

		const absValue = Math.abs(value)
		const sign = showSign && value > 0 ? "+" : value < 0 ? "-" : ""

		switch (type) {
			case "currency": {
				if (absValue >= 1_000_000) {
					return `${sign}$${(absValue / 1_000_000).toFixed(1)}M`
				}
				if (absValue >= 1_000) {
					return `${sign}$${(absValue / 1_000).toFixed(1)}K`
				}
				return `${sign}$${absValue.toFixed(2)}`
			}
			case "percent":
				return `${sign}${absValue.toFixed(1)}%`
			case "r-multiple":
				return `${sign}${absValue.toFixed(2)}R`
			case "number":
			default:
				return `${sign}${absValue.toLocaleString()}`
		}
	}

	const formattedValue = formatValue()
	const semanticLabel = isPositive ? "positive" : isNegative ? "negative" : "neutral"

	return (
		<span
			className={cn(
				"font-medium",
				sizeClasses[size],
				isPositive && "text-trade-buy",
				isNegative && "text-trade-sell",
				isNeutral && "text-txt-100",
				className
			)}
			aria-label={`${formattedValue} (${semanticLabel})`}
		>
			{formattedValue}
		</span>
	)
}

export { type ColoredValueProps, type ValueType }
