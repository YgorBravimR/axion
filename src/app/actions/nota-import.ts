"use server"

import { invalidateTradeData } from "@/lib/cache/invalidate"
import { db } from "@/db/drizzle"
import { trades, tradeExecutions, notaImports } from "@/db/schema"
import type { ActionResponse } from "@/types"
import { eq, and } from "drizzle-orm"
import { requireAuth } from "@/app/actions/auth"
import { toSafeErrorMessage } from "@/lib/error-utils"
import { getTranslations } from "next-intl/server"
import { toCents, toNumericString } from "@/lib/money"
import {
	getUserDek,
	encryptTradeFields,
	encryptExecutionFields,
} from "@/lib/user-crypto"
import { computeFileHash } from "@/lib/deduplication"
import { parseSinacorNota } from "@/lib/nota-parser/sinacor-parser"
import { matchNotaFillsToTrades } from "@/lib/nota-parser/matching-engine"
import type {
	NotaParseResult,
	NotaEnrichmentPreview,
	ConfirmedEnrichment,
	NotaFill,
} from "@/lib/nota-parser/types"

// ==========================================
// Types
// ==========================================

interface NotaImportResult {
	tradesEnriched: number
	executionsInserted: number
	errors: string[]
}

// ==========================================
// Server Action: Parse Nota PDF
// ==========================================

/**
 * Parse a SINACOR nota de corretagem PDF and return extracted fills.
 */
export const parseNotaPdf = async (
	formData: FormData
): Promise<ActionResponse<NotaParseResult>> => {
	try {
		await requireAuth()

		const file = formData.get("file") as File | null
		if (!file || file.size === 0) {
			return {
				status: "error",
				message: "No PDF file provided",
				errors: [{ code: "NO_FILE", detail: "Please upload a PDF file" }],
			}
		}

		if (!file.name.toLowerCase().endsWith(".pdf")) {
			return {
				status: "error",
				message: "File must be a PDF",
				errors: [{ code: "INVALID_FORMAT", detail: "Only PDF files are accepted" }],
			}
		}

		// Max 10MB
		if (file.size > 10 * 1024 * 1024) {
			return {
				status: "error",
				message: "File too large (max 10MB)",
				errors: [{ code: "FILE_TOO_LARGE", detail: "PDF must be under 10MB" }],
			}
		}

		const arrayBuffer = await file.arrayBuffer()
		const buffer = Buffer.from(arrayBuffer)

		const result = await parseSinacorNota(buffer)

		if (!result.success) {
			return {
				status: "error",
				message: result.errors.join("; "),
				errors: result.errors.map((e) => ({ code: "PARSE_ERROR", detail: e })),
			}
		}

		// Compute file hash server-side for dedup (crypto.createHash is Node-only)
		const fileHash = computeFileHash(buffer)
		result.fileHash = fileHash

		return {
			status: "success",
			message: `Parsed ${result.fills.length} fills from nota`,
			data: result,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to parse nota PDF",
			errors: [{ code: "PARSE_FAILED", detail: toSafeErrorMessage(error, "parseNotaPdf") }],
		}
	}
}

// ==========================================
// Server Action: Match Fills to Trades
// ==========================================

/**
 * Match extracted nota fills against existing trades for the current account.
 * Returns a preview of matches for user confirmation.
 */
export const matchNotaFills = async (
	fills: NotaFill[],
	notaDate: string,
	brokerName: string,
): Promise<ActionResponse<NotaEnrichmentPreview>> => {
	try {
		const { accountId, userId } = await requireAuth()

		if (!fills || fills.length === 0) {
			return {
				status: "error",
				message: "No fills to match",
				errors: [{ code: "NO_FILLS", detail: "No trade fills were provided" }],
			}
		}

		const parsedDate = new Date(notaDate)

		const preview = await matchNotaFillsToTrades(
			fills,
			parsedDate,
			accountId,
			userId,
		)

		// Override broker name from the parsed PDF
		preview.brokerName = brokerName

		return {
			status: "success",
			message: `Found ${preview.matches.length} matches`,
			data: preview,
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to match fills",
			errors: [{ code: "MATCH_FAILED", detail: toSafeErrorMessage(error, "matchNotaFills") }],
		}
	}
}

// ==========================================
// Server Action: Enrich Trades from Nota
// ==========================================

/**
 * Apply confirmed enrichments: upgrade trades from simple to scaled mode,
 * insert per-fill execution records.
 */
