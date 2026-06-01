/**
 * probe-volume-vs-ema.ts
 *
 * Classify each catalog fire + autonomous EXTRA by whether the entry brick's
 * volume exceeds a running EMA of brick volume.
 *
 * Volume EMA is computed chronologically across all bricks in the fetched
 * range (no day reset). For stability we fetch a wider history than the
 * catalog window so the EMA has converged before the first fire.
 *
 * Zones:
 *   ABOVE_EMA  — volume > volumeEma   (high-attention brick)
 *   AT_OR_BELOW — volume ≤ volumeEma   (ordinary brick)
 *   NULL       — volume missing
 *
 * Decision logic:
 *   FAVOR candidate = ABOVE_EMA (catalog should hit it MORE if predictive)
 *
 * Usage:
 *   pnpm tsx scripts/probe-volume-vs-ema.ts
 *   pnpm tsx scripts/probe-volume-vs-ema.ts --ema-period 200
 *   pnpm tsx scripts/probe-volume-vs-ema.ts --ema-period 1000 --verbose
 */
import "dotenv/config"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import type { CandleRow } from "@/types/candle"
import type { UserEntry, BacktestTrade } from "@/types/backtest"

const ENTRIES_DIR = resolve(process.cwd(), "data/hawks/user-entries")
const ASSET_SYMBOL = "WIN"
const ASSET_CONFIG = { tickSize: 5, tickValueCents: 100 }
const WARMUP_DAYS = 30 // history before first catalog day for EMA convergence

type Zone = "ABOVE_EMA" | "AT_OR_BELOW" | "NULL"

interface CatalogEntry extends UserEntry {
	closingBrickPrice?: number | null
}

const loadCatalog = (): CatalogEntry[] => {
	const files = readdirSync(ENTRIES_DIR)
		.filter((f) => f.endsWith(".json"))
		.sort()
	const all: CatalogEntry[] = []
	for (const f of files) {
		const entries = JSON.parse(
			readFileSync(resolve(ENTRIES_DIR, f), "utf-8")
		) as CatalogEntry[]
		all.push(...entries)
	}
	return all
}

const fetchCandles = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	fromDate: string,
	toDate: string
): Promise<CandleRow[]> => {
	const fromUtc = new Date(`${fromDate}T03:00:00.000Z`)
	const toUtc = new Date(`${toDate}T03:00:00.000Z`)
	const rows = (await sql`
		SELECT pc.timestamp, pc.open, pc.high, pc.low, pc.close,
		       pc.candle_index, pc.indicators
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = ${ASSET_SYMBOL} AND t.code = '5m'
		  AND pc.timestamp >= ${fromUtc.toISOString()}
		  AND pc.timestamp <  ${toUtc.toISOString()}
		ORDER BY pc.timestamp, pc.candle_index NULLS LAST
	`) as {
		timestamp: string
		open: number
		high: number
		low: number
		close: number
		candle_index: number | null
		indicators: Record<string, unknown>
	}[]
	return rows.map((r) => ({
		timestamp: r.timestamp,
		open: Number(r.open),
		high: Number(r.high),
		low: Number(r.low),
		close: Number(r.close),
		candleIndex: r.candle_index ?? 0,
		indicators: r.indicators as Record<string, number>,
	}))
}

const brtDate = (iso: string): string =>
	new Date(new Date(iso).getTime() - 3 * 3600 * 1000).toISOString().slice(0, 10)

interface FireRow {
	source: "CATALOG" | "EXTRA"
	day: string
	label: string
	direction: "short" | "long"
	volume: number | null
	emaAtFire: number | null
	zone: Zone
}

