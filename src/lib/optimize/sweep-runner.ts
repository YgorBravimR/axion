import type { CandleRow } from "@/types/candle"
import type {
	StrategyRecipe,
	AssetConfig,
	OptimizationRun,
} from "@/types/backtest"
import type { WorkerOutMessage } from "./backtest-worker"
import {
	STORAGE_SCHEMA_VERSION,
	buildSweepProvenance,
	hashRecipeConfig,
} from "./provenance"

interface SweepCallbacks {
	onProgress: (_run: OptimizationRun, _index: number, _total: number) => void
	onComplete: (_totalMs: number) => void
	onError: (_message: string) => void
}

interface SweepHandle {
	cancel: () => void
}

interface SweepContext {
	dateFrom: string
	dateTo: string
	engineVersion: string
	walkForward?: { inSamplePct: number }
}

const runSweep = (
	candles: CandleRow[],
	assetConfig: AssetConfig,
	recipes: StrategyRecipe[],
	context: SweepContext,
	callbacks: SweepCallbacks
): SweepHandle => {
	const worker = new Worker(new URL("./backtest-worker.ts", import.meta.url))
	const provenance = buildSweepProvenance(
		candles,
		context.dateFrom,
		context.dateTo,
		context.engineVersion
	)

	let runCounter = 0

	worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
		const msg = event.data

		if (msg.type === "progress") {
			runCounter++
			const run: OptimizationRun = {
				id: crypto.randomUUID(),
				label: `Sweep #${runCounter}`,
				recipe: msg.recipe,
				summary: msg.summary,
				equityCurve: msg.equityCurve,
				trades: [],
				dayBreakdown: [],
				pinned: false,
				createdAt: new Date().toISOString(),
				provenance: {
					sweepId: provenance.sweepId,
					datasetHash: provenance.datasetHash,
					candleCount: provenance.candleCount,
					dateRangeHash: provenance.dateRangeHash,
					dateFrom: provenance.dateFrom,
					dateTo: provenance.dateTo,
					engineVersion: provenance.engineVersion,
					recipeHash: hashRecipeConfig(msg.recipe),
					schemaVersion: STORAGE_SCHEMA_VERSION,
				},
				summaryIS: msg.summaryIS,
				summaryOOS: msg.summaryOOS,
				equityCurveIS: msg.equityCurveIS,
				equityCurveOOS: msg.equityCurveOOS,
				oosRobust: msg.oosRobust,
			}
			callbacks.onProgress(run, msg.index, msg.total)
		} else if (msg.type === "complete") {
			worker.terminate()
			callbacks.onComplete(msg.totalMs)
		} else if (msg.type === "error") {
			worker.terminate()
			callbacks.onError(msg.message)
		}
	}

	worker.onerror = (error) => {
		worker.terminate()
		callbacks.onError(error.message || "Worker crashed")
	}

	worker.postMessage({
		type: "start",
		candles,
		assetConfig,
		recipes,
		walkForward: context.walkForward,
	})

	return {
		cancel: () => {
			worker.terminate()
		},
	}
}

export { runSweep }
export type { SweepCallbacks, SweepHandle, SweepContext }
