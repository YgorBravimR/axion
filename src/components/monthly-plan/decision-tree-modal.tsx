"use client"

import { useMemo } from "react"
import { useTranslations } from "next-intl"
import { useFormatting } from "@/hooks/use-formatting"
import { fromCents } from "@/lib/money"
import { CircleCheck, CircleX } from "lucide-react"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog"
import {
	Tabs,
	TabsList,
	TabsTrigger,
	AnimatedTabsContent,
} from "@/components/ui/tabs"
import { RecoveryPathsTree } from "./recovery-paths-tree"
import type { RiskManagementProfile } from "@/types/risk-profile"
import type { LossRecoveryStep, DecisionTreeConfig } from "@/types/risk-profile"

// ─── Constants ──────────────────────────────────────────────

const RISK_REWARD_RATIO = 2

// ─── Internal Utilities ─────────────────────────────────────

const computeStepRisk = (
	step: LossRecoveryStep,
	baseRiskCents: number,
	previousRiskCents: number
): number => {
	if (step.riskCalculation.type === "percentOfBase") {
		return Math.round((baseRiskCents * step.riskCalculation.percent) / 100)
	}
	if (step.riskCalculation.type === "fixedCents") {
		return step.riskCalculation.amountCents
	}
	return previousRiskCents
}

const getRiskLabel = (
	step: LossRecoveryStep,
	t: (key: string, values?: Record<string, string | number>) => string
): string => {
	if (step.riskCalculation.type === "percentOfBase") {
		return t("riskCalcPercent", { percent: step.riskCalculation.percent })
	}
	if (step.riskCalculation.type === "fixedCents") {
		return t("riskCalcFixed")
	}
	return t("riskCalcSame")
}

// ─── Trade Situation Computation ────────────────────────────

interface TradeSituation {
	tradeNumber: number
	isBaseTrade: boolean
	riskCents: number
	maxContracts: number | null
	minStopPoints: number | null
	riskLabel: string | null
	cumulativeLossBefore: number
	worstCaseTotalCents: number
}

const computeTradeSituations = (
	decisionTree: DecisionTreeConfig,
	effectiveBaseRiskCents: number,
	profile: RiskManagementProfile,
	t: (key: string, values?: Record<string, string | number>) => string
): TradeSituation[] => {
	const { baseTrade, lossRecovery } = decisionTree
	const situations: TradeSituation[] = []

	// T1 — base trade (using effective risk, respecting dynamic sizing)
	situations.push({
		tradeNumber: 1,
		isBaseTrade: true,
		riskCents: effectiveBaseRiskCents,
		maxContracts: baseTrade.maxContracts,
		minStopPoints: baseTrade.minStopPoints,
		riskLabel: null,
		cumulativeLossBefore: 0,
		worstCaseTotalCents: effectiveBaseRiskCents,
	})

	// T2+ — recovery sequence (percentages computed against effective base)
	let cumulativeLoss = effectiveBaseRiskCents
	let previousRiskCents = effectiveBaseRiskCents

	for (const step of lossRecovery.sequence) {
		const riskCents = computeStepRisk(
			step,
			effectiveBaseRiskCents,
			previousRiskCents
		)
		const tradeNumber = situations.length + 1

		situations.push({
			tradeNumber,
			isBaseTrade: false,
			riskCents,
			maxContracts:
				step.maxContractsOverride ??
				profile.decisionTree.executionConstraints.maxContracts,
			minStopPoints: profile.decisionTree.executionConstraints.minStopPoints,
			riskLabel: getRiskLabel(step, t),
			cumulativeLossBefore: cumulativeLoss,
			worstCaseTotalCents: cumulativeLoss + riskCents,
		})

		cumulativeLoss += riskCents
		previousRiskCents = riskCents
	}

	return situations
}

// ─── Shared Sub-components ──────────────────────────────────

interface VerticalConnectorProps {
	className?: string
}

const VerticalConnector = ({
	className = "bg-bg-300",
}: VerticalConnectorProps) => (
	<div className="flex justify-center">
		<div className={`h-6 w-0.5 ${className}`} />
	</div>
)

interface StopBadgeProps {
	label: string
	variant?: "loss" | "win"
}

const StopBadge = ({ label, variant = "loss" }: StopBadgeProps) => {
	const colorClasses =
		variant === "loss"
			? "bg-trade-sell/20 border-trade-sell/40 text-trade-sell"
			: "bg-trade-buy/20 border-trade-buy/40 text-trade-buy"

	return (
		<div className="py-s-100 flex justify-center">
			<span
				className={`px-m-400 py-s-100 text-tiny rounded-md border font-bold tracking-wider uppercase ${colorClasses}`}
				aria-label={label}
			>
				{label}
			</span>
		</div>
	)
}

// ─── Flowchart Sub-components (module-private) ──────────────

interface BaseTradeNodeProps {
	riskCents: number
	maxContracts: number | null
	minStopPoints: number | null
	formatCurrency: (value: number) => string
	t: (key: string, values?: Record<string, string | number>) => string
}

