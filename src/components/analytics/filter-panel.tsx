"use client"

import { useState, useMemo } from "react"
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
import { PresetSelector } from "./preset-selector"
import type { SavedFilterState } from "@/lib/filter-preset-schema"
import { useEffectiveDate } from "@/components/providers/effective-date-provider"
import { useUrlParams } from "@/hooks/use-url-params"
import { parseDateParam, serializeDateParam } from "@/lib/url-params"
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
	availableAssets: string[]
	availableTimeframes: TimeframeOption[]
}

interface DatePreset {
	key: string
	urlKey: string
	getDates: (_now: Date) => { from: Date | null; to: Date | null }
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
		urlKey: "today",
		getDates: (now) => ({ from: new Date(now), to: new Date(now) }),
	},
	{
		key: "thisWeek",
		urlKey: "week",
		getDates: (now) => {
			const start = new Date(now)
			start.setDate(now.getDate() - now.getDay())
			return { from: start, to: new Date(now) }
		},
	},
	{
		key: "thisMonth",
		urlKey: "month",
		getDates: (now) => {
			const start = new Date(now.getFullYear(), now.getMonth(), 1)
			return { from: start, to: new Date(now) }
		},
	},
	{
		key: "thisYear",
		urlKey: "year",
		getDates: (now) => {
			const start = new Date(now.getFullYear(), 0, 1)
			return { from: start, to: new Date(now) }
		},
	},
]

/** Maps URL datePreset param to a preset config */
const PRESET_BY_URL_KEY = new Map(DATE_PRESET_CONFIGS.map((p) => [p.urlKey, p]))

/**
 * Reads the current filter state from URL params.
 * This is the single source of truth for all analytics filters.
 */
const useAnalyticsFilters = () => {
	const urlParams = useUrlParams()
	const effectiveDate = useEffectiveDate()

	// Date handling: datePreset param wins, then custom from/to
	const datePresetKey = urlParams.get("datePreset")
	let dateFrom: Date | null = null
	let dateTo: Date | null = null
	let activePresetKey: string | null = null

	if (datePresetKey && PRESET_BY_URL_KEY.has(datePresetKey)) {
		const preset = PRESET_BY_URL_KEY.get(datePresetKey)!
		const dates = preset.getDates(effectiveDate)
		dateFrom = dates.from
		dateTo = dates.to
		activePresetKey = preset.key
	} else if (!datePresetKey) {
		// Check for custom from/to
		dateFrom = parseDateParam(urlParams.get("from"))
		dateTo = parseDateParam(urlParams.get("to"))
		if (dateFrom || dateTo) {
			activePresetKey = "custom"
		}
	}

	const filters: FilterState = {
		dateFrom,
		dateTo,
		assets: urlParams.getArray("assets"),
		directions: urlParams.getArray("directions") as Array<"long" | "short">,
		outcomes: urlParams.getArray("outcomes") as Array<
			"win" | "loss" | "breakeven"
		>,
		timeframeIds: urlParams.getArray("timeframeIds"),
	}

	const groupBy = (urlParams.get("groupBy") ?? "asset") as
		| "asset"
		| "timeframe"
		| "hour"
		| "dayOfWeek"
		| "strategy"

	const expectancyMode = (urlParams.get("expectancy") ??
		"edge") as ExpectancyMode

	const setDatePreset = (preset: DatePreset) => {
		// Clicking the already-active preset deselects it (→ allTime)
		if (activePresetKey === preset.key) {
			urlParams.set({ datePreset: null, from: null, to: null })
			return
		}
		urlParams.set({
			datePreset: preset.urlKey,
			from: null,
			to: null,
		})
	}

	const setCustomDateRange = (range: DateRange | undefined) => {
		urlParams.set({
			datePreset: null,
			from: serializeDateParam(range?.from ?? null),
			to: serializeDateParam(range?.to ?? null),
		})
	}

	const toggleArrayFilter = <T extends string>(
		array: T[],
		value: T,
		key: "assets" | "directions" | "outcomes" | "timeframeIds"
	) => {
		const newArray = array.includes(value)
			? array.filter((v) => v !== value)
			: [...array, value]
		urlParams.set({ [key]: newArray })
	}

	const setGroupBy = (value: string) => {
		urlParams.set({ groupBy: value === "asset" ? null : value })
	}

	const setExpectancyMode = (mode: ExpectancyMode) => {
		urlParams.set({ expectancy: mode === "edge" ? null : mode })
	}

	const clearFilters = () => {
		urlParams.set({
			datePreset: null,
			from: null,
			to: null,
			assets: [],
			directions: [],
			outcomes: [],
			timeframeIds: [],
		})
	}

	/** Apply a saved preset's filters to URL params */
	const applyPreset = (saved: SavedFilterState) => {
		urlParams.set({
			datePreset: saved.datePreset ?? null,
			from: saved.dateFrom ?? null,
			to: saved.dateTo ?? null,
			assets: saved.assets ?? [],
			directions: saved.directions ?? [],
			outcomes: saved.outcomes ?? [],
			timeframeIds: saved.timeframeIds ?? [],
			groupBy: saved.groupBy ?? null,
			expectancy: saved.expectancyMode ?? null,
		})
	}

	/** Serialize current filter state for saving as a preset */
	const serializeFilters = (): SavedFilterState => ({
		datePreset: activePresetKey === "custom" ? null : activePresetKey,
		dateFrom: filters.dateFrom?.toISOString() ?? null,
		dateTo: filters.dateTo?.toISOString() ?? null,
		assets: filters.assets.length > 0 ? filters.assets : undefined,
		directions: filters.directions.length > 0 ? filters.directions : undefined,
		outcomes: filters.outcomes.length > 0 ? filters.outcomes : undefined,
		timeframeIds:
			filters.timeframeIds.length > 0 ? filters.timeframeIds : undefined,
		groupBy,
		expectancyMode,
	})

	return {
		filters,
		groupBy,
		expectancyMode,
		activePresetKey,
		setDatePreset,
		setCustomDateRange,
		toggleArrayFilter,
		setGroupBy,
		setExpectancyMode,
		clearFilters,
		applyPreset,
		serializeFilters,
	}
}

