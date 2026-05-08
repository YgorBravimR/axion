import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import { parseCsvContent } from "@/lib/csv-parser"
import {
	validateProfitChartTrades,
	type ProfitChartProcessedTrade,
} from "../../_lib/profitchart-validate"
import type { Strategy, Tag, Timeframe } from "@/db/schema"

interface ProfitChartImportBody {
	csvContent: string
	accountId?: string
}

interface ProfitChartCacheEntry {
	trades: ProfitChartProcessedTrade[]
	summary: {
		total: number
		valid: number
		warnings: number
		skipped: number
		duplicates: number
		grossPnl: number
		netPnl: number
		totalCosts: number
	}
	strategies: Strategy[]
	timeframes: Timeframe[]
	tags: Tag[]
	accountType: "personal" | "prop" | "replay"
	accountId: string
	userId: string
	timestamp: number
}

const ARCH_PROFITCHART_CACHE = new Map<string, ProfitChartCacheEntry>()
const ARCH_PROFITCHART_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5 MB

const generateImportId = (): string =>
	`arch_pc_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

const sweepExpired = (): void => {
	const now = Date.now()
	for (const [key, entry] of ARCH_PROFITCHART_CACHE) {
		if (now - entry.timestamp > ARCH_PROFITCHART_TTL_MS) {
			ARCH_PROFITCHART_CACHE.delete(key)
		}
	}
}

/**
 * POST /api/arch/imports/profitchart
 *
 * Parses a ProfitChart CSV export and returns a per-row validation preview
 * cached server-side for 1 hour. Caller invokes
 * /api/arch/imports/profitchart/confirm with the returned `importId` to
 * commit selected trades. Mirrors the in-app CSV import flow:
 *
 *   - Parses ProfitChart format (auto-detected from headers).
 *   - Looks up registered assets per symbol; unknown assets are auto-skipped.
 *   - Computes gross/net P&L per row using account fee rates.
 *   - Marks duplicates via deduplicationHash (already-imported trades skipped).
 *   - Returns lookup data (strategies/timeframes/tags) so the agent can
 *     attach edits per trade in the confirm call.
 *
 * Body: { csvContent: string, accountId?: string }
 *
 * Response: { importId, expiresAt, summary, trades, strategies, timeframes,
 *             tags, accountType }
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		sweepExpired()

		const body = (await request.json()) as ProfitChartImportBody
		const csvContent = body.csvContent
		const accountId = body.accountId ?? auth.accountId

		if (!csvContent) {
			return archError("Missing required field", [
				{ code: "MISSING_FIELDS", detail: "Required: csvContent" },
			])
		}

		if (typeof csvContent !== "string") {
			return archError("Invalid CSV payload", [
				{ code: "INVALID_CSV_TYPE", detail: "csvContent must be a string" },
			])
		}

		const csvBytes = Buffer.byteLength(csvContent, "utf8")
		if (csvBytes > MAX_CSV_BYTES) {
			return archError("CSV payload too large", [
				{
					code: "CSV_TOO_LARGE",
					detail: `csvContent is ${csvBytes} bytes; maximum is ${MAX_CSV_BYTES}`,
				},
			])
		}

		const accountAllowed = auth.showAllAccounts
			? auth.allAccountIds.includes(accountId)
			: accountId === auth.accountId
		if (!accountAllowed) {
			return archError(
				"Account not accessible",
				[
					{
						code: "FORBIDDEN_ACCOUNT",
						detail: "accountId is not owned by the authenticated user",
					},
				],
				403
			)
		}

		const parseResult = parseCsvContent(csvContent)
		if (!parseResult.success || parseResult.trades.length === 0) {
			return archError("Failed to parse CSV", [
				{
					code: "PARSE_FAILED",
					detail:
						parseResult.errors[0]?.message ??
						"No trades parsed from CSV (check ProfitChart format)",
				},
			])
		}

		const validation = await validateProfitChartTrades(
			parseResult.trades,
			auth,
			accountId
		)

		const importId = generateImportId()
		ARCH_PROFITCHART_CACHE.set(importId, {
			...validation,
			accountId,
			userId: auth.userId,
			timestamp: Date.now(),
		})

		return archSuccess("ProfitChart preview ready", {
			importId,
			expiresAt: new Date(Date.now() + ARCH_PROFITCHART_TTL_MS).toISOString(),
			summary: validation.summary,
			trades: validation.trades,
			strategies: validation.strategies,
			timeframes: validation.timeframes,
			tags: validation.tags,
			accountType: validation.accountType,
			parseWarnings: parseResult.warnings,
			parseErrors: parseResult.errors,
		})
	} catch (error) {
		return archError(
			"Failed to parse ProfitChart CSV",
			[{ code: "PARSE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST, ARCH_PROFITCHART_CACHE }
