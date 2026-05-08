import {
	getSweepableParams,
	getNestedValue,
} from "@/lib/optimize/parameter-grid"
import type {
	NumericSweepableParam,
	EnumSweepableParam,
} from "@/lib/optimize/parameter-grid"
import type { OptimizationRun } from "@/types/backtest"

// ── Types ────────────────────────────────────────────────────────

type HeatmapMetric =
	| "profitFactor"
	| "sharpeRatio"
	| "winRate"
	| "totalPnlCents"
	| "maxDrawdownCents"
	| "avgRMultiple"

interface NumericVaryingParam {
	kind: "numeric"
	path: string
	labelKey: string
	values: number[]
}

interface EnumVaryingParam {
	kind: "enum"
	path: string
	labelKey: string
	values: string[]
	/** Maps raw value → i18n label key (e.g. "pct_range" → "stopType.pctRange") */
	optionLabelKeys: Record<string, string>
}

type VaryingParam = NumericVaryingParam | EnumVaryingParam

interface HeatmapCell {
	xVal: number
	yVal: number
	/** Best run for this cell by selected metric */
	run: OptimizationRun
	/** How many runs collapsed into this cell */
	count: number
	/** All runs at this coordinate */
	allRuns: OptimizationRun[]
	/** Metric value of the best run */
	metricValue: number
}

interface HeatmapData {
	xValues: number[]
	yValues: number[]
	cells: Map<string, HeatmapCell>
	minMetric: number
	maxMetric: number
}

// ── Metric center points for diverging color scale ───────────────

const METRIC_CENTERS: Record<HeatmapMetric, number | null> = {
	profitFactor: 1.0,
	sharpeRatio: 0,
	winRate: 50,
	totalPnlCents: 0,
	avgRMultiple: 0,
	maxDrawdownCents: null, // sequential scale, no center
}

// ── Metric "higher is better" direction ──────────────────────────

const METRIC_HIGHER_IS_BETTER: Record<HeatmapMetric, boolean> = {
	profitFactor: true,
	sharpeRatio: true,
	winRate: true,
	totalPnlCents: true,
	avgRMultiple: true,
	maxDrawdownCents: false, // lower absolute value is better
}

// ── Utility functions ────────────────────────────────────────────

const cellKey = (xVal: number, yVal: number): string => `${xVal}::${yVal}`

/** Extract a metric value from a run's summary */
const getMetricValue = (run: OptimizationRun, metric: HeatmapMetric): number =>
	run.summary[metric]

/** Get a string value at a dot-path (for enum params like stop.initial.type) */
const getNestedStringValue = (obj: unknown, path: string): string => {
	const keys = path.split(".")
	let current: unknown = obj
	for (const key of keys) {
		if (current == null || typeof current !== "object") {
			return "undefined"
		}
		current = (current as Record<string, unknown>)[key]
	}
	return String(current)
}

/**
 * Auto-detect which recipe params vary across a set of runs.
 * Only considers runs of the same strategy type as the first run.
 * Detects both numeric and enum (categorical) variation.
 */
const getVaryingParams = (runs: OptimizationRun[]): VaryingParam[] => {
	const [firstRun] = runs
	if (!firstRun || runs.length < 2) {
		return []
	}

	const strategyType = firstRun.recipe.entry.type
	const sameStrategyRuns = runs.filter(
		(r) => r.recipe.entry.type === strategyType
	)
	const [pivot] = sameStrategyRuns
	if (!pivot || sameStrategyRuns.length < 2) {
		return []
	}

	const catalog = getSweepableParams(pivot.recipe)

	const varying: VaryingParam[] = []
	for (const param of catalog) {
		if (param.kind === "enum") {
			// Detect categorical variation using string comparison
			const valuesSet = new Set<string>()
			for (const run of sameStrategyRuns) {
				valuesSet.add(getNestedStringValue(run.recipe, param.path))
			}
			if (valuesSet.size > 1) {
				// Build value → labelKey map from the catalog options
				const optionLabelKeys: Record<string, string> = {}
				for (const opt of param.options) {
					optionLabelKeys[opt.value] = opt.labelKey
				}
				varying.push({
					kind: "enum",
					path: param.path,
					labelKey: param.labelKey,
					values: [...valuesSet].sort(),
					optionLabelKeys,
				})
			}
		} else {
			// Existing numeric detection
			const valuesSet = new Set<number>()
			for (const run of sameStrategyRuns) {
				valuesSet.add(getNestedValue(run.recipe, param.path))
			}
			if (valuesSet.size > 1) {
				varying.push({
					kind: "numeric",
					path: param.path,
					labelKey: param.labelKey,
					values: [...valuesSet].sort((a, b) => a - b),
				})
			}
		}
	}

	return varying
}

/**
 * Build the 2D heatmap grid data from runs.
 *
 * Filters by slice values for non-displayed params, groups by (x, y),
 * and picks the best run per cell by the selected metric.
 */
