import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/fractal-plan/resolver", () => ({
	resolveDay: vi.fn(),
}))

import { resolveDay } from "@/lib/fractal-plan/resolver"
import { captureROnEntry, computeROutcome } from "@/lib/fractal-plan/r-snapshot"

describe("captureROnEntry", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("returns null when no plan resolved", async () => {
		;(resolveDay as ReturnType<typeof vi.fn>).mockResolvedValue(null)
		const result = await captureROnEntry({ accountId: "a1", entryDate: new Date() })
		expect(result).toBeNull()
	})

	it("returns oneRCents from the resolved day", async () => {
		;(resolveDay as ReturnType<typeof vi.fn>).mockResolvedValue({ oneRCents: 8000 })
		const result = await captureROnEntry({ accountId: "a1", entryDate: new Date() })
		expect(result).toBe(8000)
	})
})

describe("computeROutcome", () => {
	it("computes R as pnl/snapshot rounded to 2 decimals", () => {
		expect(computeROutcome({ pnlCents: 16000, oneRSnapshotCents: 8000 })).toBe("2.00")
		expect(computeROutcome({ pnlCents: -4000, oneRSnapshotCents: 8000 })).toBe("-0.50")
	})

	it("returns null on zero snapshot", () => {
		expect(computeROutcome({ pnlCents: 100, oneRSnapshotCents: 0 })).toBeNull()
	})

	it("returns null on null snapshot", () => {
		expect(computeROutcome({ pnlCents: 100, oneRSnapshotCents: null })).toBeNull()
	})
})
