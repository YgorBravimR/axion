/**
 * One-shot probe: confirm that turning on aggression.scoreMode = "original"
 * and volume.mode = "score" populates `quality.score` and
 * `quality.contributions[]` on the resulting trades.
 *
 * Usage: pnpm tsx scripts/probe-score-mode.ts
 */
import "dotenv/config"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"
import { DuckDBInstance } from "@duckdb/node-api"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import type { CandleRow } from "@/types/candle"
import type { StrategyRecipe } from "@/types/backtest"

const ASSET_CONFIG = { tickSize: 5, tickValueCents: 100 }
const WIN_ASSET_ID = "2d922fa1-365a-4f17-990f-27e5aa96b659"
const PARQUET_5M = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_5m_win/WIN.parquet"
)
const PARQUET_15M = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_15m_win/WIN.parquet"
)
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000

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
	return Number(v)
}

const toIso = (v: unknown): string => {
	if (v instanceof Date) {
		return v.toISOString()
	}
	if (typeof v === "string") {
		return new Date(v).toISOString()
	}
	if (v !== null && typeof v === "object" && "micros" in v) {
		const micros = (v as { micros: number | bigint }).micros
		return new Date(Number(micros) / 1000).toISOString()
	}
	throw new Error(`unparseable timestamp ${String(v)}`)
}

const dateOfTs = (ts: Date): string =>
	new Date(ts.getTime() + BRT_OFFSET_MS).toISOString().slice(0, 10)

const loadAnchors = async (
	from: string,
	to: string
): Promise<Map<string, Record<string, number>>> => {
	const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
	const rows = (await sql`
		SELECT date::text AS date, payload
		FROM asset_session_anchors
		WHERE asset_id = ${WIN_ASSET_ID} AND date BETWEEN ${from} AND ${to}
	`) as { date: string; payload: Record<string, unknown> | null }[]
	await sql.end()
	const out = new Map<string, Record<string, number>>()
	for (const r of rows) {
		if (!r.payload || typeof r.payload !== "object") {
			continue
		}
		const num: Record<string, number> = {}
		for (const [k, v] of Object.entries(r.payload)) {
			if (typeof v === "number") {
				num[k] = v
			}
		}
		out.set(r.date, num)
	}
	return out
}

const fetchCandles = async (
	parquet: string,
	from: string,
	to: string,
	anchors: Map<string, Record<string, number>>
): Promise<CandleRow[]> => {
	if (!existsSync(parquet)) {
		throw new Error(`missing ${parquet}`)
	}
	const fromUtc = new Date(`${from}T03:00:00.000Z`)
	const toUtc = new Date(`${to}T03:00:00.000Z`)
	const conn = await (await DuckDBInstance.create(":memory:")).connect()
	const reader = await conn.runAndReadAll(
		`SELECT * FROM read_parquet('${parquet.replace(/'/g, "''")}')
		 WHERE timestamp >= TIMESTAMP '${fromUtc.toISOString()}'
		   AND timestamp <= TIMESTAMP '${toUtc.toISOString()}'
		 ORDER BY timestamp ASC`
	)
	const BASE = new Set([
		"timestamp",
		"open",
		"high",
		"low",
		"close",
		"candle_index",
	])
	return reader.getRowObjects().map((row) => {
		const ind: Record<string, number> = {}
		for (const [k, v] of Object.entries(row)) {
			if (BASE.has(k) || v == null) {
				continue
			}
			const n = toNumber(v)
			if (!Number.isNaN(n)) {
				ind[k] = n
			}
		}
		const ts = toIso(row.timestamp)
		const anchor = anchors.get(dateOfTs(new Date(ts)))
		if (anchor) {
			for (const [k, v] of Object.entries(anchor)) {
				if (ind[k] === undefined) {
					ind[k] = v
				}
			}
		}
		const ci = row.candle_index
		return {
			timestamp: ts,
			open: toNumber(row.open),
			high: toNumber(row.high),
			low: toNumber(row.low),
			close: toNumber(row.close),
			candleIndex: ci == null ? null : Number(ci),
			indicators: ind,
		} satisfies CandleRow
	})
}

const buildRecipe = (
	gates: Partial<NonNullable<typeof hawksV0.entry.config.qualityGates>>
): StrategyRecipe => {
	if (hawksV0.entry.type !== "hawks_playbook") {
		throw new Error("drift")
	}
	return {
		...hawksV0,
		entry: {
			type: "hawks_playbook",
			config: {
				...hawksV0.entry.config,
				qualityGates: {
					...(hawksV0.entry.config.qualityGates ?? {}),
					...gates,
				},
			},
		},
	}
}

const main = async () => {
	const from = "2026-03-02"
	const to = "2026-06-13"
	const anchors = await loadAnchors(from, to)
	const [c5, c15] = await Promise.all([
		fetchCandles(PARQUET_5M, from, to, anchors),
		fetchCandles(PARQUET_15M, from, to, anchors),
	])
	console.log(`5m=${c5.length} 15m=${c15.length}`)

	const configs: Array<[string, Parameters<typeof buildRecipe>[0]]> = [
		["BASELINE (all off)", {}],
		[
			"aggression.scoreMode=original",
			{
				aggression: {
					scoreMode: "original",
					blockMode: "off",
					threshold: 15000,
				},
			},
		],
		["volume.mode=score", { volume: { mode: "score", emaPeriod: 500 } }],
		[
			"both score-modes on",
			{
				aggression: {
					scoreMode: "original",
					blockMode: "off",
					threshold: 15000,
				},
				volume: { mode: "score", emaPeriod: 500 },
			},
		],
		["colorStreakFavor=true", { colorStreakFavor: true }],
		[
			"all 3 score-modes on (aggression+volume+colorStreak)",
			{
				aggression: {
					scoreMode: "original",
					blockMode: "off",
					threshold: 15000,
				},
				volume: { mode: "score", emaPeriod: 500 },
				colorStreakFavor: true,
			},
		],
	]

	console.log(
		"\nConfig                                    trades  scoreSum  scoreAvg  contribKeys"
	)
	for (const [name, gates] of configs) {
		const recipe = buildRecipe(gates)
		const result = runBacktest(c5, recipe, ASSET_CONFIG, c15)
		const trades = result.trades
		const scoreSum = trades.reduce((a, t) => a + (t.quality?.score ?? 0), 0)
		const avg = trades.length === 0 ? 0 : scoreSum / trades.length
		const keys = new Set<string>()
		for (const t of trades) {
			for (const c of t.quality?.contributions ?? []) {
				keys.add(c.key)
			}
		}
		console.log(
			`${name.padEnd(42)}  ${String(trades.length).padStart(5)}  ${String(scoreSum).padStart(8)}  ${avg.toFixed(2).padStart(8)}  ${[...keys].join(",")}`
		)
	}
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
