/**
 * diff-projection.ts
 *
 * Step-3 verification probe: for every 5m brick in `price_candles`, re-derives
 * the expected prev_15m_open/close and prev_60m_open/close by running the same
 * findFloorIndex algorithm directly against the 15m/60m CSV data, then diffs
 * those expected values against what is stored in the DB's `indicators` JSONB.
 *
 * Usage:
 *   pnpm tsx scripts/diff-projection.ts 2026-05-13
 *   pnpm tsx scripts/diff-projection.ts all
 *   pnpm tsx scripts/diff-projection.ts all --verbose
 *
 * Pass condition (per day):
 *   - Every 5m brick with a non-null projection matches within 0.5 points.
 *   - Null projection (first bricks before any higher-TF brick has closed) is
 *     expected and logged as SKIP, not FAIL.
 *   - Brick 16 on 2026-05-13 (T1 fire brick) must pass.
 */
import "dotenv/config"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"

const DATA_ROOT = resolve(process.cwd(), "data/hawks")
const ASSET_SYMBOL = "WIN"
const TOLERANCE = 0.5

// ─── Shared helpers ───────────────────────────────────────────────────────────

const decodeLatin1 = (path: string): string =>
	new TextDecoder("latin1").decode(readFileSync(path))

const parseDate = (raw: string): Date | null => {
	const m = raw.match(
		/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
	)
	if (!m) {
		return null
	}
	const [, dd, mm, yyyy, hh, mi, ss, ms] = m
	return new Date(
		Date.UTC(
			Number(yyyy),
			Number(mm) - 1,
			Number(dd),
			Number(hh) + 3,
			Number(mi),
			Number(ss),
			ms ? Number(ms.padEnd(3, "0")) : 0
		)
	)
}

const parseBrNumber = (raw: string | undefined): number | null => {
	if (!raw?.trim()) {
		return null
	}
	const cleaned = raw.trim().replace(/\./g, "").replace(",", ".")
	const n = Number(cleaned)
	return Number.isFinite(n) ? n : null
}

// ─── Higher-TF CSV loader ─────────────────────────────────────────────────────

interface HtfBrick {
	ts: Date
	open: number
	high: number
	low: number
	close: number
}

const loadHtfCsv = (tfCode: string): HtfBrick[] => {
	const filename = tfCode === "1h" ? "60m.csv" : `${tfCode}.csv`
	const path = resolve(DATA_ROOT, "candles", filename)
	const text = decodeLatin1(path)
	const lines = text.split(/\r?\n/).filter(Boolean).slice(1)
	const bricks: HtfBrick[] = []
	for (const line of lines) {
		const cols = line.split(";")
		const ts = parseDate(cols[0] ?? "")
		if (!ts) {
			continue
		}
		const open = parseBrNumber(cols[1])
		const high = parseBrNumber(cols[2])
		const low = parseBrNumber(cols[3])
		const close = parseBrNumber(cols[4])
		if (open === null || high === null || low === null || close === null) {
			continue
		}
		bricks.push({ ts, open, high, low, close })
	}
	// CSV is descending (newest first) — sort ascending for binary search
	bricks.sort((a, b) => a.ts.getTime() - b.ts.getTime())
	return bricks
}

// ─── Binary search: largest index ≤ target ───────────────────────────────────

const findFloorIndex = (bricks: HtfBrick[], targetMs: number): number => {
	let lo = 0
	let hi = bricks.length - 1
	let result = -1
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1
		if (bricks[mid]!.ts.getTime() <= targetMs) {
			result = mid
			lo = mid + 1
		} else {
			hi = mid - 1
		}
	}
	return result
}

// ─── DB query ─────────────────────────────────────────────────────────────────

interface DbRow {
	ts: Date
	candleIndex: number
	prev15mOpen: number | null
	prev15mClose: number | null
	prev60mOpen: number | null
	prev60mClose: number | null
}

const loadDbDay = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	brtDay: string
): Promise<DbRow[]> => {
	const fromUtc = new Date(`${brtDay}T03:00:00.000Z`)
	const toUtc = new Date(fromUtc.getTime() + 24 * 3600 * 1000)
	const rows = (await sql`
		SELECT pc.timestamp, pc.candle_index,
		       (pc.indicators->>'prev_15m_open')::numeric  AS prev_15m_open,
		       (pc.indicators->>'prev_15m_close')::numeric AS prev_15m_close,
		       (pc.indicators->>'prev_60m_open')::numeric  AS prev_60m_open,
		       (pc.indicators->>'prev_60m_close')::numeric AS prev_60m_close
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = ${ASSET_SYMBOL}
		  AND t.code = '5m'
		  AND pc.timestamp >= ${fromUtc.toISOString()}
		  AND pc.timestamp <  ${toUtc.toISOString()}
		ORDER BY pc.timestamp, pc.candle_index NULLS LAST
	`) as {
		timestamp: string | Date
		candle_index: number | null
		prev_15m_open: string | null
		prev_15m_close: string | null
		prev_60m_open: string | null
		prev_60m_close: string | null
	}[]
	return rows.map((r) => ({
		ts: new Date(r.timestamp as string),
		candleIndex: r.candle_index ?? 0,
		prev15mOpen: r.prev_15m_open !== null ? Number(r.prev_15m_open) : null,
		prev15mClose: r.prev_15m_close !== null ? Number(r.prev_15m_close) : null,
		prev60mOpen: r.prev_60m_open !== null ? Number(r.prev_60m_open) : null,
		prev60mClose: r.prev_60m_close !== null ? Number(r.prev_60m_close) : null,
	}))
}

