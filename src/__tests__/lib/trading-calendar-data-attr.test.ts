/**
 * Regression test for bug cf9d8f79 — "Modal not opening"
 *
 * TradingCalendar used `data-dateKey` which browsers lowercase to `data-datekey`.
 * But `dataset.dateKey` maps to `data-date-key` (camelCase → kebab-case).
 * The mismatch caused `dataset.dateKey` to always return `undefined`,
 * silently preventing the day detail modal from opening.
 *
 * Fix: Changed to `data-date-key` (kebab-case) which correctly maps to `dataset.dateKey`.
 */

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"

describe("TradingCalendar data attribute fix", () => {
	const calendarPath = resolve(
		import.meta.dirname,
		"../../components/dashboard/trading-calendar.tsx"
	)
	const source = readFileSync(calendarPath, "utf-8")

	it("should use kebab-case data-date-key attribute (not camelCase data-dateKey)", () => {
		// data-date-key is correct (maps to dataset.dateKey in JS)
		expect(source).toContain("data-date-key")
		// data-dateKey is the bug — browser lowercases to data-datekey
		// which does NOT map to dataset.dateKey
		expect(source).not.toContain("data-dateKey")
	})

	it("should read dataset.dateKey in click handler (matches data-date-key)", () => {
		expect(source).toContain("dataset.dateKey")
	})
})
