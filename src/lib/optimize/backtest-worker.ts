/// <reference lib="webworker" />

import { runBacktest } from "@/lib/backtest/engine"
import { splitCandles, isOosRobust } from "@/lib/optimize/robustness"
import type { CandleRow } from "@/types/candle"
import type {
	StrategyRecipe,
	AssetConfig,
	BacktestSummary,
	EquityCurvePoint,
	UserEntry,
} from "@/types/backtest"

// ── Message types ────────────────────────────────────────────────

interface StartMessage {
	type: "start"
	candles: CandleRow[]
	candles15m?: CandleRow[]
	assetConfig: AssetConfig
	recipes: StrategyRecipe[]
	walkForward?: { inSamplePct: number }
	referenceCatalog?: UserEntry[]
}

interface ProgressMessage {
	type: "progress"
	index: number
	total: number
	recipe: StrategyRecipe
	summary: BacktestSummary
	equityCurve: EquityCurvePoint[]
	trades: ReturnType<typeof runBacktest>["trades"]
	// Phase 1a walk-forward — populated only when the sweep is in IS/OOS mode.
	summaryIS?: BacktestSummary
	summaryOOS?: BacktestSummary
	equityCurveIS?: EquityCurvePoint[]
	equityCurveOOS?: EquityCurvePoint[]
	tradesIS?: ReturnType<typeof runBacktest>["trades"]
	tradesOOS?: ReturnType<typeof runBacktest>["trades"]
	oosRobust?: boolean
	// Phase 3B match rate — fraction of trades matching catalog by (date, brickIndex)
	matchRate?: number
	matchRateIS?: number
	matchRateOOS?: number
}

interface CompleteMessage {
	type: "complete"
	totalMs: number
}

interface ErrorMessage {
	type: "error"
	message: string
}

type WorkerOutMessage = ProgressMessage | CompleteMessage | ErrorMessage

// ── Helper: compute match rate ───────────────────────────────────

// Built once per (catalog, dateRange) and reused across every recipe in a sweep.
interface MatchRateIndex {
	readonly keys: Set<string>
	readonly size: number
}

const buildMatchRateIndex = (
	referenceCatalog: UserEntry[],
	dateRange?: { from: string; to: string }
): MatchRateIndex | null => {
	if (!referenceCatalog.length) {
		return null
	}
	const keys = new Set<string>()
	let size = 0
	for (const entry of referenceCatalog) {
		if (
			dateRange &&
			(entry.date < dateRange.from || entry.date > dateRange.to)
		) {
			continue
		}
		keys.add(`${entry.date}|${entry.brickIndex}`)
		size++
	}
	if (size === 0) {
		return null
	}
	return { keys, size }
}

const computeMatchRate = (
	trades: ReturnType<typeof runBacktest>["trades"],
	index: MatchRateIndex | null
): number | undefined => {
	if (!index || !trades.length) {
		return undefined
	}

	// Count trades matching catalog by (date, brickIndex) — O(n) lookup.
	let matches = 0
	for (const trade of trades) {
		if (trade.entryBrickIndex !== undefined) {
			const key = `${trade.dayKey}|${trade.entryBrickIndex}`
			if (index.keys.has(key)) {
				matches++
			}
		}
	}

	// Match rate = matches / max(catalog.length, trades.length)
	// This penalizes both missed catalog entries AND false-positive fires
	const denominator = Math.max(index.size, trades.length)
	return matches / denominator
}

// ── Worker logic ─────────────────────────────────────────────────

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<StartMessage>) => {
	try {
		const {
			candles,
			candles15m,
			assetConfig,
			recipes,
			walkForward,
			referenceCatalog,
		} = event.data
		const c15 = candles15m ?? []
		const startTime = performance.now()

		// Walk-forward mode needs IS+OOS slices; single-pass uses the full catalog.
		// All recipes share the same candles, so the slice boundaries are stable.
		let fullIndex: MatchRateIndex | null = null
		let isIndex: MatchRateIndex | null = null
		let oosIndex: MatchRateIndex | null = null
		if (referenceCatalog) {
			if (walkForward) {
				const { isDateRange, oosDateRange } = splitCandles(
					candles,
					walkForward.inSamplePct
				)
				isIndex = buildMatchRateIndex(referenceCatalog, isDateRange)
				oosIndex = buildMatchRateIndex(referenceCatalog, oosDateRange)
			} else {
				fullIndex = buildMatchRateIndex(referenceCatalog)
			}
		}

		for (let i = 0; i < recipes.length; i++) {
			const recipe = recipes[i]!

			if (walkForward) {
				// Walk-forward mode: split candles, run both, compute robustness
				const { isCandles, oosCandles } = splitCandles(
					candles,
					walkForward.inSamplePct
				)

				const isCutoff = oosCandles[0]?.timestamp
				const is15m =
					isCutoff !== undefined
						? c15.filter((c) => c.timestamp < isCutoff)
						: c15
				const oos15m =
					isCutoff !== undefined
						? c15.filter((c) => c.timestamp >= isCutoff)
						: []

				const isResult = runBacktest(isCandles, recipe, assetConfig, is15m)
				const oosResult = runBacktest(oosCandles, recipe, assetConfig, oos15m)

				const msg: ProgressMessage = {
					type: "progress",
					index: i,
					total: recipes.length,
					recipe,
					// summary and equityCurve reflect IS (the optimization target)
					summary: isResult.summary,
					equityCurve: isResult.equityCurve,
					trades: isResult.trades,
					// Phase 1a fields
					summaryIS: isResult.summary,
					summaryOOS: oosResult.summary,
					equityCurveIS: isResult.equityCurve,
					equityCurveOOS: oosResult.equityCurve,
					tradesIS: isResult.trades,
					tradesOOS: oosResult.trades,
					oosRobust: isOosRobust(isResult.summary, oosResult.summary),
					// Phase 3B match rate (if catalog provided and Hawks strategy)
					...(referenceCatalog &&
						recipe.entry.type === "hawks_playbook" && {
							matchRateIS: computeMatchRate(isResult.trades, isIndex),
							matchRateOOS: computeMatchRate(oosResult.trades, oosIndex),
						}),
				}
				self.postMessage(msg)
			} else {
				// Standard mode: single-pass backtest (current behavior)
				const result = runBacktest(candles, recipe, assetConfig, c15)

				const msg: ProgressMessage = {
					type: "progress",
					index: i,
					total: recipes.length,
					recipe,
					summary: result.summary,
					equityCurve: result.equityCurve,
					trades: result.trades,
					// Phase 3B match rate (if catalog provided and Hawks strategy)
					...(referenceCatalog &&
						recipe.entry.type === "hawks_playbook" && {
							matchRate: computeMatchRate(result.trades, fullIndex),
						}),
				}
				self.postMessage(msg)
			}
		}

		const completeMsg: CompleteMessage = {
			type: "complete",
			totalMs: Math.round(performance.now() - startTime),
		}
		self.postMessage(completeMsg)
	} catch (error) {
		const errorMsg: ErrorMessage = {
			type: "error",
			message: error instanceof Error ? error.message : "Worker error",
		}
		self.postMessage(errorMsg)
	}
}

export type {
	StartMessage,
	ProgressMessage,
	CompleteMessage,
	ErrorMessage,
	WorkerOutMessage,
}
