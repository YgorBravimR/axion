/**
 * POST /api/imports/detailed-trades
 * Upload broker statement CSV and get import preview
 * Returns: ImportPreview with detected trades and warnings
 * Validates 30-minute cooldown between imports
 */

import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import {
	parseStatementCSV,
	validateStatementCSV,
	groupExecutionsIntoTrades,
	createImportPreview,
	type BrokerName,
	type ImportPreview,
} from "@/lib/csv-parsers"

import { createDbRateLimiter } from "@/lib/db-rate-limiter"

// DB-backed rate limiting (survives serverless cold starts)
// 10 imports per hour per account — covers multi-export workflows (e.g. ProfitChart per-trade exports)
// while still blocking runaway scripts or accidental spam
const importLimiter = createDbRateLimiter({
	maxAttempts: 10,
	windowMs: 60 * 60 * 1000, // 1 hour
})

// Cache for import previews (1 hour TTL)
const previewCache = new Map<
	string,
	{ preview: ImportPreview; timestamp: number; accountId: string }
>()

const CACHE_TTL = 3600000 // 1 hour
const RATE_LIMIT_MINUTES = 30

/**
 * Generate unique import ID for caching
 */
const generateImportId = (): string => {
	return `import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

export const POST = async (req: NextRequest) => {
	try {
		// Authenticate using NextAuth
		const session = await auth()
		if (!session?.user?.id) {
			return NextResponse.json(
				{ error: "api.errors.unauthorized" },
				{ status: 401 }
			)
		}
		const userId = session.user.id

		// Parse request
		const body = await req.json()
		const {
			accountId,
			brokerName,
			csvContent,
		}: { accountId: string; brokerName: BrokerName; csvContent: string } = body

		// Validate inputs
		if (!accountId || !brokerName || !csvContent) {
			return NextResponse.json(
				{
					error: "api.errors.missingFields",
				},
				{ status: 400 }
			)
		}

		if (!["CLEAR", "XP", "GENIAL"].includes(brokerName)) {
			return NextResponse.json(
				{ error: `api.errors.invalidParams|${brokerName}` },
				{ status: 400 }
			)
		}

		// Check rate limit (30-minute cooldown, DB-backed)
		const rateLimitResult = await importLimiter.check(`csv-import:${accountId}`)
		if (!rateLimitResult.allowed) {
			const retryAfterSec = Math.ceil(rateLimitResult.retryAfterMs / 1000)
			return NextResponse.json(
				{
					error: "api.errors.tooManyRequests",
					retryAfter: retryAfterSec,
				},
				{ status: 429 }
			)
		}

		// Validate CSV format
		const validation = validateStatementCSV(brokerName, csvContent)
		if (!validation.valid) {
			return NextResponse.json(
				{ error: "imports.errors.invalidCsvFormat", details: validation.error },
				{ status: 400 }
			)
		}

		// Parse CSV into executions
		const executions = parseStatementCSV({
			brokerName,
			csvContent,
		})

		// Group executions into trades
		const trades = groupExecutionsIntoTrades(executions)

		// Create import preview
		const importId = generateImportId()
		const preview = createImportPreview(
			trades,
			brokerName,
			executions.length,
			importId
		)

		// Cache preview for confirmation step (1 hour TTL)
		previewCache.set(importId, {
			preview,
			timestamp: Date.now(),
			accountId,
		})

		return NextResponse.json({
			success: true,
			preview,
		})
	} catch (error) {
		console.error("[POST /api/imports/detailed-trades]", error)

		const message =
			error instanceof Error ? error.message : "imports.errors.parseFailed"

		return NextResponse.json(
			{ error: "imports.errors.parseFailed", message },
			{ status: 400 }
		)
	}
}

/**
 * Clean up expired cache entries periodically
 */
export const cleanupExpiredCache = () => {
	const now = Date.now()
	for (const [key, data] of previewCache.entries()) {
		if (now - data.timestamp > CACHE_TTL) {
			previewCache.delete(key)
		}
	}
}

// Export cache for confirmation endpoint
export { previewCache }
