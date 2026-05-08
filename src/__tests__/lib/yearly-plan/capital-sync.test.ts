import { describe, it, expect } from "vitest"

const resolveCapitalSync = (
	monthlyUpdatedAt: Date,
	yearlyUpdatedAt: Date,
	source: "monthly" | "yearly"
): "monthly" | "yearly" => {
	if (source === "monthly") {
		return "monthly"
	}
	const monthlyTs = monthlyUpdatedAt.getTime()
	const yearlyTs = yearlyUpdatedAt.getTime()
	return monthlyTs >= yearlyTs ? "monthly" : "yearly"
}

describe("capital sync conflict resolution", () => {
	it("source=monthly always wins", () => {
		expect(
			resolveCapitalSync(
				new Date("2026-01-01"),
				new Date("2026-06-01"),
				"monthly"
			)
		).toBe("monthly")
	})
	it("source=yearly: yearly wins when yearly is newer", () => {
		expect(
			resolveCapitalSync(
				new Date("2026-01-01"),
				new Date("2026-06-01"),
				"yearly"
			)
		).toBe("yearly")
	})
	it("source=yearly: tie → monthly wins", () => {
		const same = new Date("2026-05-01")
		expect(resolveCapitalSync(same, same, "yearly")).toBe("monthly")
	})
	it("source=yearly: monthly wins when monthly is newer", () => {
		expect(
			resolveCapitalSync(
				new Date("2026-06-01"),
				new Date("2026-01-01"),
				"yearly"
			)
		).toBe("monthly")
	})
})
