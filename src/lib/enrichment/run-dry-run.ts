import type { Trade } from "@/db/schema"
import type { HawksIndicatorSnapshot } from "@/types/backtest"

import { computeStatus, mergeDeltas } from "./delta-merge"
import { candleMathPass } from "./passes/candle-math"
import { deterministicSlTargetPass } from "./passes/deterministic-sl-target"
import { indicatorReadoutPass } from "./passes/indicator-readout"
import { operationsPass } from "./passes/operations"
import type { DryRunResult, EnrichmentContext } from "./types"

const runDryRun = (trade: Trade, ctx: EnrichmentContext): DryRunResult => {
	const operations = operationsPass(trade, ctx)
	const candleMath = candleMathPass(trade, ctx)
	const indicatorReadout = indicatorReadoutPass(trade, ctx)
	const deterministicSlTarget = deterministicSlTargetPass(trade, ctx)

	const passes = {
		operations,
		candleMath,
		indicatorReadout,
		deterministicSlTarget,
	}

	const mergedFields = mergeDeltas(passes)
	const computedStatus = computeStatus(passes, mergedFields)

	const readoutField = indicatorReadout.fields.indicatorReadout
	const readout = readoutField
		? (readoutField.value as HawksIndicatorSnapshot)
		: null

	return {
		trade,
		passes,
		mergedFields,
		indicatorReadout: readout,
		computedStatus,
	}
}

export { runDryRun }
