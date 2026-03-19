"use client"

import { useState, useMemo, type ChangeEvent } from "react"
import { useTranslations } from "next-intl"
import {
	Zap,
	AlertCircle,
	ArrowUp,
	ArrowDown,
	Minus,
	Calculator,
	ShieldAlert,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fromCents } from "@/lib/money"
import { calculateTickBasedPositionSize } from "@/lib/calculations"
import { translateRiskReason } from "@/lib/risk-reason-i18n"
import { useFormatting } from "@/hooks/use-formatting"
import type {
	LiveTradingStatusResult,
	TradeSummary,
} from "@/types/live-trading-status"
import type { Asset } from "@/db/schema"

// ==========================================
// SUB-COMPONENTS
// ==========================================

interface MetricCellProps {
	label: string
	value: string
	subLabel?: string
	valueClassName?: string
}

const MetricCell = ({
	label,
	value,
	subLabel,
	valueClassName = "text-txt-100",
}: MetricCellProps) => (
	<div className="space-y-s-100">
		<span className="text-tiny text-txt-300 block">{label}</span>
		<span className={cn("text-body block font-semibold", valueClassName)}>
			{value}
		</span>
		{subLabel && (
			<span className="text-tiny text-txt-300 block">{subLabel}</span>
		)}
	</div>
)

interface RecoveryStepTrackerProps {
	currentStep: number
	totalSteps: number
	exhausted: boolean
	t: ReturnType<typeof useTranslations>
}

const RecoveryStepTracker = ({
	currentStep,
	totalSteps,
	exhausted,
	t,
}: RecoveryStepTrackerProps) => (
	<div className="space-y-s-200">
		<span className="text-tiny text-txt-300 block">{t("recovery.title")}</span>
		<div className="gap-s-200 flex items-center">
			{Array.from({ length: totalSteps }, (_, index) => {
				const isCurrent = index === currentStep
				const isPast = index < currentStep

				return (
					<div
						key={index}
						className={cn(
							"flex h-2 flex-1 rounded-full transition-colors",
							isCurrent && "bg-trade-sell",
							isPast && "bg-trade-sell/30",
							!isCurrent && !isPast && "bg-bg-300"
						)}
						role="progressbar"
						aria-valuenow={currentStep + 1}
						aria-valuemin={1}
						aria-valuemax={totalSteps}
						aria-label={t("recovery.step", {
							current: index + 1,
							total: totalSteps,
						})}
					/>
				)
			})}
		</div>
		{exhausted && (
			<span className="text-tiny text-fb-error">{t("recovery.exhausted")}</span>
		)}
	</div>
)

interface MiniCalculatorProps {
	riskBudgetCents: number
	maxContracts: number | null
	availableAssets: Asset[]
	t: ReturnType<typeof useTranslations>
	formatCurrency: (value: number) => string
}

