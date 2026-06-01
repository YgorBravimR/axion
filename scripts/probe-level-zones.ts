/**
 * probe-level-zones.ts
 *
 * Classify every catalog fire and every autonomous-engine EXTRA into
 * BLOCK / FAVOR / NEUTRAL zones for each support/resistance level.
 *
 * Per the canonical rule (from Ygor):
 *   For SHORT: favorable = down. Level > entry → BEHIND (favorable side).
 *   For LONG:  favorable = up.   Level < entry → BEHIND (favorable side).
 *
 *   signedDelta = direction === "short" ? (level - entry) : (entry - level)
 *     positive ⇒ level is BEHIND (launched-from / cushion)
 *     negative ⇒ level is AHEAD  (blocks the move before BE)
 *
 *   if -2*b <= signedDelta < 0  → BLOCK  (level ahead, within BE reach)
 *   if  0 <  signedDelta <= 3*b → FAVOR  (level behind, within "launch" range)
 *   else                         → NEUTRAL
 *
 * b = brick size in points (dynamic, per brick).
 *
 * Levels probed (all read from price_candles.indicators JSONB on the entry brick):
 *   vwap_d_5m, vwap_m_5m, vwap_s_5m, ajuste_d1,
 *   mme27_15m, mme55_15m, mme27_60m, mme55_60m
 *
 * Usage:
 *   pnpm tsx scripts/probe-level-zones.ts
 *   pnpm tsx scripts/probe-level-zones.ts --verbose
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

const LEVEL_KEYS = [
	"vwap_d_5m",
	"vwap_m_5m",
	"vwap_s_5m",
	"ajuste_d1",
	"mme27_15m",
	"mme55_15m",
	"mme27_60m",
	"mme55_60m",
] as const
type LevelKey = (typeof LEVEL_KEYS)[number]

type Zone = "BLOCK" | "FAVOR" | "NEUTRAL" | "NULL"

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

const classify = (
	entry: number,
	level: number | null | undefined,
	direction: "long" | "short",
	brickSize: number
): { zone: Zone; signedDelta: number | null } => {
	if (level === null || level === undefined || !Number.isFinite(level)) {
		return { zone: "NULL", signedDelta: null }
	}
	// Sign convention: positive = level behind trade (favorable side, launched from),
	// negative = level ahead of trade (adverse side, blocking move).
	const signedDelta = direction === "short" ? level - entry : entry - level
	if (signedDelta < 0 && signedDelta >= -2 * brickSize) {
		return { zone: "BLOCK", signedDelta }
	}
	if (signedDelta > 0 && signedDelta <= 3 * brickSize) {
		return { zone: "FAVOR", signedDelta }
	}
	return { zone: "NEUTRAL", signedDelta }
}

interface FireRow {
	source: "CATALOG" | "EXTRA"
	day: string
	label: string
	direction: "long" | "short"
	entry: number
	brickSize: number
	expectedResult?: string | null
	zones: Record<LevelKey, Zone>
	levelValues: Record<LevelKey, number | null>
}

const run = async () => {
	const verbose = process.argv.includes("--verbose")
	const url = process.env.DATABASE_URL
	if (!url) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)

	const catalog = loadCatalog()
	const days = [...new Set(catalog.map((c) => c.date))].sort()
	if (days.length === 0) {
		console.log("No catalog entries.")
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
		const entryPrice = entry.closingBrickPrice ?? candle.close
		const brickSize = Math.abs(candle.close - candle.open) || 100
		const zones: Record<LevelKey, Zone> = {} as Record<LevelKey, Zone>
		const levelValues: Record<LevelKey, number | null> = {} as Record<
			LevelKey,
			number | null
		>
		for (const key of LEVEL_KEYS) {
			const raw = candle.indicators?.[key]
			const lvl = raw === undefined || raw === null ? null : Number(raw)
			levelValues[key] = lvl
			zones[key] = classify(entryPrice, lvl, entry.direction, brickSize).zone
		}
		fires.push({
			source: "CATALOG",
			day: entry.date,
			label: entry.label ?? "",
			direction: entry.direction,
			entry: entryPrice,
			brickSize,
			expectedResult: entry.expectedResult ?? null,
			zones,
			levelValues,
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
			if (d > WINDOW) {
				continue
			}
			if (t.direction !== ce.direction) {
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

	for (const [day, trades] of tradesByDay) {
		for (const trade of trades) {
			if (claimed.has(trade.id)) {
				continue
			}
			const candle = tsToCandle.get(trade.entryTime)
			if (!candle) {
				continue
			}
			const brickSize = Math.abs(candle.close - candle.open) || 100
			const zones: Record<LevelKey, Zone> = {} as Record<LevelKey, Zone>
			const levelValues: Record<LevelKey, number | null> = {} as Record<
				LevelKey,
				number | null
			>
			for (const key of LEVEL_KEYS) {
				const raw = candle.indicators?.[key]
				const lvl = raw === undefined || raw === null ? null : Number(raw)
				levelValues[key] = lvl
				zones[key] = classify(
					trade.entryPrice,
					lvl,
					trade.direction,
					brickSize
				).zone
			}
			fires.push({
				source: "EXTRA",
				day,
				label: `bx${trade.entryBrickIndex}`,
				direction: trade.direction,
				entry: trade.entryPrice,
				brickSize,
				expectedResult: trade.exitReason,
				zones,
				levelValues,
			})
		}
	}

	if (verbose) {
		console.log()
		const hdrLevels = LEVEL_KEYS.map((k) => k.padEnd(10)).join(" ")
		console.log(
			`SRC      DATE        T#    DIR    ENTRY     B    EXP  ${hdrLevels}`
		)
		console.log("─".repeat(60 + LEVEL_KEYS.length * 11))
		for (const f of fires) {
			const zoneCells = LEVEL_KEYS.map((k) => f.zones[k].padEnd(10)).join(" ")
			console.log(
				`${f.source.padEnd(7)}  ${f.day}  ${f.label.padEnd(4)} ${f.direction.padEnd(6)} ` +
					`${String(f.entry).padStart(7)}  ${String(f.brickSize).padStart(3)}  ` +
					`${(f.expectedResult ?? "-").padEnd(3)}  ${zoneCells}`
			)
		}
	}

	const catFires = fires.filter((f) => f.source === "CATALOG")
	const extras = fires.filter((f) => f.source === "EXTRA")

	console.log()
	console.log(`Total catalog fires: ${catFires.length}`)
	console.log(`Total EXTRAS:        ${extras.length}`)
	console.log()
	console.log(
		"Per-indicator zone breakdown".padEnd(18) +
			"CATALOG (good fires)".padEnd(36) +
			"EXTRAS (presumed noise)"
	)
	console.log(
		"".padEnd(18) +
			"BLOCK  FAVOR  NEUTRAL  NULL".padEnd(36) +
			"BLOCK  FAVOR  NEUTRAL  NULL"
	)
	console.log("─".repeat(90))
	for (const key of LEVEL_KEYS) {
		const cnt = (rows: FireRow[], z: Zone) =>
			rows.filter((r) => r.zones[key] === z).length
		const catCells = [
			cnt(catFires, "BLOCK"),
			cnt(catFires, "FAVOR"),
			cnt(catFires, "NEUTRAL"),
			cnt(catFires, "NULL"),
		]
		const extraCells = [
			cnt(extras, "BLOCK"),
			cnt(extras, "FAVOR"),
			cnt(extras, "NEUTRAL"),
			cnt(extras, "NULL"),
		]
		const fmt = (n: number) => String(n).padStart(5)
		console.log(
			`${key.padEnd(18)}${catCells.map(fmt).join("  ")}    ` +
				`${extraCells.map(fmt).join("  ")}`
		)
	}

	console.log()
	console.log(
		"BLOCK gate evaluation (gate kills any fire where ANY level is BLOCK)"
	)
	console.log("─".repeat(90))
	for (const key of LEVEL_KEYS) {
		const catBlocked = catFires.filter((f) => f.zones[key] === "BLOCK").length
		const extraBlocked = extras.filter((f) => f.zones[key] === "BLOCK").length
		const catRate = catFires.length
			? ((catBlocked / catFires.length) * 100).toFixed(1)
			: "0.0"
		const extraRate = extras.length
			? ((extraBlocked / extras.length) * 100).toFixed(1)
			: "0.0"
		console.log(
			`${key.padEnd(18)}catalog killed: ${String(catBlocked).padStart(3)}/${catFires.length} (${catRate}%)    ` +
				`extras killed: ${String(extraBlocked).padStart(3)}/${extras.length} (${extraRate}%)`
		)
	}

	console.log()
	console.log(
		"FAVOR multiplier predictiveness (FAVOR rate on catalog vs extras)"
	)
	console.log("─".repeat(90))
	for (const key of LEVEL_KEYS) {
		const catFavor = catFires.filter((f) => f.zones[key] === "FAVOR").length
		const extraFavor = extras.filter((f) => f.zones[key] === "FAVOR").length
		const catRate = catFires.length
			? ((catFavor / catFires.length) * 100).toFixed(1)
			: "0.0"
		const extraRate = extras.length
			? ((extraFavor / extras.length) * 100).toFixed(1)
			: "0.0"
		console.log(
			`${key.padEnd(18)}catalog FAVOR: ${String(catFavor).padStart(3)}/${catFires.length} (${catRate}%)    ` +
				`extras FAVOR: ${String(extraFavor).padStart(3)}/${extras.length} (${extraRate}%)`
		)
	}

	console.log()
	console.log("Aggregate BLOCK gate (ANY level in BLOCK ⇒ reject fire)")
	const catAnyBlock = catFires.filter((f) =>
		LEVEL_KEYS.some((k) => f.zones[k] === "BLOCK")
	).length
	const extraAnyBlock = extras.filter((f) =>
		LEVEL_KEYS.some((k) => f.zones[k] === "BLOCK")
	).length
	console.log(
		`  Catalog fires that would be REJECTED: ${catAnyBlock}/${catFires.length} ` +
			`(${catFires.length ? ((catAnyBlock / catFires.length) * 100).toFixed(1) : "0.0"}%)  ← false negatives`
	)
	console.log(
		`  EXTRAS that would be REJECTED:        ${extraAnyBlock}/${extras.length} ` +
			`(${extras.length ? ((extraAnyBlock / extras.length) * 100).toFixed(1) : "0.0"}%)  ← true negatives`
	)
}

run().then(() => process.exit(0))
