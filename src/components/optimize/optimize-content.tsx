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
	GitCompare as ScatterIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { fetchBacktestData } from "@/app/actions/backtest"
import { runBacktest, getEngineVersionForRecipe } from "@/lib/backtest/engine"
import { orbPresets } from "@/lib/backtest/presets/orb-presets"
// DEZK strategy archived 2026-05-29 — see dezk-presets.ts header. Not in UI.
import {
	hawksPresets,
	hawksV0,
	hawksUserCatalog,
} from "@/lib/backtest/presets/hawks-presets"
import {
	generateRecipeGrid,
	countCombinations,
	MAX_COMBINATIONS,
} from "@/lib/optimize/parameter-grid"
import { runSweep } from "@/lib/optimize/sweep-runner"
import { listBundledCatalogs } from "@/app/actions/user-catalog-bundles"
import { formatLocalYMD, parseLocalYMD } from "@/lib/backtest/time-utils"
import { OrbEntrySection } from "@/components/backtest/sections/orb-entry-section"
// DEZK archived: DezkEntrySection import removed from UI (strategy hidden from selectors)
import { HawksEntrySection } from "@/components/backtest/sections/hawks-entry-section"
import { UserCatalogEntrySection } from "@/components/backtest/sections/user-catalog-entry-section"
import { StopProtectionSection } from "@/components/backtest/sections/stop-protection-section"
import { TargetsExitSection } from "@/components/backtest/sections/targets-exit-section"
import { SizingExecutionSection } from "@/components/backtest/sections/sizing-execution-section"
import { RunsComparisonTable } from "./runs-comparison-table"
import { EquityOverlayChart } from "./equity-overlay-chart"
import { RunDetailPanel } from "./run-detail-panel"
import { SweepConfigPanel } from "./sweep-config-panel"
import { SweptPathsProvider } from "./swept-paths-context"
import { HawksSweepBuilder } from "./hawks-sweep-builder"
import { OrbSweepBuilder } from "./orb-sweep-builder"
import { OPTIMIZE_INLINE_SWEEP_HAWKS_ENABLED } from "@/lib/optimize/feature-flags"
import {
	HAWKS_LEAVES,
	HAWKS_VALIDATORS,
} from "@/lib/backtest/presets/hawks-leaves"
import { ORB_LEAVES, ORB_VALIDATORS } from "@/lib/backtest/presets/orb-leaves"
import type {
	LeafGroupValidator,
	LeafSelection,
	PrimitiveValue,
	SweepableLeaf,
} from "@/lib/optimize/sweep-leaf"
import {
	generateConditionalGrid,
	countConditionalGrid,
} from "@/lib/optimize/grid-conditional"
import { deriveInitialSelections } from "@/lib/optimize/recipe-to-selections"
import { recipeFromCombo } from "@/lib/optimize/recipe-from-combo"
import { buildKParentNeighborhood } from "@/lib/optimize/refine-neighborhood"
import { mintJourneyId, backfillJourneyId } from "@/lib/optimize/journey"
import { useHeroPresets } from "@/lib/optimize/use-hero-presets"
import { FreezeHeroModal } from "./freeze-hero-modal"
import { LoserPatternInspector } from "./loser-pattern-inspector"
import { SweepProgressBar } from "./sweep-progress-bar"
import { ParameterHeatmap } from "./parameter-heatmap"
import { ParetoScatter } from "./pareto-scatter"
import { WizardStepper } from "./wizard-stepper"
import { SummaryCards } from "./summary-cards"
import { SweepAxisDiagnostics } from "./sweep-axis-diagnostics"
import { loadRuns, saveRuns, clearRuns } from "@/lib/optimize/storage"
import type { DateRange } from "react-day-picker"
import type { DataSourceInfo, CandleRow } from "@/types/candle"
import type {
	StrategyRecipe,
	AssetConfig,
	OptimizationRun,
	UserEntry,
} from "@/types/backtest"
import type { ParameterRange } from "@/lib/optimize/parameter-grid"
import type { SweepHandle } from "@/lib/optimize/sweep-runner"
import type { WizardStepDef } from "./wizard-stepper"

const ALL_PRESETS = [...orbPresets, ...hawksPresets]

