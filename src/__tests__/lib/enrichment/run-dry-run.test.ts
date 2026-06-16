import { describe, expect, it } from "vitest"
import type { Trade } from "@/db/schema"
import type { ProfitChartOperation } from "@/lib/csv-parser"
import { runDryRun } from "@/lib/enrichment/run-dry-run"
import type { EnrichmentContext } from "@/lib/enrichment/types"
import type { CandleRow } from "@/types/candle"
import { DEFAULT_HAWKS_CONFIG } from "@/__tests__/helpers/hawks-config"

const ENTRY_AT = "2026-06-15T12:30:00.000Z"
const EXIT_AT = "2026-06-15T13:00:00.000Z"
const ENTRY_PRICE = 75500
const BRICK_SIZE_POINTS = 100

const makeTrade = (overrides: Partial<Trade> = {}): Trade =>
	({
		id: "trade-int-1",
		asset: "WIN",
		direction: "long",
		entryDate: new Date(ENTRY_AT),
		exitDate: new Date(EXIT_AT),
		entryPrice: String(ENTRY_PRICE),
		exitPrice: null,
		positionSize: null,
		pnl: null,
		mfe: null,
		mae: null,
		stopLoss: null,
		takeProfit: null,
		profitOperationNumber: 42,
		profitMetadata: null,
		indicatorReadout: null,
		...overrides,
	}) as Trade

const makeOperation = (
	overrides: Partial<ProfitChartOperation> = {}
): ProfitChartOperation =>
	({
		asset: "WIN",
		direction: "long",
		entryDate: new Date(ENTRY_AT),
		exitDate: new Date(EXIT_AT),
		entryPrice: ENTRY_PRICE,
		exitPrice: 75620,
		positionSize: 5,
		pnl: 600,
		normalizedAsset: "WIN",
		originalAssetCode: "WING26",
		isFutures: true,
		isReplayTrade: false,
		profitOperationNumber: 42,
		profitMetadata: {
			marketPriceAtClose: 75620,
			wasAveraged: false,
			profitDrawdown: 100,
			profitGanhoMax: 800,
			profitPerdaMax: -200,
			profitMep: 800,
			profitMen: -200,
		},
		...overrides,
	}) as ProfitChartOperation

const candleAt = (
	iso: string,
	overrides: Partial<CandleRow> = {}
): CandleRow => ({
	timestamp: iso,
	open: 75490,
	high: 75600,
	low: 75450,
	close: 75520,
	candleIndex: 1,
	indicators: {
		[DEFAULT_HAWKS_CONFIG.prev_15m_open_key]: 75300,
		[DEFAULT_HAWKS_CONFIG.prev_15m_close_key]: 75350,
		[DEFAULT_HAWKS_CONFIG.ema27_15m_key]: 75200,
		[DEFAULT_HAWKS_CONFIG.ema55_15m_key]: 75100,
		[DEFAULT_HAWKS_CONFIG.prev_60m_open_key]: 75250,
		[DEFAULT_HAWKS_CONFIG.prev_60m_close_key]: 75300,
		[DEFAULT_HAWKS_CONFIG.ema27_60m_key]: 75150,
		[DEFAULT_HAWKS_CONFIG.ema55_60m_key]: 75050,
		[DEFAULT_HAWKS_CONFIG.macd_key]: 12,
		[DEFAULT_HAWKS_CONFIG.vwap_d_key]: 75400,
		[DEFAULT_HAWKS_CONFIG.vwap_m_key]: 75450,
		[DEFAULT_HAWKS_CONFIG.vwap_w_key]: 75420,
		[DEFAULT_HAWKS_CONFIG.ajuste_key]: 75300,
	},
	...overrides,
})

describe("runDryRun (integration)", () => {
	it("all four passes succeed when every prerequisite is provided", () => {
		const trade = makeTrade()
		const operation = makeOperation()
		const candles: CandleRow[] = [
			candleAt("2026-06-15T12:25:00.000Z"),
			candleAt(ENTRY_AT),
			candleAt("2026-06-15T12:45:00.000Z", { high: 75700, low: 75480 }),
			candleAt("2026-06-15T12:55:00.000Z", { high: 75650, low: 75500 }),
		]
		const ctx: EnrichmentContext = {
			candles,
			profitOperation: operation,
			hawksConfig: DEFAULT_HAWKS_CONFIG,
			brickSize5mPoints: BRICK_SIZE_POINTS,
			pointValue: 5,
		}

		const result = runDryRun(trade, ctx)

		expect(result.passes.operations.passStatus).toBe("succeeded")
		expect(result.passes.candleMath.passStatus).toBe("succeeded")
		expect(result.passes.indicatorReadout.passStatus).toBe("succeeded")
		expect(result.passes.deterministicSlTarget.passStatus).toBe("succeeded")

		expect(result.computedStatus).toBe("ready-to-commit")
		expect(result.indicatorReadout).not.toBeNull()
		expect(result.indicatorReadout?.direction).toBe("long")

		expect(result.mergedFields.entryPrice).toBeUndefined()
		expect(result.mergedFields.exitPrice).toBeDefined()
		expect(result.mergedFields.stopLoss).toBeDefined()
		expect(result.mergedFields.takeProfit).toBeDefined()
		expect(result.mergedFields.stopLoss!.value).toBeCloseTo(
			ENTRY_PRICE - 2 * BRICK_SIZE_POINTS,
			2
		)
		expect(result.mergedFields.takeProfit!.value).toBeCloseTo(
			ENTRY_PRICE + 6 * BRICK_SIZE_POINTS,
			2
		)
	})

	it("each pass skips independently when its prerequisite is missing", () => {
		const trade = makeTrade()
		const ctx: EnrichmentContext = {
			candles: null,
			profitOperation: null,
			hawksConfig: null,
			brickSize5mPoints: null,
			pointValue: 5,
		}

		const result = runDryRun(trade, ctx)

		expect(result.passes.operations.passStatus).toBe("skipped")
		expect(result.passes.candleMath.passStatus).toBe("skipped")
		expect(result.passes.indicatorReadout.passStatus).toBe("skipped")
		expect(result.passes.deterministicSlTarget.passStatus).toBe("skipped")
		expect(result.computedStatus).toBe("no-changes")
		expect(result.indicatorReadout).toBeNull()
		expect(result.mergedFields).toEqual({})
	})

	it("computedStatus is 'partial' when at least one pass fails", () => {
		const trade = makeTrade()
		const operation = makeOperation()
		Object.defineProperty(operation, "entryPrice", {
			get() {
				throw new Error("simulated csv corruption")
			},
		})
		const ctx: EnrichmentContext = {
			candles: null,
			profitOperation: operation,
			hawksConfig: null,
			brickSize5mPoints: BRICK_SIZE_POINTS,
			pointValue: 5,
		}

		const result = runDryRun(trade, ctx)

		expect(result.passes.operations.passStatus).toBe("failed")
		expect(result.passes.deterministicSlTarget.passStatus).toBe("succeeded")
		expect(result.computedStatus).toBe("partial")
	})
})
