import { describe, it, expect } from "vitest"
import { deterministicSlTargetPass } from "@/lib/enrichment/passes/deterministic-sl-target"
import type { Trade } from "@/db/schema"
import type { EnrichmentContext } from "@/lib/enrichment/types"

// Minimal Trade fixture builder
function createTrade(overrides: Partial<Trade> = {}): Trade {
	return {
		id: "test-trade-1",
		accountId: null,
		asset: "WIN",
		direction: "long" as const,
		timeframeId: null,
		entryDate: new Date("2026-06-16T10:00:00Z"),
		exitDate: null,
		entryPrice: "171140.00",
		exitPrice: null,
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
		executionMode: "simple",
		totalEntryQuantity: null,
		totalExitQuantity: null,
		avgEntryPrice: null,
		avgExitPrice: null,
		remainingQuantity: null,
		deduplicationHash: null,
		enrichmentStatus: "pending",
		enrichmentVersion: 0,
		enrichedAt: null,
		enrichmentOpsStatus: null,
		enrichmentCandleStatus: null,
		enrichmentIndicatorStatus: null,
		enrichmentSlTargetStatus: null,
		indicatorReadout: null,
		profitOperationNumber: null,
		profitMetadata: null,
		createdAt: new Date("2026-06-16T10:00:00Z"),
		updatedAt: new Date("2026-06-16T10:00:00Z"),
		isArchived: false,
		source: null,
		...overrides,
	}
}

function createContext(
	overrides: Partial<EnrichmentContext> = {}
): EnrichmentContext {
	return {
		candles: null,
		profitOperation: null,
		hawksConfig: null,
		brickSize5mPoints: 100,
		pointValue: 1,
		...overrides,
	}
}

describe("deterministicSlTargetPass", () => {
	it("skips when ctx.brickSize5mPoints is null", () => {
		const trade = createTrade()
		const ctx = createContext({ brickSize5mPoints: null })

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("no-brick-size-config")
		expect(result.fields).toEqual({})
	})

	it("skips when trade.entryPrice is null", () => {
		const trade = createTrade({ entryPrice: null as unknown as string })
		const ctx = createContext()

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("no-entry-price")
		expect(result.fields).toEqual({})
	})

	it("skips when trade.entryPrice is NaN-like (malformed)", () => {
		const trade = createTrade({ entryPrice: "" })
		const ctx = createContext()

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("no-entry-price")
		expect(result.fields).toEqual({})
	})

	it("computes SL and TP for long trade: entry=171140, brickSize=100", () => {
		const trade = createTrade({
			direction: "long",
			entryPrice: "171140",
		})
		const ctx = createContext({ brickSize5mPoints: 100 })

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields.stopLoss?.value).toBe(170940) // 171140 - 200
		expect(result.fields.takeProfit?.value).toBe(171740) // 171140 + 600
		expect(result.fields.stopLoss?.conflictsWithCurrent).toBe(false)
		expect(result.fields.takeProfit?.conflictsWithCurrent).toBe(false)
	})

	it("computes SL and TP for short trade: entry=171140, brickSize=100", () => {
		const trade = createTrade({
			direction: "short",
			entryPrice: "171140",
		})
		const ctx = createContext({ brickSize5mPoints: 100 })

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields.stopLoss?.value).toBe(171340) // 171140 + 200
		expect(result.fields.takeProfit?.value).toBe(170540) // 171140 - 600
		expect(result.fields.stopLoss?.conflictsWithCurrent).toBe(false)
		expect(result.fields.takeProfit?.conflictsWithCurrent).toBe(false)
	})

	it("handles R20 brick size (95 points): entry=171000, long", () => {
		const trade = createTrade({
			direction: "long",
			entryPrice: "171000",
		})
		// R20 = (20-1) * 5 = 95 points
		const ctx = createContext({ brickSize5mPoints: 95 })

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields.stopLoss?.value).toBe(170810) // 171000 - 190
		expect(result.fields.takeProfit?.value).toBe(171570) // 171000 + 570
	})

	it("detects conflictsWithCurrent when trade.stopLoss differs", () => {
		const trade = createTrade({
			direction: "long",
			entryPrice: "171140",
			stopLoss: "171000", // Different from computed 170940
		})
		const ctx = createContext({ brickSize5mPoints: 100 })

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields.stopLoss?.conflictsWithCurrent).toBe(true)
		expect(result.fields.takeProfit?.conflictsWithCurrent).toBe(false)
	})

	it("detects no conflict when trade.stopLoss matches", () => {
		const trade = createTrade({
			direction: "long",
			entryPrice: "171140",
			stopLoss: "170940", // Matches computed value
		})
		const ctx = createContext({ brickSize5mPoints: 100 })

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields.stopLoss?.conflictsWithCurrent).toBe(false)
	})

	it("sets confidence to 'high' for both fields", () => {
		const trade = createTrade()
		const ctx = createContext()

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.fields.stopLoss?.confidence).toBe("high")
		expect(result.fields.takeProfit?.confidence).toBe("high")
	})

	it("includes brickSize in derivation strings", () => {
		const trade = createTrade()
		const ctx = createContext({ brickSize5mPoints: 100 })

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.fields.stopLoss?.derivation).toContain("100")
		expect(result.fields.takeProfit?.derivation).toContain("100")
	})

	it("returns succeeded with fields even when both already match", () => {
		const trade = createTrade({
			direction: "long",
			entryPrice: "171140",
			stopLoss: "170940",
			takeProfit: "171740",
		})
		const ctx = createContext({ brickSize5mPoints: 100 })

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields.stopLoss?.value).toBe(170940)
		expect(result.fields.takeProfit?.value).toBe(171740)
		expect(result.fields.stopLoss?.conflictsWithCurrent).toBe(false)
		expect(result.fields.takeProfit?.conflictsWithCurrent).toBe(false)
	})

	it("parses entryPrice as string and computes correctly", () => {
		const trade = createTrade({
			direction: "long",
			entryPrice: "171140.50", // String with decimals
		})
		const ctx = createContext({ brickSize5mPoints: 100 })

		const result = deterministicSlTargetPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields.stopLoss?.value).toBe(170940.5) // 171140.5 - 200
		expect(result.fields.takeProfit?.value).toBe(171740.5) // 171140.5 + 600
	})
})
