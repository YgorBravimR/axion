/**
 * scripts/enrich-day.ts
 *
 * Idempotent, CLI-driven enrichment for a single trading day.
 *
 * Pipes the same primitives the Two-Phase Journaling UI uses:
 *   parseCsvContent (Profit Pro orders.csv)
 *     → runDryRun (operations + candle + indicator + deterministic SL/target)
 *       → write merged fields back to trades, accepting all enrichment.
 *
 * Differences from the UI flow:
 *   - No auth wrapper; uses DATABASE_URL directly. Account is resolved from
 *     trades that match the date range.
 *   - Auto-accepts every merged field (no review UI). Existing form values are
 *     preserved when the pass produces no diff.
 *   - Re-runnable. Re-running on the same day overwrites enrichment with the
 *     latest CSV truth — useful when the CSV gains MFE/MAE columns or when
 *     bricks are backfilled.
 *
 * Usage:
 *   pnpm tsx scripts/enrich-day.ts --date 2026-06-16 --csv /path/to/orders.csv
 *   pnpm tsx scripts/enrich-day.ts --date 2026-06-16   # no CSV; runs only candle/SL passes
 *   pnpm tsx scripts/enrich-day.ts --from 2026-06-10 --to 2026-06-16 --csv ...
 */

import "dotenv/config"
import { existsSync, readFileSync } from "fs"
import { resolve } from "path"
import { eq, and, between, inArray } from "drizzle-orm"
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js"
import { drizzle as drizzleNeon } from "drizzle-orm/neon-http"
import postgres from "postgres"
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api"

import { format } from "date-fns"

import * as schema from "../src/db/schema"
import { trades, assets, timeframes, hawksRenkoSizes } from "../src/db/schema"
import { parseCsvContent } from "../src/lib/csv-parser"
import { weekStart } from "../src/lib/calendar/iso-week"
import { DEFAULT_HAWKS_CONFIG } from "../src/lib/enrichment/hawks-config"
import { runDryRun } from "../src/lib/enrichment/run-dry-run"
import { deriveTradeFieldsFromEnrichment } from "../src/lib/enrichment/derive-trade-fields"

import type { ProfitChartOperation } from "../src/lib/csv-parser"
import type {
	EnrichmentContext,
	MergedEnrichmentField,
} from "../src/lib/enrichment/types"
import type { CandleRow } from "../src/types/candle"

const isNeonUrl = (url: string): boolean => /@[^/]*\.neon\.tech/i.test(url)

const buildDb = (databaseUrl: string) => {
	if (isNeonUrl(databaseUrl)) {
		return drizzleNeon(databaseUrl, { schema })
	}
	return drizzlePg(postgres(databaseUrl, { prepare: false, max: 1 }), {
		schema,
	})
}

const ENTRY_MATCH_TOLERANCE_MS = 60_000
const POINTS_PER_TICK = 5
const CANDLE_BASE_PATH =
	process.env.CANDLE_STORE_DUCKDB_BASE_PATH ?? "data/parquet/candles"

type DbClient = ReturnType<typeof buildDb>

// Inline DuckDB Parquet reader. Mirrors src/lib/candle-store/duckdb-impl.ts but
// takes pre-resolved asset symbol + timeframe code so we don't need to import
// @/db/drizzle (which uses top-level await and breaks tsx CJS loader).
let cachedConn: Promise<DuckDBConnection> | null = null
const getCandleConnection = (): Promise<DuckDBConnection> => {
	if (!cachedConn) {
		cachedConn = (async () => {
			const inst = await DuckDBInstance.create(":memory:")
			return inst.connect()
		})()
	}
	return cachedConn
}

