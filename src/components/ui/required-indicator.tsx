import { cn } from "@/lib/utils"

interface RequiredIndicatorProps {
	filled: boolean
	className?: string
}

/**
 * Renders a "*" indicator for required fields.
 * - Red (text-fb-error) when the field is empty
 * - Green (text-trade-buy) when the field is filled
 *
 * Usage with Label:
 *   <Label required filled={!!value}>Field Name</Label>
 *
 * Usage standalone:
 *   <RequiredIndicator filled={!!value} />
 */
const RequiredIndicator = ({ filled, className }: RequiredIndicatorProps) => (
	<span
		className={cn(
			"ml-0.5 text-sm font-bold transition-colors duration-200",
			filled ? "text-trade-buy" : "text-fb-error",
			className,
		)}
		aria-hidden="true"
	>
		*
	</span>
)

export { RequiredIndicator }
