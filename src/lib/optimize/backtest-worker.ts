/// <reference lib="webworker" />

import { runBacktest } from "@/lib/backtest/engine"
import type { CandleRow } from "@/types/candle"
import type { StrategyRecipe, AssetConfig, BacktestSummary, EquityCurvePoint } from "@/types/backtest"

// ── Message types ────────────────────────────────────────────────

interface StartMessage {
	type: "start"
	candles: CandleRow[]
	assetConfig: AssetConfig
	recipes: StrategyRecipe[]
}

interface ProgressMessage {
	type: "progress"
	index: number
	total: number
	recipe: StrategyRecipe
	summary: BacktestSummary
	equityCurve: EquityCurvePoint[]
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
		const { candles, assetConfig, recipes } = event.data
		const startTime = performance.now()

		for (let i = 0; i < recipes.length; i++) {
			const result = runBacktest(candles, recipes[i], assetConfig)

			const msg: ProgressMessage = {
				type: "progress",
				index: i,
				total: recipes.length,
				recipe: recipes[i],
				summary: result.summary,
				equityCurve: result.equityCurve,
			}
			self.postMessage(msg)
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

export type { StartMessage, ProgressMessage, CompleteMessage, ErrorMessage, WorkerOutMessage }