const MiniCalculator = ({
	riskBudgetCents,
	maxContracts,
	availableAssets,
	t,
	formatCurrency,
}: MiniCalculatorProps) => {
	const [selectedAssetId, setSelectedAssetId] = useState("")
	const [stopPoints, setStopPoints] = useState("")

	const selectedAsset = useMemo(
		() => availableAssets.find((asset) => asset.id === selectedAssetId),
		[availableAssets, selectedAssetId]
	)

	const result = useMemo(() => {
		if (!selectedAsset || !stopPoints) return null

		const stopParsed = parseFloat(stopPoints)
		if (isNaN(stopParsed) || stopParsed <= 0) return null

		const tickSize = parseFloat(String(selectedAsset.tickSize))
		const tickValue = selectedAsset.tickValue

		if (tickSize <= 0 || tickValue <= 0) return null

		// Build a synthetic entry/SL pair to use calculateTickBasedPositionSize
		const entryPrice = 1000 // arbitrary reference
		const stopLoss = entryPrice - stopParsed

		return calculateTickBasedPositionSize({
			riskBudgetCents,
			entryPrice,
			stopLoss,
			tickSize,
			tickValue,
			maxContracts,
		})
	}, [selectedAsset, stopPoints, riskBudgetCents, maxContracts])

	const handleStopPointsChange = (event: ChangeEvent<HTMLInputElement>) => {
		setStopPoints(event.target.value)
	}

	const handleAssetChange = (event: ChangeEvent<HTMLSelectElement>) => {
		setSelectedAssetId(event.target.value)
	}

	return (
		<div className="mt-s-300 sm:mt-m-400 border-bg-300 bg-bg-200 p-s-200 sm:p-s-300 rounded-md border">
			<div className="mb-s-300 gap-s-200 flex items-center">
				<Calculator className="text-txt-300 h-3.5 w-3.5" />
				<span className="text-tiny text-txt-200 font-medium">
					{t("calculator.title")}
				</span>
			</div>

			<div className="gap-s-100 sm:gap-s-300 flex flex-wrap items-end">
				{/* Asset selector */}
				<div className="w-full sm:min-w-[140px] sm:w-auto flex-1">
					<label
						htmlFor="calc-asset"
						className="text-tiny text-txt-300 mb-s-100 block"
					>
						{t("calculator.asset")}
					</label>
					<select
						id="calc-asset"
						value={selectedAssetId}
						onChange={handleAssetChange}
						className="text-base md:text-sm border-bg-300 bg-bg-100 px-s-200 py-s-100 text-txt-100 focus:border-acc-100 w-full rounded border outline-none"
						aria-label={t("calculator.asset")}
					>
						<option value="">{t("calculator.selectAsset")}</option>
						{availableAssets.map((asset) => (
							<option key={asset.id} value={asset.id}>
								{asset.symbol}
							</option>
						))}
					</select>
				</div>

				{/* Stop points input */}
				<div className="w-full sm:min-w-[100px] sm:w-auto flex-1">
					<label
						htmlFor="calc-stop"
						className="text-tiny text-txt-300 mb-s-100 block"
					>
						{t("calculator.stopPoints")}
					</label>
					<input
						id="calc-stop"
						type="number"
						min="0"
						step="any"
						value={stopPoints}
						onChange={handleStopPointsChange}
						placeholder={t("calculator.stopPlaceholder")}
						className="text-base md:text-sm border-bg-300 bg-bg-100 px-s-200 py-s-100 text-txt-100 focus:border-acc-100 w-full rounded border outline-none"
						aria-label={t("calculator.stopPoints")}
					/>
				</div>

				{/* Result */}
				<div className="w-full sm:min-w-[120px] sm:w-auto flex-1">
					{result && result.contracts > 0 ? (
						<div className="space-y-s-100">
							<span className="text-body text-acc-100 block font-semibold">
								{t("calculator.result", { contracts: result.contracts })}
							</span>
							<span className="text-tiny text-txt-300 block">
								{t("calculator.actualRisk")}:{" "}
								{formatCurrency(fromCents(result.actualRiskCents))}
							</span>
						</div>
					) : (
						<span className="text-tiny text-txt-300 block">
							{t("calculator.noStop")}
						</span>
					)}
				</div>
			</div>
		</div>
	)
}

// ==========================================
// TRADE SUMMARY BOXES
// ==========================================

interface TradeBoxProps {
	summary: TradeSummary
	formatCurrency: (value: number) => string
	t: ReturnType<typeof useTranslations>
	directionLabels: { long: string; short: string }
}

const TradeBox = ({ summary, formatCurrency, t, directionLabels }: TradeBoxProps) => {
	const pnlColor =
		summary.outcome === "win"
			? "text-trade-buy"
			: summary.outcome === "loss"
				? "text-trade-sell"
				: "text-txt-300"

	const directionBadge =
		summary.direction === "long"
			? { label: directionLabels.long, className: "bg-action-buy-muted text-action-buy" }
			: { label: directionLabels.short, className: "bg-action-sell-muted text-action-sell" }

	return (
		<div
			className="border-bg-300 bg-bg-200 p-s-200 min-w-[100px] shrink-0 rounded-md border"
			aria-label={t("tradeBoxes.tradeLabel", {
				number: summary.tradeStepNumber,
			})}
		>
			<div className="mb-s-100 flex items-center justify-between">
				<span className="text-tiny text-txt-200 font-semibold">
					T{summary.tradeStepNumber}
				</span>
				<span
					className={cn(
						"px-s-100 text-tiny rounded font-bold",
						directionBadge.className
					)}
				>
					{directionBadge.label}
				</span>
			</div>

			<span className={cn("text-small block font-semibold", pnlColor)}>
				{formatCurrency(fromCents(summary.pnlCents))}
			</span>

			<div className="mt-s-100 text-tiny text-txt-300 space-y-px">
				<span className="block">
					{t("tradeBoxes.size", { size: summary.positionSize })}
				</span>
				{summary.riskAmountCents !== null && (
					<span className="block">
						{t("tradeBoxes.risk", {
							risk: formatCurrency(fromCents(summary.riskAmountCents)),
						})}
					</span>
				)}
			</div>
		</div>
	)
}

interface TradeBoxRowProps {
	summaries: TradeSummary[]
	formatCurrency: (value: number) => string
	t: ReturnType<typeof useTranslations>
	directionLabels: { long: string; short: string }
}

