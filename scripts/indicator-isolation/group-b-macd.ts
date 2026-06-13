/**
 * Indicator-isolation audit — Group B: MACD (Sign + Slope).
 *
 * For each Hawks timeframe (5m, 15m, 60m) we compute:
 *
 *   (a) The methodology-correct stateful sign walker (BULL/BEAR sticky, flip
 *       on strict-opposite histogram cross only).
 *   (b) The methodology-correct slope grade per brick (RISING / FALLING /
 *       NO_DATA), conditional on the current sign.
 *   (c) Axion's current stateless `readMacd` output (positive / negative /
 *       zero / unknown).
 *
 * Diffs (a) vs (c) per brick. Tallies the sign × slope cross-tab so we can
 * see how often "best grade" (sign + slope aligned) occurs vs sign-only.
 *
 * Source columns per timeframe (per Ygor's 2026-06-13 spec):
 *   5m   reads  macd1_histo  from data/parquet/candles/hawk_5m_win/WIN.parquet
 *   15m  reads  macd2_histo  from data/parquet/candles/hawk_15m_win/WIN.parquet
 *   60m  reads  macd2_histo  from data/parquet/candles/hawk_60m_win/WIN.parquet
 *
 * Usage:
 *   pnpm tsx scripts/indicator-isolation/group-b-macd.ts
 *   pnpm tsx scripts/indicator-isolation/group-b-macd.ts --from 2026-03-02 --to 2026-03-13
 *   pnpm tsx scripts/indicator-isolation/group-b-macd.ts --samples 20
 *   pnpm tsx scripts/indicator-isolation/group-b-macd.ts --tf 60m
 */

import "dotenv/config"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"

type TfLabel = "5m" | "15m" | "60m"

const TF_CONFIG: Record<
	TfLabel,
	{ parquet: string; column: "macd1_histo" | "macd2_histo" }
> = {
	"5m": {
		parquet: resolve(
			process.cwd(),
			"data/parquet/candles/hawk_5m_win/WIN.parquet"
		),
		column: "macd1_histo",
	},
	"15m": {
		parquet: resolve(
			process.cwd(),
			"data/parquet/candles/hawk_15m_win/WIN.parquet"
		),
		column: "macd2_histo",
	},
	"60m": {
		parquet: resolve(
			process.cwd(),
			"data/parquet/candles/hawk_60m_win/WIN.parquet"
		),
		column: "macd2_histo",
	},
}

interface RawBrick {
	timestamp: string
	histo: number | null
}

type MethodologySign = "BULL" | "BEAR" | "NO_SIGNAL"
type MethodologySlope = "RISING" | "FALLING" | "NO_DATA"
type AxionSign = "positive" | "negative" | "zero" | "unknown"

const toNumber = (v: unknown): number | null => {
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
	if (v === null || v === undefined) {
		return null
	}
	const n = Number(v)
	return Number.isNaN(n) ? null : n
}

const toIsoString = (v: unknown): string => {
	if (v instanceof Date) {
		return v.toISOString()
	}
	if (typeof v === "string") {
		return new Date(v).toISOString()
	}
	if (typeof v === "number") {
		return new Date(v).toISOString()
	}
	if (typeof v === "bigint") {
		return new Date(Number(v) / 1000).toISOString()
	}
	if (v !== null && typeof v === "object" && "micros" in v) {
		const micros = (v as { micros: number | bigint }).micros
		return new Date(Number(micros) / 1000).toISOString()
	}
	throw new Error(`unparseable timestamp ${String(v)}`)
}

/**
 * Methodology sign walker: sticky BULL/BEAR. Flip only on strict-opposite-sign
 * cross. histo === 0 holds prior state. null carries prior state forward
 * (no spurious flip on data gaps).
 */
const walkMethodologySign = (bricks: RawBrick[]): MethodologySign[] => {
	const out: MethodologySign[] = new Array(bricks.length)
	let state: MethodologySign = "NO_SIGNAL"
	for (let i = 0; i < bricks.length; i++) {
		const h = bricks[i]!.histo
		if (h === null) {
			out[i] = state
			continue
		}
		if (state === "NO_SIGNAL") {
			if (h > 0) {
				state = "BULL"
			} else if (h < 0) {
				state = "BEAR"
			}
		} else if (state === "BULL" && h < 0) {
			state = "BEAR"
		} else if (state === "BEAR" && h > 0) {
			state = "BULL"
		}
		out[i] = state
	}
	return out
}

/**
 * Methodology slope walker: 1-brick raw delta. Compares `histo[t]` against the
 * most recent non-null `histo[t-k]`. Holds prior slope class on exact 0 delta
 * (single-brick stall). Emits NO_DATA only when the current brick is null OR
 * when no prior non-null reading exists.
 */
