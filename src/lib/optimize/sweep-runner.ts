import type { CandleRow } from "@/types/candle"
import type {
	StrategyRecipe,
	AssetConfig,
	OptimizationRun,
	UserEntry,
	FunnelStage,
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
	referenceCatalog?: UserEntry[]
	/** Hero-hunt funnel stage tag. Stamped onto every emitted run's provenance. */
	funnelStage?: FunnelStage
	/** Parent run IDs whose Pareto multi-select produced this sweep. Empty for broad. */
	parentRunIds?: string[]
	/** Journey grouping. Set by the orchestrator when entering refine/freeze. */
	journeyId?: string
	/**
	 * Seed for the per-stage label counter so labels stay globally monotonic
	 * across sweep sessions (e.g. "Broad #6" picks up where "Broad #5" left
	 * off in the runs store). Defaults to 0 → first run is "#1".
	 */
	initialRunCounter?: number
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

	let runCounter = context.initialRunCounter ?? 0

	worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
		const msg = event.data

		if (msg.type === "progress") {
			runCounter++
			// Label prefix mirrors the funnel stage so the runs table makes
			// the broad → refine → freeze progression unmistakable at a
			// glance. Falls back to "Sweep" when no stage is supplied
			// (legacy callers and ad-hoc utilities).
			const stagePrefix =
				context.funnelStage === "refine"
					? "Refine"
					: context.funnelStage === "freeze"
						? "Freeze"
						: context.funnelStage === "broad"
							? "Broad"
							: "Sweep"
			const run: OptimizationRun = {
				id: crypto.randomUUID(),
				label: `${stagePrefix} #${runCounter}`,
				recipe: msg.recipe,
				summary: msg.summary,
				equityCurve: msg.equityCurve,
				trades: msg.trades,
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
					...(context.funnelStage ? { stage: context.funnelStage } : {}),
					...(context.parentRunIds && context.parentRunIds.length > 0
						? { parentRunIds: context.parentRunIds }
						: {}),
					...(context.journeyId ? { journeyId: context.journeyId } : {}),
				},
				summaryIS: msg.summaryIS,
				summaryOOS: msg.summaryOOS,
				equityCurveIS: msg.equityCurveIS,
				equityCurveOOS: msg.equityCurveOOS,
				oosRobust: msg.oosRobust,
				matchRate: msg.matchRate,
				matchRateIS: msg.matchRateIS,
				matchRateOOS: msg.matchRateOOS,
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
		referenceCatalog: context.referenceCatalog,
	})

	return {
		cancel: () => {
			worker.terminate()
		},
	}
}

export { runSweep }
export type { SweepCallbacks, SweepHandle, SweepContext }
