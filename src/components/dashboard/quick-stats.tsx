"use client"

import type { ReactNode } from "react"
import { Flame, Trophy, AlertTriangle, Activity } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import type { StreakData, OverallStats } from "@/types"
import { formatCompactCurrencyWithSign, formatDateLocale } from "@/lib/formatting"
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
const StatRow = ({ icon, label, value, subValue, valueClass }: StatRowProps) => (
	<div className="flex items-center justify-between border-b border-bg-300 pb-s-300">
		<div className="flex items-center gap-s-200">
			<span className="text-txt-300">{icon}</span>
			<span className="text-small text-txt-200">{label}</span>
		</div>
		<div className="text-right">
			<span className={`text-small font-medium ${valueClass || "text-txt-100"}`}>
				{value}
			</span>
			{subValue && (
				<span className="ml-s-200 text-tiny text-txt-300">{subValue}</span>
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

	const formatDate = (dateStr: string): string => {
		const date = new Date(dateStr)
		return formatDateLocale(date, locale, { month: "short", day: "numeric" })
	}

	const getStreakDisplay = () => {
		if (!streakData || streakData.currentStreakType === "none") {
			return { value: "0", label: "", colorClass: "text-txt-300" }
		}

		const isWinStreak = streakData.currentStreakType === "win"
		return {
			value: `${streakData.currentStreak}`,
			label: isWinStreak ? t("w") : t("l"),
			colorClass: isWinStreak ? "text-trade-buy" : "text-trade-sell",
		}
	}

	const streak = getStreakDisplay()

	return (
		<div className="rounded-lg border border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500">
			<h2 className="text-small font-semibold text-txt-100 sm:text-body">{t("title")}</h2>
			<div className="mt-s-300 space-y-s-300 sm:mt-m-400 sm:space-y-m-400">
				<StatRow
					icon={<Flame className="h-4 w-4" />}
					label={t("currentStreak")}
					value={streak.value + streak.label}
					valueClass={streak.colorClass}
				/>
				<StatRow
					icon={<Trophy className="h-4 w-4" />}
					label={t("bestDay")}
					value={
						streakData?.bestDay
							? formatCompactCurrencyWithSign(streakData.bestDay.pnl)
							: "--"
					}
					subValue={
						streakData?.bestDay ? formatDate(streakData.bestDay.date) : undefined
					}
					valueClass="text-trade-buy"
				/>
				<StatRow
					icon={<AlertTriangle className="h-4 w-4" />}
					label={t("worstDay")}
					value={
						streakData?.worstDay
							? formatCompactCurrencyWithSign(streakData.worstDay.pnl)
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
				<div className="mt-m-500 grid grid-cols-2 gap-s-300 pt-m-400">
					<div className="rounded-md bg-bg-100 p-s-300 text-center">
						<p className="text-tiny text-txt-300">{t("longestWin")}</p>
						<p className="mt-s-100 text-body font-semibold text-trade-buy">
							{streakData?.longestWinStreak || 0}
						</p>
					</div>
					<div className="rounded-md bg-bg-100 p-s-300 text-center">
						<p className="text-tiny text-txt-300">{t("longestLoss")}</p>
						<p className="mt-s-100 text-body font-semibold text-trade-sell">
							{streakData?.longestLossStreak || 0}
						</p>
					</div>
				</div>
			</div>
		</div>
	)
}
