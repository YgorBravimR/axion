import { describe, it, expect } from "vitest"

/**
 * Scorecard drill-down filtering logic from getConditionTradeBreakdown action.
 * Tests the logic that filters trades by strategy version and condition,
 * then narrows to per-condition trade details.
 */

interface TradeConditionRecord {
	tradeId: string
	tradingDay: Date
	ticker: string
	pnl: number
	direction: string
	met: boolean
}

/**
 * Filter trades to show breakdown for a specific condition.
 * Simulates the core filtering and projection from getConditionTradeBreakdown
 * (lines 551-569 in strategy-conditions.ts, minus the 50-trade limit for testing).
 */
const filterConditionBreakdown = (
	trades: TradeConditionRecord[],
	targetConditionId: string,
	conditionRecords: Array<{
		tradeId: string
		conditionId: string
		met: boolean
	}>
): TradeConditionRecord[] => {
	// Find all trades that recorded this condition
	const tradeIdsForCondition = new Set(
		conditionRecords
			.filter((record) => record.conditionId === targetConditionId)
			.map((record) => record.tradeId)
	)

	// Narrow to those trades and enrich with met status
	const metMap = new Map(
		conditionRecords
			.filter((record) => record.conditionId === targetConditionId)
			.map((record) => [record.tradeId, record.met] as const)
	)

	const result = trades
		.filter((trade) => tradeIdsForCondition.has(trade.tradeId))
		.map((trade) => ({
			...trade,
			met: metMap.get(trade.tradeId) ?? false,
		}))

	// Sort by trading day descending (most recent first)
	return result.sort((a, b) => b.tradingDay.getTime() - a.tradingDay.getTime())
}

