import { describe, it, expect, beforeEach, afterEach } from "vitest"

describe("fractal-plan feature flag", () => {
	const originalEnv = process.env.FRACTAL_PLAN_DUAL_WRITE

	afterEach(() => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = originalEnv
	})

	it("returns false when env var is unset", async () => {
		delete process.env.FRACTAL_PLAN_DUAL_WRITE
		const { isFractalPlanDualWriteEnabled } = await import("@/lib/flags/fractal-plan")
		expect(isFractalPlanDualWriteEnabled()).toBe(false)
	})

	it("returns true when env var is exactly '1'", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "1"
		const { isFractalPlanDualWriteEnabled } = await import("@/lib/flags/fractal-plan")
		expect(isFractalPlanDualWriteEnabled()).toBe(true)
	})

	it("returns false for any value other than '1'", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "true"
		const { isFractalPlanDualWriteEnabled } = await import("@/lib/flags/fractal-plan")
		expect(isFractalPlanDualWriteEnabled()).toBe(false)
	})
})
