"use client"

import { useCallback } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { RiskManagementProfile } from "@/types/risk-profile"
import type { PrefillSource, RiskSimulationParams } from "@/types/risk-simulation"
import { adaptDecisionTree } from "@/lib/risk-profiles/cents-shape"

// Phase 4b: simulation prefill uses a placeholder 1R baseline when prefilling
// from a profile. Phase 5 will source 1R from the active fractal-plan ladder.
const PREFILL_ONE_R_CENTS = 100_00

const buttonBase =
	"text-small min-h-9 rounded-md border px-s-300 py-s-200 transition-colors"
const activeStyle = "border-acc-100 bg-acc-100/10 text-acc-100 font-medium"
const inactiveStyle =
	"border-bg-300 bg-bg-100 text-txt-200 hover:border-acc-100 hover:text-acc-100"

interface PrefillSelectorProps {
	riskProfiles: RiskManagementProfile[]
	onSelect: (params: RiskSimulationParams, source: PrefillSource, profileId?: string) => void
	activeSource: PrefillSource | null
	activeProfileId: string | null
}

const PrefillSelector = ({
	riskProfiles,
	onSelect,
	activeSource,
	activeProfileId,
}: PrefillSelectorProps) => {
	const t = useTranslations("riskSimulation.config")

	const handleSelectProfile = useCallback((profile: RiskManagementProfile) => {
		const tree = adaptDecisionTree(profile.decisionTree, PREFILL_ONE_R_CENTS)
		onSelect(
			{
				mode: "advanced",
				accountBalanceCents: PREFILL_ONE_R_CENTS * 100,
				decisionTree: tree,
				dailyLossCents: PREFILL_ONE_R_CENTS * 3,
				dailyProfitTargetCents: null,
				weeklyLossCents: tree.cascadingLimits.weeklyLossCents,
				monthlyLossCents: tree.cascadingLimits.monthlyLossCents,
			},
			"riskProfile",
			profile.id
		)
	}, [onSelect])

	const handleSelectManual = useCallback(() => {
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
				riskReductionFactor: 50,
				increaseRiskAfterWin: false,
				profitReinvestmentPercent: null,
				monthlyLossPercent: 10,
				weeklyLossPercent: null,
			},
			"manual"
		)
	}, [onSelect])

	return (
		<div id="sim-prefill-selector">
			<h3 className="text-small text-txt-100 mb-s-300 font-semibold">
				{t("prefillFrom")}
			</h3>
			<div className="flex flex-wrap gap-s-100 sm:gap-s-200">
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
