import type { NextRequest } from "next/server"
import { archAuth } from "../../_lib/auth"
import { archSuccess, archError } from "../../_lib/helpers"
import {
	parseStatementCSV,
	validateStatementCSV,
	groupExecutionsIntoTrades,
	createImportPreview,
	type BrokerName,
	type ImportPreview,
} from "@/lib/csv-parsers"

interface ArchCsvImportBody {
	brokerName: BrokerName
	csvContent: string
	accountId?: string
}

interface ArchPreviewCacheEntry {
	preview: ImportPreview
	accountId: string
	userId: string
	timestamp: number
}

const ARCH_PREVIEW_CACHE = new Map<string, ArchPreviewCacheEntry>()
const ARCH_CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const MAX_CSV_BYTES = 5 * 1024 * 1024 // 5 MB
const VALID_BROKERS: BrokerName[] = ["CLEAR", "XP", "GENIAL"]

const generateImportId = (): string =>
	`arch_import_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`

const sweepExpired = (): void => {
	const now = Date.now()
	for (const [key, entry] of ARCH_PREVIEW_CACHE) {
		if (now - entry.timestamp > ARCH_CACHE_TTL_MS) {
			ARCH_PREVIEW_CACHE.delete(key)
		}
	}
}

/**
 * POST /api/arch/imports/csv
 *
 * Parses a broker statement CSV and returns a preview cached server-side for
 * 1 hour. Caller must invoke /api/arch/imports/csv/confirm with the returned
 * `importId` to commit the trades.
 *
 * Body: { brokerName: "CLEAR" | "XP" | "GENIAL", csvContent: string, accountId?: string }
 */
const POST = async (request: NextRequest) => {
	const authResult = await archAuth(request)
	if (!authResult.success) {
		return authResult.response
	}
	const { auth } = authResult

	try {
		sweepExpired()

		const body = (await request.json()) as ArchCsvImportBody
		const brokerName = body.brokerName
		const csvContent = body.csvContent
		const accountId = body.accountId ?? auth.accountId

		if (!brokerName || !csvContent) {
			return archError("Missing required fields", [
				{
					code: "MISSING_FIELDS",
					detail: "Required: brokerName, csvContent",
				},
			])
		}

		if (!VALID_BROKERS.includes(brokerName)) {
			return archError("Unsupported broker", [
				{
					code: "INVALID_BROKER",
					detail: `brokerName must be one of: ${VALID_BROKERS.join(", ")}`,
				},
			])
		}

		if (typeof csvContent !== "string") {
			return archError("Invalid CSV payload", [
				{
					code: "INVALID_CSV_TYPE",
					detail: "csvContent must be a string",
				},
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

		// Verify the requested accountId is owned by the auth context.
		const allowed = auth.showAllAccounts
			? auth.allAccountIds.includes(accountId)
			: accountId === auth.accountId
		if (!allowed) {
			return archError("Account not accessible", [
				{
					code: "FORBIDDEN_ACCOUNT",
					detail: "accountId is not owned by the authenticated user",
				},
			])
		}

		const validation = validateStatementCSV(brokerName, csvContent)
		if (!validation.valid) {
			return archError("Invalid CSV format", [
				{
					code: "INVALID_CSV_FORMAT",
					detail: validation.error ?? "CSV did not match broker schema",
				},
			])
		}

		const executions = parseStatementCSV({ brokerName, csvContent })
		const groupedTrades = groupExecutionsIntoTrades(executions)
		const importId = generateImportId()
		const preview = createImportPreview(
			groupedTrades,
			brokerName,
			executions.length,
			importId
		)

		ARCH_PREVIEW_CACHE.set(importId, {
			preview,
			accountId,
			userId: auth.userId,
			timestamp: Date.now(),
		})

		return archSuccess("CSV preview ready", {
			importId,
			expiresAt: new Date(Date.now() + ARCH_CACHE_TTL_MS).toISOString(),
			preview,
		})
	} catch (error) {
		return archError(
			"Failed to parse CSV",
			[{ code: "PARSE_FAILED", detail: String(error) }],
			500
		)
	}
}

export { POST, ARCH_PREVIEW_CACHE }
