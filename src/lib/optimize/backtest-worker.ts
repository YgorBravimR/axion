/// <reference lib="webworker" />

import { runBacktest } from "@/lib/backtest/engine"
import { splitCandles, isOosRobust } from "@/lib/optimize/robustness"
import type { CandleRow } from "@/types/candle"
import type {
	StrategyRecipe,
	AssetConfig,
	BacktestSummary,
	EquityCurvePoint,
} from "@/types/backtest"

// ── Message types ────────────────────────────────────────────────

interface StartMessage {
	type: "start"
	candles: CandleRow[]
	assetConfig: AssetConfig
	recipes: StrategyRecipe[]
	walkForward?: { inSamplePct: number }
}

interface ProgressMessage {
	type: "progress"
	index: number
	total: number
	recipe: StrategyRecipe
	summary: BacktestSummary
	equityCurve: EquityCurvePoint[]
	// Phase 1a walk-forward — populated only when the sweep is in IS/OOS mode.
	summaryIS?: BacktestSummary
	summaryOOS?: BacktestSummary
	equityCurveIS?: EquityCurvePoint[]
	equityCurveOOS?: EquityCurvePoint[]
	oosRobust?: boolean
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

// ── Worker logic ─────────────────────────────────────────────────

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (event: MessageEvent<StartMessage>) => {
	try {
		const { candles, assetConfig, recipes, walkForward } = event.data
		const startTime = performance.now()

		for (let i = 0; i < recipes.length; i++) {
			const recipe = recipes[i]!

			if (walkForward) {
				// Walk-forward mode: split candles, run both, compute robustness
				const { isCandles, oosCandles } = splitCandles(
					candles,
					walkForward.inSamplePct
				)

				const isResult = runBacktest(isCandles, recipe, assetConfig)
				const oosResult = runBacktest(oosCandles, recipe, assetConfig)

				const msg: ProgressMessage = {
					type: "progress",
					index: i,
					total: recipes.length,
					recipe,
					// summary and equityCurve reflect IS (the optimization target)
					summary: isResult.summary,
					equityCurve: isResult.equityCurve,
					// Phase 1a fields
					summaryIS: isResult.summary,
					summaryOOS: oosResult.summary,
					equityCurveIS: isResult.equityCurve,
					equityCurveOOS: oosResult.equityCurve,
					oosRobust: isOosRobust(isResult.summary, oosResult.summary),
				}
				self.postMessage(msg)
			} else {
				// Standard mode: single-pass backtest (current behavior)
				const result = runBacktest(candles, recipe, assetConfig)

				const msg: ProgressMessage = {
					type: "progress",
					index: i,
					total: recipes.length,
					recipe,
					summary: result.summary,
					equityCurve: result.equityCurve,
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
