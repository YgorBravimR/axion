"use client"

import { useState, useEffect, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import type { Locale } from "date-fns"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { getDateFnsLocale } from "@/lib/dates"

interface DatePickerProps {
	id: string
	value: Date | undefined
	onChange: (date: Date | undefined) => void
	maxDate?: Date
	minDate?: Date
	disabled?: boolean
	className?: string
	formatStr?: string
}

const DatePicker = ({
	id,
	value,
	onChange,
	maxDate,
	minDate,
	disabled = false,
	className,
	formatStr = "PPP",
}: DatePickerProps) => {
	const locale = useLocale()
	const tCommon = useTranslations("common")
	const [open, setOpen] = useState(false)
	const [dateFnsLocale, setDateFnsLocale] = useState<Locale | undefined>(undefined)

	useEffect(() => {
		getDateFnsLocale(locale).then(setDateFnsLocale)
	}, [locale])

	const handleSelect = (day: Date | undefined) => {
		onChange(day)
		setOpen(false)
	}

	const isDateDisabled = useCallback((date: Date) => {
		if (maxDate && date > maxDate) return true
		if (minDate && date < minDate) return true
		return false
	}, [maxDate, minDate])

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<button
					id={id}
					type="button"
					disabled={disabled}
					className={cn(
						"flex h-10 w-full items-center gap-s-200 rounded-md border border-bg-300 bg-bg-200 px-s-300 py-s-200 text-small text-txt-100 transition-colors",
						"hover:border-acc-100/50 focus:outline-none focus:ring-1 focus:ring-acc-100",
						"disabled:cursor-not-allowed disabled:opacity-50",
						!value && "text-txt-placeholder",
						className
					)}
					aria-label={tCommon("datePicker.placeholder")}
				>
					<CalendarIcon className="h-4 w-4 shrink-0 text-txt-300" />
					<span className="truncate">
						{value && dateFnsLocale
							? format(value, formatStr, { locale: dateFnsLocale })
							: tCommon("datePicker.placeholder")}
					</span>
				</button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0" align="start">
				<Calendar
					mode="single"
					selected={value}
					onSelect={handleSelect}
					disabled={isDateDisabled}
					defaultMonth={value}
					locale={dateFnsLocale}
				/>
			</PopoverContent>
		</Popover>
	)
}

export { DatePicker }
export type { DatePickerProps }