/**
 * Build the per-path fallback map the conditional-grid generator needs when
 * a leaf isn't actively sweepable under the current selections (its parent's
 * condition is unmet). We use each leaf's own fixed value as the fallback —
 * the conditional grid will only consult the fallback for inactive branches.
 */
const buildLeafFallback = (
	selections: Map<string, LeafSelection>
): Map<string, PrimitiveValue> => {
	const fallback = new Map<string, PrimitiveValue>()
	for (const [path, sel] of selections) {
		if (sel.kind === "fixed") {
			fallback.set(path, sel.value)
		}
	}
	return fallback
}

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
	const catalogRef = useRef<UserEntry[] | undefined>(undefined)
	const [candleCount, setCandleCount] = useState(0)
	const [isLoadingData, setIsLoadingData] = useState(false)

	// ── Config state ──────────────────────────────────────────────
	const [recipe, setRecipe] = useState<StrategyRecipe>(orbPresets[0])
	const [selectedSourceIndex, setSelectedSourceIndex] = useState(0)
	const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
	const [quickRangeKey, setQuickRangeKey] = useState("")

	// ── Base config disclosure ────────────────────────────────────
	const [baseConfigOpen, setBaseConfigOpen] = useState(false)

	// ── Walk-forward config ────────────────────────────────────────
	const [walkForwardConfig, setWalkForwardConfig] = useState<{
		enabled: boolean
		inSamplePct: number
	} | null>(null)

	// ── Sweep state ───────────────────────────────────────────────
	const [activeRanges, setActiveRanges] = useState<ParameterRange[]>([])
	// Phase B inline-sweep state (Hawks only, behind feature flag).
	// `null` until the user lands on the parameters step with Hawks selected;
	// derived from recipe baseline on first show.
	const [leafSelections, setLeafSelections] = useState<Map<
		string,
		LeafSelection
	> | null>(null)
	// Strategy-aware inline-sweep config. Returns the leaves + validators
	// the new sweep-builder system should use for the current recipe, or
	// `null` when the strategy still routes through the legacy panel.
	const inlineSweepBundle = useMemo<{
		leaves: SweepableLeaf[]
		validators: LeafGroupValidator[]
		strategyKey: "hawks" | "orb"
	} | null>(() => {
		if (
			OPTIMIZE_INLINE_SWEEP_HAWKS_ENABLED &&
			recipe.entry.type === "hawks_triple_screen"
		) {
			return {
				leaves: HAWKS_LEAVES,
				validators: HAWKS_VALIDATORS,
				strategyKey: "hawks",
			}
		}
		if (recipe.entry.type === "orb_breakout") {
			return {
				leaves: ORB_LEAVES,
				validators: ORB_VALIDATORS,
				strategyKey: "orb",
			}
		}
		return null
	}, [recipe.entry.type])
	const isInlineSweepMode = inlineSweepBundle !== null
	const [isSweeping, setIsSweeping] = useState(false)
	const [sweepProgress, setSweepProgress] = useState({ current: 0, total: 0 })
	const sweepHandleRef = useRef<SweepHandle | null>(null)
	const sweepProgressRef = useRef(sweepProgress)
	sweepProgressRef.current = sweepProgress

	// ── Runs state ────────────────────────────────────────────────
	const [runs, setRuns] = useState<OptimizationRun[]>([])
	const [expandedRunId, setExpandedRunId] = useState<string | null>(null)
	const [robustFilterEnabled, setRobustFilterEnabled] = useState(false)
	// Funnel state — set when the user clicks "Breed selected" on the Pareto scatter.
	// `null` = ad-hoc sweep (no journey). Cleared on sweep completion.
	const [refineState, setRefineState] = useState<{
		journeyId: string
		parentRunIds: string[]
	} | null>(null)
	// Hero-freeze modal — set to a run id when the user clicks "Freeze as hero preset".
	const [freezeRunId, setFreezeRunId] = useState<string | null>(null)
	const heroPresets = useHeroPresets()
	const mergedPresets = useMemo<StrategyRecipe[]>(
		() => [...ALL_PRESETS, ...heroPresets.map((h) => h.recipe)],
		[heroPresets]
	)
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

	// Seed leaf selections from the recipe baseline the first time the
	// user lands on the inline-Hawks flow. Re-derive when the recipe
	// preset itself changes (entry type swap, preset reload).
	useEffect(() => {
		if (!inlineSweepBundle) {
			if (leafSelections !== null) {
				setLeafSelections(null)
			}
			return
		}
		if (leafSelections === null) {
			setLeafSelections(
				deriveInitialSelections(inlineSweepBundle.leaves, recipe)
			)
		}
	}, [inlineSweepBundle, recipe, leafSelections])

	const selectedSource = dataSources[selectedSourceIndex]
	const dateFrom = dateRange?.from
		? dateRange.from.toISOString().slice(0, 10)
		: ""
	const dateTo = dateRange?.to ? dateRange.to.toISOString().slice(0, 10) : ""
	const hasData = candleCount > 0

	// In user_catalog mode the catalog IS canonical: range, asset, and the
	// preset (only one variant) are derived from the catalog itself. Mirror
	// the backtest page's UX — auto-load the all-days bundle on entry, pin
	// the date range to the catalog span, and hide the manual selectors.
	const isUserCatalog = recipe.entry.type === "user_catalog"

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
	}, [recipe.entry, dateRange?.from, dateRange?.to])

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
		const source = mergedPresets[index]
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
		} else if (type === "hawks_triple_screen") {
			setRecipe(hawksV0)
		} else if (type === "user_catalog") {
			setRecipe(hawksUserCatalog)
		}
		// `macd_wma_alignment` (DEZK) is archived — not selectable from UI.
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

	const handleRunSweep = useCallback(async () => {
		if (!hasData || !assetConfigRef.current) {
			showToast("error", t("dataRequired"))
			return
		}

		// Branch: inline Hawks mode uses conditional-grid generation; legacy
		// mode uses the flat parameter-range grid. They produce the same
		// downstream shape — `StrategyRecipe[]` — so `runSweep(...)` is shared.
		const useInlineGrid = inlineSweepBundle !== null && leafSelections !== null

		if (!useInlineGrid && activeRanges.length === 0) {
			showToast("error", t("noParamsSelected"))
			return
		}

		const totalCombos = useInlineGrid
			? countConditionalGrid(
					inlineSweepBundle!.leaves,
					leafSelections!,
					buildLeafFallback(leafSelections!),
					inlineSweepBundle!.validators
				)
			: countCombinations(activeRanges, recipe)
		if (totalCombos > MAX_COMBINATIONS) {
			showToast(
				"error",
				t("sweepOverLimit", { max: MAX_COMBINATIONS.toLocaleString() })
			)
			return
		}

		// Load catalog for Hawks strategy
		if (recipe.entry.type === "hawks_triple_screen" && !catalogRef.current) {
			const bundles = await listBundledCatalogs()
			const allBundle = bundles.find((b) => b.key === "all")
			if (allBundle) {
				catalogRef.current = allBundle.catalog
			}
		}

		const recipes = useInlineGrid
			? generateConditionalGrid(
					inlineSweepBundle!.leaves,
					leafSelections!,
					buildLeafFallback(leafSelections!),
					inlineSweepBundle!.validators
				).map((combo) => recipeFromCombo(recipe, combo))
			: generateRecipeGrid(recipe, activeRanges)
		setIsSweeping(true)
		setSweepProgress({ current: 0, total: recipes.length })

		const sweepRuns: OptimizationRun[] = []

		const handle = runSweep(
			candlesRef.current,
			assetConfigRef.current,
			recipes,
			{
				dateFrom,
				dateTo,
				engineVersion: getEngineVersionForRecipe(recipe) ?? "unknown",
				walkForward: walkForwardConfig?.enabled
					? { inSamplePct: walkForwardConfig.inSamplePct / 100 }
					: undefined,
				referenceCatalog:
					recipe.entry.type === "hawks_triple_screen"
						? catalogRef.current
						: undefined,
				funnelStage: refineState ? "refine" : undefined,
				parentRunIds: refineState?.parentRunIds,
				journeyId: refineState?.journeyId,
			},
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
					setRefineState(null)
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
	}, [
		hasData,
		recipe,
		activeRanges,
		inlineSweepBundle,
		leafSelections,
		dateFrom,
		dateTo,
		walkForwardConfig,
		showToast,
		t,
	])

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

	const handleBreedSelected = useCallback(
		(parentRunIds: string[]) => {
			if (!inlineSweepBundle || parentRunIds.length === 0) {
				return
			}
			const parents = runs.filter((r) => parentRunIds.includes(r.id))
			if (parents.length === 0) {
				return
			}
			const existingJourneyId = parents.find((p) => p.provenance?.journeyId)
				?.provenance?.journeyId
			const journeyId = existingJourneyId ?? mintJourneyId()
			if (!existingJourneyId) {
				setRuns((prev) => backfillJourneyId(prev, parentRunIds, journeyId))
			}
			const neighborhood = buildKParentNeighborhood(
				inlineSweepBundle.leaves,
				parents.map((p) => p.recipe)
			)
			setLeafSelections(neighborhood)
			setRefineState({ journeyId, parentRunIds })
			setStep("parameters")
			showToast("success", t("funnel.breedRunCount", { count: parents.length }))
		},
		[inlineSweepBundle, runs, showToast, t]
	)

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
	const totalCombinations = useMemo(() => {
		if (inlineSweepBundle && leafSelections !== null) {
			return countConditionalGrid(
				inlineSweepBundle.leaves,
				leafSelections,
				buildLeafFallback(leafSelections),
				inlineSweepBundle.validators
			)
		}
		return activeRanges.length > 0 ? countCombinations(activeRanges, recipe) : 0
	}, [inlineSweepBundle, leafSelections, activeRanges, recipe])

	// ── Render ────────────────────────────────────────────────────

	return (
		<div className="p-m-400 sm:p-m-500 lg:p-m-600 space-y-m-500 container mx-auto max-w-screen-2xl">
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
						{/* Load Preset — lead selector. Picking a user_catalog preset
						    blocks every other Setup field; catalog is canonical. */}
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
									{mergedPresets.map((preset, i) => {
										const isHero = i >= ALL_PRESETS.length
										const heroIdx = i - ALL_PRESETS.length
										const heroPreset = isHero ? heroPresets[heroIdx] : null
										const currentEngine =
											heroPreset && getEngineVersionForRecipe(heroPreset.recipe)
										const isStale =
											heroPreset &&
											currentEngine &&
											currentEngine !== heroPreset.engineVersion
										return (
											<SelectItem
												key={`${preset.entry.type}-${i}`}
												value={String(i)}
											>
												<span className="gap-s-200 flex items-center">
													<span>{preset.displayName}</span>
													{heroPreset && (
														<span className="text-tiny text-trade-buy">★</span>
													)}
													{isStale && (
														<span
															className="text-tiny text-warning border-warning rounded-sm border px-1"
															title={t("freezeHero.staleTooltip", {
																frozen: heroPreset.engineVersion,
																current: currentEngine ?? "unknown",
															})}
														>
															{t("freezeHero.staleChip")}
														</span>
													)}
												</span>
											</SelectItem>
										)
									})}
								</SelectContent>
							</Select>
						</div>

						{/* Strategy — hidden in user_catalog mode (catalog implies it). */}
						{!isUserCatalog && (
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
										{/* DEZK (macd_wma_alignment) archived 2026-05-29 — hidden from UI. */}
										<SelectItem value="hawks_triple_screen">
											{tBacktest("hawks.name")}
										</SelectItem>
										<SelectItem value="user_catalog">
											{tBacktest("userCatalog.name")}
										</SelectItem>
									</SelectContent>
								</Select>
							</div>
						)}

						{/* Asset + Timeframe — hidden in user_catalog mode (the
						    asset/timeframe is implied by the catalog's brick indices). */}
						{!isUserCatalog && (
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
						)}

						{/* Date Range — hidden in user_catalog mode (the catalog's own
						    date list IS the range; to exclude dates, edit the JSON). */}
						{!isUserCatalog && (
							<div className="space-y-s-200">
								<label
									htmlFor="optimize-quick-range"
									className="text-small text-txt-200 font-medium"
								>
									{tBacktest("config.dateRange")}
								</label>
								<Select value={quickRangeKey} onValueChange={handleQuickRange}>
									<SelectTrigger id="optimize-quick-range">
										<SelectValue
											placeholder={tBacktest("builder.quickRange")}
										/>
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
						)}

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
							<Database className="h-4 w-4" aria-hidden="true" />
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

						{inlineSweepBundle && leafSelections !== null ? (
							inlineSweepBundle.strategyKey === "hawks" ? (
								<HawksSweepBuilder
									selections={leafSelections}
									onSelectionsChange={setLeafSelections}
									walkForwardConfig={walkForwardConfig}
									onWalkForwardChange={setWalkForwardConfig}
									onReset={() =>
										setLeafSelections(
											deriveInitialSelections(inlineSweepBundle.leaves, recipe)
										)
									}
								/>
							) : (
								<OrbSweepBuilder
									selections={leafSelections}
									onSelectionsChange={setLeafSelections}
									walkForwardConfig={walkForwardConfig}
									onWalkForwardChange={setWalkForwardConfig}
									onReset={() =>
										setLeafSelections(
											deriveInitialSelections(inlineSweepBundle.leaves, recipe)
										)
									}
								/>
							)
						) : (
							<SweepConfigPanel
								recipe={recipe}
								activeRanges={activeRanges}
								onRangesChange={setActiveRanges}
								walkForwardConfig={walkForwardConfig}
								onWalkForwardChange={setWalkForwardConfig}
							/>
						)}

						{/* Collapsible base configuration for non-sweepable params. */}
						{/* Inline-Hawks mode hides this entirely — the sweep builder is */}
						{/* the single source of truth for every recipe field. */}
						{!(isInlineSweepMode && leafSelections !== null) && (
							<div className="border-bg-300 rounded-lg border">
								<button
									type="button"
									onClick={() => setBaseConfigOpen((prev) => !prev)}
									className="hover:bg-bg-300/50 px-m-400 py-s-300 flex w-full items-center justify-between transition-colors"
									aria-expanded={baseConfigOpen}
									aria-controls="base-config-panel"
								>
									<span className="text-small gap-s-200 text-txt-200 flex items-center font-medium">
										<Settings2 className="h-4 w-4" aria-hidden="true" />
										{t("baseConfig")}
									</span>
									<ChevronDown
										className={cn(
											"text-txt-300 h-4 w-4 transition-transform",
											baseConfigOpen && "rotate-180"
										)}
										aria-hidden="true"
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
										<SweptPathsProvider activeRanges={activeRanges}>
											<div className="gap-m-400 grid grid-cols-1 lg:grid-cols-2">
												{recipe.entry.type === "orb_breakout" && (
													<OrbEntrySection
														recipe={recipe}
														onRecipeChange={setRecipe}
													/>
												)}
												{/* DEZK archived: macd_wma_alignment branch removed (strategy hidden from UI) */}
												{recipe.entry.type === "hawks_triple_screen" && (
													<HawksEntrySection
														recipe={recipe}
														onRecipeChange={setRecipe}
													/>
												)}
												{recipe.entry.type === "user_catalog" && (
													<UserCatalogEntrySection
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
										</SweptPathsProvider>
									</div>
								)}
							</div>
						)}

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

						{/* Run Sweep button. In inline-Hawks mode the builder always
						    yields at least 1 combination (every leaf has a fixed default),
						    so we don't gate on activeRanges. */}
						{!isSweeping && (
							<Button
								id="optimize-sweep"
								onClick={handleRunSweep}
								disabled={
									!hasData ||
									(isInlineSweepMode && leafSelections !== null
										? totalCombinations === 0
										: activeRanges.length === 0)
								}
								size="lg"
								className="gap-s-200 w-full"
							>
								<Play className="h-4 w-4" aria-hidden="true" />
								{t("runSweep")}
							</Button>
						)}
					</div>

					{/* Summary sidebar — sticky on lg+ so the combinations counter stays
					    visible while the user scrolls the long sweep builder. `self-start`
					    overrides the grid's default `align-items: stretch` which would
					    otherwise grow the card to the full column height and defeat
					    `position: sticky`. */}
					<div className="border-bg-300 bg-bg-200 space-y-s-300 p-m-400 lg:top-m-400 h-fit rounded-lg border lg:sticky lg:self-start">
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
									{t("summary.paramsSelected", {
										count:
											isInlineSweepMode && leafSelections !== null
												? Array.from(leafSelections.values()).filter(
														(s) => s.kind !== "fixed"
													).length
												: activeRanges.length,
									})}
								</span>
							</div>
							<div className="flex justify-between">
								<span
									className={`font-semibold tabular-nums ${totalCombinations > MAX_COMBINATIONS ? "text-fb-error" : "text-txt-100"}`}
								>
									{t("summary.combinations", {
										count: totalCombinations.toLocaleString(),
									})}
								</span>
							</div>
							{isInlineSweepMode &&
								inlineSweepBundle &&
								leafSelections !== null && (
									<SweepAxisDiagnostics
										leaves={inlineSweepBundle.leaves}
										selections={leafSelections}
									/>
								)}
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
											<BarChart3 className="h-4 w-4" aria-hidden="true" />
											{t("resultsTab.chart")}
										</TabsTrigger>
										<TabsTrigger value="table" className="gap-s-200">
											<Table2 className="h-4 w-4" aria-hidden="true" />
											{t("resultsTab.table")}
										</TabsTrigger>
										<TabsTrigger value="pareto" className="gap-s-200">
											<ScatterIcon className="h-4 w-4" aria-hidden="true" />
											{t("pareto.tabLabel")}
										</TabsTrigger>
										<TabsTrigger value="drivers" className="gap-s-200">
											<ScatterIcon className="h-4 w-4" aria-hidden="true" />
											{t("loserPattern.tabLabel")}
										</TabsTrigger>
									</TabsList>

									<Button
										id="optimize-clear-all"
										variant="ghost"
										size="sm"
										onClick={handleClearAll}
										className="text-txt-300 hover:text-fb-error gap-s-200"
									>
										<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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

								{/* Pareto tab: PF × Drawdown frontier */}
								<TabsContent value="pareto" className="mt-m-400">
									<ParetoScatter
										runs={runs}
										onPointClick={handleToggleExpand}
										onBreedSelected={
											inlineSweepBundle ? handleBreedSelected : undefined
										}
									/>
								</TabsContent>

								{/* Drivers tab: loser pattern mining */}
								<TabsContent value="drivers" className="mt-m-400">
									<LoserPatternInspector runs={runs} />
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
											robustFilterEnabled={robustFilterEnabled}
											onRobustFilterChange={setRobustFilterEnabled}
										/>
									</div>
								</TabsContent>
							</Tabs>

							{/* Expanded run detail */}
							{expandedRun && (
								<>
									<div className="gap-s-200 mt-s-200 flex items-center justify-end">
										<Button
											id={`freeze-cta-${expandedRun.id}`}
											variant="outline"
											size="sm"
											onClick={() => setFreezeRunId(expandedRun.id)}
										>
											{t("freezeHero.openCta")}
										</Button>
									</div>
									<RunDetailPanel
										run={expandedRun}
										onRecomputeTrades={handleRecomputeTrades}
									/>
								</>
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
							<ArrowLeft className="h-4 w-4" aria-hidden="true" />
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
							<ArrowRight className="h-4 w-4" aria-hidden="true" />
						</Button>
					)}

					{step === "results" && (
						<Button
							id="optimize-new"
							variant="outline"
							onClick={handleNewOptimization}
							className="gap-s-200"
						>
							<RotateCcw className="h-4 w-4" aria-hidden="true" />
							{t("wizard.newOptimization")}
						</Button>
					)}
				</div>
			</div>

			<FreezeHeroModal
				open={freezeRunId !== null}
				onOpenChange={(o) => {
					if (!o) {
						setFreezeRunId(null)
					}
				}}
				run={runs.find((r) => r.id === freezeRunId) ?? null}
				sourcePresetId={
					(runs.find((r) => r.id === freezeRunId)?.recipe.entry.type ===
					"hawks_triple_screen"
						? "hawks_v0"
						: runs.find((r) => r.id === freezeRunId)?.recipe.entry.type ===
							  "orb_breakout"
							? "orb_v0"
							: "custom") as string
				}
				onFrozen={(preset) => {
					showToast(
						"success",
						t("freezeHero.frozenToast", { id: preset.presetId })
					)
				}}
			/>
		</div>
	)
}

export { OptimizeContent }
