import { describe, it, expect, vi, beforeEach } from "vitest"

const { mockUpdate, mockSet, mockWhere } = vi.hoisted(() => ({
	mockUpdate: vi.fn().mockReturnThis(),
	mockSet: vi.fn().mockReturnThis(),
	mockWhere: vi.fn(),
}))

vi.mock("@/db/drizzle", () => ({
	db: {
		query: { monthlyTaxLedger: { findFirst: vi.fn() } },
		update: mockUpdate,
	},
}))

import { db } from "@/db/drizzle"
import { autoLinkTaxLedger } from "@/lib/fractal-plan/auto-link-tax-ledger"

describe("autoLinkTaxLedger", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mockUpdate.mockReturnThis()
		mockSet.mockReturnThis()
	})

	it("returns null when no matching ledger row exists", async () => {
		;(db.query.monthlyTaxLedger.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(undefined)
		const result = await autoLinkTaxLedger({
			accountId: "acc-1",
			year: 2026,
			month: 5,
			monthlyPlanId: "mp-1",
		})
		expect(result).toBeNull()
	})

	it("returns ledger id when match found and triggers updates", async () => {
		;(db.query.monthlyTaxLedger.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
			id: "tl-1",
		})
		mockUpdate.mockImplementation(() => ({
			set: mockSet.mockImplementation(() => ({
				where: mockWhere.mockResolvedValue(undefined),
			})),
		}))

		const result = await autoLinkTaxLedger({
			accountId: "acc-1",
			year: 2026,
			month: 5,
			monthlyPlanId: "mp-1",
		})
		expect(result).toBe("tl-1")
	})
})
