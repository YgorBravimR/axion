"use client"

import { useState, useCallback, useEffect, useRef, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
	AlertDialog,
	AlertDialogTrigger,
	AlertDialogContent,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogAction,
	AlertDialogCancel,
} from "@/components/ui/alert-dialog"
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
	Sparkles,
	X,
	Download,
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
	countConditionalGridBreakdown,
	type GridCountBreakdown,
} from "@/lib/optimize/grid-conditional"
import { deriveInitialSelections } from "@/lib/optimize/recipe-to-selections"
import { recipeFromCombo } from "@/lib/optimize/recipe-from-combo"
import { dedupeRecipes } from "@/lib/optimize/recipe-dedup"
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
import { exportRunsAsJson, exportRunsAsCsv } from "@/lib/optimize/export-runs"
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
	// Default to Hawks v0 — it's the active strategy focus and matches the
	// backtest page's typical entry point. Users can still switch to ORB or
	// user_catalog via the Strategy selector in Setup.
	const [recipe, setRecipe] = useState<StrategyRecipe>(hawksV0)
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
		if (recipe.entry.type === "hawks_triple_screen") {
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
	// Bulk multi-select state for the runs comparison table. The dialog flag
	// is separate so the count badge stays visible after dismiss-without-action.
	const [selectedRunIds, setSelectedRunIds] = useState<Set<string>>(
		() => new Set()
	)
	const [robustFilterEnabled, setRobustFilterEnabled] = useState(false)
	// Funnel state — set when the user clicks "Breed selected" on the Pareto scatter.
	// `null` = ad-hoc sweep (no journey). Cleared on sweep completion.
	const [refineState, setRefineState] = useState<{
		journeyId: string
		parentRunIds: string[]
	} | null>(null)
	// Hero-freeze modal — set to a run id when the user clicks "Freeze as hero preset".
	const [freezeRunId, setFreezeRunId] = useState<string | null>(null)
	// Results-step tab selection. Controlled so the post-refine hint can
	// navigate to the Pareto tab when the user clicks "Iterate".
	const [resultsTab, setResultsTab] = useState<string>("chart")
	// Dismissible hint shown when refine runs exist. Session-scoped — comes
	// back on reload by design, since each refine wave should re-prompt the
	// "what's next?" decision.
	const [postRefineHintHidden, setPostRefineHintHidden] = useState(false)
	const heroPresets = useHeroPresets()
	const mergedPresets = useMemo<StrategyRecipe[]>(
		() => [...ALL_PRESETS, ...heroPresets.map((h) => h.recipe)],
		[heroPresets]
	)
	const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined
	)

	// Hydrate from IndexedDB on mount. When stored runs exist, jump straight
	// to the results step — landing on "setup" with prior runs hidden behind
	// two nav clicks felt like fresh-app every reload.
	useEffect(() => {
		let cancelled = false
		void loadRuns().then((stored) => {
			if (!cancelled && stored.length > 0) {
				setRuns(stored)
				setStep("results")
			}
		})
		return () => {
			cancelled = true
		}
	}, [])

	// Persist to IndexedDB on change — debounced 1s
	useEffect(() => {
		if (runs.length > 0) {
			clearTimeout(saveTimeoutRef.current)
			saveTimeoutRef.current = setTimeout(() => {
				void saveRuns(runs)
			}, 1000)
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
		// Force the inline sweep builder to re-derive its selections from the
		// new recipe. Without this, the builder keeps showing the previous
		// preset's leaf values (e.g. ORB stop/target after switching to Hawks).
		setLeafSelections(null)
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
		// Same reason as handlePresetChange — re-derive selections from the
		// new strategy's recipe so the inline builder reflects the swap.
		setLeafSelections(null)
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

		const rawRecipes = useInlineGrid
			? generateConditionalGrid(
					inlineSweepBundle!.leaves,
					leafSelections!,
					buildLeafFallback(leafSelections!),
					inlineSweepBundle!.validators
				).map((combo) => recipeFromCombo(recipe, combo))
			: generateRecipeGrid(recipe, activeRanges)

		// Drop structurally identical recipes before dispatch — K-parent
		// refine neighborhoods routinely emit 100+ duplicates from degenerate
		// axes, which the engine would otherwise re-run for no new signal.
		const { unique: recipes, droppedCount } = dedupeRecipes(rawRecipes)
		if (droppedCount > 0) {
			showToast(
				"info",
				t("recipesDeduped", { dropped: droppedCount, total: rawRecipes.length })
			)
		}

		setIsSweeping(true)
		setSweepProgress({ current: 0, total: recipes.length })

		const sweepRuns: OptimizationRun[] = []

		// Seed the per-stage label counter from the highest existing #N for
		// this stage so the new sweep continues the numbering instead of
		// restarting at #1 and producing dupes.
		const stagePrefix = refineState ? "Refine" : "Broad"
		const labelPattern = new RegExp(`^${stagePrefix} #(\\d+)$`)
		const initialRunCounter = runs.reduce((max, r) => {
			const match = labelPattern.exec(r.label)
			if (!match) {
				return max
			}
			const n = Number(match[1])
			return n > max ? n : max
		}, 0)

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
				// Always stamp a stage — `undefined` would render as "ad-hoc"
				// in the table, which the user reads as "untagged noise" and
				// fails to distinguish from refined runs. Broad is the
				// explicit default; refine fires only when a Pareto multi-
				// select breeds new selections.
				funnelStage: refineState ? "refine" : "broad",
				parentRunIds: refineState?.parentRunIds,
				journeyId: refineState?.journeyId,
				initialRunCounter,
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
		refineState,
		runs,
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

	// Row trash button: delete immediately and surface an undo toast.
	// The toast's 5s window is the recovery window; on Undo we splice the
	// run back at its original index so order is preserved.
	const handleDeleteRun = useCallback(
		(runId: string) => {
			const index = runs.findIndex((run) => run.id === runId)
			if (index === -1) {
				return
			}
			const removedRun = runs[index]
			if (removedRun === undefined) {
				return
			}
			setRuns((prev) => prev.filter((run) => run.id !== runId))
			if (expandedRunId === runId) {
				setExpandedRunId(null)
			}
			showToast("info", t("runDeletedToast", { label: removedRun.label }), {
				label: t("undo"),
				onClick: () => {
					setRuns((prev) => {
						const next = [...prev]
						next.splice(index, 0, removedRun)
						return next
					})
				},
			})
		},
		[runs, expandedRunId, showToast, t]
	)

	// Multi-select handlers for the runs table.
	const handleToggleSelect = useCallback((runId: string) => {
		setSelectedRunIds((prev) => {
			const next = new Set(prev)
			if (next.has(runId)) {
				next.delete(runId)
			} else {
				next.add(runId)
			}
			return next
		})
	}, [])

	// "Select all" target = the ids the table currently shows (post robust
	// filter). If all visible are already selected, deselect them; otherwise
	// select them. Other-page selections (visible-vs-stored) survive — the
	// set is the union of selections across operations.
	const handleSelectAll = useCallback((visibleRunIds: string[]) => {
		setSelectedRunIds((prev) => {
			const allChecked = visibleRunIds.every((id) => prev.has(id))
			const next = new Set(prev)
			for (const id of visibleRunIds) {
				if (allChecked) {
					next.delete(id)
				} else {
					next.add(id)
				}
			}
			return next
		})
	}, [])

	const handleClearSelection = useCallback(() => {
		setSelectedRunIds(new Set())
	}, [])

	// Bulk delete: capture each removed run + its original index, delete
	// immediately, and surface an undo toast. Restoration order is ascending
	// by index — when each splice runs, all earlier-indexed restorations are
	// already back in place, so the captured indices line up exactly.
	const handleBulkDelete = useCallback(() => {
		if (selectedRunIds.size === 0) {
			return
		}
		const removed: Array<{ run: OptimizationRun; index: number }> = []
		for (const [index, run] of runs.entries()) {
			if (selectedRunIds.has(run.id)) {
				removed.push({ run, index })
			}
		}
		if (removed.length === 0) {
			return
		}
		const selectedSnapshot = selectedRunIds
		setRuns((prev) => prev.filter((r) => !selectedSnapshot.has(r.id)))
		if (expandedRunId !== null && selectedSnapshot.has(expandedRunId)) {
			setExpandedRunId(null)
		}
		setSelectedRunIds(new Set())
		showToast("info", t("bulkRunsDeletedToast", { count: removed.length }), {
			label: t("undo"),
			onClick: () => {
				setRuns((prev) => {
					const next = [...prev]
					for (const { run, index } of removed) {
						next.splice(index, 0, run)
					}
					return next
				})
			},
		})
	}, [runs, selectedRunIds, expandedRunId, showToast, t])

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

	const handleApplyDriverRecommendation = useCallback(
		(leafPath: string, value: unknown) => {
			if (!inlineSweepBundle || !leafSelections) {
				return
			}
			const next = new Map(leafSelections)
			next.set(leafPath, { kind: "fixed", value: value as never })
			setLeafSelections(next)
		},
		[inlineSweepBundle, leafSelections]
	)

	const handleClearAll = useCallback(() => {
		setRuns([])
		void clearRuns()
		setExpandedRunId(null)
		// Mirror the hydrate-to-results symmetry: zero runs → land back on
		// setup so the user isn't stranded staring at an empty results card.
		setStep("setup")
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
	const cardinalityBreakdown = useMemo<GridCountBreakdown | null>(() => {
		if (!inlineSweepBundle || leafSelections === null) {
			return null
		}
		return countConditionalGridBreakdown(
			inlineSweepBundle.leaves,
			leafSelections,
			buildLeafFallback(leafSelections),
			inlineSweepBundle.validators
		)
	}, [inlineSweepBundle, leafSelections])

	/**
	 * Post-refine hint state — derive the best refine-stage run (highest
	 * profitFactor) so the hint's "Freeze winner" CTA can target it. The
	 * hint surfaces whenever any refine run exists; it's dismissible per
	 * session via `postRefineHintHidden`.
	 */
	const bestRefineRun = useMemo<OptimizationRun | null>(() => {
		const refineRuns = runs.filter((r) => r.provenance?.stage === "refine")
		if (refineRuns.length === 0) {
			return null
		}
		return refineRuns.reduce((best, r) =>
			r.summary.profitFactor > best.summary.profitFactor ? r : best
		)
	}, [runs])

	const totalCombinations = useMemo(() => {
		if (cardinalityBreakdown !== null) {
			return cardinalityBreakdown.valid
		}
		return activeRanges.length > 0 ? countCombinations(activeRanges, recipe) : 0
	}, [cardinalityBreakdown, activeRanges, recipe])

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
											<SelectItem key={`${preset.presetId}`} value={String(i)}>
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
																current: currentEngine,
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

						{refineState && inlineSweepBundle && (
							<div
								id="refine-banner"
								className="border-trade-buy/40 bg-trade-buy/5 gap-s-300 p-s-300 flex items-start rounded-md border"
							>
								<Sparkles
									className="text-trade-buy mt-s-100 h-4 w-4 shrink-0"
									aria-hidden="true"
								/>
								<div className="space-y-s-100 flex-1">
									<p className="text-small text-txt-100 font-medium">
										{t("funnel.refineBannerTitle", {
											parents: refineState.parentRunIds.length,
											combos: cardinalityBreakdown?.valid ?? 0,
										})}
									</p>
									<p className="text-tiny text-txt-300">
										{t("funnel.refineBannerHint")}
									</p>
								</div>
								<button
									id="refine-banner-clear"
									type="button"
									onClick={() => {
										setRefineState(null)
										setLeafSelections(
											deriveInitialSelections(inlineSweepBundle.leaves, recipe)
										)
									}}
									className="text-txt-300 hover:text-txt-100 gap-s-100 text-tiny flex shrink-0 items-center transition-colors"
									aria-label={t("funnel.refineBannerExitAria")}
								>
									<X className="h-3 w-3" aria-hidden="true" />
									{t("funnel.refineBannerExit")}
								</button>
							</div>
						)}

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
							{isInlineSweepMode && leafSelections !== null && (
								<SweepAxisDiagnostics
									leaves={inlineSweepBundle.leaves}
									selections={leafSelections}
									breakdown={cardinalityBreakdown ?? undefined}
									validators={inlineSweepBundle.validators}
									onSelectionsChange={setLeafSelections}
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

							{bestRefineRun && !postRefineHintHidden && (
								<div
									id="post-refine-hint"
									className="border-acc-100/40 bg-acc-100/5 gap-s-300 p-s-300 flex items-start rounded-md border"
								>
									<Sparkles
										className="text-acc-100 mt-s-100 h-4 w-4 shrink-0"
										aria-hidden="true"
									/>
									<div className="space-y-s-200 flex-1">
										<div className="space-y-s-100">
											<p className="text-small text-txt-100 font-medium">
												{t("postRefineHint.title")}
											</p>
											<p className="text-tiny text-txt-300">
												{t("postRefineHint.body", {
													best: bestRefineRun.label,
													pf: bestRefineRun.summary.profitFactor.toFixed(2),
												})}
											</p>
										</div>
										<div className="gap-s-200 flex flex-wrap">
											<Button
												id="post-refine-iterate"
												size="sm"
												variant="outline"
												onClick={() => setResultsTab("pareto")}
												className="gap-s-100"
											>
												<ScatterIcon className="h-3 w-3" aria-hidden="true" />
												{t("postRefineHint.iterateCta")}
											</Button>
											<Button
												id="post-refine-freeze"
												size="sm"
												variant="default"
												onClick={() => setFreezeRunId(bestRefineRun.id)}
												className="gap-s-100"
											>
												<Sparkles className="h-3 w-3" aria-hidden="true" />
												{t("postRefineHint.freezeCta")}
											</Button>
										</div>
									</div>
									<button
										id="post-refine-hint-dismiss"
										type="button"
										onClick={() => setPostRefineHintHidden(true)}
										className="text-txt-300 hover:text-txt-100 shrink-0 transition-colors"
										aria-label={t("postRefineHint.dismissAria")}
									>
										<X className="h-3 w-3" aria-hidden="true" />
									</button>
								</div>
							)}

							{/* Chart / Table tabs */}
							<Tabs value={resultsTab} onValueChange={setResultsTab}>
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

									<div className="gap-s-200 flex items-center">
										<Button
											id="optimize-export-json"
											variant="ghost"
											size="sm"
											onClick={() => exportRunsAsJson(runs)}
											disabled={runs.length === 0}
											className="text-txt-300 hover:text-txt-100 gap-s-200"
											title={t("exportJsonTitle")}
										>
											<Download className="h-3.5 w-3.5" aria-hidden="true" />
											{t("exportJson")}
										</Button>
										<Button
											id="optimize-export-csv"
											variant="ghost"
											size="sm"
											onClick={() => exportRunsAsCsv(runs)}
											disabled={runs.length === 0}
											className="text-txt-300 hover:text-txt-100 gap-s-200"
											title={t("exportCsvTitle")}
										>
											<Download className="h-3.5 w-3.5" aria-hidden="true" />
											{t("exportCsv")}
										</Button>
										<AlertDialog>
											<AlertDialogTrigger asChild>
												<Button
													id="optimize-clear-all"
													variant="ghost"
													size="sm"
													className="text-txt-300 hover:text-fb-error gap-s-200"
												>
													<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
													{t("clearAll")}
												</Button>
											</AlertDialogTrigger>
											<AlertDialogContent size="sm">
												<AlertDialogHeader>
													<AlertDialogTitle>
														{t("clearAllConfirmTitle")}
													</AlertDialogTitle>
													<AlertDialogDescription>
														{t("clearAllConfirmDescription", {
															count: runs.length,
														})}
													</AlertDialogDescription>
												</AlertDialogHeader>
												<AlertDialogFooter>
													<AlertDialogCancel id="cancel-clear-all">
														{t("clearAllConfirmCancel")}
													</AlertDialogCancel>
													<AlertDialogAction
														id="confirm-clear-all"
														onClick={handleClearAll}
														variant="destructive"
													>
														{t("clearAllConfirmAction")}
													</AlertDialogAction>
												</AlertDialogFooter>
											</AlertDialogContent>
										</AlertDialog>
									</div>
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
									<LoserPatternInspector
										runs={runs}
										onApplyRecommendation={handleApplyDriverRecommendation}
									/>
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
										{selectedRunIds.size > 0 && (
											<div
												id="bulk-action-bar"
												className="border-acc-100/40 bg-acc-100/5 gap-s-300 p-s-300 flex items-center justify-between rounded-md border"
											>
												<span className="text-small text-txt-100">
													{t("bulkSelectionCount", {
														count: selectedRunIds.size,
													})}
												</span>
												<div className="gap-s-200 flex items-center">
													<Button
														id="bulk-clear-selection"
														variant="ghost"
														size="sm"
														onClick={handleClearSelection}
													>
														{t("bulkClearSelection")}
													</Button>
													<Button
														id="bulk-delete-trigger"
														variant="ghost"
														size="sm"
														onClick={handleBulkDelete}
														className="text-fb-error gap-s-200"
													>
														<Trash2
															className="h-3.5 w-3.5"
															aria-hidden="true"
														/>
														{t("bulkDeleteSelected", {
															count: selectedRunIds.size,
														})}
													</Button>
												</div>
											</div>
										)}
										<RunsComparisonTable
											runs={runs}
											expandedRunId={expandedRunId}
											onTogglePin={handleTogglePin}
											onToggleExpand={handleToggleExpand}
											onDelete={handleDeleteRun}
											onUpdateLabel={handleUpdateLabel}
											robustFilterEnabled={robustFilterEnabled}
											onRobustFilterChange={setRobustFilterEnabled}
											selectedRunIds={selectedRunIds}
											onToggleSelect={handleToggleSelect}
											onSelectAll={handleSelectAll}
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
