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
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import { DuckDBInstance } from "@duckdb/node-api"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import type { CandleRow } from "@/types/candle"
import type { UserEntry, BacktestTrade } from "@/types/backtest"

// BRT is UTC-3 fixed (Brazil dropped DST in 2019). Inlined here to avoid
// pulling in @/lib/indicators/daily-anchors, which imports the drizzle
// client and that has a top-level await tsx can't transform in cjs.
const BRT_OFFSET_MS = -3 * 60 * 60 * 1000
const candleTimestampToBrtDate = (ts: Date): string =>
	new Date(ts.getTime() + BRT_OFFSET_MS).toISOString().slice(0, 10)

const ENTRIES_DIR = resolve(process.cwd(), "data/hawks/user-entries")
// Phase-5 cutover: candle data lives in R2/local Parquet via DuckDB.
// Audit reads the parquet directly to bypass the drizzle top-level-await
// that breaks tsx's cjs transform when importing the candle-store factory.
const PARQUET_PATH = resolve(
	process.cwd(),
	"data/parquet/candles/hawk_5m_win/WIN.parquet"
)
const WIN_ASSET_ID = "2d922fa1-365a-4f17-990f-27e5aa96b659"
const ASSET_CONFIG = { tickSize: 5, tickValueCents: 100 }
const DEFAULT_WINDOW = 2

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
	throw new Error(`audit: unparseable timestamp ${String(v)}`)
}

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

