"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select"
import { DateRangePicker } from "@/components/ui/date-range-picker"
import { useToast } from "@/components/ui/toast"
import { useLoadingOverlay } from "@/components/ui/loading-overlay"
import {
	Database,
	Play,
	Trash2,
	ChevronDown,
	Settings2,
	ArrowLeft,
	ArrowRight,
	RotateCcw,
	BarChart3,
	Table2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchBacktestData } from "@/app/actions/backtest"
import { runBacktest } from "@/lib/backtest/engine"
import { orbPresets } from "@/lib/backtest/presets/orb-presets"
import { dezkPresets } from "@/lib/backtest/presets/dezk-presets"
import {
	generateRecipeGrid,
	countCombinations,
	MAX_COMBINATIONS,
} from "@/lib/optimize/parameter-grid"
import { runSweep } from "@/lib/optimize/sweep-runner"
import { OrbEntrySection } from "@/components/backtest/sections/orb-entry-section"
import { DezkEntrySection } from "@/components/backtest/sections/dezk-entry-section"
import { StopProtectionSection } from "@/components/backtest/sections/stop-protection-section"
import { TargetsExitSection } from "@/components/backtest/sections/targets-exit-section"
import { SizingExecutionSection } from "@/components/backtest/sections/sizing-execution-section"
import { RunsComparisonTable } from "./runs-comparison-table"
import { EquityOverlayChart } from "./equity-overlay-chart"
import { RunDetailPanel } from "./run-detail-panel"
import { SweepConfigPanel } from "./sweep-config-panel"
import { SweepProgressBar } from "./sweep-progress-bar"
import { ParameterHeatmap } from "./parameter-heatmap"
import { WizardStepper } from "./wizard-stepper"
import { SummaryCards } from "./summary-cards"
import { loadRuns, saveRuns, clearRuns } from "@/lib/optimize/storage"
import type { DateRange } from "react-day-picker"
import type { DataSourceInfo, CandleRow } from "@/types/candle"
import type {
	StrategyRecipe,
	AssetConfig,
	OptimizationRun,
} from "@/types/backtest"
import type { ParameterRange } from "@/lib/optimize/parameter-grid"
import type { SweepHandle } from "@/lib/optimize/sweep-runner"
import type { WizardStepDef } from "./wizard-stepper"

const ALL_PRESETS = [...orbPresets, ...dezkPresets]

interface OptimizeContentProps {
	dataSources: DataSourceInfo[]
}

type WizardStep = "setup" | "parameters" | "results"

