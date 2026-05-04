import { describe, it, expect, vi } from "vitest"

vi.mock("@/app/actions/auth", () => ({
	requireAuth: vi.fn().mockResolvedValue({ accountId: "acc-1", userId: "u-1" }),
}))

const { mockSelectWhere } = vi.hoisted(() => ({
	mockSelectWhere: vi.fn(),
}))

vi.mock("@/db/drizzle", () => ({
	db: {
		select: () => ({
			from: () => ({
				where: mockSelectWhere,
			}),
		}),
	},
}))

import { getRDistribution } from "@/app/actions/fractal-plan/reports"

describe("getRDistribution", () => {
	const range = {
		from: new Date("2026-01-01"),
		to: new Date("2026-12-31"),
	}

	it("returns all 5 buckets with zero counts when no trades", async () => {
		mockSelectWhere.mockResolvedValue([])

		const result = await getRDistribution(range)

		expect(result.status).toBe("success")
		expect(result.data).toHaveLength(5)

		const buckets = result.data!.map((r) => r.bucket)
		expect(buckets).toEqual(["lt_neg1", "neg1_to_0", "0_to_1", "1_to_2", "ge_2"])

		for (const row of result.data!) {
			expect(row.count).toBe(0)
		}
	})

	it("correctly bucketizes trades into < -1R bucket", async () => {
		mockSelectWhere.mockResolvedValue([
			{ rOutcome: "-1.5" },
			{ rOutcome: "-2.0" },
		])

		const result = await getRDistribution(range)

		expect(result.status).toBe("success")
		const lt = result.data!.find((r) => r.bucket === "lt_neg1")
		expect(lt?.count).toBe(2)
	})

	it("correctly bucketizes trades spanning multiple buckets", async () => {
		mockSelectWhere.mockResolvedValue([
			{ rOutcome: "-2.0" },  // lt_neg1
			{ rOutcome: "-0.5" },  // neg1_to_0
			{ rOutcome: "0.5" },   // 0_to_1
			{ rOutcome: "1.5" },   // 1_to_2
			{ rOutcome: "3.0" },   // ge_2
		])

		const result = await getRDistribution(range)

		expect(result.status).toBe("success")
		const data = result.data!
		expect(data.find((r) => r.bucket === "lt_neg1")?.count).toBe(1)
		expect(data.find((r) => r.bucket === "neg1_to_0")?.count).toBe(1)
		expect(data.find((r) => r.bucket === "0_to_1")?.count).toBe(1)
		expect(data.find((r) => r.bucket === "1_to_2")?.count).toBe(1)
		expect(data.find((r) => r.bucket === "ge_2")?.count).toBe(1)
	})

	it("skips non-finite rOutcome values like NaN strings", async () => {
		// null rows are filtered at DB level via isNotNull(); JS guard handles NaN strings
		mockSelectWhere.mockResolvedValue([
			{ rOutcome: "NaN" },
			{ rOutcome: "1.0" },
		])

		const result = await getRDistribution(range)

		expect(result.status).toBe("success")
		const total = result.data!.reduce((sum, r) => sum + r.count, 0)
		expect(total).toBe(1)
	})

	it("correctly places boundary value -1 in neg1_to_0 bucket", async () => {
		mockSelectWhere.mockResolvedValue([{ rOutcome: "-1.0" }])

		const result = await getRDistribution(range)

		const neg1 = result.data!.find((r) => r.bucket === "neg1_to_0")
		expect(neg1?.count).toBe(1)
	})

	it("correctly places boundary value 2 in ge_2 bucket", async () => {
		mockSelectWhere.mockResolvedValue([{ rOutcome: "2.0" }])

		const result = await getRDistribution(range)

		const ge2 = result.data!.find((r) => r.bucket === "ge_2")
		expect(ge2?.count).toBe(1)
	})
})
