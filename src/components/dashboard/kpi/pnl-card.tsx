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

const PnlCard = ({ grossPnl, size, className }: PnlCardProps) => {
	const t = useTranslations("dashboard.kpi")
	const grossColor = getValueColorClass(grossPnl)

	return (
		<StatCard
			label={t("pnl")}
			value={grossPnl !== null ? formatCompactCurrency(grossPnl, "R$") : "--"}
			valueColorClass={grossColor}
			size={size}
			className={className}
		/>
	)
}

export { PnlCard }