const TradeBoxRow = ({ summaries, formatCurrency, t, directionLabels }: TradeBoxRowProps) => {
	if (summaries.length === 0) return null

	return (
		<div className="mt-s-300 sm:mt-m-400">
			<span className="text-tiny text-txt-300 mb-s-200 block">
				{t("tradeBoxes.title")}
			</span>
			<div
				className="gap-s-200 flex overflow-x-auto"
				role="list"
				aria-label={t("tradeBoxes.title")}
			>
				{summaries.map((summary, index) => (
					<div key={index} role="listitem">
						<TradeBox summary={summary} formatCurrency={formatCurrency} t={t} directionLabels={directionLabels} />
					</div>
				))}
			</div>
		</div>
	)
}

// ==========================================
// MAIN PANEL
// ==========================================

interface LiveTradingStatusPanelProps {
	data: LiveTradingStatusResult | null
	availableAssets: Asset[]
}

const LiveTradingStatusPanel = ({
	data,
	availableAssets,
}: LiveTradingStatusPanelProps) => {
	const t = useTranslations("commandCenter.liveStatus")
	const tDir = useTranslations("commandCenter.directionAbbr")
	const tRisk = useTranslations("riskSimulation")
	const { formatCurrency } = useFormatting()
	const directionLabels = { long: tDir("long"), short: tDir("short") }

	// Loading state
	if (!data) {
		return (
			<div
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
				data-testid="live-trading-status-panel"
			>
				<div className="gap-s-200 flex items-center">
					<AlertCircle className="text-txt-300 h-5 w-5" />
					<p className="text-small text-txt-300">{t("loading")}</p>
				</div>
			</div>
		)
	}

	// No profile linked
	if (!data.hasProfile) {
		return (
			<div
				className="border-bg-300 bg-bg-100 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border border-dashed"
				data-testid="live-trading-status-panel"
			>
				<div className="gap-s-300 flex items-center">
					<ShieldAlert className="text-txt-300 h-6 w-6 shrink-0" />
					<p className="text-small text-txt-200">{t("noProfile")}</p>
				</div>
			</div>
		)
	}

	const { status, tradeSummaries } = data

	// When trading is done (target hit or loss limit), show summary with stop reason.
	if (status.shouldStopTrading) {
		return (
			<div
				className="border-trade-sell/30 bg-trade-sell/5 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
				data-testid="live-trading-status-panel"
			>
				<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
					<div className="gap-s-200 flex items-center">
						<Zap className="text-txt-300 h-5 w-5" />
						<h3 className="text-small text-txt-200 font-semibold">
							{t("title")}
						</h3>
					</div>
					<span className="bg-trade-sell/20 text-trade-sell px-s-300 py-s-100 text-tiny rounded-full font-bold">
						{t("stop.shouldStop")}
					</span>
				</div>

				{status.stopReason && (
					<p className="text-small text-trade-sell mb-s-300 sm:mb-m-400">
						{t(`stop.${status.stopReason}`)}
					</p>
				)}

				<div className="gap-s-300 sm:gap-m-400 grid grid-cols-2 sm:grid-cols-3">
					<MetricCell
						label={t("summary.tradesCompleted")}
						value={String(status.dayTradeNumber)}
					/>
					<MetricCell
						label={t("summary.dailyPnl")}
						value={formatCurrency(fromCents(status.dailyPnlCents))}
						valueClassName={
							status.dailyPnlCents >= 0 ? "text-trade-buy" : "text-trade-sell"
						}
					/>
					<MetricCell
						label={t("metrics.nextRisk")}
						value={formatCurrency(fromCents(status.nextTradeRiskCents))}
						subLabel={translateRiskReason(tRisk, status.riskReason)}
					/>
				</div>

				<TradeBoxRow
					summaries={tradeSummaries}
					formatCurrency={formatCurrency}
					t={t}
					directionLabels={directionLabels}
				/>

				<MiniCalculator
					riskBudgetCents={status.nextTradeRiskCents}
					maxContracts={status.nextTradeMaxContracts}
					availableAssets={availableAssets}
					t={t}
					formatCurrency={formatCurrency}
				/>
			</div>
		)
	}

	// Active trading — full interactive panel
	const getPhaseStyles = () => {
		switch (status.dayPhase) {
			case "loss_recovery":
				return {
					borderClass: "border-trade-sell/30",
					bgClass: "bg-trade-sell/5",
				}
			case "gain_mode":
				return {
					borderClass: "border-trade-buy/30",
					bgClass: "bg-trade-buy/5",
				}
			case "base":
			case "normal":
			default:
				return {
					borderClass: "border-acc-100/30",
					bgClass: "bg-acc-100/5",
				}
		}
	}

	const phaseStyles = getPhaseStyles()

	// Phase badge
	const getPhaseBadge = () => {
		if (
			status.dayPhase === "loss_recovery" &&
			status.recoveryStepIndex !== null
		) {
			return {
				text: t("recovery.badge", {
					current: status.recoveryStepIndex + 1,
					total: status.totalRecoverySteps,
				}),
				className: "bg-trade-sell/20 text-trade-sell",
			}
		}

		if (status.dayPhase === "gain_mode") {
			return {
				text: t(`phase.${status.dayPhase}`),
				className: "bg-trade-buy/20 text-trade-buy",
			}
		}

		return {
			text: t(`phase.${status.dayPhase}`),
			className: "bg-acc-100/20 text-acc-100",
		}
	}

	const badge = getPhaseBadge()

	// Size direction
	const getSizeDirectionDisplay = () => {
		if (status.shouldIncreaseSize) {
			return {
				label: t("metrics.increase"),
				Icon: ArrowUp,
				className: "text-trade-buy",
			}
		}
		if (status.shouldDecreaseSize) {
			return {
				label: t("metrics.decrease"),
				Icon: ArrowDown,
				className: "text-trade-sell",
			}
		}
		return {
			label: t("metrics.unchanged"),
			Icon: Minus,
			className: "text-txt-300",
		}
	}

	const sizeDirection = getSizeDirectionDisplay()

	// Gain mode sub-label
	const getGainModeLabel = () => {
		if (status.dayPhase !== "gain_mode") return undefined

		if (
			status.gainModeType === "compounding" &&
			status.gainModeReinvestPercent
		) {
			return t("gainMode.compounding", {
				percent: status.gainModeReinvestPercent,
			})
		}
		if (status.gainModeType === "gainSequence") {
			return t("gainMode.gainSequence", {
				current: (status.gainSequenceStepIndex ?? 0) + 1,
				total: status.totalGainSequenceSteps,
			})
		}
		return t("gainMode.singleTarget")
	}

	return (
		<div
			id="cc-live-trading"
			className={cn(
				"p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border transition-colors",
				phaseStyles.borderClass,
				phaseStyles.bgClass
			)}
			data-testid="live-trading-status-panel"
		>
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
				<div className="gap-s-200 flex items-center">
					<Zap className="text-acc-100 h-5 w-5 sm:h-6 sm:w-6" />
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("title")}
					</h3>
				</div>

				<span
					className={cn(
						"px-s-300 py-s-100 text-tiny rounded-full font-bold",
						badge.className
					)}
				>
					{badge.text}
				</span>
			</div>

			{/* Metrics row */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-2 sm:grid-cols-3">
				<MetricCell
					label={t("metrics.nextRisk")}
					value={formatCurrency(fromCents(status.nextTradeRiskCents))}
					subLabel={`${t("metrics.baseRisk")}: ${formatCurrency(fromCents(status.baseRiskCents))}`}
					valueClassName="text-acc-100"
				/>
				<MetricCell
					label={t("metrics.nextTrade")}
					value={t("metrics.tradeNumber", {
						number: status.dayTradeNumber + 1,
					})}
					subLabel={
						status.dayPhase === "gain_mode"
							? getGainModeLabel()
							: translateRiskReason(tRisk, status.riskReason)
					}
				/>
				<div className="space-y-s-100">
					<span className="text-tiny text-txt-300 block">
						{t("metrics.sizeDirection")}
					</span>
					<div className="gap-s-100 flex items-center">
						<sizeDirection.Icon
							className={cn("h-4 w-4", sizeDirection.className)}
						/>
						<span
							className={cn("text-body font-semibold", sizeDirection.className)}
						>
							{sizeDirection.label}
						</span>
					</div>
					{status.sizeDirectionReason && (
						<span className="text-tiny text-txt-300 block">
							{status.sizeDirectionReason}
						</span>
					)}
				</div>
			</div>

			{/* Recovery step tracker */}
			{status.dayPhase === "loss_recovery" && status.totalRecoverySteps > 0 && (
				<div className="mt-s-300 sm:mt-m-400">
					<RecoveryStepTracker
						currentStep={status.recoveryStepIndex ?? 0}
						totalSteps={status.totalRecoverySteps}
						exhausted={status.recoverySequenceExhausted}
						t={t}
					/>
				</div>
			)}

			{/* Trade summary boxes */}
			<TradeBoxRow
				summaries={tradeSummaries}
				formatCurrency={formatCurrency}
				t={t}
				directionLabels={directionLabels}
			/>

			{/* Mini position calculator */}
			<MiniCalculator
				riskBudgetCents={status.nextTradeRiskCents}
				maxContracts={status.nextTradeMaxContracts}
				availableAssets={availableAssets}
				t={t}
				formatCurrency={formatCurrency}
			/>
		</div>
	)
}

export { LiveTradingStatusPanel }
