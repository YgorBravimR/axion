/**
 * check-htf-emas.ts
 *
 * Step-6 verification probe: spot-checks the cross-timeframe EMA values on
 * 5m bricks — `mme27_15m`, `mme55_15m`, `mme27_60m`, `mme55_60m`.
 *
 * These are loaded directly from the pre-joined 5m CSV columns:
 *   col 5  → mme27_60m   (MME27 60m in ProfitChart)
 *   col 6  → mme55_60m   (MME55 60m)
 *   col 7  → mme55_15m   (MME55 15m)
 *   col 8  → mme27_15m   (MME27 15m)
 *
 * These are GATE indicators: the Hawks triple-screen entry requires the most
 * recently closed 15m AND 60m Renko brick to have both open AND close below
 * MME27 AND MME55 of their timeframe (for SHORT). Gate rule: STRICT (both
 * open and close strictly below both EMAs — no box-buffer applied).
 *
 * Usage:
 *   pnpm tsx scripts/check-htf-emas.ts 2026-05-13
 *   pnpm tsx scripts/check-htf-emas.ts all
 *   pnpm tsx scripts/check-htf-emas.ts all --verbose
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
	mme27_60m: number | null
	mme55_60m: number | null
	mme55_15m: number | null
	mme27_15m: number | null
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
			mme27_60m: parseBrNumber(cols[5]),
			mme55_60m: parseBrNumber(cols[6]),
			mme55_15m: parseBrNumber(cols[7]),
			mme27_15m: parseBrNumber(cols[8]),
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
	mme27_60m: number | null
	mme55_60m: number | null
	mme55_15m: number | null
	mme27_15m: number | null
}

const loadDbDay = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	brtDay: string
): Promise<DbRow[]> => {
	const fromUtc = new Date(`${brtDay}T03:00:00.000Z`)
	const toUtc = new Date(fromUtc.getTime() + 24 * 3600 * 1000)
	const rows = (await sql`
		SELECT pc.timestamp, pc.candle_index,
		       (pc.indicators->>'mme27_60m')::numeric AS mme27_60m,
		       (pc.indicators->>'mme55_60m')::numeric AS mme55_60m,
		       (pc.indicators->>'mme55_15m')::numeric AS mme55_15m,
		       (pc.indicators->>'mme27_15m')::numeric AS mme27_15m
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
		mme27_60m: string | null
		mme55_60m: string | null
		mme55_15m: string | null
		mme27_15m: string | null
	}[]
	return rows.map((r) => ({
		ts: new Date(r.timestamp as string),
		candleIndex: r.candle_index ?? 0,
		mme27_60m: r.mme27_60m !== null ? Number(r.mme27_60m) : null,
		mme55_60m: r.mme55_60m !== null ? Number(r.mme55_60m) : null,
		mme55_15m: r.mme55_15m !== null ? Number(r.mme55_15m) : null,
		mme27_15m: r.mme27_15m !== null ? Number(r.mme27_15m) : null,
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

type EmaKey = "mme27_60m" | "mme55_60m" | "mme55_15m" | "mme27_15m"
const EMA_KEYS: EmaKey[] = ["mme27_60m", "mme55_60m", "mme55_15m", "mme27_15m"]

const checkDay = (
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

		for (const key of EMA_KEYS) {
			const csvVal = csv[key]
			const dbVal = db[key]

			if (csvVal === null && dbVal === null) {
				continue
			}

			checked++
			if (
				csvVal === null ||
				dbVal === null ||
				Math.abs(csvVal - dbVal) > TOLERANCE
			) {
				if (!rowFailed) {
					console.log(
						`  [box ${String(db.candleIndex).padStart(3)}]  ${toBrt(db.ts)}  MISMATCH:`
					)
					rowFailed = true
				}
				console.log(
					`    ${key.padEnd(12)} csv=${csvVal ?? "NULL"}  db=${dbVal ?? "NULL"}`
				)
				mismatches++
			} else if (verbose) {
				console.log(
					`  [box ${String(db.candleIndex).padStart(3)}]  ${toBrt(db.ts)}  ${key.padEnd(12)}  ` +
						`csv=${String(csvVal).padEnd(12)}  db=${String(dbVal).padEnd(12)}  delta=${Math.abs(csvVal - dbVal).toFixed(2)}  OK`
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
			"Usage: pnpm tsx scripts/check-htf-emas.ts <YYYY-MM-DD | all> [--verbose]"
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

		const { ok, mismatches, checked } = checkDay(csvRows, dbRows, verbose)
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
	console.log(
		"Gate rule: STRICT — prev brick open AND close both below MME27 AND MME55 (no box-buffer)"
	)

	if (!isNeonUrl(databaseUrl)) {
		await (sql as ReturnType<typeof postgres>).end()
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
