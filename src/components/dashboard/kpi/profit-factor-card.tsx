"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { useFormatting } from "@/hooks/use-formatting"
import { formatFinite } from "@/lib/formatting"
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
	const { formatCompactCurrency } = useFormatting()
	const colorClass = getThresholdColorClass(profitFactor, 1)
	const hasData = profitFactor !== null

	const subValue = useMemo(
		() =>
			hasData ? (
				<div className="gap-s-200 flex items-center">
					<span className="text-trade-buy">
						{t("avg")}: {formatCompactCurrency(avgWin ?? 0)}
					</span>
					|
					<span className="text-trade-sell">
						{formatCompactCurrency(avgLoss ?? 0)}
					</span>
				</div>
			) : undefined,
		[hasData, avgWin, avgLoss, t, formatCompactCurrency]
	)

	return (
		<StatCard
			label={t("profitFactor")}
			value={hasData ? formatFinite(profitFactor, 2, "--") : "--"}
			valueColorClass={colorClass}
			subValue={subValue}
		/>
	)
}

export { ProfitFactorCard }