const fetchAnchors = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
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
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	fromDate: string,
	toDate: string
): Promise<CandleRow[]> => {
	if (!existsSync(PARQUET_PATH)) {
		throw new Error(
			`audit: Parquet not found at ${PARQUET_PATH} — run pnpm tsx scripts/export-candles-to-parquet.ts WIN hawk_5m_win`
		)
	}
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
	const anchorsByDate = await fetchAnchors(sql, fromDate, toDate)
	return rows.map((row) => {
		const indicators: Record<string, number> = {}
		for (const [key, v] of Object.entries(row)) {
			if (BASE_COL_SET.has(key)) {
				continue
			}
			if (v !== null && v !== undefined) {
				const n = toNumber(v)
				if (!Number.isNaN(n)) {
					indicators[key] = n
				}
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
		return {
			timestamp: ts,
			open: toNumber(row.open),
			high: toNumber(row.high),
			low: toNumber(row.low),
			close: toNumber(row.close),
			candleIndex:
				row.candle_index === null || row.candle_index === undefined
					? null
					: toNumber(row.candle_index),
			indicators,
		}
	})
}

const brtDate = (iso: string): string => {
	return new Date(new Date(iso).getTime() - 3 * 3600 * 1000)
		.toISOString()
		.slice(0, 10)
}

const run = async () => {
	const argv = process.argv.slice(2)
	// Flags that take a value (--flag value); strip both tokens from positionals.
	const FLAGS_WITH_VALUE = new Set([
		"--window",
		"--dump",
		"--cooldown",
		"--wave1",
		"--retrace",
	])
	const args: string[] = []
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i]!
		if (a.startsWith("--")) {
			if (FLAGS_WITH_VALUE.has(a)) {
				i++ // skip the value
			}
			continue
		}
		args.push(a)
	}
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

	const allDays = readdirSync(ENTRIES_DIR)
		.filter((f) => f.endsWith(".json"))
		.map((f) => f.replace(".json", ""))
		.sort()

	let days: string[]
	if (args.length === 1) {
		days = [args[0]!]
	} else if (args.length === 2) {
		days = allDays.filter((d) => d >= args[0]! && d <= args[1]!)
	} else {
		days = allDays
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

	// Run the AUTONOMOUS engine. CLI flags toggle quality gates without
	// editing the preset (so we can A/B compare in one script):
	//   --htf-ma-block    legacy: BLOCK on 4 HTF MAs only
	//   --sr-block        Group A: BLOCK on 4 MAs + vwap_d + ajuste
	//   --sr-favor        Group A: SCORE +1 per S/R level FAVOR
	// Aggression is tri-state. --aggression alone defaults to reversed
	// polarity (data-supported). --aggression-original flips to user's
	// original heuristic.
	const aggMode: "off" | "original" | "reversed" = argv.includes(
		"--aggression-original"
	)
		? "original"
		: argv.includes("--aggression")
			? "reversed"
			: "off"
	const flags = {
		htfMaBlock: argv.includes("--htf-ma-block"),
		srLevelBlock: argv.includes("--sr-block"),
		srLevelFavor: argv.includes("--sr-favor"),
		keltnerOuterBlock: argv.includes("--keltner-block"),
		keltnerInnerPenalty: argv.includes("--keltner-penalty"),
		volumeScore: argv.includes("--volume"),
		...(aggMode !== "off" ? { aggressionMode: aggMode } : {}),
	}
	const anyFlag = Object.values(flags).some((v) => v && v !== "off")

	// Engine-knob overrides — let the audit sweep state-machine params without
	// editing the preset. Read each as an optional int from the corresponding
	// --flag value; undefined → use the preset default.
	const intArg = (name: string): number | undefined => {
		const i = argv.findIndex((a) => a === name)
		if (i < 0 || !argv[i + 1]) {
			return undefined
		}
		const n = parseInt(argv[i + 1]!, 10)
		return Number.isFinite(n) ? n : undefined
	}
	const cooldownOverride = intArg("--cooldown")
	const wave1Override = intArg("--wave1")
	const retraceOverride = intArg("--retrace")
	const knobOverrides: Record<string, number | boolean> = {}
	if (cooldownOverride !== undefined) {
		knobOverrides.fireCooldownBricks = cooldownOverride
	}
	if (wave1Override !== undefined) {
		knobOverrides.wave1MinBricks = wave1Override
	}
	if (retraceOverride !== undefined) {
		knobOverrides.retracementMinBricks = retraceOverride
	}
	const statefulHtf = process.argv.includes("--stateful-htf")
	if (statefulHtf) {
		knobOverrides.useStatefulHtfGate = true
	}
	const anyKnob = Object.keys(knobOverrides).length > 0

	const recipe =
		anyFlag || anyKnob
			? ({
					...hawksV0,
					entry: {
						...hawksV0.entry,
						config: {
							...(hawksV0.entry as { config: Record<string, unknown> }).config,
							...knobOverrides,
							...(anyFlag ? { qualityGates: flags } : {}),
						},
					},
				} as typeof hawksV0)
			: hawksV0
	if (anyFlag) {
		console.log(
			`[audit] gates ENABLED: ${Object.entries(flags)
				.filter(([, v]) => v)
				.map(([k]) => k)
				.join(", ")}`
		)
	}
	if (anyKnob) {
		console.log(`[audit] knob overrides: ${JSON.stringify(knobOverrides)}`)
	}
	const result = runBacktest(candles, recipe, ASSET_CONFIG)

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

	// ── Tier breakdown — FAVOR-as-tier evaluation ──────────────────────────
	const matchedTrades: DecoratedTrade[] = []
	for (const trades of tradesByDay.values()) {
		for (const t of trades) {
			if (claimed.has(t.id)) {
				matchedTrades.push(t)
			}
		}
	}

	const tierCounts = (rows: DecoratedTrade[]) => {
		const counts: Record<string, number> = {
			"AAA": 0,
			"AA": 0,
			"A": 0,
			"B": 0,
			"—": 0,
		}
		for (const r of rows) {
			const t = r.quality?.tier ?? "—"
			counts[t] = (counts[t] ?? 0) + 1
		}
		return counts
	}

	const matchedTiers = tierCounts(matchedTrades)
	const extraTiers = tierCounts(extras.map((e) => e.trade))
	const pct = (n: number, total: number) =>
		total ? `${((n / total) * 100).toFixed(1)}%` : "—"

	console.log("─".repeat(70))
	console.log()
	console.log(
		"Quality tier breakdown (FAVOR multipliers behind trade ≤ 3 bricks)"
	)
	console.log("  Tier   matched (good)            extras (noise)")
	for (const tier of ["AAA", "AA", "A", "B"] as const) {
		const m = matchedTiers[tier] ?? 0
		const x = extraTiers[tier] ?? 0
		console.log(
			`  ${tier.padEnd(5)}  ${String(m).padStart(3)} (${pct(m, matchedTrades.length).padStart(6)})        ` +
				`${String(x).padStart(3)} (${pct(x, extras.length).padStart(6)})`
		)
	}

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

	// Optional dump for downstream analysis: --dump <path> writes JSON with
	// the full trade list, claimed status, and per-catalog-entry match label.
	const dumpIdx = argv.findIndex((a) => a === "--dump")
	if (dumpIdx >= 0 && argv[dumpIdx + 1]) {
		const dumpPath = argv[dumpIdx + 1]!
		const matched: Array<{
			day: string
			trade: DecoratedTrade
			matchLabel: string
		}> = []
		const matchedById = new Map<number, DecoratedTrade>()
		for (const t of tradesByDay.values()) {
			for (const tr of t) {
				if (claimed.has(tr.id)) {
					matchedById.set(tr.id, tr)
				}
			}
		}
		const out = {
			matchWindow,
			summary: { exact, near, dirmiss, miss, extras: extras.length },
			matched: [...matchedById.values()].map((t) => ({
				day: brtDate(t.entryTime),
				direction: t.direction,
				entryBrickIndex: t.entryBrickIndex,
				entryPrice: t.entryPrice,
				exitPrice: t.exitPrice,
				exitReason: t.exitReason,
				quality: t.quality,
				rMultiple: t.rMultiple,
			})),
			extras: extras.map(({ day, trade }) => ({
				day,
				direction: trade.direction,
				entryBrickIndex: trade.entryBrickIndex,
				entryPrice: trade.entryPrice,
				exitPrice: trade.exitPrice,
				exitReason: trade.exitReason,
				quality: trade.quality,
				rMultiple: trade.rMultiple,
			})),
		}
		writeFileSync(dumpPath, JSON.stringify(out, null, 2))
		console.log(`Dumped to ${dumpPath}`)
		void matched
	}
}

run().then(() => process.exit(0))
