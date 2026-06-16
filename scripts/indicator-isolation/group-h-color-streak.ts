/**
 * Indicator-isolation audit — Group H: Color-streak run-length.
 *
 * Each Renko brick is bullish (close > open) or bearish (close < open). A
 * "color streak" at brick i is the maximal run of consecutive same-color
 * bricks ending at i, INCLUSIVE of i. The audit asks: at the fire brick of
 * each baseline trade, what's the streak length AND its alignment to the
 * trade direction?
 *
 * Buckets per fire (split by alignment):
 *   ALIGNED   — fire-brick color matches trade direction (long+bullish, short+bearish)
 *   ANTI      — fire-brick color opposes trade direction (long+bearish, short+bullish)
 *   NEUTRAL   — doji-style (close == open). Should be rare on WIN Renko.
 *
 * For each alignment, group by streak length:
 *   STREAK_1, STREAK_2, STREAK_3, STREAK_4, STREAK_5_plus
 *
 * Report: count, % of fires, wins/losses/BEs, win rate, net PnL, avg R per bucket.
 *
 * Decision criterion: a bucket needs ≥5pp win-rate lift over the
 * complementary buckets at the same alignment, n ≥ ~30, to be worth wiring
 * as a score-mode or block-mode quality gate.
 *
 * Usage:
 *   pnpm tsx scripts/indicator-isolation/group-h-color-streak.ts
 *   pnpm tsx scripts/indicator-isolation/group-h-color-streak.ts 2026-03-02 2026-06-13
 */
import "dotenv/config"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"
import { DuckDBInstance } from "@duckdb/node-api"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import type { CandleRow } from "@/types/candle"
import type { BacktestTrade, StrategyRecipe } from "@/types/backtest"

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

type Color = "bullish" | "bearish" | "neutral"
type Alignment = "ALIGNED" | "ANTI" | "NEUTRAL"
type StreakBucket =
	| "STREAK_1"
	| "STREAK_2"
	| "STREAK_3"
	| "STREAK_4"
	| "STREAK_5_plus"

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

const brickColor = (c: CandleRow): Color => {
	if (c.close > c.open) {
		return "bullish"
	}
	if (c.close < c.open) {
		return "bearish"
	}
	return "neutral"
}

const buildStreakAt = (
	candles: CandleRow[]
): Map<string, { color: Color; length: number }> => {
	const out = new Map<string, { color: Color; length: number }>()
	let prevColor: Color | null = null
	let run = 0
	for (const c of candles) {
		const col = brickColor(c)
		if (col === "neutral") {
			run = 0
			prevColor = null
			out.set(c.timestamp, { color: "neutral", length: 0 })
			continue
		}
		if (col === prevColor) {
			run += 1
		} else {
			run = 1
			prevColor = col
		}
		out.set(c.timestamp, { color: col, length: run })
	}
	return out
}

const bucketStreak = (n: number): StreakBucket => {
	if (n === 1) {
		return "STREAK_1"
	}
	if (n === 2) {
		return "STREAK_2"
	}
	if (n === 3) {
		return "STREAK_3"
	}
	if (n === 4) {
		return "STREAK_4"
	}
	return "STREAK_5_plus"
}

const alignmentOf = (
	direction: BacktestTrade["direction"],
	color: Color
): Alignment => {
	if (color === "neutral") {
		return "NEUTRAL"
	}
	if (direction === "long" && color === "bullish") {
		return "ALIGNED"
	}
	if (direction === "short" && color === "bearish") {
		return "ALIGNED"
	}
	return "ANTI"
}

const buildRecipe = (): StrategyRecipe => {
	if (hawksV0.entry.type !== "hawks_playbook") {
		throw new Error("hawksV0 entry type drift")
	}
	return {
		...hawksV0,
		entry: {
			type: "hawks_playbook",
			config: {
				...hawksV0.entry.config,
				qualityGates: {
					...(hawksV0.entry.config.qualityGates ?? {}),
					keltnerOuterBlock: false,
				},
			},
		},
	}
}

const formatBRL = (cents: number): string => {
	return `R$ ${(cents / 100).toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`
}

interface BucketStats {
	count: number
	netCents: number
	wins: number
	losses: number
	bes: number
	winRate: number
	avgR: number
}

