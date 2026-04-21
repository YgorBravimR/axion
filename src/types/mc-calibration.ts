type MCVersion = "v1" | "v2"

interface MCCalibrationSnapshot {
	version: MCVersion
	timestamp: number
	// V1 fields (Edge Expectancy — R-space)
	expectedMaxLossStreak?: number
	worstMaxRDrawdown?: number
	medianMaxRDrawdown?: number
	profitablePct?: number
	// V2 fields (Capital Expectancy — dollar-space)
	worstMaxDrawdownPercent?: number
	medianMaxDrawdownPercent?: number
	riskOfRuinPercent?: number
	initialBalanceCents?: number
}

export type { MCVersion, MCCalibrationSnapshot }