const BaseTradeNode = ({
	riskCents,
	maxContracts,
	minStopPoints,
	formatCurrency,
	t,
}: BaseTradeNodeProps) => (
	<div className="border-acc-100 bg-acc-100/5 p-m-400 rounded-lg border-2">
		<p className="text-small text-acc-100 text-center font-semibold">
			{t("baseTrade")}
		</p>
		<div className="mt-s-200 gap-x-m-400 gap-y-s-100 text-tiny grid grid-cols-[1fr_auto]">
			<span className="text-txt-300">{t("risk")}:</span>
			<span className="text-txt-100 text-right font-medium">
				{formatCurrency(fromCents(riskCents))}
			</span>
			{maxContracts !== null && (
				<>
					<span className="text-txt-300">{t("maxContracts")}:</span>
					<span className="text-txt-100 text-right font-medium">
						{maxContracts}
					</span>
				</>
			)}
			{minStopPoints !== null && (
				<>
					<span className="text-txt-300">{t("minStop")}:</span>
					<span className="text-txt-100 text-right font-medium">
						{minStopPoints} {t("points")}
					</span>
				</>
			)}
		</div>

		{/* 1:2 R:R example values */}
		<div className="mt-s-200 pt-s-200 border-acc-100/20 text-tiny flex justify-between border-t">
			<span className="text-trade-buy font-medium">
				{t("winExample", {
					amount: formatCurrency(fromCents(riskCents * RISK_REWARD_RATIO)),
				})}
			</span>
			<span className="text-trade-sell font-medium">
				{t("lossExample", { amount: formatCurrency(fromCents(riskCents)) })}
			</span>
		</div>
	</div>
)

interface BranchSplitProps {
	lossLabel: string
	winLabel: string
}

const BranchSplit = ({ lossLabel, winLabel }: BranchSplitProps) => (
	<div className="relative">
		{/* T-junction connector */}
		<div className="flex">
			<div className="border-bg-300 h-4 flex-1 border-t-2 border-r" />
			<div className="border-bg-300 h-4 flex-1 border-t-2 border-l" />
		</div>
		{/* Branch labels */}
		<div className="gap-m-400 grid grid-cols-2">
			<div className="flex justify-center">
				<span className="bg-trade-sell/15 px-s-300 py-s-100 text-tiny text-trade-sell rounded-full font-semibold">
					{lossLabel}
				</span>
			</div>
			<div className="flex justify-center">
				<span className="bg-trade-buy/15 px-s-300 py-s-100 text-tiny text-trade-buy rounded-full font-semibold">
					{winLabel}
				</span>
			</div>
		</div>
	</div>
)

interface RecoverySequenceProps {
	steps: LossRecoveryStep[]
	baseRiskCents: number
	dailyLossCents: number
	executeAllRegardless: boolean
	stopAfterSequence: boolean
	formatCurrency: (value: number) => string
	t: (key: string, values?: Record<string, string | number>) => string
}

const RecoverySequence = ({
	steps,
	baseRiskCents,
	dailyLossCents,
	executeAllRegardless,
	stopAfterSequence,
	formatCurrency,
	t,
}: RecoverySequenceProps) => {
	let cumulativeRiskCents = baseRiskCents
	let previousRiskCents = baseRiskCents

	const computedSteps = steps.map((step, index) => {
		const riskCents = computeStepRisk(step, baseRiskCents, previousRiskCents)
		cumulativeRiskCents += riskCents
		previousRiskCents = riskCents
		return {
			...step,
			tradeNumber: index + 2,
			riskCents,
			cumulativeRiskCents,
		}
	})

	return (
		<div className="space-y-s-200">
			<p className="text-tiny text-trade-sell text-center font-semibold">
				{t("recoveryMode")}
			</p>
			<div className="border-trade-sell/30 bg-trade-sell/5 p-s-300 rounded-lg border">
				<div className="space-y-s-200">
					{computedSteps.map((step) => (
						<div
							key={step.tradeNumber}
							className="border-trade-sell/10 pb-s-100 border-b last:border-0 last:pb-0"
						>
							<div className="flex items-center justify-between">
								<div>
									<span className="text-tiny text-txt-200 font-medium">
										{t("recoveryStep", { number: step.tradeNumber })}
									</span>
									<span className="ml-s-200 text-tiny text-txt-300">
										({getRiskLabel(step, t)})
									</span>
								</div>
								<span className="text-tiny text-txt-100 font-medium">
									{formatCurrency(fromCents(step.riskCents))}
								</span>
							</div>
							{/* 1:2 win example for this recovery step */}
							<p className="text-tiny text-trade-buy/70 mt-s-100 pl-s-200">
								{t("winExample", {
									amount: formatCurrency(
										fromCents(step.riskCents * RISK_REWARD_RATIO)
									),
								})}
							</p>
						</div>
					))}
				</div>

				{/* Cumulative max loss */}
				<div className="mt-s-200 border-trade-sell/20 pt-s-200 border-t">
					<div className="flex items-center justify-between">
						<span className="text-tiny text-trade-sell font-semibold">
							{t("maxDailyLoss")}
						</span>
						<span className="text-tiny text-trade-sell font-semibold">
							{formatCurrency(fromCents(dailyLossCents))}
						</span>
					</div>
				</div>

				{/* Behavioral flags */}
				<div className="mt-s-200 space-y-s-100">
					{executeAllRegardless && (
						<p className="text-tiny text-txt-300 gap-s-100 flex items-center">
							<span className="bg-trade-sell/50 inline-block h-1.5 w-1.5 rounded-full" />
							{t("executeAll")}
						</p>
					)}
					{stopAfterSequence && (
						<p className="text-tiny text-txt-300 gap-s-100 flex items-center">
							<span className="bg-trade-sell/50 inline-block h-1.5 w-1.5 rounded-full" />
							{t("stopAfter")}
						</p>
					)}
				</div>
			</div>

			{/* Terminal STOP indicator */}
			<VerticalConnector className="bg-trade-sell/50" />
			<StopBadge label={t("stop")} variant="loss" />
		</div>
	)
}

