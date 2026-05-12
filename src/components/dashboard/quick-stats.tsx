"use client"

import { useMemo, useCallback, type ReactNode } from "react"
import { Flame, TrendingUp, AlertTriangle, Activity } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import type { StreakData, OverallStats } from "@/types"
import { cn } from "@/lib/utils"
import {
	formatCompactCurrencyWithSign,
	formatDateLocale,
} from "@/lib/formatting"
import { Panel } from "@/components/ui/panel"
import type { Locale } from "@/i18n/config"

interface QuickStatsProps {
	streakData: StreakData | null
	stats: OverallStats | null
}

interface StatRowProps {
	icon: ReactNode
	label: string
	value: string
	subValue?: string
	valueClass?: string
}

/**
 * Displays a single stat row with icon, label, and value.
 */
const StatRow = ({
	icon,
	label,
	value,
	subValue,
	valueClass,
}: StatRowProps) => (
	<div className="border-bg-300 pb-s-300 flex min-w-0 items-center justify-between border-b">
		<div className="gap-s-200 flex min-w-0 items-center">
			<span className="text-txt-300 shrink-0">{icon}</span>
			<span className="text-small text-txt-200 truncate">{label}</span>
		</div>
		<div className="min-w-0 shrink-0 text-right">
			<span
				className={cn(
					"text-small truncate font-medium",
					valueClass || "text-txt-100"
				)}
			>
				{value}
			</span>
			{subValue && (
				<span className="ml-s-200 text-tiny text-txt-300 truncate">
					{subValue}
				</span>
			)}
		</div>
	</div>
)

/**
 * Displays quick statistics including current streak, best/worst days, and totals.
 *
 * @param streakData - Streak and best/worst day data
 * @param stats - Overall trading statistics
 */
export const QuickStats = ({ streakData, stats }: QuickStatsProps) => {
	const t = useTranslations("dashboard.quickStats")
	const locale = useLocale() as Locale

	const formatDate = useCallback(
		(dateStr: string): string => {
			const date = new Date(dateStr)
			return formatDateLocale(date, locale, { month: "short", day: "numeric" })
		},
		[locale]
	)

	const streak = useMemo(() => {
		if (!streakData || streakData.currentStreakType === "none") {
			return { value: "0", label: "", colorClass: "text-txt-300" }
		}

		const isWinStreak = streakData.currentStreakType === "win"
		return {
			value: `${streakData.currentStreak}`,
			label: isWinStreak ? t("w") : t("l"),
			colorClass: isWinStreak ? "text-trade-buy" : "text-trade-sell",
		}
	}, [streakData, t])

	return (
		<Panel padding="lg">
			<h2 className="text-small text-txt-100 sm:text-body font-semibold">
				{t("title")}
			</h2>
			<div className="mt-s-300 space-y-s-300 sm:mt-m-400 sm:space-y-m-400">
				<StatRow
					icon={<Flame className="h-4 w-4" />}
					label={t("currentStreak")}
					value={streak.value + streak.label}
					valueClass={streak.colorClass}
				/>
				<StatRow
					icon={<TrendingUp className="h-4 w-4" />}
					label={t("bestDay")}
					value={
						streakData?.bestDay
							? formatCompactCurrencyWithSign(streakData.bestDay.pnl, "R$")
							: "--"
					}
					subValue={
						streakData?.bestDay
							? formatDate(streakData.bestDay.date)
							: undefined
					}
					valueClass="text-trade-buy"
				/>
				<StatRow
					icon={<AlertTriangle className="h-4 w-4" />}
					label={t("worstDay")}
					value={
						streakData?.worstDay
							? formatCompactCurrencyWithSign(streakData.worstDay.pnl, "R$")
							: "--"
					}
					subValue={
						streakData?.worstDay
							? formatDate(streakData.worstDay.date)
							: undefined
					}
					valueClass={
						streakData?.worstDay && streakData.worstDay.pnl >= 0
							? "text-trade-buy"
							: "text-trade-sell"
					}
				/>
				<StatRow
					icon={<Activity className="h-4 w-4" />}
					label={t("totalTrades")}
					value={stats?.totalTrades.toString() || "--"}
				/>
				<div className="mt-m-500 gap-s-300 pt-m-400 grid grid-cols-2">
					<div className="bg-bg-100 p-s-300 min-w-0 rounded-md text-center">
						<p className="text-tiny text-txt-300 truncate">{t("longestWin")}</p>
						<p className="mt-s-100 text-body text-trade-buy font-semibold">
							{streakData?.longestWinStreak || 0}
						</p>
					</div>
					<div className="bg-bg-100 p-s-300 min-w-0 rounded-md text-center">
						<p className="text-tiny text-txt-300 truncate">
							{t("longestLoss")}
						</p>
						<p className="mt-s-100 text-body text-trade-sell font-semibold">
							{streakData?.longestLossStreak || 0}
						</p>
					</div>
				</div>
			</div>
		</Panel>
	)
}
