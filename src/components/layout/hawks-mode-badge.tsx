"use client"

import { useTranslations } from "next-intl"
import { Crosshair } from "lucide-react"
import { cn } from "@/lib/utils"

interface HawksModeBadgeProps {
	mode: "default" | "hawks"
	variant?: "compact" | "full"
	className?: string
}

const HawksModeBadge = ({
	mode,
	variant = "full",
	className,
}: HawksModeBadgeProps) => {
	const t = useTranslations("hawksMode.badge")

	if (mode !== "hawks") return null

	const isCompact = variant === "compact"

	return (
		<span
			role="status"
			aria-label={t("aria")}
			className={cn(
				"border-acc-100/40 bg-acc-100/10 text-acc-100 inline-flex items-center gap-s-100 rounded-full border font-medium",
				isCompact ? "h-6 px-s-200 text-fs-100" : "h-7 px-s-300 text-fs-100",
				className
			)}
		>
			<Crosshair className={isCompact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden="true" />
			<span className={isCompact ? "sr-only md:not-sr-only" : ""}>{t("label")}</span>
		</span>
	)
}

export { HawksModeBadge }
export type { HawksModeBadgeProps }
