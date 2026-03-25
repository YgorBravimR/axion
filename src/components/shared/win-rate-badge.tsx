import { cn } from "@/lib/utils"

interface WinRateBadgeProps {
	winRate: number
	threshold?: number
	size?: "sm" | "md" | "lg"
	className?: string
}

const sizeClasses = {
	sm: "text-tiny",
	md: "text-small",
	lg: "text-body",
}

/**
 * Displays a win rate percentage with color coding.
 * Shows green when above threshold, red when below.
 *
 * @param winRate - The win rate percentage (0-100)
 * @param threshold - The threshold for color coding (default: 50)
 * @param size - Text size variant
 * @param className - Additional CSS classes
 */
export const WinRateBadge = ({
	winRate,
	threshold = 50,
	size = "md",
	className,
}: WinRateBadgeProps) => {
	const isAboveThreshold = winRate >= threshold

	const displayValue = `${winRate.toFixed(0)}%`

	return (
		<span
			className={cn(
				"font-medium",
				sizeClasses[size],
				isAboveThreshold ? "text-trade-buy" : "text-trade-sell",
				className
			)}
			aria-label={`${displayValue} (${isAboveThreshold ? "above" : "below"} ${threshold}% threshold)`}
		>
			{displayValue}
		</span>
	)
}

export { type WinRateBadgeProps }