const walkMethodologySlope = (bricks: RawBrick[]): MethodologySlope[] => {
	const out: MethodologySlope[] = new Array(bricks.length)
	let prior: number | null = null
	let slope: MethodologySlope = "NO_DATA"
	for (let i = 0; i < bricks.length; i++) {
		const h = bricks[i]!.histo
		if (h === null) {
			out[i] = "NO_DATA"
			continue
		}
		if (prior === null) {
			out[i] = "NO_DATA"
			prior = h
			continue
		}
		const delta = h - prior
		if (delta > 0) {
			slope = "RISING"
		} else if (delta < 0) {
			slope = "FALLING"
		}
		// delta === 0: hold previous slope class.
		out[i] = slope
		prior = h
	}
	return out
}

/** Axion's stateless reader, re-implemented for the diff. */
const axionStatelessRead = (brick: RawBrick): AxionSign => {
	const v = brick.histo
	if (v === null) {
		return "unknown"
	}
	if (v > 0) {
		return "positive"
	}
	if (v < 0) {
		return "negative"
	}
	return "zero"
}

type DiffBucket =
	| "AGREE_BULL"
	| "AGREE_BEAR"
	| "DISAGREE_FLICKER"
	| "DISAGREE_ZERO"
	| "AXION_UNKNOWN"
	| "BOTH_PRESEEDED"

const classifySign = (m: MethodologySign, a: AxionSign): DiffBucket => {
	if (a === "unknown") {
		return "AXION_UNKNOWN"
	}
	if (m === "NO_SIGNAL") {
		return "BOTH_PRESEEDED"
	}
	if (a === "zero") {
		return "DISAGREE_ZERO"
	}
	if (m === "BULL" && a === "positive") {
		return "AGREE_BULL"
	}
	if (m === "BEAR" && a === "negative") {
		return "AGREE_BEAR"
	}
	return "DISAGREE_FLICKER"
}

const parseArgs = (): {
	fromDate: string | null
	toDate: string | null
	samples: number
	tfFilter: TfLabel | "all"
} => {
	const argv = process.argv.slice(2)
	let fromDate: string | null = null
	let toDate: string | null = null
	let samples = 5
	let tfFilter: TfLabel | "all" = "all"
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!
		if (a === "--from") {
			fromDate = argv[++i] ?? null
		} else if (a === "--to") {
			toDate = argv[++i] ?? null
		} else if (a === "--samples") {
			samples = Number(argv[++i]) || 5
		} else if (a === "--tf") {
			const v = argv[++i]
			if (v === "5m" || v === "15m" || v === "60m") {
				tfFilter = v
			}
		}
	}
	return { fromDate, toDate, samples, tfFilter }
}

const fetchBricks = async (
	parquetPath: string,
	column: "macd1_histo" | "macd2_histo",
	fromDate: string | null,
	toDate: string | null
): Promise<RawBrick[]> => {
	if (!existsSync(parquetPath)) {
		throw new Error(
			`parquet not found at ${parquetPath} — run materialize-hawks-timeframes.ts`
		)
	}
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const where: string[] = []
	if (fromDate) {
		where.push(`timestamp >= TIMESTAMP '${fromDate}T00:00:00.000Z'`)
	}
	if (toDate) {
		const next = new Date(`${toDate}T00:00:00.000Z`)
		next.setUTCDate(next.getUTCDate() + 1)
		where.push(`timestamp < TIMESTAMP '${next.toISOString()}'`)
	}
	const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""
	const reader = await conn.runAndReadAll(
		`SELECT timestamp, ${column}
		 FROM read_parquet('${parquetPath.replace(/'/g, "''")}')
		 ${whereClause}
		 ORDER BY timestamp ASC`
	)
	const rows = reader.getRowObjects()
	return rows.map((row) => ({
		timestamp: toIsoString(row.timestamp),
		histo: toNumber((row as Record<string, unknown>)[column]),
	}))
}

