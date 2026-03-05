"use client"

import { useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import {
	ChevronLeft,
	ChevronRight,
	CalendarDays,
	SkipForward,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { APP_TIMEZONE, formatDateKey } from "@/lib/dates"
import { advanceReplayDate } from "@/app/actions/accounts"

interface DateNavigatorProps {
	currentDate: string // ISO date string YYYY-MM-DD
	isToday: boolean
	isReplayAccount?: boolean
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

export const DateNavigator = ({
	currentDate,
	isToday,
	isReplayAccount = false,
}: DateNavigatorProps) => {
	const t = useTranslations("commandCenter.dateNavigator")
	const router = useRouter()
	const pathname = usePathname()
	const [isAdvancing, setIsAdvancing] = useState(false)

	const handleNavigate = (offset: number) => {
		const date = new Date(currentDate + "T12:00:00")
		date.setDate(date.getDate() + offset)
		const newDateStr = formatDateKey(date)

		// For replay accounts, "today" is the replay date — just remove the param
		if (isReplayAccount) {
			// Can't navigate forward past replay date
			router.push(`${pathname}?date=${newDateStr}`)
			return
		}

		// For normal accounts, check if navigating to actual today
		const today = new Date()
		const todayStr = formatDateKey(today)

		if (newDateStr === todayStr) {
			router.push(pathname)
		} else {
			router.push(`${pathname}?date=${newDateStr}`)
		}
	}

	const handleGoToToday = () => {
		router.push(pathname)
	}

	const handleAdvanceReplayDate = async () => {
		setIsAdvancing(true)
		const result = await advanceReplayDate()
		setIsAdvancing(false)

		if (result.status === "success") {
			router.refresh()
		}
	}

	// Derive locale from pathname
	const locale = pathname.startsWith("/pt-BR") ? "pt-BR" : "en"

	return (
		<div className="gap-s-200 flex flex-wrap items-center">
			<Button
				id="date-nav-previous"
				variant="ghost"
				size="sm"
				onClick={() => handleNavigate(-1)}
				aria-label={t("previousDay")}
				tabIndex={0}
				className="h-9 w-9 p-0"
			>
				<ChevronLeft className="h-4 w-4" />
			</Button>

			<div className="gap-s-200 flex items-center">
				<CalendarDays className="text-txt-300 h-4 w-4" />
				<span
					className={cn(
						"text-small font-medium",
						isToday ? "text-txt-100" : "text-acc-100"
					)}
				>
					{isToday
						? isReplayAccount
							? formatDisplayDate(currentDate, locale)
							: t("today")
						: formatDisplayDate(currentDate, locale)}
				</span>
			</div>

			<Button
				id="date-nav-next"
				variant="ghost"
				size="sm"
				onClick={() => handleNavigate(1)}
				disabled={isToday}
				aria-label={t("nextDay")}
				tabIndex={0}
				className="h-9 w-9 p-0"
			>
				<ChevronRight className="h-4 w-4" />
			</Button>

			{!isToday && (
				<Button
					id="date-nav-today"
					variant="ghost"
					size="sm"
					onClick={handleGoToToday}
					className="ml-s-200 text-tiny text-acc-100"
				>
					{t("today")}
				</Button>
			)}

			{isReplayAccount && isToday && (
				<Button
					id="date-nav-advance-replay"
					variant="ghost"
					size="sm"
					onClick={handleAdvanceReplayDate}
					disabled={isAdvancing}
					className="ml-s-200 gap-s-100 text-tiny text-acc-100"
					aria-label={t("nextReplayDay")}
					tabIndex={0}
				>
					<SkipForward className="h-3.5 w-3.5" />
					<span>{t("nextReplayDay")}</span>
				</Button>
			)}

			{!isToday && (
				<span className="ml-s-200 bg-acc-100/10 px-s-200 py-s-100 text-tiny text-acc-100 rounded-sm">
					{t("readOnlyNotice")}
				</span>
			)}
		</div>
	)
}