interface GainModeCardProps {
	gainMode: RiskManagementProfile["decisionTree"]["gainMode"]
	baseRiskCents: number
	formatCurrency: (value: number) => string
	t: (key: string, values?: Record<string, string | number>) => string
}

const GainModeCard = ({ gainMode, baseRiskCents, formatCurrency, t }: GainModeCardProps) => {
	let previousRiskCents = baseRiskCents

	return (
		<div className="space-y-s-200">
			<p className="text-tiny text-trade-buy text-center font-semibold">
				{t("gainMode")}
			</p>
			<div className="border-trade-buy/30 bg-trade-buy/5 p-s-300 rounded-lg border">
				{gainMode.type === "compounding" ? (
					<div className="space-y-s-200">
						<p className="text-tiny text-txt-100 font-medium">
							{t("compounding")}
						</p>
						<div className="space-y-s-100">
							<p className="text-tiny text-txt-300 gap-s-100 flex items-center">
								<span className="bg-trade-buy/50 inline-block h-1.5 w-1.5 rounded-full" />
								{t("reinvest", { percent: gainMode.reinvestmentPercent })}
							</p>
							{gainMode.stopOnFirstLoss && (
								<p className="text-tiny text-txt-300 gap-s-100 flex items-center">
									<span className="bg-trade-buy/50 inline-block h-1.5 w-1.5 rounded-full" />
									{t("stopOnFirstLoss")}
								</p>
							)}
							{gainMode.dailyTargetCents !== null && (
								<div className="border-trade-buy/20 pt-s-100 flex items-center justify-between border-t">
									<span className="text-tiny text-txt-300">
										{t("dailyTarget")}:
									</span>
									<span className="text-tiny text-txt-100 font-medium">
										{formatCurrency(fromCents(gainMode.dailyTargetCents))}
									</span>
								</div>
							)}
						</div>
					</div>
				) : gainMode.type === "gainSequence" ? (
					<div className="space-y-s-200">
						<p className="text-tiny text-txt-100 font-medium">
							{t("gainSequence")}
						</p>
						<div className="space-y-s-200">
							{gainMode.sequence.map((step, index) => {
								const riskCents = computeStepRisk(step, baseRiskCents, previousRiskCents)
								previousRiskCents = riskCents
								return (
									<div
										key={index}
										className="border-trade-buy/10 pb-s-100 border-b last:border-0 last:pb-0"
									>
										<div className="flex items-center justify-between">
											<div>
												<span className="text-tiny text-txt-200 font-medium">
													{t("gainSequenceStep", { number: index + 1 })}
												</span>
												<span className="ml-s-200 text-tiny text-txt-300">
													({getRiskLabel(step, t)})
												</span>
											</div>
											<span className="text-tiny text-txt-100 font-medium">
												{formatCurrency(fromCents(riskCents))}
											</span>
										</div>
									</div>
								)
							})}
						</div>
						<div className="space-y-s-100">
							{gainMode.repeatLastStep && (
								<p className="text-tiny text-txt-300 gap-s-100 flex items-center">
									<span className="bg-trade-buy/50 inline-block h-1.5 w-1.5 rounded-full" />
									{t("gainSequenceRepeat")}
								</p>
							)}
							{gainMode.stopOnFirstLoss && (
								<p className="text-tiny text-txt-300 gap-s-100 flex items-center">
									<span className="bg-trade-buy/50 inline-block h-1.5 w-1.5 rounded-full" />
									{t("stopOnFirstLoss")}
								</p>
							)}
							{gainMode.dailyTargetCents !== null && (
								<div className="border-trade-buy/20 pt-s-100 flex items-center justify-between border-t">
									<span className="text-tiny text-txt-300">
										{t("dailyTarget")}:
									</span>
									<span className="text-tiny text-txt-100 font-medium">
										{formatCurrency(fromCents(gainMode.dailyTargetCents))}
									</span>
								</div>
							)}
						</div>
					</div>
				) : (
					<div className="space-y-s-200">
						<p className="text-tiny text-txt-100 font-medium">
							{t("singleTarget")}
						</p>
						<p className="text-tiny text-txt-300 gap-s-100 flex items-center">
							<span className="bg-trade-buy/50 inline-block h-1.5 w-1.5 rounded-full" />
							{t("tradesToTarget", { count: Math.ceil(gainMode.dailyTargetCents / (baseRiskCents * 2)) })}
						</p>
						<div className="border-trade-buy/20 pt-s-100 flex items-center justify-between border-t">
							<span className="text-tiny text-txt-300">{t("dailyTarget")}:</span>
							<span className="text-tiny text-txt-100 font-medium">
								{formatCurrency(fromCents(gainMode.dailyTargetCents))}
							</span>
						</div>
					</div>
				)}
			</div>

			{/* Terminal STOP indicator for singleTarget */}
			{gainMode.type === "singleTarget" && (
				<>
					<VerticalConnector className="bg-trade-buy/50" />
					<StopBadge label={t("stop")} variant="win" />
				</>
			)}
		</div>
	)
}

