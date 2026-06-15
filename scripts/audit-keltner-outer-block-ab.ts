/**
 * audit-keltner-outer-block-ab.ts — single-process A/B comparison of the v0.10
 * `qualityGates.keltnerOuterBlock` veto, OFF vs ON, over the catalog window.
 *
 * Per-variant reports:
 *   - net PnL (cents → reais)
 *   - trade count
 *   - win count, loss count, breakeven count
 *   - win rate
 *   - average R-multiple
 *   - profit factor (gross wins / gross losses)
 *
 * Cross-variant:
 *   - count of trades present in OFF but vetoed by ON (the "trades the veto
 *     removed")
 *   - count of trades present in ON but absent from OFF (should be 0 —
 *     the veto can ONLY suppress fires, not create them; sanity check)
 *   - per-vetoed-trade detail: timestamp, direction, exit reason, PnL, the KC
 *     veto class that triggered
 *   - net PnL of just the vetoed trades (= what the veto cost us, or
 *     equivalently what it saved us if negative)
 *
 * Reads candles from data/parquet/candles/hawk_5m_win/WIN.parquet and the
 * v0.10 hawksV0 preset for everything else.
 *
 * Usage:
 *   pnpm tsx scripts/audit-keltner-outer-block-ab.ts
 *   pnpm tsx scripts/audit-keltner-outer-block-ab.ts 2026-03-02 2026-06-13
 */
import "dotenv/config"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"
import { DuckDBInstance } from "@duckdb/node-api"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import { buildKeltnerWalker } from "@/lib/backtest/hawks-keltner-walker"
import type { CandleRow } from "@/types/candle"
import type {
	BacktestTrade,
	HawksTripleScreenConfig,
	StrategyRecipe,
} from "@/types/backtest"

const ASSET_CONFIG = { tickSize: 5, tickValueCents: 100 }
const WIN_ASSET_ID = "2d922fa1-365a-4f17-990f-27e5aa96b659"
const PARQUET_PATH = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_5m_win/WIN.parquet"
)

const BRT_OFFSET_MS = -3 * 60 * 60 * 1000

const brtDate = (iso: string): string =>
	new Date(new Date(iso).getTime() + BRT_OFFSET_MS).toISOString().slice(0, 10)
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

interface VariantStats {
	label: string
	trades: BacktestTrade[]
	netCents: number
	winCount: number
	lossCount: number
	beCount: number
	grossWinCents: number
	grossLossCents: number
	avgR: number
}

const computeStats = (label: string, trades: BacktestTrade[]): VariantStats => {
	let netCents = 0
	let winCount = 0
	let lossCount = 0
	let beCount = 0
	let grossWinCents = 0
	let grossLossCents = 0
	let rSum = 0
	let rN = 0
	for (const t of trades) {
		netCents += t.netPnlCents
		if (t.netPnlCents > 0) {
			winCount++
			grossWinCents += t.netPnlCents
		} else if (t.netPnlCents < 0) {
			lossCount++
			grossLossCents += -t.netPnlCents
		} else {
			beCount++
		}
		if (typeof t.rMultiple === "number" && Number.isFinite(t.rMultiple)) {
			rSum += t.rMultiple
			rN++
		}
	}
	return {
		label,
		trades,
		netCents,
		winCount,
		lossCount,
		beCount,
		grossWinCents,
		grossLossCents,
		avgR: rN > 0 ? rSum / rN : 0,
	}
}

const formatBRL = (cents: number): string => {
	const reais = cents / 100
	return `R$ ${reais.toLocaleString("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`
}

const buildRecipe = (keltnerOuterBlock: boolean): StrategyRecipe => {
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
					keltnerOuterBlock,
				},
			},
		},
	}
}

