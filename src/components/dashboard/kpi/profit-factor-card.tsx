"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { useFormatting } from "@/hooks/use-formatting"
import { formatFinite } from "@/lib/formatting"
import { StatCard } from "@/components/shared"
import { cn } from "@/lib/utils"
import { getThresholdColorClass } from "./helpers"

interface ProfitFactorBarProps {
	value: number
	colorClass: string
}

const BG_COLOR_MAP: Record<string, string> = {
	"text-trade-buy": "bg-trade-buy",
	"text-trade-sell": "bg-trade-sell",
}

/**
 * Thin horizontal bar that visualizes Profit Factor on a 0..3 scale.
 * PF = 1.0 is the breakeven line; 2.0 (50% fill) is a healthy edge;
 * 3.0+ (100% fill) is exceptional. Clamped so a runaway PF doesn't
 * paint the whole row green.
 */
const ProfitFactorBar = ({ value, colorClass }: ProfitFactorBarProps) => {
	const width = Math.min(Math.max(value, 0) / 3, 1) * 100
	const bgClass = BG_COLOR_MAP[colorClass] ?? "bg-txt-300"

	return (
		<div className="bg-bg-300 h-1 w-full overflow-hidden rounded-full">
			<div
				className={cn(bgClass, "h-full rounded-full")}
				style={{ width: `${width}%` }}
			/>
		</div>
	)
}

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
				<div className="gap-s-200 flex flex-col">
					<div className="gap-s-200 flex items-center">
						<span className="text-trade-buy">
							{t("avg")}: {formatCompactCurrency(avgWin ?? 0)}
						</span>
						<span aria-hidden="true">·</span>
						<span className="text-trade-sell">
							{formatCompactCurrency(avgLoss ?? 0)}
						</span>
					</div>
					<ProfitFactorBar value={profitFactor} colorClass={colorClass} />
				</div>
			) : undefined,
		[
			hasData,
			avgWin,
			avgLoss,
			profitFactor,
			colorClass,
			t,
			formatCompactCurrency,
		]
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
