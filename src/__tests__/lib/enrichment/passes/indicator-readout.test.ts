import { describe, it, expect, vi, beforeEach } from "vitest"
import { indicatorReadoutPass } from "@/lib/enrichment/passes/indicator-readout"
import type { EnrichmentContext, EnrichmentField } from "@/lib/enrichment/types"
import type { Trade } from "@/db/schema"
import type {
	HawksIndicatorSnapshot,
	HawksTripleScreenConfig,
} from "@/types/backtest"
import * as hawksIndicatorsModule from "@/lib/backtest/hawks-indicators"

vi.mock("@/lib/backtest/hawks-indicators")

// Minimal Trade fixture
const createTrade = (overrides?: Partial<Trade>): Trade => ({
	id: "trade-123",
	accountId: "account-1",
	entryDate: new Date("2026-06-15T09:35:00Z"),
	exitDate: new Date("2026-06-15T10:15:00Z"),
	asset: "WIN",
	direction: "long",
	entryPrice: "75500",
	exitPrice: "75600",
	positionSize: "10",
	timeframeId: null,
	pnl: "1000",
	pnlPercent: null,
	pointsPnl: null,
	mfe: null,
	mae: null,
	mfeR: null,
	maeR: null,
	stopLoss: null,
	takeProfit: null,
	plannedRiskAmount: null,
	plannedRMultiple: null,
	realizedRMultiple: null,
	oneRSnapshotCents: null,
	rOutcome: null,
	outcome: null,
	commission: null,
	fees: null,
	contractsExecuted: null,
	preTradeThoughts: null,
	postTradeReflection: null,
	lessonLearned: null,
	profitOperationNumber: null,
	profitMetadata: null,
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
	createdAt: new Date(),
	updatedAt: new Date(),
	isArchived: false,
	source: null,
	...overrides,
})

// Minimal HawksTripleScreenConfig fixture
const createHawksConfig = (
	overrides?: Partial<HawksTripleScreenConfig>
): HawksTripleScreenConfig => ({
	ema27_60m_key: "mme27_60m",
	ema55_60m_key: "mme55_60m",
	ema27_15m_key: "mme27_15m",
	ema55_15m_key: "mme55_15m",
	prev_15m_open_key: "prev_15m_open",
	prev_15m_close_key: "prev_15m_close",
	prev_60m_open_key: "prev_60m_open",
	prev_60m_close_key: "prev_60m_close",
	macd_key: "macd1_histo",
	vwap_d_key: "vwap_d",
	vwap_m_key: "vwap_m",
	vwap_w_key: "vwap_w",
	ajuste_key: "ajuste",
	keltner_inner_inf_key: "kc1_inf",
	keltner_inner_sup_key: "kc1_sup",
	keltner_outer_inf_key: "kc2_inf",
	keltner_outer_sup_key: "kc2_sup",
	aggression_key: "agr_saldo",
	volume_key: "volume_fin",
	brickSize5mPoints: 100,
	startTime: 930,
	endTime: 1730,
	...overrides,
})

// Minimal HawksIndicatorSnapshot fixture
const createIndicatorSnapshot = (
	overrides?: Partial<HawksIndicatorSnapshot>
): HawksIndicatorSnapshot => ({
	candleTimestamp: "2026-06-15T09:35:00Z",
	direction: "long",
	gate15m: { state: "above_both", favorable: true },
	gate60m: { state: "above_both", favorable: true },
	macd: { sign: "positive", favorable: true },
	vwapD: { side: "above", favorable: true },
	vwapM: { side: "above", favorable: true },
	vwapW: { side: "above", favorable: false },
	ajuste: { position: "above", favorable: true },
	favorableCount: 6,
	...overrides,
})

