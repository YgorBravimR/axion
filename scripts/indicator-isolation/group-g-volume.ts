/**
 * Indicator-isolation audit — Group G: Volume (`volume_fin`).
 *
 * Grades whether the dead `qualityGates.volumeScore` flag (and its newer nested
 * `qualityGates.volume.*` shape) has any empirical signal at engine fire
 * bricks. Volume is direction-agnostic — no SHORT/LONG polarity question —
 * so the audit is simpler than Group F.
 *
 * For each baseline trade (332 hawks v0 fires on the 2026-03-02 → 2026-06-13
 * catalog), compute a running EMA of `volume_fin` over the full 5m candle
 * stream at EMA periods N ∈ {50, 100, 200, 500, 1000}. Then classify each
 * fire-brick:
 *
 *   ABOVE — volume_fin > ema(N) at fire brick
 *   BELOW — volume_fin <= ema(N) and volume_fin > 0
 *   ZERO  — volume_fin === 0
 *
 * Per bucket per N: count, %, wins/losses/BEs, win rate, net PnL, avg R.
 *
 * EMA seeding: first non-zero value (chosen for simplicity over "mean of first
 * N"). First N bricks are still included — the audit reports the count of
 * fires that fall within the warm-up window so reviewers can discount them.
 *
 * Decision criterion: ABOVE bucket needs ≥5pp win-rate lift over BELOW with
 * n ≥ ~30 to be worth wiring.
 *
 * Usage:
 *   pnpm tsx scripts/indicator-isolation/group-g-volume.ts
 *   pnpm tsx scripts/indicator-isolation/group-g-volume.ts 2026-03-02 2026-06-13
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

const EMA_PERIODS = [50, 100, 200, 500, 1000]

type Bucket = "ABOVE" | "BELOW" | "ZERO"

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

/**
 * Build a running EMA of volume_fin keyed by timestamp.
 * Seed: first non-zero value. Standard recurrence: ema[i] = α*v[i] + (1−α)*ema[i−1].
 * `warmUpUntil` index is the first index where i >= N (so caller can flag fires
 * that fell in warm-up).
 */
