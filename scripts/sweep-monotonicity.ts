/**
 * sweep-monotonicity.ts
 *
 * Detective addendum — for axes that GATE outcomes, verify that the direction
 * of movement matches physical expectations. A real "fraud" would be e.g.
 * higher slippage producing higher PnL. We check sign-of-effect on physical
 * expectations.
 *
 * Each axis declares (a) the value sweep and (b) the expected sign of PnL
 * change. We flag any violation.
 *
 * Usage:
 *   pnpm tsx scripts/sweep-monotonicity.ts
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
			r.timestamp instanceof Date ? r.timestamp.toISOString() : r.timestamp,
		open: Number(r.open),
		high: Number(r.high),
		low: Number(r.low),
		close: Number(r.close),
		candleIndex: r.candle_index ?? 0,
		indicators: (r.indicators as Record<string, number>) ?? {},
	})) as CandleRow[]
}

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
const withBundle = (
	recipe: StrategyRecipe,
	bundle: "off" | "lite" | "standard" | "strict"
): StrategyRecipe =>
	mutateHawks(recipe, (cfg) => ({
		...cfg,
		qualityGates: getQualityPresetBundle(bundle),
	}))
const withGate = <K extends keyof QualityGatesConfig>(
	recipe: StrategyRecipe,
	key: K,
	value: QualityGatesConfig[K]
): StrategyRecipe => mutateGates(recipe, (qg) => ({ ...qg, [key]: value }))
const withBe = (r: StrategyRecipe, pct: number): StrategyRecipe => ({
	...r,
	stop: { ...r.stop, breakeven: { type: "on_pct_risk", triggerPct: pct } },
})
const withR = (r: StrategyRecipe, v: number): StrategyRecipe => ({
	...r,
	target: {
		...r.target,
		type: "fixed_levels",
		levels: [{ value: v, mode: "r_multiple", exitPct: 100, label: "target1" }],
	} as StrategyRecipe["target"],
})
const withSlip = (r: StrategyRecipe, t: number): StrategyRecipe => ({
	...r,
	slippageTicks: t,
})
const withCooldown = (r: StrategyRecipe, n: number): StrategyRecipe =>
	mutateHawks(r, (c) => ({ ...c, fireCooldownBricks: n }))
const withWave1 = (r: StrategyRecipe, n: number): StrategyRecipe =>
	mutateHawks(r, (c) => ({ ...c, wave1MinBricks: n }))
const withRetrace = (r: StrategyRecipe, n: number): StrategyRecipe =>
	mutateHawks(r, (c) => ({ ...c, retracementMinBricks: n }))

interface MonoCheck {
	id: string
	label: string
	values: number[]
	apply: (_r: StrategyRecipe, _v: number) => StrategyRecipe
	expect:
		| "monotone_down"
		| "monotone_up"
		| "non_increasing_trades"
		| "non_decreasing_trades"
	rationale: string
}

const checks: MonoCheck[] = [
	{
		id: "slippageTicks",
		label: "Slippage ↑ → PnL ↓ (cost-direct)",
		values: [0, 1, 2, 3, 4, 5],
		apply: withSlip,
		expect: "monotone_down",
		rationale:
			"Each tick is a direct PnL cost on entry+exit; PnL must fall as ticks rise.",
	},
	{
		id: "slippageTicks_trades",
		label: "Slippage ↑ → trade count flat or near-flat",
		values: [0, 1, 2, 3, 4, 5],
		apply: withSlip,
		expect: "non_decreasing_trades",
		rationale:
			"Slippage doesn't affect entry decision; trade count should be ≈ constant.",
	},
	{
		id: "fireCooldownBricks",
		label: "Cooldown ↑ → trade count ↓",
		values: [3, 4, 5, 6, 7, 10],
		apply: withCooldown,
		expect: "non_increasing_trades",
		rationale:
			"Longer cooldown disqualifies more re-fires; trades must be monotone non-increasing.",
	},
	{
		id: "wave1MinBricks",
		label: "Wave-1 min ↑ → trade count ↓",
		values: [3, 4, 5, 6, 8, 10],
		apply: withWave1,
		expect: "non_increasing_trades",
		rationale:
			"Stricter wave-1 threshold disqualifies more setups; trades must drop.",
	},
	{
		id: "retracementMinBricks",
		label: "Retracement min ↑ → trade count ↓",
		values: [1, 2, 3, 4, 5],
		apply: withRetrace,
		expect: "non_increasing_trades",
		rationale:
			"Stricter retracement threshold disqualifies more setups; trades must drop.",
	},
	{
		id: "srBlockBufferBricks_strict",
		label: "[strict bundle] SR block buffer ↑ → trade count ↓",
		values: [1, 2, 3, 4, 6, 10],
		apply: (r, v) => withGate(r, "srBlockBufferBricks", v),
		expect: "non_increasing_trades",
		rationale: "Wider block buffer = more bricks killed → fewer trades.",
	},
]

const main = async (): Promise<void> => {
	const args = process.argv.slice(2)
	const fromIdx = args.indexOf("--from")
	const toIdx = args.indexOf("--to")
	const fromDate = fromIdx >= 0 ? args[fromIdx + 1]! : DEFAULT_FROM
	const toDate = toIdx >= 0 ? args[toIdx + 1]! : DEFAULT_TO

	const url = process.env.DATABASE_URL
	if (!url) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)
	console.log(`Loading WIN 5m candles ${fromDate} → ${toDate}…`)
	const candles = await fetchCandles(sql, fromDate, toDate)
	console.log(`Loaded ${candles.length} candles`)
	console.log()

	const violations: Array<{
		check: MonoCheck
		series: Array<{ v: number; pnl: number; trades: number }>
	}> = []

	for (const check of checks) {
		console.log(`── ${check.label} ──`)
		const useStrict = check.id.endsWith("_strict")
		const baseline = useStrict ? withBundle(hawksV0, "strict") : hawksV0
		const series: Array<{ v: number; pnl: number; trades: number }> = []
		for (const v of check.values) {
			const recipe = check.apply(baseline, v)
			const result = runBacktest(candles, recipe, ASSET_CONFIG)
			series.push({
				v,
				pnl: result.summary.totalPnlCents,
				trades: result.summary.totalTrades,
			})
			console.log(
				`  ${String(v).padStart(4)} → trades=${String(result.summary.totalTrades).padStart(4)}  pnl=${String(result.summary.totalPnlCents).padStart(8)}`
			)
		}
		// Detect violations
		let violated = false
		for (let i = 1; i < series.length; i++) {
			const prev = series[i - 1]!
			const curr = series[i]!
			if (check.expect === "monotone_down" && curr.pnl > prev.pnl) {
				violated = true
				break
			}
			if (check.expect === "monotone_up" && curr.pnl < prev.pnl) {
				violated = true
				break
			}
			if (
				check.expect === "non_increasing_trades" &&
				curr.trades > prev.trades
			) {
				violated = true
				break
			}
			if (
				check.expect === "non_decreasing_trades" &&
				curr.trades < prev.trades
			) {
				// "near-flat" — allow tiny variance from index-shift effects
				if (prev.trades - curr.trades > 5) {
					violated = true
					break
				}
			}
		}
		if (violated) {
			violations.push({ check, series })
			console.log(`  ✗ VIOLATION: expected ${check.expect}`)
			console.log(`    rationale: ${check.rationale}`)
		} else {
			console.log(`  ✓ ${check.expect}`)
		}
		console.log()
	}

	console.log("══════════════════════════════════════════════════════════════")
	console.log("MONOTONICITY SUMMARY")
	console.log("══════════════════════════════════════════════════════════════")
	console.log(`Checks run:    ${checks.length}`)
	console.log(`Violations:    ${violations.length}`)
	if (violations.length > 0) {
		console.log("\nVIOLATIONS:")
		for (const { check, series } of violations) {
			console.log(`  ${check.id}: expected ${check.expect}`)
			console.log(`    ${check.rationale}`)
			console.log(
				`    series: ${series.map((s) => `${s.v}→${s.pnl}/${s.trades}t`).join(", ")}`
			)
		}
	}
	process.exit(violations.length > 0 ? 1 : 0)
}

main().catch((err: unknown) => {
	const e = err as { message?: string; stack?: string }
	process.stderr.write(
		`sweep-monotonicity failed: ${e.message ?? String(err)}\n${e.stack ?? ""}\n`
	)
	process.exit(1)
})
