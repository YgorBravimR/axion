"use client"

import { useState, useMemo, useCallback } from "react"
import { Save, Loader2, ChevronDown, ChevronUp, Eye, Lock } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useFormatting } from "@/hooks/use-formatting"
import { deriveMonthlyPlanValues } from "@/lib/monthly-plan"
import { fromCents, toCents } from "@/lib/money"
import type { MonthlyPlan } from "@/db/schema"
import type { RiskManagementProfile } from "@/types/risk-profile"
import { DecisionTreeModal } from "@/components/monthly-plan/decision-tree-modal"

interface MonthlyPlanFormProps {
	plan?: MonthlyPlan | null
	onSave: (data: MonthlyPlanFormData) => Promise<void>
	year: number
	month: number
	riskProfiles?: RiskManagementProfile[]
}

type WinRiskMode = "off" | "increase" | "cap"

const WIN_RISK_MODES: readonly WinRiskMode[] = ["off", "increase", "cap"]

const WIN_RISK_KEYS: Record<
	WinRiskMode,
	"form.winRiskOff" | "form.winRiskIncrease" | "form.winRiskCap"
> = {
	off: "form.winRiskOff",
	increase: "form.winRiskIncrease",
	cap: "form.winRiskCap",
}

interface MonthlyPlanFormData {
	year: number
	month: number
	accountBalance: number // cents
	riskPerTradePercent: number
	dailyLossPercent: number
	monthlyLossPercent: number
	dailyProfitTargetPercent: number | null
	maxDailyTrades: number | null
	maxConsecutiveLosses: number | null
	allowSecondOpAfterLoss: boolean
	reduceRiskAfterLoss: boolean
	riskReductionFactor: number | null
	increaseRiskAfterWin: boolean
	capRiskAfterWin: boolean
	profitReinvestmentPercent: number | null
	notes: string | null
	riskProfileId: string | null
	weeklyLossPercent: number | null
}

type PlanMode = "custom" | "profile"

