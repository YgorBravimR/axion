"use client"

import { useState } from "react"
import { Calendar, SlidersHorizontal, X } from "lucide-react"
import { useTranslations } from "next-intl"
import type { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { FilterPill, type FilterVariant } from "@/components/shared"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import {
	Sheet,
	SheetContent,
	SheetTitle,
	SheetTrigger,
} from "@/components/ui/sheet"
import {
	ExpectancyModeToggle,
	type ExpectancyMode,
} from "./expectancy-mode-toggle"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { cn } from "@/lib/utils"

interface FilterState {
	dateFrom: Date | null
	dateTo: Date | null
	assets: string[]
	directions: Array<"long" | "short">
	outcomes: Array<"win" | "loss" | "breakeven">
	timeframeIds: string[]
}

interface TimeframeOption {
	id: string
	name: string
}

interface FilterPanelProps {
	filters: FilterState
	onFiltersChange: (filters: FilterState) => void
	availableAssets: string[]
	availableTimeframes: TimeframeOption[]
	expectancyMode: ExpectancyMode
	onExpectancyModeChange: (mode: ExpectancyMode) => void
}

interface DatePreset {
	key: string
	getDates: (now: Date) => { from: Date | null; to: Date | null }
}

const OUTCOME_VARIANT_MAP: Record<string, FilterVariant> = {
	win: "positive",
	loss: "negative",
	breakeven: "accent",
}

/**
 * Simplified date presets: Today, Week, Month, Year, Custom.
 * "allTime" is triggered by deselecting the active preset.
 */
const DATE_PRESET_CONFIGS: DatePreset[] = [
	{
		key: "today",
		getDates: (now) => ({ from: new Date(now), to: new Date(now) }),
	},
	{
		key: "thisWeek",
		getDates: (now) => {
			const start = new Date(now)
			start.setDate(now.getDate() - now.getDay())
			return { from: start, to: new Date(now) }
		},
	},
	{
		key: "thisMonth",
		getDates: (now) => {
			const start = new Date(now.getFullYear(), now.getMonth(), 1)
			return { from: start, to: new Date(now) }
		},
	},
	{
		key: "thisYear",
		getDates: (now) => {
			const start = new Date(now.getFullYear(), 0, 1)
			return { from: start, to: new Date(now) }
		},
	},
]

/**
 * Determines which preset key is currently active based on filter dates.
 * Returns null when no preset matches (custom range or allTime).
 */
const getActivePresetKey = (
	filters: FilterState,
	effectiveDate: Date
): string | null => {
	if (!filters.dateFrom && !filters.dateTo) return null

	for (const preset of DATE_PRESET_CONFIGS) {
		const { from, to } = preset.getDates(effectiveDate)
		if (
			from &&
			to &&
			filters.dateFrom?.toDateString() === from.toDateString() &&
			filters.dateTo?.toDateString() === to.toDateString()
		) {
			return preset.key
		}
	}
	return "custom"
}

const FilterPanel = ({
	filters,
	onFiltersChange,
	availableAssets,
	availableTimeframes,
	expectancyMode,
	onExpectancyModeChange,
}: FilterPanelProps) => {
	const t = useTranslations("analytics.filters")
	const tTrade = useTranslations("trade")
	const effectiveDate = useEffectiveDate()
	const [isSheetOpen, setIsSheetOpen] = useState(false)
	const [isCustomDateOpen, setIsCustomDateOpen] = useState(false)

	const activePresetKey = getActivePresetKey(filters, effectiveDate)

	const directions = [
		{ value: "long" as const, label: tTrade("direction.long") },
		{ value: "short" as const, label: tTrade("direction.short") },
	]

	const outcomes = [
		{ value: "win" as const, label: tTrade("outcome.win") },
		{ value: "loss" as const, label: tTrade("outcome.loss") },
		{ value: "breakeven" as const, label: tTrade("outcome.breakeven") },
	]

	const handleDatePreset = (preset: DatePreset) => {
		// Clicking the already-active preset deselects it (→ allTime)
		if (activePresetKey === preset.key) {
			onFiltersChange({ ...filters, dateFrom: null, dateTo: null })
			return
		}
		const { from, to } = preset.getDates(effectiveDate)
		onFiltersChange({ ...filters, dateFrom: from, dateTo: to })
	}

	const handleDateRangeChange = (range: DateRange | undefined) => {
		onFiltersChange({
			...filters,
			dateFrom: range?.from ?? null,
			dateTo: range?.to ?? null,
		})
	}

	const toggleArrayFilter = <T extends string>(
		array: T[],
		value: T,
		key: keyof FilterState
	) => {
		const newArray = array.includes(value)
			? array.filter((v) => v !== value)
			: [...array, value]
		onFiltersChange({ ...filters, [key]: newArray })
	}

	const clearFilters = () => {
		onFiltersChange({
			dateFrom: null,
			dateTo: null,
			assets: [],
			directions: [],
			outcomes: [],
			timeframeIds: [],
		})
	}

	// Count active advanced filters (excludes date since that's in the main bar)
	const advancedFilterCount =
		filters.assets.length +
		filters.directions.length +
		filters.outcomes.length +
		filters.timeframeIds.length

	const hasActiveFilters =
		filters.dateFrom || filters.dateTo || advancedFilterCount > 0

	return (
		<div id="analytics-filters" className="space-y-s-200">
			{/* Slim filter bar */}
			<div className="gap-s-200 sm:gap-s-300 flex flex-wrap items-center">
				{/* Period presets */}
				<div className="scrollbar-none flex items-center gap-1 overflow-x-auto">
					{DATE_PRESET_CONFIGS.map((preset) => (
						<button
							key={preset.key}
							type="button"
							tabIndex={0}
							onClick={() => handleDatePreset(preset)}
							className={cn(
								"px-s-300 py-s-100 text-tiny rounded-md font-medium whitespace-nowrap transition-colors",
								activePresetKey === preset.key
									? "bg-acc-100 text-bg-100"
									: "text-txt-300 hover:bg-bg-300 hover:text-txt-100"
							)}
						>
							{t(`datePresets.${preset.key}`)}
						</button>
					))}

					{/* Custom date button */}
					<button
						type="button"
						tabIndex={0}
						onClick={() => setIsCustomDateOpen((prev) => !prev)}
						className={cn(
							"px-s-300 py-s-100 text-tiny flex items-center gap-1 rounded-md font-medium whitespace-nowrap transition-colors",
							activePresetKey === "custom"
								? "bg-acc-100 text-bg-100"
								: "text-txt-300 hover:bg-bg-300 hover:text-txt-100"
						)}
					>
						<Calendar className="h-3 w-3" />
						{t("datePresets.custom")}
					</button>
				</div>

				{/* Right side: spacer + controls */}
				<div className="gap-s-200 ml-auto flex items-center">
					{hasActiveFilters && (
						<Button
							id="analytics-filter-clear"
							variant="ghost"
							size="sm"
							onClick={clearFilters}
							className="px-s-200 text-tiny h-7"
						>
							<X className="mr-1 h-3 w-3" />
							{t("clear")}
						</Button>
					)}

					<ExpectancyModeToggle
						mode={expectancyMode}
						onModeChange={onExpectancyModeChange}
					/>

					{/* Advanced Filters button */}
					<Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
						<SheetTrigger asChild>
							<button
								type="button"
								tabIndex={0}
								className="gap-s-200 border-bg-300 bg-bg-100 px-s-300 py-s-100 text-tiny text-txt-200 hover:border-txt-300 flex items-center rounded-md border transition-colors"
								aria-label={t("advancedFilters")}
							>
								<SlidersHorizontal className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">{t("advancedFilters")}</span>
								{advancedFilterCount > 0 && (
									<span className="bg-acc-100 text-micro text-bg-100 flex h-4 min-w-4 items-center justify-center rounded-full px-1 font-bold">
										{advancedFilterCount}
									</span>
								)}
							</button>
						</SheetTrigger>
						<SheetContent
							id="advanced-filters-sheet"
							side="right"
							className="w-80 sm:w-96"
						>
							<SheetTitle className="text-small text-txt-100 font-semibold">
								{t("advancedFilters")}
							</SheetTitle>
							<div className="mt-m-400 space-y-m-400">
								{/* Assets */}
								{availableAssets.length > 0 && (
									<div>
										<label className="mb-s-200 text-tiny text-txt-300 block font-medium">
											{t("assets")}
										</label>
										<div className="gap-s-200 flex flex-wrap">
											{availableAssets.map((asset) => (
												<FilterPill
													key={asset}
													label={asset}
													isActive={filters.assets.includes(asset)}
													onClick={() =>
														toggleArrayFilter(filters.assets, asset, "assets")
													}
												/>
											))}
										</div>
									</div>
								)}

								{/* Direction */}
								<div>
									<label className="mb-s-200 text-tiny text-txt-300 block font-medium">
										{t("direction")}
									</label>
									<div className="gap-s-200 flex">
										{directions.map(({ value, label }) => (
											<FilterPill
												key={value}
												label={label}
												isActive={filters.directions.includes(value)}
												onClick={() =>
													toggleArrayFilter(
														filters.directions,
														value,
														"directions"
													)
												}
												variant={value === "long" ? "positive" : "negative"}
											/>
										))}
									</div>
								</div>

								{/* Outcome */}
								<div>
									<label className="mb-s-200 text-tiny text-txt-300 block font-medium">
										{t("outcome")}
									</label>
									<div className="gap-s-200 flex">
										{outcomes.map(({ value, label }) => (
											<FilterPill
												key={value}
												label={label}
												isActive={filters.outcomes.includes(value)}
												onClick={() =>
													toggleArrayFilter(filters.outcomes, value, "outcomes")
												}
												variant={OUTCOME_VARIANT_MAP[value]}
											/>
										))}
									</div>
								</div>

								{/* Timeframes */}
								{availableTimeframes.length > 0 && (
									<div>
										<label className="mb-s-200 text-tiny text-txt-300 block font-medium">
											{t("timeframes")}
										</label>
										<div className="gap-s-200 flex flex-wrap">
											{availableTimeframes.map((tf) => (
												<FilterPill
													key={tf.id}
													label={tf.name}
													isActive={filters.timeframeIds.includes(tf.id)}
													onClick={() =>
														toggleArrayFilter(
															filters.timeframeIds,
															tf.id,
															"timeframeIds"
														)
													}
												/>
											))}
										</div>
									</div>
								)}
							</div>
						</SheetContent>
					</Sheet>
				</div>
			</div>

			{/* Custom date range picker (shown when "Personalizado" is clicked) */}
			{isCustomDateOpen && (
				<div className="gap-s-300 flex items-center">
					<DateRangePicker
						id="analytics-date-range"
						value={
							filters.dateFrom || filters.dateTo
								? {
										from: filters.dateFrom ?? undefined,
										to: filters.dateTo ?? undefined,
									}
								: undefined
						}
						onChange={handleDateRangeChange}
						className="w-full sm:max-w-sm"
					/>
				</div>
			)}
		</div>
	)
}

export { FilterPanel, type FilterState }
