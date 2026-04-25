"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { formatCompactCurrency } from "@/lib/formatting"
import { StatCard } from "@/components/shared"
import { getThresholdColorClass } from "./helpers"

interface ProfitFactorCardProps {
	profitFactor: number | null
	avgWin: number | null
	avgLoss: number | null
}

const ProfitFactorCard = ({
	profitFactor,
	avgWin,
	avgLoss,
}: ProfitFactorCardProps) => {
	const t = useTranslations("dashboard.kpi")
	const colorClass = getThresholdColorClass(profitFactor, 1)
	const hasData = profitFactor !== null

	const subValue = useMemo(
		() =>
			hasData ? (
				<div className="flex items-center gap-s-200">
					<span className="text-trade-buy">
						{t("avg")}: {formatCompactCurrency(avgWin ?? 0, "R$")}
					</span>
					|
					<span className="text-trade-sell">
						{formatCompactCurrency(avgLoss ?? 0, "R$")}
					</span>
				</div>
			) : undefined,
		[hasData, avgWin, avgLoss, t]
	)

	return (
		<StatCard
			label={t("profitFactor")}
			value={hasData ? profitFactor.toFixed(2) : "--"}
			valueColorClass={colorClass}
			subValue={subValue}
		/>
	)
}

export { ProfitFactorCard }
