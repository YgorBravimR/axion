/**
 * audit-keltner-outer-block-window-sweep.ts — extends the 1-brick A/B audit to
 * test wider lookback windows for the `keltnerOuterBlock` veto.
 *
 * Why this exists: the 1-brick window produced 0 vetoes across 8,280 5m bricks
 * (see `docs/scans/2026-06-15-keltner-outer-block-ab.md`). Before we
 * remove the wiring as dead-in-practice, this script tests wider lookback
 * windows by post-processing the OFF-baseline trades:
 *
 *   "Veto the trade if ANY of the last N walker classes (current brick + N-1
 *   prior bricks) is a confirmed outer-band reject against the trade direction."
 *
 * Tests N ∈ {1, 3, 5, 10}. For each N, reports:
 *   - vetoed-trade count
 *   - net PnL of the vetoed subset (the "what we'd save by widening to N")
 *   - residual stats (what's left after vetoing)
 *
 * This is a post-hoc simulation — we do NOT re-run the engine per N. The
 * baseline is the OFF run; vetoes only suppress fires, never create new ones,
 * so post-filtering is sufficient and faster.
 *
 * Usage:
 *   pnpm tsx scripts/audit-keltner-outer-block-window-sweep.ts
 *   pnpm tsx scripts/audit-keltner-outer-block-window-sweep.ts 2026-03-02 2026-06-13
 */
import "dotenv/config"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"
import { DuckDBInstance } from "@duckdb/node-api"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import {
	buildKeltnerWalker,
	type KeltnerTouchRejectClass,
} from "@/lib/backtest/hawks-keltner-walker"
import type { CandleRow } from "@/types/candle"
import type {
	BacktestTrade,
	HawksTripleScreenConfig,
	StrategyRecipe,
	Direction,
} from "@/types/backtest"

const ASSET_CONFIG = { tickSize: 5, tickValueCents: 100 }
const WIN_ASSET_ID = "2d922fa1-365a-4f17-990f-27e5aa96b659"
const PARQUET_PATH = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_5m_win/WIN.parquet"
)

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000
const candleTimestampToBrtDate = (ts: Date): string =>
	new Date(ts.getTime() + BRT_OFFSET_MS).toISOString().slice(0, 10)

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
	const n = Number(v)
	return Number.isNaN(n) ? NaN : n
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

