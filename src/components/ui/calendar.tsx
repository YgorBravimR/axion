"use client"

import { type ComponentProps } from "react"
import { DayPicker } from "react-day-picker"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

type CalendarProps = ComponentProps<typeof DayPicker>

const CalendarChevron = ({ orientation }: {
	className?: string
	size?: number
	disabled?: boolean
	orientation?: "up" | "down" | "left" | "right"
}) =>
	orientation === "left" ? (
		<ChevronLeft className="h-4 w-4" />
	) : (
		<ChevronRight className="h-4 w-4" />
	)

const CALENDAR_COMPONENTS = { Chevron: CalendarChevron }

const Calendar = ({ className, classNames, ...props }: CalendarProps) => (
	<DayPicker
		className={cn("p-s-300", className)}
		classNames={{
			months: "flex flex-col sm:flex-row gap-m-400",
			month: "flex flex-col gap-s-300",
			month_caption: "flex justify-center items-center h-8",
			caption_label: "text-small font-semibold text-txt-100",
			nav: "flex items-center gap-s-100",
			button_previous:
				"absolute left-1 top-0 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-txt-200 hover:bg-bg-300 hover:text-txt-100 transition-colors",
			button_next:
				"absolute right-1 top-0 z-10 inline-flex h-8 w-8 items-center justify-center rounded-md text-txt-200 hover:bg-bg-300 hover:text-txt-100 transition-colors",
			month_grid: "border-collapse",
			weekdays: "flex",
			weekday:
				"w-9 text-tiny font-medium text-txt-300 flex items-center justify-center",
			week: "flex mt-s-100",
			day: "relative flex items-center justify-center p-0",
			day_button:
				"h-9 w-9 rounded-md text-small text-txt-100 font-normal hover:bg-bg-300 transition-colors flex items-center justify-center focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-acc-100",
			selected:
				"[&>button]:bg-acc-100 [&>button]:text-bg-100 [&>button]:font-semibold [&>button]:hover:bg-acc-100",
			today: "[&>button]:border [&>button]:border-acc-100",
			outside: "[&>button]:text-txt-300/40",
			disabled: "[&>button]:text-txt-300/30 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent",
			range_start: "[&>button]:bg-acc-100 [&>button]:text-bg-100 [&>button]:rounded-r-none",
			range_end: "[&>button]:bg-acc-100 [&>button]:text-bg-100 [&>button]:rounded-l-none",
			range_middle: "[&>button]:bg-acc-100/20 [&>button]:text-txt-100 [&>button]:rounded-none",
			hidden: "invisible",
			...classNames,
		}}
		components={CALENDAR_COMPONENTS}
		{...props}
	/>
)

Calendar.displayName = "Calendar"

export { Calendar }
export type { CalendarProps }