interface LimitsSectionProps {
	cascadingLimits: RiskManagementProfile["decisionTree"]["cascadingLimits"]
	executionConstraints: RiskManagementProfile["decisionTree"]["executionConstraints"]
	formatCurrency: (value: number) => string
	t: (key: string) => string
}

const LimitsSection = ({
	cascadingLimits,
	executionConstraints,
	formatCurrency,
	t,
}: LimitsSectionProps) => (
	<div className="space-y-s-300">
		{/* Cascading Limits */}
		<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border">
			<p className="text-tiny text-txt-200 mb-s-200 font-semibold">
				{t("cascadingLimits")}
			</p>
			<div className="gap-x-m-400 gap-y-s-100 text-tiny grid grid-cols-[1fr_auto]">
				<span className="text-txt-300">{t("weeklyLoss")}:</span>
				<span className="text-txt-100 text-right font-medium">
					{cascadingLimits.weeklyLossCents !== null
						? `${formatCurrency(fromCents(cascadingLimits.weeklyLossCents))} → ${t(`action.${cascadingLimits.weeklyAction}`)}`
						: t("noLimit")}
				</span>

				<span className="text-txt-300">{t("monthlyLoss")}:</span>
				<span className="text-txt-100 text-right font-medium">
					{formatCurrency(fromCents(cascadingLimits.monthlyLossCents))} →{" "}
					{t(`action.${cascadingLimits.monthlyAction}`)}
				</span>
			</div>
		</div>

		{/* Execution Constraints */}
		{(executionConstraints.minStopPoints !== null ||
			executionConstraints.maxContracts !== null ||
			executionConstraints.operatingHoursStart !== null) && (
			<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border">
				<p className="text-tiny text-txt-200 mb-s-200 font-semibold">
					{t("constraints")}
				</p>
				<div className="gap-x-m-400 gap-y-s-100 text-tiny grid grid-cols-[1fr_auto]">
					{executionConstraints.operatingHoursStart !== null &&
						executionConstraints.operatingHoursEnd !== null && (
							<>
								<span className="text-txt-300">{t("operatingHours")}:</span>
								<span className="text-txt-100 text-right font-medium">
									{executionConstraints.operatingHoursStart} –{" "}
									{executionConstraints.operatingHoursEnd}
								</span>
							</>
						)}
					{executionConstraints.minStopPoints !== null && (
						<>
							<span className="text-txt-300">{t("minStop")}:</span>
							<span className="text-txt-100 text-right font-medium">
								{executionConstraints.minStopPoints} {t("points")}
							</span>
						</>
					)}
					{executionConstraints.maxContracts !== null && (
						<>
							<span className="text-txt-300">{t("maxContracts")}:</span>
							<span className="text-txt-100 text-right font-medium">
								{executionConstraints.maxContracts}
							</span>
						</>
					)}
				</div>
			</div>
		)}
	</div>
)

// ─── Full Day Progression ───────────────────────────────────

interface FullDayProgressionProps {
	situations: TradeSituation[]
	dailyLossCents: number
	formatCurrency: (value: number) => string
	t: (key: string, values?: Record<string, string | number>) => string
}

const FullDayProgression = ({
	situations,
	dailyLossCents,
	formatCurrency,
	t,
}: FullDayProgressionProps) => (
	<div className="mt-m-400">
		<p className="text-tiny text-txt-200 mb-s-200 font-semibold">
			{t("progression.title")}
		</p>
		<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border">
			<div className="gap-s-200 pb-s-100 flex items-center overflow-x-auto">
				{situations.map((situation, index) => (
					<div
						key={situation.tradeNumber}
						className="gap-s-200 flex shrink-0 items-center"
					>
						<div className="bg-trade-sell/10 border-trade-sell/20 px-s-300 py-s-100 rounded-md border">
							<p className="text-tiny text-txt-100 font-medium whitespace-nowrap">
								T{situation.tradeNumber}:{" "}
								{formatCurrency(fromCents(situation.riskCents))}
							</p>
						</div>
						{index < situations.length - 1 && (
							<span className="text-txt-300 text-tiny shrink-0">&rarr;</span>
						)}
					</div>
				))}

				{/* Terminal STOP pill */}
				<span className="text-txt-300 text-tiny shrink-0">&rarr;</span>
				<span className="bg-trade-sell/20 border-trade-sell/40 px-s-300 py-s-100 text-tiny text-trade-sell shrink-0 rounded-md border font-bold tracking-wider uppercase">
					{t("stop")}
				</span>
			</div>
			<div className="border-bg-300 pt-s-200 mt-s-100 border-t">
				<div className="flex items-center justify-between">
					<span className="text-tiny text-txt-300">
						{t("progression.totalExposure")}:
					</span>
					<span className="text-tiny text-trade-sell font-semibold">
						{formatCurrency(fromCents(dailyLossCents))} &rarr;{" "}
						{t("progression.thenStop")}
					</span>
				</div>
			</div>
		</div>
	</div>
)

// ─── Scenario Examples ──────────────────────────────────────

