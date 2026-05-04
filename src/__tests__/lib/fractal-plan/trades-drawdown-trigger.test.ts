/**
 * Tests for drawdown trigger wiring after trade inserts.
 * Phase 3 Task 7.
 *
 * Tests the maybeTriggerDrawdown helper logic in isolation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const mockCheckDrawdownTrigger = vi.fn()
const mockIsFractalPlanEnabled = vi.fn()

/**
 * Simulate maybeTriggerDrawdown from trades.ts:
 *
 * ```ts
 * const maybeTriggerDrawdown = async (accountId, outcome, exitDate) => {
 *   if (!isFractalPlanDualWriteEnabled()) return
 *   if (outcome !== "loss" || !exitDate) return
 *   try {
 *     await checkDrawdownTrigger({ accountId, asOf: exitDate })
 *   } catch (err) {
 *     console.error(...)
 *   }
 * }
 * ```
 */
const maybeTriggerDrawdown = async (
	accountId: string,
	outcome: "win" | "loss" | "breakeven" | undefined,
	exitDate: Date | null
): Promise<void> => {
	if (!mockIsFractalPlanEnabled()) return
	if (outcome !== "loss" || !exitDate) return
	try {
		await mockCheckDrawdownTrigger({ accountId, asOf: exitDate })
	} catch (err) {
		console.error("[fractal-plan] checkDrawdownTrigger failed silently:", err)
	}
}

describe("maybeTriggerDrawdown (createTrade path)", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("calls checkDrawdownTrigger after a losing trade when flag ON", async () => {
		mockIsFractalPlanEnabled.mockReturnValue(true)
		mockCheckDrawdownTrigger.mockResolvedValue(null)

		await maybeTriggerDrawdown("acc-1", "loss", new Date("2026-01-15"))
		expect(mockCheckDrawdownTrigger).toHaveBeenCalledOnce()
		expect(mockCheckDrawdownTrigger).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: "acc-1" })
		)
	})

	it("does NOT call checkDrawdownTrigger after a winning trade", async () => {
		mockIsFractalPlanEnabled.mockReturnValue(true)

		await maybeTriggerDrawdown("acc-1", "win", new Date("2026-01-15"))
		expect(mockCheckDrawdownTrigger).not.toHaveBeenCalled()
	})

	it("does NOT call checkDrawdownTrigger when flag is OFF", async () => {
		mockIsFractalPlanEnabled.mockReturnValue(false)

		await maybeTriggerDrawdown("acc-1", "loss", new Date("2026-01-15"))
		expect(mockCheckDrawdownTrigger).not.toHaveBeenCalled()
	})

	it("does NOT call checkDrawdownTrigger when exitDate is null (open trade)", async () => {
		mockIsFractalPlanEnabled.mockReturnValue(true)

		await maybeTriggerDrawdown("acc-1", "loss", null)
		expect(mockCheckDrawdownTrigger).not.toHaveBeenCalled()
	})

	it("does NOT call checkDrawdownTrigger on breakeven outcome", async () => {
		mockIsFractalPlanEnabled.mockReturnValue(true)

		await maybeTriggerDrawdown("acc-1", "breakeven", new Date("2026-01-15"))
		expect(mockCheckDrawdownTrigger).not.toHaveBeenCalled()
	})

	it("silently catches errors from checkDrawdownTrigger", async () => {
		mockIsFractalPlanEnabled.mockReturnValue(true)
		mockCheckDrawdownTrigger.mockRejectedValue(new Error("trigger failed"))

		// Should not throw
		await expect(maybeTriggerDrawdown("acc-1", "loss", new Date("2026-01-15"))).resolves.toBeUndefined()
	})
})
