import type { ReversalConfig, ReversalState, ReversalResult, ReversalModule } from "@/types/backtest"
import { checkReverseOnStop } from "./reverse-on-stop"

const createReversalModule = (): ReversalModule => ({
	init: (): ReversalState => ({
		reversalsToday: 0,
		lastExitWasBreakeven: false,
	}),

	check: (exitReason: string, state: ReversalState, config: ReversalConfig): ReversalResult => {
		if (config.type === "none") {
			return { shouldReverse: false, state }
		}
		return checkReverseOnStop(exitReason, state, config)
	},
})

export { createReversalModule }
