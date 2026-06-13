/**
 * probe-fib-retrace.ts
 *
 * For every Hawks fire in the 20-day audit window, records the retracement
 * ratio at the time of fire — `retracePts / wave1Pts`. Outputs a histogram
 * for matched vs extra trades. If matches cluster on a different band than
 * extras, the Fibonacci-band hypothesis (accept fires only in [0.382, 0.618])
 * is worth implementing. Otherwise it's ruled out by the data.
 *
 * Usage: pnpm tsx scripts/probe-fib-retrace.ts [FROM TO]
 */
import "dotenv/config"
import { existsSync, readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import { DuckDBInstance } from "@duckdb/node-api"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import {
	createInitialHawksState,
	processHawksCandle,
} from "@/lib/backtest/modules/entry/hawks-triple-screen"
import type { CandleRow } from "@/types/candle"
import type {
	UserEntry,
	HawksTripleScreenConfig,
	DayContext,
} from "@/types/backtest"

const ENTRIES_DIR = resolve(process.cwd(), "data/hawks/user-entries")
const PARQUET_PATH = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_5m_win/WIN.parquet"
)
const WIN_ASSET_ID = "2d922fa1-365a-4f17-990f-27e5aa96b659"

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000
const candleTimestampToBrtDate = (ts: Date): string =>
	new Date(ts.getTime() + BRT_OFFSET_MS).toISOString().slice(0, 10)
const candleTimestampToBrtHHMM = (ts: Date): number => {
	const brt = new Date(ts.getTime() + BRT_OFFSET_MS)
	return brt.getUTCHours() * 100 + brt.getUTCMinutes()
}

const toNumber = (v: unknown): number => {
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
		return NaN
	}
	return Number(v)
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

type CatalogEntry = UserEntry

const loadCatalog = (days: string[]): CatalogEntry[] => {
	const files = readdirSync(ENTRIES_DIR)
		.filter((f) => f.endsWith(".json"))
		.sort()
	const all: CatalogEntry[] = []
	for (const f of files) {
		const date = f.replace(".json", "")
		if (days.length > 0 && !days.includes(date)) {
			continue
		}
		const entries = JSON.parse(
			readFileSync(resolve(ENTRIES_DIR, f), "utf-8")
		) as CatalogEntry[]
		all.push(...entries)
	}
	return all
}

const fetchAnchors = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	fromDate: string,
	toDate: string
): Promise<Map<string, Record<string, number>>> => {
	const rows = (await sql`
		SELECT date::text AS date, payload
		FROM asset_session_anchors
		WHERE asset_id = ${WIN_ASSET_ID}
		  AND date BETWEEN ${fromDate} AND ${toDate}
	`) as { date: string; payload: Record<string, unknown> | null }[]
	const out = new Map<string, Record<string, number>>()
	for (const r of rows) {
		if (!r.payload || typeof r.payload !== "object") {
			continue
		}
		const numeric: Record<string, number> = {}
		for (const [key, value] of Object.entries(r.payload)) {
			if (typeof value === "number") {
				numeric[key] = value
			}
		}
		out.set(r.date, numeric)
	}
	return out
}

const fetchCandles = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	fromDate: string,
	toDate: string
): Promise<CandleRow[]> => {
	if (!existsSync(PARQUET_PATH)) {
		throw new Error(`Parquet not found at ${PARQUET_PATH}`)
	}
	const fromUtc = new Date(`${fromDate}T03:00:00.000Z`)
	const toUtc = new Date(`${toDate}T03:00:00.000Z`)
	const instance = await DuckDBInstance.create(":memory:")
	const connection = await instance.connect()
	const reader = await connection.runAndReadAll(
		`SELECT * FROM read_parquet('${PARQUET_PATH.replace(/'/g, "''")}')
		 WHERE timestamp >= TIMESTAMP '${fromUtc.toISOString()}'
		   AND timestamp <= TIMESTAMP '${toUtc.toISOString()}'
		 ORDER BY timestamp ASC`
	)
	const rows = reader.getRowObjects()
	const BASE_COL_SET = new Set([
		"timestamp",
		"open",
		"high",
		"low",
		"close",
		"candle_index",
	])
	const anchorsByDate = await fetchAnchors(sql, fromDate, toDate)
	return rows.map((row) => {
		const indicators: Record<string, number> = {}
		for (const [key, v] of Object.entries(row)) {
			if (BASE_COL_SET.has(key)) {
				continue
			}
			if (v !== null && v !== undefined) {
				const n = toNumber(v)
				if (!Number.isNaN(n)) {
					indicators[key] = n
				}
			}
		}
		const ts = toIsoString(row.timestamp)
		const dateKey = candleTimestampToBrtDate(new Date(ts))
		const anchorPayload = anchorsByDate.get(dateKey)
		if (anchorPayload) {
			for (const [key, value] of Object.entries(anchorPayload)) {
				if (indicators[key] === undefined) {
					indicators[key] = value
				}
			}
		}
		return {
			timestamp: ts,
			open: toNumber(row.open),
			high: toNumber(row.high),
			low: toNumber(row.low),
			close: toNumber(row.close),
			candleIndex:
				row.candle_index === null || row.candle_index === undefined
					? 0
					: toNumber(row.candle_index),
			indicators,
		}
	})
}