const buildHeatmapData = (
	runs: OptimizationRun[],
	xPath: string,
	yPath: string,
	metric: HeatmapMetric,
	slices: Record<string, number | string>
): HeatmapData => {
	const [firstRun] = runs
	const strategyType = firstRun?.recipe.entry.type
	const higherIsBetter = METRIC_HIGHER_IS_BETTER[metric]

	// Filter to same strategy + matching slice values (supports both numeric and string)
	const filtered = runs.filter((r) => {
		if (r.recipe.entry.type !== strategyType) {
			return false
		}
		for (const [path, value] of Object.entries(slices)) {
			const actual =
				typeof value === "string"
					? getNestedStringValue(r.recipe, path)
					: getNestedValue(r.recipe, path)
			if (actual !== value) {
				return false
			}
		}
		return true
	})

	// Group by (x, y) coordinate
	const cellMap = new Map<string, HeatmapCell>()
	const xValuesSet = new Set<number>()
	const yValuesSet = new Set<number>()

	for (const run of filtered) {
		const xVal = getNestedValue(run.recipe, xPath)
		const yVal = getNestedValue(run.recipe, yPath)
		xValuesSet.add(xVal)
		yValuesSet.add(yVal)

		const key = cellKey(xVal, yVal)
		const metricVal = getMetricValue(run, metric)
		const existing = cellMap.get(key)

		if (!existing) {
			cellMap.set(key, {
				xVal,
				yVal,
				run,
				count: 1,
				allRuns: [run],
				metricValue: metricVal,
			})
		} else {
			existing.allRuns.push(run)
			existing.count++
			// Keep the best run by metric
			const isBetter = higherIsBetter
				? metricVal > existing.metricValue
				: metricVal < existing.metricValue
			if (isBetter) {
				existing.run = run
				existing.metricValue = metricVal
			}
		}
	}

	// Compute min/max metric across all cells
	let minMetric = Infinity
	let maxMetric = -Infinity
	for (const cell of cellMap.values()) {
		if (cell.metricValue < minMetric) {
			minMetric = cell.metricValue
		}
		if (cell.metricValue > maxMetric) {
			maxMetric = cell.metricValue
		}
	}

	// Handle degenerate case (all cells same value)
	if (minMetric === maxMetric) {
		minMetric -= 1
		maxMetric += 1
	}

	return {
		xValues: [...xValuesSet].sort((a, b) => a - b),
		yValues: [...yValuesSet].sort((a, b) => a - b),
		cells: cellMap,
		minMetric,
		maxMetric,
	}
}

/**
 * Get the Tailwind background class for a heatmap cell.
 *
 * Diverging metrics: positive side → bg-trade-buy, negative side → bg-trade-sell
 * Sequential metrics (maxDrawdown): always bg-trade-sell with varying opacity
 *
 * Uses 4-step discrete opacity matching the TimeHeatmap pattern.
 */
const getCellIntensityClass = (
	metricValue: number,
	min: number,
	max: number,
	metric: HeatmapMetric
): string => {
	const center = METRIC_CENTERS[metric]

	// Sequential scale for maxDrawdown (always bad, deeper = worse)
	if (center === null) {
		const absMin = Math.abs(min)
		const absMax = Math.abs(max)
		const absVal = Math.abs(metricValue)
		const range = absMax - absMin
		// Higher absolute drawdown = worse = more intense red
		const intensity = range > 0 ? (absVal - absMin) / range : 0.5

		if (intensity > 0.7) {
			return "bg-trade-sell"
		}
		if (intensity > 0.4) {
			return "bg-trade-sell/70"
		}
		if (intensity > 0.15) {
			return "bg-trade-sell/50"
		}
		return "bg-trade-sell/30"
	}

	// Diverging scale
	if (metricValue >= center) {
		// Positive side → green
		const distFromCenter = metricValue - center
		const maxDist = max - center
		const intensity = maxDist > 0 ? distFromCenter / maxDist : 0.5

		if (intensity > 0.7) {
			return "bg-trade-buy"
		}
		if (intensity > 0.4) {
			return "bg-trade-buy/70"
		}
		if (intensity > 0.15) {
			return "bg-trade-buy/50"
		}
		return "bg-trade-buy/30"
	}

	// Negative side → red
	const distFromCenter = center - metricValue
	const maxDist = center - min
	const intensity = maxDist > 0 ? distFromCenter / maxDist : 0.5

	if (intensity > 0.7) {
		return "bg-trade-sell"
	}
	if (intensity > 0.4) {
		return "bg-trade-sell/70"
	}
	if (intensity > 0.15) {
		return "bg-trade-sell/50"
	}
	return "bg-trade-sell/30"
}

// ── Exports ──────────────────────────────────────────────────────

const HEATMAP_METRICS: HeatmapMetric[] = [
	"profitFactor",
	"sharpeRatio",
	"winRate",
	"totalPnlCents",
	"maxDrawdownCents",
	"avgRMultiple",
]

export {
	getVaryingParams,
	getMetricValue,
	getNestedStringValue,
	buildHeatmapData,
	getCellIntensityClass,
	cellKey,
	HEATMAP_METRICS,
}

export type { HeatmapMetric, VaryingParam, HeatmapCell, HeatmapData }