describe("indicatorReadoutPass", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("should skip when ctx.candles is null", () => {
		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: null,
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("no-candles-or-config")
		expect(result.fields).toEqual({})
		expect(result.tradeId).toBe(trade.id)
		expect(result.source).toBe("indicator-readout")
	})

	it("should skip when ctx.hawksConfig is null", () => {
		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("no-candles-or-config")
		expect(result.fields).toEqual({})
	})

	it("should skip when getHawksIndicatorsAt returns null (no candle at/before entry)", () => {
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(null)

		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("no-candle-at-entry")
		expect(result.fields).toEqual({})
	})

	it("should succeed and write indicatorReadout + setupRank when snapshot is returned", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 6 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(result.fields.indicatorReadout).toBeDefined()
		expect(result.fields.setupRank).toBeDefined()
	})

	it("should assign setupRank = AAA when favorableCount=6", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 6 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		const field = result.fields.setupRank as EnrichmentField
		expect(field.value).toBe("AAA")
		expect(field.derivation).toBe("favorableCount=6/7")
	})

	it("should assign setupRank = AA when favorableCount=5", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 5 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		const field = result.fields.setupRank as EnrichmentField
		expect(field.value).toBe("AA")
	})

	it("should assign setupRank = A when favorableCount=4", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 4 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		const field = result.fields.setupRank as EnrichmentField
		expect(field.value).toBe("A")
	})

	it("should not set setupRank when favorableCount=3 (< 4 threshold)", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 3 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		expect(result.fields.setupRank).toBeUndefined()
	})

	it("should not set setupRank when favorableCount=1 (< 4 threshold)", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 1 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		expect(result.fields.setupRank).toBeUndefined()
	})

	it("should set confidence=high when favorableCount≥4", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 6 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		const readoutField = result.fields.indicatorReadout as EnrichmentField
		const rankField = result.fields.setupRank as EnrichmentField
		expect(readoutField.confidence).toBe("high")
		expect(rankField.confidence).toBe("high")
	})

	it("should set confidence=medium when favorableCount is 2–3", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 2 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		const readoutField = result.fields.indicatorReadout as EnrichmentField
		expect(readoutField.confidence).toBe("medium")
	})

	it("should set conflictsWithCurrent=false when trade.indicatorReadout is null", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 5 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade({ indicatorReadout: null })
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		const readoutField = result.fields.indicatorReadout as EnrichmentField
		expect(readoutField.conflictsWithCurrent).toBe(false)
	})

	it("should set conflictsWithCurrent=false when snapshot exactly matches trade.indicatorReadout", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 5 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade({
			indicatorReadout: snapshot as unknown as Record<string, unknown>,
		})
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		const readoutField = result.fields.indicatorReadout as EnrichmentField
		expect(readoutField.conflictsWithCurrent).toBe(false)
	})

	it("should set conflictsWithCurrent=true when snapshot differs from trade.indicatorReadout", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 5 })
		const differentSnapshot = createIndicatorSnapshot({ favorableCount: 3 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade({
			indicatorReadout: differentSnapshot as unknown as Record<string, unknown>,
		})
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		const readoutField = result.fields.indicatorReadout as EnrichmentField
		expect(readoutField.conflictsWithCurrent).toBe(true)
	})

	it("should return passStatus=failed when getHawksIndicatorsAt throws an error", () => {
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockImplementation(
			() => {
				throw new Error("Mock error from hawks-indicators")
			}
		)

		const trade = createTrade()
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		expect(result.passStatus).toBe("failed")
		expect(result.errorMessage).toBe("Mock error from hawks-indicators")
		expect(result.fields).toEqual({})
	})

	it("should handle trade.entryDate as a Date object", () => {
		const snapshot = createIndicatorSnapshot({ favorableCount: 4 })
		vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mockReturnValue(
			snapshot
		)

		const trade = createTrade({ entryDate: new Date("2026-06-15T09:35:00Z") })
		const ctx: EnrichmentContext = {
			candles: [],
			profitOperation: null,
			hawksConfig: createHawksConfig(),
			brickSize5mPoints: 100,
			pointValue: 5,
		}

		const result = indicatorReadoutPass(trade, ctx)

		expect(result.passStatus).toBe("succeeded")
		expect(
			vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt)
		).toHaveBeenCalled()
		const callArgs = vi.mocked(hawksIndicatorsModule.getHawksIndicatorsAt).mock
			.calls[0]
		expect(callArgs).toBeDefined()
		expect(callArgs?.[1]).toBe("2026-06-15T09:35:00.000Z")
	})
})