interface ScenarioExamplesProps {
	situations: TradeSituation[]
	dailyLossCents: number
	gainMode: DecisionTreeConfig["gainMode"]
	formatCurrency: (value: number) => string
	formatCurrencyWithSign: (value: number) => string
	t: (key: string, values?: Record<string, string | number>) => string
}

const ScenarioExamples = ({
	situations,
	dailyLossCents,
	gainMode,
	formatCurrency,
	formatCurrencyWithSign,
	t,
}: ScenarioExamplesProps) => {
	const totalLossCents = situations[situations.length - 1].worstCaseTotalCents

	return (
		<div className="mt-m-400">
			<p className="text-tiny text-txt-200 mb-s-200 font-semibold">
				{t("scenarios.title")}
			</p>
			<div className="border-bg-300 bg-bg-200 rounded-lg border overflow-x-auto">
				<table className="w-full text-tiny sm:text-small">
					<thead>
						<tr className="border-bg-300 border-b">
							<th className="px-s-300 py-s-200 text-txt-300 min-w-[120px] whitespace-nowrap text-left font-medium">
								{t("scenarios.colScenario")}
							</th>
							<th className="px-s-300 py-s-200 text-txt-300 min-w-[100px] whitespace-nowrap text-right font-medium">
								{t("scenarios.colGain")}
							</th>
							<th className="px-s-300 py-s-200 text-txt-300 min-w-[100px] whitespace-nowrap text-right font-medium">
								{t("scenarios.colNet")}
							</th>
							<th className="px-s-300 py-s-200 text-txt-300 min-w-[90px] whitespace-nowrap text-right font-medium">
								{t("scenarios.colAction")}
							</th>
						</tr>
					</thead>
					<tbody>
						{situations.map((situation) => {
							const gainCents = situation.riskCents * RISK_REWARD_RATIO
							const netCents = gainCents - situation.cumulativeLossBefore
							const isBaseTrade = situation.isBaseTrade
							const actionLabel = isBaseTrade
								? t("scenarios.enterGainMode")
								: t("scenarios.stopDay")

							return (
								<tr
									key={situation.tradeNumber}
									className="border-bg-300 border-b last:border-0"
								>
									<td className="px-s-300 py-s-200">
										<div className="gap-s-200 flex items-center">
											<CircleCheck
												className="text-trade-buy size-3.5 shrink-0"
												aria-hidden="true"
											/>
											<span className="text-txt-200 whitespace-nowrap">
												{t("scenarios.winAt", { number: situation.tradeNumber })}
											</span>
										</div>
									</td>
									<td className="px-s-300 py-s-200 text-trade-buy text-right font-medium whitespace-nowrap">
										+{formatCurrency(fromCents(gainCents))}
									</td>
									<td className={`px-s-300 py-s-200 text-right font-semibold whitespace-nowrap ${netCents >= 0 ? "text-trade-buy" : "text-trade-sell"}`}>
										{formatCurrencyWithSign(fromCents(netCents))}
									</td>
									<td className="px-s-300 py-s-200 text-right whitespace-nowrap">
										<span
											className={`px-s-200 py-px rounded-full text-tiny font-medium ${
												isBaseTrade
													? "bg-trade-buy/10 text-trade-buy"
													: "bg-trade-sell/10 text-trade-sell"
											}`}
										>
											{actionLabel}
										</span>
									</td>
								</tr>
							)
						})}

						{/* All-losses scenario */}
						<tr className="border-bg-300 border-t">
							<td className="px-s-300 py-s-200">
								<div className="gap-s-200 flex items-center">
									<CircleX
										className="text-trade-sell size-3.5 shrink-0"
										aria-hidden="true"
									/>
									<span className="text-txt-200 font-medium whitespace-nowrap">
										{t("scenarios.allLosses")}
									</span>
								</div>
							</td>
							<td className="px-s-300 py-s-200" />
							<td className="px-s-300 py-s-200 text-trade-sell text-right font-semibold whitespace-nowrap">
								{formatCurrencyWithSign(fromCents(-totalLossCents))}
							</td>
							<td className="px-s-300 py-s-200 text-right whitespace-nowrap">
								<span className="bg-trade-sell/10 px-s-200 py-px text-tiny text-trade-sell rounded-full font-medium">
									{t("scenarios.stopDay")}
								</span>
							</td>
						</tr>
					</tbody>
				</table>
			</div>
		</div>
	)
}

// ─── Trade Situation Tab ────────────────────────────────────

interface TradeSituationTabProps {
	situation: TradeSituation
	situations: TradeSituation[]
	decisionTree: DecisionTreeConfig
	dailyLossCents: number
	gainMode: DecisionTreeConfig["gainMode"]
	formatCurrency: (value: number) => string
	t: (key: string, values?: Record<string, string | number>) => string
}

