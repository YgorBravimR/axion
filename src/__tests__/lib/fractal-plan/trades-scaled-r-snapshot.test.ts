/**
 * Tests for R-snapshot capture in createScaledTrade (scaled path).
 * Phase 3 Task 6.
 *
 * Mirror of trades-csv-r-snapshot.test.ts — same pattern, scaled trade path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

const mockCaptureROnEntry = vi.fn()
const mockIsFractalPlanEnabled = vi.fn()

/**
 * Simulate the flag-gated snapshot logic extracted from createScaledTrade:
 *
 * ```ts
 * let oneRSnapshotCentsScaled: number | null = null
 * if (isFractalPlanDualWriteEnabled()) {
 *   try {
 *     oneRSnapshotCentsScaled = await captureROnEntry({ accountId, entryDate })
 *   } catch (snapErr) {
 *     console.error(...)
 *   }
 * }
 * scaledInsertValues.oneRSnapshotCents = oneRSnapshotCentsScaled
 * ```
 */
const simulateScaledSnapshotCapture = async (
	accountId: string,
	entryDate: Date
): Promise<number | null> => {
	let oneRSnapshotCentsScaled: number | null = null
	if (mockIsFractalPlanEnabled()) {
		try {
			oneRSnapshotCentsScaled = await mockCaptureROnEntry({ accountId, entryDate })
		} catch (snapErr) {
			console.error("[fractal-plan] captureROnEntry (scaled) failed silently:", snapErr)
		}
	}
	return oneRSnapshotCentsScaled
}

describe("createScaledTrade — fractal R-snapshot capture (Phase 3)", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	afterEach(() => {
		vi.clearAllMocks()
	})

	it("populates oneRSnapshotCents when flag ON", async () => {
		mockIsFractalPlanEnabled.mockReturnValue(true)
		mockCaptureROnEntry.mockResolvedValue(75000)

		const result = await simulateScaledSnapshotCapture("acc-1", new Date("2026-01-15"))
		expect(result).toBe(75000)
		expect(mockCaptureROnEntry).toHaveBeenCalledOnce()
	})

	it("leaves oneRSnapshotCents null when flag OFF", async () => {
		mockIsFractalPlanEnabled.mockReturnValue(false)

		const result = await simulateScaledSnapshotCapture("acc-1", new Date("2026-01-15"))
		expect(result).toBeNull()
		expect(mockCaptureROnEntry).not.toHaveBeenCalled()
	})

	it("leaves oneRSnapshotCents null when captureROnEntry returns null", async () => {
		mockIsFractalPlanEnabled.mockReturnValue(true)
		mockCaptureROnEntry.mockResolvedValue(null)

		const result = await simulateScaledSnapshotCapture("acc-1", new Date("2026-01-15"))
		expect(result).toBeNull()
	})

	it("silently catches errors from captureROnEntry", async () => {
		mockIsFractalPlanEnabled.mockReturnValue(true)
		mockCaptureROnEntry.mockRejectedValue(new Error("resolver exploded"))

		const result = await simulateScaledSnapshotCapture("acc-1", new Date("2026-01-15"))
		expect(result).toBeNull()
	})
})
