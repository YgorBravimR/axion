"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card"
import {
	HAWKS_CALENDAR_SEED,
	type HawksCalendarEvent,
	type HawksEventKind,
} from "@/lib/hawks/calendar"
import { cn } from "@/lib/utils"

const KIND_STYLES: Record<HawksEventKind, string> = {
	copom: "bg-acc-100/15 text-acc-100 border-acc-100/40",
	fomc: "bg-acc-200/15 text-acc-200 border-acc-200/40",
	cpi: "bg-loss/15 text-loss border-loss/40",
	peu: "bg-warning/15 text-warning border-warning/40",
}

const startOfMonth = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth(), 1)

const endOfMonth = (date: Date) =>
	new Date(date.getFullYear(), date.getMonth() + 1, 0)

const toIsoDate = (date: Date) => {
	const y = date.getFullYear()
	const m = String(date.getMonth() + 1).padStart(2, "0")
	const d = String(date.getDate()).padStart(2, "0")
	return `${y}-${m}-${d}`
}

interface HawksCalendarProps {
	initialMonth?: string
}

const HawksCalendar = ({ initialMonth }: HawksCalendarProps) => {
	const t = useTranslations("hawksCalendar")
	const [cursor, setCursor] = useState(() =>
		initialMonth ? new Date(initialMonth) : new Date()
	)

	const monthStart = startOfMonth(cursor)
	const monthEnd = endOfMonth(cursor)
	const todayIso = toIsoDate(new Date())

	const eventsByDay = useMemo(() => {
		const map = new Map<string, HawksCalendarEvent[]>()
		HAWKS_CALENDAR_SEED.filter(
			(event) => event.date >= toIsoDate(monthStart) && event.date <= toIsoDate(monthEnd)
		).forEach((event) => {
			const list = map.get(event.date) ?? []
			list.push(event)
			map.set(event.date, list)
		})
		return map
	}, [monthStart, monthEnd])

	const upcoming = useMemo(
		() =>
			HAWKS_CALENDAR_SEED.filter((event) => event.date >= todayIso)
				.sort((a, b) => a.date.localeCompare(b.date))
				.slice(0, 6),
		[todayIso]
	)

	const firstWeekday = monthStart.getDay()
	const daysInMonth = monthEnd.getDate()
	const cells: Array<{ day: number | null; iso: string | null }> = []
	for (let i = 0; i < firstWeekday; i += 1) {
		cells.push({ day: null, iso: null })
	}
	for (let day = 1; day <= daysInMonth; day += 1) {
		const iso = toIsoDate(
			new Date(cursor.getFullYear(), cursor.getMonth(), day)
		)
		cells.push({ day, iso })
	}

	const handlePrev = () => {
		setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))
	}
	const handleNext = () => {
		setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))
	}

	const monthLabel = cursor.toLocaleDateString(undefined, {
		month: "long",
		year: "numeric",
	})

	const weekdayLabels = useMemo(() => {
		const baseSunday = new Date(2024, 0, 7)
		return Array.from({ length: 7 }, (_, i) => {
			const day = new Date(baseSunday)
			day.setDate(baseSunday.getDate() + i)
			return day.toLocaleDateString(undefined, { weekday: "short" })
		})
	}, [])

	return (
		<Card id="hawks-calendar-card">
			<CardHeader>
				<div className="flex items-start justify-between gap-m-400">
					<div className="space-y-s-100">
						<CardTitle>{t("title")}</CardTitle>
						<CardDescription>{t("description")}</CardDescription>
					</div>
					<div className="flex items-center gap-s-100">
						<Button
							id="hawks-calendar-prev"
							type="button"
							size="icon"
							variant="ghost"
							onClick={handlePrev}
							aria-label={t("previousMonth")}
						>
							<ChevronLeft className="h-4 w-4" />
						</Button>
						<span className="min-w-[8rem] text-center text-small font-medium">
							{monthLabel}
						</span>
						<Button
							id="hawks-calendar-next"
							type="button"
							size="icon"
							variant="ghost"
							onClick={handleNext}
							aria-label={t("nextMonth")}
						>
							<ChevronRight className="h-4 w-4" />
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="space-y-m-400">
				<div className="grid grid-cols-7 gap-s-100 text-text-300 text-tiny">
					{weekdayLabels.map((label) => (
						<div key={label} className="text-center font-medium uppercase">
							{label}
						</div>
					))}
				</div>
				<div className="grid grid-cols-7 gap-s-100">
					{cells.map((cell, idx) => {
						if (!cell.day || !cell.iso) {
							return <div key={`empty-${idx}`} className="h-16" />
						}
						const events = eventsByDay.get(cell.iso) ?? []
						const isToday = cell.iso === todayIso
						return (
							<div
								key={cell.iso}
								className={cn(
									"flex h-16 flex-col rounded-md border p-s-100 text-tiny",
									isToday
										? "border-acc-100/60 bg-acc-100/5"
										: "border-bg-300 bg-bg-200/40"
								)}
							>
								<span
									className={cn(
										"font-mono",
										isToday ? "text-acc-100 font-semibold" : "text-text-200"
									)}
								>
									{cell.day}
								</span>
								<div className="mt-s-100 flex flex-wrap gap-s-100">
									{events.map((event) => (
										<span
											key={`${event.kind}-${event.date}`}
											className={cn(
												"rounded-sm border px-s-100 py-s-100 text-[0.625rem] font-semibold uppercase tracking-wide",
												KIND_STYLES[event.kind]
											)}
											title={event.label}
										>
											{event.kind}
										</span>
									))}
								</div>
							</div>
						)
					})}
				</div>

				<div className="space-y-s-200 pt-m-400 border-t border-bg-300">
					<h3 className="text-small font-medium">{t("upcomingTitle")}</h3>
					{upcoming.length === 0 ? (
						<p className="text-text-300 text-tiny">{t("upcomingEmpty")}</p>
					) : (
						<ul className="space-y-s-200 text-small">
							{upcoming.map((event) => (
								<li
									key={`${event.kind}-${event.date}`}
									className="flex items-center justify-between gap-s-300"
								>
									<div className="space-y-s-100">
										<p className="font-medium">{event.label}</p>
										<p className="text-text-300 text-tiny">
											{event.date} · {event.noTradeStart}–{event.noTradeEnd} BRT · {event.affectedSymbols.join(", ")}
										</p>
									</div>
									<span
										className={cn(
											"rounded-sm border px-s-100 py-s-100 text-tiny font-semibold uppercase",
											KIND_STYLES[event.kind]
										)}
									>
										{event.kind}
									</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</CardContent>
		</Card>
	)
}

export { HawksCalendar }
export type { HawksCalendarProps }
