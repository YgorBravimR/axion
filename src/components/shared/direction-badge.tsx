import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { ArrowUpRight, ArrowDownRight } from "lucide-react"

type Direction = "long" | "short"

interface DirectionBadgeProps {
	direction: Direction
	showIcon?: boolean
	showLabel?: boolean
	label?: string
	size?: "sm" | "md" | "lg"
	className?: string
}

const sizeClasses = {
	sm: {
		icon: "h-3 w-3",
		text: "text-tiny",
		padding: "px-s-100 py-px",
	},
	md: {
		icon: "h-4 w-4",
		text: "text-small",
		padding: "px-s-200 py-s-100",
	},
	lg: {
		icon: "h-5 w-5",
		text: "text-body",
		padding: "px-s-300 py-s-200",
	},
}

/**
 * A badge component for displaying trade direction (long/short).
 * Supports icon-only, label-only, or combined display.
 *
 * @param direction - The trade direction
 * @param showIcon - Whether to show the direction icon
 * @param showLabel - Whether to show the direction label
 * @param label - Custom label text (defaults to direction)
 * @param size - Size variant
 * @param className - Additional CSS classes
 */
export const DirectionBadge = ({
	direction,
	showIcon = true,
	showLabel = true,
	label,
	size = "md",
	className,
}: DirectionBadgeProps) => {
	const t = useTranslations("common")
	const isLong = direction === "long"
	const sizes = sizeClasses[size]
	const displayLabel = label ?? (isLong ? t("long") : t("short"))

	const Icon = isLong ? ArrowUpRight : ArrowDownRight
	const colorClasses = isLong
		? "text-action-buy bg-action-buy/10"
		: "text-action-sell bg-action-sell/10"

	return (
		<span
			className={cn(
				"inline-flex items-center gap-s-100 rounded font-medium",
				sizes.padding,
				sizes.text,
				colorClasses,
				className
			)}
		>
			{showIcon && <Icon className={sizes.icon} />}
			{showLabel && <span>{displayLabel}</span>}
		</span>
	)
}

export { type DirectionBadgeProps, type Direction }
