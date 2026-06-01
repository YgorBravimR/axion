/**
 * diff-5m-vs-csv.ts
 *
 * Step-1 verification probe: compares every 5m Renko brick in `price_candles`
 * against the raw ProfitChart CSV export for a given BRT trading day.
 *
 * Usage:
 *   pnpm tsx scripts/diff-5m-vs-csv.ts 2026-05-13
 *   pnpm tsx scripts/diff-5m-vs-csv.ts all        # runs every day found in CSV
 *
 * Pass condition (per day):
 *   - Same row count.
 *   - Every brick matches OHLC within 0.5 points (ProfitChart rounds to
 *     nearest integer; DB stores full-precision decimal).
 *   - Timestamps match within 1 ms (sub-second rounding may differ).
 *
 * Outputs a one-line summary per day ("OK" or "FAIL: N mismatches").
 */
import "dotenv/config"
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"

const DATA_ROOT = resolve(process.cwd(), "data/hawks")
const CSV_PATH = resolve(DATA_ROOT, "candles/5m.csv")
const ASSET_SYMBOL = "WIN"
const TIMEFRAME_CODE = "5m"
const OHLC_TOLERANCE = 0.5

// ─── CSV parsing (mirrors load-hawks-candles.ts) ─────────────────────────────

const decodeLatin1 = (path: string): string => {
	const buf = readFileSync(path)
	return new TextDecoder("latin1").decode(buf)
}

const parseDate = (raw: string): Date | null => {
	const m = raw.match(
		/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/
	)
	if (!m) {
		return null
	}
	const [, dd, mm, yyyy, hh, mi, ss, ms] = m
	const utc = Date.UTC(
		Number(yyyy),
		Number(mm) - 1,
		Number(dd),
		Number(hh) + 3,
		Number(mi),
		Number(ss),
		ms ? Number(ms.padEnd(3, "0")) : 0
	)
	return new Date(utc)
}

const parseBrNumber = (raw: string | undefined): number | null => {
	if (!raw?.trim()) {
		return null
	}
	const cleaned = raw.trim().replace(/\./g, "").replace(",", ".")
	if (cleaned === "") {
		return null
	}
	const n = Number(cleaned)
	return Number.isFinite(n) ? n : null
}

interface CsvBrick {
	ts: Date
	brtDay: string
	candleIndex: number | null
	open: number
	high: number
	low: number
	close: number
}

const loadCsv = (): Map<string, CsvBrick[]> => {
	const text = decodeLatin1(CSV_PATH)
	const lines = text.split(/\r?\n/).filter(Boolean).slice(1)
	const byDay = new Map<string, CsvBrick[]>()
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
		const candleIndex = cols[12] ? Math.round(Number(cols[12])) || null : null
		const brtDay = new Date(ts.getTime() - 3 * 3600 * 1000)
			.toISOString()
			.slice(0, 10)
		const day = byDay.get(brtDay) ?? []
		day.push({ ts, brtDay, candleIndex, open, high, low, close })
		byDay.set(brtDay, day)
	}
	for (const rows of byDay.values()) {
		rows.sort((a, b) => {
			const dt = a.ts.getTime() - b.ts.getTime()
			if (dt !== 0) {
				return dt
			}
			// candle_index is the stable tiebreaker for same-millisecond bricks
			return (a.candleIndex ?? 0) - (b.candleIndex ?? 0)
		})
	}
	return byDay
}

// ─── DB query ────────────────────────────────────────────────────────────────

interface DbBrick {
	ts: Date
	open: number
	high: number
	low: number
	close: number
}

const loadDbDay = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	brtDay: string
): Promise<DbBrick[]> => {
	// BRT day → UTC window: BRT = UTC-3, so 00:00 BRT = 03:00 UTC
	const fromUtc = new Date(`${brtDay}T03:00:00.000Z`)
	const toUtc = new Date(fromUtc.getTime() + 24 * 3600 * 1000)
	const rows = (await sql`
		SELECT pc.timestamp, pc.open, pc.high, pc.low, pc.close
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = ${ASSET_SYMBOL}
		  AND t.code = ${TIMEFRAME_CODE}
		  AND pc.timestamp >= ${fromUtc.toISOString()}
		  AND pc.timestamp <  ${toUtc.toISOString()}
		ORDER BY pc.timestamp, pc.candle_index NULLS LAST
	`) as {
		timestamp: string | Date
		open: string
		high: string
		low: string
		close: string
	}[]
	return rows.map((r) => ({
		ts: new Date(r.timestamp as string),
		open: Number(r.open),
		high: Number(r.high),
		low: Number(r.low),
		close: Number(r.close),
	}))
}

