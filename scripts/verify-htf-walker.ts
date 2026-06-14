/**
 * verify-htf-walker.ts
 *
 * Walk the corrected hawk_5m_win parquet through the HTF gate walker and
 * report per-day state distributions + transition counts. Used to greenlight
 * the gate after the 2026-06-14 materializer projection fix.
 *
 * Usage:
 *   pnpm tsx scripts/verify-htf-walker.ts
 *   pnpm tsx scripts/verify-htf-walker.ts 2026-05-29
 */

import "dotenv/config"
import { resolve } from "node:path"
import { DuckDBInstance } from "@duckdb/node-api"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import { buildHtfWalker } from "@/lib/backtest/hawks-htf-walker"
import type { CandleRow } from "@/types/candle"

const PARQUET = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_5m_win/WIN.parquet"
)

const BRT_OFFSET = -3 * 60 * 60 * 1000
const brtDate = (ts: string): string =>
	new Date(new Date(ts).getTime() + BRT_OFFSET).toISOString().slice(0, 10)

const tsFromDuck = (v: unknown): string => {
	if (v instanceof Date) {
		return v.toISOString()
	}
	if (typeof v === "string") {
		return new Date(v).toISOString()
	}
	if (v !== null && typeof v === "object" && "micros" in v) {
		return new Date(
			Number((v as { micros: number | bigint }).micros) / 1000
		).toISOString()
	}
	throw new Error(`bad ts: ${String(v)}`)
}

const num = (v: unknown): number | undefined => {
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
	return undefined
}

const main = async () => {
	const focusDate = process.argv[2] ?? null
	if (hawksV0.entry.type !== "hawks_triple_screen") {
		throw new Error("preset misconfigured")
	}
	const config = hawksV0.entry.config

	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const reader = await conn.runAndReadAll(
		`SELECT * FROM read_parquet('${PARQUET}') ORDER BY timestamp ASC`
	)
	const rows = reader.getRowObjects()

	const candles: CandleRow[] = rows.map((r) => {
		const indicators: Record<string, number> = {}
		for (const [k, v] of Object.entries(r)) {
			if (
				k === "timestamp" ||
				k === "open" ||
				k === "high" ||
				k === "low" ||
				k === "close" ||
				k === "candle_index"
			) {
				continue
			}
			const n = num(v)
			if (n !== undefined && !Number.isNaN(n)) {
				indicators[k] = n
			}
		}
		return {
			timestamp: tsFromDuck(r.timestamp),
			open: num(r.open) ?? 0,
			high: num(r.high) ?? 0,
			low: num(r.low) ?? 0,
			close: num(r.close) ?? 0,
			candleIndex: 0,
			indicators,
		}
	})

	const walker = buildHtfWalker(candles, config)

	// Per-day summary.
	const byDay = new Map<
		string,
		{
			bricks: number
			states15m: Map<string, number>
			states60m: Map<string, number>
		}
	>()
	let prev15 = "NO_SIGNAL"
	let prev60 = "NO_SIGNAL"
	let flips15 = 0
	let flips60 = 0
	const transitions15: Array<{ ts: string; from: string; to: string }> = []
	const transitions60: Array<{ ts: string; from: string; to: string }> = []

	for (const c of candles) {
		const day = brtDate(c.timestamp)
		const snap = walker.get(c.timestamp)
		if (!snap) {
			continue
		}
		if (!byDay.has(day)) {
			byDay.set(day, {
				bricks: 0,
				states15m: new Map(),
				states60m: new Map(),
			})
		}
		const d = byDay.get(day)!
		d.bricks++
		d.states15m.set(snap.gate15m, (d.states15m.get(snap.gate15m) ?? 0) + 1)
		d.states60m.set(snap.gate60m, (d.states60m.get(snap.gate60m) ?? 0) + 1)
		if (snap.gate15m !== prev15) {
			flips15++
			transitions15.push({ ts: c.timestamp, from: prev15, to: snap.gate15m })
			prev15 = snap.gate15m
		}
		if (snap.gate60m !== prev60) {
			flips60++
			transitions60.push({ ts: c.timestamp, from: prev60, to: snap.gate60m })
			prev60 = snap.gate60m
		}
	}

	console.log(`Total candles:      ${candles.length}`)
	console.log(`Total state flips:  15m=${flips15}  60m=${flips60}`)
	console.log("")

	if (focusDate) {
		const d = byDay.get(focusDate)
		if (!d) {
			console.log(`No data for ${focusDate}`)
			process.exit(0)
		}
		console.log(`── ${focusDate} (${d.bricks} bricks) ──`)
		console.log(
			`  15m: ${[...d.states15m].map(([k, v]) => `${k}=${v}`).join(" ")}`
		)
		console.log(
			`  60m: ${[...d.states60m].map(([k, v]) => `${k}=${v}`).join(" ")}`
		)
		console.log("\nTransitions in this day:")
		for (const t of transitions15) {
			if (brtDate(t.ts) !== focusDate) {
				continue
			}
			console.log(`  15m ${t.ts}  ${t.from} → ${t.to}`)
		}
		for (const t of transitions60) {
			if (brtDate(t.ts) !== focusDate) {
				continue
			}
			console.log(`  60m ${t.ts}  ${t.from} → ${t.to}`)
		}
		process.exit(0)
	}

	console.log("── Per-day state distribution (15m | 60m) ──")
	const days = [...byDay.keys()].sort()
	for (const day of days) {
		const d = byDay.get(day)!
		const fmt = (m: Map<string, number>): string => {
			const bull = m.get("BULL") ?? 0
			const bear = m.get("BEAR") ?? 0
			const none = m.get("NO_SIGNAL") ?? 0
			return `BULL=${String(bull).padStart(3)} BEAR=${String(bear).padStart(3)} NS=${String(none).padStart(3)}`
		}
		console.log(
			`  ${day}  bricks=${String(d.bricks).padStart(4)}  | 15m ${fmt(d.states15m)} | 60m ${fmt(d.states60m)}`
		)
	}

	process.exit(0)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
