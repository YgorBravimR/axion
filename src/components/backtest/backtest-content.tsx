"use client"

import { useState, useTransition, useMemo, useCallback, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import type { DateRange } from "react-day-picker"
import { useToast } from "@/components/ui/toast"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import { Play, RotateCcw } from "lucide-react"
import { runBacktestAction } from "@/app/actions/backtest"
import { orbPresets } from "@/lib/backtest/presets/orb-presets"
// DEZK strategy archived 2026-05-29 — see dezk-presets.ts header. Not in UI.
import { hawksPresets } from "@/lib/backtest/presets/hawks-presets"
import { formatLocalYMD, parseLocalYMD } from "@/lib/backtest/time-utils"
import { DataSourceSelect } from "./data-source-select"
import { OrbEntrySection } from "./sections/orb-entry-section"
// DEZK entry section archived 2026-05-29 — see dezk-entry-section.tsx header.
import { HawksEntrySection } from "./sections/hawks-entry-section"
import { UserCatalogEntrySection } from "./sections/user-catalog-entry-section"
import { StopProtectionSection } from "./sections/stop-protection-section"
import { TargetsExitSection } from "./sections/targets-exit-section"
import { SizingExecutionSection } from "./sections/sizing-execution-section"
import {
	computeBreakevenRate,
	countBreakevens,
	recomputeWithoutBreakevens,
} from "@/lib/backtest/breakeven-filter"
import { listBundledCatalogs } from "@/app/actions/user-catalog-bundles"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import dynamic from "next/dynamic"
import { BacktestSummaryCards } from "./backtest-summary-cards"
import { BacktestTierBreakdown } from "./backtest-tier-breakdown"
const BacktestEquityChart = dynamic(
	() =>
		import("./backtest-equity-chart").then((m) => ({
			default: m.BacktestEquityChart,
		})),
	{ ssr: false }
)
import { BacktestTradesTable } from "./backtest-trades-table"
const HawksTripleScreenInspector = dynamic(
	() =>
		import("./inspector/triple-screen-inspector").then((m) => ({
			default: m.HawksTripleScreenInspector,
		})),
	{ ssr: false }
)
const BacktestOverviewChart = dynamic(
	() =>
		import("./inspector/backtest-overview-chart").then((m) => ({
			default: m.BacktestOverviewChart,
		})),
	{ ssr: false }
)
import { BacktestHawksResultsPanel } from "./backtest-hawks-results-panel"
import type { DataSourceInfo } from "@/types/candle"
import type {
	BacktestResult,
	BacktestTrade,
	StrategyRecipe,
} from "@/types/backtest"

const ALL_PRESETS = [...orbPresets, ...hawksPresets]

interface BacktestContentProps {
	dataSources: DataSourceInfo[]
}

const BacktestContent = ({ dataSources }: BacktestContentProps) => {
	const t = useTranslations("backtest")
	const { showToast } = useToast()
	const { showLoading, hideLoading } = useLoadingOverlay()
	const [isPending, startTransition] = useTransition()

	// Config state
	const [recipe, setRecipe] = useState<StrategyRecipe>(orbPresets[0])
	const [selectedSourceIndex, setSelectedSourceIndex] = useState<number>(0)
	const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
	const [quickRangeKey, setQuickRangeKey] = useState<string>("")
	const { dateFrom, dateTo } = useMemo(
		() => ({
			dateFrom: dateRange?.from ? formatLocalYMD(dateRange.from) : "",
			dateTo: dateRange?.to ? formatLocalYMD(dateRange.to) : "",
		}),
		[dateRange]
	)

	// Results state
	const [result, setResult] = useState<BacktestResult | null>(null)
	const [hasRun, setHasRun] = useState(false)
	const [selectedTrade, setSelectedTrade] = useState<BacktestTrade | null>(null)
	// Toggle to hide BE-stopped trades across every results surface. Default
	// OFF: the engine output is the source of truth; users opt in to filter.
	const [excludeBreakevens, setExcludeBreakevens] = useState(false)

	// Strategy-family flags. Declared first because subsequent useMemos
	// (displayedSummary, the catalog effects) depend on them — moving them
	// below would put their references inside the temporal dead zone.
	const isHawksFamily =
		recipe.entry.type === "hawks_playbook" ||
		recipe.entry.type === "user_catalog"
	const isUserCatalog = recipe.entry.type === "user_catalog"

	// Distinct catalog day count — used to (a) auto-set the date range to
	// span the catalog and (b) override the "Trading Days" denominator so it
	// reads "N / N" (100% of catalogued days) instead of calendar-span.
	const catalogDayCount = useMemo(() => {
		if (recipe.entry.type !== "user_catalog") {
			return 0
		}
		const days = new Set<string>()
		for (const entry of recipe.entry.config.catalog) {
			days.add(entry.date)
		}
		return days.size
	}, [recipe.entry])

	// BE-derived stats + filtered view. Always computed (cheap) so the
	// "{n} excluded" hint stays accurate even with the toggle off.
	const breakevenCount = useMemo(
		() => (result ? countBreakevens(result.trades) : 0),
		[result]
	)
	const breakevenRate = useMemo(
		() => (result ? computeBreakevenRate(result.trades) : 0),
		[result]
	)
	const filteredResult = useMemo(
		() =>
			result && excludeBreakevens ? recomputeWithoutBreakevens(result) : null,
		[result, excludeBreakevens]
	)
	const displayedTrades = filteredResult?.trades ?? result?.trades ?? []
	const baseSummary = filteredResult?.summary ?? result?.summary
	// In user_catalog mode, "Trading Days" denominator should be the count of
	// distinct catalogued days, not the calendar span between first and last
	// catalog date. The engine doesn't know about catalogs, so we override
	// the field at the UI boundary.
	const displayedSummary = useMemo(() => {
		if (!baseSummary) {
			return baseSummary
		}
		if (!isUserCatalog || catalogDayCount === 0) {
			return baseSummary
		}
		return { ...baseSummary, totalDays: catalogDayCount }
	}, [baseSummary, isUserCatalog, catalogDayCount])
	const displayedEquity =
		filteredResult?.equityCurve ?? result?.equityCurve ?? []
	const displayedDayBreakdown =
		filteredResult?.dayBreakdown ?? result?.dayBreakdown ?? []

	const selectedSource = dataSources[selectedSourceIndex]

	// In user_catalog mode the catalog IS the source of truth. Auto-load the
	// merged "all days" bundle on enter, then auto-pin the date range to
	// catalog's min/max — the date picker is hidden, so the user has no other
	// way to set it. If the user edits the JSON afterwards (excluding days),
	// the dateRange + totalDays follow.
	useEffect(() => {
		if (!isUserCatalog || recipe.entry.type !== "user_catalog") {
			return
		}
		const currentCatalog = recipe.entry.config.catalog
		if (currentCatalog.length > 0) {
			return
		}
		let cancelled = false
		void listBundledCatalogs().then((bundles) => {
			if (cancelled || bundles.length === 0) {
				return
			}
			const allBundle = bundles.find((b) => b.key === "all") ?? bundles[0]
			if (!allBundle) {
				return
			}
			setRecipe((prev) => {
				if (prev.entry.type !== "user_catalog") {
					return prev
				}
				if (prev.entry.config.catalog.length > 0) {
					return prev
				}
				return {
					...prev,
					entry: {
						type: "user_catalog",
						config: { ...prev.entry.config, catalog: allBundle.catalog },
					},
				}
			})
		})
		return () => {
			cancelled = true
		}
	}, [isUserCatalog, recipe.entry])

	// Auto-pin dateRange to the catalog span whenever the catalog changes
	// (initial load, JSON edits). Without this the engine wouldn't know to
	// query bricks for the catalog's date range — the picker is hidden.
	useEffect(() => {
		if (recipe.entry.type !== "user_catalog") {
			return
		}
		const catalog = recipe.entry.config.catalog
		if (catalog.length === 0) {
			return
		}
		const sortedDates = catalog
			.map((e) => e.date)
			.sort((a, b) => a.localeCompare(b))
		const firstDate = sortedDates[0]
		const lastDate = sortedDates[sortedDates.length - 1]
		if (!firstDate || !lastDate) {
			return
		}
		// Compare against current range to avoid setState loops.
		const fromMatches =
			dateRange?.from && formatLocalYMD(dateRange.from) === firstDate
		const toMatches = dateRange?.to && formatLocalYMD(dateRange.to) === lastDate
		if (fromMatches && toMatches) {
			return
		}
		setDateRange({
			from: parseLocalYMD(firstDate),
			to: parseLocalYMD(lastDate),
		})
		setQuickRangeKey("custom")
	}, [recipe.entry, dateRange])

	// Compute valuePerPoint from selected asset: tickValue / tickSize
	const assetValuePerPointCents = useMemo(
		() =>
			selectedSource
				? Math.round(
						selectedSource.assetTickValueCents / selectedSource.assetTickSize
					)
				: 20,
		[selectedSource]
	)

	const handlePresetChange = useCallback(
		(value: string) => {
			const index = parseInt(value, 10)
			const source = ALL_PRESETS[index]
			if (!source) {
				return
			}
			const preset: StrategyRecipe = { ...source }
			// Auto-fill valuePerPoint from asset
			if (preset.sizing.type === "monetary_risk") {
				preset.sizing = {
					...preset.sizing,
					valuePerPointCents: assetValuePerPointCents,
				}
			}
			setRecipe(preset)
		},
		[assetValuePerPointCents]
	)

	const handleStrategyChange = useCallback((type: string) => {
		if (type === "orb_breakout") {
			setRecipe(orbPresets[0])
		} else if (type === "hawks_playbook") {
			// `macd_wma_alignment` (DEZK) archived 2026-05-29 — not selectable.
			setRecipe(hawksPresets[0])
		} else if (type === "user_catalog") {
			// hawksUserCatalog is hawksPresets[1] — wraps Hawks stop/target math
			// around user-supplied entries instead of the autonomous engine.
			setRecipe(hawksPresets[1] ?? hawksPresets[0])
		}
	}, [])

	const handleSourceChange = useCallback(
		(value: string) => {
			const index = parseInt(value, 10)
			setSelectedSourceIndex(index)
			// Auto-update valuePerPoint in recipe when asset changes
			const source = dataSources[index]
			if (source && recipe.sizing.type === "monetary_risk") {
				const vpp = Math.round(
					source.assetTickValueCents / source.assetTickSize
				)
				setRecipe((prev) => ({
					...prev,
					sizing:
						prev.sizing.type === "monetary_risk"
							? { ...prev.sizing, valuePerPointCents: vpp }
							: prev.sizing,
				}))
			}
		},
		[dataSources, recipe.sizing.type]
	)

	const handleQuickRange = useCallback(
		(value: string) => {
			setQuickRangeKey(value)
			const now = new Date()
			let from: Date
			const to = selectedSource?.candleDateTo
				? new Date(selectedSource.candleDateTo)
				: now

			switch (value) {
				case "all":
					from = selectedSource?.candleDateFrom
						? new Date(selectedSource.candleDateFrom)
						: new Date("2020-01-01")
					break
				case "this_month":
					from = new Date(now.getFullYear(), now.getMonth(), 1)
					break
				case "this_year":
					from = new Date(now.getFullYear(), 0, 1)
					break
				case "3m":
					from = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
					break
				case "6m":
					from = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate())
					break
				case "1y":
					from = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
					break
				default:
					return
			}

			setDateRange({ from, to })
		},
		[selectedSource]
	)

	const handleDateRangeManual = useCallback((range: DateRange | undefined) => {
		setDateRange(range)
		setQuickRangeKey("custom")
	}, [])

	const handleReset = useCallback(() => {
		setResult(null)
		setHasRun(false)
	}, [])

	const handleRun = useCallback(() => {
		if (!selectedSource || !dateFrom || !dateTo) {
			showToast("error", t("errors.missingSelection"))
			return
		}

		showLoading({
			message: t("config.running"),
			subMessage: `${selectedSource.assetSymbol} — ${selectedSource.timeframeCode}`,
		})

		startTransition(async () => {
			const response = await runBacktestAction({
				assetId: selectedSource.assetId,
				timeframeId: selectedSource.timeframeId,
				dateRange: { from: dateFrom, to: dateTo },
				recipe,
			})

			hideLoading()
			setHasRun(true)

			if (response.success && response.data) {
				setResult(response.data)
				showToast(
					"success",
					t("results.completedTrades", {
						count: response.data.summary.totalTrades,
					})
				)
			} else {
				showToast("error", response.error ?? t("errors.engineError"))
			}
		})
	}, [
		selectedSource,
		dateFrom,
		dateTo,
		showToast,
		t,
		showLoading,
		startTransition,
		recipe,
		hideLoading,
	])

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 space-y-m-400 sm:space-y-m-500 lg:space-y-m-600 container mx-auto max-w-7xl">
			{/* Header */}
			<div>
				<h1 className="text-h2 text-txt-100 font-semibold">{t("title")}</h1>
				<p className="text-body text-txt-200">{t("description")}</p>
			</div>

			{/* Section 1: Strategy & Data */}
			<div className="border-bg-300 bg-bg-200 space-y-m-400 p-s-300 sm:p-m-400 lg:p-m-500 rounded-lg border">
				<h2 className="text-h3 text-txt-100 font-semibold">
					{t("builder.strategyAndData")}
				</h2>
				{/* Row 1: Preset (first — preset selection is the starting point;
				    placing it after Strategy/Asset led to "I configured stuff,
				    then picked a preset, then lost my work" footgun), Strategy,
				    Asset. Asset is hidden in user_catalog mode (the catalog
				    implies the asset/timeframe). */}
				<div
					className={`gap-m-400 grid grid-cols-1 ${isUserCatalog ? "sm:grid-cols-2" : "sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3"}`}
				>
					{/* Load Preset */}
					<div className="space-y-s-200">
						<label
							htmlFor="backtest-preset"
							className="text-small text-txt-200 font-medium"
						>
							{t("builder.loadPreset")}
						</label>
						<Select onValueChange={handlePresetChange}>
							<SelectTrigger id="backtest-preset">
								<SelectValue placeholder={t("config.selectPreset")} />
							</SelectTrigger>
							<SelectContent>
								{ALL_PRESETS.map((preset, i) => (
									<SelectItem
										key={`${preset.entry.type}-${preset.displayName}`}
										value={String(i)}
									>
										{preset.displayName}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Strategy */}
					<div className="space-y-s-200">
						<label
							htmlFor="backtest-strategy"
							className="text-small text-txt-200 font-medium"
						>
							{t("builder.strategy")}
						</label>
						<Select
							value={recipe.entry.type}
							onValueChange={handleStrategyChange}
						>
							<SelectTrigger id="backtest-strategy">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="orb_breakout">{t("orb.name")}</SelectItem>
								{/* DEZK (macd_wma_alignment) archived 2026-05-29 — hidden from UI. */}
								<SelectItem value="hawks_playbook">
									{t("hawks.name")}
								</SelectItem>
								<SelectItem value="user_catalog">
									{t("userCatalog.name")}
								</SelectItem>
							</SelectContent>
						</Select>
					</div>

					{/* Asset + Timeframe — hidden when running a user_catalog: the
					    asset/timeframe is implied by the catalog's brick indices. */}
					{!isUserCatalog && (
						<div className="space-y-s-200">
							<label
								htmlFor="backtest-source"
								className="text-small text-txt-200 font-medium"
							>
								{t("config.asset")} / {t("config.timeframe")}
							</label>
							<DataSourceSelect
								id="backtest-source"
								dataSources={dataSources}
								value={String(selectedSourceIndex)}
								onValueChange={handleSourceChange}
							/>
						</div>
					)}
				</div>

				{/* Row 2: Date Range — hidden in user_catalog mode (the catalog's
				    own date list IS the range; to exclude dates, edit the JSON). */}
				{!isUserCatalog && (
					<div className="space-y-s-200">
						<label
							htmlFor="backtest-quick-range"
							className="text-small text-txt-200 font-medium"
						>
							{t("config.dateRange")}
						</label>
						<div className="gap-s-200 flex flex-wrap items-center">
							<Select value={quickRangeKey} onValueChange={handleQuickRange}>
								<SelectTrigger
									id="backtest-quick-range"
									className="max-w-[128px] min-w-[80px]"
								>
									<SelectValue placeholder={t("builder.quickRange")} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{t("builder.rangeAll")}</SelectItem>
									<SelectItem value="this_month">
										{t("builder.rangeThisMonth")}
									</SelectItem>
									<SelectItem value="this_year">
										{t("builder.rangeThisYear")}
									</SelectItem>
									<SelectItem value="3m">{t("builder.range3m")}</SelectItem>
									<SelectItem value="6m">{t("builder.range6m")}</SelectItem>
									<SelectItem value="1y">{t("builder.range1y")}</SelectItem>
									<SelectItem value="custom">
										{t("builder.rangeCustom")}
									</SelectItem>
								</SelectContent>
							</Select>
							<DateRangePicker
								id="backtest-date-range"
								value={dateRange}
								onChange={handleDateRangeManual}
								minDate={
									selectedSource?.candleDateFrom
										? new Date(selectedSource.candleDateFrom)
										: undefined
								}
								maxDate={
									selectedSource?.candleDateTo
										? new Date(selectedSource.candleDateTo)
										: undefined
								}
							/>
						</div>
					</div>
				)}
			</div>

			{/* Config sections — hidden when results are showing */}
			{!result && (
				<>
					{/* Section 2: Entry Rules (dynamic per strategy) */}
					{recipe.entry.type === "orb_breakout" && (
						<OrbEntrySection recipe={recipe} onRecipeChange={setRecipe} />
					)}
					{/* DEZK entry section removed 2026-05-29 — strategy archived. */}
					{recipe.entry.type === "hawks_playbook" && (
						<HawksEntrySection recipe={recipe} onRecipeChange={setRecipe} />
					)}
					{recipe.entry.type === "user_catalog" && (
						<UserCatalogEntrySection
							recipe={recipe}
							onRecipeChange={setRecipe}
						/>
					)}

					{/* Section 3: Stop & Protection */}
					<StopProtectionSection recipe={recipe} onRecipeChange={setRecipe} />

					{/* Section 4: Sizing & Execution */}
					<SizingExecutionSection recipe={recipe} onRecipeChange={setRecipe} />

					{/* Section 5: Targets & Exit */}
					<TargetsExitSection recipe={recipe} onRecipeChange={setRecipe} />

					{/* Run button */}
					<div className="flex justify-end">
						<Button
							id="backtest-run"
							onClick={handleRun}
							disabled={isPending || !selectedSource || !dateFrom || !dateTo}
							size="lg"
						>
							<Play className="mr-s-200 h-4 w-4" aria-hidden="true" />
							{t("config.runBacktest")}
						</Button>
					</div>
				</>
			)}

			{/* Results — shown after backtest completes */}
			{result && displayedSummary && (
				<div className="space-y-m-500 [&>div]:min-w-0">
					<div className="gap-s-300 flex flex-wrap items-center justify-between">
						<div className="gap-s-300 flex flex-wrap items-center">
							<div className="gap-s-200 flex items-center">
								<Switch
									id="backtest-exclude-breakevens"
									checked={excludeBreakevens}
									onCheckedChange={setExcludeBreakevens}
								/>
								<Label
									id="backtest-exclude-breakevens-label"
									htmlFor="backtest-exclude-breakevens"
									className="cursor-pointer"
								>
									{t("results.excludeBreakevens")}
								</Label>
							</div>
							<span className="text-tiny text-txt-300 font-mono">
								{t("results.breakevenSummary", {
									count: breakevenCount,
									rate: breakevenRate,
								})}
							</span>
						</div>
						<Button
							id="backtest-new"
							variant="outline"
							onClick={handleReset}
							className="gap-s-200"
						>
							<RotateCcw className="h-4 w-4" aria-hidden="true" />
							{t("config.newBacktest")}
						</Button>
					</div>
					<BacktestSummaryCards
						summary={displayedSummary}
						engineVersion={result.engineVersion}
						breakevenCount={breakevenCount}
						breakevenRate={breakevenRate}
					/>
					{isHawksFamily && <BacktestTierBreakdown trades={displayedTrades} />}
					<BacktestEquityChart equityCurve={displayedEquity} />
					{isHawksFamily && selectedSource && dateFrom && dateTo ? (
						<BacktestOverviewChart
							trades={displayedTrades}
							assetSymbol={selectedSource.assetSymbol}
							dateFrom={dateFrom}
							dateTo={dateTo}
							selectedTradeId={selectedTrade?.id ?? null}
							onTradeSelect={setSelectedTrade}
						/>
					) : null}
					{isHawksFamily && (
						<BacktestHawksResultsPanel
							trades={displayedTrades}
							dayBreakdown={displayedDayBreakdown}
						/>
					)}
					<BacktestTradesTable
						trades={displayedTrades}
						onTradeView={setSelectedTrade}
					/>
					{isHawksFamily && selectedSource && selectedTrade ? (
						<HawksTripleScreenInspector
							trade={selectedTrade}
							assetSymbol={selectedSource.assetSymbol}
						/>
					) : null}
				</div>
			)}

			{/* Empty state — only after a run completes with no results */}
			{!result && !isPending && hasRun && (
				<div className="border-bg-300 bg-bg-200 p-l-700 flex flex-col items-center justify-center rounded-lg border text-center">
					<p className="text-h3 text-txt-200 font-medium">{t("empty.title")}</p>
					<p className="text-body text-txt-300 mt-s-200">
						{t("empty.description")}
					</p>
				</div>
			)}
		</div>
	)
}

export { BacktestContent }
