/**
 * audit-walker-ab.ts — single-process A/B comparison: v0.8 stateless HTF gate
 * vs v0.9 stateful walker, over the catalog date range.
 *
 * Reports per-variant:
 *   - reproduction counts (EXACT / NEAR / MISS)
 *   - net PnL (cents → reais)
 *   - trade-count, win-rate, average R-multiple
 *   - profit factor (gross wins / gross losses)
 * Cross-variant:
 *   - per-day net-PnL delta
 *   - the walker-ONLY extras (engine trades present in walker run, absent in
 *     baseline run): grouped by day with timestamps, prices, and exit reason
 *   - sample of 15 of those extras with surrounding catalog context
 *
 * Reads the catalog from `data/hawks/user-entries/*.json` and candles from
 * `data/parquet/candles/hawk_5m_win/WIN.parquet` (same as audit-parallel.ts).
 *
 * Usage:
 *   pnpm tsx scripts/audit-walker-ab.ts
 *   pnpm tsx scripts/audit-walker-ab.ts 2026-03-02 2026-05-29
 *   pnpm tsx scripts/audit-walker-ab.ts --window 3
 */
import "dotenv/config"
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import postgres from "postgres"
import { DuckDBInstance } from "@duckdb/node-api"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import type { CandleRow } from "@/types/candle"
import type {
	UserEntry,
	BacktestTrade,
	HawksTripleScreenConfig,
} from "@/types/backtest"

const ASSET_CONFIG = { tickSize: 5, tickValueCents: 100 }
const WIN_ASSET_ID = "2d922fa1-365a-4f17-990f-27e5aa96b659"
const PARQUET_PATH = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_5m_win/WIN.parquet"
)
const ENTRIES_DIR = resolve(process.cwd(), "data/hawks/user-entries")
const OUT_PATH = resolve(
	process.cwd(),
	"docs/scans/2026-06-13-walker-ab-comparison.md"
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
			candleIndex: ci === null || ci === undefined ? null : toNumber(ci),
			indicators,
		}
	})
}

interface VariantStats {
	label: string
	exact: number
	near: number
	miss: number
	extras: number
	tradeCount: number
	winCount: number
	lossCount: number
	beCount: number
	netPnlCents: number
	grossWinsCents: number
	grossLossesCents: number
	winRate: number
	profitFactor: number
	tradesByDay: Map<string, Array<BacktestTrade & { brickIndex: number }>>
}

const runVariant = (
	label: string,
	candles: CandleRow[],
	useStateful: boolean,
	catalog: CatalogEntry[],
	matchWindow: number
): VariantStats => {
	const recipe = {
		...hawksV0,
		entry: {
			type: "hawks_triple_screen" as const,
			config: {
				...(hawksV0.entry.type === "hawks_triple_screen"
					? hawksV0.entry.config
					: ({} as HawksTripleScreenConfig)),
				useStatefulHtfGate: useStateful,
			},
		},
	}
	const result = runBacktest(candles, recipe, ASSET_CONFIG)

	const tsToCandleIndex = new Map<string, number>()
	for (const c of candles) {
		if (c.candleIndex !== null) {
			tsToCandleIndex.set(c.timestamp, c.candleIndex)
		}
	}

	const tradesByDay = new Map<
		string,
		Array<BacktestTrade & { brickIndex: number }>
	>()
	for (const trade of result.trades) {
		const day = brtDate(trade.entryTime)
		const brickIndex = tsToCandleIndex.get(trade.entryTime) ?? -1
		const arr = tradesByDay.get(day) ?? []
		arr.push({ ...trade, brickIndex })
		tradesByDay.set(day, arr)
	}

	const matchedEngineTrades = new Set<string>()
	let exact = 0
	let near = 0
	let miss = 0
	for (const cat of catalog) {
		const day = cat.date
		const dayTrades = tradesByDay.get(day) ?? []
		let best: {
			trade: BacktestTrade & { brickIndex: number }
			delta: number
		} | null = null
		for (const t of dayTrades) {
			if (t.direction !== cat.direction) {
				continue
			}
			if (matchedEngineTrades.has(t.entryTime)) {
				continue
			}
			const delta = Math.abs(t.brickIndex + 1 - cat.brickIndex)
			if (delta > matchWindow) {
				continue
			}
			if (!best || delta < best.delta) {
				best = { trade: t, delta }
			}
		}
		if (!best) {
			miss++
		} else {
			matchedEngineTrades.add(best.trade.entryTime)
			if (best.delta === 0) {
				exact++
			} else {
				near++
			}
		}
	}

	let tradeCount = 0
	let winCount = 0
	let lossCount = 0
	let beCount = 0
	let netPnlCents = 0
	let grossWinsCents = 0
	let grossLossesCents = 0
	for (const dayTrades of tradesByDay.values()) {
		for (const t of dayTrades) {
			tradeCount++
			netPnlCents += t.netPnlCents
			if (t.netPnlCents > 0) {
				winCount++
				grossWinsCents += t.netPnlCents
			} else if (t.netPnlCents < 0) {
				lossCount++
				grossLossesCents += -t.netPnlCents
			} else {
				beCount++
			}
		}
	}
	const winRate = tradeCount === 0 ? 0 : winCount / tradeCount
	const profitFactor =
		grossLossesCents === 0
			? grossWinsCents > 0
				? Infinity
				: 0
			: grossWinsCents / grossLossesCents
	const extras = tradeCount - matchedEngineTrades.size

	return {
		label,
		exact,
		near,
		miss,
		extras,
		tradeCount,
		winCount,
		lossCount,
		beCount,
		netPnlCents,
		grossWinsCents,
		grossLossesCents,
		winRate,
		profitFactor,
		tradesByDay,
	}
}

