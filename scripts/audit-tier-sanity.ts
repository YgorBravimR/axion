/**
 * Tier sanity audit — does AAA predict outcomes materially better than AA?
 *
 * Background: as of 2026-06-16, the 5th booster (`htfPivotAligned`) is live
 * after the 15m candle plumbing landed. Baseline tier distribution is now
 * 55/118/68/91 (AAA/AA/A/B) on 332 trades. The booster checklist's tier
 * mapping (5 boosters → AAA, 3-4 → AA, 2 → A, 0-1 → B) is the methodology's
 * proposal. This audit asks whether the tier ordering is empirically
 * defensible at engine v0.11.
 *
 * Reports per-tier: count, WR, avgR, net PnL. A "well-ordered" tier system
 * should show AAA > AA > A > B on at least WR and ideally on avgR too.
 *
 * Usage:
 *   pnpm tsx scripts/audit-tier-sanity.ts
 *   pnpm tsx scripts/audit-tier-sanity.ts 2026-03-02 2026-06-13
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

const formatBRL = (cents: number): string => {
	return `R$ ${(cents / 100).toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`
}

const buildRecipe = (): StrategyRecipe => {
	if (hawksV0.entry.type !== "hawks_playbook") {
		throw new Error("drift")
	}
	return hawksV0
}

interface TierStats {
	tier: string
	n: number
	wins: number
	losses: number
	bes: number
	winRate: number
	avgR: number
	netCents: number
	avgNetCentsPerTrade: number
}

const main = async () => {
	const argv = process.argv.slice(2)
	const fromDate = argv[0] ?? "2026-03-02"
	const toDate = argv[1] ?? "2026-06-13"

	console.log("Tier sanity audit — does AAA predict outcomes vs AA / A / B?")
	console.log(`Window: ${fromDate} → ${toDate}`)

	const anchors = await loadAnchors(fromDate, toDate)
	const [c5, c15] = await Promise.all([
		fetchCandles(PARQUET_5M, fromDate, toDate, anchors),
		fetchCandles(PARQUET_15M, fromDate, toDate, anchors),
	])
	console.log(`\n5m=${c5.length} 15m=${c15.length}`)

	const result = runBacktest(c5, buildRecipe(), ASSET_CONFIG, c15)
	const trades = result.trades

	const byTier = new Map<string, BacktestTrade[]>()
	for (const t of trades) {
		const tier = t.quality?.tier ?? "?"
		const arr = byTier.get(tier) ?? []
		arr.push(t)
		byTier.set(tier, arr)
	}

	const tierOrder = ["AAA", "AA", "A", "B"]
	const rows: TierStats[] = []
	for (const tier of tierOrder) {
		const arr = byTier.get(tier) ?? []
		let wins = 0
		let losses = 0
		let bes = 0
		let net = 0
		let rSum = 0
		let rN = 0
		for (const t of arr) {
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
		rows.push({
			tier,
			n: arr.length,
			wins,
			losses,
			bes,
			winRate: decided > 0 ? (wins / decided) * 100 : 0,
			avgR: rN > 0 ? rSum / rN : 0,
			netCents: net,
			avgNetCentsPerTrade: arr.length > 0 ? net / arr.length : 0,
		})
	}

	console.log("\n═══ Per-tier outcomes ═══\n")
	console.log(
		`${"tier".padEnd(5)}  ${"n".padStart(5)}  ${"%".padStart(6)}  ${"W/L/BE".padStart(14)}  ${"WR".padStart(8)}  ${"avgR".padStart(8)}  ${"netPnL".padStart(14)}  ${"avg/trade".padStart(11)}`
	)
	for (const r of rows) {
		const pct = trades.length > 0 ? (r.n / trades.length) * 100 : 0
		console.log(
			`${r.tier.padEnd(5)}  ${String(r.n).padStart(5)}  ${pct.toFixed(1).padStart(5)}%  ${`${r.wins}/${r.losses}/${r.bes}`.padStart(14)}  ${r.winRate.toFixed(2).padStart(7)}%  ${r.avgR.toFixed(3).padStart(8)}  ${formatBRL(r.netCents).padStart(14)}  ${formatBRL(r.avgNetCentsPerTrade).padStart(11)}`
		)
	}

	console.log("\n═══ Ordering check ═══\n")
	const wrSequence = rows.map((r) => r.winRate)
	const avgRSequence = rows.map((r) => r.avgR)
	const avgPerTradeSequence = rows.map((r) => r.avgNetCentsPerTrade)

	const isMonotonicDescending = (xs: number[]): boolean => {
		for (let i = 1; i < xs.length; i++) {
			if (xs[i]! > xs[i - 1]!) {
				return false
			}
		}
		return true
	}
	console.log(
		`  WR ordered AAA→B? ${isMonotonicDescending(wrSequence) ? "YES ✓" : "NO  ✗"}  values=[${wrSequence.map((x) => x.toFixed(1)).join(", ")}]`
	)
	console.log(
		`  avgR ordered AAA→B? ${isMonotonicDescending(avgRSequence) ? "YES ✓" : "NO  ✗"}  values=[${avgRSequence.map((x) => x.toFixed(3)).join(", ")}]`
	)
	console.log(
		`  avgPnL/trade ordered AAA→B? ${isMonotonicDescending(avgPerTradeSequence) ? "YES ✓" : "NO  ✗"}  values=[${avgPerTradeSequence.map((x) => (x / 100).toFixed(2)).join(", ")}]`
	)

	console.log("\nInterpretation:")
	console.log(
		"  - If WR/avgR is monotonic AAA→B, the booster checklist correctly orders trades by quality."
	)
	console.log(
		"  - If it's NOT monotonic, either: (a) some booster is noise / mis-signed,"
	)
	console.log(
		"    (b) the tier thresholds (5→AAA, 3-4→AA, 2→A, 0-1→B) are mis-bucketed,"
	)
	console.log(
		"    or (c) sample size at the tail tiers is too small for the comparison to be reliable."
	)
}

main().catch((e) => {
	console.error(e)
	process.exit(1)
})