const MonthlyPlanForm = ({
	plan,
	onSave,
	year,
	month,
	riskProfiles = [],
}: MonthlyPlanFormProps) => {
	const t = useTranslations("commandCenter.plan")
	const { formatCurrency } = useFormatting()

	// Required fields
	const [accountBalance, setAccountBalance] = useState(
		plan ? fromCents(plan.accountBalance).toString() : ""
	)
	const [riskPerTradePercent, setRiskPerTradePercent] = useState(
		plan?.riskPerTradePercent ?? ""
	)
	const [dailyLossPercent, setDailyLossPercent] = useState(
		plan?.dailyLossPercent ?? ""
	)
	const [monthlyLossPercent, setMonthlyLossPercent] = useState(
		plan?.monthlyLossPercent ?? ""
	)

	// Optional fields
	const [dailyProfitTargetPercent, setDailyProfitTargetPercent] = useState(
		plan?.dailyProfitTargetPercent ?? ""
	)
	const [maxDailyTrades, setMaxDailyTrades] = useState(
		plan?.maxDailyTrades?.toString() ?? ""
	)
	const [maxConsecutiveLosses, setMaxConsecutiveLosses] = useState(
		plan?.maxConsecutiveLosses?.toString() ?? ""
	)
	const [allowSecondOpAfterLoss, setAllowSecondOpAfterLoss] = useState(
		plan?.allowSecondOpAfterLoss ?? true
	)
	const [reduceRiskAfterLoss, setReduceRiskAfterLoss] = useState(
		plan?.reduceRiskAfterLoss ?? false
	)
	const [riskReductionFactor, setRiskReductionFactor] = useState(
		plan?.riskReductionFactor ?? ""
	)
	const [winRiskMode, setWinRiskMode] = useState<WinRiskMode>(
		plan?.capRiskAfterWin
			? "cap"
			: plan?.increaseRiskAfterWin
				? "increase"
				: "off"
	)
	const [profitReinvestmentPercent, setProfitReinvestmentPercent] = useState(
		plan?.profitReinvestmentPercent ?? ""
	)
	const [notes, setNotes] = useState(plan?.notes ?? "")

	// Risk profile state
	const [planMode, setPlanMode] = useState<PlanMode>(
		plan?.riskProfileId ? "profile" : "custom"
	)
	const [selectedProfileId, setSelectedProfileId] = useState<string>(
		plan?.riskProfileId ?? ""
	)
	const [weeklyLossPercent, setWeeklyLossPercent] = useState(
		plan?.weeklyLossPercent ?? ""
	)

	const selectedProfile = riskProfiles.find((p) => p.id === selectedProfileId)
	const isProfileMode = planMode === "profile" && !!selectedProfile

	// Resolve effective risk + limits from decision tree when profile uses dynamic sizing
	const effectiveProfile = useMemo(() => {
		if (!selectedProfile) return null
		const balanceCents = toCents(accountBalance)
		const { decisionTree } = selectedProfile

		// Effective risk per trade based on riskSizing mode
		let riskCents = selectedProfile.baseRiskCents
		if (balanceCents > 0) {
			if (decisionTree.riskSizing?.type === "percentOfBalance") {
				riskCents = Math.round(balanceCents * decisionTree.riskSizing.riskPercent / 100)
			} else if (decisionTree.riskSizing?.type === "fixedRatio") {
				riskCents = decisionTree.riskSizing.baseContractRiskCents
			}
			// kellyFractional + fixed/undefined: use baseRiskCents as fallback
		}

		// Effective limits based on limitMode
		let dailyLossCents = selectedProfile.dailyLossCents
		let weeklyLossCents = selectedProfile.weeklyLossCents
		let monthlyLossCents = selectedProfile.monthlyLossCents

		if (balanceCents > 0) {
			if (decisionTree.limitMode === "percentOfInitial" && decisionTree.limitsPercent) {
				dailyLossCents = Math.round(balanceCents * decisionTree.limitsPercent.daily / 100)
				weeklyLossCents = decisionTree.limitsPercent.weekly != null
					? Math.round(balanceCents * decisionTree.limitsPercent.weekly / 100)
					: null
				monthlyLossCents = Math.round(balanceCents * decisionTree.limitsPercent.monthly / 100)
			} else if (decisionTree.limitMode === "rMultiples" && decisionTree.limitsR) {
				dailyLossCents = Math.round(riskCents * decisionTree.limitsR.daily)
				weeklyLossCents = decisionTree.limitsR.weekly != null
					? Math.round(riskCents * decisionTree.limitsR.weekly)
					: null
				monthlyLossCents = Math.round(riskCents * decisionTree.limitsR.monthly)
			}
		}

		// Scale daily target proportionally when risk sizing is dynamic
		// e.g. stored target R$3,000 at stored risk R$500 = 6R → effective R$300 × 6 = R$1,800
		const dailyProfitTargetCents = selectedProfile.dailyProfitTargetCents != null
			&& selectedProfile.baseRiskCents > 0
			&& riskCents !== selectedProfile.baseRiskCents
			? Math.round(riskCents * selectedProfile.dailyProfitTargetCents / selectedProfile.baseRiskCents)
			: selectedProfile.dailyProfitTargetCents

		return {
			riskCents,
			dailyLossCents,
			weeklyLossCents,
			monthlyLossCents,
			dailyProfitTargetCents,
		}
	}, [selectedProfile, accountBalance])

	const profileDerivedPercents = useMemo(() => {
		if (!effectiveProfile) return null
		const balanceCents = toCents(accountBalance)
		if (balanceCents <= 0) return null
		return {
			riskPerTrade: (effectiveProfile.riskCents / balanceCents * 100).toFixed(2),
			dailyLoss: (effectiveProfile.dailyLossCents / balanceCents * 100).toFixed(2),
			weeklyLoss: effectiveProfile.weeklyLossCents != null
				? (effectiveProfile.weeklyLossCents / balanceCents * 100).toFixed(2)
				: null,
			monthlyLoss: (effectiveProfile.monthlyLossCents / balanceCents * 100).toFixed(2),
			dailyTarget: effectiveProfile.dailyProfitTargetCents
				? (effectiveProfile.dailyProfitTargetCents / balanceCents * 100).toFixed(2)
				: null,
		}
	}, [effectiveProfile, accountBalance])

	// UI state
	const [showAdvanced, setShowAdvanced] = useState(false)
	const [showDecisionTree, setShowDecisionTree] = useState(false)
	const [saving, setSaving] = useState(false)

	const handleWinRiskKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLButtonElement>) => {
			const currentIndex = WIN_RISK_MODES.indexOf(winRiskMode)
			let nextIndex = currentIndex

			if (event.key === "ArrowRight" || event.key === "ArrowDown") {
				event.preventDefault()
				nextIndex = (currentIndex + 1) % WIN_RISK_MODES.length
			} else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
				event.preventDefault()
				nextIndex =
					(currentIndex - 1 + WIN_RISK_MODES.length) % WIN_RISK_MODES.length
			} else {
				return
			}

			const nextMode = WIN_RISK_MODES[nextIndex]
			setWinRiskMode(nextMode)

			// Focus the newly selected radio button
			const radioGroup = event.currentTarget.parentElement
			const nextButton =
				radioGroup?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[
					nextIndex
				]
			nextButton?.focus()
		},
		[winRiskMode]
	)

	// Live preview computation (custom mode)
	const preview = useMemo(() => {
		const balanceCents = toCents(accountBalance)
		const riskPct = parseFloat(String(riskPerTradePercent))
		const dailyLossPct = parseFloat(String(dailyLossPercent))
		const monthlyLossPct = parseFloat(String(monthlyLossPercent))
		const profitTargetPct = dailyProfitTargetPercent
			? parseFloat(String(dailyProfitTargetPercent))
			: null
		const maxTradesOverride = maxDailyTrades
			? parseInt(String(maxDailyTrades), 10)
			: null

		if (
			balanceCents <= 0 ||
			isNaN(riskPct) ||
			riskPct <= 0 ||
			isNaN(dailyLossPct) ||
			dailyLossPct <= 0 ||
			isNaN(monthlyLossPct) ||
			monthlyLossPct <= 0
		) {
			return null
		}

		const weeklyLossPct = weeklyLossPercent
			? parseFloat(String(weeklyLossPercent))
			: null

		return deriveMonthlyPlanValues({
			accountBalance: balanceCents,
			riskPerTradePercent: riskPct,
			dailyLossPercent: dailyLossPct,
			monthlyLossPercent: monthlyLossPct,
			dailyProfitTargetPercent: profitTargetPct,
			maxDailyTrades: maxTradesOverride,
			weeklyLossPercent: weeklyLossPct,
		})
	}, [
		accountBalance,
		riskPerTradePercent,
		dailyLossPercent,
		monthlyLossPercent,
		dailyProfitTargetPercent,
		maxDailyTrades,
		weeklyLossPercent,
	])

	// Live preview computation (profile mode — resolved from decision tree)
	const profilePreview = useMemo(() => {
		if (planMode !== "profile" || !effectiveProfile) return null
		const balanceCents = toCents(accountBalance)
		if (balanceCents <= 0) return null
		return {
			riskPerTradeCents: effectiveProfile.riskCents,
			dailyLossCents: effectiveProfile.dailyLossCents,
			monthlyLossCents: effectiveProfile.monthlyLossCents,
			dailyProfitTargetCents: effectiveProfile.dailyProfitTargetCents,
			weeklyLossCents: effectiveProfile.weeklyLossCents,
			derivedMaxDailyTrades: effectiveProfile.riskCents > 0
				? Math.floor(effectiveProfile.dailyLossCents / effectiveProfile.riskCents)
				: null,
		}
	}, [planMode, effectiveProfile, accountBalance])

	const activePreview = isProfileMode ? profilePreview : preview

	const handleSave = useCallback(async () => {
		setSaving(true)
		try {
			if (isProfileMode && selectedProfile && effectiveProfile) {
				const balanceCents = toCents(accountBalance)
				const balance = fromCents(balanceCents)

				// Derive percentages from effective values (respects dynamic sizing)
				const riskPct = balance > 0 ? fromCents(effectiveProfile.riskCents) / balance * 100 : 0
				const dailyLossPct = balance > 0 ? fromCents(effectiveProfile.dailyLossCents) / balance * 100 : 0
				const monthlyLossPct = balance > 0 ? fromCents(effectiveProfile.monthlyLossCents) / balance * 100 : 0
				const dailyTargetPct = effectiveProfile.dailyProfitTargetCents && balance > 0
					? fromCents(effectiveProfile.dailyProfitTargetCents) / balance * 100
					: null
				const weeklyLossPct = effectiveProfile.weeklyLossCents != null && balance > 0
					? fromCents(effectiveProfile.weeklyLossCents) / balance * 100
					: null

				// Derive behavioral flags from decision tree
				const { decisionTree } = selectedProfile
				const firstStep = decisionTree.lossRecovery.sequence[0]
				const hasRiskReduction = decisionTree.lossRecovery.sequence.some((step) => {
					if (step.riskCalculation.type === "percentOfBase") return step.riskCalculation.percent < 100
					if (step.riskCalculation.type === "fixedCents") return step.riskCalculation.amountCents < effectiveProfile.riskCents
					return false
				})

				let reductionFactor: number | null = null
				if (hasRiskReduction && firstStep) {
					if (firstStep.riskCalculation.type === "percentOfBase") {
						reductionFactor = firstStep.riskCalculation.percent / 100
					} else if (firstStep.riskCalculation.type === "fixedCents" && effectiveProfile.riskCents > 0) {
						reductionFactor = firstStep.riskCalculation.amountCents / effectiveProfile.riskCents
					}
				}

				await onSave({
					year,
					month,
					accountBalance: balanceCents,
					riskPerTradePercent: riskPct,
					dailyLossPercent: dailyLossPct,
					monthlyLossPercent: monthlyLossPct,
					dailyProfitTargetPercent: dailyTargetPct,
					maxDailyTrades: 1 + decisionTree.lossRecovery.sequence.length,
					maxConsecutiveLosses: 1 + decisionTree.lossRecovery.sequence.length,
					allowSecondOpAfterLoss: true,
					reduceRiskAfterLoss: hasRiskReduction,
					riskReductionFactor: reductionFactor,
					increaseRiskAfterWin: decisionTree.gainMode.type === "compounding" || decisionTree.gainMode.type === "gainSequence",
					capRiskAfterWin: false,
					profitReinvestmentPercent: decisionTree.gainMode.type === "compounding"
						? decisionTree.gainMode.reinvestmentPercent
						: null,
					notes: notes || null,
					riskProfileId: selectedProfileId,
					weeklyLossPercent: weeklyLossPct,
				})
			} else {
				await onSave({
					year,
					month,
					accountBalance: toCents(accountBalance),
					riskPerTradePercent: parseFloat(String(riskPerTradePercent)),
					dailyLossPercent: parseFloat(String(dailyLossPercent)),
					monthlyLossPercent: parseFloat(String(monthlyLossPercent)),
					dailyProfitTargetPercent: dailyProfitTargetPercent
						? parseFloat(String(dailyProfitTargetPercent))
						: null,
					maxDailyTrades: maxDailyTrades
						? parseInt(String(maxDailyTrades), 10)
						: null,
					maxConsecutiveLosses: maxConsecutiveLosses
						? parseInt(String(maxConsecutiveLosses), 10)
						: null,
					allowSecondOpAfterLoss,
					reduceRiskAfterLoss,
					riskReductionFactor: riskReductionFactor
						? parseFloat(String(riskReductionFactor))
						: null,
					increaseRiskAfterWin: winRiskMode === "increase",
					capRiskAfterWin: winRiskMode === "cap",
					profitReinvestmentPercent: profitReinvestmentPercent
						? parseFloat(String(profitReinvestmentPercent))
						: null,
					notes: notes || null,
					riskProfileId: null,
					weeklyLossPercent: weeklyLossPercent
						? parseFloat(String(weeklyLossPercent))
						: null,
				})
			}
		} finally {
			setSaving(false)
		}
	}, [
		year,
		month,
		accountBalance,
		isProfileMode,
		selectedProfile,
		effectiveProfile,
		selectedProfileId,
		notes,
		riskPerTradePercent,
		dailyLossPercent,
		monthlyLossPercent,
		dailyProfitTargetPercent,
		maxDailyTrades,
		maxConsecutiveLosses,
		allowSecondOpAfterLoss,
		reduceRiskAfterLoss,
		riskReductionFactor,
		winRiskMode,
		profitReinvestmentPercent,
		weeklyLossPercent,
		onSave,
	])

	const isValid = isProfileMode
		? parseFloat(String(accountBalance)) > 0
		: parseFloat(String(accountBalance)) > 0 &&
			parseFloat(String(riskPerTradePercent)) > 0 &&
			parseFloat(String(dailyLossPercent)) > 0 &&
			parseFloat(String(monthlyLossPercent)) > 0

	return (
		<div className="space-y-m-500">
			{/* Two-column layout: Form + Preview */}
			<div className="gap-m-500 grid lg:grid-cols-2">
				{/* Left: Form */}
				<div className="min-w-0 space-y-m-400">
					{/* Plan Mode Toggle (only shown when profiles exist) */}
					{riskProfiles.length > 0 && (
						<div className="space-y-s-300">
							<label className="text-small text-txt-200">
								{t("form.riskProfileMode")}
							</label>
							<div
								className="gap-s-200 border-bg-300 bg-bg-200 p-s-100 flex rounded-lg border"
								role="radiogroup"
								aria-label={t("form.riskProfileMode")}
							>
								<button
									type="button"
									role="radio"
									aria-checked={planMode === "custom"}
									onClick={() => setPlanMode("custom")}
									className={`px-s-300 py-s-200 text-small flex-1 rounded-md font-medium transition-all ${
										planMode === "custom"
											? "bg-acc-100 text-bg-100 shadow-sm"
											: "text-txt-300 hover:text-txt-200"
									}`}
									tabIndex={planMode === "custom" ? 0 : -1}
								>
									{t("form.riskProfileModeCustom")}
								</button>
								<button
									type="button"
									role="radio"
									aria-checked={planMode === "profile"}
									onClick={() => setPlanMode("profile")}
									className={`px-s-300 py-s-200 text-small flex-1 rounded-md font-medium transition-all ${
										planMode === "profile"
											? "bg-acc-100 text-bg-100 shadow-sm"
											: "text-txt-300 hover:text-txt-200"
									}`}
									tabIndex={planMode === "profile" ? 0 : -1}
								>
									{t("form.riskProfileModeProfile")}
								</button>
							</div>

							{/* Profile Selector */}
							{planMode === "profile" && (
								<div className="space-y-s-300">
									<div>
										<label className="mb-s-200 text-small text-txt-200 block">
											{t("form.riskProfileSelect")}
										</label>
										<select
											value={selectedProfileId}
											onChange={(e) => setSelectedProfileId(e.target.value)}
											className="border-bg-300 bg-bg-100 text-small text-txt-100 focus:ring-acc-100 w-full rounded-md border px-3 py-2 focus:ring-2 focus:outline-none"
											aria-label={t("form.riskProfileSelect")}
										>
											<option value="">
												{t("form.riskProfileSelectPlaceholder")}
											</option>
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
												const builtIn = riskProfiles.filter(isBuiltIn)
												const custom = riskProfiles.filter((p) => !isBuiltIn(p))
												return (
													<>
														{builtIn.length > 0 && (
															<optgroup label={t("form.builtInGroup")}>
																{builtIn.map((profile) => (
																	<option key={profile.id} value={profile.id}>
																		{profile.name}
																	</option>
																))}
															</optgroup>
														)}
														{custom.length > 0 && (
															<optgroup label={t("form.customGroup")}>
																{custom.map((profile) => (
																	<option key={profile.id} value={profile.id}>
																		{profile.name}
																	</option>
																))}
															</optgroup>
														)}
													</>
												)
											})()}
										</select>
									</div>

									{/* Profile Description */}
									{selectedProfile?.description && (
										<p className="text-tiny text-txt-300">
											{selectedProfile.description}
										</p>
									)}
								</div>
							)}
						</div>
					)}

					{/* Account Balance — always visible */}
					<div>
						<label className="mb-s-200 text-small text-txt-200 block">
							{t("form.accountBalance")}
						</label>
						<div className="relative">
							<span className="text-tiny text-txt-300 absolute top-1/2 left-3 -translate-y-1/2">
								R$
							</span>
							<Input
								id="plan-account-balance"
								type="number"
								step="0.01"
								min="0"
								value={accountBalance}
								onChange={(e) => setAccountBalance(e.target.value)}
								placeholder="0.00"
								className="pl-8"
								aria-label={t("form.accountBalance")}
							/>
						</div>
						<p className="mt-s-100 text-tiny text-txt-300">
							{t("form.accountBalanceHelp")}
						</p>
					</div>

					{/* Profile mode: locked values derived from profile */}
					{isProfileMode && selectedProfile && (
						<div className="space-y-s-300 border-acc-100/20 bg-acc-100/5 p-m-400 rounded-lg border">
							<div className="gap-s-200 flex items-center">
								<Lock className="text-acc-100 h-4 w-4" />
								<p className="text-small text-txt-200 font-medium">
									{t("form.profileLocked")}
								</p>
							</div>

							{/* Effective values with derived percentages */}
							<div className="gap-x-s-300 gap-y-s-200 text-tiny grid grid-cols-[1fr_auto]">
								<span className="text-txt-300">
									{t("preview.riskPerTrade")}:
								</span>
								<div className="text-right">
									<span className="text-txt-100 font-medium">
										{formatCurrency(
											fromCents(
												effectiveProfile?.riskCents ??
													selectedProfile.baseRiskCents
											)
										)}
									</span>
									{profileDerivedPercents && (
										<span className="text-txt-300 ml-s-200">
											({profileDerivedPercents.riskPerTrade}%)
										</span>
									)}
								</div>

								<span className="text-txt-300">
									{t("preview.dailyLossLimit")}:
								</span>
								<div className="text-right">
									<span className="text-txt-100 font-medium">
										{formatCurrency(
											fromCents(
												effectiveProfile?.dailyLossCents ??
													selectedProfile.dailyLossCents
											)
										)}
									</span>
									{profileDerivedPercents && (
										<span className="text-txt-300 ml-s-200">
											({profileDerivedPercents.dailyLoss}%)
										</span>
									)}
								</div>

								{(effectiveProfile?.weeklyLossCents ??
									selectedProfile.weeklyLossCents) != null && (
									<>
										<span className="text-txt-300">
											{t("form.weeklyLoss")}:
										</span>
										<div className="text-right">
											<span className="text-txt-100 font-medium">
												{formatCurrency(
													fromCents(
														effectiveProfile?.weeklyLossCents ??
															selectedProfile.weeklyLossCents ??
															0
													)
												)}
											</span>
											{profileDerivedPercents?.weeklyLoss && (
												<span className="text-txt-300 ml-s-200">
													({profileDerivedPercents.weeklyLoss}%)
												</span>
											)}
										</div>
									</>
								)}

								<span className="text-txt-300">
									{t("preview.monthlyLossLimit")}:
								</span>
								<div className="text-right">
									<span className="text-txt-100 font-medium">
										{formatCurrency(
											fromCents(
												effectiveProfile?.monthlyLossCents ??
													selectedProfile.monthlyLossCents
											)
										)}
									</span>
									{profileDerivedPercents && (
										<span className="text-txt-300 ml-s-200">
											({profileDerivedPercents.monthlyLoss}%)
										</span>
									)}
								</div>

								{(effectiveProfile?.dailyProfitTargetCents ??
									selectedProfile.dailyProfitTargetCents) != null && (
									<>
										<span className="text-txt-300">
											{t("form.dailyTarget")}:
										</span>
										<div className="text-right">
											<span className="text-txt-100 font-medium">
												{formatCurrency(
													fromCents(
														effectiveProfile?.dailyProfitTargetCents ??
															selectedProfile.dailyProfitTargetCents ??
															0
													)
												)}
											</span>
											{profileDerivedPercents?.dailyTarget && (
												<span className="text-txt-300 ml-s-200">
													({profileDerivedPercents.dailyTarget}%)
												</span>
											)}
										</div>
									</>
								)}
							</div>

							{/* Decision tree summary */}
							<div className="border-acc-100/20 pt-s-300 border-t">
								<div className="gap-x-s-300 gap-y-s-200 text-tiny grid grid-cols-[1fr_auto]">
									<span className="text-txt-300">
										{t("form.maxConsecutiveLosses")}:
									</span>
									<span className="text-txt-100 text-right font-medium">
										{1 +
											selectedProfile.decisionTree.lossRecovery.sequence.length}
									</span>

									<span className="text-txt-300">
										{t("form.lossRecovery")}:
									</span>
									<span className="text-txt-100 text-right font-medium">
										{t("form.lossRecoverySteps", {
											count:
												selectedProfile.decisionTree.lossRecovery.sequence
													.length,
										})}
									</span>

									<span className="text-txt-300">{t("form.gainMode")}:</span>
									<span className="text-txt-100 text-right font-medium">
										{selectedProfile.decisionTree.gainMode.type === "compounding"
											? t("form.gainModeCompounding", {
													percent: selectedProfile.decisionTree.gainMode.reinvestmentPercent,
												})
											: selectedProfile.decisionTree.gainMode.type === "gainSequence"
												? t("form.gainModeGainSequence", {
														steps: selectedProfile.decisionTree.gainMode.sequence.length,
													})
												: t("form.gainModeSingleTarget")}
									</span>
								</div>

								<button
									type="button"
									onClick={() => setShowDecisionTree(true)}
									className="mt-s-300 gap-s-200 border-acc-100/30 bg-acc-100/10 px-s-300 py-s-200 text-tiny text-acc-100 hover:bg-acc-100/20 flex w-full items-center justify-center rounded-md border font-medium transition-colors"
									aria-label={t("form.seeDecisionTree")}
									tabIndex={0}
								>
									<Eye className="h-3.5 w-3.5" />
									{t("form.seeDecisionTree")}
								</button>
							</div>
						</div>
					)}

					{/* Profile mode: notes */}
					{isProfileMode && (
						<div>
							<label className="mb-s-200 text-small text-txt-200 block">
								{t("form.notes")}
							</label>
							<textarea
								value={notes}
								onChange={(e) => setNotes(e.target.value)}
								placeholder={t("form.notesPlaceholder")}
								className="border-bg-300 bg-bg-100 text-small text-txt-100 placeholder:text-txt-300 focus:ring-acc-100 min-h-[80px] w-full rounded-md border px-3 py-2 focus:ring-2 focus:outline-none"
								aria-label={t("form.notes")}
							/>
						</div>
					)}

					{/* Custom mode: percentage inputs */}
					{!isProfileMode && (
						<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2">
							{/* Risk per Trade % */}
							<div>
								<label className="mb-s-200 text-small text-txt-200 block">
									{t("form.riskPerTrade")}
								</label>
								<div className="relative">
									<Input
										id="plan-risk-per-trade"
										type="number"
										step="0.01"
										min="0"
										max="100"
										value={riskPerTradePercent}
										onChange={(e) => setRiskPerTradePercent(e.target.value)}
										placeholder="1.00"
										className="pr-8"
										aria-label={t("form.riskPerTrade")}
									/>
									<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
										%
									</span>
								</div>
								<p className="mt-s-100 text-tiny text-txt-300">
									{t("form.riskPerTradeHelp")}
								</p>
							</div>

							{/* Daily Loss % */}
							<div>
								<label className="mb-s-200 text-small text-txt-200 block">
									{t("form.dailyLoss")}
								</label>
								<div className="relative">
									<Input
										id="plan-daily-loss"
										type="number"
										step="0.01"
										min="0"
										max="100"
										value={dailyLossPercent}
										onChange={(e) => setDailyLossPercent(e.target.value)}
										placeholder="3.00"
										className="pr-8"
										aria-label={t("form.dailyLoss")}
									/>
									<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
										%
									</span>
								</div>
								<p className="mt-s-100 text-tiny text-txt-300">
									{t("form.dailyLossHelp")}
								</p>
							</div>

							{/* Monthly Loss % */}
							<div className="sm:col-span-2">
								<label className="mb-s-200 text-small text-txt-200 block">
									{t("form.monthlyLoss")}
								</label>
								<div className="relative">
									<Input
										id="plan-monthly-loss"
										type="number"
										step="0.01"
										min="0"
										max="100"
										value={monthlyLossPercent}
										onChange={(e) => setMonthlyLossPercent(e.target.value)}
										placeholder="10.00"
										className="pr-8"
										aria-label={t("form.monthlyLoss")}
									/>
									<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
										%
									</span>
								</div>
								<p className="mt-s-100 text-tiny text-txt-300">
									{t("form.monthlyLossHelp")}
								</p>
							</div>
						</div>
					)}

					{/* Custom mode: Advanced Settings Toggle */}
					{!isProfileMode && (
						<button
							type="button"
							onClick={() => setShowAdvanced((prev) => !prev)}
							className="gap-s-200 border-bg-300 bg-bg-100 px-m-400 py-s-300 text-small text-txt-200 hover:bg-bg-200 flex w-full items-center rounded-lg border transition-colors"
							aria-expanded={showAdvanced}
							aria-label={t("form.advanced")}
						>
							{showAdvanced ? (
								<ChevronUp className="h-4 w-4" />
							) : (
								<ChevronDown className="h-4 w-4" />
							)}
							{t("form.advanced")}
						</button>
					)}

					{/* Custom mode: Advanced Fields (Collapsible) */}
					{showAdvanced && !isProfileMode && (
						<div className="space-y-m-400 border-bg-300 bg-bg-100 p-m-400 rounded-lg border">
							<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2">
								{/* Daily Profit Target % */}
								<div>
									<label className="mb-s-200 text-small text-txt-200 block">
										{t("form.dailyProfitTarget")}
									</label>
									<div className="relative">
										<Input
											id="plan-daily-profit-target"
											type="number"
											step="0.01"
											min="0"
											value={dailyProfitTargetPercent}
											onChange={(e) =>
												setDailyProfitTargetPercent(e.target.value)
											}
											placeholder="5.00"
											className="pr-8"
											aria-label={t("form.dailyProfitTarget")}
										/>
										<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
											%
										</span>
									</div>
									<p className="mt-s-100 text-tiny text-txt-300">
										{t("form.dailyProfitTargetHelp")}
									</p>
								</div>

								{/* Max Daily Trades */}
								<div>
									<label className="mb-s-200 text-small text-txt-200 block">
										{t("form.maxDailyTrades")}
									</label>
									<Input
										id="plan-max-daily-trades"
										type="number"
										step="1"
										min="1"
										value={maxDailyTrades}
										onChange={(e) => setMaxDailyTrades(e.target.value)}
										placeholder="auto"
										aria-label={t("form.maxDailyTrades")}
									/>
									<p className="mt-s-100 text-tiny text-txt-300">
										{t("form.maxDailyTradesHelp")}
									</p>
								</div>

								{/* Max Consecutive Losses */}
								<div>
									<label className="mb-s-200 text-small text-txt-200 block">
										{t("form.maxConsecutiveLosses")}
									</label>
									<Input
										id="plan-max-consecutive-losses"
										type="number"
										step="1"
										min="1"
										value={maxConsecutiveLosses}
										onChange={(e) => setMaxConsecutiveLosses(e.target.value)}
										placeholder="3"
										aria-label={t("form.maxConsecutiveLosses")}
									/>
									<p className="mt-s-100 text-tiny text-txt-300">
										{t("form.maxConsecutiveLossesHelp")}
									</p>
								</div>

								{/* Weekly Loss Limit % */}
								<div>
									<label className="mb-s-200 text-small text-txt-200 block">
										{t("form.weeklyLoss")}
									</label>
									<div className="relative">
										<Input
											id="plan-weekly-loss"
											type="number"
											step="0.01"
											min="0"
											max="100"
											value={weeklyLossPercent}
											onChange={(e) => setWeeklyLossPercent(e.target.value)}
											placeholder="4.00"
											className="pr-8"
											aria-label={t("form.weeklyLoss")}
										/>
										<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
											%
										</span>
									</div>
									<p className="mt-s-100 text-tiny text-txt-300">
										{t("form.weeklyLossHelp")}
									</p>
								</div>
							</div>

							{/* Behavioral Switches */}
							<div className="space-y-m-400 border-bg-300 pt-m-400 border-t">
								{/* Allow 2nd Op */}
								<div className="flex items-center justify-between">
									<label className="text-small text-txt-200">
										{t("form.allowSecondOp")}
									</label>
									<Switch
										id="allow-second-op-after-loss"
										checked={allowSecondOpAfterLoss}
										onCheckedChange={setAllowSecondOpAfterLoss}
										aria-label={t("form.allowSecondOp")}
									/>
								</div>

								{/* Reduce Risk After Loss */}
								<div className="flex items-center justify-between">
									<label className="text-small text-txt-200">
										{t("form.reduceRisk")}
									</label>
									<Switch
										id="reduce-risk-after-loss"
										checked={reduceRiskAfterLoss}
										onCheckedChange={setReduceRiskAfterLoss}
										aria-label={t("form.reduceRisk")}
									/>
								</div>

								{/* Risk Reduction Factor (shown when reduceRiskAfterLoss is on) */}
								{reduceRiskAfterLoss && (
									<div className="ml-m-400">
										<label className="mb-s-200 text-small text-txt-200 block">
											{t("form.riskReductionFactor")}
										</label>
										<Input
											id="plan-risk-reduction-factor"
											type="number"
											step="0.01"
											min="0.01"
											max="1"
											value={riskReductionFactor}
											onChange={(e) => setRiskReductionFactor(e.target.value)}
											placeholder="0.50"
											aria-label={t("form.riskReductionFactor")}
										/>
										<p className="mt-s-100 text-tiny text-txt-300">
											{t("form.riskReductionFactorHelp")}
										</p>
									</div>
								)}

								{/* Win Risk Adjustment — 3-way selector */}
								<div className="space-y-s-300">
									<label className="text-small text-txt-200">
										{t("form.winRiskAdjustment")}
									</label>
									<div
										className="gap-s-200 border-bg-300 bg-bg-200 p-s-100 flex rounded-lg border"
										role="radiogroup"
										aria-label={t("form.winRiskAdjustment")}
									>
										{WIN_RISK_MODES.map((mode) => (
											<button
												key={mode}
												type="button"
												role="radio"
												aria-checked={winRiskMode === mode}
												onClick={() => setWinRiskMode(mode)}
												onKeyDown={handleWinRiskKeyDown}
												className={`px-s-300 py-s-200 text-small flex-1 rounded-md font-medium transition-all ${
													winRiskMode === mode
														? "bg-acc-100 text-bg-100 shadow-sm"
														: "text-txt-300 hover:text-txt-200"
												}`}
												tabIndex={winRiskMode === mode ? 0 : -1}
												aria-label={t(WIN_RISK_KEYS[mode])}
											>
												{t(WIN_RISK_KEYS[mode])}
											</button>
										))}
									</div>
									{winRiskMode !== "off" && (
										<p className="text-tiny text-txt-300">
											{winRiskMode === "increase"
												? t("form.winRiskIncreaseDesc")
												: t("form.winRiskCapDesc")}
										</p>
									)}
								</div>

								{/* Profit Reinvestment / Cap % (shown when mode is increase or cap) */}
								{winRiskMode !== "off" && (
									<div className="ml-m-400">
										<label className="mb-s-200 text-small text-txt-200 block">
											{t("form.profitReinvestment")}
										</label>
										<div className="relative">
											<Input
												id="plan-profit-reinvestment"
												type="number"
												step="1"
												min="1"
												max="100"
												value={profitReinvestmentPercent}
												onChange={(e) =>
													setProfitReinvestmentPercent(e.target.value)
												}
												placeholder="50"
												className="pr-8"
												aria-label={t("form.profitReinvestment")}
											/>
											<span className="text-tiny text-txt-300 absolute top-1/2 right-3 -translate-y-1/2">
												%
											</span>
										</div>
										<p className="mt-s-100 text-tiny text-txt-300">
											{winRiskMode === "increase"
												? t("form.profitReinvestmentHelpIncrease")
												: t("form.profitReinvestmentHelpCap")}
										</p>
									</div>
								)}
							</div>

							{/* Notes */}
							<div className="border-bg-300 pt-m-400 border-t">
								<label className="mb-s-200 text-small text-txt-200 block">
									{t("form.notes")}
								</label>
								<textarea
									value={notes}
									onChange={(e) => setNotes(e.target.value)}
									placeholder={t("form.notesPlaceholder")}
									className="border-bg-300 bg-bg-100 text-small text-txt-100 placeholder:text-txt-300 focus:ring-acc-100 min-h-[80px] w-full rounded-md border px-3 py-2 focus:ring-2 focus:outline-none"
									aria-label={t("form.notes")}
								/>
							</div>
						</div>
					)}
				</div>

				{/* Right: Live Preview */}
				<div className="min-w-0 border-bg-300 bg-bg-100 p-m-400 rounded-lg border">
					<div className="mb-m-400 gap-s-200 flex items-center">
						<Eye className="text-acc-100 h-4 w-4" />
						<h4 className="text-small text-txt-100 font-semibold">
							{t("preview.title")}
						</h4>
					</div>

					{activePreview ? (
						<div className="space-y-s-300">
							<PreviewRow
								label={t("preview.riskPerTrade")}
								value={formatCurrency(
									fromCents(activePreview.riskPerTradeCents)
								)}
								subValue={
									isProfileMode && profileDerivedPercents
										? `${profileDerivedPercents.riskPerTrade}%`
										: undefined
								}
							/>
							<PreviewRow
								label={t("preview.dailyLossLimit")}
								value={formatCurrency(fromCents(activePreview.dailyLossCents))}
								subValue={
									isProfileMode && profileDerivedPercents
										? `${profileDerivedPercents.dailyLoss}%`
										: undefined
								}
							/>
							<PreviewRow
								label={t("preview.monthlyLossLimit")}
								value={formatCurrency(
									fromCents(activePreview.monthlyLossCents)
								)}
								subValue={
									isProfileMode && profileDerivedPercents
										? `${profileDerivedPercents.monthlyLoss}%`
										: undefined
								}
							/>
							{activePreview.dailyProfitTargetCents !== null && (
								<PreviewRow
									label={t("preview.dailyProfitTarget")}
									value={formatCurrency(
										fromCents(activePreview.dailyProfitTargetCents)
									)}
									subValue={
										isProfileMode && profileDerivedPercents?.dailyTarget
											? `${profileDerivedPercents.dailyTarget}%`
											: undefined
									}
								/>
							)}
							{activePreview.weeklyLossCents !== null && (
								<PreviewRow
									label={t("preview.weeklyLossLimit")}
									value={formatCurrency(
										fromCents(activePreview.weeklyLossCents)
									)}
									subValue={
										isProfileMode && profileDerivedPercents?.weeklyLoss
											? `${profileDerivedPercents.weeklyLoss}%`
											: undefined
									}
								/>
							)}
							{activePreview.derivedMaxDailyTrades !== null && (
								<PreviewRow
									label={t("preview.maxTradesPerDay")}
									value={String(activePreview.derivedMaxDailyTrades)}
									subValue={
										!isProfileMode && !maxDailyTrades
											? `(${t("preview.derived")})`
											: undefined
									}
								/>
							)}
							{/* Profile-specific preview items */}
							{isProfileMode && selectedProfile && (
								<>
									<PreviewRow
										label={t("preview.maxConsecutiveLosses")}
										value={String(
											1 +
												selectedProfile.decisionTree.lossRecovery.sequence
													.length
										)}
									/>
									<PreviewRow
										label={t("form.lossRecovery")}
										value={t("form.lossRecoverySteps", {
											count:
												selectedProfile.decisionTree.lossRecovery.sequence
													.length,
										})}
									/>
									<PreviewRow
										label={t("form.gainMode")}
										value={
											selectedProfile.decisionTree.gainMode.type === "compounding"
												? t("form.gainModeCompounding", {
														percent: selectedProfile.decisionTree.gainMode.reinvestmentPercent,
													})
												: selectedProfile.decisionTree.gainMode.type === "gainSequence"
													? t("form.gainModeGainSequence", {
															steps: selectedProfile.decisionTree.gainMode.sequence.length,
														})
													: t("form.gainModeSingleTarget")
										}
									/>
								</>
							)}
						</div>
					) : (
						<p className="text-small text-txt-300">{t("description")}</p>
					)}
				</div>
			</div>

			{/* Save Button */}
			<div className="flex justify-end">
				<Button
					id="plan-save"
					onClick={handleSave}
					disabled={saving || !isValid}
					aria-label={t("save")}
				>
					{saving ? (
						<Loader2 className="mr-s-100 h-4 w-4 animate-spin" />
					) : (
						<Save className="mr-s-100 h-4 w-4" />
					)}
					{saving ? t("saving") : t("save")}
				</Button>
			</div>

			{/* Decision Tree Modal */}
			{selectedProfile && (
				<DecisionTreeModal
					open={showDecisionTree}
					onOpenChange={setShowDecisionTree}
					profile={selectedProfile}
					effectiveValues={effectiveProfile}
				/>
			)}
		</div>
	)
}

interface PreviewRowProps {
	label: string
	value: string
	subValue?: string
}

const PreviewRow = ({ label, value, subValue }: PreviewRowProps) => (
	<div className="border-bg-300 pb-s-200 flex items-center justify-between border-b last:border-0">
		<span className="text-small text-txt-300">{label}</span>
		<div className="text-right">
			<span className="text-small text-txt-100 font-semibold">{value}</span>
			{subValue && (
				<span className="ml-s-200 text-tiny text-txt-300">{subValue}</span>
			)}
		</div>
	</div>
)

export { MonthlyPlanForm }
