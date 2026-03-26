"use client"

import { useState, useMemo } from "react"
import { useTranslations, useLocale } from "next-intl"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
	isB3Holiday,
	isNyseHoliday,
	getB3HolidayName,
	getNyseHolidayName,
} from "@/lib/market/holidays"

const WEEKDAYS_EN = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"]
const WEEKDAYS_PT = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]

/** Format as YYYY-MM-DD for holiday lookups */
const toDateStr = (year: number, month: number, day: number): string =>
	`${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`

/** Convert JS day (0=Sun) to Monday-based (0=Mon, 6=Sun) — standard in Brazil */
const getMondayBasedDay = (date: Date): number => {
	const jsDay = date.getDay()
	return jsDay === 0 ? 6 : jsDay - 1
}

interface DayInfo {
	day: number
	dateStr: string
	isWeekend: boolean
	isToday: boolean
	isB3Closed: boolean
	isNyseClosed: boolean
	b3HolidayName: string | null
	nyseHolidayName: string | null
}

export const B3TradingCalendar = () => {
	const t = useTranslations("market.tradingCalendar")
	const locale = useLocale()

	const [monthOffset, setMonthOffset] = useState(0)

	const today = new Date()
	const todayStr = toDateStr(
		today.getFullYear(),
		today.getMonth(),
		today.getDate()
	)

	const { year, month, firstDayOffset, days, trailingEmpty } = useMemo(
		// prettier-ignore
		() => {
			const target = new Date(
				today.getFullYear(),
				today.getMonth() + monthOffset,
				1
			)
			const yr = target.getFullYear()
			const mo = target.getMonth()
			const daysInMonth = new Date(yr, mo + 1, 0).getDate()
			const fdo = getMondayBasedDay(target)

			const dayInfos: DayInfo[] = []
			for (let d = 1; d <= daysInMonth; d++) {
				const dateStr = toDateStr(yr, mo, d)
				const dayOfWeek = getMondayBasedDay(new Date(yr, mo, d))
				const isWeekend = dayOfWeek >= 5

				dayInfos.push({
					day: d,
					dateStr,
					isWeekend,
					isToday: dateStr === todayStr,
					isB3Closed: isWeekend || isB3Holiday(dateStr),
					isNyseClosed: isWeekend || isNyseHoliday(dateStr),
					b3HolidayName: getB3HolidayName(dateStr, locale),
					nyseHolidayName: getNyseHolidayName(dateStr, locale),
				})
			}

			// Always 42 cells (6 rows) to prevent layout shift between months
			const totalCells = 42
			const trailingEmpty = totalCells - fdo - daysInMonth

			return {
				year: yr,
				month: mo,
				firstDayOffset: fdo,
				days: dayInfos,
				trailingEmpty,
			}
		},
		[monthOffset, todayStr, locale]
	)

	const weekdays = locale === "pt-BR" ? WEEKDAYS_PT : WEEKDAYS_EN

	const monthName = new Intl.DateTimeFormat(
		locale === "pt-BR" ? "pt-BR" : "en-US",
		{
			month: "long",
		}
	).format(new Date(year, month, 1))

	const handlePrevMonth = () => setMonthOffset((prev) => prev - 1)
	const handleNextMonth = () => setMonthOffset((prev) => prev + 1)

	return (
		<div className="flex flex-col gap-2 px-3 py-2">
			{/* Month navigation */}
			<div className="flex items-center justify-between">
			<Button
				id="calendar-prev-month"
				type="button"
				variant="ghost"
				size="icon"
				onClick={handlePrevMonth}
				className="text-txt-300"
				aria-label={t("prevMonth")}
			>
				<ChevronLeft className="h-4 w-4" />
			</Button>
				<span className="text-small text-txt-100 font-medium capitalize">
					{monthName} {year}
				</span>
			<Button
				id="calendar-next-month"
				type="button"
				variant="ghost"
				size="icon"
				onClick={handleNextMonth}
				className="text-txt-300"
				aria-label={t("nextMonth")}
			>
				<ChevronRight className="h-4 w-4" />
			</Button>
			</div>

			{/* Day-of-week headers */}
			<div className="grid grid-cols-7 gap-0.5 text-center text-sm">
				{weekdays.map((wd) => (
					<span key={wd} className="text-tiny text-txt-300 pt-0.5 font-medium">
						{wd}
					</span>
				))}
			</div>

			{/* Day grid */}
			<div
				className="grid grid-cols-7 gap-0.5"
				role="grid"
				aria-label={`${monthName} ${year}`}
			>
				{/* Empty cells for first-week offset */}
				{Array.from({ length: firstDayOffset }).map((_, i) => (
					<div
						key={`empty-${i}`}
						className="flex items-center justify-center rounded-sm border-2 border-transparent py-0.75 text-center text-sm text-transparent transition-colors"
					>
						-
					</div>
				))}
				{/* Day cells */}
				{days.map((day) => {
					const bothClosedNotWeekend =
						!day.isWeekend && day.isB3Closed && day.isNyseClosed
					const b3OnlyClosedNotWeekend =
						!day.isWeekend && day.isB3Closed && !day.isNyseClosed
					const nyseOnlyClosedNotWeekend =
						!day.isWeekend && !day.isB3Closed && day.isNyseClosed

					const tooltipParts = [
						day.b3HolidayName ? `🇧🇷 ${day.b3HolidayName}` : null,
						day.nyseHolidayName ? `🇺🇸 ${day.nyseHolidayName}` : null,
					].filter(Boolean)

					const tooltip = tooltipParts.join("\n")
					const specialDay =
						b3OnlyClosedNotWeekend ||
						nyseOnlyClosedNotWeekend ||
						bothClosedNotWeekend

					return (
						<div
							key={day.day}
							className={cn(
								"flex items-center justify-center rounded-sm border-2 border-transparent py-0.75 text-center text-sm transition-colors",
								// Default: weekend
								day.isWeekend && "text-txt-300/30",
								// Default: regular trading day
								!day.isWeekend &&
									!day.isB3Closed &&
									!day.isNyseClosed &&
									"text-txt-100",
								// B3 only closed — red filled
								b3OnlyClosedNotWeekend && "bg-fb-error/25",
								// NYSE only closed — warning filled
								nyseOnlyClosedNotWeekend && "bg-warning/25",
								// Both closed — diagonal gradient via globals.css utility class
								bothClosedNotWeekend && !day.isToday && "bg-both-closed text-txt-100",
								bothClosedNotWeekend && day.isToday && "text-txt-100",
								// Today — highlighted with font-color opacity bg
								day.isToday
									? specialDay
										? "border-txt-100"
										: "bg-txt-100/25 text-txt-100 border-txt-100/80 font-bold"
									: ""
							)}
							title={tooltip || undefined}
							aria-label={`${day.day}${tooltip ? ` — ${tooltip}` : ""}`}
						>
							{day.day}
						</div>
					)
				})}

				{/* Trailing empty cells — always 6 rows to prevent layout shift */}
				{Array.from({ length: trailingEmpty }).map((_, i) => (
					<div
						key={`trail-${i}`}
						className="flex items-center justify-center rounded-sm border-2 border-transparent py-0.75 text-center text-sm text-transparent transition-colors"
					>
						-
					</div>
				))}
			</div>

			{/* Legend */}
			<div className="flex flex-wrap justify-between gap-x-3 gap-y-1 pt-1 align-middle">
				<span className="text-tiny flex items-center gap-1.5">
					<span
						className="bg-txt-100/25 border-txt-100/80 h-3 w-3 rounded-sm border"
						aria-hidden="true"
					/>
					<span className="text-txt-300">{t("today")}</span>
				</span>
				<span className="text-tiny flex items-center gap-1.5">
					<span
						className="bg-fb-error/25 h-3 w-3 rounded-sm border border-transparent"
						aria-hidden="true"
					/>
					<span className="text-txt-300">{t("b3Closed")}</span>
				</span>
				<span className="text-tiny flex items-center gap-1.5">
					<span
						className="bg-warning/25 h-3 w-3 rounded-sm border border-transparent"
						aria-hidden="true"
					/>
					<span className="text-txt-300">{t("usClosed")}</span>
				</span>
			</div>
		</div>
	)
}