const TradeSituationTab = ({
	situation,
	situations,
	decisionTree,
	dailyLossCents,
	gainMode,
	formatCurrency,
	t,
}: TradeSituationTabProps) => {
	const isLastTrade = situation.tradeNumber === situations.length
	const { executeAllRegardless } = decisionTree.lossRecovery

	return (
		<div className="space-y-m-400 pt-s-200">
			{/* Context card */}
			<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
				<p className="text-tiny text-txt-200 mb-s-200 font-semibold">
					{t("context.title")}
				</p>
				{situation.isBaseTrade ? (
					<p className="text-tiny text-txt-300">{t("context.dayStart")}</p>
				) : (
					<div className="space-y-s-100">
						<p className="text-tiny text-txt-300">
							{t("context.afterLoss", {
								previousNumber: situation.tradeNumber - 1,
							})}
						</p>
						<p className="text-tiny text-trade-sell font-medium">
							{t("context.cumulativeLoss", {
								amount: formatCurrency(
									fromCents(situation.cumulativeLossBefore)
								),
							})}
						</p>
					</div>
				)}
			</div>

			{/* Setup card */}
			<div className="border-acc-100 bg-acc-100/5 p-m-400 rounded-lg border-2">
				<p className="text-small text-acc-100 mb-s-200 font-semibold">
					{t("setup.title")} &mdash; T{situation.tradeNumber}
				</p>
				<div className="gap-x-m-400 gap-y-s-100 text-tiny grid grid-cols-[1fr_auto]">
					<span className="text-txt-300">{t("risk")}:</span>
					<span className="text-txt-100 text-right font-medium">
						{formatCurrency(fromCents(situation.riskCents))}
					</span>
					{situation.maxContracts !== null && (
						<>
							<span className="text-txt-300">{t("maxContracts")}:</span>
							<span className="text-txt-100 text-right font-medium">
								{situation.maxContracts}
							</span>
						</>
					)}
					{situation.minStopPoints !== null && (
						<>
							<span className="text-txt-300">{t("minStop")}:</span>
							<span className="text-txt-100 text-right font-medium">
								{situation.minStopPoints} {t("points")}
							</span>
						</>
					)}
				</div>

				{/* 1:2 R:R example values */}
				<div className="mt-s-200 pt-s-200 border-acc-100/20 text-tiny flex justify-between border-t">
					<span className="text-trade-buy font-medium">
						{t("winExample", {
							amount: formatCurrency(
								fromCents(situation.riskCents * RISK_REWARD_RATIO)
							),
						})}
					</span>
					<span className="text-trade-sell font-medium">
						{t("lossExample", {
							amount: formatCurrency(fromCents(situation.riskCents)),
						})}
					</span>
				</div>

				{situation.riskLabel !== null && (
					<div className="mt-s-200 pt-s-200 border-acc-100/20 border-t">
						<span className="gap-s-100 bg-acc-100/10 px-s-300 py-s-100 text-tiny text-acc-100 inline-flex items-center rounded-full">
							{t("setup.calculatedAs")}: {situation.riskLabel}
						</span>
					</div>
				)}
			</div>

			{/* Outcome grid */}
			<div className="gap-m-400 grid grid-cols-1 sm:grid-cols-2">
				{/* WIN card */}
				<div className="border-trade-buy/30 bg-trade-buy/5 p-m-400 rounded-lg border">
					<div className="gap-s-200 mb-s-200 flex items-center">
						<CircleCheck className="text-trade-buy size-4" aria-hidden="true" />
						<p className="text-tiny text-trade-buy font-semibold">
							{t("outcome.ifWin")}
						</p>
					</div>
					<div className="space-y-s-200">
						<p className="text-tiny text-txt-300">{t("outcome.next")}</p>
						{situation.isBaseTrade ? (
							<WinOutcomeBaseTrade gainMode={gainMode} t={t} />
						) : (
							<WinOutcomeRecovery
								isLastTrade={isLastTrade}
								executeAllRegardless={executeAllRegardless}
								nextTradeNumber={situation.tradeNumber + 1}
								t={t}
							/>
						)}
					</div>
				</div>

				{/* LOSS card */}
				<div className="border-trade-sell/30 bg-trade-sell/5 p-m-400 rounded-lg border">
					<div className="gap-s-200 mb-s-200 flex items-center">
						<CircleX className="text-trade-sell size-4" aria-hidden="true" />
						<p className="text-tiny text-trade-sell font-semibold">
							{t("outcome.ifLoss")}
						</p>
					</div>
					<div className="space-y-s-200">
						<p className="text-tiny text-txt-300">{t("outcome.next")}</p>
						{situation.isBaseTrade ? (
							<p className="text-tiny text-txt-100 font-medium">
								{t("outcome.enterRecovery")}
							</p>
						) : isLastTrade ? (
							<div className="space-y-s-200">
								<p className="text-tiny text-trade-sell font-medium">
									{situation.worstCaseTotalCents >= dailyLossCents
										? t("outcome.maxLossReached", {
												amount: formatCurrency(fromCents(dailyLossCents)),
											})
										: t("outcome.sequenceExhausted")}
								</p>
								<StopBadge label={t("stop")} variant="loss" />
							</div>
						) : (
							<p className="text-tiny text-txt-100 font-medium">
								{t("outcome.proceedToNext", {
									nextNumber: situation.tradeNumber + 1,
								})}
							</p>
						)}
					</div>
				</div>
			</div>

			{/* Cumulative badge */}
			<div className="border-trade-sell/30 bg-trade-sell/10 p-s-300 rounded-lg border">
				<div className="flex items-center justify-between">
					<span className="text-tiny text-txt-200 font-medium">
						{t("cumulative.worstCase", { number: situation.tradeNumber })}
					</span>
					<span className="text-tiny text-trade-sell font-semibold">
						-{formatCurrency(fromCents(situation.worstCaseTotalCents))}
					</span>
				</div>
				<div className="mt-s-100 flex items-center justify-between">
					<span className="text-tiny text-txt-300">
						{t("cumulative.bufferRemaining", {
							amount: formatCurrency(
								fromCents(dailyLossCents - situation.worstCaseTotalCents)
							),
						})}
					</span>
				</div>
			</div>
		</div>
	)
}

