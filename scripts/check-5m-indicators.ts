/**
 * check-5m-indicators.ts
 *
 * Step-4 verification probe: spot-checks quality indicators on 5m bricks.
 *
 * Verified indicators (5m CSV columns loaded as JSONB):
 *   - macd        col 17  (quality multiplier — does not gate entry)
 *   - vwap_d_5m   col 9
 *   - vwap_m_5m   col 10
 *   - vwap_s_5m   col 11
 *   - ajuste_d1   col 13  (sparse: daily settlement, present on a subset of bricks)
 *
 * For each BRT day in the check set, picks 5 deterministic sample bricks
 * (at indices 0, n/4, n/2, 3n/4, n-1) and compares DB vs CSV within 0.5.
 *
 * Usage:
 *   pnpm tsx scripts/check-5m-indicators.ts 2026-05-13
 *   pnpm tsx scripts/check-5m-indicators.ts all
 *   pnpm tsx scripts/check-5m-indicators.ts all --verbose
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
const TOLERANCE = 0.5

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const toBrt = (d: Date): string =>
	new Date(d.getTime() - 3 * 3600 * 1000)
		.toISOString()
		.replace("T", " ")
		.slice(0, 19)

// ─── CSV loading ─────────────────────────────────────────────────────────────

interface CsvRow {
	ts: Date
	brtDay: string
	candleIndex: number
	macd: number | null
	vwap_d: number | null
	vwap_m: number | null
	vwap_s: number | null
	ajuste_d1: number | null
}

const loadCsv = (): Map<string, CsvRow[]> => {
	const text = decodeLatin1(CSV_PATH)
	const lines = text.split(/\r?\n/).filter(Boolean).slice(1)
	const byDay = new Map<string, CsvRow[]>()
	for (const line of lines) {
		const cols = line.split(";")
		const ts = parseDate(cols[0] ?? "")
		if (!ts) {
			continue
		}
		// Must have OHLC to be a valid brick
		if (
			!cols[1]?.trim() ||
			!cols[2]?.trim() ||
			!cols[3]?.trim() ||
			!cols[4]?.trim()
		) {
			continue
		}
		const brtDay = new Date(ts.getTime() - 3 * 3600 * 1000)
			.toISOString()
			.slice(0, 10)
		const candleIndex = cols[12] ? Math.round(Number(cols[12])) || 0 : 0
		const row: CsvRow = {
			ts,
			brtDay,
			candleIndex,
			macd: parseBrNumber(cols[17]),
			vwap_d: parseBrNumber(cols[9]),
			vwap_m: parseBrNumber(cols[10]),
			vwap_s: parseBrNumber(cols[11]),
			ajuste_d1: parseBrNumber(cols[13]),
		}
		const day = byDay.get(brtDay) ?? []
		day.push(row)
		byDay.set(brtDay, day)
	}
	for (const rows of byDay.values()) {
		rows.sort(
			(a, b) => a.ts.getTime() - b.ts.getTime() || a.candleIndex - b.candleIndex
		)
	}
	return byDay
}

// ─── DB query ─────────────────────────────────────────────────────────────────

interface DbRow {
	ts: Date
	candleIndex: number
	macd: number | null
	vwap_d: number | null
	vwap_m: number | null
	vwap_s: number | null
	ajuste_d1: number | null
}

const loadDbDay = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	brtDay: string
): Promise<DbRow[]> => {
	const fromUtc = new Date(`${brtDay}T03:00:00.000Z`)
	const toUtc = new Date(fromUtc.getTime() + 24 * 3600 * 1000)
	const rows = (await sql`
		SELECT pc.timestamp, pc.candle_index,
		       (pc.indicators->>'macd')::numeric       AS macd,
		       (pc.indicators->>'vwap_d_5m')::numeric  AS vwap_d,
		       (pc.indicators->>'vwap_m_5m')::numeric  AS vwap_m,
		       (pc.indicators->>'vwap_s_5m')::numeric  AS vwap_s,
		       (pc.indicators->>'ajuste_d1')::numeric  AS ajuste_d1
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
		candle_index: number | null
		macd: string | null
		vwap_d: string | null
		vwap_m: string | null
		vwap_s: string | null
		ajuste_d1: string | null
	}[]
	return rows.map((r) => ({
		ts: new Date(r.timestamp as string),
		candleIndex: r.candle_index ?? 0,
		macd: r.macd !== null ? Number(r.macd) : null,
		vwap_d: r.vwap_d !== null ? Number(r.vwap_d) : null,
		vwap_m: r.vwap_m !== null ? Number(r.vwap_m) : null,
		vwap_s: r.vwap_s !== null ? Number(r.vwap_s) : null,
		ajuste_d1: r.ajuste_d1 !== null ? Number(r.ajuste_d1) : null,
	}))
}

// ─── Sample selection (deterministic) ─────────────────────────────────────────

const pickSampleIndices = (n: number, count = 5): number[] => {
	if (n <= count) {
		return Array.from({ length: n }, (_, i) => i)
	}
	return [
		0,
		Math.floor(n / 4),
		Math.floor(n / 2),
		Math.floor((3 * n) / 4),
		n - 1,
	]
}

// ─── Check logic ──────────────────────────────────────────────────────────────

type IndicatorKey = "macd" | "vwap_d" | "vwap_m" | "vwap_s" | "ajuste_d1"
const INDICATOR_KEYS: IndicatorKey[] = [
	"macd",
	"vwap_d",
	"vwap_m",
	"vwap_s",
	"ajuste_d1",
]
const INDICATOR_LABELS: Record<IndicatorKey, string> = {
	macd: "macd      ",
	vwap_d: "vwap_d    ",
	vwap_m: "vwap_m    ",
	vwap_s: "vwap_s    ",
	ajuste_d1: "ajuste_d1 ",
}

const checkDay = (
	brtDay: string,
	csvRows: CsvRow[],
	dbRows: DbRow[],
	verbose: boolean
): { ok: boolean; mismatches: number; checked: number } => {
	let mismatches = 0
	let checked = 0

	const indices = pickSampleIndices(Math.min(csvRows.length, dbRows.length))

	for (const idx of indices) {
		const csv = csvRows[idx]!
		const db = dbRows[idx]!
		let rowFailed = false

		for (const key of INDICATOR_KEYS) {
			const csvVal = csv[key]
			const dbVal = db[key]

			// Both null → consistent null (sparse column, OK)
			if (csvVal === null && dbVal === null) {
				if (verbose) {
					console.log(
						`  [box ${String(db.candleIndex).padStart(3)}]  ${toBrt(db.ts)}  ${INDICATOR_LABELS[key]}  csv=NULL  db=NULL  SKIP`
					)
				}
				continue
			}

			// One null, other not → mismatch
			if (csvVal === null || dbVal === null) {
				if (!rowFailed) {
					console.log(
						`  [box ${String(db.candleIndex).padStart(3)}]  ${toBrt(db.ts)}  MISMATCH:`
					)
					rowFailed = true
				}
				console.log(
					`    ${INDICATOR_LABELS[key]}  csv=${csvVal ?? "NULL"}  db=${dbVal ?? "NULL"}`
				)
				mismatches++
				checked++
				continue
			}

			checked++
			const delta = Math.abs(csvVal - dbVal)
			if (delta > TOLERANCE) {
				if (!rowFailed) {
					console.log(
						`  [box ${String(db.candleIndex).padStart(3)}]  ${toBrt(db.ts)}  MISMATCH:`
					)
					rowFailed = true
				}
				console.log(
					`    ${INDICATOR_LABELS[key]}  csv=${csvVal}  db=${dbVal}  delta=${delta.toFixed(2)}`
				)
				mismatches++
			} else if (verbose) {
				console.log(
					`  [box ${String(db.candleIndex).padStart(3)}]  ${toBrt(db.ts)}  ${INDICATOR_LABELS[key]}  ` +
						`csv=${String(csvVal).padEnd(12)}  db=${String(dbVal).padEnd(12)}  delta=${delta.toFixed(2)}  OK`
				)
			}
		}
	}

	return { ok: mismatches === 0, mismatches, checked }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const run = async () => {
	const arg = process.argv[2]
	const verbose = process.argv.includes("--verbose")

	if (!arg) {
		console.error(
			"Usage: pnpm tsx scripts/check-5m-indicators.ts <YYYY-MM-DD | all> [--verbose]"
		)
		process.exit(1)
	}

	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	const csvByDay = loadCsv()
	const csvDays = [...csvByDay.keys()].sort()
	const daysToCheck =
		arg === "all" ? csvDays : arg.split(",").map((d) => d.trim())

	let totalOk = 0
	let totalFail = 0
	let grandChecked = 0

	for (const day of daysToCheck) {
		const csvRows = csvByDay.get(day)
		if (!csvRows) {
			console.log(`${day}  SKIP  (not in CSV)`)
			continue
		}
		const dbRows = await loadDbDay(sql, day)
		if (dbRows.length === 0) {
			console.log(`${day}  SKIP  (not in DB)`)
			continue
		}

		const { ok, mismatches, checked } = checkDay(day, csvRows, dbRows, verbose)
		grandChecked += checked

		if (ok) {
			console.log(`${day}  OK    (${checked} non-null samples, 0 mismatches)`)
			totalOk++
		} else {
			console.log(
				`${day}  FAIL  mismatches=${mismatches}  (${checked} non-null samples)`
			)
			totalFail++
		}
	}

	console.log(
		`\nSummary: ${totalOk} OK, ${totalFail} FAIL out of ${totalOk + totalFail} days checked  ` +
			`(${grandChecked} non-null samples verified)`
	)

	if (!isNeonUrl(databaseUrl)) {
		await (sql as ReturnType<typeof postgres>).end()
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
