import { describe, it, expect } from "vitest"
import { candleMathPass } from "@/lib/enrichment/passes/candle-math"
import type { Trade } from "@/db/schema"
import type { CandleRow } from "@/types/candle"
import type { EnrichmentContext } from "@/lib/enrichment/types"

// Helper to create a minimal Trade fixture
function createTrade(overrides?: Partial<Trade>): Trade {
	const now = new Date()
	const entry = new Date(now.getTime() - 60 * 60 * 1000) // 1 hour ago
	const exit = new Date(now.getTime() - 30 * 60 * 1000) // 30 mins ago

	return {
		id: "trade-123",
		accountId: "acc-123",
		asset: "ES",
		direction: "long" as const,
		timeframeId: "tf-123",
		entryDate: entry,
		exitDate: exit,
		entryPrice: "100.00",
		exitPrice: "105.00",
		positionSize: "1",
		stopLoss: null,
		takeProfit: null,
		plannedRiskAmount: null,
		plannedRMultiple: null,
		pnl: null,
		pnlPercent: null,
		pointsPnl: null,
		realizedRMultiple: null,
		oneRSnapshotCents: null,
		rOutcome: null,
		outcome: null,
		mfe: null,
		mae: null,
		mfeR: null,
		maeR: null,
		commission: null,
		fees: null,
		contractsExecuted: null,
		preTradeThoughts: null,
		postTradeReflection: null,
		lessonLearned: null,
		strategyId: null,
		strategyVersionId: null,
		setupRank: null,
		screenshotUrl: null,
		screenshotS3Key: null,
		followedPlan: null,
		disciplineNotes: null,
		rating: null,
		executionMode: "simple" as const,
		totalEntryQuantity: null,
		totalExitQuantity: null,
		avgEntryPrice: null,
		avgExitPrice: null,
		remainingQuantity: null,
		deduplicationHash: null,
		enrichmentStatus: "draft" as const,
		candleDataStatus: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		...overrides,
	}
}

// Helper to create a CandleRow fixture
function createCandle(
	timestamp: Date,
	overrides?: Partial<CandleRow>
): CandleRow {
	return {
		timestamp: timestamp.toISOString(),
		open: 100,
		high: 102,
		low: 99,
		close: 101,
		candleIndex: null,
		indicators: {},
		...overrides,
	}
}

