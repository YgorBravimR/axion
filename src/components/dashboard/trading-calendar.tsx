"use client"

import {
	useMemo,
	useCallback,
	memo,
	type KeyboardEvent,
	type MouseEvent,
} from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { cn } from "@/lib/utils"
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
		const tCommon = useTranslations("common")
		const tDays = useTranslations("dayOfWeek")
		const locale = useLocale()
		const effectiveDate = useEffectiveDate()

		const year = month.getFullYear()
		const monthIndex = month.getMonth()

		const daysOfWeek = useMemo(
			() => [
				tDays("sunShort"),
				tDays("monShort"),
				tDays("tueShort"),
				tDays("wedShort"),
				tDays("thuShort"),
				tDays("friShort"),
				tDays("satShort"),
			],
			[tDays]
		)

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

		const handleCellClick = useCallback(
			(e: MouseEvent<HTMLDivElement>) => {
				const key = e.currentTarget.dataset.dateKey
				if (key && onDayClick) {
					onDayClick(key)
				}
			},
			[onDayClick]
		)

		const handleCellKeyDown = useCallback(
			(e: KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault()
					const key = (e.currentTarget as HTMLElement).dataset.dateKey
					if (key && onDayClick) {
						onDayClick(key)
					}
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
			<div className="border-bg-300 bg-bg-200 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
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

				<div className="mt-s-300 sm:mt-m-400">
					{/* Days of week header */}
					<div className="sm:gap-s-100 grid grid-cols-7 gap-px">
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
					<div className="sm:gap-s-100 grid grid-cols-7 gap-px">
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

							return (
								<div
									key={dateKey}
									data-date-key={isClickable ? dateKey : undefined}
									className={cn(
										"p-s-100 aspect-square rounded-sm sm:rounded-md",
										bgClass,
										isToday && "ring-acc-100 ring-1 sm:ring-2",
										isClickable &&
											"focus-visible:ring-acc-100 cursor-pointer transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:outline-none active:opacity-60"
									)}
									onClick={isClickable ? handleCellClick : undefined}
									onKeyDown={isClickable ? handleCellKeyDown : undefined}
									tabIndex={isClickable ? 0 : -1}
									role={isClickable ? "button" : undefined}
									aria-label={
										dailyData
											? t("dayAriaLabel", {
													date: dateKey,
													pnl: formatCompactCurrencyWithSign(
														dailyData.pnl,
														"R$"
													),
													count: dailyData.tradeCount,
												})
											: isToday
												? t("todayAriaLabel", { date: dateKey })
												: undefined
									}
								>
									<div className="flex h-full flex-col">
										<span className="text-micro text-txt-200 sm:text-tiny leading-tight">
											{dayData.date.getDate()}
										</span>
										{dailyData && (
											<>
												{/* Mobile: dot indicator only */}
												<div className="mt-auto flex justify-center sm:hidden">
													<span
														className={cn("h-1 w-1 rounded-full", textClass)}
														aria-hidden="true"
													/>
												</div>
												{/* sm+: full P&L and count */}
												<div className="mt-auto hidden sm:block">
													<span
														className={cn("text-tiny font-medium", textClass)}
													>
														{formatCompactCurrencyWithSign(dailyData.pnl, "R$")}
													</span>
													<span className="text-tiny text-txt-300 block">
														{dailyData.tradeCount}
														{tCommon("tradeCountAbbr")}
													</span>
												</div>
											</>
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