const runOneTf = async (
	tf: TfLabel,
	fromDate: string | null,
	toDate: string | null,
	samples: number
): Promise<void> => {
	const { parquet, column } = TF_CONFIG[tf]
	const bricks = await fetchBricks(parquet, column, fromDate, toDate)
	if (bricks.length === 0) {
		console.log(`\n═══ ${tf} (${column}) — 0 bricks ═══\n  (no data in window)`)
		return
	}

	const methodologySign = walkMethodologySign(bricks)
	const methodologySlope = walkMethodologySlope(bricks)

	const counts: Record<DiffBucket, number> = {
		AGREE_BULL: 0,
		AGREE_BEAR: 0,
		DISAGREE_FLICKER: 0,
		DISAGREE_ZERO: 0,
		AXION_UNKNOWN: 0,
		BOTH_PRESEEDED: 0,
	}
	const samplesByBucket: Record<DiffBucket, string[]> = {
		AGREE_BULL: [],
		AGREE_BEAR: [],
		DISAGREE_FLICKER: [],
		DISAGREE_ZERO: [],
		AXION_UNKNOWN: [],
		BOTH_PRESEEDED: [],
	}
	const crossTab: Record<
		"BULL" | "BEAR" | "NO_SIGNAL",
		Record<MethodologySlope, number>
	> = {
		BULL: { RISING: 0, FALLING: 0, NO_DATA: 0 },
		BEAR: { RISING: 0, FALLING: 0, NO_DATA: 0 },
		NO_SIGNAL: { RISING: 0, FALLING: 0, NO_DATA: 0 },
	}

	for (let i = 0; i < bricks.length; i++) {
		const brick = bricks[i]!
		const axion = axionStatelessRead(brick)
		const m = methodologySign[i]!
		const sl = methodologySlope[i]!
		const bucket = classifySign(m, axion)
		counts[bucket]++
		if (samplesByBucket[bucket].length < samples) {
			samplesByBucket[bucket].push(
				`${brick.timestamp}  histo=${brick.histo === null ? "null" : brick.histo.toFixed(3).padStart(10)}  m=${m.padEnd(9)}  slope=${sl.padEnd(7)}  axion=${axion}`
			)
		}
		crossTab[m][sl]++
	}

	// Sign-flip counters.
	let methodFlips = 0
	for (let i = 1; i < methodologySign.length; i++) {
		if (
			methodologySign[i] !== methodologySign[i - 1] &&
			methodologySign[i] !== "NO_SIGNAL" &&
			methodologySign[i - 1] !== "NO_SIGNAL"
		) {
			methodFlips++
		}
	}
	let axionFlips = 0
	let prevAxion: AxionSign | null = null
	for (const b of bricks) {
		const a = axionStatelessRead(b)
		if (prevAxion === null) {
			prevAxion = a
			continue
		}
		if (
			(prevAxion === "positive" && a === "negative") ||
			(prevAxion === "negative" && a === "positive")
		) {
			axionFlips++
		}
		prevAxion = a
	}

	const total = bricks.length
	console.log(`\n═══ ${tf} (${column}) — ${total} bricks ═══`)
	const order: DiffBucket[] = [
		"AGREE_BULL",
		"AGREE_BEAR",
		"DISAGREE_FLICKER",
		"DISAGREE_ZERO",
		"AXION_UNKNOWN",
		"BOTH_PRESEEDED",
	]
	for (const b of order) {
		const n = counts[b]
		const pct = total > 0 ? ((n / total) * 100).toFixed(1) : "0.0"
		console.log(
			`  ${b.padEnd(22)}  ${String(n).padStart(7)}  (${pct.padStart(5)}%)`
		)
	}

	console.log("\n  Sign state transitions:")
	console.log(
		`    Methodology  ${String(methodFlips).padStart(7)}  (sticky walker)`
	)
	console.log(
		`    Axion        ${String(axionFlips).padStart(7)}  (stateless — counts every strict-opposite cross)`
	)

	console.log("\n  Sign × Slope cross-tab (methodology):")
	console.log("                RISING   FALLING   NO_DATA")
	for (const sign of ["BULL", "BEAR", "NO_SIGNAL"] as const) {
		const r = crossTab[sign]
		console.log(
			`    ${sign.padEnd(10)}  ${String(r.RISING).padStart(7)}  ${String(r.FALLING).padStart(7)}  ${String(r.NO_DATA).padStart(7)}`
		)
	}

	console.log("\n  Sample timestamps per bucket:")
	for (const b of order) {
		if (samplesByBucket[b].length === 0) {
			continue
		}
		console.log(`\n  [${b}]`)
		for (const s of samplesByBucket[b]) {
			console.log(`    ${s}`)
		}
	}
}

const main = async (): Promise<void> => {
	const { fromDate, toDate, samples, tfFilter } = parseArgs()
	const range =
		fromDate || toDate
			? `${fromDate ?? "(start)"}  →  ${toDate ?? "(end)"}`
			: "(full window)"
	console.log(`Indicator-isolation Group B — MACD wiring audit`)
	console.log(`Date range: ${range}`)

	const tfs: TfLabel[] = tfFilter === "all" ? ["5m", "15m", "60m"] : [tfFilter]
	for (const tf of tfs) {
		await runOneTf(tf, fromDate, toDate, samples)
	}
	process.exit(0)
}

void main()