// ─── Diff logic ───────────────────────────────────────────────────────────────

const toBrt = (d: Date): string =>
	new Date(d.getTime() - 3 * 3600 * 1000)
		.toISOString()
		.replace("T", " ")
		.slice(0, 19)

const diffDay = (
	brtDay: string,
	dbRows: DbRow[],
	htf15: HtfBrick[],
	htf60: HtfBrick[],
	verbose: boolean
): { ok: boolean; mismatches: number; skipped: number } => {
	let mismatches = 0
	let skipped = 0

	for (const row of dbRows) {
		const targetMs = row.ts.getTime() - 1

		const idx15 = findFloorIndex(htf15, targetMs)
		const idx60 = findFloorIndex(htf60, targetMs)

		const exp15Open = idx15 >= 0 ? htf15[idx15]!.open : null
		const exp15Close = idx15 >= 0 ? htf15[idx15]!.close : null
		const exp60Open = idx60 >= 0 ? htf60[idx60]!.open : null
		const exp60Close = idx60 >= 0 ? htf60[idx60]!.close : null

		// Both expected AND actual are null → correct null gap
		const allNull =
			exp15Open === null &&
			exp15Close === null &&
			exp60Open === null &&
			exp60Close === null

		if (allNull) {
			if (verbose) {
				console.log(
					`  [box ${String(row.candleIndex).padStart(3)}]  ${toBrt(row.ts)}  NULL gap (before first HTF brick) — SKIP`
				)
			}
			skipped++
			continue
		}

		const checks: [string, number | null, number | null][] = [
			["prev_15m_open", exp15Open, row.prev15mOpen],
			["prev_15m_close", exp15Close, row.prev15mClose],
			["prev_60m_open", exp60Open, row.prev60mOpen],
			["prev_60m_close", exp60Close, row.prev60mClose],
		]

		let rowFailed = false
		for (const [key, expected, actual] of checks) {
			if (expected === null) {
				continue
			}
			if (actual === null || Math.abs(expected - actual) > TOLERANCE) {
				if (!rowFailed) {
					console.log(
						`  [box ${String(row.candleIndex).padStart(3)}]  ${toBrt(row.ts)}  MISMATCH:`
					)
					rowFailed = true
				}
				console.log(
					`    ${key.padEnd(16)} expected=${String(expected).padEnd(10)} actual=${actual ?? "NULL"}`
				)
				mismatches++
			}
		}

		if (!rowFailed && verbose) {
			console.log(
				`  [box ${String(row.candleIndex).padStart(3)}]  ${toBrt(row.ts)}  ` +
					`15m: open=${exp15Open} close=${exp15Close}  60m: open=${exp60Open} close=${exp60Close}  OK`
			)
		}
	}

	return { ok: mismatches === 0, mismatches, skipped }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const run = async () => {
	const arg = process.argv[2]
	const verbose = process.argv.includes("--verbose")

	if (!arg) {
		console.error(
			"Usage: pnpm tsx scripts/diff-projection.ts <YYYY-MM-DD | all> [--verbose]"
		)
		process.exit(1)
	}

	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	console.log("Loading 15m and 60m CSV data...")
	const htf15 = loadHtfCsv("15m")
	const htf60 = loadHtfCsv("1h")
	console.log(`  15m: ${htf15.length} bricks, 60m: ${htf60.length} bricks`)

	// Derive the set of BRT days from DB (cast to text so Neon returns a plain
	// "YYYY-MM-DD" string rather than a JavaScript Date object)
	const allDayRows = (await sql`
		SELECT DISTINCT DATE(pc.timestamp AT TIME ZONE 'America/Sao_Paulo')::text AS brt_day
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = ${ASSET_SYMBOL} AND t.code = '5m'
		ORDER BY brt_day
	`) as { brt_day: string }[]

	const dbDays = allDayRows.map((r) => r.brt_day)
	const daysToCheck =
		arg === "all" ? dbDays : arg.split(",").map((d) => d.trim())

	let totalOk = 0
	let totalFail = 0

	for (const day of daysToCheck) {
		const dbRows = await loadDbDay(sql, day)
		if (dbRows.length === 0) {
			console.log(`${day}  SKIP  (not in DB)`)
			continue
		}

		const { ok, mismatches, skipped } = diffDay(
			day,
			dbRows,
			htf15,
			htf60,
			verbose
		)

		if (ok) {
			console.log(
				`${day}  OK    ${dbRows.length} bricks  (${skipped} null-gap skipped)`
			)
			totalOk++
		} else {
			console.log(
				`${day}  FAIL  ${dbRows.length} bricks  mismatches=${mismatches}  (${skipped} null-gap skipped)`
			)
			totalFail++
		}
	}

	console.log(
		`\nSummary: ${totalOk} OK, ${totalFail} FAIL out of ${totalOk + totalFail} days checked`
	)

	if (!isNeonUrl(databaseUrl)) {
		await (sql as ReturnType<typeof postgres>).end()
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
