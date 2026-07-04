"use client"

import { Fragment, useState, useMemo, useCallback, memo } from "react"
import { useTranslations } from "next-intl"
import type { TimeHeatmapCell } from "@/types"
import { formatBrlCompactWithSign, formatR } from "@/lib/formatting"
import { cn } from "@/lib/utils"
import { TrendingUp, TrendingDown, AlertTriangle, Info } from "lucide-react"
import type { ExpectancyMode } from "./expectancy-mode-toggle"
import {
	SAMPLE_THRESHOLDS,
	classifySample,
	wilsonInterval,
	wilsonLowerBound,
} from "@/lib/statistics"
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@/components/ui/tooltip"
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

type HeatmapMetric = "pnl" | "avgR" | "winRate" | "trades"

interface HeatmapCellProps {
	cell: TimeHeatmapCell | undefined
	hour: number
	day: string
	isHovered: boolean
	cellStyle: string
	onMouseEnter: () => void
	onMouseLeave: () => void
	t: ReturnType<typeof useTranslations>
	tDayNames: ReturnType<typeof useTranslations>
	confidence: "reliable" | "low" | "insufficient" | null
}

/** Memoized heatmap cell — only re-renders on hover state or data change. */
const HeatmapCell = memo(
	({
		cell,
		hour,
		day,
		isHovered,
		cellStyle,
		onMouseEnter,
		onMouseLeave,
		t,
		tDayNames,
		confidence,
	}: HeatmapCellProps) => {
		const hasData = cell && cell.totalTrades > 0
		const cellClass = cn(
			"relative flex h-11 items-center justify-center rounded-md transition-all",
			cellStyle,
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
					onMouseEnter={onMouseEnter}
					onMouseLeave={onMouseLeave}
					onFocus={onMouseEnter}
					onBlur={onMouseLeave}
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
					<span
						className={cn(
							"text-micro font-semibold drop-shadow-sm",
							confidence === "insufficient" ? "text-txt-300" : "text-txt-100"
						)}
					>
						{cell.totalTrades}
					</span>
					{confidence === "low" && (
						<span
							className="bg-warning absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full"
							aria-hidden="true"
						/>
					)}
				</button>
			)
		}
		return <div key={`${day}-${hour}`} className={cellClass} />
	},
	(prev: HeatmapCellProps, next: HeatmapCellProps) => {
		return (
			prev.cell === next.cell &&
			prev.isHovered === next.isHovered &&
			prev.cellStyle === next.cellStyle &&
			prev.confidence === next.confidence
		)
	}
)

HeatmapCell.displayName = "HeatmapCell"

/**
 * Heatmap of trading performance by day × hour.
 *
 * Sample-size handling (the whole point of this rewrite):
 *  - n < MIN_VISIBLE  → cell is gray with the count + an "insufficient
 *                       data" badge. No P&L/R/win-rate color is shown
 *                       because the estimate is dominated by noise.
 *  - n < MIN_RELIABLE → cell renders with a desaturated color and a small
 *                       low-confidence dot. Tooltip surfaces the win-rate
 *                       95% Wilson CI so the user sees how wide the band is.
 *  - n ≥ MIN_RELIABLE → cell renders at full intensity. CI still visible
 *                       in the tooltip for honesty.
 *
 * Best/Worst ranking uses Wilson lower-bound (for win-rate metric) or
 * skips entirely when no slot/hour/day has ≥ MIN_FOR_RANKING trades.
 * This kills the "Mon 11:00 = 100% TA / 1 trade = best window" lie.
 *
 * @param data - Array of heatmap cells with performance data per time slot
 * @param expectancyMode - Whether to color/sort by R-multiples or $ P&L
 */
