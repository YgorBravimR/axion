"use client"

import { useMemo, useCallback, memo, type KeyboardEvent } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { Button } from "@/components/ui/button"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import type { DailyPnL } from "@/types"
import { formatCompactCurrencyWithSign } from "@/lib/formatting"
import { APP_TIMEZONE } from "@/lib/dates"

interface TradingCalendarProps {
	data: DailyPnL[]
	month: Date
	onMonthChange: (month: Date) => void
	onDayClick?: (date: string) => void
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
	({ data, month, onMonthChange, onDayClick }: TradingCalendarProps) => {
		const t = useTranslations("dashboard.calendar")
		const tDays = useTranslations("dayOfWeek")
		const locale = useLocale()
		const effectiveDate = useEffectiveDate()

		const year = month.getFullYear()
		const monthIndex = month.getMonth()

		const daysOfWeek = [
			tDays("sunShort"),
			tDays("monShort"),
			tDays("tueShort"),
			tDays("wedShort"),
			tDays("thuShort"),
			tDays("friShort"),
			tDays("satShort"),
		]

		const dailyPnLMap = useMemo(() => {
			const map = new Map<string, DailyPnL>()
			for (const day of data) {
				map.set(day.date, day)
			}
			return map
		}, [data])

		const calendarDays = useMemo(() => {
			const firstDayOfMonth = new Date(year, monthIndex, 1)
			const lastDayOfMonth = new Date(year, monthIndex + 1, 0)
			const startingDayOfWeek = firstDayOfMonth.getDay()
			const daysInMonth = lastDayOfMonth.getDate()

			const days: Array<{ date: Date; isCurrentMonth: boolean } | null> = []

			// Add empty slots for days before the first of the month
			for (let i = 0; i < startingDayOfWeek; i++) {
				days.push(null)
			}

			// Add days of the current month
			for (let day = 1; day <= daysInMonth; day++) {
				days.push({
					date: new Date(year, monthIndex, day),
					isCurrentMonth: true,
				})
			}

			return days
		}, [year, monthIndex])

		// Memoized handlers for stable references
		const handlePreviousMonth = useCallback(() => {
			onMonthChange(new Date(year, monthIndex - 1, 1))
		}, [onMonthChange, year, monthIndex])

		const handleNextMonth = useCallback(() => {
			onMonthChange(new Date(year, monthIndex + 1, 1))
		}, [onMonthChange, year, monthIndex])

		// Use day 15 to avoid timezone edge at month boundaries
		// (midnight UTC on day 1 can shift to previous month in BRT during SSR)
		const monthName = new Date(year, monthIndex, 15).toLocaleDateString(
			locale === "pt-BR" ? "pt-BR" : "en-US",
			{ month: "long", year: "numeric", timeZone: APP_TIMEZONE }
		)

		return (
			<div className="border-bg-300 bg-bg-200 p-s-300 rounded-lg border sm:p-m-400 lg:p-m-500">
				<div className="flex items-center justify-between">
					<h2 className="text-small text-txt-100 font-semibold sm:text-body">{t("title")}</h2>
					<div className="gap-s-100 flex items-center sm:gap-s-200">
						<Button
							id="calendar-previous-month"
							variant="ghost"
							size="icon"
							onClick={handlePreviousMonth}
							aria-label={t("previousMonth")}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<span className="text-tiny text-txt-100 min-w-[100px] text-center font-medium sm:text-small sm:min-w-[140px]">
							{monthName}
						</span>
						<Button
							id="calendar-next-month"
							variant="ghost"
							size="icon"
							onClick={handleNextMonth}
							aria-label={t("nextMonth")}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>

				<div className="mt-s-300 sm:mt-m-400">
					{/* Days of week header */}
					<div className="gap-px grid grid-cols-7 sm:gap-s-100">
						{daysOfWeek.map((day, index) => (
							<div
								key={index}
								className="py-s-100 text-center font-medium text-txt-300 text-[0.625rem] sm:py-s-200 sm:text-tiny"
							>
								{day}
							</div>
						))}
					</div>

					{/* Calendar grid */}
					<div className="gap-px grid grid-cols-7 sm:gap-s-100">
						{calendarDays.map((dayData, index) => {
							if (!dayData) {
								return <div key={`empty-${index}`} className="aspect-square" />
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

							const handleClick = () => {
								if (isClickable) {
									onDayClick(dateKey)
								}
							}

							const handleKeyDown = (e: KeyboardEvent) => {
								if (isClickable && (e.key === "Enter" || e.key === " ")) {
									e.preventDefault()
									onDayClick(dateKey)
								}
							}

							return (
								<div
									key={dateKey}
									className={`p-0.5 sm:p-s-100 aspect-square rounded sm:rounded-md ${bgClass} ${isToday ? "ring-acc-100 ring-1 sm:ring-2" : ""} ${isClickable ? "cursor-pointer transition-opacity hover:opacity-80 active:opacity-60 focus-visible:ring-2 focus-visible:ring-acc-100 focus-visible:outline-none" : ""}`}
									onClick={handleClick}
									onKeyDown={handleKeyDown}
									tabIndex={isClickable ? 0 : -1}
									role={isClickable ? "button" : undefined}
									aria-label={
										dailyData
											? `${dateKey}: ${formatCompactCurrencyWithSign(dailyData.pnl)}, ${dailyData.tradeCount} trades`
											: undefined
									}
								>
									<div className="flex h-full flex-col">
										<span className="text-[0.625rem] text-txt-200 leading-tight sm:text-tiny">
											{dayData.date.getDate()}
										</span>
										{dailyData && (
											<div className="mt-auto hidden sm:block">
												<span className={`text-tiny font-medium ${textClass}`}>
													{formatCompactCurrencyWithSign(dailyData.pnl)}
												</span>
												<span className="text-tiny text-txt-300 block">
													{dailyData.tradeCount}t
												</span>
											</div>
										)}
									</div>
								</div>
							)
						})}
					</div>
				</div>
			</div>
		)
	}
)

TradingCalendar.displayName = "TradingCalendar"
