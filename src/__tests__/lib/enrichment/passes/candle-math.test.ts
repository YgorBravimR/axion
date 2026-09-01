import { describe, it, expect } from "vitest"
import { candleMathPass } from "@/lib/enrichment/passes/candle-math"
import type { Trade } from "@/db/schema"
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
		beOutcome: null,
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
		enrichmentStatus: "pending" as const,
		enrichmentVersion: 0,
		enrichedAt: null,
		enrichmentOpsStatus: null,
		enrichmentCandleStatus: null,
		enrichmentIndicatorStatus: null,
		enrichmentSlTargetStatus: null,
		indicatorReadout: null,
		profitOperationNumber: null,
		profitMetadata: null,
		createdAt: new Date(),
		updatedAt: new Date(),
		isArchived: false,
		source: null,
		...overrides,
	}
}

describe("candleMathPass", () => {
	it("skips when trade.exitDate is null", () => {
		const trade = createTrade({ exitDate: null })
		const ctx: EnrichmentContext = {
			candles: null,
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

	it("computes holdingMs from entryDate and exitDate", () => {
		const entryDate = new Date("2026-06-16T10:00:00Z")
		const exitDate = new Date("2026-06-16T11:00:00Z")

		const trade = createTrade({ entryDate, exitDate })

		const ctx: EnrichmentContext = {
			candles: null,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields["holdingMs"]?.value).toBe(60 * 60 * 1000) // 1 hour in ms
		expect(result.fields["holdingMs"]?.confidence).toBe("high")
		expect(result.fields["holdingMs"]?.conflictsWithCurrent).toBe(false)
	})

	it("handles Date objects and ISO strings for timestamps", () => {
		const entryDate = new Date("2026-06-16T10:00:00Z")
		const exitDate = new Date("2026-06-16T10:30:00Z")

		const trade = createTrade({
			entryDate,
			exitDate,
		})

		const ctx: EnrichmentContext = {
			candles: null,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 50,
		}

		const result = candleMathPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields["holdingMs"]?.value).toBe(30 * 60 * 1000) // 30 mins
	})
})
