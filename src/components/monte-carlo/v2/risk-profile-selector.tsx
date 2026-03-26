"use client"

import { useTranslations } from "next-intl"
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { fromCents } from "@/lib/money"
import { formatCompactCurrency } from "@/lib/formatting"
import type { RiskManagementProfile } from "@/types/risk-profile"
import type { RiskManagementProfileForSim } from "@/types/monte-carlo"

interface RiskProfileSelectorProps {
	profiles: RiskManagementProfile[]
	selectedProfileId: string
	onProfileChange: (profileId: string) => void
	simProfile: RiskManagementProfileForSim | null
}

/** Maps risk sizing mode to display label */
const getRiskSizingLabel = (
	mode: string,
	profile: RiskManagementProfileForSim,
	t: ReturnType<typeof useTranslations>
): string => {
	switch (mode) {
		case "percentOfBalance":
			return `${profile.riskPercent ?? 0}% ${t("profileSummary.ofBalance")}`
		case "fixedRatio":
			return t("profileSummary.fixedRatioLabel")
		case "kellyFractional":
			return t("profileSummary.kellyLabel", { divisor: profile.kellyDivisor ?? 4 })
		default:
			return formatCompactCurrency(fromCents(profile.baseRiskCents), "R$")
	}
}

/** Maps limit mode to display label */
const getLimitModeLabel = (
	mode: string,
	t: ReturnType<typeof useTranslations>
): string => {
	switch (mode) {
		case "percentOfInitial":
			return t("profileSummary.percentOfInitial")
		case "rMultiples":
			return t("profileSummary.rMultiplesLabel")
		default:
			return t("profileSummary.fixedCentsLabel")
	}
}

const RiskProfileSelector = ({
	profiles,
	selectedProfileId,
	onProfileChange,
	simProfile,
}: RiskProfileSelectorProps) => {
	const t = useTranslations("monteCarlo.v2")

	return (
		<div className="space-y-s-300">
			<label className="text-small text-txt-200 block font-medium">
				{t("profileSelector.title")}
			</label>
			<Select value={selectedProfileId} onValueChange={onProfileChange}>
				<SelectTrigger id="risk-profile-selector" className="border-bg-300 bg-bg-100 text-small text-txt-100 w-full" aria-label={t("profileSelector.title")}>
					<SelectValue placeholder={t("profileSelector.selectProfile")} />
				</SelectTrigger>
				<SelectContent>
					{(() => {
						const builtInNames = [
							"Fixed Fractional",
							"Fixed Ratio",
							"Institutional",
							"R-Multiples",
							"Kelly Fractional",
						]
						const isBuiltIn = (p: RiskManagementProfile) =>
							builtInNames.some((n) => p.name.includes(n))
						const builtIn = profiles.filter(isBuiltIn)
						const custom = profiles.filter((p) => !isBuiltIn(p))
						return (
							<>
								{builtIn.length > 0 && (
									<SelectGroup>
										<SelectLabel>{t("profileSelector.builtInGroup")}</SelectLabel>
										{builtIn.map((profile) => (
											<SelectItem key={profile.id} value={profile.id}>
												{profile.name}
											</SelectItem>
										))}
									</SelectGroup>
								)}
								{custom.length > 0 && (
									<SelectGroup>
										<SelectLabel>{t("profileSelector.customGroup")}</SelectLabel>
										{custom.map((profile) => (
											<SelectItem key={profile.id} value={profile.id}>
												{profile.name}
											</SelectItem>
										))}
									</SelectGroup>
								)}
							</>
						)
					})()}
				</SelectContent>
			</Select>

			{/* Profile Summary */}
			{simProfile && (
				<div className="border-acc-100/20 bg-acc-100/5 p-s-300 rounded-lg border">
					<div className="gap-s-200 text-tiny grid grid-cols-1 sm:grid-cols-2">
						<span className="text-txt-300">
							{t("profileSummary.baseRisk")}:
						</span>
						<span className="text-txt-100 font-medium">
							{getRiskSizingLabel(simProfile.riskSizingMode, simProfile, t)}
						</span>
						<span className="text-txt-300">
							{t("profileSummary.dailyLossLimit")}:
						</span>
						<span className="text-txt-100 font-medium">
							{formatCompactCurrency(fromCents(simProfile.dailyLossLimitCents), "R$")}
						</span>
						{simProfile.weeklyLossLimitCents && (
							<>
								<span className="text-txt-300">
									{t("profileSummary.weeklyLossLimit")}:
								</span>
								<span className="text-txt-100 font-medium">
									{formatCompactCurrency(
										fromCents(simProfile.weeklyLossLimitCents), "R$"
									)}
								</span>
							</>
						)}
						<span className="text-txt-300">
							{t("profileSummary.monthlyLossLimit")}:
						</span>
						<span className="text-txt-100 font-medium">
							{formatCompactCurrency(
								fromCents(simProfile.monthlyLossLimitCents), "R$"
							)}
						</span>
						{simProfile.dailyTargetCents && (
							<>
								<span className="text-txt-300">
									{t("profileSummary.dailyTarget")}:
								</span>
								<span className="text-txt-100 font-medium">
									{formatCompactCurrency(
										fromCents(simProfile.dailyTargetCents), "R$"
									)}
								</span>
							</>
						)}
						<span className="text-txt-300">
							{t("profileSummary.lossRecovery")}:
						</span>
						<span className="text-txt-100 font-medium">
							{simProfile.lossRecoverySteps.length} {t("profileSummary.steps")}
						</span>
						<span className="text-txt-300">
							{t("profileSummary.gainMode")}:
						</span>
						<span className="text-txt-100 font-medium">
							{simProfile.compoundingRiskPercent > 0
								? `${t("profileSummary.compounding")} (${simProfile.compoundingRiskPercent}%)`
								: t("profileSummary.singleTarget")}
						</span>

						{/* Enhanced summary for dynamic risk profiles */}
						{simProfile.riskSizingMode !== "fixed" && (
							<>
								<span className="text-txt-300">
									{t("profileSummary.limitMode")}:
								</span>
								<span className="text-txt-100 font-medium">
									{getLimitModeLabel(simProfile.limitMode, t)}
								</span>
							</>
						)}
						{simProfile.drawdownTiers.length > 0 && (
							<>
								<span className="text-txt-300">
									{t("profileSummary.drawdownControl")}:
								</span>
								<span className="text-txt-100 font-medium">
									{simProfile.drawdownTiers.length} {t("profileSummary.tiers")}
								</span>
							</>
						)}
						{simProfile.consecutiveLossRules.length > 0 && (
							<>
								<span className="text-txt-300">
									{t("profileSummary.lossRules")}:
								</span>
								<span className="text-txt-100 font-medium">
									{simProfile.consecutiveLossRules.length}{" "}
									{t("profileSummary.rules")}
								</span>
							</>
						)}
					</div>
				</div>
			)}
		</div>
	)
}

export { RiskProfileSelector }
