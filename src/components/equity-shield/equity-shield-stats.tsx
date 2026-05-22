"use client"

import { memo } from "react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { formatCompactCurrency } from "@/lib/formatting"
import { ShieldCheck, ShieldX } from "lucide-react"
import type { EquityShieldResult } from "@/types/equity-shield"

interface EquityShieldStatsProps {
	stats: EquityShieldResult["stats"]
	initialBalance: number
	drawdownLimit: number
}

interface StatCardProps {
	label: string
	value: string
	subValue?: string
	signedVariant?: "positive" | "negative"
	verdictVariant?: "pass" | "fail"
}

const StatCard = memo(
	({
		label,
		value,
		subValue,
		signedVariant,
		verdictVariant,
	}: StatCardProps) => {
		const valueClass = cn(
			"text-body sm:text-h3 font-semibold tabular-nums truncate",
			signedVariant === "positive" && "text-trade-buy",
			signedVariant === "negative" && "text-trade-sell",
			verdictVariant === "pass" && "text-fb-success",
			verdictVariant === "fail" && "text-fb-error",
			!signedVariant && !verdictVariant && "text-txt-100"
		)

		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 rounded-lg border">
				<p className="text-tiny text-txt-300 mb-s-100">{label}</p>
				<p className={valueClass}>{value}</p>
				{subValue && (
					<p className="text-tiny text-txt-300 mt-s-100">{subValue}</p>
				)}
			</div>
		)
	}
)
StatCard.displayName = "EquityShieldStatCard"

const formatCurrency = (value: number): string =>
	formatCompactCurrency(value, "BRL")

interface PassFailBadgeProps {
	wouldPass: boolean
	maxDrawdown: number
	drawdownLimit: number
}

const PassFailBadge = memo(
	({ wouldPass, maxDrawdown, drawdownLimit }: PassFailBadgeProps) => {
		const t = useTranslations("equityShield.stats")

		return (
			<div
				className={cn(
					"border-bg-300 bg-bg-200 gap-s-200 p-s-300 sm:p-m-400 flex items-center rounded-lg border"
				)}
			>
				<div className="flex flex-col">
					<p className="text-tiny text-txt-300 mb-s-100">{t("wouldPass")}</p>
					<div className="gap-s-200 flex items-center">
						{wouldPass ? (
							<ShieldCheck
								className="text-fb-success h-5 w-5"
								aria-hidden="true"
							/>
						) : (
							<ShieldX className="text-fb-error h-5 w-5" aria-hidden="true" />
						)}
						<span
							className={cn(
								"text-body truncate font-semibold",
								wouldPass ? "text-fb-success" : "text-fb-error"
							)}
						>
							{wouldPass ? t("pass") : t("fail")}
						</span>
					</div>
					<p className="text-tiny text-txt-300 mt-s-100">
						{wouldPass
							? t("passReason", {
									maxDD: formatCurrency(maxDrawdown),
									limit: formatCurrency(drawdownLimit),
								})
							: t("failReason", {
									maxDD: formatCurrency(maxDrawdown),
									limit: formatCurrency(drawdownLimit),
								})}
					</p>
				</div>
			</div>
		)
	}
)
PassFailBadge.displayName = "EquityShieldPassFailBadge"

const formatPercent = (value: number): string => `${value.toFixed(1)}%`