// ─── Diff logic ───────────────────────────────────────────────────────────────

interface MismatchRow {
	idx: number
	field: string
	csvVal: number | string
	dbVal: number | string
}

const toBrt = (d: Date): string =>
	new Date(d.getTime() - 3 * 3600 * 1000)
		.toISOString()
		.replace("T", " ")
		.slice(0, 23)

const diffDay = (
	brtDay: string,
	csvRows: CsvBrick[],
	dbRows: DbBrick[]
): {
	ok: boolean
	mismatches: MismatchRow[]
	csvCount: number
	dbCount: number
} => {
	const mismatches: MismatchRow[] = []

	if (csvRows.length !== dbRows.length) {
		mismatches.push({
			idx: -1,
			field: "row_count",
			csvVal: csvRows.length,
			dbVal: dbRows.length,
		})
	}

	const limit = Math.min(csvRows.length, dbRows.length)
	for (let i = 0; i < limit; i++) {
		const csv = csvRows[i]!
		const db = dbRows[i]!

		// Timestamp: allow 1 ms drift (sub-second rounding in different parsers)
		if (Math.abs(csv.ts.getTime() - db.ts.getTime()) > 1) {
			mismatches.push({
				idx: i,
				field: "timestamp",
				csvVal: toBrt(csv.ts),
				dbVal: toBrt(db.ts),
			})
		}

		for (const field of ["open", "high", "low", "close"] as const) {
			const csvVal = csv[field]
			const dbVal = db[field]
			if (Math.abs(csvVal - dbVal) > OHLC_TOLERANCE) {
				mismatches.push({ idx: i, field, csvVal, dbVal })
			}
		}
	}

	return {
		ok: mismatches.length === 0,
		mismatches,
		csvCount: csvRows.length,
		dbCount: dbRows.length,
	}
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const run = async () => {
	const arg = process.argv[2]
	if (!arg) {
		console.error(
			"Usage: pnpm tsx scripts/diff-5m-vs-csv.ts <YYYY-MM-DD | all>"
		)
		process.exit(1)
	}

	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing — check .env")
		process.exit(1)
	}
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	const csvByDay = loadCsv()
	const csvDays = [...csvByDay.keys()].sort()

	const daysToCheck =
		arg === "all" ? csvDays : arg.split(",").map((d) => d.trim())

	let totalOk = 0
	let totalFail = 0

	for (const day of daysToCheck) {
		const csvRows = csvByDay.get(day)
		if (!csvRows) {
			console.log(`${day}  SKIP  (not in CSV)`)
			continue
		}

		const dbRows = await loadDbDay(sql, day)

		if (dbRows.length === 0) {
			console.log(`${day}  SKIP  (not in DB — run load-hawks-candles.ts first)`)
			continue
		}

		const { ok, mismatches, csvCount, dbCount } = diffDay(day, csvRows, dbRows)

		if (ok) {
			console.log(`${day}  OK    ${csvCount} bricks`)
			totalOk++
		} else {
			console.log(
				`${day}  FAIL  csv=${csvCount} db=${dbCount}  mismatches=${mismatches.length}`
			)
			// Print first 20 mismatches in detail
			for (const m of mismatches.slice(0, 20)) {
				const label =
					m.idx === -1
						? "  [row_count]"
						: `  [brick ${String(m.idx).padStart(3)}]`
				console.log(`${label}  ${m.field}: csv=${m.csvVal}  db=${m.dbVal}`)
			}
			if (mismatches.length > 20) {
				console.log(`  ... and ${mismatches.length - 20} more mismatches`)
			}
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
