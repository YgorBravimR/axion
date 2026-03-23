"use client"

import { useTranslations } from "next-intl"
import { formatCompactCurrency } from "@/lib/formatting"
import { StatCard } from "@/components/shared"
import { getValueColorClass } from "./helpers"

interface PnlCardProps {
	grossPnl: number | null
}

/**
 * P&L card showing the Gross value.
 * Accent border color is driven by the gross P&L.
 */
const PnlCard = ({ grossPnl }: PnlCardProps) => {
	const t = useTranslations("dashboard.kpi")
	const grossColor = getValueColorClass(grossPnl)

	return (
		<StatCard
			label={t("pnl")}
			value={
				grossPnl !== null
					? formatCompactCurrency(grossPnl, "R$")
					: "--"
			}
			valueColorClass={grossColor}
		/>
	)
}

export { PnlCard }
