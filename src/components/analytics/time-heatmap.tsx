"use client"

import { Fragment, useState, useMemo } from "react"
import { useTranslations } from "next-intl"
import type { TimeHeatmapCell } from "@/types"
import { formatBrlCompactWithSign, formatR } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown } from "lucide-react"
import type { ExpectancyMode } from "./expectancy-mode-toggle"
import {
	Table,
	TableHeader,
	TableBody,
	TableRow,
	TableHead,
	TableCell,
} from "@/components/ui/table"

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
type HeatmapMetric = "pnl" | "avgR" | "winRate" | "trades"

const TimeHeatmap = ({ data, expectancyMode }: TimeHeatmapProps) => {
	const t = useTranslations("analytics")
	const tDays = useTranslations("analytics.time.heatmapDays")
	const tDayNames = useTranslations("analytics.time.dayNames")
	const [hoveredCell, setHoveredCell] = useState<TimeHeatmapCell | null>(null)

	// Heatmap-local metric switcher. Defaults to whatever the page-level
	// expectancy toggle is set to (R → avgR, $ → pnl) so the first paint
	// matches the rest of the page; the trader can then drill into win-rate
	// or trade-count without changing the global mode for sibling charts.
	const [metric, setMetric] = useState<HeatmapMetric>(
		expectancyMode === "edge" ? "avgR" : "pnl"
	)

	const isRMode = metric === "avgR"

	const days = useMemo(
		() => ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
		[]
	)
	const dayLabels = useMemo(
		() => [
			tDays("mon"),
			tDays("tue"),
			tDays("wed"),
			tDays("thu"),
			tDays("fri"),
		],
		[tDays]
	)

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

	// Metric-aware value extraction. Each metric defines (a) the signed value
	// used for sorting / display, (b) the magnitude used for intensity, and
	// (c) the direction (buy/sell color) — winRate's neutral line is 50%,
	// trade-count has no negative direction.
	const valueOf = (cell: {
		totalPnl: number
		avgR: number
		winRate: number
		totalTrades: number
	}): number => {
		switch (metric) {
			case "pnl":
				return cell.totalPnl
			case "avgR":
				return cell.avgR
			case "winRate":
				return cell.winRate
			case "trades":
				return cell.totalTrades
		}
	}
	const magnitudeOf = (cell: {
		totalPnl: number
		avgR: number
		winRate: number
		totalTrades: number
	}): number => {
		switch (metric) {
			case "pnl":
				return Math.abs(cell.totalPnl)
			case "avgR":
				return Math.abs(cell.avgR)
			case "winRate":
				return Math.abs(cell.winRate - 50)
			case "trades":
				return cell.totalTrades
		}
	}
	const directionOf = (cell: {
		totalPnl: number
		avgR: number
		winRate: number
		totalTrades: number
	}): "buy" | "sell" => {
		switch (metric) {
			case "pnl":
				return cell.totalPnl >= 0 ? "buy" : "sell"
			case "avgR":
				return cell.avgR >= 0 ? "buy" : "sell"
			case "winRate":
				return cell.winRate >= 50 ? "buy" : "sell"
			case "trades":
				return "buy"
		}
	}

	const formatMetric = (value: number): string => {
		switch (metric) {
			case "pnl":
				return formatBrlCompactWithSign(value)
			case "avgR":
				return formatR(value)
			case "winRate":
				return `${value.toFixed(0)}%`
			case "trades":
				return String(Math.round(value))
		}
	}

	const {
		cellMap,
		cellsWithTrades,
		maxAbsValue,
		bestSlot,
		worstSlot,
		bestHour,
		worstHour,
		bestDay,
		worstDay,
	} = useMemo(() => {
		const map = new Map<string, TimeHeatmapCell>()
		for (const cell of data) {
			map.set(`${cell.dayOfWeek}-${cell.hour}`, cell)
		}

		const withTrades = data.filter((c) => c.totalTrades > 0)
		const maxAbs = withTrades.reduce(
			(max, cell) => Math.max(max, magnitudeOf(cell)),
			0
		)

		const sortedByMetric = withTrades.toSorted(
			(a, b) => valueOf(b) - valueOf(a)
		)

		const hourAggregates = TRADING_HOURS.map((hour) => {
			const cells = withTrades.filter((c) => c.hour === hour)
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

		const sortedHours = hourAggregates.toSorted(
			(a, b) => valueOf(b) - valueOf(a)
		)

		const dayAggregates = days
			.map((day, index) => {
				const dayOfWeek = index + 1
				const cells = withTrades.filter((c) => c.dayOfWeek === dayOfWeek)
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

		const sortedDays = dayAggregates.toSorted((a, b) => valueOf(b) - valueOf(a))

		return {
			cellMap: map,
			cellsWithTrades: withTrades,
			maxAbsValue: maxAbs,
			bestSlot: sortedByMetric[0],
			worstSlot: sortedByMetric[sortedByMetric.length - 1],
			bestHour: sortedHours[0],
			worstHour: sortedHours[sortedHours.length - 1],
			bestDay: sortedDays[0],
			worstDay: sortedDays[sortedDays.length - 1],
		}
		// `isRMode` is intentionally NOT a dep — the helpers `valueOf` /
		// `magnitudeOf` close over `metric` directly and recompute when it
		// changes via the surrounding `metric` state.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [data, metric, days, dayLabels])

	const getMetricValue = (cell: TimeHeatmapCell): number => valueOf(cell)

	// Get cell color with intensity scaled relative to max magnitude. For
	// winRate the "buy" cutoff is 50%; for trade-count there is no negative
	// half, so the ramp is always gold→full-buy.
	const getCellStyle = (cell: TimeHeatmapCell | undefined): string => {
		if (!cell || cell.totalTrades === 0) {
			return "bg-bg-300/30"
		}
		const intensity = maxAbsValue > 0 ? magnitudeOf(cell) / maxAbsValue : 0.5
		const base = directionOf(cell) === "buy" ? "bg-trade-buy" : "bg-trade-sell"
		if (intensity > 0.7) {
			return base
		}
		if (intensity > 0.4) {
			return `${base}/70`
		}
		if (intensity > 0.15) {
			return `${base}/50`
		}
		return `${base}/30`
	}

	const formatAggregateMetric = (agg: {
		totalPnl: number
		avgR: number
		winRate: number
		totalTrades: number
	}): string => formatMetric(valueOf(agg))

	if (data.length === 0) {
		return (
			<div
				id="analytics-heatmap"
				className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
			>
				<h3 className="text-small sm:text-body text-txt-100 font-semibold">
					{t("time.heatmapTitle")}
				</h3>
				<div className="text-txt-300 flex min-h-48 items-center justify-center">
					{t("noData")}
				</div>
			</div>
		)
	}

	return (
		<div
			id="analytics-heatmap"
			className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border"
		>
			{/* Header + metric switcher */}
			<div className="mb-s-300 sm:mb-m-400 gap-s-300 sm:gap-m-400 flex flex-col sm:flex-row sm:items-start sm:justify-between">
				<div>
					<h3 className="text-small sm:text-body text-txt-100 font-semibold">
						{t("time.heatmapTitle")}
					</h3>
					<p className="text-tiny text-txt-300 mt-s-100">
						{t("time.heatmapSubtitle")}
					</p>
				</div>
				<div
					className="border-bg-300 bg-bg-100 flex shrink-0 self-start rounded-md border"
					role="group"
					aria-label={t("time.heatmapMetricLabel")}
				>
					{(["pnl", "avgR", "winRate", "trades"] as const).map((m) => (
						<button
							key={m}
							type="button"
							onClick={() => setMetric(m)}
							className={cn(
								"px-s-300 py-s-100 text-tiny transition-colors first:rounded-l-md last:rounded-r-md",
								metric === m
									? "bg-acc-100 text-bg-100"
									: "text-txt-300 hover:text-txt-100"
							)}
							aria-pressed={metric === m}
						>
							{t(`time.heatmapMetric.${m}`)}
						</button>
					))}
				</div>
			</div>

			{/* Heatmap Grid */}
			<div className="overflow-x-auto">
				<div
					className="gap-s-100 grid w-fit"
					style={{
						gridTemplateColumns: `minmax(60px, auto) repeat(${TRADING_HOURS.length}, minmax(36px, 1fr))`,
					}}
				>
					{/* Hour header row */}
					<div />
					{TRADING_HOURS.map((hour) => (
						<div
							key={hour}
							className="text-tiny text-txt-300 pb-s-100 text-center font-medium"
						>
							{hour}h
						</div>
					))}

					{/* Day rows */}
					{days.map((day, dayIndex) => {
						const dayOfWeek = dayIndex + 1
						return (
							<Fragment key={day}>
								<div className="text-small text-txt-200 pr-s-200 flex items-center justify-end font-medium">
									{dayLabels[dayIndex]}
								</div>
								{TRADING_HOURS.map((hour) => {
									const cell = cellMap.get(`${dayOfWeek}-${hour}`)
									const hasData = cell && cell.totalTrades > 0
									const isHovered = hoveredCell === cell
									const cellClass = cn(
										"relative flex h-11 items-center justify-center rounded-md transition-all",
										getCellStyle(cell),
										isHovered && "ring-acc-100 scale-105 ring-2"
									)
									if (hasData) {
										return (
											<button
												key={`${day}-${hour}`}
												type="button"
												className={cn(
													cellClass,
													"hover:ring-acc-100 focus:ring-acc-100 cursor-pointer hover:ring-2 focus:ring-2 focus:outline-none"
												)}
												onMouseEnter={() => setHoveredCell(cell)}
												onMouseLeave={() => setHoveredCell(null)}
												onFocus={() => setHoveredCell(cell)}
												onBlur={() => setHoveredCell(null)}
												aria-label={t("time.heatmapCellAriaLabel", {
													day: tDayNames(
														cell.dayName as
															| "Monday"
															| "Tuesday"
															| "Wednesday"
															| "Thursday"
															| "Friday"
															| "Saturday"
															| "Sunday"
													),
													hour: cell.hourLabel,
													trades: cell.totalTrades,
													winRate: cell.winRate.toFixed(0),
												})}
											>
												<span className="text-micro text-txt-100 font-semibold drop-shadow-sm">
													{cell.totalTrades}
												</span>
											</button>
										)
									}
									return <div key={`${day}-${hour}`} className={cellClass} />
								})}
							</Fragment>
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
								{tDayNames(
									hoveredCell.dayName as
										| "Monday"
										| "Tuesday"
										| "Wednesday"
										| "Thursday"
										| "Friday"
										| "Saturday"
										| "Sunday"
								)}{" "}
								{hoveredCell.hourLabel}
							</p>
							<p className="text-tiny text-txt-300">
								{t("time.totalTrades", { count: hoveredCell.totalTrades })}
							</p>
						</div>
						<div className="gap-m-500 flex items-center">
							<div className="text-right">
								<p className="text-tiny text-txt-300">{t("time.winRate")}</p>
								<p className="text-small text-txt-100 font-semibold">
									{hoveredCell.winRate.toFixed(0)}%
								</p>
							</div>
							{isRMode ? (
								<>
									<div className="text-right">
										<p className="text-tiny text-txt-300">{t("time.avgR")}</p>
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
										<p className="text-tiny text-txt-300">{t("time.pnl")}</p>
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
										<p className="text-tiny text-txt-300">{t("time.pnl")}</p>
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
											<p className="text-tiny text-txt-300">{t("time.avgR")}</p>
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
					<p className="text-tiny text-txt-300 text-center">
						{t("time.heatmapSubtitle")}
					</p>
				)}
			</div>

			{/* Legend — intensity ramp shows magnitude as well as direction,
			    mirroring the opacity steps in getCellStyle (30/50/70/full). */}
			<div className="mt-s-300 sm:mt-m-400 gap-s-300 sm:gap-m-400 text-tiny text-txt-300 flex flex-wrap items-center justify-center">
				<div className="gap-s-200 flex items-center">
					<span className="text-trade-sell font-medium tabular-nums">
						{maxAbsValue > 0 ? `-${formatMetric(maxAbsValue)}` : "−"}
					</span>
					<div className="gap-s-100 flex items-center">
						<div className="bg-trade-sell h-3 w-3 rounded-sm" />
						<div className="bg-trade-sell/70 h-3 w-3 rounded-sm" />
						<div className="bg-trade-sell/50 h-3 w-3 rounded-sm" />
						<div className="bg-trade-sell/30 h-3 w-3 rounded-sm" />
						<div className="bg-bg-300/30 h-3 w-3 rounded-sm" />
						<div className="bg-trade-buy/30 h-3 w-3 rounded-sm" />
						<div className="bg-trade-buy/50 h-3 w-3 rounded-sm" />
						<div className="bg-trade-buy/70 h-3 w-3 rounded-sm" />
						<div className="bg-trade-buy h-3 w-3 rounded-sm" />
					</div>
					<span className="text-trade-buy font-medium tabular-nums">
						{maxAbsValue > 0 ? `+${formatMetric(maxAbsValue)}` : "+"}
					</span>
				</div>
				<div className="gap-s-200 flex items-center">
					<div className="bg-bg-300/30 h-3 w-3 rounded-sm" />
					<span>{t("time.noTrades")}</span>
				</div>
			</div>

			{/* Actionable Insights — Best vs Worst table */}
			{cellsWithTrades.length > 0 && (
				<div className="mt-s-300 sm:mt-m-400">
					<div className="border-bg-300 rounded-lg border">
						<Table className="text-tiny w-full">
							<TableHeader>
								<TableRow className="border-bg-300 border-b">
									<TableHead className="px-s-300 py-s-200 text-txt-300 text-left font-medium" />
									<TableHead
										className="px-s-300 py-s-200 text-center font-medium"
										colSpan={3}
									>
										<div className="gap-s-100 flex items-center justify-center">
											<TrendingUp
												className="text-trade-buy h-3.5 w-3.5"
												aria-hidden="true"
											/>
											<span className="text-trade-buy">
												{t("time.bestWindow")}
											</span>
										</div>
									</TableHead>
									<TableHead
										className="px-s-300 py-s-200 text-center font-medium"
										colSpan={3}
									>
										<div className="gap-s-100 flex items-center justify-center">
											<TrendingDown
												className="text-trade-sell h-3.5 w-3.5"
												aria-hidden="true"
											/>
											<span className="text-trade-sell">
												{t("time.worstWindow")}
											</span>
										</div>
									</TableHead>
								</TableRow>
								<TableRow className="border-bg-300 border-b">
									<TableHead className="px-s-300 py-s-100 text-txt-300 text-left font-medium" />
									<TableHead className="px-s-300 py-s-100 text-txt-300 text-center font-medium">
										{t("time.windowSlot")}
									</TableHead>
									<TableHead className="px-s-300 py-s-100 text-txt-300 text-center font-medium">
										{isRMode ? t("time.avgR") : t("time.pnl")}
									</TableHead>
									<TableHead className="px-s-300 py-s-100 text-txt-300 text-center font-medium">
										{t("time.winRate")}
									</TableHead>
									<TableHead className="px-s-300 py-s-100 text-txt-300 text-center font-medium">
										{t("time.windowSlot")}
									</TableHead>
									<TableHead className="px-s-300 py-s-100 text-txt-300 text-center font-medium">
										{isRMode ? t("time.avgR") : t("time.pnl")}
									</TableHead>
									<TableHead className="px-s-300 py-s-100 text-txt-300 text-center font-medium">
										{t("time.winRate")}
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{/* Slot row (day × hour) */}
								<TableRow className="border-bg-300 border-b">
									<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-200 min-w-0 font-medium whitespace-nowrap">
										{t("time.windowSlot")}
									</TableCell>
									{bestSlot && getMetricValue(bestSlot) >= 0 ? (
										<>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-100 text-center font-semibold whitespace-nowrap">
												{getTranslatedDayShort(bestSlot.dayName)}{" "}
												{bestSlot.hourLabel}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-trade-buy text-center font-semibold whitespace-nowrap">
												{formatMetric(getMetricValue(bestSlot))}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center whitespace-nowrap">
												{bestSlot.winRate.toFixed(0)}% · {bestSlot.totalTrades}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											—
										</TableCell>
									)}
									{worstSlot && getMetricValue(worstSlot) < 0 ? (
										<>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-100 text-center font-semibold whitespace-nowrap">
												{getTranslatedDayShort(worstSlot.dayName)}{" "}
												{worstSlot.hourLabel}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-trade-sell text-center font-semibold whitespace-nowrap">
												{formatMetric(getMetricValue(worstSlot))}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center whitespace-nowrap">
												{worstSlot.winRate.toFixed(0)}% ·{" "}
												{worstSlot.totalTrades}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											—
										</TableCell>
									)}
								</TableRow>

								{/* Hour row */}
								<TableRow className="border-bg-300 border-b">
									<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-200 min-w-0 font-medium whitespace-nowrap">
										{t("time.windowHour")}
									</TableCell>
									{bestHour ? (
										<>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-100 text-center font-semibold whitespace-nowrap">
												{bestHour.label}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-trade-buy text-center font-semibold whitespace-nowrap">
												{formatAggregateMetric(bestHour)}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center whitespace-nowrap">
												{bestHour.winRate.toFixed(0)}% · {bestHour.totalTrades}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											—
										</TableCell>
									)}
									{worstHour ? (
										<>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-100 text-center font-semibold whitespace-nowrap">
												{worstHour.label}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-trade-sell text-center font-semibold whitespace-nowrap">
												{formatAggregateMetric(worstHour)}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center whitespace-nowrap">
												{worstHour.winRate.toFixed(0)}% ·{" "}
												{worstHour.totalTrades}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											—
										</TableCell>
									)}
								</TableRow>

								{/* Day row */}
								<TableRow>
									<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-200 min-w-0 font-medium whitespace-nowrap">
										{t("time.windowDay")}
									</TableCell>
									{bestDay ? (
										<>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-100 text-center font-semibold whitespace-nowrap">
												{bestDay.dayLabel}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-trade-buy text-center font-semibold whitespace-nowrap">
												{formatAggregateMetric(bestDay)}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center whitespace-nowrap">
												{bestDay.winRate.toFixed(0)}% · {bestDay.totalTrades}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											—
										</TableCell>
									)}
									{worstDay ? (
										<>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-100 text-center font-semibold whitespace-nowrap">
												{worstDay.dayLabel}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-trade-sell text-center font-semibold whitespace-nowrap">
												{formatAggregateMetric(worstDay)}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center whitespace-nowrap">
												{worstDay.winRate.toFixed(0)}% · {worstDay.totalTrades}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											—
										</TableCell>
									)}
								</TableRow>
							</TableBody>
						</Table>
					</div>
				</div>
			)}
		</div>
	)
}

export { TimeHeatmap }
