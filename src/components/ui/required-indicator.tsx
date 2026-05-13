import { cn } from "@/lib/utils"

interface RequiredIndicatorProps {
	filled: boolean
	className?: string
}

/**
 * Renders a "*" indicator for required fields.
 * Uses the verdict triad — never trade-color tokens — because filled/empty
 * is a verdict on form state, not signed money polarity.
 * - text-fb-error when the field is empty (verdict-bad)
 * - text-fb-success when the field is filled (verdict-good)
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
			"text-small ml-0.5 font-bold transition-colors duration-200",
			filled ? "text-fb-success" : "text-fb-error",
			className
		)}
		aria-hidden="true"
	>
		*
	</span>
)

export { RequiredIndicator }