const summarize = (trades: BacktestTrade[]): BucketStats => {
	let wins = 0
	let losses = 0
	let bes = 0
	let net = 0
	let rSum = 0
	let rN = 0
	for (const t of trades) {
		net += t.netPnlCents
		if (t.netPnlCents > 0) {
			wins++
		} else if (t.netPnlCents < 0) {
			losses++
		} else {
			bes++
		}
		if (typeof t.rMultiple === "number" && Number.isFinite(t.rMultiple)) {
			rSum += t.rMultiple
			rN++
		}
	}
	const decided = wins + losses
	return {
		count: trades.length,
		netCents: net,
		wins,
		losses,
		bes,
		winRate: decided > 0 ? (wins / decided) * 100 : 0,
		avgR: rN > 0 ? rSum / rN : 0,
	}
}

const main = async (): Promise<void> => {
	const argv = process.argv.slice(2)
	const fromDate = argv[0] ?? "2026-03-02"
	const toDate = argv[1] ?? "2026-06-13"

	console.log("Group H — Color-streak run-length audit")
	console.log(`Window: ${fromDate} → ${toDate}`)

	console.log("\nLoading candles…")
	const anchors = await loadAnchors(fromDate, toDate)
	const [candles, candles15m] = await Promise.all([
		fetchCandles(PARQUET_5M, fromDate, toDate, anchors),
		fetchCandles(PARQUET_15M, fromDate, toDate, anchors),
	])
	console.log(`  ${candles.length} 5m bricks, ${candles15m.length} 15m bricks`)

	console.log("\nRunning baseline (hawks v0)…")
	const recipe = buildRecipe()
	const result = runBacktest(candles, recipe, ASSET_CONFIG, candles15m)
	const baseline = summarize(result.trades)
	console.log(
		`  ${baseline.count} trades, net ${formatBRL(baseline.netCents)}, winRate ${baseline.winRate.toFixed(2)}%, avgR ${baseline.avgR.toFixed(3)}`
	)

	console.log("\nBuilding per-brick color-streak index…")
	const streakAt = buildStreakAt(candles)

	console.log("\n═══ Color-streak distribution at engine-fire bricks ═══\n")

	const groups: Record<Alignment, Map<StreakBucket, BacktestTrade[]>> = {
		ALIGNED: new Map(),
		ANTI: new Map(),
		NEUTRAL: new Map(),
	}

	for (const t of result.trades) {
		const ts = t.entryTime
		const streak = streakAt.get(ts)
		if (!streak) {
			continue
		}
		const align = alignmentOf(t.direction, streak.color)
		const bucket = bucketStreak(streak.length)
		const m = groups[align]
		const arr = m.get(bucket) ?? []
		arr.push(t)
		m.set(bucket, arr)
	}

	const allBuckets: StreakBucket[] = [
		"STREAK_1",
		"STREAK_2",
		"STREAK_3",
		"STREAK_4",
		"STREAK_5_plus",
	]

	for (const align of ["ALIGNED", "ANTI", "NEUTRAL"] as const) {
		const m = groups[align]
		const total = [...m.values()].reduce((a, arr) => a + arr.length, 0)
		if (total === 0) {
			console.log(`${align}: (empty)\n`)
			continue
		}
		console.log(
			`${align} — ${total} trades (${((total / baseline.count) * 100).toFixed(1)}% of fires)`
		)
		console.log(
			`  ${"bucket".padEnd(16)}  ${"n".padStart(5)}  ${"%".padStart(6)}  ${"W/L/BE".padStart(12)}  ${"winRate".padStart(8)}  ${"avgR".padStart(7)}  ${"netPnL".padStart(14)}`
		)
		for (const b of allBuckets) {
			const arr = m.get(b) ?? []
			if (arr.length === 0) {
				continue
			}
			const s = summarize(arr)
			const pct = (arr.length / total) * 100
			console.log(
				`  ${b.padEnd(16)}  ${String(s.count).padStart(5)}  ${pct.toFixed(1).padStart(5)}%  ${`${s.wins}/${s.losses}/${s.bes}`.padStart(12)}  ${s.winRate.toFixed(2).padStart(7)}%  ${s.avgR.toFixed(3).padStart(7)}  ${formatBRL(s.netCents).padStart(14)}`
			)
		}
		console.log()
	}

	console.log("Decision criterion:")
	console.log(
		"  A bucket is worth wiring if its win-rate is ≥5pp better than the complementary buckets at the same alignment, with n ≥ ~30."
	)
	console.log(
		"  Cross-alignment comparison (ALIGNED vs ANTI overall) is informative — if ANTI wins more, that's the 'fade the extension' setup ⇒ alignment is a counter-signal."
	)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
