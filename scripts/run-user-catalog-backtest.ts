/**
 * run-user-catalog-backtest.ts
 *
 * Step-7 verification: runs a backtest using the user's entry catalog (JSON
 * files) instead of the autonomous Hawks structural engine. Verifies that
 * outcome simulation (stop / BE / 3R exit) reproduces the user's manual trades.
 *
 * Usage:
 *   pnpm tsx scripts/run-user-catalog-backtest.ts --from 2026-05-13 --to 2026-05-13
 *   pnpm tsx scripts/run-user-catalog-backtest.ts --from 2026-03-23 --to 2026-05-13
 *   pnpm tsx scripts/run-user-catalog-backtest.ts --catalog data/hawks/user-entries/2026-05-13.json
 *
 * If --catalog is omitted, all JSON files in data/hawks/user-entries/ are loaded.
 * If --from/--to are omitted, the date range is derived from the catalog.
 */
import "dotenv/config"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"
import type { UserEntry } from "@/types/backtest"
import { hawksUserCatalog } from "@/lib/backtest/presets/hawks-presets"
import { runBacktest } from "@/lib/backtest/engine"
import type { CandleRow } from "@/types/candle"

const DATA_ROOT = resolve(process.cwd(), "data/hawks")
const CATALOG_DIR = resolve(DATA_ROOT, "user-entries")
const ASSET_SYMBOL = "WIN"
const TIMEFRAME_CODE = "5m"

// ─── Catalog loading ──────────────────────────────────────────────────────────

const loadCatalog = (paths: string[]): UserEntry[] => {
	const entries: UserEntry[] = []
	for (const p of paths) {
		const raw = JSON.parse(readFileSync(p, "utf8")) as UserEntry[]
		entries.push(...raw)
	}
	return entries.sort(
		(a, b) => a.date.localeCompare(b.date) || a.brickIndex - b.brickIndex
	)
}

const allCatalogFiles = (): string[] =>
	readdirSync(CATALOG_DIR)
		.filter((f) => f.endsWith(".json"))
		.map((f) => resolve(CATALOG_DIR, f))
		.sort()

// ─── Candle fetch ─────────────────────────────────────────────────────────────

const fetchCandles = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	from: string,
	to: string
): Promise<CandleRow[]> => {
	const fromUtc = new Date(`${from}T03:00:00.000Z`)
	const toUtc = new Date(`${to}T03:00:00.000Z`)
	// Add 1 day to toUtc to include the full "to" day
	const toUtcInclusive = new Date(toUtc.getTime() + 24 * 3600 * 1000)

	const rows = (await sql`
		SELECT pc.timestamp, pc.open, pc.high, pc.low, pc.close, pc.candle_index
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = ${ASSET_SYMBOL}
		  AND t.code = ${TIMEFRAME_CODE}
		  AND pc.timestamp >= ${fromUtc.toISOString()}
		  AND pc.timestamp <  ${toUtcInclusive.toISOString()}
		ORDER BY pc.timestamp, pc.candle_index NULLS LAST
	`) as {
		timestamp: string | Date
		open: string
		high: string
		low: string
		close: string
		candle_index: number | null
	}[]

	return rows.map((r) => ({
		timestamp:
			typeof r.timestamp === "string" ? r.timestamp : r.timestamp.toISOString(),
		open: Number(r.open),
		high: Number(r.high),
		low: Number(r.low),
		close: Number(r.close),
		candleIndex: r.candle_index,
		indicators: {},
	}))
}

// ─── Arg parsing ──────────────────────────────────────────────────────────────

const getArg = (flag: string): string | undefined => {
	const idx = process.argv.indexOf(flag)
	return idx !== -1 ? process.argv[idx + 1] : undefined
}

// ─── Runner ───────────────────────────────────────────────────────────────────

const run = async () => {
	const databaseUrl = process.env.DATABASE_URL
	if (!databaseUrl) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(databaseUrl) ? neon(databaseUrl) : postgres(databaseUrl)

	// Load catalog
	const catalogArg = getArg("--catalog")
	const catalogFiles = catalogArg
		? [resolve(process.cwd(), catalogArg)]
		: allCatalogFiles()
	if (catalogFiles.length === 0) {
		console.error(`No catalog files found in ${CATALOG_DIR}`)
		process.exit(1)
	}
	const catalog = loadCatalog(catalogFiles)
	console.log(
		`Loaded ${catalog.length} catalog entries from ${catalogFiles.length} file(s)`
	)

	// Date range: from args or derived from catalog
	const dates = catalog.map((e) => e.date).sort()
	const fromArg = getArg("--from") ?? dates[0]!
	const toArg = getArg("--to") ?? dates[dates.length - 1]!
	console.log(`Date range: ${fromArg} → ${toArg}`)

	// Fetch candles
	const candles = await fetchCandles(sql, fromArg, toArg)
	console.log(`Fetched ${candles.length} 5m bricks`)

	// Build recipe with catalog injected into config
	const baseConfig = hawksUserCatalog.entry.config
	const recipe = {
		...hawksUserCatalog,
		entry: {
			type: "user_catalog" as const,
			config: { ...baseConfig, catalog },
		},
	}

	// Asset config for WIN mini-índice
	const assetConfig = {
		tickSize: 5,
		tickValueCents: 100, // R$1.00 per tick
		currency: "BRL",
	}

	// Run backtest
	const result = runBacktest(candles, recipe, assetConfig)

	// Print results
	console.log(`\n${"─".repeat(60)}`)
	console.log(`Trades: ${result.trades.length}`)
	for (const trade of result.trades) {
		const pnl = (trade.netPnlCents / 100).toFixed(2)
		const sign = trade.netPnlCents >= 0 ? "+" : ""
		console.log(
			`  [${String(trade.id).padStart(2)}]  ${trade.entryTime.slice(0, 19)}  ` +
				`${trade.direction.padEnd(5)}  entry=${trade.entryPrice}  ` +
				`exit=${trade.exitPrice}  reason=${trade.exitReason}  ` +
				`label=${trade.label}  pnl=R$${sign}${pnl}`
		)
	}
	console.log(`${"─".repeat(60)}`)
	console.log(`Total trades: ${result.summary.totalTrades}`)
	console.log(
		`Wins: ${result.summary.wins}  Losses: ${result.summary.losses}  BE: ${result.summary.breakevens}`
	)
	const totalPnl = (result.summary.totalPnlCents / 100).toFixed(2)
	console.log(`Net P&L: R$${totalPnl}`)

	// Verify catalog entries fired
	const firedLabels = result.trades.map((t) => t.label)
	console.log(`\nCatalog entries fired: ${firedLabels.join(", ")}`)
	const catalogLabels = catalog.map(
		(e) => e.label ?? `${e.date}:${e.brickIndex}`
	)
	const missed = catalogLabels.filter((l) => !firedLabels.includes(l))
	if (missed.length === 0) {
		console.log(`All ${catalog.length} catalog entries fired successfully.`)
	} else {
		console.log(
			`WARNING: ${missed.length} catalog entries did NOT fire: ${missed.join(", ")}`
		)
		console.log(
			"Possible causes: entry brick was processed while a position was open."
		)
	}

	if (!isNeonUrl(databaseUrl)) {
		await (sql as ReturnType<typeof postgres>).end()
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
