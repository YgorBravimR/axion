/**
 * diagnose-misses.ts
 *
 * Read-only probe: for every catalog MISS, snapshot the engine state at
 * the catalog brick and bucket the cause into one of:
 *
 *   - GATE_15M_FAIL  — 15m EMA condition fails (prev_15m open/close not strict)
 *   - GATE_60M_FAIL  — 60m EMA condition fails
 *   - PHASE_NOT_W2   — state machine never entered WAVE_2_UP / WAVE_2_DOWN
 *                      (so no fire could be considered for that direction)
 *   - WAVE1_TOO_SHORT — wave1 distance < wave1Min * brickSize
 *   - RETRACE_TOO_SHORT — wave2 retracement < retracementMin * brickSize
 *   - DESC_HIGH_FAIL  — current brick high not below topoMaior (SHORT) /
 *                       low not above fundoMaior (LONG)
 *   - BRICK_WRONG_DIR — current brick not bearish (SHORT) / not bullish (LONG)
 *   - COOLDOWN        — within cooldown of the previous fire
 *   - QUALITY_BLOCKED — quality rule blocked the entry
 *
 * Runs the full engine once and re-builds per-brick state snapshots so we
 * can answer "what was the state at brick X on day Y" for each MISS.
 *
 * Usage: pnpm tsx scripts/diagnose-misses.ts [FROM TO]
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
	type HawksState,
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

const gateShort = (
	candle: CandleRow,
	cfg: HawksTripleScreenConfig
): { fifteen: boolean; sixty: boolean; missing: boolean } => {
	const i = candle.indicators
	const p15o = i[cfg.prev_15m_open_key]
	const p15c = i[cfg.prev_15m_close_key]
	const e27_15 = i[cfg.ema27_15m_key]
	const e55_15 = i[cfg.ema55_15m_key]
	const p60o = i[cfg.prev_60m_open_key]
	const p60c = i[cfg.prev_60m_close_key]
	const e27_60 = i[cfg.ema27_60m_key]
	const e55_60 = i[cfg.ema55_60m_key]
	const missing = [p15o, p15c, e27_15, e55_15, p60o, p60c, e27_60, e55_60].some(
		(v) => typeof v !== "number"
	)
	if (missing) {
		return { fifteen: false, sixty: false, missing: true }
	}
	const fifteen =
		p15o! < e27_15! && p15o! < e55_15! && p15c! < e27_15! && p15c! < e55_15!
	const sixty =
		p60o! < e27_60! && p60o! < e55_60! && p60c! < e27_60! && p60c! < e55_60!
	return { fifteen, sixty, missing: false }
}

const gateLong = (
	candle: CandleRow,
	cfg: HawksTripleScreenConfig
): { fifteen: boolean; sixty: boolean; missing: boolean } => {
	const i = candle.indicators
	const p15o = i[cfg.prev_15m_open_key]
	const p15c = i[cfg.prev_15m_close_key]
	const e27_15 = i[cfg.ema27_15m_key]
	const e55_15 = i[cfg.ema55_15m_key]
	const p60o = i[cfg.prev_60m_open_key]
	const p60c = i[cfg.prev_60m_close_key]
	const e27_60 = i[cfg.ema27_60m_key]
	const e55_60 = i[cfg.ema55_60m_key]
	const missing = [p15o, p15c, e27_15, e55_15, p60o, p60c, e27_60, e55_60].some(
		(v) => typeof v !== "number"
	)
	if (missing) {
		return { fifteen: false, sixty: false, missing: true }
	}
	const fifteen =
		p15o! > e27_15! && p15o! > e55_15! && p15c! > e27_15! && p15c! > e55_15!
	const sixty =
		p60o! > e27_60! && p60o! > e55_60! && p60c! > e27_60! && p60c! > e55_60!
	return { fifteen, sixty, missing: false }
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
		const allFiles = readdirSync(ENTRIES_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(".json", ""))
			.sort()
		days = allFiles.filter((d) => d >= argv[0]! && d <= argv[1]!)
	} else {
		days = readdirSync(ENTRIES_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(".json", ""))
			.sort()
	}

	const catalog = loadCatalog(days)
	if (days.length === 0) {
		console.log("No matching days for the specified range.")
		process.exit(0)
	}
	if (catalog.length === 0) {
		console.log("No catalog entries.")
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

	// Build per-day candle map (BRT date → candles[]) and a per-(day, brickIdx)
	// snapshot of the engine state right BEFORE processing that brick. This
	// is exactly what the engine sees when it considers firing on a catalog
	// brick.
	const candlesByDay = new Map<string, CandleRow[]>()
	for (const c of candles) {
		const day = candleTimestampToBrtDate(new Date(c.timestamp))
		const arr = candlesByDay.get(day) ?? []
		arr.push(c)
		candlesByDay.set(day, arr)
	}

	const config = (hawksV0.entry as { config: HawksTripleScreenConfig }).config

	// Replay the engine, recording state before each brick is processed, so
	// we can answer "at brick X on day Y, what was the state?".
	const stateByDayBrick = new Map<string, HawksState>()
	const wave1MinBricks = config.wave1MinBricks ?? 4
	const retracementMinBricks = config.retracementMinBricks ?? 2

	let state = createInitialHawksState()
	for (const day of days) {
		const dayCandles = candlesByDay.get(day) ?? []
		for (let i = 0; i < dayCandles.length; i++) {
			const candle = dayCandles[i]!
			const ctx: DayContext = {
				candleIndexInDay: i,
				brtHHMM: candleTimestampToBrtHHMM(new Date(candle.timestamp)),
			}
			// Snapshot state BEFORE processing
			stateByDayBrick.set(`${day}:${i}`, structuredClone(state))
			const out = processHawksCandle(candle, state, ctx, 5, config)
			state = out.state
		}
	}

	const causes: Record<string, number> = {
		GATE_15M_FAIL: 0,
		GATE_60M_FAIL: 0,
		GATE_BOTH_FAIL: 0,
		GATE_KEYS_MISSING: 0,
		PHASE_NOT_W2: 0,
		WAVE1_TOO_SHORT: 0,
		RETRACE_TOO_SHORT: 0,
		DESC_HIGH_FAIL: 0,
		BRICK_WRONG_DIR: 0,
		COOLDOWN: 0,
		NO_ANCHOR: 0,
		BRICK_NOT_FOUND: 0,
		PASS_BUT_NO_FIRE: 0,
	}

	const dayBreakdown = new Map<
		string,
		{ misses: number; gateFail: number; phaseBlock: number }
	>()

	let totalMisses = 0

	for (const entry of catalog) {
		const day = entry.date
		const dayCandles = candlesByDay.get(day) ?? []
		// Catalog brickIndex is 1-indexed per the data; engine candleIndexInDay
		// is 0-indexed. The audit harness compares against entryBrickIndex
		// (which the engine emits as 1-indexed via candle_index column).
		// Find the candle whose candleIndex (from parquet, 1-indexed) matches.
		const idx = dayCandles.findIndex((c) => c.candleIndex === entry.brickIndex)
		if (idx < 0) {
			causes.BRICK_NOT_FOUND = (causes.BRICK_NOT_FOUND ?? 0) + 1
			continue
		}
		const candle = dayCandles[idx]!

		// Was this an EXACT/NEAR? We need to skip non-misses. Easiest: re-derive
		// from the engine — replay produced fires at certain bricks. But this
		// probe wants only MISSES, which the audit identifies as catalog entries
		// without a matching engine trade within ±2 bricks. We re-derive by
		// checking the engine's fire on this day: if it fired within ±2 of this
		// brick with same direction, skip.
		const fireBricks: number[] = []
		let dayState = createInitialHawksState()
		// Carry persistent state across days from the global replay (gross —
		// recompute by walking from day 0). But we already have stateByDayBrick.
		// Use a different approach: detect fires per-day by re-running.
		for (let i = 0; i < dayCandles.length; i++) {
			const c = dayCandles[i]!
			const ctx: DayContext = {
				candleIndexInDay: i,
				brtHHMM: candleTimestampToBrtHHMM(new Date(c.timestamp)),
			}
			const out = processHawksCandle(c, dayState, ctx, 5, config)
			dayState = out.state
			if (out.signal && out.signal.direction === entry.direction) {
				fireBricks.push(c.candleIndex ?? -1)
			}
		}
		const matched = fireBricks.some((b) => Math.abs(b - entry.brickIndex) <= 2)
		if (matched) {
			continue
		}

		totalMisses++
		const dayKey = day
		const dayRow = dayBreakdown.get(dayKey) ?? {
			misses: 0,
			gateFail: 0,
			phaseBlock: 0,
		}
		dayRow.misses++

		// Snapshot state BEFORE the catalog brick to see what blocked it
		const s = stateByDayBrick.get(`${day}:${idx}`)
		if (!s) {
			causes.BRICK_NOT_FOUND = (causes.BRICK_NOT_FOUND ?? 0) + 1
			continue
		}

		// Direction-specific diagnosis
		const gate =
			entry.direction === "short"
				? gateShort(candle, config)
				: gateLong(candle, config)
		const isBearish = candle.close < candle.open
		const isBullish = candle.close > candle.open
		const requiredPhase =
			entry.direction === "short" ? "WAVE_2_UP" : "WAVE_2_DOWN"
		const brickSize =
			Math.abs(candle.close - candle.open) || config.brickSize5mPoints

		// Cascade: report the FIRST reason that blocked. Phase block first
		// (because if state isn't W2_*, none of the other checks fire).
		if (gate.missing) {
			causes.GATE_KEYS_MISSING = (causes.GATE_KEYS_MISSING ?? 0) + 1
			dayRow.gateFail++
		} else if (s.phase !== requiredPhase) {
			causes.PHASE_NOT_W2 = (causes.PHASE_NOT_W2 ?? 0) + 1
			dayRow.phaseBlock++
		} else {
			// Phase is correct. Check the structural conditions.
			if (entry.direction === "short") {
				if (s.topoMaiorPrice === null || s.fundoPrice === null) {
					causes.NO_ANCHOR = (causes.NO_ANCHOR ?? 0) + 1
				} else if (!isBearish) {
					causes.BRICK_WRONG_DIR = (causes.BRICK_WRONG_DIR ?? 0) + 1
				} else if (candle.high >= s.topoMaiorPrice) {
					causes.DESC_HIGH_FAIL = (causes.DESC_HIGH_FAIL ?? 0) + 1
				} else {
					const wave1Pts = s.topoMaiorPrice - s.fundoPrice
					const peak = s.maxHighSinceFundo ?? s.fundoPrice
					const retracePts = peak - s.fundoPrice
					if (wave1Pts < wave1MinBricks * brickSize) {
						causes.WAVE1_TOO_SHORT = (causes.WAVE1_TOO_SHORT ?? 0) + 1
					} else if (retracePts < retracementMinBricks * brickSize) {
						causes.RETRACE_TOO_SHORT = (causes.RETRACE_TOO_SHORT ?? 0) + 1
					} else if (!gate.fifteen && !gate.sixty) {
						causes.GATE_BOTH_FAIL = (causes.GATE_BOTH_FAIL ?? 0) + 1
						dayRow.gateFail++
					} else if (!gate.fifteen) {
						causes.GATE_15M_FAIL = (causes.GATE_15M_FAIL ?? 0) + 1
						dayRow.gateFail++
					} else if (!gate.sixty) {
						causes.GATE_60M_FAIL = (causes.GATE_60M_FAIL ?? 0) + 1
						dayRow.gateFail++
					} else {
						causes.PASS_BUT_NO_FIRE = (causes.PASS_BUT_NO_FIRE ?? 0) + 1
					}
				}
			} else {
				if (s.fundoMaiorPrice === null || s.topoPrice === null) {
					causes.NO_ANCHOR = (causes.NO_ANCHOR ?? 0) + 1
				} else if (!isBullish) {
					causes.BRICK_WRONG_DIR = (causes.BRICK_WRONG_DIR ?? 0) + 1
				} else if (candle.low <= s.fundoMaiorPrice) {
					causes.DESC_HIGH_FAIL = (causes.DESC_HIGH_FAIL ?? 0) + 1
				} else {
					const wave1Pts = s.topoPrice - s.fundoMaiorPrice
					const trough = s.minLowSinceTopo ?? s.topoPrice
					const retracePts = s.topoPrice - trough
					if (wave1Pts < wave1MinBricks * brickSize) {
						causes.WAVE1_TOO_SHORT = (causes.WAVE1_TOO_SHORT ?? 0) + 1
					} else if (retracePts < retracementMinBricks * brickSize) {
						causes.RETRACE_TOO_SHORT = (causes.RETRACE_TOO_SHORT ?? 0) + 1
					} else if (!gate.fifteen && !gate.sixty) {
						causes.GATE_BOTH_FAIL = (causes.GATE_BOTH_FAIL ?? 0) + 1
						dayRow.gateFail++
					} else if (!gate.fifteen) {
						causes.GATE_15M_FAIL = (causes.GATE_15M_FAIL ?? 0) + 1
						dayRow.gateFail++
					} else if (!gate.sixty) {
						causes.GATE_60M_FAIL = (causes.GATE_60M_FAIL ?? 0) + 1
						dayRow.gateFail++
					} else {
						causes.PASS_BUT_NO_FIRE = (causes.PASS_BUT_NO_FIRE ?? 0) + 1
					}
				}
			}
		}

		dayBreakdown.set(dayKey, dayRow)
	}

	console.log()
	console.log(
		`MISS DIAGNOSIS — total catalog: ${catalog.length}, total misses: ${totalMisses}`
	)
	console.log("─".repeat(60))
	const total = totalMisses || 1
	const sorted = Object.entries(causes).sort((a, b) => b[1] - a[1])
	for (const [cause, n] of sorted) {
		if (n === 0) {
			continue
		}
		const pct = ((n / total) * 100).toFixed(1)
		console.log(
			`  ${cause.padEnd(22)}  ${String(n).padStart(4)}  (${pct.padStart(5)}%)`
		)
	}
	console.log()
	console.log("Per-day miss breakdown (top 12 by miss count)")
	const dayRows = Array.from(dayBreakdown.entries())
		.map(([day, row]) => ({ day, ...row }))
		.sort((a, b) => b.misses - a.misses)
		.slice(0, 12)
	for (const { day, misses, gateFail, phaseBlock } of dayRows) {
		console.log(
			`  ${day}  misses=${String(misses).padStart(2)}  gate=${String(gateFail).padStart(2)}  phase=${String(phaseBlock).padStart(2)}`
		)
	}
}

run().then(() => process.exit(0))
