"use client"

import { cn } from "@/lib/utils"
import { Loader2 } from "lucide-react"
import { useTranslations } from "next-intl"

interface LoadingSpinnerProps {
	size?: "sm" | "md" | "lg"
	className?: string
	label?: string
}

const sizeClasses = {
	sm: "h-4 w-4",
	md: "h-6 w-6",
	lg: "h-8 w-8",
}

/**
 * A reusable loading spinner component with optional label.
 *
 * @param size - Size variant (sm, md, lg)
 * @param className - Additional CSS classes for the container
 * @param label - Optional loading text to display (will append ellipsis if not present)
 */
export const LoadingSpinner = ({
	size = "md",
	className,
	label,
}: LoadingSpinnerProps) => {
	const tCommon = useTranslations("common")
	const displayLabel = label && !label.endsWith("\u2026") ? `${label}\u2026` : label

	return (
		<div className={cn("flex items-center justify-center", className)} role="status" aria-live="polite">
			<Loader2
				className={cn("animate-spin motion-reduce:animate-none text-txt-300", sizeClasses[size])}
				aria-hidden="true"
			/>
			{displayLabel && (
				<span className="ml-s-200 text-small text-txt-300">{displayLabel}</span>
			)}
			{!displayLabel && <span className="sr-only">{tCommon("loading")}</span>}
		</div>
	)
}

export { type LoadingSpinnerProps }
