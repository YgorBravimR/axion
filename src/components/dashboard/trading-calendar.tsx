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

		// B3 is closed on Saturday and Sunday, so the calendar collapses to a
		// 5-column Mon–Fri view by default. The hidden columns reappear the moment
		// a trade is recorded on a weekend (e.g. crypto, FX, manual entry), so the
		// affected day stays addressable.
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

		const calendarDays = useMemo(() => {
			const lastDayOfMonth = new Date(year, monthIndex + 1, 0)
			const daysInMonth = lastDayOfMonth.getDate()
			const days: Array<{ date: Date; isCurrentMonth: boolean } | null> = []

			if (hasWeekendTrades) {
				// 7-column Sun–Sat layout
				const firstDayOfMonth = new Date(year, monthIndex, 1)
				const startingDayOfWeek = firstDayOfMonth.getDay()
				for (let i = 0; i < startingDayOfWeek; i++) {
					days.push(null)
				}
				for (let day = 1; day <= daysInMonth; day++) {
					days.push({
						date: new Date(year, monthIndex, day),
						isCurrentMonth: true,
					})
				}
				return days
			}

			// 5-column Mon–Fri layout: skip weekend dates, pad leading empties so
			// the first weekday aligns with its column (Mon = col 0 … Fri = col 4).
			let started = false
			for (let day = 1; day <= daysInMonth; day++) {
				const date = new Date(year, monthIndex, day)
				const dow = date.getDay()
				if (dow === 0 || dow === 6) {
					continue
				}
				if (!started) {
					const leading = dow - 1 // 1 (Mon) → 0, 5 (Fri) → 4
					for (let i = 0; i < leading; i++) {
						days.push(null)
					}
					started = true
				}
				days.push({ date, isCurrentMonth: true })
			}

			return days
		}, [year, monthIndex, hasWeekendTrades])

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
					{/* Days of week header */}
					<div
						className={cn(
							"sm:gap-s-100 gap-s-100 grid",
							hasWeekendTrades ? "grid-cols-7" : "grid-cols-5"
						)}
					>
						{daysOfWeek.map((day) => (
							<div
								key={day}
								className="py-s-100 text-txt-300 text-micro sm:py-s-200 sm:text-tiny text-center font-medium"
							>
								{day}
							</div>
						))}
					</div>

					{/* Calendar grid */}
					<div
						className={cn(
							"sm:gap-s-100 gap-s-100 grid",
							hasWeekendTrades ? "grid-cols-7" : "grid-cols-5"
						)}
					>
						{calendarDays.map((dayData, index) => {
							if (!dayData) {
								return (
									<div
										key={`empty-${String(index)}`}
										className="aspect-square"
									/>
								)
							}

							const dateKey = formatDateKey(dayData.date)
							const dailyData = dailyPnLMap.get(dateKey)
							const isToday =
								dayData.date.toDateString() === effectiveDate.toDateString()

							const bgClass = dailyData
								? dailyData.pnl > 0
									? "bg-trade-buy-muted"
									: dailyData.pnl < 0
										? "bg-trade-sell-muted"
										: "bg-bg-300"
								: "bg-bg-100"

							const textClass = dailyData
								? dailyData.pnl > 0
									? "text-trade-buy"
									: dailyData.pnl < 0
										? "text-trade-sell"
										: "text-txt-300"
								: "text-txt-300"

							const isClickable = dailyData && onDayClick

							const cellContent = (
								<div className="flex h-full flex-col">
									<span className="text-micro text-txt-200 sm:text-tiny leading-tight">
										{dayData.date.getDate()}
									</span>
									{dailyData && (
										<>
											<div className="mt-auto flex justify-center sm:hidden">
												<span
													className={cn("h-1 w-1 rounded-full", textClass)}
													aria-hidden="true"
												/>
											</div>
											<div className="mt-auto hidden sm:block">
												<span
													className={cn("text-tiny font-medium", textClass)}
												>
													{formatCompactCurrencyWithSign(dailyData.pnl)}
												</span>
												<span className="text-tiny text-txt-300 block">
													{dailyData.tradeCount}
													{tCommon("tradeCountAbbr")}
												</span>
											</div>
										</>
									)}
								</div>
							)

							const baseClass = cn(
								"p-s-100 aspect-square rounded-sm sm:rounded-md",
								bgClass,
								isToday && "ring-acc-100 ring-1 sm:ring-2"
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
														pnl: formatCompactCurrencyWithSign(dailyData.pnl),
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
										isToday ? t("todayAriaLabel", { date: dateKey }) : undefined
									}
								>
									{cellContent}
								</div>
							)
						})}
					</div>
				</div>
			</Panel>
		)
	}
)

TradingCalendar.displayName = "TradingCalendar"
