import { describe, it, expect } from "vitest"
import {
	computeGainEv,
	computeStopEv,
	computeProtEv,
} from "@/lib/yearly-plan/exit-convention"
import type { ExitConvention } from "@/lib/yearly-plan/exit-convention"

const DEFAULT_CONVENTION: ExitConvention = {
	parcialPts: 5.0,
	finalPts: 10.0,
	stopPts: 3.5,
	protPts: 1.0,
	parcialProportion: 0.70,
	finalProportion: 0.30,
}

describe("exit-convention", () => {
	it("computeGainEv default = 5.0×0.70 + 10.0×0.30 = 6.5 pts", () => {
		expect(computeGainEv(DEFAULT_CONVENTION)).toBeCloseTo(6.5, 5)
	})
	it("computeStopEv default = -3.5 pts", () => {
		expect(computeStopEv(DEFAULT_CONVENTION)).toBeCloseTo(-3.5, 5)
	})
	it("computeProtEv default = 1.0 pts", () => {
		expect(computeProtEv(DEFAULT_CONVENTION)).toBeCloseTo(1.0, 5)
	})
	it("computeGainEv with custom values: 4×0.6 + 8×0.4 = 5.6", () => {
		const custom: ExitConvention = { ...DEFAULT_CONVENTION, parcialPts: 4, finalPts: 8, parcialProportion: 0.6, finalProportion: 0.4 }
		expect(computeGainEv(custom)).toBeCloseTo(5.6, 5)
	})
	it("proportions summing to 1.0 is the expected contract: 0.7+0.3=1.0", () => {
		const sum = DEFAULT_CONVENTION.parcialProportion + DEFAULT_CONVENTION.finalProportion
		expect(sum).toBeCloseTo(1.0, 5)
	})
})
