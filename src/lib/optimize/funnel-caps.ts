import type { FunnelStage } from "@/types/backtest"

/**
 * Stage-aware cardinality caps for the broad-to-specific funnel.
 *
 * Values empirically validated on 2026-05-30:
 *   - 3000 Hawks recipes against 2000 synthetic candles → 6.0s wall-clock,
 *     2.0 ms/combo. Verdict: PASS (well inside the 6-min SLA budget).
 *     Real-world candles with live indicators run slower per combo, but
 *     headroom is large enough that the design values stand without
 *     adjustment.
 *
 * Broad = 500: breadth-first; enums + wide ranges dominate. Avoids cognitive
 *   overload on the user's first sweep of a journey.
 * Refine = 3000: K parents × tight neighborhoods compound. Needs depth without
 *   runaway. Benchmark confirmed.
 * Freeze = 1: snapshot only — no sweep, just a single combo promoted to a
 *   shadow preset.
 *
 * `WARN` is the soft warning floor — recipes between WARN and CAP render a
 * yellow advisory; recipes above CAP block the run.
 */
const FUNNEL_CAPS: Record<FunnelStage, { warn: number; cap: number }> = {
	broad: { warn: 300, cap: 500 },
	refine: { warn: 1500, cap: 3000 },
	freeze: { warn: 1, cap: 1 },
}

/** Default cap when stage is undefined (legacy / ad-hoc sweeps). */
const AD_HOC_CAP = { warn: 500, cap: 2000 }

const getCapsForStage = (
	stage: FunnelStage | undefined
): { warn: number; cap: number } => {
	if (!stage) {
		return AD_HOC_CAP
	}
	return FUNNEL_CAPS[stage]
}

export { FUNNEL_CAPS, AD_HOC_CAP, getCapsForStage }