const fmtR = (cents: number): string =>
	`R$ ${(cents / 100).toLocaleString("en-US", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	})}`

const fmtPct = (n: number): string => `${(n * 100).toFixed(1)}%`

const main = async (): Promise<void> => {
	const argv = process.argv.slice(2)
	const dates = argv.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
	const fromDate = dates[0] ?? "2026-03-02"
	const toDate = dates[1] ?? "2026-05-29"
	const windowArgIdx = argv.indexOf("--window")
	const matchWindow =
		windowArgIdx >= 0 ? Math.max(0, Number(argv[windowArgIdx + 1] ?? 2)) : 2

	console.log(`Range: ${fromDate} → ${toDate}, match window ±${matchWindow}`)
	console.log("Loading candles + catalog…")
	const catalog = loadCatalog().filter(
		(c) => c.date >= fromDate && c.date <= toDate
	)
	const candles = await fetchCandles(fromDate, toDate)
	console.log(`Candles: ${candles.length}, catalog entries: ${catalog.length}`)
	console.log()

	const baseline = runVariant(
		"baseline (stateless)",
		candles,
		false,
		catalog,
		matchWindow
	)
	const walker = runVariant(
		"walker (stateful)",
		candles,
		true,
		catalog,
		matchWindow
	)

	const printVariant = (v: VariantStats): void => {
		console.log(`── ${v.label} ──`)
		console.log(`  EXACT / NEAR / MISS: ${v.exact} / ${v.near} / ${v.miss}`)
		console.log(
			`  Reproduction: ${fmtPct((v.exact + v.near) / catalog.length)}`
		)
		console.log(`  Trade count: ${v.tradeCount}  (extras: ${v.extras})`)
		console.log(
			`  Wins / Losses / BE: ${v.winCount} / ${v.lossCount} / ${v.beCount}`
		)
		console.log(`  Win rate: ${fmtPct(v.winRate)}`)
		console.log(`  Net PnL: ${fmtR(v.netPnlCents)}`)
		console.log(`  Gross wins: ${fmtR(v.grossWinsCents)}`)
		console.log(`  Gross losses: ${fmtR(v.grossLossesCents)}`)
		console.log(
			`  Profit factor: ${v.profitFactor === Infinity ? "∞" : v.profitFactor.toFixed(2)}`
		)
		console.log()
	}
	printVariant(baseline)
	printVariant(walker)

	console.log("── Δ walker − baseline ──")
	console.log(
		`  EXACT: ${walker.exact - baseline.exact >= 0 ? "+" : ""}${walker.exact - baseline.exact}`
	)
	console.log(
		`  NEAR:  ${walker.near - baseline.near >= 0 ? "+" : ""}${walker.near - baseline.near}`
	)
	console.log(
		`  MISS:  ${walker.miss - baseline.miss >= 0 ? "+" : ""}${walker.miss - baseline.miss}`
	)
	console.log(
		`  Extras: ${walker.extras - baseline.extras >= 0 ? "+" : ""}${walker.extras - baseline.extras}`
	)
	console.log(
		`  Reproduction: ${(((walker.exact + walker.near) / catalog.length - (baseline.exact + baseline.near) / catalog.length) * 100).toFixed(1)}pp`
	)
	console.log(
		`  Net PnL:    ${walker.netPnlCents - baseline.netPnlCents >= 0 ? "+" : ""}${fmtR(walker.netPnlCents - baseline.netPnlCents)}`
	)
	console.log(
		`  Trade count: ${walker.tradeCount - baseline.tradeCount >= 0 ? "+" : ""}${walker.tradeCount - baseline.tradeCount}`
	)

	// ── walker-only extras ───────────────────────────────────────────────
	// Build a set of baseline entry-timestamps, then any walker trade whose
	// entryTime is NOT in that set is "new in walker."
	const baselineEntryTs = new Set<string>()
	for (const dayTrades of baseline.tradesByDay.values()) {
		for (const t of dayTrades) {
			baselineEntryTs.add(t.entryTime)
		}
	}
	const walkerOnly: Array<{
		day: string
		trade: BacktestTrade & { brickIndex: number }
	}> = []
	for (const [day, dayTrades] of walker.tradesByDay.entries()) {
		for (const t of dayTrades) {
			if (!baselineEntryTs.has(t.entryTime)) {
				walkerOnly.push({ day, trade: t })
			}
		}
	}
	walkerOnly.sort((a, b) => (a.trade.entryTime < b.trade.entryTime ? -1 : 1))

	let walkerOnlyWins = 0
	let walkerOnlyLosses = 0
	let walkerOnlyBE = 0
	let walkerOnlyPnl = 0
	for (const { trade } of walkerOnly) {
		walkerOnlyPnl += trade.netPnlCents
		if (trade.netPnlCents > 0) {
			walkerOnlyWins++
		} else if (trade.netPnlCents < 0) {
			walkerOnlyLosses++
		} else {
			walkerOnlyBE++
		}
	}

	console.log()
	console.log(
		`── Walker-only trades (in walker, not in baseline): ${walkerOnly.length} ──`
	)
	console.log(
		`  Wins / Losses / BE: ${walkerOnlyWins} / ${walkerOnlyLosses} / ${walkerOnlyBE}`
	)
	console.log(
		`  Win rate: ${walkerOnly.length > 0 ? fmtPct(walkerOnlyWins / walkerOnly.length) : "—"}`
	)
	console.log(`  Net PnL (this slice): ${fmtR(walkerOnlyPnl)}`)

	// Catalog index for cross-check: was any walker-only trade actually
	// matched against a catalog entry?
	const catalogTsByDay = new Map<string, CatalogEntry[]>()
	for (const c of catalog) {
		const arr = catalogTsByDay.get(c.date) ?? []
		arr.push(c)
		catalogTsByDay.set(c.date, arr)
	}

	// ── markdown report ──────────────────────────────────────────────────
	const lines: string[] = []
	lines.push("# Hawks v0.9 Walker — A/B vs v0.8 Baseline")
	lines.push("")
	lines.push(`Range: **${fromDate} → ${toDate}**, match window ±${matchWindow}`)
	lines.push(`Candles: ${candles.length}, catalog entries: ${catalog.length}`)
	lines.push("")
	lines.push("## Reproduction summary")
	lines.push("")
	lines.push("| Metric | Baseline (stateless) | Walker (stateful) | Δ |")
	lines.push("| ------ | -------------------: | ----------------: | -: |")
	lines.push(
		`| EXACT (brick + dir) | ${baseline.exact} | ${walker.exact} | ${walker.exact - baseline.exact >= 0 ? "+" : ""}${walker.exact - baseline.exact} |`
	)
	lines.push(
		`| NEAR (±${matchWindow}, same dir) | ${baseline.near} | ${walker.near} | ${walker.near - baseline.near >= 0 ? "+" : ""}${walker.near - baseline.near} |`
	)
	lines.push(
		`| MISS | ${baseline.miss} | ${walker.miss} | ${walker.miss - baseline.miss >= 0 ? "+" : ""}${walker.miss - baseline.miss} |`
	)
	lines.push(
		`| Reproduction rate | ${fmtPct((baseline.exact + baseline.near) / catalog.length)} | ${fmtPct((walker.exact + walker.near) / catalog.length)} | ${(((walker.exact + walker.near - (baseline.exact + baseline.near)) / catalog.length) * 100).toFixed(1)}pp |`
	)
	lines.push(
		`| EXTRAS (engine off-catalog) | ${baseline.extras} | ${walker.extras} | ${walker.extras - baseline.extras >= 0 ? "+" : ""}${walker.extras - baseline.extras} |`
	)
	lines.push("")
	lines.push("## PnL & outcome")
	lines.push("")
	lines.push("| Metric | Baseline | Walker | Δ |")
	lines.push("| ------ | -------: | -----: | -: |")
	lines.push(
		`| Trade count | ${baseline.tradeCount} | ${walker.tradeCount} | ${walker.tradeCount - baseline.tradeCount >= 0 ? "+" : ""}${walker.tradeCount - baseline.tradeCount} |`
	)
	lines.push(
		`| Wins / Losses / BE | ${baseline.winCount} / ${baseline.lossCount} / ${baseline.beCount} | ${walker.winCount} / ${walker.lossCount} / ${walker.beCount} | — |`
	)
	lines.push(
		`| Win rate | ${fmtPct(baseline.winRate)} | ${fmtPct(walker.winRate)} | ${((walker.winRate - baseline.winRate) * 100).toFixed(1)}pp |`
	)
	lines.push(
		`| Net PnL | ${fmtR(baseline.netPnlCents)} | ${fmtR(walker.netPnlCents)} | ${walker.netPnlCents - baseline.netPnlCents >= 0 ? "+" : ""}${fmtR(walker.netPnlCents - baseline.netPnlCents)} |`
	)
	lines.push(
		`| Gross wins | ${fmtR(baseline.grossWinsCents)} | ${fmtR(walker.grossWinsCents)} | — |`
	)
	lines.push(
		`| Gross losses | ${fmtR(baseline.grossLossesCents)} | ${fmtR(walker.grossLossesCents)} | — |`
	)
	lines.push(
		`| Profit factor | ${baseline.profitFactor === Infinity ? "∞" : baseline.profitFactor.toFixed(2)} | ${walker.profitFactor === Infinity ? "∞" : walker.profitFactor.toFixed(2)} | — |`
	)
	lines.push("")
	lines.push("## Walker-only trades")
	lines.push("")
	lines.push(
		`Trades present in walker variant but absent in baseline (i.e. the new behavior the v0.9 walker enables):`
	)
	lines.push("")
	lines.push(`- Count: **${walkerOnly.length}**`)
	lines.push(
		`- Wins / Losses / BE: **${walkerOnlyWins} / ${walkerOnlyLosses} / ${walkerOnlyBE}**`
	)
	lines.push(
		`- Win rate on this slice: **${walkerOnly.length > 0 ? fmtPct(walkerOnlyWins / walkerOnly.length) : "—"}**`
	)
	lines.push(`- Net PnL on this slice: **${fmtR(walkerOnlyPnl)}**`)
	lines.push("")
	lines.push("### Sample (first 15 walker-only trades, with catalog context)")
	lines.push("")
	lines.push(
		"| Day | Brick | Dir | Entry | Exit | Result | Catalog same-day same-dir? |"
	)
	lines.push(
		"| --- | ----: | --- | ----: | ----: | ------ | -------------------------- |"
	)
	for (const { day, trade } of walkerOnly.slice(0, 15)) {
		const dayCats = catalogTsByDay.get(day) ?? []
		const matchingCat = dayCats.filter((c) => c.direction === trade.direction)
		const catRefs =
			matchingCat.length > 0
				? matchingCat
						.map(
							(c) =>
								`T${c.tradeNumber ?? "?"}@${c.brickIndex}${Math.abs(c.brickIndex - (trade.brickIndex + 1)) <= matchWindow ? "*" : ""}`
						)
						.join(", ")
				: "(none)"
		const reason =
			trade.netPnlCents > 0 ? "WIN" : trade.netPnlCents < 0 ? "LOSS" : "BE"
		lines.push(
			`| ${day} | ${trade.brickIndex + 1} | ${trade.direction} | ${trade.entryPrice.toFixed(2)} | ${trade.exitPrice.toFixed(2)} | ${reason} | ${catRefs} |`
		)
	}
	lines.push("")
	lines.push(
		"*Asterisk* = catalog entry within ±${matchWindow} bricks of the walker-only trade (likely a near-miss the baseline blocked).".replace(
			"${matchWindow}",
			String(matchWindow)
		)
	)
	lines.push("")
	lines.push("### All walker-only trades, grouped by day")
	lines.push("")
	const byDay = new Map<string, typeof walkerOnly>()
	for (const w of walkerOnly) {
		const arr = byDay.get(w.day) ?? []
		arr.push(w)
		byDay.set(w.day, arr)
	}
	const sortedDays = [...byDay.keys()].sort()
	for (const day of sortedDays) {
		const list = byDay.get(day)!
		const dayPnl = list.reduce((s, x) => s + x.trade.netPnlCents, 0)
		const dayWins = list.filter((x) => x.trade.netPnlCents > 0).length
		const dayLosses = list.filter((x) => x.trade.netPnlCents < 0).length
		const dayBE = list.filter((x) => x.trade.netPnlCents === 0).length
		lines.push(
			`- **${day}** — ${list.length} trade(s), W/L/BE = ${dayWins}/${dayLosses}/${dayBE}, day PnL ${fmtR(dayPnl)}`
		)
		for (const { trade } of list) {
			const reason =
				trade.netPnlCents > 0 ? "WIN " : trade.netPnlCents < 0 ? "LOSS" : "BE  "
			lines.push(
				`  - brick ${String(trade.brickIndex + 1).padStart(3)} ${trade.direction.padEnd(5)} entry ${trade.entryPrice.toFixed(2)} exit ${trade.exitPrice.toFixed(2)} (${reason}, ${fmtR(trade.netPnlCents)}, ${trade.exitReason})`
			)
		}
	}
	lines.push("")

	writeFileSync(OUT_PATH, lines.join("\n"))
	console.log()
	console.log(`Wrote ${OUT_PATH}`)
	process.exit(0)
}

void main()
