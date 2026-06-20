import { describe, it, expect } from "vitest"
import type { Trade } from "@/db/schema"
import type { ProfitChartOperation } from "@/lib/csv-parser"
import { operationsPass } from "@/lib/enrichment/passes/operations"
import type { EnrichmentContext, EnrichmentField } from "@/lib/enrichment/types"

const makeTrade = (overrides: Partial<Trade> = {}): Trade => {
	return {
		id: "trade-1",
		asset: "WIN",
		direction: "long",
		entryDate: new Date("2026-06-15T09:30:00Z"),
		exitDate: new Date("2026-06-15T10:15:00Z"),
		entryPrice: null,
		exitPrice: null,
		positionSize: null,
		pnl: null,
		mfe: null,
		mae: null,
		profitOperationNumber: 42,
		profitMetadata: null,
		indicatorReadout: null,
		stopLoss: null,
		takeProfit: null,
		...overrides,
	} as Trade
}

const makeOperation = (
	overrides: Partial<ProfitChartOperation> = {}
): ProfitChartOperation => {
	return {
		asset: "WIN",
		direction: "long",
		entryDate: new Date("2026-06-15T09:30:00Z"),
		exitDate: new Date("2026-06-15T10:15:00Z"),
		entryPrice: 75500,
		exitPrice: 75600,
		positionSize: 10,
		pnl: 1000,
		normalizedAsset: "WIN",
		originalAssetCode: "WING26",
		isFutures: true,
		isReplayTrade: false,
		profitOperationNumber: 42,
		profitMetadata: {
			marketPriceAtClose: null,
			wasAveraged: false,
			profitDrawdown: null,
			profitGanhoMax: null,
			profitPerdaMax: null,
			profitMep: 1500,
			profitMen: -750,
		},
		...overrides,
	} as ProfitChartOperation
}

const baseCtx: EnrichmentContext = {
	candles: null,
	profitOperation: null,
	hawksConfig: null,
	brickSize5mPoints: null,
	pointValue: 5,
}

describe("operationsPass", () => {
	it("skips when ctx.profitOperation is null", () => {
		const result = operationsPass(makeTrade(), { ...baseCtx })
		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("no-profit-operation")
		expect(result.fields).toEqual({})
		expect(result.source).toBe("ops-csv")
	})

	it("skips when operation number mismatches trade's profitOperationNumber", () => {
		const trade = makeTrade({ profitOperationNumber: 42 })
		const operation = makeOperation({ profitOperationNumber: 99 })
		const result = operationsPass(trade, {
			...baseCtx,
			profitOperation: operation,
		})
		expect(result.passStatus).toBe("skipped")
		expect(result.skipReason).toBe("operation-mismatch")
	})

	it("succeeds with empty fields when trade already matches operation", () => {
		const trade = makeTrade({
			entryPrice: "75500",
			exitPrice: "75600",
			positionSize: "10",
			pnl: "1000",
			mfe: "1500",
			mae: "-750",
		})
		const result = operationsPass(trade, {
			...baseCtx,
			profitOperation: makeOperation(),
		})
		expect(result.passStatus).toBe("succeeded")
		expect(result.fields).toEqual({})
	})

	it("populates entryPrice when trade's current is null", () => {
		const result = operationsPass(makeTrade(), {
			...baseCtx,
			profitOperation: makeOperation(),
		})
		expect(result.passStatus).toBe("succeeded")
		const field = result.fields.entryPrice as EnrichmentField
		expect(field).toBeDefined()
		expect(field.value).toBe(75500)
		expect(field.source).toBe("ops-csv")
		expect(field.confidence).toBe("high")
		expect(field.conflictsWithCurrent).toBe(false)
		expect(field.derivation).toContain("row #42")
	})

	it("flags conflictsWithCurrent when current value differs", () => {
		const trade = makeTrade({ entryPrice: "75400" })
		const result = operationsPass(trade, {
			...baseCtx,
			profitOperation: makeOperation(),
		})
		const field = result.fields.entryPrice as EnrichmentField
		expect(field.conflictsWithCurrent).toBe(true)
		expect(field.value).toBe(75500)
	})

	it("populates exitPrice, positionSize, and pnl correctly", () => {
		const result = operationsPass(makeTrade(), {
			...baseCtx,
			profitOperation: makeOperation(),
		})
		expect((result.fields.exitPrice as EnrichmentField).value).toBe(75600)
		expect((result.fields.positionSize as EnrichmentField).value).toBe(10)
		expect((result.fields.pnl as EnrichmentField).value).toBe(1000)
	})

	it("reads MEP as mfe and MEN as mae from profitMetadata", () => {
		const result = operationsPass(makeTrade(), {
			...baseCtx,
			profitOperation: makeOperation(),
		})
		expect((result.fields.mfe as EnrichmentField).value).toBe(1500)
		expect((result.fields.mae as EnrichmentField).value).toBe(-750)
	})

	it("every emitted field carries source, confidence, derivation", () => {
		const result = operationsPass(makeTrade(), {
			...baseCtx,
			profitOperation: makeOperation(),
		})
		for (const field of Object.values(result.fields)) {
			const f = field as EnrichmentField
			expect(f.source).toBe("ops-csv")
			expect(f.confidence).toBe("high")
			expect(f.derivation).toBe("Profit Pro Operações CSV row #42")
		}
	})

	it("skips mfe / mae when profitMetadata MEP/MEN are null", () => {
		const operation = makeOperation({
			profitMetadata: {
				marketPriceAtClose: null,
				wasAveraged: false,
				profitDrawdown: null,
				profitGanhoMax: null,
				profitPerdaMax: null,
				profitMep: null,
				profitMen: null,
			},
		})
		const result = operationsPass(makeTrade(), {
			...baseCtx,
			profitOperation: operation,
		})
		expect(result.fields.mfe).toBeUndefined()
		expect(result.fields.mae).toBeUndefined()
	})

	it("returns failed status when extraction throws", () => {
		const trade = makeTrade()
		const operation = makeOperation()
		Object.defineProperty(operation, "entryPrice", {
			get() {
				throw new Error("boom")
			},
		})
		const result = operationsPass(trade, {
			...baseCtx,
			profitOperation: operation,
		})
		expect(result.passStatus).toBe("failed")
		expect(result.errorMessage).toContain("boom")
	})
})
