/**
 * audit-catalog-results.ts
 *
 * Compares user-catalogued trade outcomes (expectedResult + closingBrickPrice)
 * against what the Hawks user-catalog backtest engine computes.
 *
 * For each entry in data/hawks/user-entries/*.json that has `expectedResult`
 * and optionally `closingBrickPrice`, the script:
 *   1. Fires the user-catalog backtest for that day.
 *   2. Matches the fired trade to the catalog entry by label.
 *   3. Classifies the engine's exit as GA / BE / ST.
 *   4. Prints MATCH or MISMATCH with detail.
 *
 * Exit reason → result mapping:
 *   target1           → GA (3R hit)
 *   breakeven_stop    → BE
 *   stop + pnl < 0    → ST (initial stop, loss)
 *   stop + pnl >= 0   → ??? (unexpected — stop hit but profitable, logged as ANOMALY)
 *   eod               → EOD (day closed; no user expectation for this)
 *
 * Usage:
 *   pnpm tsx scripts/audit-catalog-results.ts
 *   pnpm tsx scripts/audit-catalog-results.ts 2026-03-23          # single day
 *   pnpm tsx scripts/audit-catalog-results.ts 2026-03-23 2026-03-27  # range
 */
import "dotenv/config"
import { readFileSync, readdirSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksUserCatalog } from "@/lib/backtest/presets/hawks-presets"
import type { CandleRow } from "@/types/candle"
import type { UserEntry, StrategyRecipe } from "@/types/backtest"

const ENTRIES_DIR = resolve(process.cwd(), "data/hawks/user-entries")
const ASSET_SYMBOL = "WIN"
const ASSET_CONFIG = { tickSize: 5, tickValueCents: 100 }

// ─── Result classification ────────────────────────────────────────────────────

type ResultCode = "GA" | "BE" | "ST" | "EOD" | "???"

const classifyResult = (reason: string, pnlCents: number): ResultCode => {
	if (reason === "target1") {
		return "GA"
	}
	if (reason === "breakeven_stop") {
		return "BE"
	}
	if (reason === "stop" && pnlCents < 0) {
		return "ST"
	}
	if (reason === "eod") {
		return "EOD"
	}
	return "???"
}

// ─── Load catalog entries with expectedResult ─────────────────────────────────

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
		all.push(...entries.filter((e) => e.expectedResult != null))
	}
	return all
}

// ─── DB query ─────────────────────────────────────────────────────────────────

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

// ─── Runner ───────────────────────────────────────────────────────────────────