const run = async () => {
	const argv = process.argv.slice(2)
	const verbose = argv.includes("--verbose")
	const pIdx = argv.findIndex((a) => a === "--ema-period")
	const emaPeriod =
		pIdx >= 0 && argv[pIdx + 1] ? parseInt(argv[pIdx + 1]!, 10) : 500
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error("DATABASE_URL missing")
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)
	console.log(`[probe] EMA period = ${emaPeriod}, warmup = ${WARMUP_DAYS} days`)

	const catalog = loadCatalog()
	const days = [...new Set(catalog.map((c) => c.date))].sort()
	const minDay = days[0]!
	const maxDay = days[days.length - 1]!
	const warmupStart = new Date(
		new Date(`${minDay}T03:00:00Z`).getTime() - WARMUP_DAYS * 24 * 3600 * 1000
	)
		.toISOString()
		.slice(0, 10)
	const nextDay = new Date(
		new Date(`${maxDay}T03:00:00Z`).getTime() + 24 * 3600 * 1000
	)
		.toISOString()
		.slice(0, 10)

	const candles = await fetchCandles(sql, warmupStart, nextDay)
	console.log(
		`[probe] fetched ${candles.length} bricks (${warmupStart} → ${nextDay})`
	)

	// Compute volume EMA walking through every brick chronologically.
	// emaAt[i] = EMA value AS OF brick i (before that brick's volume is folded in,
	// so the fire's own volume is compared against pre-fire EMA).
	const alpha = 2 / (emaPeriod + 1)
	const emaBefore: number[] = new Array<number>(candles.length).fill(0)
	let ema: number | null = null
	for (let i = 0; i < candles.length; i++) {
		emaBefore[i] = ema ?? 0
		const v = candles[i]!.indicators["volume"]
		if (typeof v === "number") {
			ema = ema === null ? v : ema + alpha * (v - ema)
		}
	}

	const byKey = new Map<string, number>()
	const tsToIdx = new Map<string, number>()
	for (let i = 0; i < candles.length; i++) {
		const c = candles[i]!
		byKey.set(`${brtDate(c.timestamp)}#${c.candleIndex}`, i)
		tsToIdx.set(c.timestamp, i)
	}

	const classify = (volume: number | null, emaAt: number): Zone => {
		if (volume === null) {
			return "NULL"
		}
		return volume > emaAt ? "ABOVE_EMA" : "AT_OR_BELOW"
	}

	const fires: FireRow[] = []
	for (const entry of catalog) {
		const idx = byKey.get(`${entry.date}#${entry.brickIndex}`)
		if (idx === undefined) {
			continue
		}
		const candle = candles[idx]!
		const v = candle.indicators["volume"]
		const vol = typeof v === "number" ? v : null
		const e = emaBefore[idx]!
		fires.push({
			source: "CATALOG",
			day: entry.date,
			label: entry.label ?? "",
			direction: entry.direction,
			volume: vol,
			emaAtFire: e,
			zone: classify(vol, e),
		})
	}

	// Run autonomous engine over the catalog window only (matching audit-parallel).
	const inWindow = candles.filter(
		(c) => brtDate(c.timestamp) >= minDay && brtDate(c.timestamp) < nextDay
	)
	const result = runBacktest(inWindow, hawksV0, ASSET_CONFIG)
	type DT = BacktestTrade & { entryBrickIndex: number }
	const tradesByDay = new Map<string, DT[]>()
	for (const trade of result.trades) {
		const day = brtDate(trade.entryTime)
		const idx = tsToIdx.get(trade.entryTime)
		if (idx === undefined) {
			continue
		}
		const arr = tradesByDay.get(day) ?? []
		arr.push({ ...trade, entryBrickIndex: candles[idx]!.candleIndex })
		tradesByDay.set(day, arr)
	}

	const claimed = new Set<number>()
	const WINDOW = 2
	for (const ce of catalog) {
		const dayTrades = tradesByDay.get(ce.date) ?? []
		let best: DT | null = null
		let bestDelta = Infinity
		for (const t of dayTrades) {
			if (claimed.has(t.id)) {
				continue
			}
			const d = Math.abs(t.entryBrickIndex - ce.brickIndex)
			if (d > WINDOW || t.direction !== ce.direction) {
				continue
			}
			if (d < bestDelta) {
				best = t
				bestDelta = d
			}
		}
		if (best) {
			claimed.add(best.id)
		}
	}

	for (const trades of tradesByDay.values()) {
		for (const trade of trades) {
			if (claimed.has(trade.id)) {
				continue
			}
			const idx = tsToIdx.get(trade.entryTime)
			if (idx === undefined) {
				continue
			}
			const candle = candles[idx]!
			const v = candle.indicators["volume"]
			const vol = typeof v === "number" ? v : null
			fires.push({
				source: "EXTRA",
				day: brtDate(trade.entryTime),
				label: `bx${candle.candleIndex}`,
				direction: trade.direction,
				volume: vol,
				emaAtFire: emaBefore[idx]!,
				zone: classify(vol, emaBefore[idx]!),
			})
		}
	}

	if (verbose) {
		console.log()
		console.log(
			"SRC      DATE        T#    DIR     VOLUME    EMA       RATIO   ZONE"
		)
		console.log("─".repeat(80))
		for (const f of fires) {
			const ratio =
				f.volume !== null && f.emaAtFire && f.emaAtFire > 0
					? (f.volume / f.emaAtFire).toFixed(2)
					: "—"
			console.log(
				`${f.source.padEnd(7)}  ${f.day}  ${f.label.padEnd(4)} ${f.direction.padEnd(6)} ` +
					`${String(f.volume ?? "—").padStart(8)}  ` +
					`${(f.emaAtFire?.toFixed(0) ?? "—").padStart(8)}  ${ratio.padStart(5)}   ${f.zone}`
			)
		}
	}

	const catalog2 = fires.filter((f) => f.source === "CATALOG")
	const extras = fires.filter((f) => f.source === "EXTRA")
	const cnt = (rows: FireRow[], z: Zone) =>
		rows.filter((r) => r.zone === z).length
	const pct = (n: number, total: number) =>
		total ? `${((n / total) * 100).toFixed(1)}%` : "—"

	console.log()
	console.log(`Total catalog fires: ${catalog2.length}`)
	console.log(`Total EXTRAS:        ${extras.length}`)
	console.log()
	console.log(`Volume vs running EMA (period ${emaPeriod})`)
	console.log(
		"  Zone           catalog (good)            extras (noise)            extras-vs-catalog"
	)
	console.log("─".repeat(85))
	for (const z of ["ABOVE_EMA", "AT_OR_BELOW", "NULL"] as const) {
		const c = cnt(catalog2, z)
		const x = cnt(extras, z)
		const cr = catalog2.length ? c / catalog2.length : 0
		const xr = extras.length ? x / extras.length : 0
		const sel = cr > 0 ? (xr / cr).toFixed(2) : "∞"
		console.log(
			`  ${z.padEnd(13)}  ${String(c).padStart(3)} (${pct(c, catalog2.length).padStart(6)})        ` +
				`${String(x).padStart(3)} (${pct(x, extras.length).padStart(6)})        ${sel}×`
		)
	}

	console.log()
	console.log("Rule evaluation")
	console.log("─".repeat(85))
	const catFav = cnt(catalog2, "ABOVE_EMA")
	const extraFav = cnt(extras, "ABOVE_EMA")
	const sel =
		catFav > 0 ? (extraFav / catFav).toFixed(2) : extraFav > 0 ? "∞" : "—"
	console.log(
		`  FAVOR (ABOVE_EMA ⇒ +1 score):`.padEnd(38) +
			`catalog ${catFav}/${catalog2.length} (${pct(catFav, catalog2.length)}), ` +
			`extras ${extraFav}/${extras.length} (${pct(extraFav, extras.length)})  ` +
			`x/c ${sel}  ← want <1 (catalog ABOVE more)`
	)

	// Ratio distribution to gauge how "above" things are
	const ratios = fires
		.filter((f) => f.volume !== null && f.emaAtFire && f.emaAtFire > 0)
		.map((f) => f.volume! / f.emaAtFire)
	ratios.sort((a, b) => a - b)
	const p = (q: number) =>
		ratios[Math.floor((ratios.length - 1) * q)]?.toFixed(2) ?? "—"
	console.log()
	console.log(
		`Volume/EMA ratio distribution across all fires (n=${ratios.length}): ` +
			`p10=${p(0.1)} p50=${p(0.5)} p90=${p(0.9)} max=${p(1)}`
	)
}

run().then(() => process.exit(0))
