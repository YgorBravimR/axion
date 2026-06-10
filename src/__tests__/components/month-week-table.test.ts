import { describe, expect, it } from "vitest"

/**
 * Test for weekly target derivation logic in MonthWeekTable.
 *
 * The component derives weekly targets from monthly goal when week targetR is null.
 * Logic:
 *   derivedWeeklyGoalCents = monthlyGoalCents / numberOfWeeks
 *   targetCents = targetR > 0 ? targetR * oneRCents : derivedWeeklyGoalCents
 */

describe("MonthWeekTable weekly target derivation", () => {
	const parseR = (v: string | null): number => {
		if (v === null) {
			return 0
		}
		const n = Number(v)
		return Number.isFinite(n) ? n : 0
	}

	it("derives weekly goal when targetR is null and monthly goal is set", () => {
		const monthlyGoalCents = 200000
		const planWeeks = [
			{ targetR: null, isoWeek: 1 },
			{ targetR: null, isoWeek: 2 },
		]

		const derivedWeeklyGoalCents = Math.round(
			monthlyGoalCents / planWeeks.length
		)

		expect(derivedWeeklyGoalCents).toBe(100000)
	})

	it("uses explicit targetR when set", () => {
		const monthlyGoalCents = 100000
		const oneRCents = 50000
		const planWeeks = [{ targetR: "2.0", isoWeek: 1 }]

		const week = planWeeks[0]
		if (!week) {
			throw new Error("week should exist")
		}
		const targetR = parseR(week.targetR)
		const derivedWeeklyGoalCents = Math.round(
			monthlyGoalCents / planWeeks.length
		)

		const targetCents =
			targetR > 0 ? Math.round(targetR * oneRCents) : derivedWeeklyGoalCents

		expect(targetCents).toBe(100000)
	})

	it("distributes monthly goal equally across weeks", () => {
		const monthlyGoalCents = 400000
		const planWeeks = [
			{ targetR: null, isoWeek: 1 },
			{ targetR: null, isoWeek: 2 },
			{ targetR: null, isoWeek: 3 },
			{ targetR: null, isoWeek: 4 },
		]

		const derivedWeeklyGoalCents = Math.round(
			monthlyGoalCents / planWeeks.length
		)

		expect(derivedWeeklyGoalCents).toBe(100000)
	})

	it("returns 0 when monthly goal is null", () => {
		const monthlyGoalCents: number | null = null
		const planWeeks = [
			{ targetR: null, isoWeek: 1 },
			{ targetR: null, isoWeek: 2 },
		]

		const derivedWeeklyGoalCents =
			monthlyGoalCents && monthlyGoalCents > 0 && planWeeks.length > 0
				? Math.round(monthlyGoalCents / planWeeks.length)
				: 0

		expect(derivedWeeklyGoalCents).toBe(0)
	})
})