const TimeHeatmap = ({ data, expectancyMode }: TimeHeatmapProps) => {
	const t = useTranslations("analytics")
	const tDays = useTranslations("analytics.time.heatmapDays")
	const tDayNames = useTranslations("analytics.time.dayNames")
	const [hoveredCell, setHoveredCell] = useState<TimeHeatmapCell | null>(null)

	const [metric, setMetric] = useState<HeatmapMetric>(
		expectancyMode === "edge" ? "avgR" : "pnl"
	)

	const isRMode = metric === "avgR"

	/** Stable handlers for cells — wrapped in useCallback to prevent recreation on hover. */
	const handleCellEnter = useCallback((cell: TimeHeatmapCell) => {
		setHoveredCell(cell)
	}, [])

	const handleCellLeave = useCallback(() => {
		setHoveredCell(null)
	}, [])

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

	type CellLike = {
		totalPnl: number
		avgR: number
		winRate: number
		totalTrades: number
		wins: number
		losses: number
	}

	const valueOf = (cell: CellLike): number => {
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
	const directionOf = (cell: CellLike): "buy" | "sell" => {
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

	/** Memoized magnitude scorer used by both getCellStyle and ranking. Depends on metric. */
	const magnitudeOf = useCallback(
		(cell: CellLike): number => {
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
		},
		[metric]
	)

	/** Memoized rank scorer. Depends on metric. */
	const rankScoreOf = useCallback(
		(cell: CellLike): number => {
			if (cell.totalTrades < SAMPLE_THRESHOLDS.MIN_FOR_RANKING) {
				return Number.NaN
			}
			if (metric === "winRate") {
				const decided = cell.wins + cell.losses
				if (decided === 0) {
					return Number.NaN
				}
				// Center the Wilson LB on 50% so positive = above-chance window.
				return (wilsonLowerBound(cell.wins, decided) - 0.5) * 100
			}
			// For avgR/pnl/trades, raw value is fine once n is large enough,
			// because the threshold already guards against single-trade noise.
			return valueOf(cell)
		},
		[metric]
	)

	const getMetricValue = (cell: TimeHeatmapCell): number => valueOf(cell)

	/** Cell color depends on direction AND sample confidence. */
	const getCellStyle = (cell: TimeHeatmapCell | undefined): string => {
		if (!cell || cell.totalTrades === 0) {
			return "bg-bg-300/30"
		}
		const confidence = classifySample(cell.totalTrades)
		if (confidence === "insufficient") {
			// Gray cell — we do NOT render a verdict color here. The number is
			// still visible so the user knows "yes, I traded here once".
			return "bg-bg-300/50"
		}
		const intensity = maxAbsValue > 0 ? magnitudeOf(cell) / maxAbsValue : 0.5
		const base = directionOf(cell) === "buy" ? "bg-trade-buy" : "bg-trade-sell"
		// Low-confidence cells render at half the usual opacity — visually
		// still hinted as buy/sell, but desaturated.
		const dimming = confidence === "low" ? 0.5 : 1
		const adjusted = intensity * dimming
		if (adjusted > 0.7) {
			return base
		}
		if (adjusted > 0.4) {
			return `${base}/70`
		}
		if (adjusted > 0.15) {
			return `${base}/50`
		}
		return `${base}/30`
	}

	const formatAggregateMetric = (agg: CellLike): string =>
		formatMetric(valueOf(agg))

	const formatCount = (cell: CellLike): string =>
		`${cell.winRate.toFixed(0)}% · ${cell.totalTrades}`

	/** Format win-rate CI band for tooltips. */
	const formatWinRateCi = (cell: CellLike): string => {
		const decided = cell.wins + cell.losses
		if (decided === 0) {
			return "—"
		}
		const [lo, hi] = wilsonInterval(cell.wins, decided)
		return `${(lo * 100).toFixed(0)}–${(hi * 100).toFixed(0)}%`
	}

	/** Metric-independent aggregates (indexed maps and base stats). Keyed on [data] only. */
	const {
		cellMap,
		cellsWithTrades,
		colorScaleCells,
		rankableSlots,
		hourAggregates: baseHourAggregates,
		dayAggregates: baseDayAggregates,
	} = useMemo(() => {
		const map = new Map<string, TimeHeatmapCell>()
		for (const cell of data) {
			map.set(`${cell.dayOfWeek}-${cell.hour}`, cell)
		}

		const withTrades = data.filter((c) => c.totalTrades > 0)
		const colorScale = withTrades.filter(
			(c) => classifySample(c.totalTrades) !== "insufficient"
		)
		const rankable = withTrades.filter(
			(c) => c.totalTrades >= SAMPLE_THRESHOLDS.MIN_FOR_RANKING
		)

		/** Pre-aggregate data by hour (metric-independent). */
		const hAggs = TRADING_HOURS.map((hour) => {
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
				wins: totalWins,
				losses: totalLosses,
			}
		})

		/** Pre-aggregate data by day (metric-independent). */
		const dAggs = days.map((day, index) => {
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
				wins: totalWins,
				losses: totalLosses,
			}
		})

		return {
			cellMap: map,
			cellsWithTrades: withTrades,
			colorScaleCells: colorScale,
			rankableSlots: rankable,
			hourAggregates: hAggs,
			dayAggregates: dAggs,
		}
	}, [data, days, dayLabels])

	/** Metric-dependent ranking and color scale. Keyed on [metric, cellsWithTrades]. */
	const {
		maxAbsValue,
		bestSlot,
		worstSlot,
		bestHour,
		worstHour,
		bestDay,
		worstDay,
		rankingAvailable,
	} = useMemo(() => {
		// Color intensity scales against the largest reliable cell only.
		const maxAbs = colorScaleCells.reduce(
			(max, cell) => Math.max(max, magnitudeOf(cell)),
			0
		)

		// Filter and sort ranking candidates by metric.
		const sortedRankable = rankableSlots.toSorted(
			(a, b) => rankScoreOf(b) - rankScoreOf(a)
		)

		// Filter and sort hour aggregates by metric.
		const sortedHours = baseHourAggregates
			.filter((h) => h.totalTrades >= SAMPLE_THRESHOLDS.MIN_FOR_RANKING)
			.toSorted((a, b) => rankScoreOf(b) - rankScoreOf(a))

		// Filter and sort day aggregates by metric.
		const sortedDays = baseDayAggregates
			.filter((d) => d.totalTrades >= SAMPLE_THRESHOLDS.MIN_FOR_RANKING)
			.toSorted((a, b) => rankScoreOf(b) - rankScoreOf(a))

		return {
			maxAbsValue: maxAbs,
			bestSlot: sortedRankable[0],
			worstSlot: sortedRankable[sortedRankable.length - 1],
			bestHour: sortedHours[0],
			worstHour: sortedHours[sortedHours.length - 1],
			bestDay: sortedDays[0],
			worstDay: sortedDays[sortedDays.length - 1],
			rankingAvailable:
				sortedRankable.length > 0 ||
				sortedHours.length > 0 ||
				sortedDays.length > 0,
		}
	}, [
		magnitudeOf,
		rankScoreOf,
		rankableSlots,
		baseHourAggregates,
		baseDayAggregates,
		colorScaleCells,
	])

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

	const hoveredConfidence = hoveredCell
		? classifySample(hoveredCell.totalTrades)
		: null

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
									const isHovered = hoveredCell === cell
									const confidence = cell
										? classifySample(cell.totalTrades)
										: null
									return (
										<HeatmapCell
											key={`${day}-${hour}`}
											cell={cell}
											hour={hour}
											day={day}
											isHovered={isHovered}
											cellStyle={getCellStyle(cell)}
											onMouseEnter={() => handleCellEnter(cell!)}
											onMouseLeave={handleCellLeave}
											t={t}
											tDayNames={tDayNames}
											confidence={confidence}
										/>
									)
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
					<div className="gap-s-300 flex flex-col">
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
									{" · "}
									<span className="text-txt-300">
										{t("time.ciLabel")} {formatWinRateCi(hoveredCell)}
									</span>
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
												<p className="text-tiny text-txt-300">
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
						{/* Confidence flag below the numbers — keeps the reading honest
						   for low-n cells the user is hovering. */}
						{hoveredConfidence !== "reliable" && (
							<div
								className={cn(
									"gap-s-200 text-tiny flex items-center",
									hoveredConfidence === "insufficient"
										? "text-warning"
										: "text-txt-300"
								)}
							>
								<AlertTriangle
									className="h-3 w-3 shrink-0"
									aria-hidden="true"
								/>
								<span>
									{hoveredConfidence === "insufficient"
										? t("time.insufficientDataShort")
										: t("time.lowConfidenceCell", {
												n: hoveredCell.totalTrades,
											})}
								</span>
							</div>
						)}
					</div>
				) : (
					<p className="text-tiny text-txt-300 text-center">
						{t("time.heatmapSubtitle")}
					</p>
				)}
			</div>

			{/* Legend — intensity ramp + low-confidence dot indicator. */}
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
				<div className="gap-s-200 flex items-center">
					<div className="relative h-3 w-3">
						<div className="bg-trade-buy/30 absolute inset-0 rounded-sm" />
						<span className="bg-warning absolute top-0 right-0 h-1.5 w-1.5 rounded-full" />
					</div>
					<span>{t("time.lowConfidence")}</span>
				</div>
				<Tooltip>
					<TooltipTrigger asChild>
						<span className="gap-s-100 inline-flex cursor-help items-center">
							<Info className="h-3 w-3" aria-hidden="true" />
							<span>
								{t("time.sampleHint", {
									count: cellsWithTrades.reduce(
										(sum, c) => sum + c.totalTrades,
										0
									),
									needed: Math.max(
										0,
										SAMPLE_THRESHOLDS.MIN_RELIABLE -
											Math.max(0, ...cellsWithTrades.map((c) => c.totalTrades))
									),
								})}
							</span>
						</span>
					</TooltipTrigger>
					<TooltipContent
						id="tooltip-heatmap-sample-hint"
						side="top"
						className="border-bg-300 bg-bg-100 text-txt-200 p-s-300 max-w-xs border shadow-lg"
					>
						{t("time.insufficientSlot", {
							min: SAMPLE_THRESHOLDS.MIN_FOR_RANKING,
						})}
					</TooltipContent>
				</Tooltip>
			</div>

			{/* Actionable Insights — Best vs Worst table.
			   Only renders when at least one row (slot/hour/day) has enough
			   data to rank. Empty rows show a clear insufficient-data state
			   instead of laundering a 1-trade observation into a "winner". */}
			{rankingAvailable ? (
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
												{formatCount(bestSlot)}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											{t("time.insufficientData")}
										</TableCell>
									)}
									{worstSlot &&
									worstSlot !== bestSlot &&
									getMetricValue(worstSlot) < 0 ? (
										<>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-100 text-center font-semibold whitespace-nowrap">
												{getTranslatedDayShort(worstSlot.dayName)}{" "}
												{worstSlot.hourLabel}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-trade-sell text-center font-semibold whitespace-nowrap">
												{formatMetric(getMetricValue(worstSlot))}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center whitespace-nowrap">
												{formatCount(worstSlot)}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											{t("time.insufficientData")}
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
												{formatCount(bestHour)}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											{t("time.insufficientData")}
										</TableCell>
									)}
									{worstHour && worstHour !== bestHour ? (
										<>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-100 text-center font-semibold whitespace-nowrap">
												{worstHour.label}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-trade-sell text-center font-semibold whitespace-nowrap">
												{formatAggregateMetric(worstHour)}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center whitespace-nowrap">
												{formatCount(worstHour)}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											{t("time.insufficientData")}
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
												{formatCount(bestDay)}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											{t("time.insufficientData")}
										</TableCell>
									)}
									{worstDay && worstDay !== bestDay ? (
										<>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-100 text-center font-semibold whitespace-nowrap">
												{worstDay.dayLabel}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-trade-sell text-center font-semibold whitespace-nowrap">
												{formatAggregateMetric(worstDay)}
											</TableCell>
											<TableCell className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center whitespace-nowrap">
												{formatCount(worstDay)}
											</TableCell>
										</>
									) : (
										<TableCell
											colSpan={3}
											className="px-s-300 py-s-200 text-tiny sm:text-small text-txt-300 text-center"
										>
											{t("time.insufficientData")}
										</TableCell>
									)}
								</TableRow>
							</TableBody>
						</Table>
					</div>
				</div>
			) : (
				cellsWithTrades.length > 0 && (
					<div className="mt-s-300 sm:mt-m-400 border-bg-300 bg-bg-100 p-s-300 sm:p-m-400 rounded-lg border">
						<div className="gap-s-200 flex items-start">
							<AlertTriangle
								className="text-warning mt-s-100 h-4 w-4 shrink-0"
								aria-hidden="true"
							/>
							<div className="text-tiny text-txt-200">
								<p className="text-txt-100 font-medium">
									{t("time.insufficientData")}
								</p>
								<p className="mt-s-100 text-txt-300">
									{t("time.insufficientSlot", {
										min: SAMPLE_THRESHOLDS.MIN_FOR_RANKING,
									})}
								</p>
							</div>
						</div>
					</div>
				)
			)}
		</div>
	)
}

export { TimeHeatmap }
