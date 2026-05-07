const isFractalPlanDualWriteEnabled = (): boolean => {
	// Default ON — only explicitly disabled when set to "0"
	return process.env.FRACTAL_PLAN_DUAL_WRITE !== "0"
}

/**
 * Cockpit redesign of `/plan/[year]` (12-month grid + tax tab).
 * Default ON. Set FRACTAL_PLAN_COCKPIT=0 for emergency rollback to legacy form.
 */
const isCockpitEnabled = (): boolean => {
	return process.env.FRACTAL_PLAN_COCKPIT !== "0"
}

export { isFractalPlanDualWriteEnabled, isCockpitEnabled }