const run = async () => {
	const args = process.argv.slice(2).filter((a) => !a.startsWith("--"))
	const verbose = process.argv.includes("--verbose")

	const url = process.env.DATABASE_URL
	if (!url) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)

	// Determine days: either explicit args or all days with verified data
	let days: string[] = []
	if (args.length === 1) {
		days = [args[0]!]
	} else if (args.length === 2) {
		// Load all catalog files and filter to range
		const allFiles = readdirSync(ENTRIES_DIR)
			.filter((f) => f.endsWith(".json"))
			.map((f) => f.replace(".json", ""))
			.sort()
		days = allFiles.filter((d) => d >= args[0]! && d <= args[1]!)
	} else {
		// Default: only days with closingBrickPrice (confirmed week)
		const allFiles = readdirSync(ENTRIES_DIR)
			.filter((f) => f.endsWith(".json"))
			.sort()
		for (const f of allFiles) {
			const entries = JSON.parse(
				readFileSync(resolve(ENTRIES_DIR, f), "utf-8")
			) as CatalogEntry[]
			if (entries.some((e) => e.closingBrickPrice !== null)) {
				days.push(f.replace(".json", ""))
			}
		}
	}

	const catalog = loadCatalog(days)
	if (catalog.length === 0) {
		console.log(
			"No catalog entries with expectedResult found for the given days."
		)
		process.exit(0)
	}

	// Fetch all candles covering the day range at once
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

	// Build recipe with catalog injected
	const recipe: StrategyRecipe = {
		...hawksUserCatalog,
		entry: {
			type: "user_catalog",
			config: {
				...(hawksUserCatalog.entry.type === "user_catalog"
					? hawksUserCatalog.entry.config
					: { catalog: [] }),
				catalog: catalog as UserEntry[],
			},
		},
	}

	const result = runBacktest(candles, recipe, ASSET_CONFIG)

	// Build lookup: label + day → fired trade
	const tradeByKey = new Map<string, (typeof result.trades)[0]>()
	for (const trade of result.trades) {
		const day = new Date(new Date(trade.entryTime).getTime() - 3 * 3600 * 1000)
			.toISOString()
			.slice(0, 10)
		tradeByKey.set(`${day}:${trade.label}`, trade)
	}

	// ── Print audit table ──────────────────────────────────────────────────────
	const COL = { w: (s: string, n: number) => String(s).padEnd(n).slice(0, n) }
	const pad = (s: string | number, n: number) => String(s).padStart(n)
	const sym = (ok: boolean) => (ok ? "✓" : "✗")

	console.log()
	console.log(
		"DATE        T#   BOX  DIR    ENTRY_PX  EXIT_PX  REASON            PNL       COMPUTED  EXPECTED  MATCH  CLOSE_MATCH"
	)
	console.log("─".repeat(110))

	let totalChecked = 0
	let resultMatches = 0
	let resultMismatches = 0
	let notFired = 0
	let anomalies = 0

	for (const day of days) {
		const dayEntries = catalog.filter((e) => e.date === day)
		if (dayEntries.length === 0) {
			continue
		}

		let dayHasOutput = false
		for (const entry of dayEntries) {
			const key = `${day}:${entry.label}`
			const trade = tradeByKey.get(key)

			if (!trade) {
				console.log(
					`${day}  ${COL.w(entry.label ?? "", 4)} ${pad(entry.brickIndex, 3)}  ` +
						`${COL.w(entry.direction, 5)}  ` +
						`${"—".padEnd(8)}  ${"—".padEnd(7)}  ${"NOT FIRED".padEnd(16)}  ${"—".padEnd(8)}  ` +
						`${"—".padEnd(8)}  ${COL.w(entry.expectedResult ?? "?", 8)}  ${"⊘".padEnd(5)}  —`
				)
				notFired++
				dayHasOutput = true
				continue
			}

			totalChecked++
			dayHasOutput = true

			const computed = classifyResult(trade.exitReason, trade.netPnlCents)
			const expected = entry.expectedResult ?? "?"
			const resultMatch = computed === expected

			if (computed === "???") {
				anomalies++
			}
			if (resultMatch) {
				resultMatches++
			} else {
				resultMismatches++
			}

			let closingNote = "—"
			if (entry.closingBrickPrice != null) {
				const exitPx = trade.exitPrice
				const delta = Math.abs(exitPx - entry.closingBrickPrice)
				const pct = ((delta / entry.closingBrickPrice) * 100).toFixed(2)
				closingNote = delta === 0 ? `✓ exact` : `Δ${delta} pts (${pct}%)`
			}

			const pnlStr =
				(trade.netPnlCents >= 0 ? "+" : "") +
				"R$" +
				(trade.netPnlCents / 100).toFixed(0)
			const entryPxFmt = trade.entryPrice.toLocaleString("pt-BR")
			const exitPxFmt = trade.exitPrice.toLocaleString("pt-BR")

			console.log(
				`${day}  ${COL.w(entry.label ?? "", 4)} ${pad(entry.brickIndex, 3)}  ` +
					`${COL.w(entry.direction, 5)}  ` +
					`${pad(entryPxFmt, 8)}  ${pad(exitPxFmt, 7)}  ` +
					`${COL.w(trade.exitReason, 16)}  ${pad(pnlStr, 8)}  ` +
					`${COL.w(computed, 8)}  ${COL.w(expected, 8)}  ` +
					`${sym(resultMatch)}${resultMatch ? "    " : " !!!"}  ${closingNote}`
			)

			if (verbose && !resultMatch) {
				console.log(
					`  → stopRef=${trade.stopReference}  entry=${trade.entryPrice}  ` +
						`risk=${Math.abs(trade.entryPrice - trade.stopReference)} pts`
				)
			}
		}

		if (dayHasOutput) {
			console.log("─".repeat(110))
		}
	}

	// ── Summary ────────────────────────────────────────────────────────────────
	console.log()
	console.log(
		`Result match:    ${resultMatches} / ${totalChecked}  (${((resultMatches / totalChecked) * 100).toFixed(0)}%)`
	)
	console.log(`Mismatches:      ${resultMismatches}`)
	if (anomalies > 0) {
		console.log(
			`Anomalies (???): ${anomalies}  ← stop hit but positive PnL — investigate`
		)
	}
	if (notFired > 0) {
		console.log(
			`Not fired:       ${notFired}  ← position was open on that brick`
		)
	}
	console.log(`Days audited:    ${days.length}`)

	if (!isNeonUrl(url)) {
		await (sql as ReturnType<typeof postgres>).end()
	}
}

run().catch((err) => {
	console.error(err)
	process.exit(1)
})
