import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { LucideIcon } from "lucide-react"

interface EmptyStateProps {
	icon?: LucideIcon
	title: string
	description?: string
	action?: ReactNode
	className?: string
}

/**
 * A reusable empty state component for displaying when no data is available.
 * Supports an optional icon, description, and action button.
 *
 * @param icon - Optional Lucide icon component
 * @param title - Main message to display
 * @param description - Optional secondary description
 * @param action - Optional action element (e.g., button)
 * @param className - Additional CSS classes
 */
export const EmptyState = ({
	icon: Icon,
	title,
	description,
	action,
	className,
}: EmptyStateProps) => {
	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center text-center",
				className
			)}
			role="status"
		>
			{Icon && (
				<div className="mb-m-400">
					<Icon className="size-8 text-txt-300" />
				</div>
			)}
			<p className="text-body text-txt-200">{title}</p>
			{description && (
				<p className="mt-s-200 text-small text-txt-300">{description}</p>
			)}
			{action && <div className="mt-m-400">{action}</div>}
		</div>
	)
}

export { type EmptyStateProps }
