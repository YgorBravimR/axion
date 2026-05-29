/**
 * probe-aggression-balance.ts
 *
 * Classify each catalog fire + autonomous EXTRA by whether order-flow
 * aggression at the fire brick *confirms* or *opposes* the trade direction.
 *
 * Sign convention (verified by scripts/peek-aggression-sign.ts):
 *   aggression_balance > 0 ⇒ buy pressure
 *   aggression_balance < 0 ⇒ sell pressure
 *
 * Zones (parametric on --threshold, default 15000 per user's heuristic):
 *   ALIGNED — LONG + agg ≥ +T, OR SHORT + agg ≤ -T (strong flow confirming)
 *   ANTI    — LONG + agg ≤ -T, OR SHORT + agg ≥ +T (strong flow opposing)
 *   NEUTRAL — |agg| < T (no strong flow either way)
 *   NULL    — indicator missing
 *
 * Decision logic:
 *   FAVOR candidate = ALIGNED (catalog should hit this MORE)
 *   PENALTY candidate = ANTI   (extras should hit this MORE)
 *
 * Usage:
 *   pnpm tsx scripts/probe-aggression-balance.ts
 *   pnpm tsx scripts/probe-aggression-balance.ts --threshold 10000
 *   pnpm tsx scripts/probe-aggression-balance.ts --threshold 20000 --verbose
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

type Zone = "ALIGNED" | "ANTI" | "NEUTRAL" | "NULL"

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

const classify = (
	candle: CandleRow,
	direction: "short" | "long",
	threshold: number
): Zone => {
	const agg = candle.indicators["aggression_balance"]
	if (typeof agg !== "number") {
		return "NULL"
	}
	if (Math.abs(agg) < threshold) {
		return "NEUTRAL"
	}
	if (direction === "long" && agg >= threshold) {
		return "ALIGNED"
	}
	if (direction === "short" && agg <= -threshold) {
		return "ALIGNED"
	}
	return "ANTI"
}

interface FireRow {
	source: "CATALOG" | "EXTRA"
	day: string
	label: string
	direction: "short" | "long"
	agg: number | null
	zone: Zone
}

const run = async () => {
	const argv = process.argv.slice(2)
	const verbose = argv.includes("--verbose")
	const tIdx = argv.findIndex((a) => a === "--threshold")
	const threshold =
		tIdx >= 0 && argv[tIdx + 1] ? parseInt(argv[tIdx + 1]!, 10) : 15000
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error("DATABASE_URL missing")
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)
	console.log(`[probe] threshold = ${threshold}`)

	const catalog = loadCatalog()
	const days = [...new Set(catalog.map((c) => c.date))].sort()
	const minDay = days[0]!
	const maxDay = days[days.length - 1]!
	const nextDay = new Date(
		new Date(`${maxDay}T03:00:00Z`).getTime() + 24 * 3600 * 1000
	)
		.toISOString()
		.slice(0, 10)
	const candles = await fetchCandles(sql, minDay, nextDay)

	const byKey = new Map<string, CandleRow>()
	const tsToCandle = new Map<string, CandleRow>()
	for (const c of candles) {
		byKey.set(`${brtDate(c.timestamp)}#${c.candleIndex}`, c)
		tsToCandle.set(c.timestamp, c)
	}

	const fires: FireRow[] = []
	for (const entry of catalog) {
		const candle = byKey.get(`${entry.date}#${entry.brickIndex}`)
		if (!candle) {
			continue
		}
		const agg = candle.indicators["aggression_balance"]
		fires.push({
			source: "CATALOG",
			day: entry.date,
			label: entry.label ?? "",
			direction: entry.direction,
			agg: typeof agg === "number" ? agg : null,
			zone: classify(candle, entry.direction, threshold),
		})
	}

	const result = runBacktest(candles, hawksV0, ASSET_CONFIG)
	type DT = BacktestTrade & { entryBrickIndex: number }
	const tradesByDay = new Map<string, DT[]>()
	for (const trade of result.trades) {
		const day = brtDate(trade.entryTime)
		const c = tsToCandle.get(trade.entryTime)
		const arr = tradesByDay.get(day) ?? []
		arr.push({ ...trade, entryBrickIndex: c?.candleIndex ?? -1 })
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
			const candle = tsToCandle.get(trade.entryTime)
			if (!candle) {
				continue
			}
			const agg = candle.indicators["aggression_balance"]
			fires.push({
				source: "EXTRA",
				day: brtDate(trade.entryTime),
				label: `bx${candle.candleIndex}`,
				direction: trade.direction,
				agg: typeof agg === "number" ? agg : null,
				zone: classify(candle, trade.direction, threshold),
			})
		}
	}

	if (verbose) {
		console.log()
		console.log("SRC      DATE        T#    DIR     AGG          ZONE")
		console.log("─".repeat(70))
		for (const f of fires) {
			console.log(
				`${f.source.padEnd(7)}  ${f.day}  ${f.label.padEnd(4)} ${f.direction.padEnd(6)} ` +
					`${String(f.agg ?? "—").padStart(8)}     ${f.zone}`
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
	console.log("Aggression alignment with trade direction")
	console.log(
		"  Zone        catalog (good)            extras (noise)            extras-vs-catalog"
	)
	console.log("─".repeat(85))
	for (const z of ["ALIGNED", "ANTI", "NEUTRAL", "NULL"] as const) {
		const c = cnt(catalog2, z)
		const x = cnt(extras, z)
		const cr = catalog2.length ? c / catalog2.length : 0
		const xr = extras.length ? x / extras.length : 0
		const sel = cr > 0 ? (xr / cr).toFixed(2) : "∞"
		console.log(
			`  ${z.padEnd(10)}  ${String(c).padStart(3)} (${pct(c, catalog2.length).padStart(6)})        ` +
				`${String(x).padStart(3)} (${pct(x, extras.length).padStart(6)})        ${sel}×`
		)
	}

	console.log()
	console.log("Rule evaluation")
	console.log("─".repeat(85))
	const catFav = cnt(catalog2, "ALIGNED")
	const extraFav = cnt(extras, "ALIGNED")
	const catPen = cnt(catalog2, "ANTI")
	const extraPen = cnt(extras, "ANTI")
	const sel = (cat: number, ext: number) =>
		cat > 0 ? (ext / cat).toFixed(2) : ext > 0 ? "∞" : "—"
	console.log(
		`  FAVOR (ALIGNED ⇒ +1 score):`.padEnd(38) +
			`catalog ${catFav}/${catalog2.length} (${pct(catFav, catalog2.length)}), ` +
			`extras ${extraFav}/${extras.length} (${pct(extraFav, extras.length)})  ` +
			`x/c ${sel(catFav, extraFav)}  ← want <1 (catalog FAVORs more)`
	)
	console.log(
		`  PENALTY (ANTI ⇒ -1 score):`.padEnd(38) +
			`catalog ${catPen}/${catalog2.length} (${pct(catPen, catalog2.length)}), ` +
			`extras ${extraPen}/${extras.length} (${pct(extraPen, extras.length)})  ` +
			`x/c ${sel(catPen, extraPen)}  ← want >1 (extras anti more)`
	)
}

run().then(() => process.exit(0))
