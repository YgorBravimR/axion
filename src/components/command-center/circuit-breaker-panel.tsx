"use client"

import type { ElementType } from "react"
import {
	AlertTriangle,
	CheckCircle,
	XCircle,
	AlertCircle,
	ShieldAlert,
	TrendingDown,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { CircuitBreakerStatus } from "@/lib/validations/command-center"
import { fromCents } from "@/lib/money"
import { useFormatting } from "@/hooks/use-formatting"

type CircuitBreakerState =
	| "clear"
	| "profitAttention"
	| "lossAttention"
	| "profitStop"
	| "lossStop"

interface CircuitBreakerStateConfig {
	state: CircuitBreakerState
	borderClass: string
	bgClass: string
	icon: ElementType
	iconClass: string
	badgeText?: string
	badgeClass?: string
}

const getCircuitBreakerState = (
	status: CircuitBreakerStatus,
	profitTarget: number | null,
	lossLimit: number | null
): CircuitBreakerStateConfig => {
	const isProfitStop = status.profitTargetHit && status.shouldStopTrading
	const isLossStop =
		(status.lossLimitHit || status.isMonthlyLimitHit) &&
		status.shouldStopTrading

	if (isLossStop) {
		return {
			state: "lossStop",
			borderClass: "border-fb-error",
			bgClass: "bg-fb-error/10",
			icon: XCircle,
			iconClass: "text-fb-error",
			badgeText: "stopTrading",
			badgeClass: "bg-fb-error text-white",
		}
	}

	if (isProfitStop) {
		return {
			state: "profitStop",
			borderClass: "border-trade-buy",
			bgClass: "bg-trade-buy/10",
			icon: CheckCircle,
			iconClass: "text-trade-buy",
			badgeText: "targetReached",
			badgeClass: "bg-trade-buy text-bg-100",
		}
	}

	const isLossAttention =
		!isLossStop &&
		status.dailyPnL < 0 &&
		lossLimit &&
		Math.abs(status.dailyPnL) / lossLimit >= 0.8
	if (isLossAttention) {
		return {
			state: "lossAttention",
			borderClass: "border-warning/50",
			bgClass: "bg-warning/5",
			icon: AlertTriangle,
			iconClass: "text-warning",
		}
	}

	const isProfitAttention =
		!isProfitStop &&
		status.dailyPnL > 0 &&
		profitTarget &&
		status.dailyPnL / profitTarget >= 0.8
	if (isProfitAttention) {
		return {
			state: "profitAttention",
			borderClass: "border-trade-buy/30",
			bgClass: "bg-trade-buy/5",
			icon: AlertCircle,
			iconClass: "text-trade-buy/60",
		}
	}

	return {
		state: "clear",
		borderClass: "border-action-buy/50",
		bgClass: "bg-action-buy/5",
		icon: CheckCircle,
		iconClass: "text-action-buy",
	}
}

interface CircuitBreakerPanelProps {
	status: CircuitBreakerStatus | null
}

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

export const CircuitBreakerPanel = ({
	status,
}: CircuitBreakerPanelProps) => {
	const t = useTranslations("commandCenter.circuitBreaker")
	const { formatCurrency } = useFormatting()

	if (!status) {
		return (
			<div id="cc-circuit-breaker" className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<div className="gap-s-200 flex items-center">
					<AlertCircle className="text-txt-300 h-5 w-5" />
					<p className="text-small text-txt-300">{t("loading")}</p>
				</div>
			</div>
		)
	}

	const hasWarnings = status.alerts.length > 0

	// Read limits directly from status (resolved from monthly plan)
	const profitTarget =
		status.profitTargetCents > 0 ? fromCents(status.profitTargetCents) : null
	const lossLimit =
		status.dailyLossLimitCents > 0
			? fromCents(status.dailyLossLimitCents)
			: null

	const stateConfig = getCircuitBreakerState(status, profitTarget, lossLimit)
	const StateIcon = stateConfig.icon
	const maxTrades = status.maxTrades
	const maxConsecutiveLosses = status.maxConsecutiveLosses
	const monthlyLossLimit =
		status.monthlyLossLimitCents > 0
			? fromCents(status.monthlyLossLimitCents)
			: null

	// Daily P&L sub-label
	const dailyPnLSubLabel =
		profitTarget && status.dailyPnL >= 0
			? `${t("target")}: ${formatCurrency(profitTarget)}`
			: lossLimit
				? `${t("limit")}: ${formatCurrency(lossLimit)}`
				: undefined

	return (
		<div
			id="cc-circuit-breaker"
			className={cn(
				"p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border transition-colors",
				stateConfig.borderClass,
				stateConfig.bgClass
			)}
		>
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400 flex items-center justify-between">
				<div className="gap-s-200 flex items-center">
					<StateIcon
						className={cn("h-5 w-5 sm:h-6 sm:w-6", stateConfig.iconClass)}
					/>
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("title")}
					</h3>
				</div>

				{stateConfig.badgeText && (
					<span
						className={cn(
							"px-m-400 py-s-100 text-small rounded-full font-bold",
							stateConfig.badgeClass
						)}
					>
						{t(stateConfig.badgeText)}
					</span>
				)}
			</div>

			{/* Attention states */}
			{stateConfig.state === "lossAttention" && (
				<div className="mb-s-300 sm:mb-m-400">
					<div className="gap-s-200 text-small text-warning flex items-center">
						<AlertTriangle className="h-4 w-4" />
						<span>{t("approachingLossLimit")}</span>
					</div>
				</div>
			)}
			{stateConfig.state === "profitAttention" && (
				<div className="mb-s-300 sm:mb-m-400">
					<div className="gap-s-200 text-small text-trade-buy/60 flex items-center">
						<AlertCircle className="h-4 w-4" />
						<span>{t("approachingProfitTarget")}</span>
					</div>
				</div>
			)}

			{/* Alerts */}
			{hasWarnings && (
				<div className="mb-s-300 sm:mb-m-400 space-y-s-200">
					{status.profitTargetHit && (
						<div className="gap-s-200 text-small text-trade-buy flex items-center">
							<CheckCircle className="h-4 w-4" />
							<span>{t("profitTargetHit")}</span>
						</div>
					)}
					{status.lossLimitHit && (
						<div className="gap-s-200 text-small text-fb-error flex items-center">
							<XCircle className="h-4 w-4" />
							<span>{t("lossLimitHit")}</span>
						</div>
					)}
					{status.maxTradesHit && (
						<div className="gap-s-200 text-small text-trade-sell flex items-center">
							<AlertTriangle className="h-4 w-4" />
							<span>{t("maxTradesHit")}</span>
						</div>
					)}
					{status.maxConsecutiveLossesHit && (
						<div className="gap-s-200 text-small text-fb-error flex items-center">
							<XCircle className="h-4 w-4" />
							<span>{t("consecutiveLossesHit")}</span>
						</div>
					)}
					{status.isMonthlyLimitHit && (
						<div className="gap-s-200 text-small text-fb-error flex items-center">
							<ShieldAlert className="h-4 w-4" />
							<span>{t("monthlyLimitHit")}</span>
						</div>
					)}
					{status.isSecondOpBlocked && (
						<div className="gap-s-200 text-small text-trade-sell flex items-center">
							<AlertTriangle className="h-4 w-4" />
							<span>{t("secondOpBlocked")}</span>
						</div>
					)}
					{status.reduceRiskAfterLoss &&
						status.consecutiveLosses > 0 &&
						status.riskReductionFactor && (
							<div className="gap-s-200 text-small text-acc-100 flex items-center">
								<TrendingDown className="h-4 w-4" />
								<span>
									{t("riskReduced", {
										factor: status.riskReductionFactor,
										losses: status.consecutiveLosses,
									})}
								</span>
							</div>
						)}
				</div>
			)}

			{/* Row 1: Daily metrics (3 columns) */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
				<MetricCell
					label={t("dailyPnL")}
					value={formatCurrency(status.dailyPnL)}
					valueClassName={
						status.dailyPnL >= 0 ? "text-trade-buy" : "text-trade-sell"
					}
					subLabel={dailyPnLSubLabel}
				/>
				<MetricCell
					label={t("trades")}
					value={
						maxTrades
							? `${status.tradesCount} / ${maxTrades}`
							: `${status.tradesCount}`
					}
					subLabel={maxTrades ? `${t("maxTrades")}: ${maxTrades}` : undefined}
				/>
				<MetricCell
					label={t("consecutiveLosses")}
					value={
						maxConsecutiveLosses
							? `${status.consecutiveLosses} / ${maxConsecutiveLosses}`
							: `${status.consecutiveLosses}`
					}
					subLabel={
						maxConsecutiveLosses
							? `${t("maxConsecutive")}: ${maxConsecutiveLosses}`
							: undefined
					}
				/>
			</div>

			{/* Row 2: Monthly + Risk metrics (2 columns) */}
			<div className="mt-s-300 sm:mt-m-400 gap-s-300 sm:gap-m-400 grid grid-cols-2">
				<MetricCell
					label={t("monthlyPnL")}
					value={formatCurrency(status.monthlyPnL)}
					valueClassName={
						status.monthlyPnL >= 0 ? "text-trade-buy" : "text-trade-sell"
					}
					subLabel={
						monthlyLossLimit
							? `${t("monthlyLimit")}: ${formatCurrency(monthlyLossLimit)}`
							: undefined
					}
				/>
				{status.remainingDailyRiskCents > 0 && (
					<MetricCell
						label={t("remainingDailyRisk")}
						value={formatCurrency(fromCents(status.remainingDailyRiskCents))}
						valueClassName="text-acc-100"
					/>
				)}
			</div>
		</div>
	)
}
