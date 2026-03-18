"use client"

import { useTranslations } from "next-intl"
import { Dices } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { SimulationParamsV2 } from "@/types/monte-carlo"

interface V2ResultsSummaryProps {
	params: SimulationParamsV2
	onRunAgain: () => void
}

const V2ResultsSummary = ({ params, onRunAgain }: V2ResultsSummaryProps) => {
	const t = useTranslations("monteCarlo.v2.results")

	const { profile } = params
	const impliedPF =
		profile.winRate > 0 && profile.winRate < 100
			? (
					(profile.winRate / 100) *
					profile.rewardRiskRatio /
					(1 - profile.winRate / 100)
				).toFixed(2)
			: null

	return (
		<div id="monte-carlo-v2-summary" className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-500 gap-x-s-300 sm:gap-x-m-500 gap-y-s-200 sm:gap-y-s-300 flex flex-wrap items-center justify-between rounded-lg border">
			<div className="min-w-0 gap-s-200 flex items-center">
				<span className="text-txt-300 text-small">{t("profileName")}:</span>
				<span className="text-acc-100 font-medium">
					{profile.name}
				</span>
			</div>
			<div className="min-w-0 gap-s-200 flex items-center">
				<span className="text-txt-300 text-small">{t("simulations")}:</span>
				<span className="text-txt-100 font-medium">
					{params.simulationCount.toLocaleString()}
				</span>
			</div>
			<div className="min-w-0 gap-s-200 flex items-center">
				<span className="text-txt-300 text-small">{t("winRate")}:</span>
				<span className="text-txt-100 font-medium">
					{profile.winRate}%
				</span>
			</div>
			<div className="min-w-0 gap-s-200 flex items-center">
				<span className="text-txt-300 text-small">{t("rewardRisk")}:</span>
				<span className="text-txt-100 font-medium">
					1:{profile.rewardRiskRatio.toFixed(2)}
				</span>
			</div>
			{impliedPF && (
				<div className="gap-s-200 flex items-center">
					<span className="text-txt-300 text-small">{t("profitFactor")}:</span>
					<span className="text-txt-100 font-medium">{impliedPF}</span>
				</div>
			)}
			{profile.breakevenRate > 0 && (
				<div className="gap-s-200 flex items-center">
					<span className="text-txt-300 text-small">{t("breakevenRate")}:</span>
					<span className="text-txt-100 font-medium">{profile.breakevenRate}%</span>
				</div>
			)}
			<div className="min-w-0 gap-s-200 flex items-center">
				<span className="text-txt-300 text-small">{t("daysPerMonth")}:</span>
				<span className="text-txt-100 font-medium">
					{profile.tradingDaysPerMonth}
				</span>
			</div>
			{params.monthsToTrade > 1 && (
				<div className="gap-s-200 flex items-center">
					<span className="text-txt-300 text-small">{t("months")}:</span>
					<span className="text-acc-100 font-medium">
						{params.monthsToTrade}
					</span>
				</div>
			)}
			<Button
				id="monte-carlo-v2-run-again"
				variant="outline"
				size="sm"
				onClick={onRunAgain}
			>
				<Dices className="mr-s-100 h-4 w-4" />
				{t("runAgain")}
			</Button>
		</div>
	)
}

export { V2ResultsSummary }