const run = async () => {
	const argv = process.argv.slice(2).filter((a) => !a.startsWith("--"))
	const url = process.env.DATABASE_URL
	if (!url) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)

	let days: string[]
	if (argv.length === 2) {
		const all = readdirSync(ENTRIES_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(".json", ""))
			.sort()
		days = all.filter((d) => d >= argv[0]! && d <= argv[1]!)
	} else {
		days = readdirSync(ENTRIES_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(".json", ""))
			.sort()
	}

	const catalog = loadCatalog(days)
	if (catalog.length === 0) {
		process.exit(0)
	}
	const minDay = days[0]!
	const maxDay = days[days.length - 1]!
	const nextDay = new Date(
		new Date(`${maxDay}T03:00:00Z`).getTime() + 24 * 3600 * 1000
	)
		.toISOString()
		.slice(0, 10)
	const candles = await fetchCandles(sql, minDay, nextDay)

	const candlesByDay = new Map<string, CandleRow[]>()
	for (const c of candles) {
		const day = candleTimestampToBrtDate(new Date(c.timestamp))
		const arr = candlesByDay.get(day) ?? []
		arr.push(c)
		candlesByDay.set(day, arr)
	}

	const config = (hawksV0.entry as { config: HawksTripleScreenConfig }).config

	// Walk the engine in lockstep with audit-parallel; for each fire, capture
	// the retracement ratio as a percentage of wave-1.
	const fires: Array<{
		day: string
		brickIdx: number
		direction: "short" | "long"
		wave1Pts: number
		retracePts: number
		ratio: number
		// Will be filled in after by matching against catalog.
		matched?: boolean
	}> = []

	let state = createInitialHawksState()
	for (const day of days) {
		const dayCandles = candlesByDay.get(day) ?? []
		for (let i = 0; i < dayCandles.length; i++) {
			const candle = dayCandles[i]!
			const ctx: DayContext = {
				candleIndexInDay: i,
				brtHHMM: candleTimestampToBrtHHMM(new Date(candle.timestamp)),
			}
			// Snapshot the state's anchors BEFORE processing this brick so we
			// have wave1/retrace at "what the fire saw" — except processHawksCandle
			// is also where maxHighSinceFundo gets updated to the current brick's
			// high. So compute as it would post-update for fairness with the
			// engine's eval path.
			const prevState = state
			const out = processHawksCandle(candle, state, ctx, 5, config)
			state = out.state
			if (out.signal) {
				const dir = out.signal.direction
				// Reproduce the engine's computation: for SHORT, the engine just
				// updated next.maxHighSinceFundo with brick.high. We want THAT
				// value plus the topo/fundo anchors that existed at fire time.
				// The returned `state` is post-fire reset — so topo/fundo are
				// "frozen" at the moment the engine evaluated, but the reset
				// path overwrote them. Re-derive from prevState + this brick:
				if (dir === "short") {
					const topo = prevState.topoMaiorPrice
					const fundo = prevState.fundoPrice
					const peakBefore = prevState.maxHighSinceFundo
					if (topo !== null && fundo !== null) {
						const wave1 = topo - fundo
						// Engine updates maxHighSinceFundo to MAX(prev, candle.high).
						const peak = Math.max(peakBefore ?? candle.high, candle.high)
						const retrace = peak - fundo
						const ratio = wave1 > 0 ? retrace / wave1 : 0
						fires.push({
							day,
							brickIdx: candle.candleIndex ?? -1,
							direction: dir,
							wave1Pts: wave1,
							retracePts: retrace,
							ratio,
						})
					}
				} else {
					const topo = prevState.topoPrice
					const fundoM = prevState.fundoMaiorPrice
					const troughBefore = prevState.minLowSinceTopo
					if (topo !== null && fundoM !== null) {
						const wave1 = topo - fundoM
						const trough = Math.min(troughBefore ?? candle.low, candle.low)
						const retrace = topo - trough
						const ratio = wave1 > 0 ? retrace / wave1 : 0
						fires.push({
							day,
							brickIdx: candle.candleIndex ?? -1,
							direction: dir,
							wave1Pts: wave1,
							retracePts: retrace,
							ratio,
						})
					}
				}
			}
		}
	}

	// Tag matched/extra by comparing each fire to catalog entries within ±2.
	const claimed = new Set<number>()
	for (const entry of catalog) {
		let bestIdx = -1
		let bestDelta = Infinity
		for (let i = 0; i < fires.length; i++) {
			if (claimed.has(i)) {
				continue
			}
			const f = fires[i]!
			if (f.day !== entry.date) {
				continue
			}
			if (f.direction !== entry.direction) {
				continue
			}
			const d = Math.abs(f.brickIdx - entry.brickIndex)
			if (d > 2) {
				continue
			}
			if (d < bestDelta) {
				bestDelta = d
				bestIdx = i
			}
		}
		if (bestIdx >= 0) {
			fires[bestIdx]!.matched = true
			claimed.add(bestIdx)
		}
	}
	for (const f of fires) {
		if (f.matched === undefined) {
			f.matched = false
		}
	}

	const matched = fires.filter((f) => f.matched)
	const extras = fires.filter((f) => !f.matched)

	const bands = [
		{ name: "0.0-0.2", lo: 0.0, hi: 0.2 },
		{ name: "0.2-0.382", lo: 0.2, hi: 0.382 },
		{ name: "0.382-0.5", lo: 0.382, hi: 0.5 },
		{ name: "0.5-0.618", lo: 0.5, hi: 0.618 },
		{ name: "0.618-0.786", lo: 0.618, hi: 0.786 },
		{ name: "0.786-1.0", lo: 0.786, hi: 1.0 },
		{ name: "1.0-1.272", lo: 1.0, hi: 1.272 },
		{ name: ">1.272", lo: 1.272, hi: Infinity },
	]

	console.log(
		`\nFires total: ${fires.length} (matched: ${matched.length}, extras: ${extras.length})`
	)
	console.log(`Retracement ratio (retracePts/wave1Pts) histogram:\n`)
	console.log(
		`  Band            matched       extras      m_pct  x_pct  m_rate`
	)
	console.log(`  ─────────────  ───────────  ───────────  ─────  ─────  ──────`)
	for (const b of bands) {
		const m = matched.filter((f) => f.ratio >= b.lo && f.ratio < b.hi).length
		const x = extras.filter((f) => f.ratio >= b.lo && f.ratio < b.hi).length
		const tot = m + x
		const mPct =
			matched.length > 0 ? ((m / matched.length) * 100).toFixed(1) : "—"
		const xPct =
			extras.length > 0 ? ((x / extras.length) * 100).toFixed(1) : "—"
		const mRate = tot > 0 ? ((m / tot) * 100).toFixed(1) : "—"
		console.log(
			`  ${b.name.padEnd(13)}  ${String(m).padStart(3)} (${mPct.padStart(5)}%)  ${String(x).padStart(3)} (${xPct.padStart(5)}%)  ${mPct.padStart(5)}  ${xPct.padStart(5)}  ${mRate.padStart(5)}%`
		)
	}

	// Direction-split
	for (const dir of ["short", "long"] as const) {
		const m = matched.filter((f) => f.direction === dir)
		const x = extras.filter((f) => f.direction === dir)
		console.log(
			`\n${dir.toUpperCase()} only — matched: ${m.length}, extras: ${x.length}`
		)
		console.log(`  Band            matched       extras       m_rate`)
		for (const b of bands) {
			const mb = m.filter((f) => f.ratio >= b.lo && f.ratio < b.hi).length
			const xb = x.filter((f) => f.ratio >= b.lo && f.ratio < b.hi).length
			const tot = mb + xb
			const mRate = tot > 0 ? ((mb / tot) * 100).toFixed(1) : "—"
			console.log(
				`  ${b.name.padEnd(13)}  ${String(mb).padStart(3)}          ${String(xb).padStart(3)}          ${mRate.padStart(5)}%`
			)
		}
	}
}

run().then(() => process.exit(0))