const buildVolumeEma = (
	candles: CandleRow[],
	period: number
): { ema: Map<string, number>; warmUpUntil: number } => {
	const map = new Map<string, number>()
	const alpha = 2 / (period + 1)
	let prev: number | null = null
	let seeded = false
	for (let i = 0; i < candles.length; i++) {
		const c = candles[i]!
		const v = c.indicators.volume_fin
		if (typeof v !== "number") {
			if (prev !== null) {
				map.set(c.timestamp, prev) // hold prior EMA on missing volume
			}
			continue
		}
		if (!seeded) {
			if (v > 0) {
				prev = v
				seeded = true
				map.set(c.timestamp, prev)
			}
			continue
		}
		prev = alpha * v + (1 - alpha) * (prev as number)
		map.set(c.timestamp, prev)
	}
	return { ema: map, warmUpUntil: period }
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

	console.log("Group G — Volume audit")
	console.log(`Window: ${fromDate} → ${toDate}`)

	console.log("\nLoading candles + anchors…")
	const candles = await fetchCandles(fromDate, toDate)
	console.log(`  ${candles.length} bricks loaded`)

	console.log("\nRunning baseline (hawks v0, KC outer block off)…")
	const recipe = buildRecipe()
	const result = runBacktest(candles, recipe, ASSET_CONFIG)
	const baseline = summarize(result.trades)
	console.log(
		`  ${baseline.count} trades, net ${formatBRL(baseline.netCents)}, winRate ${baseline.winRate.toFixed(2)}%, avgR ${baseline.avgR.toFixed(3)}`
	)

	// Map fire-brick timestamp → its volume_fin and candle index (for warm-up check).
	const volumeAt = new Map<string, number>()
	const candleIdxAt = new Map<string, number>()
	for (let i = 0; i < candles.length; i++) {
		const c = candles[i]!
		const v = c.indicators.volume_fin
		if (typeof v === "number") {
			volumeAt.set(c.timestamp, v)
		}
		candleIdxAt.set(c.timestamp, i)
	}

	console.log(
		"\n═══ Per-EMA-period bucket distribution at engine-fire bricks ═══"
	)

	for (const N of EMA_PERIODS) {
		const { ema, warmUpUntil } = buildVolumeEma(candles, N)

		const bucketTrades: Record<Bucket, BacktestTrade[]> = {
			ABOVE: [],
			BELOW: [],
			ZERO: [],
		}
		let unknown = 0
		let warmUpFires = 0

		for (const t of result.trades) {
			const v = volumeAt.get(t.entryTime)
			if (v === undefined) {
				unknown++
				continue
			}
			const idx = candleIdxAt.get(t.entryTime)
			if (idx !== undefined && idx < warmUpUntil) {
				warmUpFires++
			}
			if (v === 0) {
				bucketTrades.ZERO.push(t)
				continue
			}
			const e = ema.get(t.entryTime)
			if (e === undefined) {
				unknown++
				continue
			}
			if (v > e) {
				bucketTrades.ABOVE.push(t)
			} else {
				bucketTrades.BELOW.push(t)
			}
		}

		const above = summarize(bucketTrades.ABOVE)
		const below = summarize(bucketTrades.BELOW)
		const zero = summarize(bucketTrades.ZERO)
		const lift = above.winRate - below.winRate

		console.log(`\n  ── N = ${N} (EMA period) ──`)
		console.log(
			`    bucket    n    %       wins/losses/be    winRate    netPnL              avgR`
		)
		const rows: Array<[Bucket, BucketStats]> = [
			["ABOVE", above],
			["BELOW", below],
			["ZERO", zero],
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
		console.log(
			`    win-rate lift (ABOVE - BELOW) = ${lift >= 0 ? "+" : ""}${lift.toFixed(2)}pp`
		)
		if (warmUpFires > 0) {
			console.log(
				`    (${warmUpFires} of ${result.trades.length} fires fell in the first ${N} bricks of catalog — EMA warm-up; discount accordingly)`
			)
		}
		if (unknown > 0) {
			console.log(
				`    (${unknown} trades with missing volume_fin or EMA — dropped)`
			)
		}
	}

	// Block-mode simulation: vetoing every BELOW-EMA fire at the default N=500.
	console.log("\n═══ Block-mode simulation (veto BELOW-EMA fires) ═══")
	for (const N of [200, 500, 1000]) {
		const { ema } = buildVolumeEma(candles, N)
		const kept: BacktestTrade[] = []
		const vetoed: BacktestTrade[] = []
		for (const t of result.trades) {
			const v = volumeAt.get(t.entryTime)
			const e = ema.get(t.entryTime)
			if (v === undefined || e === undefined || v === 0 || v > e) {
				kept.push(t)
			} else {
				vetoed.push(t)
			}
		}
		const k = summarize(kept)
		const veto = summarize(vetoed)
		const delta = k.netCents - baseline.netCents
		console.log(
			`  N=${String(N).padStart(4)}: vetoed=${String(vetoed.length).padStart(3)} kept=${String(kept.length).padStart(3)} | kept net=${formatBRL(k.netCents).padStart(14)} (Δ ${(delta >= 0 ? "+" : "") + formatBRL(delta)}) | vetoed wins/losses/be ${veto.wins}/${veto.losses}/${veto.bes} (winRate ${veto.winRate.toFixed(2)}%)`
		)
	}

	console.log("\nWiring decision input (after Ygor reviews):")
	console.log(
		"  1. If any ABOVE/BELOW lift ≥ 5pp with n ≥ 30: wire score-mode default-off."
	)
	console.log(
		"  2. If block-mode simulation shows BELOW-vetoed bucket is mostly losers AND PnL delta is positive ≥ R$ 200 at any N: wire block-mode default-off."
	)
	console.log(
		"  3. Else: delete the volume config knobs entirely (option 3 in the audit doc)."
	)
	console.log(
		"\nSee docs/hawks-strategy/indicator-isolation/group-g-volume.md."
	)

	process.exit(0)
}

void main()
