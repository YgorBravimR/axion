/**
 * Smoke test for the v0.11 composable veto evaluator + booster checklist
 * wiring. Runs the hawks v0 engine 6 times against the catalog, each time
 * flipping ONE veto on top of baseline-OFF and reports the trade delta.
 *
 * Purpose: prove every wired gate actually changes the trade stream when
 * toggled — i.e. each "knob" works. No optimization, no claim of "better."
 * Just "the knobs do something."
 *
 * Usage:
 *   pnpm tsx scripts/audit-all-vetoes-smoke.ts
 *   pnpm tsx scripts/audit-all-vetoes-smoke.ts 2026-03-02 2026-06-13
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
const PARQUET_PATH = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_5m_win/WIN.parquet"
)
const PARQUET_PATH_15M = resolve(
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

const candleTimestampToBrtDate = (ts: Date): string => {
	const brt = new Date(ts.getTime() + BRT_OFFSET_MS)
	return brt.toISOString().slice(0, 10)
}

const fetchCandlesAt = async (
	parquetPath: string,
	fromDate: string,
	toDate: string,
	anchorsByDate: Map<string, Record<string, number>>
): Promise<CandleRow[]> => {
	if (!existsSync(parquetPath)) {
		throw new Error(`missing parquet at ${parquetPath}`)
	}
	const fromUtc = new Date(`${fromDate}T03:00:00.000Z`)
	const toUtc = new Date(`${toDate}T03:00:00.000Z`)
	const instance = await DuckDBInstance.create(":memory:")
	const conn = await instance.connect()
	const reader = await conn.runAndReadAll(
		`SELECT * FROM read_parquet('${parquetPath.replace(/'/g, "''")}')
		 WHERE timestamp >= TIMESTAMP '${fromUtc.toISOString()}'
		   AND timestamp <= TIMESTAMP '${toUtc.toISOString()}'
		 ORDER BY timestamp ASC`
	)
	const rows = reader.getRowObjects()
	const BASE = new Set([
		"timestamp",
		"open",
		"high",
		"low",
		"close",
		"candle_index",
	])
	return rows.map((row) => {
		const indicators: Record<string, number> = {}
		for (const [k, v] of Object.entries(row)) {
			if (BASE.has(k) || v === null || v === undefined) {
				continue
			}
			const n = toNumber(v)
			if (!Number.isNaN(n)) {
				indicators[k] = n
			}
		}
		const ts = toIsoString(row.timestamp)
		const dateKey = candleTimestampToBrtDate(new Date(ts))
		const anchor = anchorsByDate.get(dateKey)
		if (anchor) {
			for (const [k, v] of Object.entries(anchor)) {
				if (indicators[k] === undefined) {
					indicators[k] = v
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

const loadAnchors = async (
	fromDate: string,
	toDate: string
): Promise<Map<string, Record<string, number>>> => {
	const sql = postgres(process.env.DATABASE_URL!, { max: 1 })
	const anchorRows = (await sql`
		SELECT date::text AS date, payload
		FROM asset_session_anchors
		WHERE asset_id = ${WIN_ASSET_ID}
		  AND date BETWEEN ${fromDate} AND ${toDate}
	`) as { date: string; payload: Record<string, unknown> | null }[]
	await sql.end()
	const anchors = new Map<string, Record<string, number>>()
	for (const r of anchorRows) {
		if (!r.payload || typeof r.payload !== "object") {
			continue
		}
		const numeric: Record<string, number> = {}
		for (const [k, v] of Object.entries(r.payload)) {
			if (typeof v === "number") {
				numeric[k] = v
			}
		}
		anchors.set(r.date, numeric)
	}
	return anchors
}

const formatBRL = (cents: number): string => {
	return `R$ ${(cents / 100).toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`
}

interface RunStats {
	count: number
	netCents: number
	wins: number
	losses: number
	bes: number
}

const summarize = (trades: BacktestTrade[]): RunStats => {
	let wins = 0
	let losses = 0
	let bes = 0
	let net = 0
	for (const t of trades) {
		net += t.netPnlCents
		if (t.netPnlCents > 0) {
			wins++
		} else if (t.netPnlCents < 0) {
			losses++
		} else {
			bes++
		}
	}
	return { count: trades.length, netCents: net, wins, losses, bes }
}

const buildRecipe = (
	gates: Partial<NonNullable<typeof hawksV0.entry.config.qualityGates>>
): StrategyRecipe => {
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
					srLevelBlock: false,
					vwapWickRejectBlock: false,
					aggression: { blockMode: "off", threshold: 15000 },
					volume: { mode: "off" },
					...gates,
				},
			},
		},
	}
}

const tierBucket = (trades: BacktestTrade[]): Record<string, number> => {
	const out: Record<string, number> = {
		"AAA": 0,
		"AA": 0,
		"A": 0,
		"B": 0,
		"?": 0,
	}
	for (const t of trades) {
		const tier = t.quality?.tier ?? "?"
		out[tier] = (out[tier] ?? 0) + 1
	}
	return out
}

const main = async (): Promise<void> => {
	const argv = process.argv.slice(2)
	const fromDate = argv[0] ?? "2026-03-02"
	const toDate = argv[1] ?? "2026-06-13"

	console.log("All-vetoes smoke test (v0.11)")
	console.log(`Window: ${fromDate} → ${toDate}`)

	console.log("\nLoading candles…")
	const anchorsByDate = await loadAnchors(fromDate, toDate)
	const [candles, candles15m] = await Promise.all([
		fetchCandlesAt(PARQUET_PATH, fromDate, toDate, anchorsByDate),
		fetchCandlesAt(PARQUET_PATH_15M, fromDate, toDate, anchorsByDate),
	])
	console.log(
		`  ${candles.length} bricks (5m) / ${candles15m.length} bricks (15m)`
	)

	const configs: Array<{
		name: string
		gates: Parameters<typeof buildRecipe>[0]
	}> = [
		{ name: "BASELINE (all off)", gates: {} },
		{ name: "keltnerOuterBlock = true", gates: { keltnerOuterBlock: true } },
		{ name: "srLevelBlock = true", gates: { srLevelBlock: true } },
		{
			name: "vwapWickRejectBlock = true",
			gates: { vwapWickRejectBlock: true },
		},
		{
			name: "aggression.blockMode = blockOnAnti",
			gates: {
				aggression: { blockMode: "blockOnAnti", threshold: 15000 },
			},
		},
		{
			name: "volume.mode = block",
			gates: { volume: { mode: "block", emaPeriod: 500 } },
		},
		{
			name: "ALL ON (5-veto composition)",
			gates: {
				keltnerOuterBlock: true,
				srLevelBlock: true,
				vwapWickRejectBlock: true,
				aggression: { blockMode: "blockOnAnti", threshold: 15000 },
				volume: { mode: "block", emaPeriod: 500 },
			},
		},
	]

	console.log("\n═══ Per-gate trade-stream impact ═══")
	console.log(
		`${"Config".padEnd(40)}  ${"trades".padStart(7)}  ${"net".padStart(14)}  ${"W/L/BE".padStart(12)}  tier (AAA/AA/A/B)`
	)

	let baselineCount = 0
	let baselineNet = 0
	for (const { name, gates } of configs) {
		const recipe = buildRecipe(gates)
		const result = runBacktest(candles, recipe, ASSET_CONFIG, candles15m)
		const s = summarize(result.trades)
		const tb = tierBucket(result.trades)
		if (name.startsWith("BASELINE")) {
			baselineCount = s.count
			baselineNet = s.netCents
		}
		const deltaTrades = s.count - baselineCount
		const deltaNet = s.netCents - baselineNet
		const tradesStr = `${s.count}${
			name.startsWith("BASELINE")
				? ""
				: ` (${deltaTrades >= 0 ? "+" : ""}${deltaTrades})`
		}`
		const netStr = `${formatBRL(s.netCents)}${
			name.startsWith("BASELINE")
				? ""
				: ` (${deltaNet >= 0 ? "+" : ""}${formatBRL(deltaNet)})`
		}`
		console.log(
			`${name.padEnd(40)}  ${tradesStr.padStart(7)}  ${netStr.padStart(14)}  ${`${s.wins}/${s.losses}/${s.bes}`.padStart(12)}  ${tb.AAA}/${tb.AA}/${tb.A}/${tb.B}`
		)
	}

	console.log("\nExpected behaviour:")
	console.log(
		"  - Every veto with the flag flipped on should produce ≤ baseline trade count."
	)
	console.log(
		"  - The 5-veto composition row should be ≤ every single-gate row."
	)
	console.log(
		"  - The booster-tier breakdown should show AAA/AA/A/B distribution (not 100% B as before v0.11)."
	)
	console.log(
		"  - This script is a wiring smoke test, NOT an optimization audit."
	)

	process.exit(0)
}

void main()
