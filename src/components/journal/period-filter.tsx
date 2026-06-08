"use client"

import { useState, useMemo } from "react"
import { Calendar } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import type { DateRange } from "react-day-picker"
import type { JournalPeriod } from "@/types"
import { Button } from "@/components/ui/button"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { APP_TIMEZONE } from "@/lib/dates"

interface PeriodFilterProps {
	value: JournalPeriod
	onChange: (
		_period: JournalPeriod,
		_dateRange?: { from: Date; to: Date }
	) => void
	customDateRange?: { from: Date; to: Date }
}

/**
 * Period filter component for selecting time ranges in the journal.
 * Supports predefined periods (day, week, month) and custom date ranges.
 *
 * Mobile/desktop view is controlled via CSS container queries to avoid
 * SSR hydration mismatch from useEffect media-query detection.
 *
 * @param value - Currently selected period
 * @param onChange - Callback when period or date range changes
 * @param customDateRange - Current custom date range if selected
 */
export const PeriodFilter = ({
	value,
	onChange,
	customDateRange,
}: PeriodFilterProps) => {
	const t = useTranslations("journal")
	const [showCustomPicker, setShowCustomPicker] = useState(false)
	const [tempRange, setTempRange] = useState<DateRange | undefined>(
		customDateRange
			? { from: customDateRange.from, to: customDateRange.to }
			: undefined
	)

	const periods = useMemo<{ key: JournalPeriod; label: string }[]>(
		() => [
			{ key: "day", label: t("period.day") },
			{ key: "week", label: t("period.week") },
			{ key: "month", label: t("period.month") },
			{ key: "all", label: t("period.all") },
			{ key: "custom", label: t("period.custom") },
		],
		[t]
	)

	const handlePeriodClick = (period: JournalPeriod) => {
		if (period === "custom") {
			setShowCustomPicker(true)
		} else {
			setShowCustomPicker(false)
			onChange(period)
		}
	}

	const handleCustomApply = () => {
		if (tempRange && tempRange.from && tempRange.to) {
			const fromDate = new Date(tempRange.from)
			fromDate.setHours(0, 0, 0, 0)
			const toDate = new Date(tempRange.to)
			toDate.setHours(23, 59, 59, 999)
			onChange("custom", { from: fromDate, to: toDate })
			setShowCustomPicker(false)
		}
	}

	const handleCustomCancel = () => {
		setShowCustomPicker(false)
		if (value !== "custom") {
			setTempRange(undefined)
		}
	}

	return (
		<div className="gap-s-200 @container flex flex-col">
			<div
				role="radiogroup"
				aria-label={t("period.filterGroupLabel")}
				className="gap-s-100 flex items-center overflow-x-auto"
			>
				{periods.map((period) => (
					<button
						key={period.key}
						type="button"
						role="radio"
						onClick={() => handlePeriodClick(period.key)}
						className={cn(
							"px-s-300 py-s-100 text-small focus-visible:ring-acc-100 rounded-md font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
							value === period.key
								? "bg-bg-300 text-txt-100 ring-acc-100/60 ring-1 ring-inset"
								: "bg-bg-300 text-txt-300 hover:text-txt-100"
						)}
						aria-checked={value === period.key}
					>
						{period.key === "custom" && (
							<Calendar
								className="mr-s-100 inline h-3.5 w-3.5"
								aria-hidden="true"
							/>
						)}
						{period.label}
					</button>
				))}
			</div>

			{/* Custom Date Range Picker */}
			{showCustomPicker && (
				<div className="gap-s-200 border-bg-300 bg-bg-100 p-s-300 flex max-w-[calc(100vw-2rem)] flex-wrap items-end rounded-lg border">
					<div className="w-full sm:min-w-[260px] sm:flex-1">
						<div className="min-[420px]:hidden">
							<DateRangePicker
								id="period-filter-range-mobile"
								value={tempRange}
								onChange={setTempRange}
								numberOfMonths={1}
							/>
						</div>
						<div className="hidden min-[420px]:block">
							<DateRangePicker
								id="period-filter-range-desktop"
								value={tempRange}
								onChange={setTempRange}
								numberOfMonths={2}
							/>
						</div>
					</div>
					<div className="gap-s-100 flex">
						<Button
							id="period-filter-cancel"
							variant="outline"
							size="sm"
							onClick={handleCustomCancel}
						>
							{t("period.cancel")}
						</Button>
						<Button
							id="period-filter-apply"
							size="sm"
							onClick={handleCustomApply}
							disabled={!tempRange || !tempRange.from || !tempRange.to}
						>
							{t("period.apply")}
						</Button>
					</div>
				</div>
			)}

			{/* Show current custom range if selected */}
			{value === "custom" && customDateRange && !showCustomPicker ? (
				<Button
					id="edit-custom-range"
					type="button"
					variant="link"
					size="sm"
					onClick={() => setShowCustomPicker(true)}
					className="gap-s-100 text-tiny text-txt-300 hover:text-txt-200 flex items-center"
					aria-label={t("period.editCustomRange")}
				>
					<Calendar className="h-3 w-3" />
					{customDateRange.from.toLocaleDateString(undefined, {
						timeZone: APP_TIMEZONE,
					})}{" "}
					-{" "}
					{customDateRange.to.toLocaleDateString(undefined, {
						timeZone: APP_TIMEZONE,
					})}
				</Button>
			) : null}
		</div>
	)
}
