"use client"

import { useState } from "react"
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
		period: JournalPeriod,
		dateRange?: { from: Date; to: Date }
	) => void
	customDateRange?: { from: Date; to: Date }
}

/**
 * Period filter component for selecting time ranges in the journal.
 * Supports predefined periods (day, week, month) and custom date ranges.
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

	const periods: { key: JournalPeriod; label: string }[] = [
		{ key: "day", label: t("period.day") },
		{ key: "week", label: t("period.week") },
		{ key: "month", label: t("period.month") },
		{ key: "all", label: t("period.all") },
		{ key: "custom", label: t("period.custom") },
	]

	const handlePeriodClick = (period: JournalPeriod) => {
		if (period === "custom") {
			setShowCustomPicker(true)
		} else {
			setShowCustomPicker(false)
			onChange(period)
		}
	}

	const handleCustomApply = () => {
		if (tempRange?.from && tempRange?.to) {
			const from = new Date(tempRange.from)
			from.setHours(0, 0, 0, 0)
			const to = new Date(tempRange.to)
			to.setHours(23, 59, 59, 999)
			onChange("custom", { from, to })
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
		<div className="gap-s-200 flex flex-col">
			<div className="gap-s-100 flex items-center overflow-x-auto scrollbar-none">
				{periods.map((period) => (
					<button
						key={period.key}
						type="button"
						onClick={() => handlePeriodClick(period.key)}
						className={cn(
							"px-s-300 py-s-100 text-small rounded-md font-medium transition-colors",
							value === period.key
								? "bg-acc-100 text-bg-100"
								: "bg-bg-300 text-txt-200 hover:bg-bg-200"
						)}
						aria-pressed={value === period.key}
					>
						{period.key === "custom" && (
							<Calendar className="mr-s-100 inline h-3.5 w-3.5" />
						)}
						{period.label}
					</button>
				))}
			</div>

			{/* Custom Date Range Picker */}
			{showCustomPicker && (
				<div className="gap-s-200 border-bg-300 bg-bg-100 p-s-300 flex flex-wrap items-end rounded-lg border">
					<div className="w-full sm:min-w-[260px] sm:flex-1">
						<DateRangePicker
							id="period-filter-range"
							value={tempRange}
							onChange={setTempRange}
						/>
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
							disabled={!tempRange?.from || !tempRange?.to}
						>
							{t("period.apply")}
						</Button>
					</div>
				</div>
			)}

			{/* Show current custom range if selected */}
			{value === "custom" && customDateRange && !showCustomPicker ? (
				<button
					type="button"
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
				</button>
			) : null}
		</div>
	)
}
