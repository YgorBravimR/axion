/**
 * Test suite for trade-grouping.ts
 * Focus: date parsing error handling and skip counting
 */

import { describe, it, expect } from "vitest"
import {
	groupExecutionsIntoTrades,
	createImportPreview,
} from "@/lib/csv-parsers"
import type { RawExecution } from "@/lib/csv-parsers"

describe("groupExecutionsIntoTrades", () => {
	it("should skip executions with malformed dates", () => {
		const executions: RawExecution[] = [
			{
				date: "25/02/2026",
				time: "09:15:30",
				asset: "WIN",
				side: "BUY",
				quantity: 2,
				price: 5200,
				commission: 15,
				broker: "GENIAL",
			},
			{
				// Malformed date: month > 12
				date: "25/13/2026",
				time: "10:15:30",
				asset: "WIN",
				side: "SELL",
				quantity: 2,
				price: 5250,
				commission: 15,
				broker: "GENIAL",
			},
		]

		const result = groupExecutionsIntoTrades(executions)

		// Should have created a trade from the valid execution (no exit since malformed one skipped)
		expect(result.trades.length).toBe(1)
		expect(result.skippedExecutionCount).toBe(1)
	})

	it("should skip executions with malformed times", () => {
		const executions: RawExecution[] = [
			{
				date: "25/02/2026",
				time: "09:15:30",
				asset: "WIN",
				side: "BUY",
				quantity: 2,
				price: 5200,
				commission: 15,
				broker: "GENIAL",
			},
			{
				// Malformed time: no colons, splits to ["10"], length 1 < 2
				date: "25/02/2026",
				time: "10",
				asset: "WIN",
				side: "SELL",
				quantity: 2,
				price: 5250,
				commission: 15,
				broker: "GENIAL",
			},
		]

		const result = groupExecutionsIntoTrades(executions)

		// Entry is valid, but unparseable exit causes entire trade to be skipped
		expect(result.trades.length).toBe(0)
		expect(result.skippedExecutionCount).toBe(1)
	})

	it("should handle NaN in parsed date fields", () => {
		const executions: RawExecution[] = [
			{
				date: "25/02/2026",
				time: "09:15:30",
				asset: "WIN",
				side: "BUY",
				quantity: 2,
				price: 5200,
				commission: 15,
				broker: "GENIAL",
			},
			{
				// Non-numeric date parts
				date: "XX/02/2026",
				time: "10:15:30",
				asset: "WIN",
				side: "SELL",
				quantity: 2,
				price: 5250,
				commission: 15,
				broker: "GENIAL",
			},
		]

		const result = groupExecutionsIntoTrades(executions)

		expect(result.trades.length).toBe(1)
		expect(result.skippedExecutionCount).toBe(1)
	})

	it("should not silently use current date on parse failure", () => {
		const executions: RawExecution[] = [
			{
				// Malformed: will fail parsing
				date: "invalid",
				time: "99:99:99",
				asset: "WIN",
				side: "BUY",
				quantity: 2,
				price: 5200,
				commission: 15,
				broker: "GENIAL",
			},
		]

		const result = groupExecutionsIntoTrades(executions)

		// Should skip the execution entirely, not create a trade with today's date
		expect(result.trades.length).toBe(0)
		expect(result.skippedExecutionCount).toBe(1)
	})

	it("should skip trade group if any unparseable dates are present", () => {
		const executions: RawExecution[] = [
			{
				date: "25/02/2026",
				time: "09:15:30",
				asset: "WIN",
				side: "BUY",
				quantity: 2,
				price: 5200,
				commission: 15,
				broker: "GENIAL",
			},
			{
				// Malformed time means this will have null date
				date: "25/02/2026",
				time: "invalid_time",
				asset: "WIN",
				side: "SELL",
				quantity: 2,
				price: 5250,
				commission: 15,
				broker: "GENIAL",
			},
		]

		const result = groupExecutionsIntoTrades(executions)

		// Any unparseable execution causes the entire trade group to be skipped
		expect(result.skippedExecutionCount).toBe(1) // The unparseable SELL
		expect(result.trades.length).toBe(0) // Entire trade group skipped
	})
})

describe("createImportPreview", () => {
	it("should include skip counts in preview", () => {
		const preview = createImportPreview(
			[],
			"GENIAL",
			10,
			"import_123",
			2,
			[2, 5]
		)

		expect(preview.skippedRowCount).toBe(2)
		expect(preview.skippedRowNumbers).toEqual([2, 5])
		// Check that warning about skipped rows is present
		expect(preview.warnings.some((w) => w.includes("skipped"))).toBe(true)
	})

	it("should cap skipped row numbers at 10", () => {
		const rowNumbers = Array.from({ length: 15 }, (_, i) => i + 1)
		const preview = createImportPreview(
			[],
			"GENIAL",
			100,
			"import_123",
			15,
			rowNumbers
		)

		expect(preview.skippedRowNumbers?.length).toBeLessThanOrEqual(10)
	})

	it("should not include skip warning if no rows skipped", () => {
		const preview = createImportPreview([], "GENIAL", 10, "import_123", 0, [])

		expect(preview.skippedRowCount).toBe(0)
		expect(preview.warnings).not.toContain("skipped")
	})
})
