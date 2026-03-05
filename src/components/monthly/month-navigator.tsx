"use client"

import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react"
import { format, subMonths, addMonths } from "date-fns"
import { ptBR, enUS } from "date-fns/locale"
import { useLocale } from "next-intl"

interface MonthNavigatorProps {
	currentDate: Date
	onMonthChange: (date: Date) => void
	minDate?: Date
	maxDate?: Date
}

export const MonthNavigator = ({
	currentDate,
	onMonthChange,
	minDate,
	maxDate,
}: MonthNavigatorProps) => {
	const t = useTranslations("monthly")
	const locale = useLocale()
	const dateLocale = locale === "pt-BR" ? ptBR : enUS

	const canGoPrevious = !minDate || subMonths(currentDate, 1) >= minDate
	const canGoNext = !maxDate || addMonths(currentDate, 1) <= maxDate

	const handlePrevious = () => {
		if (canGoPrevious) {
			onMonthChange(subMonths(currentDate, 1))
		}
	}

	const handleNext = () => {
		if (canGoNext) {
			onMonthChange(addMonths(currentDate, 1))
		}
	}

	const formattedMonth = format(currentDate, "MMMM yyyy", { locale: dateLocale })

	return (
		<div className="flex items-center justify-center gap-s-300 sm:gap-m-400">
			<Button id="month-nav-previous"
				variant="ghost"
				size="sm"
				onClick={handlePrevious}
				disabled={!canGoPrevious}
				className="h-10 w-10 p-0"
				aria-label={t("previousMonth")}
			>
				<ChevronLeft className="h-5 w-5" />
			</Button>

			<div className="flex min-w-[160px] sm:min-w-[200px] items-center justify-center gap-s-200">
				<Calendar className="h-5 w-5 text-acc-100" />
				<span className="text-body sm:text-h3 font-semibold capitalize text-txt-100">
					{formattedMonth}
				</span>
			</div>

			<Button id="month-nav-next"
				variant="ghost"
				size="sm"
				onClick={handleNext}
				disabled={!canGoNext}
				className="h-10 w-10 p-0"
				aria-label={t("nextMonth")}
			>
				<ChevronRight className="h-5 w-5" />
			</Button>
		</div>
	)
}
