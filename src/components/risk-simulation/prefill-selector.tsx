"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { MonthlyPlan } from "@/db/schema"
import type { RiskManagementProfile } from "@/types/risk-profile"
import type { PrefillSource, RiskSimulationParams } from "@/types/risk-simulation"

interface PrefillSelectorProps {
	monthlyPlan: MonthlyPlan | null
	riskProfiles: RiskManagementProfile[]
	onSelect: (params: RiskSimulationParams, source: PrefillSource, profileId?: string) => void
	activeSource: PrefillSource | null
	activeProfileId: string | null
}

const PrefillSelector = ({
	monthlyPlan,
	riskProfiles,
	onSelect,
	activeSource,
	activeProfileId,
}: PrefillSelectorProps) => {
	const t = useTranslations("riskSimulation.config")

	const handleSelectMonthlyPlan = () => {
		if (!monthlyPlan) return

		const balance = Number(monthlyPlan.accountBalance)
		const riskPercent = parseFloat(monthlyPlan.riskPerTradePercent)
		const dailyLossPercent = parseFloat(monthlyPlan.dailyLossPercent)
		const monthlyLossPercent = parseFloat(monthlyPlan.monthlyLossPercent)
		const dailyProfitTargetPercent = monthlyPlan.dailyProfitTargetPercent
			? parseFloat(monthlyPlan.dailyProfitTargetPercent)
			: null
		const weeklyLossPercent = monthlyPlan.weeklyLossPercent
			? parseFloat(monthlyPlan.weeklyLossPercent)
			: null
		const reductionFactor = monthlyPlan.riskReductionFactor
			? parseFloat(monthlyPlan.riskReductionFactor)
			: 0.5
		const reinvestPercent = monthlyPlan.profitReinvestmentPercent
			? parseFloat(monthlyPlan.profitReinvestmentPercent)
			: null

		onSelect(
			{
				mode: "simple",
				accountBalanceCents: balance,
				riskPerTradePercent: riskPercent,
				dailyLossPercent,
				dailyProfitTargetPercent,
				maxDailyTrades: monthlyPlan.maxDailyTrades,
				maxConsecutiveLosses: monthlyPlan.maxConsecutiveLosses,
				consecutiveLossScope: "daily",
				reduceRiskAfterLoss: monthlyPlan.reduceRiskAfterLoss ?? false,
				riskReductionFactor: reductionFactor,
				increaseRiskAfterWin: monthlyPlan.increaseRiskAfterWin ?? false,
				profitReinvestmentPercent: reinvestPercent,
				monthlyLossPercent,
				weeklyLossPercent,
			},
			"monthlyPlan"
		)
	}

	const handleSelectProfile = (profile: RiskManagementProfile) => {
		onSelect(
			{
				mode: "advanced",
				accountBalanceCents: profile.baseRiskCents * 100,
				decisionTree: profile.decisionTree,
				dailyLossCents: profile.dailyLossCents,
				dailyProfitTargetCents: profile.dailyProfitTargetCents,
				weeklyLossCents: profile.weeklyLossCents,
				monthlyLossCents: profile.monthlyLossCents,
			},
			"riskProfile",
			profile.id
		)
	}

	const handleSelectManual = () => {
		onSelect(
			{
				mode: "simple",
				accountBalanceCents: 10000_00,
				riskPerTradePercent: 1,
				dailyLossPercent: 3,
				dailyProfitTargetPercent: null,
				maxDailyTrades: null,
				maxConsecutiveLosses: null,
				consecutiveLossScope: "daily",
				reduceRiskAfterLoss: false,
				riskReductionFactor: 0.5,
				increaseRiskAfterWin: false,
				profitReinvestmentPercent: null,
				monthlyLossPercent: 10,
				weeklyLossPercent: null,
			},
			"manual"
		)
	}

	const buttonBase =
		"text-small rounded-md border px-3 py-2 transition-colors"
	const activeStyle =
		"border-acc-100 bg-acc-100/10 text-acc-100 font-medium"
	const inactiveStyle =
		"border-bg-300 bg-bg-100 text-txt-200 hover:border-acc-100 hover:text-acc-100"

	return (
		<div>
			<h3 className="text-small text-txt-100 mb-s-300 font-semibold">
				{t("prefillFrom")}
			</h3>
			<div className="flex flex-wrap gap-s-100 sm:gap-s-200">
				{monthlyPlan && (
					<button
						type="button"
						onClick={handleSelectMonthlyPlan}
						className={cn(
							buttonBase,
							activeSource === "monthlyPlan" ? activeStyle : inactiveStyle
						)}
						aria-label={t("monthlyPlan")}
						aria-pressed={activeSource === "monthlyPlan"}
					>
						{t("monthlyPlan")}
					</button>
				)}
				{riskProfiles.map((profile) => {
					const isActive = activeSource === "riskProfile" && activeProfileId === profile.id
					return (
						<button
							key={profile.id}
							type="button"
							onClick={() => handleSelectProfile(profile)}
							className={cn(
								buttonBase,
								isActive ? activeStyle : inactiveStyle
							)}
							aria-label={profile.name}
							aria-pressed={isActive}
						>
							{profile.name}
						</button>
					)
				})}
				<button
					type="button"
					onClick={handleSelectManual}
					className={cn(
						buttonBase,
						activeSource === "manual" ? activeStyle : inactiveStyle
					)}
					aria-label={t("manual")}
					aria-pressed={activeSource === "manual"}
				>
					{t("manual")}
				</button>
			</div>
		</div>
	)
}

export { PrefillSelector }