const main = async (): Promise<void> => {
	const argv = process.argv.slice(2)
	const fromDate = argv[0] ?? "2026-03-02"
	const toDate = argv[1] ?? "2026-06-13"

	console.log(`Keltner Outer Block — A/B audit`)
	console.log(`Window: ${fromDate} → ${toDate}`)

	console.log("\nLoading candles + anchors…")
	const candles = await fetchCandles(fromDate, toDate)
	console.log(`  ${candles.length} bricks loaded`)

	console.log("\nRunning baseline (keltnerOuterBlock = OFF)…")
	const offResult = runBacktest(candles, buildRecipe(false), ASSET_CONFIG)
	const offStats = computeStats("OFF", offResult.trades)
	console.log(
		`  ${offStats.trades.length} trades, net ${formatBRL(offStats.netCents)}`
	)

	console.log("\nRunning treatment (keltnerOuterBlock = ON)…")
	const onResult = runBacktest(candles, buildRecipe(true), ASSET_CONFIG)
	const onStats = computeStats("ON", onResult.trades)
	console.log(
		`  ${onStats.trades.length} trades, net ${formatBRL(onStats.netCents)}`
	)

	// Per-variant summary
	console.log("\n═══ Per-Variant Stats ═══")
	for (const v of [offStats, onStats]) {
		const tradeCount = v.trades.length
		const winRate =
			tradeCount > 0 ? ((v.winCount / tradeCount) * 100).toFixed(2) : "0.00"
		const pf =
			v.grossLossCents > 0
				? (v.grossWinCents / v.grossLossCents).toFixed(2)
				: v.grossWinCents > 0
					? "∞"
					: "—"
		console.log(`\n  [${v.label}]`)
		console.log(`    trades         ${tradeCount}`)
		console.log(
			`    win / loss / BE ${v.winCount} / ${v.lossCount} / ${v.beCount}`
		)
		console.log(`    win rate       ${winRate}%`)
		console.log(`    net PnL        ${formatBRL(v.netCents)}`)
		console.log(`    gross win      ${formatBRL(v.grossWinCents)}`)
		console.log(`    gross loss     ${formatBRL(v.grossLossCents)}`)
		console.log(`    profit factor  ${pf}`)
		console.log(`    avg R-multiple ${v.avgR.toFixed(3)}`)
	}

	// Cross-variant diff
	console.log("\n═══ Cross-Variant Diff ═══")
	const onTradeKeys = new Set(onStats.trades.map((t) => t.entryTime))
	const offOnly = offStats.trades.filter((t) => !onTradeKeys.has(t.entryTime))
	const offTradeKeys = new Set(offStats.trades.map((t) => t.entryTime))
	const onOnly = onStats.trades.filter((t) => !offTradeKeys.has(t.entryTime))

	console.log(`  trades in OFF but vetoed by ON  ${offOnly.length}`)
	console.log(
		`  trades in ON but absent from OFF ${onOnly.length}  (should be 0)`
	)

	const vetoedNet = offOnly.reduce((s, t) => s + t.netPnlCents, 0)
	console.log(`  net PnL of vetoed trades         ${formatBRL(vetoedNet)}`)
	if (offOnly.length > 0) {
		const winCount = offOnly.filter((t) => t.netPnlCents > 0).length
		const lossCount = offOnly.filter((t) => t.netPnlCents < 0).length
		console.log(
			`  vetoed-trade win/loss             ${winCount} / ${lossCount}  (rate ${((winCount / offOnly.length) * 100).toFixed(1)}%)`
		)
	}

	// Sanity check: on-only should be empty (veto can only suppress).
	if (onOnly.length > 0) {
		console.log(
			`\n  ⚠  ${onOnly.length} ON-only trades — possible engine non-determinism. Sample:`
		)
		for (const t of onOnly.slice(0, 5)) {
			console.log(
				`    ${t.entryTime}  ${t.direction}  ${formatBRL(t.netPnlCents)}`
			)
		}
	}

	// Vetoed trade detail — what KC class triggered each veto?
	if (offOnly.length > 0) {
		console.log("\n═══ Vetoed-Trade Detail (the trades the veto removed) ═══")
		// Rebuild the keltner walker so we can attach the KC class to each vetoed brick.
		const keltnerWalker = buildKeltnerWalker(
			candles,
			buildRecipe(true).entry.config as HawksTripleScreenConfig
		)
		console.log(
			"    timestamp                   dir    exitReason            pnl              KC class"
		)
		for (const t of offOnly) {
			const snap = keltnerWalker.get(t.entryTime)
			const cls = snap?.touchReject ?? "(no snap)"
			const day = brtDate(t.entryTime)
			console.log(
				`  ${day} ${t.entryTime.slice(11, 19)}  ${t.direction.padEnd(5)}  ${t.exitReason.padEnd(18)}  ${formatBRL(t.netPnlCents).padStart(12)}  ${cls}`
			)
		}
	}

	// Per-day net PnL delta — quick visual on where the veto reshapes results.
	const dayPnlOff = new Map<string, number>()
	const dayPnlOn = new Map<string, number>()
	for (const t of offStats.trades) {
		const d = brtDate(t.entryTime)
		dayPnlOff.set(d, (dayPnlOff.get(d) ?? 0) + t.netPnlCents)
	}
	for (const t of onStats.trades) {
		const d = brtDate(t.entryTime)
		dayPnlOn.set(d, (dayPnlOn.get(d) ?? 0) + t.netPnlCents)
	}
	const days = Array.from(
		new Set([...dayPnlOff.keys(), ...dayPnlOn.keys()])
	).sort()
	const deltasNonZero: Array<{ day: string; delta: number }> = []
	for (const d of days) {
		const delta = (dayPnlOn.get(d) ?? 0) - (dayPnlOff.get(d) ?? 0)
		if (delta !== 0) {
			deltasNonZero.push({ day: d, delta })
		}
	}
	console.log(
		`\n═══ Per-Day PnL Delta (ON − OFF, only days where the veto changed something) ═══`
	)
	console.log(
		`  ${deltasNonZero.length} of ${days.length} trading days affected`
	)
	for (const { day, delta } of deltasNonZero) {
		const sign = delta > 0 ? "+" : ""
		console.log(`    ${day}   ${sign}${formatBRL(delta)}`)
	}

	process.exit(0)
}

void main()
