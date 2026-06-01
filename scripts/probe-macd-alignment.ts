/**
 * probe-macd-alignment.ts
 *
 * Classify catalog fires + autonomous EXTRAS by two independent MACD signals:
 *
 * 1. SIGN alignment — direction-aware boolean
 *      LONG  + macd > 0 → ALIGNED      (bullish MACD agrees with LONG)
 *      LONG  + macd < 0 → ANTI         (bearish MACD disagrees)
 *      SHORT + macd < 0 → ALIGNED
 *      SHORT + macd > 0 → ANTI
 *      macd ≈ 0          → NEUTRAL
 *
 * 2. SLOPE streak — count of consecutive prior transitions where MACD moved
 *    in the trade-favorable direction, ending at the fire brick.
 *      LONG  favorable transition: macd[t] > macd[t-1]
 *      SHORT favorable transition: macd[t] < macd[t-1]
 *    Streak length = how many consecutive prior transitions held. Threshold
 *    for FAVOR is configurable (--streak-threshold, default 3 = 4 bricks
 *    all moving the same way in trade direction).
 *
 *    A streak ≥ threshold AGAINST trade direction is the penalty trigger.
 *
 * Usage:
 *   pnpm tsx scripts/probe-macd-alignment.ts
 *   pnpm tsx scripts/probe-macd-alignment.ts --streak-threshold 5
 *   pnpm tsx scripts/probe-macd-alignment.ts --verbose
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

type SignZone = "ALIGNED" | "ANTI" | "NEUTRAL" | "NULL"
type SlopeZone = "FAVOR_STREAK" | "AGAINST_STREAK" | "MIXED" | "NULL"

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

const classifySign = (
	macd: number | undefined,
	direction: "short" | "long"
): SignZone => {
	if (typeof macd !== "number") {
		return "NULL"
	}
	if (macd === 0) {
		return "NEUTRAL"
	}
	if (direction === "long" && macd > 0) {
		return "ALIGNED"
	}
	if (direction === "short" && macd < 0) {
		return "ALIGNED"
	}
	return "ANTI"
}

// Walk backward from `priorMacds` (chronological order; tail = brick before
// fire brick) and count consecutive transitions in trade-favorable direction.
// `currentMacd` is the fire brick's MACD; first transition is currentMacd vs
// priorMacds[last].
const computeStreak = (
	currentMacd: number,
	priorMacds: number[],
	direction: "short" | "long"
): number => {
	let streak = 0
	let prev = currentMacd
	for (let i = priorMacds.length - 1; i >= 0; i--) {
		const earlier = priorMacds[i]!
		const transition = prev - earlier // positive = MACD rose into prev
		const isFavorable = direction === "long" ? transition > 0 : transition < 0
		if (!isFavorable) {
			break
		}
		streak++
		prev = earlier
	}
	return streak
}

// "Against" streak — same logic but checking if MACD moved AGAINST direction.
const computeAgainstStreak = (
	currentMacd: number,
	priorMacds: number[],
	direction: "short" | "long"
): number => {
	let streak = 0
	let prev = currentMacd
	for (let i = priorMacds.length - 1; i >= 0; i--) {
		const earlier = priorMacds[i]!
		const transition = prev - earlier
		const isAgainst = direction === "long" ? transition < 0 : transition > 0
		if (!isAgainst) {
			break
		}
		streak++
		prev = earlier
	}
	return streak
}

const classifySlope = (
	currentMacd: number | undefined,
	priorMacds: number[],
	direction: "short" | "long",
	threshold: number
): { zone: SlopeZone; favorStreak: number; againstStreak: number } => {
	if (typeof currentMacd !== "number" || priorMacds.length === 0) {
		return { zone: "NULL", favorStreak: 0, againstStreak: 0 }
	}
	const favorStreak = computeStreak(currentMacd, priorMacds, direction)
	const againstStreak = computeAgainstStreak(currentMacd, priorMacds, direction)
	if (favorStreak >= threshold) {
		return { zone: "FAVOR_STREAK", favorStreak, againstStreak }
	}
	if (againstStreak >= threshold) {
		return { zone: "AGAINST_STREAK", favorStreak, againstStreak }
	}
	return { zone: "MIXED", favorStreak, againstStreak }
}

interface FireRow {
	source: "CATALOG" | "EXTRA"
	day: string
	label: string
	direction: "short" | "long"
	signZone: SignZone
	slopeZone: SlopeZone
	favorStreak: number
	againstStreak: number
}

const run = async () => {
	const argv = process.argv.slice(2)
	const verbose = argv.includes("--verbose")
	const tIdx = argv.findIndex((a) => a === "--streak-threshold")
	const streakThreshold =
		tIdx >= 0 && argv[tIdx + 1] ? parseInt(argv[tIdx + 1]!, 10) : 3
	const url = process.env.DATABASE_URL
	if (!url) {
		throw new Error("DATABASE_URL missing")
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)
	console.log(`[probe] streak threshold = ${streakThreshold}`)

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

	// Build per-day chronological MACD history so we can look up brick X's
	// prior MACD values without re-scanning candles. Key by BRT day.
	const macdByDay = new Map<string, { idx: number; macd: number | null }[]>()
	for (const c of candles) {
		const day = brtDate(c.timestamp)
		const arr = macdByDay.get(day) ?? []
		const m = c.indicators["macd"]
		arr.push({ idx: c.candleIndex, macd: typeof m === "number" ? m : null })
		macdByDay.set(day, arr)
	}

	const priorMacds = (day: string, brickIndex: number): number[] => {
		const arr = macdByDay.get(day) ?? []
		// arr is in candle order; collect macds before brickIndex
		const out: number[] = []
		for (const row of arr) {
			if (row.idx >= brickIndex) {
				break
			}
			if (row.macd !== null) {
				out.push(row.macd)
			}
		}
		return out
	}

	const fires: FireRow[] = []
	for (const entry of catalog) {
		const candle = byKey.get(`${entry.date}#${entry.brickIndex}`)
		if (!candle) {
			continue
		}
		const macd = candle.indicators["macd"]
		const sign = classifySign(macd, entry.direction)
		const prior = priorMacds(entry.date, entry.brickIndex)
		const slope = classifySlope(macd, prior, entry.direction, streakThreshold)
		fires.push({
			source: "CATALOG",
			day: entry.date,
			label: entry.label ?? "",
			direction: entry.direction,
			signZone: sign,
			slopeZone: slope.zone,
			favorStreak: slope.favorStreak,
			againstStreak: slope.againstStreak,
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
			const day = brtDate(trade.entryTime)
			const macd = candle.indicators["macd"]
			const sign = classifySign(macd, trade.direction)
			const prior = priorMacds(day, candle.candleIndex)
			const slope = classifySlope(macd, prior, trade.direction, streakThreshold)
			fires.push({
				source: "EXTRA",
				day,
				label: `bx${candle.candleIndex}`,
				direction: trade.direction,
				signZone: sign,
				slopeZone: slope.zone,
				favorStreak: slope.favorStreak,
				againstStreak: slope.againstStreak,
			})
		}
	}

	if (verbose) {
		console.log()
		console.log(
			"SRC      DATE        T#    DIR     SIGN     SLOPE          FAVOR  AGAINST"
		)
		console.log("─".repeat(85))
		for (const f of fires) {
			console.log(
				`${f.source.padEnd(7)}  ${f.day}  ${f.label.padEnd(4)} ${f.direction.padEnd(6)} ` +
					`${f.signZone.padEnd(8)} ${f.slopeZone.padEnd(14)}   ${String(f.favorStreak).padStart(3)}    ${String(f.againstStreak).padStart(3)}`
			)
		}
	}

	const catalog2 = fires.filter((f) => f.source === "CATALOG")
	const extras = fires.filter((f) => f.source === "EXTRA")
	const cnt = <T extends string>(rows: FireRow[], field: keyof FireRow, z: T) =>
		rows.filter((r) => r[field] === z).length
	const pct = (n: number, total: number) =>
		total ? `${((n / total) * 100).toFixed(1)}%` : "—"

	console.log()
	console.log(`Total catalog fires: ${catalog2.length}`)
	console.log(`Total EXTRAS:        ${extras.length}`)

	console.log()
	console.log("Signal 1 — MACD sign alignment with trade direction")
	console.log(
		"  Zone        catalog (good)            extras (noise)            extras-vs-catalog"
	)
	console.log("─".repeat(85))
	for (const z of ["ALIGNED", "ANTI", "NEUTRAL", "NULL"] as const) {
		const c = cnt(catalog2, "signZone", z)
		const x = cnt(extras, "signZone", z)
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
		`Signal 2 — MACD slope streak (threshold = ${streakThreshold} transitions)`
	)
	console.log(
		"  Zone             catalog (good)            extras (noise)            extras-vs-catalog"
	)
	console.log("─".repeat(90))
	for (const z of [
		"FAVOR_STREAK",
		"AGAINST_STREAK",
		"MIXED",
		"NULL",
	] as const) {
		const c = cnt(catalog2, "slopeZone", z)
		const x = cnt(extras, "slopeZone", z)
		const cr = catalog2.length ? c / catalog2.length : 0
		const xr = extras.length ? x / extras.length : 0
		const sel = cr > 0 ? (xr / cr).toFixed(2) : "∞"
		console.log(
			`  ${z.padEnd(15)}  ${String(c).padStart(3)} (${pct(c, catalog2.length).padStart(6)})        ` +
				`${String(x).padStart(3)} (${pct(x, extras.length).padStart(6)})        ${sel}×`
		)
	}

	console.log()
	console.log("Rule evaluation (>1 selectivity = useful signal)")
	console.log("─".repeat(90))
	const signFav = cnt(catalog2, "signZone", "ALIGNED")
	const signFavX = cnt(extras, "signZone", "ALIGNED")
	const signPen = cnt(catalog2, "signZone", "ANTI")
	const signPenX = cnt(extras, "signZone", "ANTI")
	const fmtSel = (cat: number, ext: number) =>
		cat > 0 ? (ext / cat).toFixed(2) : ext > 0 ? "∞" : "—"
	console.log(
		`  FAVOR (sign aligned):`.padEnd(40) +
			`catalog ${signFav}/${catalog2.length} (${pct(signFav, catalog2.length)}), ` +
			`extras ${signFavX}/${extras.length} (${pct(signFavX, extras.length)})  ` +
			`x/c ${fmtSel(signFav, signFavX)}` +
			`  ← want <1 (catalog should align MORE)`
	)
	console.log(
		`  PENALTY (sign anti):`.padEnd(40) +
			`catalog ${signPen}/${catalog2.length} (${pct(signPen, catalog2.length)}), ` +
			`extras ${signPenX}/${extras.length} (${pct(signPenX, extras.length)})  ` +
			`x/c ${fmtSel(signPen, signPenX)}` +
			`  ← want >1 (extras should anti MORE)`
	)
	const slopeFav = cnt(catalog2, "slopeZone", "FAVOR_STREAK")
	const slopeFavX = cnt(extras, "slopeZone", "FAVOR_STREAK")
	const slopePen = cnt(catalog2, "slopeZone", "AGAINST_STREAK")
	const slopePenX = cnt(extras, "slopeZone", "AGAINST_STREAK")
	console.log(
		`  FAVOR (favorable streak ≥${streakThreshold}):`.padEnd(40) +
			`catalog ${slopeFav}/${catalog2.length} (${pct(slopeFav, catalog2.length)}), ` +
			`extras ${slopeFavX}/${extras.length} (${pct(slopeFavX, extras.length)})  ` +
			`x/c ${fmtSel(slopeFav, slopeFavX)}` +
			`  ← want <1`
	)
	console.log(
		`  PENALTY (against streak ≥${streakThreshold}):`.padEnd(40) +
			`catalog ${slopePen}/${catalog2.length} (${pct(slopePen, catalog2.length)}), ` +
			`extras ${slopePenX}/${extras.length} (${pct(slopePenX, extras.length)})  ` +
			`x/c ${fmtSel(slopePen, slopePenX)}` +
			`  ← want >1`
	)
}

run().then(() => process.exit(0))
