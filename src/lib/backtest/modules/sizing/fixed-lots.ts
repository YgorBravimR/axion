import type { FixedLotsSizingConfig } from "@/types/backtest"

const calculateFixedLots = (_stopDistance: number, config: FixedLotsSizingConfig): number => {
	return config.lots
}

export { calculateFixedLots }
