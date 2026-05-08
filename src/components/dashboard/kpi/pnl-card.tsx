"use client"

import { useTranslations } from "next-intl"
import { formatCompactCurrency } from "@/lib/formatting"
import { StatCard, type StatCardProps } from "@/components/shared"
import { getValueColorClass } from "./helpers"

interface PnlCardProps {
	grossPnl: number | null
	size?: StatCardProps["size"]
	className?: string
}

const getAccentBorder = (value: number | null): string | undefined => {
	if (value === null) {
		return undefined
	}
	if (value > 0) {
		return "border-l-trade-buy"
	}
	if (value < 0) {
		return "border-l-trade-sell"
	}
	return undefined
}

const PnlCard = ({ grossPnl, size, className }: PnlCardProps) => {
	const t = useTranslations("dashboard.kpi")
	const grossColor = getValueColorClass(grossPnl)

	return (
		<StatCard
			label={t("pnl")}
			value={grossPnl !== null ? formatCompactCurrency(grossPnl, "R$") : "--"}
			valueColorClass={grossColor}
			accentColorClass={getAccentBorder(grossPnl)}
			size={size}
			className={className}
		/>
	)
}

export { PnlCard }
