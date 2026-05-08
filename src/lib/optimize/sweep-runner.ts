import type { CandleRow } from "@/types/candle"
import type {
	StrategyRecipe,
	AssetConfig,
	OptimizationRun,
} from "@/types/backtest"
import type { WorkerOutMessage } from "./backtest-worker"

interface SweepCallbacks {
	onProgress: (_run: OptimizationRun, _index: number, _total: number) => void
	onComplete: (_totalMs: number) => void
	onError: (_message: string) => void
}

interface SweepHandle {
	cancel: () => void
}

/**
 * Run a batch of backtest recipes in a Web Worker.
 * Returns a handle with a cancel() method to abort mid-sweep.
 *
 * Candles are sent once to the worker via structured clone.
 * Results stream back one-by-one as ProgressMessages.
 */
const runSweep = (
	candles: CandleRow[],
	assetConfig: AssetConfig,
	recipes: StrategyRecipe[],
	callbacks: SweepCallbacks
): SweepHandle => {
	const worker = new Worker(new URL("./backtest-worker.ts", import.meta.url))

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
				trades: [], // lightweight — re-computed on expand
				dayBreakdown: [],
				pinned: false,
				createdAt: new Date().toISOString(),
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

	// Send candles + all recipes to the worker
	worker.postMessage({
		type: "start",
		candles,
		assetConfig,
		recipes,
	})

	return {
		cancel: () => {
			worker.terminate()
		},
	}
}

export { runSweep }
export type { SweepCallbacks, SweepHandle }