// ─── Win Outcome Sub-components ─────────────────────────────

interface WinOutcomeBaseTradeProps {
	gainMode: DecisionTreeConfig["gainMode"]
	t: (key: string, values?: Record<string, string | number>) => string
}

const WinOutcomeBaseTrade = ({ gainMode, t }: WinOutcomeBaseTradeProps) => (
	<div className="space-y-s-100">
		<p className="text-tiny text-txt-100 font-medium">
			{t("outcome.enterGainMode")}
		</p>
		{gainMode.type === "compounding" ? (
			<>
				<p className="text-tiny text-txt-300">
					{t("outcome.compoundingDetail", {
						percent: gainMode.reinvestmentPercent,
					})}
				</p>
				{gainMode.stopOnFirstLoss && (
					<p className="text-tiny text-txt-300">
						{t("outcome.stopOnFirstLossActive")}
					</p>
				)}
			</>
		) : gainMode.type === "gainSequence" ? (
			<>
				<p className="text-tiny text-txt-300">
					{t("outcome.gainSequenceDetail", {
						steps: gainMode.sequence.length,
					})}
				</p>
				{gainMode.stopOnFirstLoss && (
					<p className="text-tiny text-txt-300">
						{t("outcome.stopOnFirstLossActive")}
					</p>
				)}
			</>
		) : (
			<p className="text-tiny text-txt-300">{t("outcome.singleTargetHit")}</p>
		)}
	</div>
)

interface WinOutcomeRecoveryProps {
	isLastTrade: boolean
	executeAllRegardless: boolean
	nextTradeNumber: number
	t: (key: string, values?: Record<string, string | number>) => string
}

const WinOutcomeRecovery = ({
	isLastTrade,
	executeAllRegardless,
	nextTradeNumber,
	t,
}: WinOutcomeRecoveryProps) => {
	// Recovery win on non-last trade with executeAllRegardless
	if (!isLastTrade && executeAllRegardless) {
		return (
			<p className="text-tiny text-txt-100 font-medium">
				{t("outcome.continueRecovery", { nextNumber: nextTradeNumber })}
			</p>
		)
	}

	// Recovery win on last trade, or non-executeAllRegardless
	return (
		<p className="text-tiny text-trade-buy font-medium">
			{t("outcome.recoveryComplete")}
		</p>
	)
}

// ─── Effective Values ────────────────────────────────────────

/**
 * Balance-resolved values that override the stored profile absolutes.
 * When a profile uses dynamic sizing (percentOfBalance, rMultiples, etc.),
 * these reflect the actual values for the user's current account balance.
 */
interface EffectiveValues {
	riskCents: number
	dailyLossCents: number
	weeklyLossCents: number | null
	monthlyLossCents: number
	dailyProfitTargetCents: number | null
}

// ─── Main Component ─────────────────────────────────────────

interface DecisionTreeModalProps {
	open: boolean
	onOpenChange: (open: boolean) => void
	profile: RiskManagementProfile
	effectiveValues?: EffectiveValues | null
}

