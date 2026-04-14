"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { formatCompactCurrency } from "@/lib/formatting"
import { ShieldCheck, ShieldX } from "lucide-react"
import type { EquityShieldResult } from "@/types/equity-shield"

interface EquityShieldStatsProps {
	stats: EquityShieldResult["stats"]
	initialBalance: number
}

interface StatCardProps {
	label: string
	value: string
	subValue?: string
	variant?: "default" | "positive" | "negative" | "pass" | "fail"
}

const StatCard = ({ label, value, subValue, variant = "default" }: StatCardProps) => {
	const valueClass = cn(
		"text-body sm:text-h3 font-semibold",
		variant === "positive" && "text-trade-buy",
		variant === "negative" && "text-trade-sell",
		variant === "pass" && "text-trade-buy",
		variant === "fail" && "text-trade-sell",
		variant === "default" && "text-txt-100"
	)

	return (
		<div className="border-bg-300 bg-bg-200 rounded-lg border p-s-300 sm:p-m-400">
			<p className="text-tiny text-txt-300 mb-1">{label}</p>
			<p className={valueClass}>{value}</p>
			{subValue && (
				<p className="text-tiny text-txt-300 mt-0.5">{subValue}</p>
			)}
		</div>
	)
}

const PassFailBadge = ({ wouldPass }: { wouldPass: boolean }) => {
	const t = useTranslations("equityShield.stats")

	return (
		<div
			className={cn(
				"border-bg-300 bg-bg-200 flex items-center gap-s-200 rounded-lg border p-s-300 sm:p-m-400",
			)}
		>
			<div className="flex flex-col">
				<p className="text-tiny text-txt-300 mb-1">{t("wouldPass")}</p>
				<div className="flex items-center gap-s-200">
					{wouldPass ? (
						<ShieldCheck className="text-trade-buy h-5 w-5" />
					) : (
						<ShieldX className="text-trade-sell h-5 w-5" />
					)}
					<span
						className={cn(
							"text-body font-semibold",
							wouldPass ? "text-trade-buy" : "text-trade-sell"
						)}
					>
						{wouldPass ? t("pass") : t("fail")}
					</span>
				</div>
			</div>
		</div>
	)
}

const EquityShieldStats = ({ stats, initialBalance }: EquityShieldStatsProps) => {
	const t = useTranslations("equityShield.stats")

	const formatCurrency = (value: number): string =>
		formatCompactCurrency(value, "R$")

	const formatPercent = (value: number): string => `${value.toFixed(1)}%`

	const originalPnl = stats.originalFinalEquity - initialBalance
	const method1Pnl = stats.method1.livePnl
	const method2Pnl = stats.method2.livePnl

	return (
		<div className="space-y-s-300 sm:space-y-m-400">
			<h2 className="text-body sm:text-h3 text-txt-100 font-semibold">
				{t("title")}
			</h2>

			{/* Top row: Key comparisons */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
				<StatCard
					label={t("totalTrades")}
					value={String(stats.totalTrades)}
				/>
				<StatCard
					label={t("observedMDD")}
					value={formatCurrency(stats.observedMDD)}
					subValue={formatPercent(stats.observedMDDPercent)}
					variant="negative"
				/>
				<StatCard
					label={t("m1Threshold")}
					value={formatCurrency(stats.method1Threshold)}
					subValue={t("m1ThresholdSub")}
				/>
				<PassFailBadge wouldPass={stats.originalWouldPass} />
			</div>

			{/* Method comparison row */}
			<div className="gap-s-300 sm:gap-m-400 grid grid-cols-1 md:grid-cols-3">
				{/* Original */}
				<div className="border-bg-300 bg-bg-200 space-y-s-200 rounded-lg border p-m-400">
					<h3 className="text-small text-acc-100 font-semibold">
						{t("original")}
					</h3>
					<div className="flex items-center justify-between py-1">
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
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("maxDD")}</span>
						<span className="text-small text-trade-sell font-medium">
							{formatCurrency(stats.observedMDD)}
						</span>
					</div>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("liveTrades")}</span>
						<span className="text-small text-txt-100 font-medium">
							{stats.totalTrades}
						</span>
					</div>
				</div>

				{/* Method 1 */}
				<div className="border-bg-300 bg-bg-200 space-y-s-200 rounded-lg border p-m-400">
					<div className="flex items-center justify-between">
						<h3 className="text-small text-trade-buy font-semibold">
							{t("method1")}
						</h3>
						<PassFailBadge wouldPass={stats.method1.wouldPass} />
					</div>
					<div className="flex items-center justify-between py-1">
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
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("maxDD")}</span>
						<span className="text-small text-trade-sell font-medium">
							{formatCurrency(stats.method1.maxDrawdown)}
						</span>
					</div>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("liveTrades")}</span>
						<span className="text-small text-trade-buy font-medium">
							{stats.method1.liveTrades}
						</span>
					</div>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("simTrades")}</span>
						<span className="text-small text-txt-300 font-medium">
							{stats.method1.simTrades}
						</span>
					</div>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("transitions")}</span>
						<span className="text-small text-txt-100 font-medium">
							{stats.method1.modeTransitions}
						</span>
					</div>
				</div>

				{/* Method 2 */}
				<div className="border-bg-300 bg-bg-200 space-y-s-200 rounded-lg border p-m-400">
					<div className="flex items-center justify-between">
						<h3 className="text-small text-acc-200 font-semibold">
							{t("method2")}
						</h3>
						<PassFailBadge wouldPass={stats.method2.wouldPass} />
					</div>
					<div className="flex items-center justify-between py-1">
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
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("maxDD")}</span>
						<span className="text-small text-trade-sell font-medium">
							{formatCompactCurrency(stats.method2.maxDrawdown, "R$")}
						</span>
					</div>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("liveTrades")}</span>
						<span className="text-small text-trade-buy font-medium">
							{stats.method2.liveTrades}
						</span>
					</div>
					<div className="flex items-center justify-between py-1">
						<span className="text-tiny text-txt-300">{t("simTrades")}</span>
						<span className="text-small text-txt-300 font-medium">
							{stats.method2.simTrades}
						</span>
					</div>
					<div className="flex items-center justify-between py-1">
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
