"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { PnLDisplay } from "./pnl-display"
import type { ExecutionSummary, PositionStatus } from "@/types"
import { ArrowRight, CheckCircle, AlertCircle, Clock } from "lucide-react"

interface PositionSummaryProps {
	summary: ExecutionSummary
	direction: "long" | "short"
	tickSize?: number
	tickValue?: number
	className?: string
}

export const PositionSummary = ({
	summary,
	direction,
	tickSize,
	tickValue,
	className,
}: PositionSummaryProps) => {
	const t = useTranslations("execution")

	const {
		totalEntryQuantity,
		totalExitQuantity,
		avgEntryPrice,
		avgExitPrice,
		remainingQuantity,
		positionStatus,
	} = summary

	// Calculate P&L
	const hasExits = totalExitQuantity > 0
	let pnlPerUnit = 0
	let totalPnl = 0

	if (hasExits && avgEntryPrice > 0 && avgExitPrice > 0) {
		const priceDiff =
			direction === "long"
				? avgExitPrice - avgEntryPrice
				: avgEntryPrice - avgExitPrice

		if (tickSize && tickValue) {
			// Tick-based calculation
			const ticksGained = priceDiff / tickSize
			pnlPerUnit = ticksGained * tickValue
			totalPnl = pnlPerUnit * totalExitQuantity
		} else {
			// Simple price-based calculation
			pnlPerUnit = priceDiff
			totalPnl = priceDiff * totalExitQuantity
		}
	}

	// Calculate closed percentage
	const closedPercent =
		totalEntryQuantity > 0
			? (totalExitQuantity / totalEntryQuantity) * 100
			: 0

	const formatPrice = (price: number) => {
		return price.toLocaleString("pt-BR", {
			minimumFractionDigits: 2,
			maximumFractionDigits: 2,
		})
	}

	const formatQuantity = (qty: number) => {
		return qty.toLocaleString("pt-BR", {
			minimumFractionDigits: 0,
			maximumFractionDigits: 2,
		})
	}

	const getStatusIcon = (status: PositionStatus) => {
		switch (status) {
			case "closed":
				return <CheckCircle className="h-4 w-4 text-trade-buy" />
			case "partial":
				return <Clock className="h-4 w-4 text-fb-warning" />
			case "open":
				return <AlertCircle className="h-4 w-4 text-fb-info" />
			case "over_exit":
				return <AlertCircle className="h-4 w-4 text-fb-error" />
		}
	}

	const getStatusText = (status: PositionStatus) => {
		return t(`positionStatus.${status}`)
	}

	const getStatusColor = (status: PositionStatus) => {
		switch (status) {
			case "closed":
				return "text-trade-buy"
			case "partial":
				return "text-fb-warning"
			case "open":
				return "text-fb-info"
			case "over_exit":
				return "text-fb-error"
		}
	}

	return (
		<div
			className={cn(
				"border-stroke-100 bg-bg-100 p-s-300 sm:p-m-400 rounded-lg border",
				className
			)}
		>
			<div className="mb-s-300 flex items-center justify-between">
				<h4 className="text-body text-txt-100 font-semibold">
					{t("positionSummary")}
				</h4>
				<div
					className={cn(
						"gap-s-200 flex items-center",
						getStatusColor(positionStatus)
					)}
				>
					{getStatusIcon(positionStatus)}
					<span className="text-small font-medium">
						{getStatusText(positionStatus)}
					</span>
				</div>
			</div>

			{/* Price Movement Visualization */}
			<div className="mb-m-400 space-y-s-200">
				<div className="text-small flex items-center justify-between">
					<div>
						<span className="text-txt-300">{t("avgEntry")}:</span>
						<span className="ml-s-200 text-txt-100 font-semibold">
							{formatPrice(avgEntryPrice)}
						</span>
					</div>
					{hasExits && (
						<div>
							<span className="text-txt-300">{t("avgExit")}:</span>
							<span className="ml-s-200 text-txt-100 font-semibold">
								{formatPrice(avgExitPrice)}
							</span>
						</div>
					)}
				</div>

				{hasExits && (
					<div className="gap-s-200 bg-bg-200 p-s-300 flex items-center rounded-md">
						<span className="text-txt-200">{formatPrice(avgEntryPrice)}</span>
						<ArrowRight className="text-txt-300 h-4 w-4" />
						<span className="text-txt-200">{formatPrice(avgExitPrice)}</span>
						<span
							className={cn(
								"ml-auto font-semibold",
								totalPnl >= 0 ? "text-trade-buy" : "text-trade-sell"
							)}
						>
							{totalPnl >= 0 ? "+" : ""}
							{formatPrice(Math.abs(avgExitPrice - avgEntryPrice))} pts
						</span>
					</div>
				)}
			</div>

			{/* Progress Bar */}
			<div className="mb-m-400">
				<div className="mb-s-100 text-caption text-txt-200 flex justify-between">
					<span>{t("closed")}</span>
					<span>{closedPercent.toFixed(0)}%</span>
				</div>
				<div className="bg-bg-300 h-2 overflow-hidden rounded-full">
					<div
						className={cn(
							"h-full transition-[width]",
							positionStatus === "closed"
								? "bg-trade-buy"
								: positionStatus === "partial"
									? "bg-fb-warning"
									: "bg-fb-info"
						)}
						style={{ width: `${Math.min(closedPercent, 100)}%` }}
					/>
				</div>
			</div>

			{/* Summary Stats */}
			<div className="gap-s-200 sm:gap-s-300 border-stroke-100 pt-s-300 grid grid-cols-1 sm:grid-cols-3 border-t">
				<div className="text-center">
					<div className="text-caption text-txt-200">{t("totalIn")}</div>
					<div className="text-body text-txt-100 font-semibold">
						{formatQuantity(totalEntryQuantity)}
					</div>
				</div>
				<div className="text-center">
					<div className="text-caption text-txt-200">{t("totalOut")}</div>
					<div className="text-body text-txt-100 font-semibold">
						{formatQuantity(totalExitQuantity)}
					</div>
				</div>
				<div className="text-center">
					<div className="text-caption text-txt-200">{t("remaining")}</div>
					<div
						className={cn(
							"text-body font-semibold",
							remainingQuantity > 0 ? "text-fb-warning" : "text-trade-buy"
						)}
					>
						{formatQuantity(remainingQuantity)}
					</div>
				</div>
			</div>

			{/* P&L Summary (if closed or partially closed) */}
			{hasExits && (
				<div className="mt-s-300 border-stroke-100 pt-s-300 border-t">
					<div className="flex items-center justify-between">
						<span className="text-small text-txt-300">{t("realizedPnL")}</span>
						<PnLDisplay value={totalPnl} size="lg" />
					</div>
					{tickSize && tickValue && (
						<div className="mt-s-100 text-caption text-txt-200">
							{pnlPerUnit >= 0 ? "+" : ""}
							{formatPrice(pnlPerUnit)} / {t("contract")}
						</div>
					)}
				</div>
			)}
		</div>
	)
}