const sqlEscape = (s: string) => s.replace(/'/g, "''")

const toNumberValue = (v: unknown): number => {
	if (typeof v === "number") {
		return v
	}
	if (typeof v === "bigint") {
		return Number(v)
	}
	if (v !== null && typeof v === "object" && "value" in v && "scale" in v) {
		const { value, scale } = v as { value: number | bigint; scale: number }
		return Number(value) / Math.pow(10, scale)
	}
	return Number.NaN
}

const toIsoValue = (v: unknown): string => {
	if (v === null || v === undefined) {
		return ""
	}
	if (typeof v === "string") {
		return v
	}
	if (v instanceof Date) {
		return v.toISOString()
	}
	if (typeof v === "object" && "micros" in v) {
		const micros = (v as { micros: bigint | number }).micros
		const ms =
			typeof micros === "bigint" ? Number(micros) / 1000 : micros / 1000
		return new Date(ms).toISOString()
	}
	return String(v)
}

const BASE_CANDLE_COLS = new Set([
	"timestamp",
	"open",
	"high",
	"low",
	"close",
	"candle_index",
])

const fetchCandlesFromParquet = async ({
	symbol,
	timeframeCode,
	from,
	to,
}: {
	symbol: string
	timeframeCode: string
	from: Date
	to: Date
}): Promise<CandleRow[] | null> => {
	const filePath = resolve(CANDLE_BASE_PATH, timeframeCode, `${symbol}.parquet`)
	if (!existsSync(filePath)) {
		return null
	}
	const conn = await getCandleConnection()
	const colsReader = await conn.runAndReadAll(
		`DESCRIBE SELECT * FROM read_parquet('${sqlEscape(filePath)}') LIMIT 0`
	)
	const colNames = new Set<string>()
	for (const row of colsReader.getRowObjects()) {
		const name = row.column_name ?? row.name
		if (typeof name === "string") {
			colNames.add(name)
		}
	}
	const indicatorCols = [...colNames].filter((c) => !BASE_CANDLE_COLS.has(c))
	const selectCols = [
		"timestamp",
		"open",
		"high",
		"low",
		"close",
		colNames.has("candle_index") ? "candle_index" : "NULL AS candle_index",
		...indicatorCols.map((c) => `"${c.replace(/"/g, '""')}"`),
	].join(", ")

	const reader = await conn.runAndReadAll(
		`SELECT ${selectCols} FROM read_parquet('${sqlEscape(filePath)}')
		 WHERE timestamp >= TIMESTAMP '${from.toISOString()}'
		   AND timestamp <= TIMESTAMP '${to.toISOString()}'
		 ORDER BY timestamp ASC`
	)
	return reader.getRowObjects().map((row) => {
		const indicators: Record<string, number> = {}
		for (const key of indicatorCols) {
			const v = row[key]
			if (v !== null && v !== undefined) {
				const n = toNumberValue(v)
				if (!Number.isNaN(n)) {
					indicators[key] = n
				}
			}
		}
		return {
			timestamp: toIsoValue(row.timestamp),
			open: toNumberValue(row.open),
			high: toNumberValue(row.high),
			low: toNumberValue(row.low),
			close: toNumberValue(row.close),
			candleIndex:
				row.candle_index === null || row.candle_index === undefined
					? null
					: toNumberValue(row.candle_index),
			indicators,
		}
	})
}

// Mirrors src/lib/enrichment/brick-size-resolver but takes the db via DI so
// this script doesn't pull in @/db/drizzle's top-level-await initializer.
const resolveBrickSize5mPoints = async (
	db: DbClient,
	assetId: string,
	entryDate: Date
): Promise<number | null> => {
	const monday = weekStart(entryDate)
	const effectiveDate = format(monday, "yyyy-MM-dd")
	const row = await db.query.hawksRenkoSizes.findFirst({
		where: and(
			eq(hawksRenkoSizes.assetId, assetId),
			eq(hawksRenkoSizes.effectiveDate, effectiveDate)
		),
	})
	if (!row) {
		return null
	}
	return (row.size5m - 1) * POINTS_PER_TICK
}

type Args = {
	from: Date
	to: Date
	csvPath: string | null
	accountName: string | null
}

const parseArgs = (): Args => {
	const argv = process.argv.slice(2)
	const get = (flag: string) => {
		const i = argv.indexOf(flag)
		return i >= 0 ? argv[i + 1] : undefined
	}
	const date = get("--date")
	const fromStr = get("--from") ?? date
	const toStr = get("--to") ?? date
	if (!fromStr || !toStr) {
		console.error(
			"Usage: pnpm tsx scripts/enrich-day.ts --date YYYY-MM-DD [--csv path] [--account name]"
		)
		console.error(
			"   or: pnpm tsx scripts/enrich-day.ts --from YYYY-MM-DD --to YYYY-MM-DD [--csv path] [--account name]"
		)
		console.error("")
		console.error(
			"   --account scopes enrichment to trades on a single trading account (matched by name, case-insensitive)."
		)
		console.error(
			"   Without --account the script enriches EVERY account's trades in the date window."
		)
		process.exit(1)
	}
	return {
		from: new Date(`${fromStr}T00:00:00Z`),
		to: new Date(`${toStr}T23:59:59.999Z`),
		csvPath: get("--csv") ?? null,
		accountName: get("--account") ?? null,
	}
}

const readCsvWithFallback = (path: string): string => {
	// Profit Pro exports are ISO-8859-1; UTF-8 read would mojibake Portuguese
	// headers (Número, Operação) and the parser would treat the file as
	// non-ProfitChart. Read as latin1 → diacritics survive normalization.
	return readFileSync(path, "latin1")
}

const loadProfitOperations = (
	csvPath: string | null
): ProfitChartOperation[] => {
	if (!csvPath) {
		return []
	}
	const content = readCsvWithFallback(csvPath)
	const result = parseCsvContent(content)
	if (!result.profitOperations || result.profitOperations.length === 0) {
		console.warn(
			`[enrich-day] WARNING: parsed CSV ${csvPath} but found 0 ProfitChart operations (${result.errors.length} errors). Operations CSV pass will be skipped.`
		)
		return []
	}
	console.log(
		`[enrich-day] parsed ${result.profitOperations.length} operations from ${csvPath}`
	)
	return result.profitOperations
}

const matchOperationByWindow = (
	trade: typeof trades.$inferSelect,
	ops: ProfitChartOperation[]
): ProfitChartOperation | null => {
	if (!trade.entryDate) {
		return null
	}
	const tradeEntryMs = new Date(trade.entryDate).getTime()
	let best: { op: ProfitChartOperation; delta: number } | null = null
	for (const op of ops) {
		if (op.normalizedAsset !== trade.asset) {
			continue
		}
		if (op.direction !== trade.direction) {
			continue
		}
		if (!op.entryDate) {
			continue
		}
		const delta = Math.abs(new Date(op.entryDate).getTime() - tradeEntryMs)
		if (delta > ENTRY_MATCH_TOLERANCE_MS) {
			continue
		}
		if (!best || delta < best.delta) {
			best = { op, delta }
		}
	}
	return best?.op ?? null
}

const main = async () => {
	const args = parseArgs()
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL not set")
		process.exit(1)
	}
	const db = buildDb(databaseUrl)

	const ops = loadProfitOperations(args.csvPath)
	const opsMap = new Map<number, ProfitChartOperation>()
	for (const op of ops) {
		opsMap.set(op.profitOperationNumber, op)
	}

	// Resolve account filter — case-insensitive match against tradingAccounts.name.
	let accountFilterId: string | null = null
	if (args.accountName) {
		const accts = await db.query.tradingAccounts.findMany()
		const wanted = args.accountName.toLowerCase()
		const match = accts.find((a) => a.name.toLowerCase() === wanted)
		if (!match) {
			console.error(
				`[enrich-day] no account named "${args.accountName}". Known: ${accts.map((a) => a.name).join(", ")}`
			)
			process.exit(1)
		}
		accountFilterId = match.id
		console.log(
			`[enrich-day] scoped to account "${match.name}" (${match.id.slice(0, 8)})`
		)
	}

	// Pull every closed trade in the window that hasn't been fully enriched yet.
	const candidates = await db.query.trades.findMany({
		where: and(
			between(trades.entryDate, args.from, args.to),
			inArray(trades.enrichmentStatus, ["pending", "partial", "enriched"]),
			eq(trades.isArchived, false),
			accountFilterId ? eq(trades.accountId, accountFilterId) : undefined
		),
	})
	console.log(
		`[enrich-day] window ${args.from.toISOString().slice(0, 10)} → ${args.to.toISOString().slice(0, 10)}: ${candidates.length} trades`
	)

	const timeframe = await db.query.timeframes.findFirst({
		where: eq(timeframes.code, "hawk_5m_win"),
	})

	const summary = {
		total: candidates.length,
		opsMatched: 0,
		fullyEnriched: 0,
		partial: 0,
		untouched: 0,
	}

	for (const trade of candidates) {
		if (!trade.entryDate || !trade.exitDate) {
			summary.untouched++
			continue
		}

		const asset = await db.query.assets.findFirst({
			where: eq(assets.symbol, trade.asset),
		})
		let brickSize5mPoints: number | null = null
		if (asset) {
			brickSize5mPoints = await resolveBrickSize5mPoints(
				db,
				asset.id,
				trade.entryDate
			)
		}

		// Read Parquet directly (can't import candle-store: top-level await breaks CJS).
		// Extend fetch window backward 1h for indicator-readout floor candle.
		let candles = null
		if (timeframe && asset) {
			const indicatorLookbackMs = 60 * 60 * 1000
			const fetchFrom = new Date(
				trade.entryDate.getTime() - indicatorLookbackMs
			)
			try {
				candles = await fetchCandlesFromParquet({
					symbol: asset.symbol,
					timeframeCode: timeframe.code,
					from: fetchFrom,
					to: trade.exitDate,
				})
			} catch (err) {
				console.warn(
					`[enrich-day] candle fetch failed for ${trade.id.slice(0, 8)}: ${(err as Error).message}`
				)
			}
		}

		const profitOp =
			opsMap.get(trade.profitOperationNumber ?? -1) ??
			matchOperationByWindow(trade, ops)
		if (profitOp) {
			summary.opsMatched++
		}

		const ctx: EnrichmentContext = {
			candles,
			profitOperation: profitOp,
			hawksConfig: DEFAULT_HAWKS_CONFIG,
			brickSize5mPoints,
			pointValue: 1,
		}

		const dry = runDryRun(trade, ctx)

		// Auto-accept every field (mirrors UI "Accept all").
		const updatePayload: Record<string, unknown> = {}
		const accepted: string[] = []
		for (const [field, raw] of Object.entries(dry.mergedFields)) {
			const merged = raw as MergedEnrichmentField
			if (merged && merged.value !== undefined && merged.value !== null) {
				updatePayload[field] = merged.value
				accepted.push(field)
			}
		}

		// Recompute realizedRMultiple / plannedRiskAmount / plannedRMultiple /
		// outcome so the journal shows the same numbers a fresh trade would.
		const { patch: derivedPatch } = deriveTradeFieldsFromEnrichment({
			current: trade,
			accepted: updatePayload,
			asset: asset ?? null,
		})
		Object.assign(updatePayload, derivedPatch)

		// Pass status: "failed" blocks; "skipped" is a no-op.
		const passStatuses = [
			dry.passes.operations.passStatus,
			dry.passes.candleMath.passStatus,
			dry.passes.indicatorReadout.passStatus,
			dry.passes.deterministicSlTarget.passStatus,
		]
		const allPassed = passStatuses.every((s) => s !== "failed")
		updatePayload.enrichmentStatus = allPassed ? "enriched" : "partial"
		updatePayload.enrichmentOpsStatus = dry.passes.operations.passStatus
		updatePayload.enrichmentCandleStatus = dry.passes.candleMath.passStatus
		updatePayload.enrichmentIndicatorStatus =
			dry.passes.indicatorReadout.passStatus
		updatePayload.enrichmentSlTargetStatus =
			dry.passes.deterministicSlTarget.passStatus
		updatePayload.enrichmentVersion = (trade.enrichmentVersion ?? 0) + 1
		updatePayload.enrichedAt = new Date()
		if (profitOp && trade.profitOperationNumber == null) {
			updatePayload.profitOperationNumber = profitOp.profitOperationNumber
		}

		await db.update(trades).set(updatePayload).where(eq(trades.id, trade.id))

		if (allPassed) {
			summary.fullyEnriched++
		} else {
			summary.partial++
		}

		console.log(
			`  ✓ ${trade.id.slice(0, 8)} ${trade.asset} ${trade.direction} ${trade.entryDate?.toISOString?.()}  ` +
				`ops=${dry.passes.operations.passStatus} candle=${dry.passes.candleMath.passStatus} ind=${dry.passes.indicatorReadout.passStatus} sl=${dry.passes.deterministicSlTarget.passStatus}  ` +
				`accepted=[${accepted.join(",")}]`
		)
	}

	console.log()
	console.log(`[enrich-day] DONE`)
	console.log(JSON.stringify(summary, null, 2))
}

main()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error(err)
		process.exit(1)
	})