export const enrichTradesFromNota = async (
	confirmedMatches: ConfirmedEnrichment[],
	notaDate: string,
	brokerName: string,
	fileName: string,
	fileHashHex: string,
): Promise<ActionResponse<NotaImportResult>> => {
	try {
		const { accountId, userId } = await requireAuth()

		if (!confirmedMatches || confirmedMatches.length === 0) {
			return {
				status: "error",
				message: "No matches to enrich",
				errors: [{ code: "NO_MATCHES", detail: "No confirmed matches provided" }],
			}
		}

		// Check for duplicate nota import (same file already processed)
		const existingImport = await db.query.notaImports.findFirst({
			where: and(
				eq(notaImports.accountId, accountId),
				eq(notaImports.fileHash, fileHashHex),
			),
		})

		if (existingImport) {
			return {
				status: "error",
				message: "This nota has already been imported",
				errors: [{ code: "DUPLICATE_NOTA", detail: `This PDF was imported on ${existingImport.createdAt.toISOString().split("T")[0]}` }],
			}
		}

		const dek = await getUserDek(userId)
		let tradesEnriched = 0
		let executionsInserted = 0
		const errors: string[] = []

		for (const match of confirmedMatches) {
			try {
				// If re-enriching, delete existing executions first
				if (match.reEnrich) {
					await db
						.delete(tradeExecutions)
						.where(eq(tradeExecutions.tradeId, match.tradeId))
				}

				// Compute aggregates from fills
				const allEntryFills = match.entryFills
				const allExitFills = match.exitFills

				const totalEntryQty = allEntryFills.reduce((s, f) => s + f.quantity, 0)
				const totalExitQty = allExitFills.reduce((s, f) => s + f.quantity, 0)

				const avgEntryPrice = totalEntryQty > 0
					? allEntryFills.reduce((s, f) => s + f.price * f.quantity, 0) / totalEntryQty
					: 0
				const avgExitPrice = totalExitQty > 0
					? allExitFills.reduce((s, f) => s + f.price * f.quantity, 0) / totalExitQty
					: 0

				const totalContractsExecuted = totalEntryQty + totalExitQty

				// Update trade: upgrade to scaled mode with aggregated data
				const tradeUpdateData: Record<string, unknown> = {
					executionMode: "scaled",
					totalEntryQuantity: toNumericString(totalEntryQty),
					totalExitQuantity: toNumericString(totalExitQty),
					avgEntryPrice: toNumericString(avgEntryPrice),
					avgExitPrice: totalExitQty > 0 ? toNumericString(avgExitPrice) : null,
					remainingQuantity: toNumericString(Math.max(0, totalEntryQty - totalExitQty)),
					contractsExecuted: toNumericString(totalContractsExecuted),
					updatedAt: new Date(),
				}

				// Optionally update entry/exit prices with more accurate nota values
				tradeUpdateData.entryPrice = toNumericString(avgEntryPrice)
				if (totalExitQty > 0) {
					tradeUpdateData.exitPrice = toNumericString(avgExitPrice)
				}

				// Encrypt updated fields
				if (dek) {
					Object.assign(tradeUpdateData, encryptTradeFields({
						entryPrice: toNumericString(avgEntryPrice),
						exitPrice: totalExitQty > 0 ? toNumericString(avgExitPrice) : undefined,
						positionSize: toNumericString(totalEntryQty),
					}, dek))
				}

				await db
					.update(trades)
					.set(tradeUpdateData)
					.where(and(eq(trades.id, match.tradeId), eq(trades.accountId, accountId)))

				// Insert execution records for each fill
				const executionValues: Array<typeof tradeExecutions.$inferInsert> = []

				// Map to execution date from nota date
				const parsedNotaDate = new Date(notaDate)

				for (const fill of allEntryFills) {
					const execInsert: Record<string, unknown> = {
						tradeId: match.tradeId,
						executionType: "entry",
						executionDate: parsedNotaDate,
						price: toNumericString(fill.price),
						quantity: toNumericString(fill.quantity),
						commission: "0",
						fees: toNumericString(toCents(fill.operationalFee)),
						executionValue: toNumericString(toCents(fill.price * fill.quantity)),
					}

					if (dek) {
						Object.assign(execInsert, encryptExecutionFields({
							price: toNumericString(fill.price),
							quantity: toNumericString(fill.quantity),
							fees: toCents(fill.operationalFee),
							executionValue: toCents(fill.price * fill.quantity),
						}, dek))
					}

					executionValues.push(execInsert as typeof tradeExecutions.$inferInsert)
				}

				for (const fill of allExitFills) {
					const execInsert: Record<string, unknown> = {
						tradeId: match.tradeId,
						executionType: "exit",
						executionDate: parsedNotaDate,
						price: toNumericString(fill.price),
						quantity: toNumericString(fill.quantity),
						commission: "0",
						fees: toNumericString(toCents(fill.operationalFee)),
						executionValue: toNumericString(toCents(fill.price * fill.quantity)),
					}

					if (dek) {
						Object.assign(execInsert, encryptExecutionFields({
							price: toNumericString(fill.price),
							quantity: toNumericString(fill.quantity),
							fees: toCents(fill.operationalFee),
							executionValue: toCents(fill.price * fill.quantity),
						}, dek))
					}

					executionValues.push(execInsert as typeof tradeExecutions.$inferInsert)
				}

				if (executionValues.length > 0) {
					await db.insert(tradeExecutions).values(executionValues)
					executionsInserted += executionValues.length
				}

				tradesEnriched++
			} catch (error) {
				errors.push(`Trade ${match.tradeId}: ${toSafeErrorMessage(error, "enrichTrade")}`)
			}
		}

		// Record the nota import for idempotency
		await db.insert(notaImports).values({
			accountId,
			fileName,
			fileHash: fileHashHex,
			notaDate: new Date(notaDate),
			brokerName,
			totalFills: confirmedMatches.reduce((s, m) => s + m.entryFills.length + m.exitFills.length, 0),
			matchedFills: confirmedMatches.reduce((s, m) => s + m.entryFills.length + m.exitFills.length, 0),
			unmatchedFills: 0,
			tradesEnriched,
			status: errors.length > 0 ? "partial" : "completed",
		})

		invalidateTradeData(undefined, userId, accountId)

		return {
			status: errors.length === confirmedMatches.length ? "error" : "success",
			message: errors.length > 0
				? `Enriched ${tradesEnriched} trades with ${errors.length} errors`
				: `Successfully enriched ${tradesEnriched} trades with ${executionsInserted} executions`,
			data: {
				tradesEnriched,
				executionsInserted,
				errors,
			},
		}
	} catch (error) {
		return {
			status: "error",
			message: "Failed to enrich trades",
			errors: [{ code: "ENRICH_FAILED", detail: toSafeErrorMessage(error, "enrichTradesFromNota") }],
		}
	}
}
