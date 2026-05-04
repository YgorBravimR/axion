const isFractalPlanDualWriteEnabled = (): boolean => {
	// Default ON — only explicitly disabled when set to "0"
	return process.env.FRACTAL_PLAN_DUAL_WRITE !== "0"
}

export { isFractalPlanDualWriteEnabled }
