/**
 * audit-parallel.ts
 *
 * Parallel audit: runs the AUTONOMOUS Hawks engine (hawks_v0 preset) over the
 * same date range as the user-catalog, and reports how well it reproduces the
 * catalogued entries by brick + direction.
 *
 * For each catalog entry (the truth set built up over 20 catalogued days), the
 * script checks whether the autonomous engine fired:
 *   - EXACT     same brick + same direction
 *   - NEAR ±N   within ±2 bricks + same direction (configurable via --window)
 *   - DIRMISS   same brick (±2) but different direction
 *   - MISS      no engine trade within window
 *
 * It also reports EXTRAS — autonomous engine trades on catalog days that don't
 * match any catalog entry (within window). Extras are candidate "real setups
 * you missed" or "false positives the engine fires that the catalog doesn't."
 *
 * Usage:
 *   pnpm tsx scripts/audit-parallel.ts
 *   pnpm tsx scripts/audit-parallel.ts 2026-03-23
 *   pnpm tsx scripts/audit-parallel.ts 2026-03-02 2026-05-13
 *   pnpm tsx scripts/audit-parallel.ts 2026-03-02 2026-05-13 --window 3
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
const DEFAULT_WINDOW = 2

interface CatalogEntry extends UserEntry {
	expectedResult?: string | null
	closingBrickPrice?: number | null
}

const loadCatalog = (days: string[]): CatalogEntry[] => {
	const files = readdirSync(ENTRIES_DIR)
		.filter((f) => f.endsWith(".json"))
		.sort()
	const all: CatalogEntry[] = []
	for (const f of files) {
		const date = f.replace(".json", "")
		if (days.length > 0 && !days.includes(date)) {
			continue
		}
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

const brtDate = (iso: string): string => {
	return new Date(new Date(iso).getTime() - 3 * 3600 * 1000)
		.toISOString()
		.slice(0, 10)
}

const run = async () => {
	const argv = process.argv.slice(2)
	const args = argv.filter((a) => !a.startsWith("--"))
	const windowArgIdx = argv.findIndex((a) => a === "--window")
	const matchWindow =
		windowArgIdx >= 0 && argv[windowArgIdx + 1]
			? parseInt(argv[windowArgIdx + 1]!, 10)
			: DEFAULT_WINDOW

	const url = process.env.DATABASE_URL
	if (!url) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)

	let days: string[]
	if (args.length === 1) {
		days = [args[0]!]
	} else if (args.length === 2) {
		const allFiles = readdirSync(ENTRIES_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(".json", ""))
			.sort()
		days = allFiles.filter((d) => d >= args[0]! && d <= args[1]!)
	} else {
		days = readdirSync(ENTRIES_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(".json", ""))
			.sort()
	}

	const catalog = loadCatalog(days)
	if (catalog.length === 0) {
		console.log("No catalog entries found for the given days.")
		process.exit(0)
	}

	const minDay = days[0]!
	const maxDay = days[days.length - 1]!
	const nextDay = new Date(
		new Date(`${maxDay}T03:00:00Z`).getTime() + 24 * 3600 * 1000
	)
		.toISOString()
		.slice(0, 10)
	const candles = await fetchCandles(sql, minDay, nextDay)

	if (candles.length === 0) {
		console.log("No candles found in DB for range", minDay, "→", maxDay)
		process.exit(0)
	}

	// Run the AUTONOMOUS engine
	const result = runBacktest(candles, hawksV0, ASSET_CONFIG)

	// Build timestamp → candleIndex lookup so we can compare engine trades
	// (timestamp-keyed) to catalog entries (brickIndex-keyed).
	const tsToCandleIndex = new Map<string, number>()
	for (const c of candles) {
		tsToCandleIndex.set(c.timestamp, c.candleIndex)
	}

	// Decorate trades with their entry brick index for matching
	type DecoratedTrade = BacktestTrade & { entryBrickIndex: number }
	const tradesByDay = new Map<string, DecoratedTrade[]>()
	for (const trade of result.trades) {
		const day = brtDate(trade.entryTime)
		const brickIndex = tsToCandleIndex.get(trade.entryTime) ?? -1
		const arr = tradesByDay.get(day) ?? []
		arr.push({ ...trade, entryBrickIndex: brickIndex })
		tradesByDay.set(day, arr)
	}

	// Track which engine trades have been claimed by a catalog match
	const claimed = new Set<number>() // trade.id

	// ── Output ──────────────────────────────────────────────────────────────
	const COL = { w: (s: string, n: number) => String(s).padEnd(n).slice(0, n) }
	const pad = (s: string | number, n: number) => String(s).padStart(n)

	console.log()
	console.log("DATE        T#   CAT_BX  CAT_DIR  ENG_BX  ENG_DIR  Δ    MATCH")
	console.log("─".repeat(70))

	let exact = 0
	let near = 0
	let dirmiss = 0
	let miss = 0
	const extras: Array<{ day: string; trade: DecoratedTrade }> = []

	for (const day of days) {
		const dayEntries = catalog.filter((e) => e.date === day)
		const dayTrades = tradesByDay.get(day) ?? []
		if (dayEntries.length === 0) {
			continue
		}

		for (const entry of dayEntries) {
			// Find best candidate engine trade for this catalog row.
			// Prefer: exact brick + dir match → near brick same dir → near brick any dir.
			let best: {
				trade: DecoratedTrade
				delta: number
				dirSame: boolean
			} | null = null
			for (const trade of dayTrades) {
				if (claimed.has(trade.id)) {
					continue
				}
				const delta = Math.abs(trade.entryBrickIndex - entry.brickIndex)
				if (delta > matchWindow) {
					continue
				}
				const dirSame = trade.direction === entry.direction
				if (
					!best ||
					(dirSame && !best.dirSame) ||
					(dirSame === best.dirSame && delta < best.delta)
				) {
					best = { trade, delta, dirSame }
				}
			}

			if (!best) {
				miss++
				console.log(
					`${day}  ${COL.w(entry.label ?? "", 4)} ${pad(entry.brickIndex, 6)}  ` +
						`${COL.w(entry.direction, 7)}  ${"—".padEnd(6)}  ${"—".padEnd(7)}  ${"—".padEnd(3)}  MISS`
				)
				continue
			}

			claimed.add(best.trade.id)

			let matchLabel: string
			if (!best.dirSame) {
				matchLabel = "DIRMISS"
				dirmiss++
			} else if (best.delta === 0) {
				matchLabel = "EXACT"
				exact++
			} else {
				matchLabel = `NEAR±${best.delta}`
				near++
			}

			console.log(
				`${day}  ${COL.w(entry.label ?? "", 4)} ${pad(entry.brickIndex, 6)}  ` +
					`${COL.w(entry.direction, 7)}  ${pad(best.trade.entryBrickIndex, 6)}  ` +
					`${COL.w(best.trade.direction, 7)}  ${pad(best.delta, 3)}  ${matchLabel}`
			)
		}

		// Collect unclaimed engine trades for this day as EXTRAS
		for (const trade of dayTrades) {
			if (!claimed.has(trade.id)) {
				extras.push({ day, trade })
			}
		}
	}

	console.log("─".repeat(70))
	console.log()
	console.log("Catalog reproduction summary")
	console.log(`  Catalog entries audited:   ${catalog.length}`)
	console.log(`  EXACT  (brick + dir):      ${exact}`)
	console.log(`  NEAR   (±${matchWindow} bricks, same dir):  ${near}`)
	console.log(`  DIRMISS (same brick, wrong dir): ${dirmiss}`)
	console.log(`  MISS   (no engine trade):  ${miss}`)
	console.log(
		`  Reproduction rate:         ${(((exact + near) / catalog.length) * 100).toFixed(1)}%`
	)
	console.log()
	console.log(
		`EXTRAS (autonomous engine trades unmatched in catalog): ${extras.length}`
	)
	if (extras.length > 0 && extras.length <= 60) {
		console.log("DATE        BX     DIR      ENTRY_PX   EXIT_PX    REASON")
		console.log("─".repeat(70))
		for (const { day, trade } of extras) {
			console.log(
				`${day}  ${pad(trade.entryBrickIndex, 5)}  ${COL.w(trade.direction, 7)}  ` +
					`${pad(trade.entryPrice.toFixed(3), 9)}  ${pad(trade.exitPrice.toFixed(3), 9)}  ` +
					`${trade.exitReason}`
			)
		}
	} else if (extras.length > 60) {
		console.log(`(showing first 60 of ${extras.length})`)
		for (const { day, trade } of extras.slice(0, 60)) {
			console.log(
				`${day}  ${pad(trade.entryBrickIndex, 5)}  ${COL.w(trade.direction, 7)}  ` +
					`${pad(trade.entryPrice.toFixed(3), 9)}  ${pad(trade.exitPrice.toFixed(3), 9)}  ` +
					`${trade.exitReason}`
			)
		}
	}
}

run().then(() => process.exit(0))
