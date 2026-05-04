const isFractalPlanDualWriteEnabled = (): boolean => {
	return process.env.FRACTAL_PLAN_DUAL_WRITE === "1"
}

export { isFractalPlanDualWriteEnabled }
