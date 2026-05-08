import { describe, it, expect, afterEach } from "vitest"

describe("fractal-plan feature flag", () => {
	const originalEnv = process.env.FRACTAL_PLAN_DUAL_WRITE

	afterEach(() => {
		if (originalEnv === undefined) {
			delete process.env.FRACTAL_PLAN_DUAL_WRITE
		} else {
			process.env.FRACTAL_PLAN_DUAL_WRITE = originalEnv
		}
	})

	it("returns true when env var is unset (default ON)", async () => {
		delete process.env.FRACTAL_PLAN_DUAL_WRITE
		const { isFractalPlanDualWriteEnabled } = await import("@/lib/flags/fractal-plan")
		expect(isFractalPlanDualWriteEnabled()).toBe(true)
	})

	it("returns true when env var is exactly '1'", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "1"
		const { isFractalPlanDualWriteEnabled } = await import("@/lib/flags/fractal-plan")
		expect(isFractalPlanDualWriteEnabled()).toBe(true)
	})

	it("returns false only when env var is explicitly '0'", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "0"
		const { isFractalPlanDualWriteEnabled } = await import("@/lib/flags/fractal-plan")
		expect(isFractalPlanDualWriteEnabled()).toBe(false)
	})

	it("returns true for any value other than '0'", async () => {
		process.env.FRACTAL_PLAN_DUAL_WRITE = "true"
		const { isFractalPlanDualWriteEnabled } = await import("@/lib/flags/fractal-plan")
		expect(isFractalPlanDualWriteEnabled()).toBe(true)
	})
})