describe("candleMathPass", () => {
	it("skips when ctx.candles is null", () => {
		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: null,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("no-candles")
		expect(result.fields).toEqual({})
	})

	it("skips when trade.exitDate is null", () => {
		const trade = createTrade({ exitDate: null })
		const ctx: EnrichmentContext = {
			candles: [createCandle(new Date())],
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("no-exit-date")
		expect(result.fields).toEqual({})
	})

	it("skips when candle window is empty", () => {
		const now = new Date()
		const entryDate = new Date(now.getTime() - 120 * 60 * 1000) // 2 hours ago
		const exitDate = new Date(now.getTime() - 60 * 60 * 1000) // 1 hour ago
		const candleTime = new Date(now.getTime() - 30 * 60 * 1000) // 30 mins ago (outside window)

		const trade = createTrade({ entryDate, exitDate })
		const ctx: EnrichmentContext = {
			candles: [createCandle(candleTime)],
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("no-candles-in-window")
		expect(result.fields).toEqual({})
	})

	it("computes MFE/MAE correctly for long trade", () => {
		const entryDate = new Date("2026-06-16T10:00:00Z")
		const exitDate = new Date("2026-06-16T11:00:00Z")

		const trade = createTrade({
			direction: "long",
			entryPrice: "100.00",
			entryDate,
			exitDate,
		})

		const candles: CandleRow[] = [
			createCandle(new Date("2026-06-16T10:15:00Z"), { high: 102, low: 99 }),
			createCandle(new Date("2026-06-16T10:30:00Z"), { high: 105, low: 98 }),
			createCandle(new Date("2026-06-16T10:45:00Z"), { high: 103, low: 97 }),
		]

		const ctx: EnrichmentContext = {
			candles,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields["mfe"]?.value).toBe(5) // 105 - 100
		expect(result.fields["mae"]?.value).toBe(3) // 100 - 97
		expect(result.fields["mfe"]?.confidence).toBe("high")
		expect(result.fields["mae"]?.confidence).toBe("high")
	})

	it("computes MFE/MAE correctly for short trade", () => {
		const entryDate = new Date("2026-06-16T10:00:00Z")
		const exitDate = new Date("2026-06-16T11:00:00Z")

		const trade = createTrade({
			direction: "short",
			entryPrice: "100.00",
			entryDate,
			exitDate,
		})

		const candles: CandleRow[] = [
			createCandle(new Date("2026-06-16T10:15:00Z"), { high: 102, low: 99 }),
			createCandle(new Date("2026-06-16T10:30:00Z"), { high: 105, low: 98 }),
			createCandle(new Date("2026-06-16T10:45:00Z"), { high: 103, low: 97 }),
		]

		const ctx: EnrichmentContext = {
			candles,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields["mfe"]?.value).toBe(3) // 100 - 97
		expect(result.fields["mae"]?.value).toBe(5) // 105 - 100
		expect(result.fields["mfe"]?.confidence).toBe("high")
		expect(result.fields["mae"]?.confidence).toBe("high")
	})

	it("computes holdingMs from entryDate and exitDate", () => {
		const entryDate = new Date("2026-06-16T10:00:00Z")
		const exitDate = new Date("2026-06-16T11:00:00Z")

		const trade = createTrade({ entryDate, exitDate })

		const candles: CandleRow[] = [
			createCandle(new Date("2026-06-16T10:15:00Z"), { high: 102, low: 99 }),
		]

		const ctx: EnrichmentContext = {
			candles,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields["holdingMs"]?.value).toBe(60 * 60 * 1000) // 1 hour in ms
	})

	it("assigns confidence high with >= 3 candles", () => {
		const entryDate = new Date("2026-06-16T10:00:00Z")
		const exitDate = new Date("2026-06-16T11:00:00Z")

		const trade = createTrade({ entryDate, exitDate })

		const candles: CandleRow[] = [
			createCandle(new Date("2026-06-16T10:15:00Z")),
			createCandle(new Date("2026-06-16T10:30:00Z")),
			createCandle(new Date("2026-06-16T10:45:00Z")),
		]

		const ctx: EnrichmentContext = {
			candles,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.fields["mfe"]?.confidence).toBe("high")
		expect(result.fields["mae"]?.confidence).toBe("high")
	})

	it("assigns confidence medium with 1-2 candles", () => {
		const entryDate = new Date("2026-06-16T10:00:00Z")
		const exitDate = new Date("2026-06-16T11:00:00Z")

		const trade = createTrade({ entryDate, exitDate })

		const candles: CandleRow[] = [
			createCandle(new Date("2026-06-16T10:15:00Z")),
			createCandle(new Date("2026-06-16T10:30:00Z")),
		]

		const ctx: EnrichmentContext = {
			candles,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.fields["mfe"]?.confidence).toBe("medium")
		expect(result.fields["mae"]?.confidence).toBe("medium")
	})

	it("flags conflictsWithCurrent when trade has different mfe", () => {
		const entryDate = new Date("2026-06-16T10:00:00Z")
		const exitDate = new Date("2026-06-16T11:00:00Z")

		const trade = createTrade({
			direction: "long",
			entryPrice: "100.00",
			entryDate,
			exitDate,
			mfe: 2.5, // Different from computed 5
		})

		const candles: CandleRow[] = [
			createCandle(new Date("2026-06-16T10:15:00Z"), { high: 105, low: 99 }),
		]

		const ctx: EnrichmentContext = {
			candles,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.fields["mfe"]?.conflictsWithCurrent).toBe(true)
		expect(result.fields["mae"]?.conflictsWithCurrent).toBe(false)
	})

	it("returns failed status on thrown error (NaN candle prices)", () => {
		const entryDate = new Date("2026-06-16T10:00:00Z")
		const exitDate = new Date("2026-06-16T11:00:00Z")

		const trade = createTrade({
			entryPrice: "100.00",
			entryDate,
			exitDate,
		})

		// Create candles with NaN values that will cause computation to fail
		const candles: CandleRow[] = [
			createCandle(new Date("2026-06-16T10:15:00Z"), {
				high: NaN,
				low: 99,
			}),
		]

		const ctx: EnrichmentContext = {
			candles,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.passStatus).toBe("failed")
		expect(result.errorMessage).toBeDefined()
		expect(result.fields).toEqual({})
	})

	it("handles Date objects and ISO strings for timestamps", () => {
		const entryDate = new Date("2026-06-16T10:00:00Z")
		const exitDate = new Date("2026-06-16T11:00:00Z")

		// Use string timestamps (as they come from DB)
		const trade = createTrade({
			entryDate: entryDate.toISOString(),
			exitDate: exitDate.toISOString(),
		})

		const candles: CandleRow[] = [
			createCandle(new Date("2026-06-16T10:15:00Z")),
		]

		const ctx: EnrichmentContext = {
			candles,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields["holdingMs"]?.value).toBe(60 * 60 * 1000)
	})
})
