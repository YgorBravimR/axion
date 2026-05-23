"use client"

import { useTranslations } from "next-intl"
import { useFormatting } from "@/hooks/use-formatting"
import { StatCard, type StatCardProps } from "@/components/shared"
import { getValueColorClass } from "./helpers"

interface CapitalCardProps {
	/** Initial capital (sum of starting balances) in cents. */
	initialCapitalCents: number
	/** Current capital = initial + all-time net P&L, in cents. */
	currentCapitalCents: number
	size?: StatCardProps["size"]
	className?: string
}

/**
 * Single compact card that surfaces both Capital Inicial and Capital Atual:
 * primary value is the current capital, subValue exposes the starting capital
 * and the delta. Replaces the previous two-card hero strip.
 */
const CapitalCard = ({
	initialCapitalCents,
	currentCapitalCents,
	size = "md",
	className,
}: CapitalCardProps) => {
	const t = useTranslations("dashboard.kpi")
	const { formatCompactCurrency, formatCompactCurrencyWithSign } =
		useFormatting()

	const deltaCents = currentCapitalCents - initialCapitalCents
	const deltaColor = getValueColorClass(deltaCents)

	return (
		<StatCard
			label={t("capital")}
			value={formatCompactCurrency(currentCapitalCents / 100)}
			subValue={
				<span className="gap-s-200 flex items-center">
					<span>
						{t("capitalInicialShort")}{" "}
						{formatCompactCurrency(initialCapitalCents / 100)}
					</span>
					<span aria-hidden="true">·</span>
					<span className={deltaColor}>
						{formatCompactCurrencyWithSign(deltaCents / 100)}
					</span>
				</span>
			}
			size={size}
			className={className}
		/>
	)
}

export { CapitalCard }
