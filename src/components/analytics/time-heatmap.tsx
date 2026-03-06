"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import type { TimeHeatmapCell } from "@/types"
import { formatBrlCompactWithSign, formatR } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown } from "lucide-react"
import type { ExpectancyMode } from "./expectancy-mode-toggle"

interface TimeHeatmapProps {
	data: TimeHeatmapCell[]
	expectancyMode: ExpectancyMode
}

/** B3 Trading hours (9:00 - 18:00) */
const TRADING_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17]

/**
 * Displays a heatmap of trading performance by day of week and hour.
 * Cells are colored and sized based on P&L or avgR intensity, with a tooltip overlay
 * and actionable insights highlighting best/worst trading windows.
 *
 * @param data - Array of heatmap cells with performance data per time slot
 * @param expectancyMode - Whether to color/sort by R-multiples or $ P&L
 */
export const TimeHeatmap = ({ data, expectancyMode }: TimeHeatmapProps) => {
	const t = useTranslations("analytics")
	const tDays = useTranslations("analytics.time.heatmapDays")
	const [hoveredCell, setHoveredCell] = useState<TimeHeatmapCell | null>(null)

	const isRMode = expectancyMode === "edge"

	const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
	const dayLabels = [
		tDays("mon"),
		tDays("tue"),
		tDays("wed"),
		tDays("thu"),
		tDays("fri"),
	]

	// Get translated short day name from English day name
	const getTranslatedDayShort = (dayName: string): string => {
		const dayMap: Record<string, string> = {
			Sunday: tDays("sun"),
			Monday: tDays("mon"),
			Tuesday: tDays("tue"),
			Wednesday: tDays("wed"),
			Thursday: tDays("thu"),
			Friday: tDays("fri"),
			Saturday: tDays("sat"),
		}
		return dayMap[dayName] || dayName.slice(0, 3)
	}

	const formatMetric = (value: number): string =>
		isRMode ? formatR(value) : formatBrlCompactWithSign(value)

	// Create lookup map
	const cellMap = new Map<string, TimeHeatmapCell>()
	for (const cell of data) {
		cellMap.set(`${cell.dayOfWeek}-${cell.hour}`, cell)
	}

	// Calculate max absolute value for relative intensity scaling
	const cellsWithTrades = data.filter((c) => c.totalTrades > 0)
	const maxAbsValue = cellsWithTrades.reduce((max, cell) => {
		const value = isRMode ? Math.abs(cell.avgR) : Math.abs(cell.totalPnl)
		return Math.max(max, value)
	}, 0)

	// Get cell color with intensity scaled relative to max value
	const getCellStyle = (cell: TimeHeatmapCell | undefined): string => {
		if (!cell || cell.totalTrades === 0) return "bg-bg-300/30"

		const metricValue = isRMode ? cell.avgR : cell.totalPnl
		const absValue = isRMode ? Math.abs(cell.avgR) : Math.abs(cell.totalPnl)
		const intensity = maxAbsValue > 0 ? absValue / maxAbsValue : 0.5
		const base = metricValue > 0 ? "bg-trade-buy" : "bg-trade-sell"

		if (intensity > 0.7) return base
		if (intensity > 0.4) return `${base}/70`
		if (intensity > 0.15) return `${base}/50`
		return `${base}/30`
	}

	// Find best and worst slots (exact day × hour) — sorted by selected metric
	const getMetricValue = (cell: TimeHeatmapCell): number =>
		isRMode ? cell.avgR : cell.totalPnl

	const sortedByMetric = cellsWithTrades.toSorted(
		(a, b) => getMetricValue(b) - getMetricValue(a)
	)
	const bestSlot = sortedByMetric[0]
	const worstSlot = sortedByMetric[sortedByMetric.length - 1]

	// Aggregate by hour (across all days) — uses raw wins/losses for accurate WR
	const hourAggregates = TRADING_HOURS.map((hour) => {
		const cells = cellsWithTrades.filter((c) => c.hour === hour)
		const totalTrades = cells.reduce((sum, c) => sum + c.totalTrades, 0)
		const totalPnl = cells.reduce((sum, c) => sum + c.totalPnl, 0)
		const totalWins = cells.reduce((sum, c) => sum + c.wins, 0)
		const totalLosses = cells.reduce((sum, c) => sum + c.losses, 0)
		const decided = totalWins + totalLosses
		const winRate = decided > 0 ? (totalWins / decided) * 100 : 0
		const weightedAvgR =
			totalTrades > 0
				? cells.reduce((sum, c) => sum + c.avgR * c.totalTrades, 0) /
					totalTrades
				: 0
		return {
			hour,
			label: `${hour}h`,
			totalTrades,
			totalPnl,
			winRate,
			avgR: weightedAvgR,
		}
	}).filter((h) => h.totalTrades > 0)

	const sortedHours = hourAggregates.toSorted((a, b) =>
		isRMode ? b.avgR - a.avgR : b.totalPnl - a.totalPnl
	)
	const bestHour = sortedHours[0]
	const worstHour = sortedHours[sortedHours.length - 1]

	// Aggregate by day (across all hours) — uses raw wins/losses for accurate WR
	const dayAggregates = days
		.map((day, index) => {
			const dayOfWeek = index + 1
			const cells = cellsWithTrades.filter((c) => c.dayOfWeek === dayOfWeek)
			const totalTrades = cells.reduce((sum, c) => sum + c.totalTrades, 0)
			const totalPnl = cells.reduce((sum, c) => sum + c.totalPnl, 0)
			const totalWins = cells.reduce((sum, c) => sum + c.wins, 0)
			const totalLosses = cells.reduce((sum, c) => sum + c.losses, 0)
			const decided = totalWins + totalLosses
			const winRate = decided > 0 ? (totalWins / decided) * 100 : 0
			const weightedAvgR =
				totalTrades > 0
					? cells.reduce((sum, c) => sum + c.avgR * c.totalTrades, 0) /
						totalTrades
					: 0
			return {
				day,
				dayLabel: dayLabels[index],
				totalTrades,
				totalPnl,
				winRate,
				avgR: weightedAvgR,
			}
		})
		.filter((d) => d.totalTrades > 0)

	const sortedDays = dayAggregates.toSorted((a, b) =>
		isRMode ? b.avgR - a.avgR : b.totalPnl - a.totalPnl
	)
	const bestDay = sortedDays[0]
	const worstDay = sortedDays[sortedDays.length - 1]

	const formatAggregateMetric = (agg: {
		totalPnl: number
		avgR: number
	}): string =>
		isRMode ? formatR(agg.avgR) : formatBrlCompactWithSign(agg.totalPnl)

	if (data.length === 0) {
		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("time.heatmapTitle")}
				</h3>
				<div className="text-txt-300 flex h-50 items-center justify-center">
					{t("noData")}
				</div>
			</div>
		)
	}

	return (
		<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
			{/* Header */}
			<div className="mb-s-300 sm:mb-m-400">
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("time.heatmapTitle")}
				</h3>
				<p className="text-caption text-txt-300 mt-s-100">
					{t("time.heatmapSubtitle")}
				</p>
			</div>

			{/* Heatmap Grid */}
			<div className="overflow-x-auto">
				<div>
					{/* Hour header row */}
					<div className="mb-s-200 flex items-end">
						<div className="w-14 shrink-0" />
						{TRADING_HOURS.map((hour) => (
							<div
								key={hour}
								className="text-caption text-txt-300 flex-1 text-center font-medium"
							>
								{hour}h
							</div>
						))}
					</div>

					{/* Day rows */}
					{days.map((day, dayIndex) => {
						const dayOfWeek = dayIndex + 1
						return (
							<div key={day} className="mb-s-100 flex items-center">
								<div className="text-small text-txt-200 pr-s-200 w-14 shrink-0 text-right font-medium">
									{dayLabels[dayIndex]}
								</div>
								{TRADING_HOURS.map((hour) => {
									const cell = cellMap.get(`${dayOfWeek}-${hour}`)
									const hasData = cell && cell.totalTrades > 0
									const isHovered = hoveredCell === cell
									return (
										<div key={`${day}-${hour}`} className="flex-1 px-0.5">
											<div
												className={cn(
													"relative flex h-10 items-center justify-center rounded-md transition-all",
													getCellStyle(cell),
													hasData &&
														"hover:ring-acc-100 focus:ring-acc-100 cursor-pointer hover:ring-2 focus:ring-2 focus:outline-none",
													isHovered && "ring-acc-100 scale-105 ring-2"
												)}
												onMouseEnter={() => {
													if (hasData) setHoveredCell(cell)
												}}
												onMouseLeave={() => setHoveredCell(null)}
												onFocus={() => {
													if (hasData) setHoveredCell(cell)
												}}
												onBlur={() => setHoveredCell(null)}
												tabIndex={hasData ? 0 : undefined}
												role={hasData ? "button" : undefined}
												aria-label={
													hasData
														? `${cell.dayName} ${cell.hourLabel}: ${cell.totalTrades} trades, ${cell.winRate.toFixed(0)}% win rate`
														: undefined
												}
											>
												{/* Trade count inside cell */}
												{hasData && (
													<span className="text-micro font-semibold text-white/90 drop-shadow-sm">
														{cell.totalTrades}
													</span>
												)}
											</div>
										</div>
									)
								})}
							</div>
						)
					})}
				</div>
			</div>

			{/* Hovered Cell Detail Bar */}
			<div
				className={cn(
					"mt-s-300 sm:mt-m-400 px-s-300 sm:px-m-400 py-s-200 sm:py-s-300 rounded-lg border transition-all",
					hoveredCell
						? "border-acc-100/30 bg-bg-100"
						: "border-bg-300 bg-bg-100/50"
				)}
			>
				{hoveredCell ? (
					<div className="gap-m-400 flex items-center justify-between">
						<div>
							<p className="text-small text-txt-100 font-semibold">
								{hoveredCell.dayName} {hoveredCell.hourLabel}
							</p>
							<p className="text-caption text-txt-300">
								{t("time.totalTrades", { count: hoveredCell.totalTrades })}
							</p>
						</div>
						<div className="gap-m-500 flex items-center">
							<div className="text-right">
								<p className="text-caption text-txt-300">{t("time.winRate")}</p>
								<p
									className={cn(
										"text-small font-semibold",
										hoveredCell.winRate >= 50
											? "text-trade-buy"
											: "text-trade-sell"
									)}
								>
									{hoveredCell.winRate.toFixed(0)}%
								</p>
							</div>
							{isRMode ? (
								<>
									<div className="text-right">
										<p className="text-caption text-txt-300">
											{t("time.avgR")}
										</p>
										<p
											className={cn(
												"text-small font-semibold",
												hoveredCell.avgR >= 0
													? "text-trade-buy"
													: "text-trade-sell"
											)}
										>
											{formatR(hoveredCell.avgR)}
										</p>
									</div>
									<div className="text-right">
										<p className="text-caption text-txt-300">{t("time.pnl")}</p>
										<p
											className={cn(
												"text-small font-semibold",
												hoveredCell.totalPnl >= 0
													? "text-trade-buy"
													: "text-trade-sell"
											)}
										>
											{formatBrlCompactWithSign(hoveredCell.totalPnl)}
										</p>
									</div>
								</>
							) : (
								<>
									<div className="text-right">
										<p className="text-caption text-txt-300">{t("time.pnl")}</p>
										<p
											className={cn(
												"text-small font-semibold",
												hoveredCell.totalPnl >= 0
													? "text-trade-buy"
													: "text-trade-sell"
											)}
										>
											{formatBrlCompactWithSign(hoveredCell.totalPnl)}
										</p>
									</div>
									{hoveredCell.avgR !== 0 && (
										<div className="text-right">
											<p className="text-caption text-txt-300">
												{t("time.avgR")}
											</p>
											<p
												className={cn(
													"text-small font-semibold",
													hoveredCell.avgR >= 0
														? "text-trade-buy"
														: "text-trade-sell"
												)}
											>
												{hoveredCell.avgR >= 0 ? "+" : ""}
												{hoveredCell.avgR.toFixed(2)}R
											</p>
										</div>
									)}
								</>
							)}
						</div>
					</div>
				) : (
					<p className="text-caption text-txt-300 text-center">
						{t("time.heatmapSubtitle")}
					</p>
				)}
			</div>

			{/* Legend */}
			<div className="mt-s-300 sm:mt-m-400 gap-s-300 sm:gap-m-500 text-caption text-txt-300 flex flex-wrap items-center justify-center">
				<div className="gap-s-200 flex items-center">
					<div className="bg-trade-buy/70 h-3 w-3 rounded-sm" />
					<span>{t("time.profitable")}</span>
				</div>
				<div className="gap-s-200 flex items-center">
					<div className="bg-trade-sell/70 h-3 w-3 rounded-sm" />
					<span>{t("time.losing")}</span>
				</div>
				<div className="gap-s-200 flex items-center">
					<div className="bg-bg-300/30 h-3 w-3 rounded-sm" />
					<span>{t("time.noTrades")}</span>
				</div>
			</div>

			{/* Actionable Insights — 2 merged cards: Best / Worst Trading Window */}
			{cellsWithTrades.length > 0 && (
				<div className="mt-s-300 sm:mt-m-400 gap-s-300 grid grid-cols-1 sm:grid-cols-2">
					{/* Best Trading Window */}
					{bestSlot && getMetricValue(bestSlot) >= 0 ? (
						<div className="gap-s-300 border-trade-buy/20 bg-trade-buy/5 p-s-300 sm:p-m-400 flex items-start rounded-lg border">
							<div className="bg-trade-buy/15 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
								<TrendingUp className="text-trade-buy h-4 w-4" />
							</div>
							<div className="space-y-s-200 min-w-0">
								<p className="text-caption text-txt-300">
									{t("time.bestWindow")}
								</p>
								<div>
									<span className="text-caption text-txt-300">
										{t("time.windowSlot")}:{" "}
									</span>
									<span className="text-small text-trade-buy font-semibold">
										{getTranslatedDayShort(bestSlot.dayName)}{" "}
										{bestSlot.hourLabel}
									</span>
									<span className="text-caption text-trade-buy/80">
										{" "}
										· {bestSlot.winRate.toFixed(0)}% WR ·{" "}
										{formatMetric(getMetricValue(bestSlot))} ·{" "}
										{t("time.totalTrades", { count: bestSlot.totalTrades })}
									</span>
								</div>
								{bestHour && (
									<div>
										<span className="text-caption text-txt-300">
											{t("time.windowHour")}:{" "}
										</span>
										<span className="text-small text-trade-buy font-semibold">
											{bestHour.label}
										</span>
										<span className="text-caption text-trade-buy/80">
											{" "}
											· {bestHour.winRate.toFixed(0)}% WR ·{" "}
											{formatAggregateMetric(bestHour)} ·{" "}
											{t("time.totalTrades", { count: bestHour.totalTrades })}
										</span>
									</div>
								)}
								{bestDay && (
									<div>
										<span className="text-caption text-txt-300">
											{t("time.windowDay")}:{" "}
										</span>
										<span className="text-small text-trade-buy font-semibold">
											{bestDay.dayLabel}
										</span>
										<span className="text-caption text-trade-buy/80">
											{" "}
											· {bestDay.winRate.toFixed(0)}% WR ·{" "}
											{formatAggregateMetric(bestDay)} ·{" "}
											{t("time.totalTrades", { count: bestDay.totalTrades })}
										</span>
									</div>
								)}
							</div>
						</div>
					) : (
						<div className="gap-s-300 border-bg-300 bg-bg-300/10 p-s-300 sm:p-m-400 flex items-start rounded-lg border border-dashed">
							<div className="bg-bg-300/20 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
								<TrendingUp className="text-txt-300 h-4 w-4" />
							</div>
							<div className="min-w-0">
								<p className="text-caption text-txt-300">
									{t("time.bestWindow")}
								</p>
								<p className="text-small text-txt-300 font-medium">—</p>
								<p className="text-caption text-txt-300 mt-s-100">
									{t("time.bestWindowPlaceholder")}
								</p>
							</div>
						</div>
					)}

					{/* Worst Trading Window */}
					{worstSlot && getMetricValue(worstSlot) < 0 ? (
						<div className="gap-s-300 border-trade-sell/20 bg-trade-sell/5 p-s-300 sm:p-m-400 flex items-start rounded-lg border">
							<div className="bg-trade-sell/15 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
								<TrendingDown className="text-trade-sell h-4 w-4" />
							</div>
							<div className="space-y-s-200 min-w-0">
								<p className="text-caption text-txt-300">
									{t("time.worstWindow")}
								</p>
								<div>
									<span className="text-caption text-txt-300">
										{t("time.windowSlot")}:{" "}
									</span>
									<span className="text-small text-trade-sell font-semibold">
										{getTranslatedDayShort(worstSlot.dayName)}{" "}
										{worstSlot.hourLabel}
									</span>
									<span className="text-caption text-trade-sell/80">
										{" "}
										· {worstSlot.winRate.toFixed(0)}% WR ·{" "}
										{formatMetric(getMetricValue(worstSlot))} ·{" "}
										{t("time.totalTrades", { count: worstSlot.totalTrades })}
									</span>
								</div>
								{worstHour && (
									<div>
										<span className="text-caption text-txt-300">
											{t("time.windowHour")}:{" "}
										</span>
										<span className="text-small text-trade-sell font-semibold">
											{worstHour.label}
										</span>
										<span className="text-caption text-trade-sell/80">
											{" "}
											· {worstHour.winRate.toFixed(0)}% WR ·{" "}
											{formatAggregateMetric(worstHour)} ·{" "}
											{t("time.totalTrades", { count: worstHour.totalTrades })}
										</span>
									</div>
								)}
								{worstDay && (
									<div>
										<span className="text-caption text-txt-300">
											{t("time.windowDay")}:{" "}
										</span>
										<span className="text-small text-trade-sell font-semibold">
											{worstDay.dayLabel}
										</span>
										<span className="text-caption text-trade-sell/80">
											{" "}
											· {worstDay.winRate.toFixed(0)}% WR ·{" "}
											{formatAggregateMetric(worstDay)} ·{" "}
											{t("time.totalTrades", { count: worstDay.totalTrades })}
										</span>
									</div>
								)}
							</div>
						</div>
					) : (
						<div className="gap-s-300 border-bg-300 bg-bg-300/10 p-s-300 sm:p-m-400 flex items-start rounded-lg border border-dashed">
							<div className="bg-bg-300/20 mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
								<TrendingDown className="text-txt-300 h-4 w-4" />
							</div>
							<div className="min-w-0">
								<p className="text-caption text-txt-300">
									{t("time.worstWindow")}
								</p>
								<p className="text-small text-txt-300 font-medium">—</p>
								<p className="text-caption text-txt-300 mt-s-100">
									{t("time.worstWindowPlaceholder")}
								</p>
							</div>
						</div>
					)}
				</div>
			)}
		</div>
	)
}