const FilterPanel = ({
	availableAssets,
	availableTimeframes,
}: FilterPanelProps) => {
	const t = useTranslations("analytics.filters")
	const tTrade = useTranslations("trade")
	const {
		filters,
		groupBy,
		expectancyMode,
		activePresetKey,
		setDatePreset,
		setCustomDateRange,
		toggleArrayFilter,
		setExpectancyMode,
		clearFilters,
		applyPreset,
		serializeFilters,
	} = useAnalyticsFilters()
	const [isSheetOpen, setIsSheetOpen] = useState(false)
	const [isCustomDateOpen, setIsCustomDateOpen] = useState(false)

	const directions = useMemo(
		() => [
			{ value: "long" as const, label: tTrade("direction.long") },
			{ value: "short" as const, label: tTrade("direction.short") },
		],
		[tTrade]
	)

	const outcomes = useMemo(
		() => [
			{ value: "win" as const, label: tTrade("outcome.win") },
			{ value: "loss" as const, label: tTrade("outcome.loss") },
			{ value: "breakeven" as const, label: tTrade("outcome.breakeven") },
		],
		[tTrade]
	)

	// Memoize serialized filters to avoid creating new object on every render
	const currentFiltersMemo = useMemo(
		() => serializeFilters(),

		[serializeFilters]
	)

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
				<div className="gap-s-100 relative flex scrollbar-none items-center overflow-x-auto">
					<div className="from-bg-100 pointer-events-none absolute top-0 right-0 bottom-0 w-6 bg-linear-to-l sm:hidden" />
					{DATE_PRESET_CONFIGS.map((preset) => (
						<button
							key={preset.key}
							type="button"
							tabIndex={0}
							onClick={() => setDatePreset(preset)}
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
							"px-s-300 py-s-100 text-tiny gap-s-100 flex items-center rounded-md font-medium whitespace-nowrap transition-colors",
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
				<div className="gap-s-200 ml-auto flex min-w-[200px] items-center">
					<PresetSelector
						currentFilters={currentFiltersMemo}
						onApplyPreset={applyPreset}
					/>

					{hasActiveFilters && (
						<Button
							id="analytics-filter-clear"
							variant="ghost"
							size="sm"
							onClick={clearFilters}
							className="px-s-200 text-tiny h-7"
						>
							<X className="mr-s-100 h-3 w-3" />
							{t("clear")}
						</Button>
					)}

					<ExpectancyModeToggle
						mode={expectancyMode}
						onModeChange={setExpectancyMode}
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
									<span className="bg-acc-100 text-micro text-bg-100 px-s-100 flex h-4 min-w-4 items-center justify-center rounded-full font-bold">
										{advancedFilterCount}
									</span>
								)}
							</button>
						</SheetTrigger>
						<SheetContent
							id="advanced-filters-sheet"
							side="right"
							className="px-m-400 pt-m-400 pb-m-500 w-80 sm:w-96"
							aria-describedby={undefined}
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
						onChange={setCustomDateRange}
						className="w-full sm:max-w-sm"
					/>
				</div>
			)}
		</div>
	)
}

export { FilterPanel, useAnalyticsFilters, type FilterState }