const DecisionTreeModal = ({
	open,
	onOpenChange,
	profile,
	effectiveValues,
}: DecisionTreeModalProps) => {
	const t = useTranslations("commandCenter.plan.decisionTree")
	const { formatCurrency, formatCurrencyWithSign } = useFormatting()
	const { decisionTree } = profile

	// Resolve effective values (fall back to stored when no overrides)
	const baseRiskCents = effectiveValues?.riskCents ?? decisionTree.baseTrade.riskCents
	const dailyLossCents = effectiveValues?.dailyLossCents ?? profile.dailyLossCents
	const weeklyLossCents = effectiveValues?.weeklyLossCents ?? decisionTree.cascadingLimits.weeklyLossCents
	const monthlyLossCents = effectiveValues?.monthlyLossCents ?? decisionTree.cascadingLimits.monthlyLossCents
	const dailyTargetCents = effectiveValues?.dailyProfitTargetCents ?? profile.dailyProfitTargetCents

	// Build resolved gain mode with effective daily target
	const resolvedGainMode = useMemo(() => {
		if (dailyTargetCents == null) return decisionTree.gainMode
		return { ...decisionTree.gainMode, dailyTargetCents }
	}, [decisionTree.gainMode, dailyTargetCents])

	// Build resolved cascading limits with effective values
	const resolvedCascadingLimits = useMemo(() => ({
		...decisionTree.cascadingLimits,
		weeklyLossCents,
		monthlyLossCents,
	}), [decisionTree.cascadingLimits, weeklyLossCents, monthlyLossCents])

	const situations = useMemo(
		() => computeTradeSituations(decisionTree, baseRiskCents, profile, t),
		[decisionTree, baseRiskCents, profile, t]
	)

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				id="decision-tree-modal"
				className="max-h-[85dvh] max-w-[92dvw] overflow-y-auto"
			>
				<DialogHeader>
					<DialogTitle>
						{t("title")} &mdash; {profile.name}
					</DialogTitle>
				</DialogHeader>

				<Tabs defaultValue="overview">
					<TabsList variant="line" className="w-full overflow-x-auto scrollbar-none">
						<TabsTrigger value="overview" className="shrink-0">{t("tabs.overview")}</TabsTrigger>
						<TabsTrigger value="paths" className="shrink-0">{t("tabs.paths")}</TabsTrigger>
						{situations.map((situation) => (
							<TabsTrigger
								key={situation.tradeNumber}
								value={`trade-${situation.tradeNumber}`}
								className="shrink-0"
							>
								T{situation.tradeNumber}
							</TabsTrigger>
						))}
					</TabsList>

					{/* Overview tab — flowchart + progression + scenarios */}
					<AnimatedTabsContent value="overview">
						<div className="pt-s-200 relative overflow-x-auto [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden after:pointer-events-none after:absolute after:top-0 after:right-0 after:bottom-0 after:z-10 after:w-6 after:bg-linear-to-l after:from-bg-100 after:to-transparent after:content-[''] sm:overflow-x-visible sm:after:hidden">
							<div className="min-w-[600px] flex flex-col items-center gap-0">
							{/* Base Trade */}
							<div className="w-full max-w-sm">
								<BaseTradeNode
									riskCents={baseRiskCents}
									maxContracts={decisionTree.baseTrade.maxContracts}
									minStopPoints={decisionTree.baseTrade.minStopPoints}
									formatCurrency={formatCurrency}
									t={t}
								/>
							</div>

							{/* Connector from base to branch */}
							<VerticalConnector />

							{/* Branch split */}
							<div className="w-full">
								<BranchSplit
									lossLabel={t("lossPath")}
									winLabel={t("winPath")}
								/>
							</div>

							{/* Two-column branches */}
							<div className="gap-m-400 grid w-full grid-cols-2">
								{/* Loss path */}
								<div className="flex flex-col">
									<VerticalConnector className="bg-trade-sell/50" />
									<RecoverySequence
										steps={decisionTree.lossRecovery.sequence}
										baseRiskCents={baseRiskCents}
										dailyLossCents={dailyLossCents}
										executeAllRegardless={
											decisionTree.lossRecovery.executeAllRegardless
										}
										stopAfterSequence={
											decisionTree.lossRecovery.stopAfterSequence
										}
										formatCurrency={formatCurrency}
										t={t}
									/>
								</div>

								{/* Win path */}
								<div className="flex flex-col">
									<VerticalConnector className="bg-trade-buy/50" />
									<GainModeCard
										gainMode={resolvedGainMode}
										baseRiskCents={baseRiskCents}
										formatCurrency={formatCurrency}
										t={t}
									/>
								</div>
							</div>

							{/* Connector to limits */}
							<VerticalConnector />

							{/* Cascading Limits & Constraints */}
							<div className="w-full">
								<LimitsSection
									cascadingLimits={resolvedCascadingLimits}
									executionConstraints={decisionTree.executionConstraints}
									formatCurrency={formatCurrency}
									t={t}
								/>
							</div>

							{/* Full Day Progression */}
							<div className="w-full">
								<FullDayProgression
									situations={situations}
									dailyLossCents={dailyLossCents}
									formatCurrency={formatCurrency}
									t={t}
								/>
							</div>

							{/* Scenario Examples */}
							<div className="w-full">
								<ScenarioExamples
									situations={situations}
									dailyLossCents={dailyLossCents}
									gainMode={resolvedGainMode}
									formatCurrency={formatCurrency}
									formatCurrencyWithSign={formatCurrencyWithSign}
									t={t}
								/>
							</div>
							</div>
						</div>
					</AnimatedTabsContent>

					{/* Paths tab — SVG binary tree */}
					<AnimatedTabsContent value="paths">
						<div className="pt-s-200 relative overflow-x-auto [-webkit-overflow-scrolling:touch] [&::-webkit-scrollbar]:hidden after:pointer-events-none after:absolute after:top-0 after:right-0 after:bottom-0 after:z-10 after:w-6 after:bg-linear-to-l after:from-bg-100 after:to-transparent after:content-[''] sm:overflow-x-visible sm:after:hidden">
							<RecoveryPathsTree
								situations={situations}
								executeAllRegardless={decisionTree.lossRecovery.executeAllRegardless}
								rewardRatio={RISK_REWARD_RATIO}
								formatCurrency={formatCurrency}
								t={t}
								gainMode={resolvedGainMode}
								baseRiskCents={baseRiskCents}
								stopAfterSequence={decisionTree.lossRecovery.stopAfterSequence}
							/>
						</div>
					</AnimatedTabsContent>

					{/* Per-trade tabs */}
					{situations.map((situation) => (
						<AnimatedTabsContent
							key={situation.tradeNumber}
							value={`trade-${situation.tradeNumber}`}
						>
							<TradeSituationTab
								situation={situation}
								situations={situations}
								decisionTree={decisionTree}
								dailyLossCents={dailyLossCents}
								gainMode={resolvedGainMode}
								formatCurrency={formatCurrency}
								t={t}
							/>
						</AnimatedTabsContent>
					))}
				</Tabs>
			</DialogContent>
		</Dialog>
	)
}

export { DecisionTreeModal, RISK_REWARD_RATIO }
export type { TradeSituation }