const EquityShieldStats = ({
	stats,
	initialBalance,
	drawdownLimit,
}: EquityShieldStatsProps) => {
	const t = useTranslations("equityShield.stats")

	const originalPnl = stats.originalFinalEquity - initialBalance
	const method1Pnl = stats.method1.livePnl
	const method2Pnl = stats.method2.livePnl

	return (
		<div className="space-y-s-300 sm:space-y-m-400">
			<h2 className="text-body sm:text-h3 text-txt-100 font-semibold">
				{t("title")}
			</h2>

			{/* Top row: Key comparisons */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 [&>div]:min-w-0 [&>div]:overflow-hidden">
				<StatCard label={t("totalTrades")} value={String(stats.totalTrades)} />
				<StatCard
					label={t("observedMDD")}
					value={formatCurrency(stats.observedMDD)}
					subValue={formatPercent(stats.observedMDDPercent)}
					signedVariant="negative"
				/>
				<StatCard
					label={t("m1Threshold")}
					value={formatCurrency(stats.method1Threshold)}
					subValue={t("m1ThresholdSub")}
				/>
				<PassFailBadge
					wouldPass={stats.originalWouldPass}
					maxDrawdown={stats.observedMDD}
					drawdownLimit={drawdownLimit}
				/>
			</div>

			{/* Method comparison row */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 sm:grid-cols-3 md:grid-cols-3 [&>div]:min-w-0 [&>div]:overflow-hidden">
				{/* Original */}
				<div className="border-bg-300 bg-bg-200 space-y-s-200 p-m-400 rounded-lg border">
					<h3 className="text-small text-acc-100 font-semibold">
						{t("original")}
					</h3>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("finalPnl")}</span>
						<span
							className={cn(
								"text-small font-medium",
								originalPnl >= 0 ? "text-trade-buy" : "text-trade-sell"
							)}
						>
							{originalPnl >= 0 ? "+" : ""}
							{formatCurrency(originalPnl)}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("maxDD")}</span>
						<span className="text-small text-trade-sell font-medium">
							{formatCurrency(stats.observedMDD)}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("liveTrades")}</span>
						<span className="text-small text-txt-100 font-medium">
							{stats.totalTrades}
						</span>
					</div>
				</div>

				{/* Method 1 */}
				<div className="border-bg-300 bg-bg-200 space-y-s-200 p-m-400 rounded-lg border">
					<div className="flex items-center justify-between">
						<h3 className="text-small text-txt-100 font-semibold">
							{t("method1")}
						</h3>
						<PassFailBadge
							wouldPass={stats.method1.wouldPass}
							maxDrawdown={stats.method1.maxDrawdown}
							drawdownLimit={drawdownLimit}
						/>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("finalPnl")}</span>
						<span
							className={cn(
								"text-small font-medium",
								method1Pnl >= 0 ? "text-trade-buy" : "text-trade-sell"
							)}
						>
							{method1Pnl >= 0 ? "+" : ""}
							{formatCurrency(method1Pnl)}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("maxDD")}</span>
						<span className="text-small text-trade-sell font-medium">
							{formatCurrency(stats.method1.maxDrawdown)}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("liveTrades")}</span>
						<span className="text-small text-txt-100 font-medium">
							{stats.method1.liveTrades}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("simTrades")}</span>
						<span className="text-small text-txt-300 font-medium">
							{stats.method1.simTrades}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("transitions")}</span>
						<span className="text-small text-txt-100 font-medium">
							{stats.method1.modeTransitions}
						</span>
					</div>
				</div>

				{/* Method 2 */}
				<div className="border-bg-300 bg-bg-200 space-y-s-200 p-m-400 rounded-lg border">
					<div className="flex items-center justify-between">
						<h3 className="text-small text-txt-100 font-semibold">
							{t("method2")}
						</h3>
						<PassFailBadge
							wouldPass={stats.method2.wouldPass}
							maxDrawdown={stats.method2.maxDrawdown}
							drawdownLimit={drawdownLimit}
						/>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("finalPnl")}</span>
						<span
							className={cn(
								"text-small font-medium",
								method2Pnl >= 0 ? "text-trade-buy" : "text-trade-sell"
							)}
						>
							{method2Pnl >= 0 ? "+" : ""}
							{formatCurrency(method2Pnl)}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("maxDD")}</span>
						<span className="text-small text-trade-sell font-medium">
							{formatCurrency(stats.method2.maxDrawdown)}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("liveTrades")}</span>
						<span className="text-small text-txt-100 font-medium">
							{stats.method2.liveTrades}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("simTrades")}</span>
						<span className="text-small text-txt-300 font-medium">
							{stats.method2.simTrades}
						</span>
					</div>
					<div className="py-s-100 flex items-center justify-between">
						<span className="text-tiny text-txt-300">{t("transitions")}</span>
						<span className="text-small text-txt-100 font-medium">
							{stats.method2.modeTransitions}
						</span>
					</div>
				</div>
			</div>
		</div>
	)
}

export { EquityShieldStats }
