/**
 * diff-pivots-vs-csv.ts
 *
 * Step-2 verification probe: compares the TOPOS E FUNDOS pivot values stored
 * in `price_candles.indicators.topos_fundos` against the raw CSV column for
 * every BRT trading day.
 *
 * Usage:
 *   pnpm tsx scripts/diff-pivots-vs-csv.ts 2026-05-13
 *   pnpm tsx scripts/diff-pivots-vs-csv.ts all
 *
 * For each pivot brick the probe also prints the engine classification
 * (TOPO vs FUNDO) derived from pivot[N] > pivot[N-1].
 *
 * Pass condition (per day):
 *   - Same pivot brick count.
 *   - Each pivot value matches within 0.5 points.
 *   - Pivot box indices (candle_index) match exactly.
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
		.slice(0, 23)

// ─── CSV loading ─────────────────────────────────────────────────────────────

interface CsvPivot {
	brtDay: string
	candleIndex: number
	ts: Date
	high: number
	low: number
	pivot: number
}

const loadCsvPivots = (): Map<string, CsvPivot[]> => {
	const text = decodeLatin1(CSV_PATH)
	const lines = text.split(/\r?\n/).filter(Boolean).slice(1)
	const byDay = new Map<string, CsvPivot[]>()
	for (const line of lines) {
		const cols = line.split(";")
		const ts = parseDate(cols[0] ?? "")
		if (!ts) {
			continue
		}
		const pivot = parseBrNumber(cols[16])
		if (pivot === null) {
			continue
		}
		const high = parseBrNumber(cols[2])
		const low = parseBrNumber(cols[3])
		const candleIndex = Math.round(Number(cols[12])) || 0
		if (high === null || low === null) {
			continue
		}
		const brtDay = new Date(ts.getTime() - 3 * 3600 * 1000)
			.toISOString()
			.slice(0, 10)
		const day = byDay.get(brtDay) ?? []
		day.push({ brtDay, candleIndex, ts, high, low, pivot })
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

interface DbPivot {
	candleIndex: number
	ts: Date
	high: number
	low: number
	pivot: number
}

const loadDbPivots = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	brtDay: string
): Promise<DbPivot[]> => {
	const fromUtc = new Date(`${brtDay}T03:00:00.000Z`)
	const toUtc = new Date(fromUtc.getTime() + 24 * 3600 * 1000)
	const rows = (await sql`
		SELECT pc.timestamp, pc.high, pc.low,
		       pc.candle_index,
		       (pc.indicators->>'topos_fundos')::numeric AS pivot
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = ${ASSET_SYMBOL}
		  AND t.code = ${TIMEFRAME_CODE}
		  AND pc.timestamp >= ${fromUtc.toISOString()}
		  AND pc.timestamp <  ${toUtc.toISOString()}
		  AND pc.indicators ? 'topos_fundos'
		ORDER BY pc.timestamp, pc.candle_index NULLS LAST
	`) as {
		timestamp: string | Date
		high: string
		low: string
		candle_index: number | null
		pivot: string
	}[]
	return rows.map((r) => ({
		ts: new Date(r.timestamp as string),
		high: Number(r.high),
		low: Number(r.low),
		candleIndex: r.candle_index ?? 0,
		pivot: Number(r.pivot),
	}))
}

// ─── Diff + classification ────────────────────────────────────────────────────

const classify = (
	pivot: number,
	prev: number | null
): "TOPO" | "FUNDO" | "FIRST" =>
	prev === null ? "FIRST" : pivot > prev ? "TOPO" : "FUNDO"

const diffDay = (
	brtDay: string,
	csvRows: CsvPivot[],
	dbRows: DbPivot[],
	verbose: boolean
): { ok: boolean; mismatches: number } => {
	let mismatches = 0

	if (csvRows.length !== dbRows.length) {
		console.log(`  [count]  csv=${csvRows.length} db=${dbRows.length}`)
		mismatches++
	}

	const limit = Math.min(csvRows.length, dbRows.length)
	let prevPivot: number | null = null
	for (let i = 0; i < limit; i++) {
		const csv = csvRows[i]!
		const db = dbRows[i]!
		const dir = classify(csv.pivot, prevPivot)
		prevPivot = csv.pivot

		const indexMismatch = csv.candleIndex !== db.candleIndex
		const valueMismatch = Math.abs(csv.pivot - db.pivot) > 0.5

		if (indexMismatch || valueMismatch) {
			mismatches++
			console.log(
				`  [pivot ${i}]  box csv=${csv.candleIndex} db=${db.candleIndex}  ` +
					`value csv=${csv.pivot} db=${db.pivot}  dir=${dir}  time=${toBrt(csv.ts)}`
			)
		} else if (verbose) {
			console.log(
				`  [pivot ${i}]  box=${csv.candleIndex}  ${String(csv.pivot).padEnd(7)}  ${dir.padEnd(5)}  ${toBrt(csv.ts)}`
			)
		}
	}
	return { ok: mismatches === 0, mismatches }
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const run = async () => {
	const arg = process.argv[2]
	const verbose = process.argv.includes("--verbose")
	if (!arg) {
		console.error(
			"Usage: pnpm tsx scripts/diff-pivots-vs-csv.ts <YYYY-MM-DD | all> [--verbose]"
		)
		process.exit(1)
	}

	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	const csvByDay = loadCsvPivots()
	const csvDays = [...csvByDay.keys()].sort()
	const daysToCheck =
		arg === "all" ? csvDays : arg.split(",").map((d) => d.trim())

	let totalOk = 0
	let totalFail = 0

	for (const day of daysToCheck) {
		const csvRows = csvByDay.get(day)
		if (!csvRows) {
			console.log(`${day}  SKIP  (no pivots in CSV)`)
			continue
		}
		const dbRows = await loadDbPivots(sql, day)
		if (dbRows.length === 0 && csvRows.length > 0) {
			console.log(`${day}  SKIP  (not in DB)`)
			continue
		}
		const { ok, mismatches } = diffDay(day, csvRows, dbRows, verbose)
		if (ok) {
			console.log(`${day}  OK    ${csvRows.length} pivots`)
			totalOk++
		} else {
			console.log(
				`${day}  FAIL  csv=${csvRows.length} db=${dbRows.length} pivots  mismatches=${mismatches}`
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
