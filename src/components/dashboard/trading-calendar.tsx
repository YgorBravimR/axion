"use client"

import { useMemo, useCallback, memo, type MouseEvent } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/ui/panel"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { useFormatting } from "@/hooks/use-formatting"
import type { DailyPnL } from "@/types"
import { APP_TIMEZONE } from "@/lib/dates"

interface TradingCalendarProps {
	data: DailyPnL[]
	month: Date
	onMonthChange: (_month: Date) => void
	onDayClick?: (_date: string) => void
	isLoading?: boolean
}

const formatDateKey = (date: Date): string => {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, "0")
	const day = String(date.getDate()).padStart(2, "0")
	return `${year}-${month}-${day}`
}

/**
 * Trading calendar component showing daily P&L for a month.
 * Wrapped with memo to prevent unnecessary re-renders.
 */
export const TradingCalendar = memo(
	({
		data,
		month,
		onMonthChange,
		onDayClick,
		isLoading,
	}: TradingCalendarProps) => {
		const t = useTranslations("dashboard.calendar")
		const tCommon = useTranslations("common")
		const tDays = useTranslations("dayOfWeek")
		const locale = useLocale()
		const effectiveDate = useEffectiveDate()
		const { formatCompactCurrencyWithSign } = useFormatting()

		const year = month.getFullYear()
		const monthIndex = month.getMonth()

		const dailyPnLMap = useMemo(() => {
			const map = new Map<string, DailyPnL>()
			for (const day of data) {
				map.set(day.date, day)
			}
			return map
		}, [data])

		// Single-tier confident tints so wins and losses are equally legible.
		// Magnitude-scaled opacity flattens the green side into invisibility
		// when the biggest loss eclipses the biggest win — direction reads
		// first, magnitude is conveyed by the P&L text itself.
		const pnlBgClass = (pnl: number): string => {
			if (pnl > 0) {
				return "bg-trade-buy/15 border-trade-buy/40"
			}
			if (pnl < 0) {
				return "bg-trade-sell/15 border-trade-sell/40"
			}
			return "bg-bg-200/40 border-bg-300/50"
		}

		// B3 closes on weekends, so the calendar collapses to a 5-column Mon–Fri
		// view by default. Sat/Sun columns reappear automatically when any trade
		// is recorded on a weekend (e.g. crypto, FX, manual entry).
		const hasWeekendTrades = useMemo(() => {
			for (const day of data) {
				const parts = day.date.split("-")
				if (parts.length !== 3) {
					continue
				}
				const y = Number(parts[0])
				const m = Number(parts[1])
				const d = Number(parts[2])
				if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
					continue
				}
				const dow = new Date(y, m - 1, d).getDay()
				if (dow === 0 || dow === 6) {
					return true
				}
			}
			return false
		}, [data])

		const daysOfWeek = useMemo(() => {
			const all = [
				tDays("sunShort"),
				tDays("monShort"),
				tDays("tueShort"),
				tDays("wedShort"),
				tDays("thuShort"),
				tDays("friShort"),
				tDays("satShort"),
			]
			return hasWeekendTrades ? all : all.slice(1, 6)
		}, [tDays, hasWeekendTrades])

		// One row per calendar week. In Mon–Fri mode the Sun/Sat slots are
		// stripped (5 cells per row); otherwise the full 7-column Sun–Sat row.
		const calendarWeeks = useMemo(() => {
			const lastDayOfMonth = new Date(year, monthIndex + 1, 0)
			const daysInMonth = lastDayOfMonth.getDate()
			const firstDayOfWeek = new Date(year, monthIndex, 1).getDay()
			const weeks: Array<Array<{ date: Date } | null>> = []
			let current: Array<{ date: Date } | null> = []
			for (let i = 0; i < firstDayOfWeek; i++) {
				current.push(null)
			}
			for (let day = 1; day <= daysInMonth; day++) {
				current.push({ date: new Date(year, monthIndex, day) })
				if (current.length === 7) {
					weeks.push(current)
					current = []
				}
			}
			if (current.length > 0) {
				while (current.length < 7) {
					current.push(null)
				}
				weeks.push(current)
			}
			const trimmed = hasWeekendTrades
				? weeks
				: weeks.map((week) => week.slice(1, 6))
			return trimmed.filter((week) => week.some((cell) => cell !== null))
		}, [year, monthIndex, hasWeekendTrades])

		const weeklySummaries = useMemo(() => {
			return calendarWeeks.map((week) => {
				let pnl = 0
				let activeDays = 0
				for (const cell of week) {
					if (!cell) {
						continue
					}
					const dailyData = dailyPnLMap.get(formatDateKey(cell.date))
					if (dailyData && dailyData.tradeCount > 0) {
						pnl += dailyData.pnl
						activeDays += 1
					}
				}
				return { pnl, activeDays }
			})
		}, [calendarWeeks, dailyPnLMap])

		const colCount = hasWeekendTrades ? 7 : 5

		// Memoized handlers for stable references
		const handlePreviousMonth = useCallback(() => {
			onMonthChange(new Date(year, monthIndex - 1, 1))
		}, [onMonthChange, year, monthIndex])

		const handleNextMonth = useCallback(() => {
			onMonthChange(new Date(year, monthIndex + 1, 1))
		}, [onMonthChange, year, monthIndex])

		const handleCellClick = useCallback(
			(e: MouseEvent<HTMLButtonElement>) => {
				const key = e.currentTarget.dataset.dateKey
				if (key && onDayClick) {
					onDayClick(key)
				}
			},
			[onDayClick]
		)

		// Use day 15 to avoid timezone edge at month boundaries
		// (midnight UTC on day 1 can shift to previous month in BRT during SSR)
		const monthName = new Date(year, monthIndex, 15).toLocaleDateString(
			locale === "pt-BR" ? "pt-BR" : "en-US",
			{ month: "long", year: "numeric", timeZone: APP_TIMEZONE }
		)

		return (
			<Panel padding="lg">
				<div className="flex items-center justify-between">
					<h2 className="text-small text-txt-100 sm:text-body font-semibold">
						{t("title")}
					</h2>
					<div className="gap-s-100 sm:gap-s-200 flex items-center">
						<Button
							id="calendar-previous-month"
							variant="ghost"
							size="icon"
							className="h-11 w-11"
							onClick={handlePreviousMonth}
							aria-label={t("previousMonth")}
						>
							<ChevronLeft className="h-4 w-4" aria-hidden="true" />
						</Button>
						<span className="text-tiny text-txt-100 sm:text-small min-w-0 flex-1 truncate text-center font-medium">
							{monthName}
						</span>
						<Button
							id="calendar-next-month"
							variant="ghost"
							size="icon"
							className="h-11 w-11"
							onClick={handleNextMonth}
							aria-label={t("nextMonth")}
						>
							<ChevronRight className="h-4 w-4" aria-hidden="true" />
						</Button>
					</div>
				</div>

				<div
					className={cn(
						"mt-s-300 sm:mt-m-400 transition-opacity duration-200",
						isLoading && "opacity-50"
					)}
					aria-busy={isLoading || undefined}
				>
					<div className="w-full">
						{/* Days of week + WEEK summary header */}
						<div
							className={cn(
								"grid gap-x-1",
								colCount === 7
									? "grid-cols-[repeat(7,minmax(0,1fr))_5.5rem]"
									: "grid-cols-[repeat(5,minmax(0,1fr))_5.5rem]"
							)}
						>
							{daysOfWeek.map((day) => (
								<div
									key={day}
									className="py-s-100 text-txt-300 text-micro sm:text-tiny text-center font-medium tracking-wide uppercase"
								>
									{day}
								</div>
							))}
							<div className="py-s-100 text-txt-300 text-micro sm:text-tiny text-center font-medium tracking-wide uppercase">
								{t("week")}
							</div>
						</div>

						{/* One row per calendar week, with summary cell anchored at the end */}
						<div className="flex flex-col gap-y-2">
							{calendarWeeks.map((week, weekIndex) => {
								const summary = weeklySummaries[weekIndex]
								const summaryTextClass =
									summary && summary.pnl > 0
										? "text-trade-buy"
										: summary && summary.pnl < 0
											? "text-trade-sell"
											: "text-txt-300"
								const isLastWeek = weekIndex === calendarWeeks.length - 1
								return (
									<div
										key={`week-${String(weekIndex)}`}
										className={cn(
											"grid gap-x-1",
											!isLastWeek && "border-bg-300/30 border-b pb-2",
											colCount === 7
												? "grid-cols-[repeat(7,minmax(0,1fr))_5.5rem]"
												: "grid-cols-[repeat(5,minmax(0,1fr))_5.5rem]"
										)}
									>
										{week.map((cell, index) => {
											if (!cell) {
												return (
													<div
														key={`empty-${String(weekIndex)}-${String(index)}`}
														className="aspect-square"
													/>
												)
											}

											const dateKey = formatDateKey(cell.date)
											const dailyData = dailyPnLMap.get(dateKey)
											const isToday =
												cell.date.toDateString() ===
												effectiveDate.toDateString()

											const hasData = Boolean(
												dailyData && dailyData.tradeCount > 0
											)
											const bgClass = hasData
												? pnlBgClass(dailyData?.pnl ?? 0)
												: "bg-bg-200/60 border-bg-300/40"

											const textClass = hasData
												? (dailyData?.pnl ?? 0) > 0
													? "text-trade-buy"
													: (dailyData?.pnl ?? 0) < 0
														? "text-trade-sell"
														: "text-txt-300"
												: "text-txt-300"

											const isClickable = hasData && Boolean(onDayClick)

											const cellContent = (
												<div className="flex h-full flex-col">
													<span
														className={cn(
															"text-micro text-txt-300 self-end leading-none tabular-nums",
															isToday && "text-acc-100 font-semibold"
														)}
													>
														{cell.date.getDate()}
													</span>
													{hasData && dailyData && (
														<div className="mt-auto flex flex-col items-center leading-tight">
															<span
																className={cn(
																	"text-tiny sm:text-small font-semibold tabular-nums",
																	textClass
																)}
															>
																{formatCompactCurrencyWithSign(dailyData.pnl)}
															</span>
															<span className="text-micro text-txt-300 tabular-nums">
																{dailyData.tradeCount}
																{tCommon("tradeCountAbbr")}
															</span>
														</div>
													)}
												</div>
											)

											const baseClass = cn(
												"aspect-square rounded-md border p-1.5",
												bgClass,
												isToday && "border-acc-100/60"
											)

											if (isClickable) {
												return (
													<button
														key={dateKey}
														type="button"
														data-date-key={dateKey}
														className={cn(
															baseClass,
															"focus-visible:ring-acc-100 cursor-pointer transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none active:opacity-60"
														)}
														onClick={handleCellClick}
														aria-label={
															dailyData
																? t("dayAriaLabel", {
																		date: dateKey,
																		pnl: formatCompactCurrencyWithSign(
																			dailyData.pnl
																		),
																		count: dailyData.tradeCount,
																	})
																: undefined
														}
													>
														{cellContent}
													</button>
												)
											}

											return (
												<div
													key={dateKey}
													className={baseClass}
													aria-label={
														isToday
															? t("todayAriaLabel", { date: dateKey })
															: undefined
													}
												>
													{cellContent}
												</div>
											)
										})}
										{summary && (
											<div className="border-bg-300/50 bg-bg-200/60 flex aspect-square flex-col items-start justify-center gap-0.5 rounded-md border px-2 py-2">
												<span className="text-micro text-txt-300 font-medium">
													{t("weekLabel", { number: weekIndex + 1 })}
												</span>
												<span
													className={cn(
														"text-small font-semibold tabular-nums",
														summaryTextClass
													)}
												>
													{formatCompactCurrencyWithSign(summary.pnl)}
												</span>
												<span className="text-micro text-txt-300 tabular-nums">
													{summary.activeDays}
													{tCommon("daysAbbr")}
												</span>
											</div>
										)}
									</div>
								)
							})}
						</div>
					</div>
				</div>
			</Panel>
		)
	}
)

TradingCalendar.displayName = "TradingCalendar"
