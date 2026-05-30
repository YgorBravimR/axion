/**
 * MetricKey registry — Phase 1c upgrade (Pareto generalization).
 *
 * Each MetricKey describes one axis the user can select for the Pareto
 * scatter. The `direction` field tells the frontier algorithm whether
 * higher or lower values are "better" — Pareto dominance is computed
 * generically off this single property, so any pair of MetricKeys
 * produces a valid frontier without special-casing the algorithm.
 *
 * Adding a new metric: append a `MetricKeyDescriptor` to `METRIC_KEYS`.
 * Make sure its `extract` returns `null` when the input run does not
 * carry the metric (e.g. OOS metrics on legacy runs without walk-forward).
 */
import type { OptimizationRun } from "@/types/backtest"

type MetricKey =
	| "profitFactor"
	| "maxDrawdown"
	| "numTrades"
	| "assertivity"
	| "avgR"
	| "matchRate"
	| "profitFactorOOS"
	| "maxDrawdownOOS"

interface MetricKeyDescriptor {
	key: MetricKey
	/** "max" = bigger is better (PF, trades, win-rate). "min" = smaller is better (drawdown). */
	direction: "min" | "max"
	/** i18n key under `optimize.metricKeys.<labelKey>`. */
	labelKey: string
	/** Return `null` when the metric is not available on this run. */
	extract: (_run: OptimizationRun) => number | null
	/** Optional badge key under `optimize.metricKeys.<badgeKey>`. Used for the "Recommended" PF badge. */
	badgeKey?: string
}

/**
 * Normalize PF=Infinity (no losing trades) to a large finite value so
 * the comparator stays total-ordering safe. MAX_SAFE_INTEGER keeps
 * the run "best of all" on PF without poisoning math downstream.
 */
const finitePF = (pf: number): number =>
	pf === Infinity ? Number.MAX_SAFE_INTEGER : pf

const METRIC_KEYS: Record<MetricKey, MetricKeyDescriptor> = {
	profitFactor: {
		key: "profitFactor",
		direction: "max",
		labelKey: "profitFactor",
		badgeKey: "recommended",
		extract: (run) => finitePF(run.summary.profitFactor),
	},
	maxDrawdown: {
		key: "maxDrawdown",
		direction: "min",
		labelKey: "maxDrawdown",
		extract: (run) => Math.abs(run.summary.maxDrawdownCents),
	},
	numTrades: {
		key: "numTrades",
		direction: "max",
		labelKey: "numTrades",
		extract: (run) => run.summary.totalTrades,
	},
	assertivity: {
		key: "assertivity",
		direction: "max",
		labelKey: "assertivity",
		extract: (run) => run.summary.winRate,
	},
	avgR: {
		key: "avgR",
		direction: "max",
		labelKey: "avgR",
		extract: (run) => run.summary.avgRMultiple,
	},
	matchRate: {
		key: "matchRate",
		direction: "max",
		labelKey: "matchRate",
		extract: (run) =>
			typeof run.matchRate === "number" ? run.matchRate : null,
	},
	profitFactorOOS: {
		key: "profitFactorOOS",
		direction: "max",
		labelKey: "profitFactorOOS",
		extract: (run) =>
			run.summaryOOS ? finitePF(run.summaryOOS.profitFactor) : null,
	},
	maxDrawdownOOS: {
		key: "maxDrawdownOOS",
		direction: "min",
		labelKey: "maxDrawdownOOS",
		extract: (run) =>
			run.summaryOOS ? Math.abs(run.summaryOOS.maxDrawdownCents) : null,
	},
}

/** Recommended default pair. UI shows "Recommended" badge on this combination. */
const DEFAULT_PARETO_AXES: { x: MetricKey; y: MetricKey } = {
	x: "maxDrawdown",
	y: "profitFactor",
}

const isMetricKey = (value: string): value is MetricKey =>
	Object.prototype.hasOwnProperty.call(METRIC_KEYS, value)

export { METRIC_KEYS, DEFAULT_PARETO_AXES, isMetricKey }
export type { MetricKey, MetricKeyDescriptor }
