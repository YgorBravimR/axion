"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useLocale, useTranslations } from "next-intl"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import type { Locale } from "date-fns"
import type { DateRange } from "react-day-picker"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { cn } from "@/lib/utils"
import { getDateFnsLocale } from "@/lib/dates"

interface DateRangePickerProps {
	id: string
	value: DateRange | undefined
	onChange: (range: DateRange | undefined) => void
	maxDate?: Date
	minDate?: Date
	disabled?: boolean
	className?: string
	numberOfMonths?: number
}

const DateRangePicker = ({
	id,
	value,
	onChange,
	maxDate,
	minDate,
	disabled = false,
	className,
	numberOfMonths = 2,
}: DateRangePickerProps) => {
	const locale = useLocale()
	const tCommon = useTranslations("common")
	const [open, setOpen] = useState(false)
	const [dateFnsLocale, setDateFnsLocale] = useState<Locale | undefined>(
		undefined
	)
	const isSelectingRef = useRef(false)

	useEffect(() => {
		void getDateFnsLocale(locale).then(setDateFnsLocale)
	}, [locale])

	const handleSelect = (range: DateRange | undefined) => {
		onChange(range)
		if (range?.from && range?.to) {
			isSelectingRef.current = false
			setOpen(false)
		} else if (range?.from) {
			isSelectingRef.current = true
		} else {
			isSelectingRef.current = false
		}
	}

	const handleOpenChange = (isOpen: boolean) => {
		// Prevent auto-close while user is mid-range-selection (picked "from" but not "to")
		if (!isOpen && isSelectingRef.current) {
			return
		}
		if (!isOpen) {
			isSelectingRef.current = false
		}
		setOpen(isOpen)
	}

	const isDateDisabled = useCallback(
		(date: Date) => {
			if (maxDate && date > maxDate) {
				return true
			}
			if (minDate && date < minDate) {
				return true
			}
			return false
		},
		[maxDate, minDate]
	)

	const formatLabel = () => {
		if (!value?.from || !dateFnsLocale) {
			return tCommon("datePicker.rangePlaceholder")
		}
		const fromStr = format(value.from, "MMM d", { locale: dateFnsLocale })
		if (!value.to) {
			return fromStr
		}
		const toStr = format(value.to, "MMM d, yyyy", { locale: dateFnsLocale })
		return `${fromStr} - ${toStr}`
	}

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					id={id}
					type="button"
					disabled={disabled}
					className={cn(
						"gap-s-200 border-bg-300 bg-bg-200 px-s-300 py-s-200 text-small text-txt-100 flex h-10 w-full items-center rounded-md border transition-colors",
						"hover:border-acc-100/50 focus:ring-acc-100 focus:ring-1 focus:outline-none",
						"disabled:cursor-not-allowed disabled:opacity-50",
						!value?.from && "text-txt-placeholder",
						className
					)}
					aria-label={tCommon("datePicker.rangePlaceholder")}
				>
					<CalendarIcon className="text-txt-300 h-4 w-4 shrink-0" />
					<span className="truncate">{formatLabel()}</span>
				</button>
			</PopoverTrigger>
			<PopoverContent
				className="w-auto p-0"
				align="start"
				onEscapeKeyDown={() => {
					isSelectingRef.current = false
				}}
				onInteractOutside={() => {
					isSelectingRef.current = false
				}}
			>
				<Calendar
					mode="range"
					selected={value}
					onSelect={handleSelect}
					numberOfMonths={numberOfMonths}
					disabled={isDateDisabled}
					defaultMonth={value?.from}
					locale={dateFnsLocale}
				/>
			</PopoverContent>
		</Popover>
	)
}

export { DateRangePicker }
export type { DateRangePickerProps }
