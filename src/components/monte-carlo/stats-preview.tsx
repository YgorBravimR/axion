"use client"

import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { LoadingSpinner } from "@/components/shared"
import { formatR } from "@/lib/formatting"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { SourceStats } from "@/types/monte-carlo"

interface StatsPreviewProps {
	stats: SourceStats | null
	isLoading: boolean
	onUseStats: () => void
	onCustomize: () => void
}

export const StatsPreview = ({
	stats,
	isLoading,
	onUseStats,
	onCustomize,
}: StatsPreviewProps) => {
	const t = useTranslations("monteCarlo.statsPreview")

	if (isLoading) {
		return (
			<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
				<LoadingSpinner size="sm" className="py-m-500" />
			</div>
		)
	}

	if (!stats) {
		return null
	}

	const formatDate = (date: Date | string) => {
		const d = typeof date === "string" ? new Date(date) : date
		return format(d, "MMM yyyy")
	}

	return (
		<div className="border-accent-primary/30 bg-accent-primary/5 p-s-300 sm:p-m-400 rounded-lg border">
			{/* Header */}
			<div className="mb-s-300">
				<h4 className="text-small text-txt-100 font-medium">
					{stats.sourceName}
				</h4>
				<p className="text-tiny text-txt-300">
					{stats.totalTrades} {t("trades")} ({formatDate(stats.dateRange.from)}{" "}
					- {formatDate(stats.dateRange.to)})
				</p>
				{(stats.strategiesCount ?? 0) > 1 ? (
					<p className="text-tiny text-txt-300">
						{t("acrossStrategies", { count: stats.strategiesCount ?? 0 })}
					</p>
				) : null}
				{(stats.accountsCount ?? 0) > 1 ? (
					<p className="text-tiny text-txt-300">
						{t("acrossAccounts", { count: stats.accountsCount ?? 0 })}
					</p>
				) : null}
			</div>

			{/* Stats Grid — Row 1: Core */}
			<div className="mb-s-300 gap-s-300 grid grid-cols-2 sm:grid-cols-3">
				<div className="bg-bg-100 p-s-300 rounded-md text-center">
					<p className="text-tiny text-txt-300">{t("winRate")}</p>
					<p className="text-body text-txt-100 font-semibold">
						{stats.winRate.toFixed(1)}%
					</p>
				</div>
				<div className="bg-bg-100 p-s-300 rounded-md text-center">
					<p className="text-tiny text-txt-300">{t("avgRR")}</p>
					<p className="text-body text-txt-100 font-semibold">
						{stats.avgRewardRiskRatio.toFixed(2)}
					</p>
				</div>
				<div className="bg-bg-100 p-s-300 rounded-md text-center">
					<p className="text-tiny text-txt-300">{t("profitFactor")}</p>
					<p className="text-body text-txt-100 font-semibold">
						{stats.profitFactor === Infinity
							? "∞"
							: stats.profitFactor.toFixed(2)}
					</p>
				</div>
			</div>

			{/* Stats Grid — Row 2: R-specific */}
			<div className="mb-m-400 gap-s-300 grid grid-cols-2 sm:grid-cols-3">
				<div className="bg-bg-100 p-s-300 rounded-md text-center">
					<p className="text-tiny text-txt-300">{t("avgWinR")}</p>
					<p className="text-body text-trade-buy font-semibold">
						{formatR(stats.avgWinR)}
					</p>
				</div>
				<div className="bg-bg-100 p-s-300 rounded-md text-center">
					<p className="text-tiny text-txt-300">{t("avgLossR")}</p>
					<p className="text-body text-trade-sell font-semibold">
						{formatR(-stats.avgLossR)}
					</p>
				</div>
				<div className="bg-bg-100 p-s-300 rounded-md text-center">
					<p className="text-tiny text-txt-300">{t("commissionR")}</p>
					<p className="text-body text-txt-100 font-semibold">
						{stats.commissionImpactR.toFixed(1)}%
					</p>
				</div>
			</div>

			{/* Strategies Breakdown */}
			{stats.strategiesBreakdown && stats.strategiesBreakdown.length > 1 && (
				<div className="mb-m-400">
					<p className="mb-s-200 text-tiny text-txt-200 font-medium">
						{t("strategiesBreakdown")}
					</p>
					<ScrollArea className="max-h-32"><div className="bg-bg-100 p-s-200 rounded-md">
						{stats.strategiesBreakdown.map((s, i) => (
							<div
								key={i}
								className="py-s-100 text-tiny flex items-center justify-between"
							>
								<span className="text-txt-200">{s.name}</span>
								<span className="text-txt-300">
									{s.tradesCount} {t("trades")} ({s.winRate.toFixed(0)}%{" "}
									{t("win")})
								</span>
							</div>
						))}
					</div></ScrollArea>
				</div>
			)}

			{/* Actions */}
			<div className="gap-s-200 flex">
				<Button id="monte-carlo-use-stats" size="sm" onClick={onUseStats} className="flex-1">
					{t("useStats")}
				</Button>
				<Button
					id="monte-carlo-customize"
					size="sm"
					variant="outline"
					onClick={onCustomize}
					className="flex-1"
				>
					{t("customize")}
				</Button>
			</div>
		</div>
	)
}