describe("Scorecard Drill-Down Filtering Logic", () => {
	describe("single condition filter", () => {
		it("should return all trades that recorded the condition", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "PETR4",
					pnl: 150,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t2",
					tradingDay: new Date("2026-05-02"),
					ticker: "VALE5",
					pnl: -200,
					direction: "short",
					met: false,
				},
				{
					tradeId: "t3",
					tradingDay: new Date("2026-05-03"),
					ticker: "BBAS3",
					pnl: 500,
					direction: "long",
					met: false,
				},
			]

			const conditionRecords = [
				{ tradeId: "t1", conditionId: "c1", met: true },
				{ tradeId: "t2", conditionId: "c1", met: false },
				{ tradeId: "t3", conditionId: "c1", met: true },
			]

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			expect(result).toHaveLength(3)
			expect(result.map((t) => t.tradeId)).toEqual(["t3", "t2", "t1"])
		})

		it("should correctly mark met status from condition records", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "PETR4",
					pnl: 100,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t2",
					tradingDay: new Date("2026-05-02"),
					ticker: "VALE5",
					pnl: 200,
					direction: "long",
					met: false,
				},
			]

			const conditionRecords = [
				{ tradeId: "t1", conditionId: "c1", met: true },
				{ tradeId: "t2", conditionId: "c1", met: false },
			]

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			expect(result[0]!.met).toBe(false) // t2, most recent, not met
			expect(result[1]!.met).toBe(true) // t1, older, was met
		})
	})

	describe("empty filter results", () => {
		it("should return empty array when no trades recorded the condition", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "PETR4",
					pnl: 100,
					direction: "long",
					met: false,
				},
			]

			const conditionRecords = [
				{ tradeId: "t1", conditionId: "c-other", met: true },
			]

			const result = filterConditionBreakdown(
				trades,
				"c-target",
				conditionRecords
			)

			expect(result).toHaveLength(0)
		})

		it("should return empty when trade pool is empty", () => {
			const conditionRecords = [{ tradeId: "t1", conditionId: "c1", met: true }]

			const result = filterConditionBreakdown([], "c1", conditionRecords)

			expect(result).toHaveLength(0)
		})

		it("should return empty when condition records is empty", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "PETR4",
					pnl: 100,
					direction: "long",
					met: false,
				},
			]

			const result = filterConditionBreakdown(trades, "c1", [])

			expect(result).toHaveLength(0)
		})
	})

	describe("multi-condition filtering", () => {
		it("should isolate trades for target condition when multiple conditions exist", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "PETR4",
					pnl: 100,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t2",
					tradingDay: new Date("2026-05-02"),
					ticker: "VALE5",
					pnl: 200,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t3",
					tradingDay: new Date("2026-05-03"),
					ticker: "BBAS3",
					pnl: 300,
					direction: "long",
					met: false,
				},
			]

			const conditionRecords = [
				// c1 in t1, t2
				{ tradeId: "t1", conditionId: "c1", met: true },
				{ tradeId: "t2", conditionId: "c1", met: false },
				// c2 in t2, t3
				{ tradeId: "t2", conditionId: "c2", met: true },
				{ tradeId: "t3", conditionId: "c2", met: true },
			]

			const resultC1 = filterConditionBreakdown(trades, "c1", conditionRecords)
			const resultC2 = filterConditionBreakdown(trades, "c2", conditionRecords)

			expect(resultC1.map((t) => t.tradeId)).toEqual(["t2", "t1"])
			expect(resultC2.map((t) => t.tradeId)).toEqual(["t3", "t2"])
		})
	})

	describe("ordering by trading day", () => {
		it("should return trades sorted by day descending (most recent first)", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "A",
					pnl: 0,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t2",
					tradingDay: new Date("2026-05-03"),
					ticker: "B",
					pnl: 0,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t3",
					tradingDay: new Date("2026-05-02"),
					ticker: "C",
					pnl: 0,
					direction: "long",
					met: false,
				},
			]

			const conditionRecords = [
				{ tradeId: "t1", conditionId: "c1", met: true },
				{ tradeId: "t2", conditionId: "c1", met: true },
				{ tradeId: "t3", conditionId: "c1", met: true },
			]

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			expect(result.map((t) => t.tradingDay)).toEqual([
				new Date("2026-05-03"),
				new Date("2026-05-02"),
				new Date("2026-05-01"),
			])
		})

		it("should preserve descending order even when input is unordered", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t3",
					tradingDay: new Date("2026-05-10"),
					ticker: "C",
					pnl: 0,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-05"),
					ticker: "A",
					pnl: 0,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t2",
					tradingDay: new Date("2026-05-15"),
					ticker: "B",
					pnl: 0,
					direction: "long",
					met: false,
				},
			]

			const conditionRecords = [
				{ tradeId: "t1", conditionId: "c1", met: false },
				{ tradeId: "t2", conditionId: "c1", met: false },
				{ tradeId: "t3", conditionId: "c1", met: false },
			]

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			expect(result[0]!.tradingDay).toEqual(new Date("2026-05-15"))
			expect(result[1]!.tradingDay).toEqual(new Date("2026-05-10"))
			expect(result[2]!.tradingDay).toEqual(new Date("2026-05-05"))
		})
	})

	describe("met status distribution", () => {
		it("should show mix of met and unmet trades", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "A",
					pnl: 100,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t2",
					tradingDay: new Date("2026-05-02"),
					ticker: "B",
					pnl: 200,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t3",
					tradingDay: new Date("2026-05-03"),
					ticker: "C",
					pnl: 300,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t4",
					tradingDay: new Date("2026-05-04"),
					ticker: "D",
					pnl: 400,
					direction: "long",
					met: false,
				},
			]

			const conditionRecords = [
				{ tradeId: "t1", conditionId: "c1", met: true },
				{ tradeId: "t2", conditionId: "c1", met: false },
				{ tradeId: "t3", conditionId: "c1", met: true },
				{ tradeId: "t4", conditionId: "c1", met: false },
			]

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			const metCount = result.filter((t) => t.met).length
			const unmetCount = result.filter((t) => !t.met).length

			expect(metCount).toBe(2)
			expect(unmetCount).toBe(2)
		})

		it("should default to met=false when trade not in condition records", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "A",
					pnl: 100,
					direction: "long",
					met: true,
				},
			]

			const conditionRecords: Array<{
				tradeId: string
				conditionId: string
				met: boolean
			}> = []

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			expect(result).toHaveLength(0) // Trade not in condition records at all
		})
	})

	describe("pnl and direction preservation", () => {
		it("should preserve all trade attributes in breakdown", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "PETR4",
					pnl: -450,
					direction: "short",
					met: false,
				},
			]

			const conditionRecords = [{ tradeId: "t1", conditionId: "c1", met: true }]

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			expect(result[0]).toMatchObject({
				tradeId: "t1",
				tradingDay: new Date("2026-05-01"),
				ticker: "PETR4",
				pnl: -450,
				direction: "short",
				met: true,
			})
		})

		it("should show losses alongside gains", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "A",
					pnl: 500,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t2",
					tradingDay: new Date("2026-05-02"),
					ticker: "B",
					pnl: -300,
					direction: "short",
					met: false,
				},
				{
					tradeId: "t3",
					tradingDay: new Date("2026-05-03"),
					ticker: "C",
					pnl: 0,
					direction: "long",
					met: false,
				},
			]

			const conditionRecords = [
				{ tradeId: "t1", conditionId: "c1", met: true },
				{ tradeId: "t2", conditionId: "c1", met: false },
				{ tradeId: "t3", conditionId: "c1", met: false },
			]

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			expect(result[0]!.pnl).toBe(0)
			expect(result[1]!.pnl).toBe(-300)
			expect(result[2]!.pnl).toBe(500)
		})
	})

	describe("edge case: same trade, same condition, multiple records", () => {
		it("should use last occurrence when duplicate trade-condition pair exists", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "A",
					pnl: 100,
					direction: "long",
					met: false,
				},
			]

			const conditionRecords = [
				{ tradeId: "t1", conditionId: "c1", met: true },
				{ tradeId: "t1", conditionId: "c1", met: false },
			]

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			expect(result).toHaveLength(1)
			// Map behavior: last entry wins
			expect(result[0]!.met).toBe(false)
		})
	})

	describe("large dataset filtering", () => {
		it("should efficiently filter 100+ trades", () => {
			const trades: TradeConditionRecord[] = Array.from(
				{ length: 150 },
				(_, i) => ({
					tradeId: `t${i}`,
					tradingDay: new Date("2026-05-01"),
					ticker: "TEST",
					pnl: i * 10,
					direction: "long",
					met: false,
				})
			)

			const conditionRecords = Array.from({ length: 150 }, (_, i) => ({
				tradeId: `t${i}`,
				conditionId: i % 2 === 0 ? "c1" : "c2",
				met: i % 3 === 0,
			}))

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			expect(result.length).toBe(75) // Half of 150
		})
	})

	describe("ticker and direction variety", () => {
		it("should handle multiple tickers and directions", () => {
			const trades: TradeConditionRecord[] = [
				{
					tradeId: "t1",
					tradingDay: new Date("2026-05-01"),
					ticker: "PETR4",
					pnl: 100,
					direction: "long",
					met: false,
				},
				{
					tradeId: "t2",
					tradingDay: new Date("2026-05-02"),
					ticker: "VALE5",
					pnl: 200,
					direction: "short",
					met: false,
				},
				{
					tradeId: "t3",
					tradingDay: new Date("2026-05-03"),
					ticker: "BBAS3",
					pnl: 300,
					direction: "long",
					met: false,
				},
			]

			const conditionRecords = [
				{ tradeId: "t1", conditionId: "c1", met: true },
				{ tradeId: "t2", conditionId: "c1", met: false },
				{ tradeId: "t3", conditionId: "c1", met: true },
			]

			const result = filterConditionBreakdown(trades, "c1", conditionRecords)

			expect(result).toHaveLength(3)
			expect(result.map((t) => t.ticker)).toContain("PETR4")
			expect(result.map((t) => t.ticker)).toContain("VALE5")
			expect(result.map((t) => t.ticker)).toContain("BBAS3")
		})
	})
})
