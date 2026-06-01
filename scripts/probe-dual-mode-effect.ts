/**
 * probe-dual-mode-effect.ts
 *
 * Sanity check — verify that dual-mode rules reduce trade count in block mode.
 *
 * For each of the 5 dual-mode rule modes, run a backtest with:
 *   - mode = "off"   (baseline, no blocking)
 *   - mode = "block" (blocking enabled)
 *
 * Expected: trade count should be <= in block mode (blocking gates entries).
 * If any rule shows trade count INCREASING in block mode, it's a bug.
 *
 * Usage:
 *   pnpm tsx scripts/probe-dual-mode-effect.ts
 *   pnpm tsx scripts/probe-dual-mode-effect.ts --from 2026-04-01 --to 2026-05-30
 *
 * Exit code 0 if all checks pass, 1 if any blocking rule increases trade count.
 */
import "dotenv/config"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import { getQualityPresetBundle } from "@/lib/backtest/presets/hawks-quality-presets"
import type {
	StrategyRecipe,
	AssetConfig,
	HawksTripleScreenConfig,
	QualityGatesConfig,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

const ASSET_SYMBOL = "WIN"
const ASSET_CONFIG: AssetConfig = {
	tickSize: 5,
	tickValueCents: 100,
} as AssetConfig
const DEFAULT_FROM = "2026-04-01"
const DEFAULT_TO = "2026-05-30"

const fetchCandles = async (
	sql: ReturnType<typeof neon> | ReturnType<typeof postgres>,
	fromDate: string,
	toDate: string
): Promise<CandleRow[]> => {
	const fromUtc = new Date(`${fromDate}T03:00:00.000Z`)
	const toUtc = new Date(`${toDate}T23:00:00.000Z`)
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
	`) as Array<{
		timestamp: string | Date
		open: string | number
		high: string | number
		low: string | number
		close: string | number
		candle_index: number | null
		indicators: Record<string, unknown> | null
	}>
	return rows.map((r) => ({
		timestamp:
			typeof r.timestamp === "string" ? new Date(r.timestamp) : r.timestamp,
		open: Number(r.open),
		high: Number(r.high),
		low: Number(r.low),
		close: Number(r.close),
		candleIndex: r.candle_index,
		indicators: r.indicators ?? {},
	}))
}

// ── Mutation helpers ────────────────────────────────────────────────────────

const mutateHawks = (
	recipe: StrategyRecipe,
	mutator: (_cfg: HawksTripleScreenConfig) => HawksTripleScreenConfig
): StrategyRecipe => {
	if (recipe.entry.type !== "hawks_triple_screen") {
		return recipe
	}
	return {
		...recipe,
		entry: {
			type: "hawks_triple_screen",
			config: mutator(recipe.entry.config),
		},
	}
}

const mutateGates = (
	recipe: StrategyRecipe,
	mutator: (_qg: QualityGatesConfig) => QualityGatesConfig
): StrategyRecipe =>
	mutateHawks(recipe, (cfg) => ({
		...cfg,
		qualityGates: mutator(cfg.qualityGates ?? {}),
	}))

const withKeltnerInnerMode = (
	r: StrategyRecipe,
	mode: "off" | "score" | "block" | "both"
): StrategyRecipe =>
	mutateGates(r, (qg) => ({
		...qg,
		keltnerInner: { ...qg.keltnerInner, mode },
	}))

const withMacdMode = (
	r: StrategyRecipe,
	mode: "off" | "score" | "block" | "both"
): StrategyRecipe =>
	mutateGates(r, (qg) => ({
		...qg,
		macd: { ...qg.macd, mode },
	}))

const withVolumeMode = (
	r: StrategyRecipe,
	mode: "off" | "score" | "block" | "both"
): StrategyRecipe =>
	mutateGates(r, (qg) => ({
		...qg,
		volume: { ...qg.volume, mode },
	}))

const withAggressionScoreMode = (
	r: StrategyRecipe,
	scoreMode: "off" | "original" | "reversed"
): StrategyRecipe =>
	mutateGates(r, (qg) => ({
		...qg,
		aggression: { ...qg.aggression, scoreMode },
	}))

const withAggressionBlockMode = (
	r: StrategyRecipe,
	blockMode: "off" | "blockOnAligned" | "blockOnAnti"
): StrategyRecipe =>
	mutateGates(r, (qg) => ({
		...qg,
		aggression: { ...qg.aggression, blockMode },
	}))

// ── Probes ──────────────────────────────────────────────────────────────────

interface ProbeResult {
	name: string
	offTrades: number
	blockTrades: number
	delta: number
	pass: boolean
}

const probeRule = (
	candles: CandleRow[],
	name: string,
	applyOff: (_r: StrategyRecipe) => StrategyRecipe,
	applyBlock: (_r: StrategyRecipe) => StrategyRecipe
): ProbeResult => {
	// Baseline = hawksV0 recipe with quality bundle = "strict". Use mutateGates
	// so we swap qualityGates *inside* the entry config, not rebuild the recipe.
	const baselineWithHawks: StrategyRecipe = mutateGates(hawksV0, () =>
		getQualityPresetBundle("strict")
	)

	const offRecipe = applyOff(baselineWithHawks)
	const blockRecipe = applyBlock(baselineWithHawks)

	const offResult = runBacktest(candles, offRecipe, ASSET_CONFIG)
	const blockResult = runBacktest(candles, blockRecipe, ASSET_CONFIG)

	const offTrades = offResult.summary.totalTrades
	const blockTrades = blockResult.summary.totalTrades
	const delta = blockTrades - offTrades

	// PASS if blocking reduces or maintains trades (delta <= 0) AND the baseline
	// actually fires trades — a zero-trade baseline silently masks any bug.
	const pass = delta <= 0 && offTrades > 0

	return {
		name,
		offTrades,
		blockTrades,
		delta,
		pass,
	}
}

// ── Main ────────────────────────────────────────────────────────────────────

const main = async () => {
	const args = process.argv.slice(2)
	let fromDate = DEFAULT_FROM
	let toDate = DEFAULT_TO

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--from" && args[i + 1]) {
			fromDate = args[i + 1]
			i++
		} else if (args[i] === "--to" && args[i + 1]) {
			toDate = args[i + 1]
			i++
		}
	}

	console.log(`Fetching candles from ${fromDate} to ${toDate}...`)

	// Fetch candles
	const dbUrl = process.env.DATABASE_URL
	if (!dbUrl) {
		throw new Error("DATABASE_URL not set")
	}

	const sql = isNeonUrl(dbUrl)
		? neon(dbUrl)
		: postgres(dbUrl, { max: 1, onnotice: () => {} })

	const candles = await fetchCandles(sql, fromDate, toDate)
	console.log(`Loaded ${candles.length} candles\n`)

	// Run probes for each dual-mode rule
	const probes: ProbeResult[] = [
		probeRule(
			candles,
			"Keltner inner (dual-mode)",
			(r) => withKeltnerInnerMode(r, "off"),
			(r) => withKeltnerInnerMode(r, "block")
		),
		probeRule(
			candles,
			"MACD (dual-mode)",
			(r) => withMacdMode(r, "off"),
			(r) => withMacdMode(r, "block")
		),
		probeRule(
			candles,
			"Volume (dual-mode)",
			(r) => withVolumeMode(r, "off"),
			(r) => withVolumeMode(r, "block")
		),
		probeRule(
			candles,
			"Aggression scoreMode (off → reversed)",
			(r) => withAggressionScoreMode(r, "off"),
			(r) => withAggressionScoreMode(r, "reversed")
		),
		probeRule(
			candles,
			"Aggression blockMode (off → blockOnAligned)",
			(r) => withAggressionBlockMode(r, "off"),
			(r) => withAggressionBlockMode(r, "blockOnAligned")
		),
	]

	// Print table
	console.log("Dual-Mode Rule Effect Probe")
	console.log("═".repeat(80))
	console.log(
		"Rule".padEnd(40) +
			"Off Trades".padEnd(15) +
			"Block Trades".padEnd(15) +
			"Delta".padEnd(10) +
			"Status"
	)
	console.log("─".repeat(80))

	let allPass = true
	for (const probe of probes) {
		const status = probe.pass ? "✓ PASS" : "✗ FAIL"
		if (!probe.pass) {
			allPass = false
		}
		console.log(
			probe.name.padEnd(40) +
				String(probe.offTrades).padEnd(15) +
				String(probe.blockTrades).padEnd(15) +
				String(probe.delta).padEnd(10) +
				status
		)
	}

	console.log("─".repeat(80))
	if (allPass) {
		console.log(
			"All probes PASSED: blocking rules reduce or maintain trade count."
		)
		process.exit(0)
	} else {
		console.log(
			"Some probes FAILED: blocking rule increases trade count (BUG)."
		)
		process.exit(1)
	}
}

main().catch((err) => {
	console.error("Error:", err)
	process.exit(1)
})
