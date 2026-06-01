/**
 * trace-hawks.ts
 *
 * Brick-by-brick tracer for the autonomous Hawks engine. Calls
 * processHawksCandle for every brick of a target day and dumps the state
 * transition + fire decision for each. Use this to diagnose re-arm failures:
 * which brick stalls the state machine, which gate fails, etc.
 *
 * Usage:
 *   pnpm tsx scripts/trace-hawks.ts 2026-03-19
 *   pnpm tsx scripts/trace-hawks.ts 2026-03-19 --from 10 --to 50
 *   pnpm tsx scripts/trace-hawks.ts 2026-03-19 --catalog
 *     (marks rows that are catalogued)
 */
import "dotenv/config"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"
import {
	processHawksCandle,
	createInitialHawksState,
	type HawksState,
} from "@/lib/backtest/modules/entry/hawks-triple-screen"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import type { CandleRow } from "@/types/candle"
import type { HawksTripleScreenConfig, UserEntry } from "@/types/backtest"

const ASSET_SYMBOL = "WIN"
const TICK_SIZE = 5

const fetchDayCandles = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	day: string
): Promise<CandleRow[]> => {
	const fromUtc = new Date(`${day}T03:00:00.000Z`)
	const toUtc = new Date(
		new Date(fromUtc).getTime() + 24 * 3600 * 1000
	).toISOString()
	const rows = (await sql`
		SELECT pc.timestamp, pc.open, pc.high, pc.low, pc.close,
		       pc.candle_index, pc.indicators
		FROM price_candles pc
		JOIN timeframes t ON t.id = pc.timeframe_id
		JOIN assets a ON a.id = pc.asset_id
		WHERE a.symbol = ${ASSET_SYMBOL} AND t.code = '5m'
		  AND pc.timestamp >= ${fromUtc.toISOString()}
		  AND pc.timestamp <  ${toUtc}
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

const buildDayContext = (
	candle: CandleRow,
	dayKey: string,
	indexInDay: number
) => {
	const ts = new Date(candle.timestamp)
	const brt = new Date(ts.getTime() - 3 * 3600 * 1000)
	const hh = brt.getUTCHours()
	const mm = brt.getUTCMinutes()
	return {
		dayKey,
		candleIndexInDay: indexInDay,
		brtHHMM: hh * 100 + mm,
	}
}

const brtTime = (iso: string): string => {
	const d = new Date(new Date(iso).getTime() - 3 * 3600 * 1000)
	return d.toISOString().substring(11, 16)
}

const fmtPhase = (p: HawksState["phase"]): string => {
	switch (p) {
		case "WAITING_TOPO_MAIOR":
			return "WAIT_TM"
		case "WAVE_1_DOWN":
			return "W1_DN"
		case "WAVE_2_UP":
			return "W2_UP"
		case "WAVE_1_UP":
			return "W1_UP"
		case "WAVE_2_DOWN":
			return "W2_DN"
	}
}

const fmtNum = (n: number | null, w = 7): string =>
	n === null ? "—".padStart(w) : n.toFixed(0).padStart(w)

const run = async () => {
	const argv = process.argv.slice(2)
	const day = argv.find((a) => !a.startsWith("--"))
	if (!day) {
		console.error(
			"Usage: pnpm tsx scripts/trace-hawks.ts <YYYY-MM-DD> [--from N] [--to M] [--catalog]"
		)
		process.exit(1)
	}
	const fromIdx = argv.includes("--from")
		? parseInt(argv[argv.indexOf("--from") + 1]!, 10)
		: 1
	const toIdx = argv.includes("--to")
		? parseInt(argv[argv.indexOf("--to") + 1]!, 10)
		: 999
	const showCatalog = argv.includes("--catalog")

	const url = process.env.DATABASE_URL
	if (!url) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)
	const candles = await fetchDayCandles(sql, day)
	if (candles.length === 0) {
		console.log(`No candles for ${day}`)
		process.exit(0)
	}

	let catalog: UserEntry[] = []
	if (showCatalog) {
		const catPath = resolve(
			process.cwd(),
			"data/hawks/user-entries",
			`${day}.json`
		)
		if (existsSync(catPath)) {
			catalog = JSON.parse(readFileSync(catPath, "utf-8")) as UserEntry[]
		}
	}

	if (hawksV0.entry.type !== "hawks_triple_screen") {
		throw new Error("hawksV0 preset is not hawks_triple_screen")
	}
	const config = hawksV0.entry.config as HawksTripleScreenConfig

	let state = createInitialHawksState()
	console.log()
	console.log(`Hawks state-machine trace for ${day} — ${candles.length} bricks`)
	console.log(
		"idx | brt   | dir  | O      | C      | piv  | phase   | topoMa | fundo  | maxH   | fundoMa | topo   | minL   | gateS | gateL | FIRE  | cat"
	)
	console.log("─".repeat(160))

	for (let i = 0; i < candles.length; i++) {
		const candle = candles[i]!
		const ctx = buildDayContext(candle, day, i)
		const brickIndex1 = candle.candleIndex // 1-indexed per CSV
		if (brickIndex1 < fromIdx || brickIndex1 > toIdx) {
			continue
		}

		const { state: newState, signal } = processHawksCandle(
			candle,
			state,
			ctx,
			TICK_SIZE,
			config
		)

		// Compute gate values for visibility (independent of phase)
		const indicators = candle.indicators
		const prev15Open = indicators[config.prev_15m_open_key]
		const prev15Close = indicators[config.prev_15m_close_key]
		const ema27_15 = indicators[config.ema27_15m_key]
		const ema55_15 = indicators[config.ema55_15m_key]
		const prev60Open = indicators[config.prev_60m_open_key]
		const prev60Close = indicators[config.prev_60m_close_key]
		const ema27_60 = indicators[config.ema27_60m_key]
		const ema55_60 = indicators[config.ema55_60m_key]
		const allPresent =
			typeof prev15Open === "number" &&
			typeof prev15Close === "number" &&
			typeof ema27_15 === "number" &&
			typeof ema55_15 === "number" &&
			typeof prev60Open === "number" &&
			typeof prev60Close === "number" &&
			typeof ema27_60 === "number" &&
			typeof ema55_60 === "number"
		const gateS = allPresent
			? prev15Open! < ema27_15! &&
				prev15Open! < ema55_15! &&
				prev15Close! < ema27_15! &&
				prev15Close! < ema55_15! &&
				prev60Open! < ema27_60! &&
				prev60Open! < ema55_60! &&
				prev60Close! < ema27_60! &&
				prev60Close! < ema55_60!
			: false
		const gateL = allPresent
			? prev15Open! > ema27_15! &&
				prev15Open! > ema55_15! &&
				prev15Close! > ema27_15! &&
				prev15Close! > ema55_15! &&
				prev60Open! > ema27_60! &&
				prev60Open! > ema55_60! &&
				prev60Close! > ema27_60! &&
				prev60Close! > ema55_60!
			: false

		const pivot = indicators[config.topos_fundos_key]
		const pivStr =
			typeof pivot === "number" ? pivot.toFixed(0).padStart(6) : "—".padStart(6)

		const dir =
			candle.close > candle.open
				? "BULL"
				: candle.close < candle.open
					? "BEAR"
					: "DOJI"

		const catEntry = catalog.find((c) => c.brickIndex === brickIndex1)
		const catLabel = catEntry
			? `${catEntry.label}/${catEntry.direction[0]?.toUpperCase()}`
			: ""

		const fireLabel = signal ? `**${signal.direction.toUpperCase()}**` : "  —  "

		console.log(
			`${String(brickIndex1).padStart(3)} | ${brtTime(candle.timestamp)} | ${dir} | ${candle.open.toFixed(0).padStart(6)} | ${candle.close.toFixed(0).padStart(6)} | ${pivStr} | ${fmtPhase(newState.phase).padEnd(7)} | ${fmtNum(newState.topoMaiorPrice)} | ${fmtNum(newState.fundoPrice)} | ${fmtNum(newState.maxHighSinceFundo)} | ${fmtNum(newState.fundoMaiorPrice)} | ${fmtNum(newState.topoPrice)} | ${fmtNum(newState.minLowSinceTopo)} | ${gateS ? "S" : "."}     | ${gateL ? "L" : "."}     | ${fireLabel} | ${catLabel}`
		)

		state = newState
	}
}

run().then(() => process.exit(0))
