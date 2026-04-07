/**
 * Types for SINACOR nota de corretagem parsing and trade enrichment.
 *
 * SINACOR is the standard brokerage note system used by all B3 brokers
 * (Genial, Clear, XP, etc.), so these types work across brokers.
 */

import type { Trade } from "@/db/schema"

/** A single fill (execution) extracted from the nota PDF */
interface NotaFill {
	sequenceNumber: number
	exchange: string // "BOVESPA" | "BMF"
	side: "C" | "V" // C = Compra (Buy), V = Venda (Sell)
	marketType: string // "VISTA", "FUTURO", "DAY TRADE"
	rawAsset: string // Original from PDF e.g. "WIN G26"
	normalizedAsset: string // Normalized e.g. "WIN"
	expiryDate: string | null // e.g. "18/02/2026"
	quantity: number
	price: number
	operationValue: number
	debitCredit: "D" | "C" // D = Debit (cost), C = Credit (income)
	operationalFee: number
	isDayTrade: boolean
}

/** Result of parsing a nota de corretagem PDF */
interface NotaParseResult {
	success: boolean
	brokerName: string
	notaNumber: string
	notaDate: Date
	fills: NotaFill[]
	fileHash: string // SHA-256 of PDF content (computed server-side for dedup)
	// Financial summary from the nota footer
	totalOperationValue: number
	totalBrokerage: number
	settlementFee: number
	registrationFee: number
	bmfFees: number
	irrf: number
	netTotal: number
	netTotalDebitCredit: "D" | "C"
	errors: string[]
	warnings: string[]
}

/** Fills grouped by asset and date for matching against existing trades */
interface AssetFillGroup {
	asset: string // Normalized asset (e.g. "WIN")
	date: Date
	buyFills: NotaFill[]
	sellFills: NotaFill[]
	totalBuyQty: number
	totalSellQty: number
	weightedAvgBuyPrice: number
	weightedAvgSellPrice: number
}

/** A match between nota fills and an existing trade */
interface EnrichmentMatch {
	tradeId: string
	trade: Trade
	status: "matched" | "ambiguous" | "already_enriched" | "quantity_mismatch" | "price_mismatch"
	entryFills: NotaFill[]
	exitFills: NotaFill[]
	computedAvgEntry: number
	computedAvgExit: number
	priceDeltaPercent: number
	message?: string
}

/** Full preview of the enrichment before user confirmation */
interface NotaEnrichmentPreview {
	notaDate: Date
	brokerName: string
	totalFills: number
	matches: EnrichmentMatch[]
	unmatchedFills: NotaFill[]
	unmatchedTrades: Trade[]
	warnings: string[]
}

/** User-confirmed enrichment to apply */
interface ConfirmedEnrichment {
	tradeId: string
	entryFills: NotaFill[]
	exitFills: NotaFill[]
	reEnrich: boolean // If true, replaces existing executions
}

export type {
	NotaFill,
	NotaParseResult,
	AssetFillGroup,
	EnrichmentMatch,
	NotaEnrichmentPreview,
	ConfirmedEnrichment,
}
