"use client"

import { useCallback } from "react"
import { useRouter, usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import { Button } from "@/components/ui/button"
import { APP_TIMEZONE, formatDateKey } from "@/lib/dates"

interface DateNavigatorProps {
	currentDate: string // ISO date string YYYY-MM-DD
	isToday: boolean
}

const formatDisplayDate = (dateStr: string, locale: string): string => {
	const date = new Date(dateStr + "T12:00:00")
	return date.toLocaleDateString(locale === "pt-BR" ? "pt-BR" : "en-US", {
		weekday: "short",
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: APP_TIMEZONE,
	})
}

export const DateNavigator = ({ currentDate, isToday }: DateNavigatorProps) => {
	const t = useTranslations("commandCenter.dateNavigator")
	const router = useRouter()
	const pathname = usePathname()
	const locale = useLocale()

	const handleNavigate = useCallback(
		(offset: number) => {
			const date = new Date(currentDate + "T12:00:00")
			date.setDate(date.getDate() + offset)
			const newDateStr = formatDateKey(date)

			const today = new Date()
			const todayStr = formatDateKey(today)

			if (newDateStr === todayStr) {
				router.push(pathname)
			} else {
				router.push(`${pathname}?date=${newDateStr}`)
			}
		},
		[currentDate, router, pathname]
	)

	const handleGoToToday = useCallback(() => {
		router.push(pathname)
	}, [router, pathname])

	const handleNavigatePrev = useCallback(
		() => handleNavigate(-1),
		[handleNavigate]
	)
	const handleNavigateNext = useCallback(
		() => handleNavigate(1),
		[handleNavigate]
	)

	return (
		<div
			id="cc-date-navigator"
			className="gap-s-200 flex flex-wrap items-center"
		>
			<Button
				id="date-nav-previous"
				variant="ghost"
				size="sm"
				onClick={handleNavigatePrev}
				aria-label={t("previousDay")}
				tabIndex={0}
				className="size-10 p-0 sm:size-9"
			>
				<ChevronLeft className="h-4 w-4" />
			</Button>

			<div className="gap-s-200 flex items-center">
				<CalendarDays className="text-txt-300 h-4 w-4" aria-hidden="true" />
				{/* Always show the concrete date — when reviewing the dashboard the
				    day after, "Today" alone is ambiguous. The date prefix is muted
				    on the "Today" view so the eye still anchors on "Today". */}
				<span className="text-small text-txt-100 font-medium">
					{isToday ? (
						<>
							{t("today")}
							<span className="text-txt-300 ml-s-200 font-normal">
								· {formatDisplayDate(currentDate, locale)}
							</span>
						</>
					) : (
						formatDisplayDate(currentDate, locale)
					)}
				</span>
			</div>

			<Button
				id="date-nav-next"
				variant="ghost"
				size="sm"
				onClick={handleNavigateNext}
				disabled={isToday}
				aria-label={t("nextDay")}
				tabIndex={0}
				className="size-10 p-0 sm:size-9"
			>
				<ChevronRight className="h-4 w-4" />
			</Button>

			{!isToday && (
				<Button
					id="date-nav-today"
					variant="ghost"
					size="sm"
					onClick={handleGoToToday}
					className="ml-s-200 text-tiny"
				>
					{t("today")}
				</Button>
			)}

			{!isToday && (
				<span
					className="ml-s-200 bg-acc-100/10 px-s-200 py-s-100 text-tiny text-acc-100 rounded-sm"
					role="status"
					aria-live="polite"
				>
					{t("readOnlyNotice")}
				</span>
			)}
		</div>
	)
}
