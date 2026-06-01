/**
 * probe-keltner-exhaustion.ts
 *
 * Classify catalog fires + autonomous EXTRAS by Keltner exhaustion zone.
 *
 * Rule (direction-aware):
 *   For SHORT (favorable = down): the LOWER band (inf) is "ahead". Price
 *     reaching it = down-move exhausted.
 *   For LONG  (favorable = up):   the UPPER band (sup) is "ahead". Price
 *     reaching it = up-move exhausted.
 *
 * Geometric model — distance-to-band in brick-sizes:
 *   distanceToInner = close - inf_125 (SHORT)  OR  sup_125 - close (LONG)
 *   distanceToOuter = close - inf_165 (SHORT)  OR  sup_165 - close (LONG)
 *   positive ⇒ trade has room before hitting the band
 *   negative ⇒ price already past the band
 *
 * Zones (parametric on --near-bricks, default 2):
 *   NEAR_125  — 0 < distanceToInner ≤ N brickSizes (approaching inner band)
 *   PAST_125  — distanceToInner ≤ 0 (touching/crossed inner band)
 *   NEAR_165  — 0 < distanceToOuter ≤ N brickSizes (approaching outer wall)
 *   PAST_165  — distanceToOuter ≤ 0 (touching/crossed outer wall — rare)
 *   CLEAR     — neither approaching nor past anything
 *
 * Decision logic:
 *   165 BLOCK candidate = NEAR_165 ∪ PAST_165 (because price rarely PASTs 165).
 *   125 PENALTY candidate = NEAR_125 ∪ PAST_125, excluding any 165-zone fires.
 *
 * Usage:
 *   pnpm tsx scripts/probe-keltner-exhaustion.ts
 *   pnpm tsx scripts/probe-keltner-exhaustion.ts --near-bricks 3
 *   pnpm tsx scripts/probe-keltner-exhaustion.ts --verbose
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

type Zone = "CLEAR" | "NEAR_125" | "PAST_125" | "NEAR_165" | "PAST_165" | "NULL"

interface CatalogEntry extends UserEntry {
	expectedResult?: string | null
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

// Classify a fire by exhaustion zone given trade direction.
// Outer band (165) wins over inner (125) when both fire, since 165 is the
// stronger signal. NEAR < PAST for the same band — PAST wins.
const classify = (
	close: number,
	open: number,
	direction: "short" | "long",
	indicators: Record<string, number>,
	nearBricks: number
): Zone => {
	const brickSize = Math.abs(close - open) || 100
	const inner = direction === "short" ? "keltner_inf_125" : "keltner_sup_125"
	const outer = direction === "short" ? "keltner_inf_165" : "keltner_sup_165"
	const innerVal = indicators[inner]
	const outerVal = indicators[outer]
	if (typeof innerVal !== "number" || typeof outerVal !== "number") {
		return "NULL"
	}
	// Distance to band in trade-favorable direction.
	// SHORT favorable = down ⇒ distance = close - band (positive = above band = clear).
	// LONG  favorable = up   ⇒ distance = band - close.
	const innerDist = direction === "short" ? close - innerVal : innerVal - close
	const outerDist = direction === "short" ? close - outerVal : outerVal - close

	const window = nearBricks * brickSize
	const innerNear = innerDist > 0 && innerDist <= window
	const innerPast = innerDist <= 0
	const outerNear = outerDist > 0 && outerDist <= window
	const outerPast = outerDist <= 0

	if (outerPast) {
		return "PAST_165"
	}
	if (outerNear) {
		return "NEAR_165"
	}
	if (innerPast) {
		return "PAST_125"
	}
	if (innerNear) {
		return "NEAR_125"
	}
	return "CLEAR"
}

interface FireRow {
	source: "CATALOG" | "EXTRA"
	day: string
	label: string
	direction: "short" | "long"
	entry: number
	zone: Zone
	expectedResult?: string | null
}

const run = async () => {
	const argv = process.argv.slice(2)
	const verbose = argv.includes("--verbose")
	const nearIdx = argv.findIndex((a) => a === "--near-bricks")
	const nearBricks =
		nearIdx >= 0 && argv[nearIdx + 1] ? parseFloat(argv[nearIdx + 1]!) : 2
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error("DATABASE_URL missing")
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)
	console.log(`[probe] near-bricks window = ${nearBricks}`)

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
	for (const c of candles) {
		byKey.set(`${brtDate(c.timestamp)}#${c.candleIndex}`, c)
	}
	const tsToCandle = new Map<string, CandleRow>()
	for (const c of candles) {
		tsToCandle.set(c.timestamp, c)
	}

	const fires: FireRow[] = []
	for (const entry of catalog) {
		const candle = byKey.get(`${entry.date}#${entry.brickIndex}`)
		if (!candle) {
			continue
		}
		const close = entry.closingBrickPrice ?? candle.close
		fires.push({
			source: "CATALOG",
			day: entry.date,
			label: entry.label ?? "",
			direction: entry.direction,
			entry: close,
			zone: classify(
				close,
				candle.open,
				entry.direction,
				candle.indicators,
				nearBricks
			),
			expectedResult: entry.expectedResult ?? null,
		})
	}

	const result = runBacktest(candles, hawksV0, ASSET_CONFIG)
	type DecoratedTrade = BacktestTrade & { entryBrickIndex: number }
	const tradesByDay = new Map<string, DecoratedTrade[]>()
	for (const trade of result.trades) {
		const day = brtDate(trade.entryTime)
		const c = tsToCandle.get(trade.entryTime)
		const brickIndex = c?.candleIndex ?? -1
		const arr = tradesByDay.get(day) ?? []
		arr.push({ ...trade, entryBrickIndex: brickIndex })
		tradesByDay.set(day, arr)
	}

	const claimed = new Set<number>()
	const WINDOW = 2
	for (const ce of catalog) {
		const dayTrades = tradesByDay.get(ce.date) ?? []
		let best: DecoratedTrade | null = null
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
			fires.push({
				source: "EXTRA",
				day: brtDate(trade.entryTime),
				label: `bx${trade.entryBrickIndex}`,
				direction: trade.direction,
				entry: trade.entryPrice,
				zone: classify(
					trade.entryPrice,
					candle.open,
					trade.direction,
					candle.indicators,
					nearBricks
				),
				expectedResult: trade.exitReason,
			})
		}
	}

	if (verbose) {
		console.log()
		console.log("SRC      DATE        T#    DIR     ENTRY     ZONE      EXP")
		console.log("─".repeat(70))
		for (const f of fires) {
			console.log(
				`${f.source.padEnd(7)}  ${f.day}  ${f.label.padEnd(4)} ${f.direction.padEnd(6)} ` +
					`${String(f.entry).padStart(7)}  ${f.zone.padEnd(8)}  ${f.expectedResult ?? "-"}`
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
	console.log(
		"Keltner exhaustion zone (price near/past the trade-direction band)"
	)
	console.log(
		"  Zone        catalog (good)            extras (noise)            extras-vs-catalog"
	)
	console.log("─".repeat(85))
	for (const z of [
		"CLEAR",
		"NEAR_125",
		"PAST_125",
		"NEAR_165",
		"PAST_165",
		"NULL",
	] as const) {
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
	console.log(
		"Rule evaluation — selectivity = extras-killed / catalog-killed (>1 = useful)"
	)
	console.log("─".repeat(85))
	const inOuterZone = (f: FireRow) =>
		f.zone === "NEAR_165" || f.zone === "PAST_165"
	const inInnerOnlyZone = (f: FireRow) =>
		f.zone === "NEAR_125" || f.zone === "PAST_125"

	const catBlock = catalog2.filter(inOuterZone).length
	const extraBlock = extras.filter(inOuterZone).length
	const blockSel =
		catBlock > 0
			? (extraBlock / catBlock).toFixed(2)
			: extraBlock > 0
				? "∞"
				: "—"
	console.log(
		`  BLOCK candidate (165 zone ⇒ refuse fire):`.padEnd(48) +
			`catalog killed ${catBlock}/${catalog2.length} (${pct(catBlock, catalog2.length)}), ` +
			`extras killed ${extraBlock}/${extras.length} (${pct(extraBlock, extras.length)})  ` +
			`selectivity ${blockSel}×`
	)

	const catPenalty = catalog2.filter(inInnerOnlyZone).length
	const extraPenalty = extras.filter(inInnerOnlyZone).length
	const penaltySel =
		catPenalty > 0
			? (extraPenalty / catPenalty).toFixed(2)
			: extraPenalty > 0
				? "∞"
				: "—"
	console.log(
		`  PENALTY candidate (125 zone only ⇒ -1 score):`.padEnd(48) +
			`catalog penalized ${catPenalty}/${catalog2.length} (${pct(catPenalty, catalog2.length)}), ` +
			`extras penalized ${extraPenalty}/${extras.length} (${pct(extraPenalty, extras.length)})  ` +
			`selectivity ${penaltySel}×`
	)
}

run().then(() => process.exit(0))
