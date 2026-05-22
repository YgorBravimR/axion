"use client"

import { useTranslations } from "next-intl"
import { useFormatting } from "@/hooks/use-formatting"
import { StatCard, type StatCardProps } from "@/components/shared"
import { getValueColorClass } from "./helpers"

interface PnlCardProps {
	grossPnl: number | null
	size?: StatCardProps["size"]
	className?: string
}

const PnlCard = ({ grossPnl, size, className }: PnlCardProps) => {
	const t = useTranslations("dashboard.kpi")
	const { formatCompactCurrency } = useFormatting()
	const grossColor = getValueColorClass(grossPnl)

	return (
		<StatCard
			label={t("pnl")}
			value={grossPnl !== null ? formatCompactCurrency(grossPnl) : "--"}
			valueColorClass={grossColor}
			size={size}
			className={className}
		/>
	)
}

export { PnlCard }