const fetchAnchors = async (
	sql: ReturnType<typeof postgres>,
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
	fromDate: string,
	toDate: string
): Promise<CandleRow[]> => {
	if (!existsSync(PARQUET_PATH)) {
		throw new Error(`missing parquet at ${PARQUET_PATH}`)
	}
	const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
	const anchorsByDate = await fetchAnchors(sql, fromDate, toDate)
	await sql.end()

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
	return rows.map((row) => {
		const indicators: Record<string, number> = {}
		for (const [key, v] of Object.entries(row)) {
			if (BASE_COL_SET.has(key)) {
				continue
			}
			if (v === null || v === undefined) {
				continue
			}
			const n = toNumber(v)
			if (!Number.isNaN(n)) {
				indicators[key] = n
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
		const ci = row.candle_index
		return {
			timestamp: ts,
			open: toNumber(row.open),
			high: toNumber(row.high),
			low: toNumber(row.low),
			close: toNumber(row.close),
			candleIndex: ci === null || ci === undefined ? null : Number(ci),
			indicators,
		} satisfies CandleRow
	})
}

const formatBRL = (cents: number): string => {
	const reais = cents / 100
	return `R$ ${reais.toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`
}

const isOuterRejectAgainst = (
	cls: KeltnerTouchRejectClass,
	direction: Direction
): boolean => {
	if (direction === "short") {
		return (
			cls === "REJECT_KC2_INF_SAME_BRICK" || cls === "REJECT_KC2_INF_NEXT_BRICK"
		)
	}
	return (
		cls === "REJECT_KC2_SUP_SAME_BRICK" || cls === "REJECT_KC2_SUP_NEXT_BRICK"
	)
}

/**
 * For each baseline trade, check whether any of the last `lookback` walker
 * snapshots (current fire brick + N-1 prior bricks of the same day) is a
 * confirmed outer-band reject against the trade direction. Trades that match
 * the veto are removed from the residual set.
 */
const applyLookbackVeto = (
	baselineTrades: BacktestTrade[],
	candles: CandleRow[],
	walker: Map<string, { touchReject: KeltnerTouchRejectClass }>,
	lookback: number
): { kept: BacktestTrade[]; vetoed: BacktestTrade[] } => {
	// Build a day-key → sorted candle array map so the lookback walks back IN-DAY
	// only (matches the engine's day-reset semantics for priorBricksToday).
	const byDay = new Map<string, CandleRow[]>()
	for (const c of candles) {
		const day = candleTimestampToBrtDate(new Date(c.timestamp))
		const arr = byDay.get(day) ?? []
		arr.push(c)
		byDay.set(day, arr)
	}

	const kept: BacktestTrade[] = []
	const vetoed: BacktestTrade[] = []
	for (const trade of baselineTrades) {
		const day = candleTimestampToBrtDate(new Date(trade.entryTime))
		const dayCandles = byDay.get(day) ?? []
		const fireIdx = dayCandles.findIndex((c) => c.timestamp === trade.entryTime)
		if (fireIdx < 0) {
			kept.push(trade)
			continue
		}
		const start = Math.max(0, fireIdx - (lookback - 1))
		let vetoedHere = false
		for (let i = start; i <= fireIdx; i++) {
			const snap = walker.get(dayCandles[i]!.timestamp)
			if (snap && isOuterRejectAgainst(snap.touchReject, trade.direction)) {
				vetoedHere = true
				break
			}
		}
		if (vetoedHere) {
			vetoed.push(trade)
		} else {
			kept.push(trade)
		}
	}
	return { kept, vetoed }
}

const summarize = (
	trades: BacktestTrade[]
): {
	count: number
	netCents: number
	winRate: number
	avgR: number
} => {
	let net = 0
	let wins = 0
	let losses = 0
	let rSum = 0
	let rN = 0
	for (const t of trades) {
		net += t.netPnlCents
		if (t.netPnlCents > 0) {
			wins++
		} else if (t.netPnlCents < 0) {
			losses++
		}
		if (typeof t.rMultiple === "number" && Number.isFinite(t.rMultiple)) {
			rSum += t.rMultiple
			rN++
		}
	}
	const trades2 = wins + losses
	return {
		count: trades.length,
		netCents: net,
		winRate: trades2 > 0 ? (wins / trades.length) * 100 : 0,
		avgR: rN > 0 ? rSum / rN : 0,
	}
}

const buildRecipe = (): StrategyRecipe => {
	if (hawksV0.entry.type !== "hawks_playbook") {
		throw new Error("hawksV0 entry type drift — expected hawks_playbook")
	}
	const baseConfig: HawksTripleScreenConfig = hawksV0.entry.config
	return {
		...hawksV0,
		entry: {
			type: "hawks_playbook",
			config: {
				...baseConfig,
				qualityGates: {
					...(baseConfig.qualityGates ?? {}),
					keltnerOuterBlock: false,
				},
			},
		},
	}
}

const main = async (): Promise<void> => {
	const argv = process.argv.slice(2)
	const fromDate = argv[0] ?? "2026-03-02"
	const toDate = argv[1] ?? "2026-06-13"

	console.log(`Keltner Outer Block — window-sweep audit`)
	console.log(`Window: ${fromDate} → ${toDate}`)

	console.log("\nLoading candles + anchors…")
	const candles = await fetchCandles(fromDate, toDate)
	console.log(`  ${candles.length} bricks loaded`)

	console.log(
		"\nRunning baseline (keltnerOuterBlock OFF, same as v0.10 default)…"
	)
	const recipe = buildRecipe()
	const baselineResult = runBacktest(candles, recipe, ASSET_CONFIG)
	const baselineStats = summarize(baselineResult.trades)
	console.log(
		`  ${baselineStats.count} trades, net ${formatBRL(baselineStats.netCents)}, winRate ${baselineStats.winRate.toFixed(2)}%, avgR ${baselineStats.avgR.toFixed(3)}`
	)

	console.log("\nBuilding Keltner walker once…")
	const config = recipe.entry.config as HawksTripleScreenConfig
	const walker = buildKeltnerWalker(candles, config)
	console.log(`  ${walker.size} snapshots`)

	const lookbacks = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20]
	console.log("\n═══ Lookback sweep ═══")
	console.log(
		"  N    vetoed    kept   net (kept)        Δ vs baseline      vetoed net    vetoed wins/losses"
	)
	for (const N of lookbacks) {
		const { kept, vetoed } = applyLookbackVeto(
			baselineResult.trades,
			candles,
			walker,
			N
		)
		const keptStats = summarize(kept)
		const vetoedStats = summarize(vetoed)
		const delta = keptStats.netCents - baselineStats.netCents
		const vetoedWins = vetoed.filter((t) => t.netPnlCents > 0).length
		const vetoedLosses = vetoed.filter((t) => t.netPnlCents < 0).length
		console.log(
			`  ${String(N).padStart(2)}    ${String(vetoed.length).padStart(6)}    ${String(kept.length).padStart(4)}   ${formatBRL(keptStats.netCents).padStart(14)}   ${(delta >= 0 ? "+" : "") + formatBRL(delta).padStart(13)}   ${formatBRL(vetoedStats.netCents).padStart(11)}    ${String(vetoedWins).padStart(3)} / ${String(vetoedLosses).padStart(3)}`
		)
	}

	// For the largest tested window: dump every vetoed trade so we can eyeball
	// "would I, the trader, have skipped this one?" days.
	const maxN = lookbacks[lookbacks.length - 1]!
	const { vetoed: maxVetoed } = applyLookbackVeto(
		baselineResult.trades,
		candles,
		walker,
		maxN
	)
	if (maxVetoed.length > 0) {
		console.log(
			`\n═══ All ${maxVetoed.length} trades vetoed by N=${maxN} window ═══`
		)
		console.log(
			"  timestamp                   dir    exit                 pnl              days-since-outer-reject"
		)
		for (const t of maxVetoed) {
			const day = candleTimestampToBrtDate(new Date(t.entryTime))
			const byDay = new Map<string, CandleRow[]>()
			for (const c of candles) {
				const d = candleTimestampToBrtDate(new Date(c.timestamp))
				const arr = byDay.get(d) ?? []
				arr.push(c)
				byDay.set(d, arr)
			}
			const dayCandles = byDay.get(day) ?? []
			const fireIdx = dayCandles.findIndex((c) => c.timestamp === t.entryTime)
			let bricksSince = -1
			for (let i = fireIdx; i >= Math.max(0, fireIdx - (maxN - 1)); i--) {
				const snap = walker.get(dayCandles[i]!.timestamp)
				if (snap && isOuterRejectAgainst(snap.touchReject, t.direction)) {
					bricksSince = fireIdx - i
					break
				}
			}
			console.log(
				`  ${day} ${t.entryTime.slice(11, 19)}  ${t.direction.padEnd(5)}  ${t.exitReason.padEnd(18)}  ${formatBRL(t.netPnlCents).padStart(12)}    ${bricksSince === 0 ? "same brick" : `${bricksSince} bricks ago`}`
			)
		}
	}

	process.exit(0)
}

void main()
