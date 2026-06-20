/**
 * Indicator-isolation audit — Group F: Aggression (`agr_saldo`).
 *
 * Grades whether the dead `qualityGates.aggressionMode` flag (and its newer
 * nested `qualityGates.aggression.*` shape) has any empirical signal at the
 * engine's actual fire bricks. Per the standing user directive (2026-06-16):
 *   "remove the 'against', or in favor or we simply don't use"
 * → the audit only considers `original` polarity. `reversed` is excluded
 * from the wiring decision regardless of outcome.
 *
 * For each baseline trade (332 hawks v0 fires on the 2026-03-02 → 2026-06-13
 * catalog), classify the fire-brick's `agr_saldo` at thresholds
 * T ∈ {5K, 10K, 15K, 20K, 25K}:
 *
 *   ALIGNED  — SHORT with agr_saldo ≤ −T  OR  LONG with agr_saldo ≥ +T
 *              (under `original` polarity, this is the "favor" condition)
 *
 *   ANTI     — SHORT with agr_saldo ≥ +T  OR  LONG with agr_saldo ≤ −T
 *              (under `blockOnAnti` polarity, this is the "block" condition)
 *
 *   NEUTRAL  — |agr_saldo| < T
 *
 * Per bucket per threshold, report:
 *   - count, %  of all baseline trades
 *   - win rate, net PnL, avg R-multiple
 *
 * The "1.67× selectivity" folklore claim from `types/backtest.ts:257-264` is
 * tested directly: does ALIGNED at T=15K (original polarity) have a win-rate
 * ratio of ≥1.67× over NEUTRAL? If not, the claim is unreproducible.
 *
 * No engine modification — this is a pure post-hoc classifier on the OFF run.
 *
 * Usage:
 *   pnpm tsx scripts/indicator-isolation/group-f-aggression.ts
 *   pnpm tsx scripts/indicator-isolation/group-f-aggression.ts 2026-03-02 2026-06-13
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
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000

const THRESHOLDS = [5_000, 10_000, 15_000, 20_000, 25_000]

type Bucket = "ALIGNED" | "ANTI" | "NEUTRAL"

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
		for (const [k, v] of Object.entries(r.payload)) {
			if (typeof v === "number") {
				numeric[k] = v
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
	const conn = await instance.connect()
	const reader = await conn.runAndReadAll(
		`SELECT * FROM read_parquet('${PARQUET_PATH.replace(/'/g, "''")}')
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

const classifyBucket = (
	agrSaldo: number,
	direction: "long" | "short",
	threshold: number
): Bucket => {
	if (Math.abs(agrSaldo) < threshold) {
		return "NEUTRAL"
	}
	if (direction === "short") {
		return agrSaldo <= -threshold ? "ALIGNED" : "ANTI"
	}
	return agrSaldo >= threshold ? "ALIGNED" : "ANTI"
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

	console.log("Group F — Aggression audit")
	console.log(`Window: ${fromDate} → ${toDate}`)

	console.log("\nLoading candles + anchors…")
	const candles = await fetchCandles(fromDate, toDate)
	console.log(`  ${candles.length} bricks loaded`)

	console.log("\nRunning baseline (hawks v0, all aggression flags off)…")
	const recipe = buildRecipe()
	const result = runBacktest(candles, recipe, ASSET_CONFIG)
	const baseline = summarize(result.trades)
	console.log(
		`  ${baseline.count} trades, net ${formatBRL(baseline.netCents)}, winRate ${baseline.winRate.toFixed(2)}%, avgR ${baseline.avgR.toFixed(3)}`
	)

	const agrByTimestamp = new Map<string, number>()
	for (const c of candles) {
		const v = c.indicators.agr_saldo
		if (typeof v === "number") {
			agrByTimestamp.set(c.timestamp, v)
		}
	}

	console.log(
		"\n═══ Per-threshold bucket distribution at engine-fire bricks ═══"
	)

	for (const T of THRESHOLDS) {
		const bucketTrades: Record<Bucket, BacktestTrade[]> = {
			ALIGNED: [],
			ANTI: [],
			NEUTRAL: [],
		}
		let unknown = 0

		for (const t of result.trades) {
			const agr = agrByTimestamp.get(t.entryTime)
			if (agr === undefined) {
				unknown++
				continue
			}
			const bucket = classifyBucket(agr, t.direction, T)
			bucketTrades[bucket].push(t)
		}

		const aligned = summarize(bucketTrades.ALIGNED)
		const anti = summarize(bucketTrades.ANTI)
		const neutral = summarize(bucketTrades.NEUTRAL)
		const ratio = neutral.winRate > 0 ? aligned.winRate / neutral.winRate : NaN

		console.log(`\n  ── T = ${T.toLocaleString("en-US")} ──`)
		console.log(
			`    bucket    n    %       wins/losses/be    winRate    netPnL              avgR`
		)
		const rows: Array<[Bucket, BucketStats]> = [
			["ALIGNED", aligned],
			["ANTI", anti],
			["NEUTRAL", neutral],
		]
		for (const [b, s] of rows) {
			const pct =
				baseline.count > 0
					? ((s.count / baseline.count) * 100).toFixed(2)
					: "0.00"
			console.log(
				`    ${b.padEnd(8)}  ${String(s.count).padStart(3)}  ${pct.padStart(5)}%   ${String(s.wins).padStart(3)}/${String(s.losses).padStart(3)}/${String(s.bes).padStart(3)}        ${s.winRate.toFixed(2).padStart(6)}%   ${formatBRL(s.netCents).padStart(14)}     ${s.avgR.toFixed(3).padStart(7)}`
			)
		}
		if (unknown > 0) {
			console.log(`    (${unknown} trades with missing agr_saldo — dropped)`)
		}
		console.log(
			`    selectivity ratio (ALIGNED.winRate / NEUTRAL.winRate) = ${
				Number.isFinite(ratio) ? ratio.toFixed(3) : "n/a"
			}`
		)
	}

	// Folklore-claim verdict.
	const T_FOLKLORE = 15_000
	const aligned15: BacktestTrade[] = []
	const neutral15: BacktestTrade[] = []
	for (const t of result.trades) {
		const agr = agrByTimestamp.get(t.entryTime)
		if (agr === undefined) {
			continue
		}
		const b = classifyBucket(agr, t.direction, T_FOLKLORE)
		if (b === "ALIGNED") {
			aligned15.push(t)
		} else if (b === "NEUTRAL") {
			neutral15.push(t)
		}
	}
	const a = summarize(aligned15)
	const n = summarize(neutral15)
	const ratio15 = n.winRate > 0 ? a.winRate / n.winRate : NaN

	console.log("\n═══ Folklore claim verdict ═══")
	console.log(
		`  Comment in types/backtest.ts:257-264 claims "20 days, 1.67× selectivity at 15K reversed".`
	)
	console.log(
		`  This audit grades ORIGINAL polarity (reversed excluded per user directive 2026-06-16).`
	)
	console.log(
		`  T=15K ORIGINAL: ALIGNED winRate = ${a.winRate.toFixed(2)}% (n=${a.count}); NEUTRAL = ${n.winRate.toFixed(2)}% (n=${n.count})`
	)
	console.log(
		`  Selectivity ratio = ${Number.isFinite(ratio15) ? ratio15.toFixed(3) : "n/a"}`
	)
	if (Number.isFinite(ratio15)) {
		if (ratio15 >= 1.67) {
			console.log(
				`  → Folklore CONFIRMED at the 1.67× bar (under ORIGINAL polarity, n=${a.count}).`
			)
		} else if (ratio15 >= 1.2) {
			console.log(
				`  → Folklore PARTIAL: lift exists but below 1.67× threshold.`
			)
		} else if (ratio15 >= 0.95) {
			console.log(`  → Folklore NEUTRAL: no meaningful lift either direction.`)
		} else {
			console.log(
				`  → Folklore CONTRADICTED: ALIGNED winRate is WORSE than NEUTRAL.`
			)
		}
	}

	console.log("\nWiring decision input (after Ygor reviews):")
	console.log(
		"  1. If ratio ≥ ~1.3 with n ≥ ~30: wire `aggression.scoreMode = 'original'` default-off, follow up with A/B."
	)
	console.log(
		"  2. If ANTI bucket vetoes mostly losers: wire `aggression.blockMode = 'blockOnAnti'` default-off."
	)
	console.log(
		"  3. Else: delete the aggression config knobs entirely (option 3 in the audit doc)."
	)
	console.log(
		"\nSee docs/hawks-strategy/indicator-isolation/group-f-aggression.md."
	)

	process.exit(0)
}

void main()
