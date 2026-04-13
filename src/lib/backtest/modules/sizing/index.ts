import type { SizingConfig, SizingModule } from "@/types/backtest"
import { calculateMonetaryRisk } from "./monetary-risk"
import { calculateFixedLots } from "./fixed-lots"

const createSizingModule = (): SizingModule => ({
	calculate: (stopDistance: number, config: SizingConfig): number => {
		switch (config.type) {
			case "monetary_risk":
				return calculateMonetaryRisk(stopDistance, config)
			case "fixed_lots":
				return calculateFixedLots(stopDistance, config)
		}
	},
})

export { createSizingModule }
