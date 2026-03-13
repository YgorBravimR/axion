"use client"

import { useTranslations } from "next-intl"
import { formatCompactCurrency } from "@/lib/formatting"
import { StatCard } from "@/components/shared"
import { getValueColorClass } from "./helpers"

interface PnlCardProps {
	grossPnl: number | null
	netPnl: number | null
}

/**
 * Merged P&L card showing both Gross and Net values.
 * Accent border color is driven by the net P&L (the "bottom line").
 */
const PnlCard = ({ grossPnl, netPnl }: PnlCardProps) => {
	const t = useTranslations("dashboard.kpi")
	const netColor = getValueColorClass(netPnl)
	const grossColor = getValueColorClass(grossPnl)

	const hasData = grossPnl !== null && netPnl !== null

	return (
		<StatCard
			label={t("pnl")}
			value={
				hasData ? (
					<div className="grid w-full grid-cols-2 gap-0.5">
						<div className="gap-s-200 flex flex-col items-center">
							<p className="text-tiny text-txt-300 font-medium">{t("gross")}</p>
							<p className={`text-body sm:text-h3 font-bold ${grossColor}`}>
								{formatCompactCurrency(grossPnl, "R$")}
							</p>
						</div>
						<div className="gap-s-200 flex flex-col items-center">
							<p className="text-tiny text-txt-300 font-medium">{t("net")}</p>
							<p className={`text-body sm:text-h3 font-bold ${netColor}`}>
								{formatCompactCurrency(netPnl, "R$")}
							</p>
						</div>
					</div>
				) : (
					"--"
				)
			}
			valueColorClass={netColor}
		/>
	)
}

export { PnlCard }