const OptimizeContent = ({ dataSources }: OptimizeContentProps) => {
	const t = useTranslations("optimize")
	const tBacktest = useTranslations("backtest")
	const { showToast } = useToast()
	const { showLoading, hideLoading } = useLoadingOverlay()

	// ── Wizard state ──────────────────────────────────────────────
	const [step, setStep] = useState<WizardStep>("setup")

	// ── Data state (fetched once, reused for all runs) ────────────
	const candlesRef = useRef<CandleRow[]>([])
	const assetConfigRef = useRef<AssetConfig | null>(null)
	const [candleCount, setCandleCount] = useState(0)
	const [isLoadingData, setIsLoadingData] = useState(false)

	// ── Config state ──────────────────────────────────────────────
	const [recipe, setRecipe] = useState<StrategyRecipe>(orbPresets[0])
	const [selectedSourceIndex, setSelectedSourceIndex] = useState(0)
	const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
	const [quickRangeKey, setQuickRangeKey] = useState("")

	// ── Base config disclosure ────────────────────────────────────
	const [baseConfigOpen, setBaseConfigOpen] = useState(false)

	// ── Sweep state ───────────────────────────────────────────────
	const [activeRanges, setActiveRanges] = useState<ParameterRange[]>([])
	const [isSweeping, setIsSweeping] = useState(false)
	const [sweepProgress, setSweepProgress] = useState({ current: 0, total: 0 })
	const sweepHandleRef = useRef<SweepHandle | null>(null)
	const sweepProgressRef = useRef(sweepProgress)
	sweepProgressRef.current = sweepProgress

	// ── Runs state ────────────────────────────────────────────────
	const [runs, setRuns] = useState<OptimizationRun[]>([])
	const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
	const runCounterRef = useRef(0)
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined
	)

	// Hydrate from localStorage on mount
	useEffect(() => {
		const stored = loadRuns()
		if (stored.length > 0) {
			setRuns(stored)
			runCounterRef.current = stored.length
		}
	}, [])

	// Persist to localStorage on change — debounced 1s
	useEffect(() => {
		if (runs.length > 0) {
			clearTimeout(saveTimeoutRef.current)
			saveTimeoutRef.current = setTimeout(() => saveRuns(runs), 1000)
		}
		return () => clearTimeout(saveTimeoutRef.current)
	}, [runs])

	const selectedSource = dataSources[selectedSourceIndex]
	const dateFrom = dateRange?.from
		? dateRange.from.toISOString().slice(0, 10)
		: ""
	const dateTo = dateRange?.to ? dateRange.to.toISOString().slice(0, 10) : ""
	const hasData = candleCount > 0

	const assetValuePerPointCents = selectedSource
		? Math.round(
				selectedSource.assetTickValueCents / selectedSource.assetTickSize
			)
		: 20

	// ── Wizard steps definition ───────────────────────────────────

	const wizardSteps: WizardStepDef[] = useMemo(
		() => [
			{ key: "setup", labelKey: "wizard.setup" },
			{ key: "parameters", labelKey: "wizard.parameters" },
			{ key: "results", labelKey: "wizard.results" },
		],
		[]
	)

	const completedSteps = useMemo(() => {
		const set = new Set<string>()
		if (hasData) {
			set.add("setup")
		}
		if (runs.length > 0) {
			set.add("parameters")
			set.add("results")
		}
		return set
	}, [hasData, runs.length])

	// ── Wizard navigation ─────────────────────────────────────────

	const handleNext = useCallback(() => {
		if (step === "setup" && hasData) {
			setStep("parameters")
		} else if (step === "parameters") {
			setStep("results")
		}
	}, [step, hasData])

	const handleBack = useCallback(() => {
		if (step === "results") {
			setStep("parameters")
		} else if (step === "parameters") {
			setStep("setup")
		}
	}, [step])

	const handleStepClick = useCallback((key: string) => {
		setStep(key as WizardStep)
	}, [])

	// ── Data & config handlers ────────────────────────────────────

	const handlePresetChange = (value: string) => {
		const index = parseInt(value, 10)
		const source = ALL_PRESETS[index]
		if (!source) {
			return
		}
		const preset: StrategyRecipe = { ...source }
		if (preset.sizing.type === "monetary_risk") {
			preset.sizing = {
				...preset.sizing,
				valuePerPointCents: assetValuePerPointCents,
			}
		}
		setRecipe(preset)
	}

	const handleStrategyChange = (type: string) => {
		if (type === "orb_breakout") {
			setRecipe(orbPresets[0])
		} else if (type === "macd_wma_alignment") {
			setRecipe(dezkPresets[0])
		}
		setActiveRanges([])
	}

	const handleSourceChange = (value: string) => {
		const index = parseInt(value, 10)
		setSelectedSourceIndex(index)
		candlesRef.current = []
		assetConfigRef.current = null
		setCandleCount(0)
		const source = dataSources[index]
		if (source && recipe.sizing.type === "monetary_risk") {
			const vpp = Math.round(source.assetTickValueCents / source.assetTickSize)
			setRecipe((prev) => ({
				...prev,
				sizing:
					prev.sizing.type === "monetary_risk"
						? { ...prev.sizing, valuePerPointCents: vpp }
						: prev.sizing,
			}))
		}
	}

	const handleQuickRange = (value: string) => {
		setQuickRangeKey(value)
		const now = new Date()
		let from: Date

		switch (value) {
			case "all":
				from = new Date("2020-01-01")
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

		setDateRange({ from, to: now })
		candlesRef.current = []
		assetConfigRef.current = null
		setCandleCount(0)
	}

	const handleDateRangeManual = (range: DateRange | undefined) => {
		setDateRange(range)
		setQuickRangeKey("custom")
		candlesRef.current = []
		assetConfigRef.current = null
		setCandleCount(0)
	}

	const handleLoadData = async () => {
		if (!selectedSource || !dateFrom || !dateTo) {
			showToast("error", t("dataRequired"))
			return
		}

		setIsLoadingData(true)
		showLoading({ message: t("loadingData") })

		const response = await fetchBacktestData({
			assetId: selectedSource.assetId,
			timeframeId: selectedSource.timeframeId,
			dateRange: { from: dateFrom, to: dateTo },
			requiredIndicators: recipe.requiredIndicators,
		})

		hideLoading()
		setIsLoadingData(false)

		if (response.success && response.data) {
			candlesRef.current = response.data.candles
			assetConfigRef.current = response.data.assetConfig
			setCandleCount(response.data.candles.length)
			showToast(
				"success",
				t("candlesLoaded", {
					count: response.data.candles.length.toLocaleString(),
				})
			)
		} else {
			showToast("error", response.error ?? "Failed to load data")
		}
	}

	// ── Sweep mode: batch run via Web Worker ──────────────────────

	const handleRunSweep = useCallback(() => {
		if (!hasData || !assetConfigRef.current) {
			showToast("error", t("dataRequired"))
			return
		}
		if (activeRanges.length === 0) {
			showToast("error", t("noParamsSelected"))
			return
		}

		const totalCombos = countCombinations(activeRanges, recipe)
		if (totalCombos > MAX_COMBINATIONS) {
			showToast(
				"error",
				t("sweepOverLimit", { max: MAX_COMBINATIONS.toLocaleString() })
			)
			return
		}

		const recipes = generateRecipeGrid(recipe, activeRanges)
		setIsSweeping(true)
		setSweepProgress({ current: 0, total: recipes.length })

		const sweepRuns: OptimizationRun[] = []

		const handle = runSweep(
			candlesRef.current,
			assetConfigRef.current,
			recipes,
			{
				onProgress: (run, index, total) => {
					sweepRuns.push(run)
					setSweepProgress({ current: index + 1, total })
				},
				onComplete: (totalMs) => {
					const sorted = [...sweepRuns].sort(
						(a, b) => b.summary.profitFactor - a.summary.profitFactor
					)
					const top3Ids = new Set(sorted.slice(0, 3).map((r) => r.id))
					const finalRuns = sweepRuns.map((r) => ({
						...r,
						pinned: top3Ids.has(r.id),
					}))

					setRuns((prev) => [...finalRuns, ...prev])
					runCounterRef.current += sweepRuns.length
					setIsSweeping(false)
					sweepHandleRef.current = null
					const seconds = (totalMs / 1000).toFixed(1)
					showToast(
						"success",
						t("sweepComplete", { total: sweepRuns.length, seconds })
					)
					// Auto-advance to results after sweep
					setStep("results")
				},
				onError: (message) => {
					if (sweepRuns.length > 0) {
						setRuns((prev) => [...sweepRuns, ...prev])
						runCounterRef.current += sweepRuns.length
					}
					setIsSweeping(false)
					sweepHandleRef.current = null
					showToast("error", t("sweepError", { message }))
				},
			}
		)

		sweepHandleRef.current = handle
	}, [hasData, recipe, activeRanges, showToast, t])

	const handleCancelSweep = useCallback(() => {
		sweepHandleRef.current?.cancel()
		sweepHandleRef.current = null
		setIsSweeping(false)
		showToast(
			"info",
			t("sweepCancelled", { count: sweepProgressRef.current.current })
		)
	}, [showToast, t])

	// ── Shared run actions ────────────────────────────────────────

	const handleTogglePin = useCallback((runId: string) => {
		setRuns((prev) =>
			prev.map((run) =>
				run.id === runId ? { ...run, pinned: !run.pinned } : run
			)
		)
	}, [])

	const handleDeleteRun = useCallback(
		(runId: string) => {
			setRuns((prev) => prev.filter((run) => run.id !== runId))
			if (expandedRunId === runId) {
				setExpandedRunId(null)
			}
		},
		[expandedRunId]
	)

	const handleToggleExpand = useCallback((runId: string) => {
		setExpandedRunId((prev) => (prev === runId ? null : runId))
	}, [])

	const handleClearAll = useCallback(() => {
		setRuns([])
		clearRuns()
		setExpandedRunId(null)
		runCounterRef.current = 0
	}, [])

	const handleUpdateLabel = useCallback((runId: string, label: string) => {
		setRuns((prev) =>
			prev.map((run) => (run.id === runId ? { ...run, label } : run))
		)
	}, [])

	const handleRecomputeTrades = useCallback((runId: string) => {
		if (!assetConfigRef.current) {
			return
		}

		setRuns((prev) =>
			prev.map((run) => {
				if (run.id !== runId) {
					return run
				}
				if (run.trades.length > 0) {
					return run
				}

				const result = runBacktest(
					candlesRef.current,
					run.recipe,
					assetConfigRef.current!
				)
				return {
					...run,
					trades: result.trades,
					dayBreakdown: result.dayBreakdown,
				}
			})
		)
	}, [])

	const handleNewOptimization = useCallback(() => {
		setStep("setup")
	}, [])

	const pinnedRuns = runs.filter((r) => r.pinned)
	const expandedRun = expandedRunId
		? runs.find((r) => r.id === expandedRunId)
		: null
	const totalCombinations =
		activeRanges.length > 0 ? countCombinations(activeRanges, recipe) : 0

	// ── Render ────────────────────────────────────────────────────

	return (
		<div className="space-y-m-500">
			{/* Header */}
			<div>
				<h1 className="text-h2 text-txt-100 font-semibold">{t("title")}</h1>
				<p className="text-body text-txt-200">{t("description")}</p>
			</div>

			{/* Wizard Stepper */}
			<WizardStepper
				steps={wizardSteps}
				activeStep={step}
				completedSteps={completedSteps}
				onStepClick={handleStepClick}
			/>

			{/* ─── Step 1: Setup ──────────────────────────────────── */}
			{step === "setup" && (
				<div className="space-y-m-400 mx-auto max-w-2xl">
					<p className="text-small text-txt-300 text-center">
						{t("wizard.setupDesc")}
					</p>

					<div className="border-bg-300 bg-bg-200 space-y-s-300 p-m-400 rounded-lg border">
						{/* Strategy */}
						<div className="space-y-s-200">
							<label
								htmlFor="optimize-strategy"
								className="text-small text-txt-200 font-medium"
							>
								{tBacktest("builder.strategy")}
							</label>
							<Select
								value={recipe.entry.type}
								onValueChange={handleStrategyChange}
							>
								<SelectTrigger id="optimize-strategy">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="orb_breakout">
										{tBacktest("orb.name")}
									</SelectItem>
									<SelectItem value="macd_wma_alignment">
										{tBacktest("dezk.name")}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{/* Preset */}
						<div className="space-y-s-200">
							<label
								htmlFor="optimize-preset"
								className="text-small text-txt-200 font-medium"
							>
								{tBacktest("builder.loadPreset")}
							</label>
							<Select onValueChange={handlePresetChange}>
								<SelectTrigger id="optimize-preset">
									<SelectValue placeholder={tBacktest("config.selectPreset")} />
								</SelectTrigger>
								<SelectContent>
									{ALL_PRESETS.map((preset, i) => (
										<SelectItem
											key={`${preset.entry.type}-${i}`}
											value={String(i)}
										>
											{preset.displayName}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Asset + Timeframe */}
						<div className="space-y-s-200">
							<label
								htmlFor="optimize-source"
								className="text-small text-txt-200 font-medium"
							>
								{tBacktest("config.asset")} / {tBacktest("config.timeframe")}
							</label>
							<Select
								value={String(selectedSourceIndex)}
								onValueChange={handleSourceChange}
							>
								<SelectTrigger id="optimize-source">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{dataSources.map((source, i) => (
										<SelectItem
											key={`${source.assetId}-${source.timeframeId}`}
											value={String(i)}
										>
											{source.assetSymbol} — {source.timeframeCode}
											{source.rowCount
												? ` (${source.rowCount.toLocaleString()})`
												: ""}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						{/* Date Range */}
						<div className="space-y-s-200">
							<label
								htmlFor="optimize-quick-range"
								className="text-small text-txt-200 font-medium"
							>
								{tBacktest("config.dateRange")}
							</label>
							<Select value={quickRangeKey} onValueChange={handleQuickRange}>
								<SelectTrigger id="optimize-quick-range">
									<SelectValue placeholder={tBacktest("builder.quickRange")} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">
										{tBacktest("builder.rangeAll")}
									</SelectItem>
									<SelectItem value="this_month">
										{tBacktest("builder.rangeThisMonth")}
									</SelectItem>
									<SelectItem value="this_year">
										{tBacktest("builder.rangeThisYear")}
									</SelectItem>
									<SelectItem value="3m">
										{tBacktest("builder.range3m")}
									</SelectItem>
									<SelectItem value="6m">
										{tBacktest("builder.range6m")}
									</SelectItem>
									<SelectItem value="1y">
										{tBacktest("builder.range1y")}
									</SelectItem>
									<SelectItem value="custom">
										{tBacktest("builder.rangeCustom")}
									</SelectItem>
								</SelectContent>
							</Select>
							<DateRangePicker
								id="optimize-date-range"
								value={dateRange}
								onChange={handleDateRangeManual}
							/>
						</div>

						{/* Load Data */}
						<Button
							id="optimize-load-data"
							onClick={handleLoadData}
							disabled={
								isLoadingData || !selectedSource || !dateFrom || !dateTo
							}
							className="gap-s-200 w-full"
							variant={hasData ? "outline" : "default"}
						>
							<Database className="h-4 w-4" />
							{hasData
								? t("candlesLoaded", { count: candleCount.toLocaleString() })
								: t("loadData")}
						</Button>
					</div>
				</div>
			)}

			{/* ─── Step 2: Parameters ────────────────────────────── */}
			{step === "parameters" && (
				<div className="gap-m-500 grid grid-cols-1 lg:grid-cols-[1fr_280px]">
					{/* Sweep config + base config */}
					<div className="space-y-m-400">
						<p className="text-small text-txt-300">
							{t("wizard.parametersDesc")}
						</p>

						<SweepConfigPanel
							recipe={recipe}
							activeRanges={activeRanges}
							onRangesChange={setActiveRanges}
						/>

						{/* Collapsible base configuration for non-sweepable params */}
						<div className="border-bg-300 rounded-lg border">
							<button
								type="button"
								onClick={() => setBaseConfigOpen((prev) => !prev)}
								className="hover:bg-bg-300/50 px-m-400 py-s-300 flex w-full items-center justify-between transition-colors"
								aria-expanded={baseConfigOpen}
								aria-controls="base-config-panel"
							>
								<span className="text-small gap-s-200 text-txt-200 flex items-center font-medium">
									<Settings2 className="h-4 w-4" />
									{t("baseConfig")}
								</span>
								<ChevronDown
									className={cn(
										"text-txt-300 h-4 w-4 transition-transform",
										baseConfigOpen && "rotate-180"
									)}
								/>
							</button>
							{baseConfigOpen && (
								<div
									id="base-config-panel"
									className="border-bg-300 space-y-m-400 p-m-400 border-t"
								>
									<p className="text-tiny text-txt-300">
										{t("baseConfigHint")}
									</p>
									<div className="gap-m-400 grid grid-cols-1 lg:grid-cols-2">
										{recipe.entry.type === "orb_breakout" && (
											<OrbEntrySection
												recipe={recipe}
												onRecipeChange={setRecipe}
											/>
										)}
										{recipe.entry.type === "macd_wma_alignment" && (
											<DezkEntrySection
												recipe={recipe}
												onRecipeChange={setRecipe}
											/>
										)}
										<StopProtectionSection
											recipe={recipe}
											onRecipeChange={setRecipe}
										/>
										<TargetsExitSection
											recipe={recipe}
											onRecipeChange={setRecipe}
										/>
										<SizingExecutionSection
											recipe={recipe}
											onRecipeChange={setRecipe}
										/>
									</div>
								</div>
							)}
						</div>

						{/* Sweep progress bar */}
						<div aria-live="polite" aria-atomic="false">
							{isSweeping && (
								<SweepProgressBar
									current={sweepProgress.current}
									total={sweepProgress.total}
									onCancel={handleCancelSweep}
								/>
							)}
						</div>

						{/* Run Sweep button */}
						{!isSweeping && (
							<Button
								id="optimize-sweep"
								onClick={handleRunSweep}
								disabled={!hasData || activeRanges.length === 0}
								size="lg"
								className="gap-s-200 w-full"
							>
								<Play className="h-4 w-4" />
								{t("runSweep")}
							</Button>
						)}
					</div>

					{/* Summary sidebar */}
					<div className="border-bg-300 bg-bg-200 space-y-s-300 p-m-400 h-fit rounded-lg border">
						<h4 className="text-small text-txt-100 font-semibold">
							{t("summary.strategy")}
						</h4>
						<div className="space-y-s-200 text-tiny">
							<div className="flex justify-between">
								<span className="text-txt-300">{t("summary.strategy")}</span>
								<span className="text-txt-100 font-medium">
									{recipe.displayName}
								</span>
							</div>
							{selectedSource && (
								<div className="flex justify-between">
									<span className="text-txt-300">{t("summary.asset")}</span>
									<span className="text-txt-100 font-medium">
										{selectedSource.assetSymbol} —{" "}
										{selectedSource.timeframeCode}
									</span>
								</div>
							)}
							{dateFrom && dateTo && (
								<div className="flex justify-between">
									<span className="text-txt-300">{t("summary.period")}</span>
									<span className="text-txt-100 font-medium">
										{dateFrom} — {dateTo}
									</span>
								</div>
							)}
							<div className="border-bg-300 my-s-200 border-t" />
							<div className="flex justify-between">
								<span className="text-txt-300">
									{t("summary.paramsSelected", { count: activeRanges.length })}
								</span>
							</div>
							<div className="flex justify-between">
								<span
									className={`font-semibold tabular-nums ${totalCombinations > MAX_COMBINATIONS ? "text-fb-error" : "text-acc-100"}`}
								>
									{t("summary.combinations", {
										count: totalCombinations.toLocaleString(),
									})}
								</span>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* ─── Step 4: Results ────────────────────────────────── */}
			{step === "results" && (
				<div className="space-y-m-400">
					{runs.length > 0 ? (
						<>
							{/* Summary stat cards */}
							<SummaryCards runs={runs} />

							{/* Chart / Table tabs */}
							<Tabs defaultValue="chart">
								<div className="flex items-center justify-between">
									<TabsList variant="line">
										<TabsTrigger value="chart" className="gap-s-200">
											<BarChart3 className="h-4 w-4" />
											{t("resultsTab.chart")}
										</TabsTrigger>
										<TabsTrigger value="table" className="gap-s-200">
											<Table2 className="h-4 w-4" />
											{t("resultsTab.table")}
										</TabsTrigger>
									</TabsList>

									<Button
										id="optimize-clear-all"
										variant="ghost"
										size="sm"
										onClick={handleClearAll}
										className="text-txt-300 hover:text-fb-error gap-s-200"
									>
										<Trash2 className="h-3.5 w-3.5" />
										{t("clearAll")}
									</Button>
								</div>

								{/* Chart tab: equity overlay + heatmap */}
								<TabsContent value="chart" className="space-y-m-400 mt-m-400">
									{pinnedRuns.length > 0 && (
										<div className="border-bg-300 bg-bg-200 p-m-400 rounded-lg border">
											<h3 className="text-h3 mb-s-300 text-txt-100 font-semibold">
												{t("equityOverlay")}
											</h3>
											<EquityOverlayChart runs={pinnedRuns} />
										</div>
									)}

									{runs.length > 1 && (
										<ParameterHeatmap
											runs={runs}
											onSelectRun={handleToggleExpand}
										/>
									)}
								</TabsContent>

								{/* Table tab: comparison table */}
								<TabsContent value="table" className="mt-m-400">
									<div className="border-bg-300 bg-bg-200 space-y-s-300 p-m-400 rounded-lg border">
										<div className="gap-s-200 flex items-center">
											<h3 className="text-h3 text-txt-100 font-semibold">
												{t("comparisonTable")}
											</h3>
											<Badge id="optimize-runs-count" variant="secondary">
												{t("runsCount", { count: runs.length })}
											</Badge>
										</div>
										<RunsComparisonTable
											runs={runs}
											expandedRunId={expandedRunId}
											onTogglePin={handleTogglePin}
											onToggleExpand={handleToggleExpand}
											onDelete={handleDeleteRun}
											onUpdateLabel={handleUpdateLabel}
										/>
									</div>
								</TabsContent>
							</Tabs>

							{/* Expanded run detail */}
							{expandedRun && (
								<RunDetailPanel
									run={expandedRun}
									onRecomputeTrades={handleRecomputeTrades}
								/>
							)}
						</>
					) : (
						<div className="border-bg-300 bg-bg-200 p-l-700 flex flex-col items-center justify-center rounded-lg border text-center">
							<p className="text-h3 text-txt-200 font-medium">{t("noRuns")}</p>
						</div>
					)}
				</div>
			)}

			{/* ─── Navigation footer ──────────────────────────────── */}
			<div className="border-bg-300 pt-m-400 flex items-center justify-between border-t">
				{/* Left: Back button */}
				<div>
					{step !== "setup" && (
						<Button
							id="optimize-back"
							variant="outline"
							onClick={handleBack}
							className="gap-s-200"
						>
							<ArrowLeft className="h-4 w-4" />
							{t("wizard.back")}
						</Button>
					)}
				</div>

				{/* Right: context-dependent action */}
				<div className="gap-s-300 flex">
					{step === "setup" && (
						<Button
							id="optimize-next"
							onClick={handleNext}
							disabled={!hasData}
							className="gap-s-200"
						>
							{t("wizard.next")}
							<ArrowRight className="h-4 w-4" />
						</Button>
					)}

					{step === "results" && (
						<Button
							id="optimize-new"
							variant="outline"
							onClick={handleNewOptimization}
							className="gap-s-200"
						>
							<RotateCcw className="h-4 w-4" />
							{t("wizard.newOptimization")}
						</Button>
					)}
				</div>
			</div>
		</div>
	)
}

export { OptimizeContent }
