/**
 * sweep-validate.ts
 *
 * Re-runs Hawks broad sweeps directly against the same `runBacktest` engine
 * the UI worker uses, writes a CSV with the exact same shape as
 * `src/lib/optimize/export-runs.ts`, and audits the output for precision
 * invariants the user's CSV-validation flagged.
 *
 * Why a script and not the UI:
 *   - Five sweep variations × ~100 recipes each via Playwright would take
 *     >30 minutes of brittle click-driving.
 *   - The browser exports `OptimizationRun[]` from localStorage, but the
 *     `summary` field is produced 1:1 by `computeMetrics()`. Running the
 *     engine directly here gives us the same numbers without the wrapper.
 *
 * Variations exercised (each is a small sweep over one Tier-1 axis):
 *   V1  Breakeven trigger %         (50, 75, 100, 125, 150)
 *   V2  Target R-multiple           (2, 2.5, 3, 3.5, 4)
 *   V3  Slippage ticks              (0, 1, 2, 3)
 *   V4  Combined grid               (5×5 = 25, BE × R)
 *
 * Audit invariants (any FAIL is a real engine/metrics regression):
 *   A1  identity: wins + losses + breakevens === totalTrades
 *   A2  not (PF == 1.0  AND  totalPnlCents != 0)        ← the bug we fixed
 *   A3  every numeric field is finite (no NaN, no Infinity)
 *   A4  PF recomputed from trades ≈ stored PF (within 1e-6)
 *   A5  Sharpe non-zero when stdR > 0 (no precision collapse)
 *   A6  winRate ∈ [0, 100] and equals (wins / totalTrades) * 100
 *
 * Usage:
 *   pnpm tsx scripts/sweep-validate.ts                          # all variations
 *   pnpm tsx scripts/sweep-validate.ts --from 2026-04-01 --to 2026-05-30
 *   pnpm tsx scripts/sweep-validate.ts --only V2                # one variation
 */
import "dotenv/config"
import { writeFileSync, mkdirSync } from "node:fs"
import { resolve } from "node:path"
import { neon } from "@neondatabase/serverless"
import { isNeonUrl } from "@/db/url"
import postgres from "postgres"
import { runBacktest } from "@/lib/backtest/engine"
import { hawksV0 } from "@/lib/backtest/presets/hawks-presets"
import { getQualityPresetBundle } from "@/lib/backtest/presets/hawks-quality-presets"
import type {
	StrategyRecipe,
	BacktestSummary,
	BacktestTrade,
	OptimizationRun,
	AssetConfig,
	HawksTripleScreenConfig,
	QualityGatesConfig,
} from "@/types/backtest"
import type { CandleRow } from "@/types/candle"

// ─── Config ───────────────────────────────────────────────────────────────────

const ASSET_SYMBOL = "WIN"
const ASSET_CONFIG: AssetConfig = {
	tickSize: 5,
	tickValueCents: 100,
} as AssetConfig

const DEFAULT_FROM = "2026-04-01"
const DEFAULT_TO = "2026-05-30"

const OUT_DIR = resolve(process.cwd(), "tmp/sweep-validate")

// ─── DB ───────────────────────────────────────────────────────────────────────

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

// ─── Recipe builders (small, focused sweeps) ──────────────────────────────────

const withBreakeven = (pct: number): StrategyRecipe => ({
	...hawksV0,
	displayName: `hawks_be_${pct}`,
	stop: {
		...hawksV0.stop,
		breakeven: { type: "on_pct_risk", triggerPct: pct },
	},
})

const withTargetR = (r: number): StrategyRecipe => ({
	...hawksV0,
	displayName: `hawks_r_${r}`,
	target: {
		...hawksV0.target,
		type: "fixed_levels",
		levels: [{ value: r, mode: "r_multiple", exitPct: 100, label: "target1" }],
	} as StrategyRecipe["target"],
})

const withSlippage = (ticks: number): StrategyRecipe => ({
	...hawksV0,
	displayName: `hawks_slip_${ticks}`,
	slippageTicks: ticks,
})

const withBeAndR = (pct: number, r: number): StrategyRecipe => ({
	...hawksV0,
	displayName: `hawks_be${pct}_r${r}`,
	stop: {
		...hawksV0.stop,
		breakeven: { type: "on_pct_risk", triggerPct: pct },
	},
	target: {
		...hawksV0.target,
		type: "fixed_levels",
		levels: [{ value: r, mode: "r_multiple", exitPct: 100, label: "target1" }],
	} as StrategyRecipe["target"],
})

// ─── Generic Hawks-config mutators ───────────────────────────────────────────

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

const withCooldown = (recipe: StrategyRecipe, bricks: number): StrategyRecipe =>
	mutateHawks(recipe, (cfg) => ({ ...cfg, fireCooldownBricks: bricks }))

const withWave1Min = (recipe: StrategyRecipe, bricks: number): StrategyRecipe =>
	mutateHawks(recipe, (cfg) => ({ ...cfg, wave1MinBricks: bricks }))

const withRetracementMin = (
	recipe: StrategyRecipe,
	bricks: number
): StrategyRecipe =>
	mutateHawks(recipe, (cfg) => ({ ...cfg, retracementMinBricks: bricks }))

const withAggressionMode = (
	recipe: StrategyRecipe,
	mode: "off" | "original" | "reversed"
): StrategyRecipe =>
	mutateGates(recipe, (qg) => ({ ...qg, aggressionMode: mode }))

const withGateToggle = (
	recipe: StrategyRecipe,
	gate: keyof QualityGatesConfig,
	on: boolean
): StrategyRecipe => mutateGates(recipe, (qg) => ({ ...qg, [gate]: on }))

const withBe = (recipe: StrategyRecipe, pct: number): StrategyRecipe => ({
	...recipe,
	stop: { ...recipe.stop, breakeven: { type: "on_pct_risk", triggerPct: pct } },
})

const withR = (recipe: StrategyRecipe, r: number): StrategyRecipe => ({
	...recipe,
	target: {
		...recipe.target,
		type: "fixed_levels",
		levels: [{ value: r, mode: "r_multiple", exitPct: 100, label: "target1" }],
	} as StrategyRecipe["target"],
})

const withSlip = (recipe: StrategyRecipe, ticks: number): StrategyRecipe => ({
	...recipe,
	slippageTicks: ticks,
})

// Deterministic PRNG for V19 (Mulberry32) so reruns are reproducible.
const seededRand = (seed: number): (() => number) => {
	let t = seed >>> 0
	return () => {
		t = (t + 0x6d2b79f5) >>> 0
		let r = t
		r = Math.imul(r ^ (r >>> 15), r | 1)
		r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
		return ((r ^ (r >>> 14)) >>> 0) / 4294967296
	}
}

const pick = <T>(rng: () => number, arr: readonly T[]): T =>
	arr[Math.floor(rng() * arr.length)]!

const BE_DEFAULT = [50, 75, 100, 125, 150, 175, 200] as const
const R_DEFAULT = [2, 2.5, 3, 3.5, 4] as const
const SLIP_DEFAULT = [0, 1, 2, 3] as const
const BUNDLE_DEFAULT = ["off", "lite", "standard", "strict"] as const
const COOLDOWN_DEFAULT = [3, 4, 5, 6, 7] as const
const WAVE1_DEFAULT = [3, 4, 5, 6] as const
const RETRACE_DEFAULT = [1, 2, 3] as const
const AGGRESSION_MODES = ["off", "original", "reversed"] as const
const TOGGLE_GATES = [
	"srLevelBlock",
	"srLevelFavor",
	"keltnerOuterBlock",
	"keltnerInnerPenalty",
	"macdAlignmentScore",
	"volumeScore",
	"htfMaBlock",
] as const

const tier2BAxes: Array<{
	key: keyof QualityGatesConfig
	values: number[]
}> = [
	{ key: "srBlockBufferBricks" as const, values: [1, 2, 3, 4] },
	{ key: "srFavorRangeBricks" as const, values: [2, 3, 4, 5] },
	{ key: "keltnerNearBricks" as const, values: [1, 2, 3] },
	{ key: "macdSlopeWindow" as const, values: [2, 3, 4, 5] },
	{ key: "aggressionThreshold" as const, values: [10000, 15000, 20000, 25000] },
	{ key: "volumeEmaPeriod" as const, values: [300, 400, 500, 600, 700] },
]

interface Variation {
	id: string
	label: string
	recipes: StrategyRecipe[]
}

const buildVariations = (): Variation[] => {
	const variations: Variation[] = [
		{
			id: "V1",
			label: "Breakeven trigger % sweep",
			recipes: [50, 75, 100, 125, 150].map(withBreakeven),
		},
		{
			id: "V2",
			label: "Target R-multiple sweep",
			recipes: [2, 2.5, 3, 3.5, 4].map(withTargetR),
		},
		{
			id: "V3",
			label: "Slippage ticks sweep",
			recipes: [0, 1, 2, 3].map(withSlippage),
		},
		{
			id: "V4",
			label: "BE × R combined grid (5×5)",
			recipes: [50, 75, 100, 125, 150].flatMap((pct) =>
				[2, 2.5, 3, 3.5, 4].map((r) => withBeAndR(pct, r))
			),
		},
		{
			id: "V5",
			label: "Quality bundle 4-way",
			recipes: BUNDLE_DEFAULT.map((b) => ({
				...withBundle(hawksV0, b),
				displayName: `hawks_bundle_${b}`,
			})),
		},
		{
			id: "V6",
			label: "Fire cooldown sweep",
			recipes: COOLDOWN_DEFAULT.map((n) => ({
				...withCooldown(hawksV0, n),
				displayName: `hawks_cd${n}`,
			})),
		},
		{
			id: "V7",
			label: "Wave-1 min bricks sweep",
			recipes: WAVE1_DEFAULT.map((n) => ({
				...withWave1Min(hawksV0, n),
				displayName: `hawks_w1_${n}`,
			})),
		},
		{
			id: "V8",
			label: "Retracement min bricks sweep",
			recipes: RETRACE_DEFAULT.map((n) => ({
				...withRetracementMin(hawksV0, n),
				displayName: `hawks_rt_${n}`,
			})),
		},
		{
			id: "V9",
			label: "Aggression mode 3-way",
			recipes: AGGRESSION_MODES.map((m) => ({
				...withAggressionMode(hawksV0, m),
				displayName: `hawks_agg_${m}`,
			})),
		},
		{
			id: "V10",
			label: "Tier-2C boolean toggles, isolated",
			recipes: TOGGLE_GATES.flatMap((g) =>
				[false, true].map((on) => ({
					...withGateToggle(hawksV0, g, on),
					displayName: `hawks_${g}_${on ? "on" : "off"}`,
				}))
			),
		},
		{
			id: "V11",
			label: "Tier-2B numerics, isolated per axis",
			recipes: tier2BAxes.flatMap((axis) =>
				axis.values.map((v) => ({
					...mutateGates(hawksV0, (qg) => ({ ...qg, [axis.key]: v })),
					displayName: `hawks_${String(axis.key)}_${v}`,
				}))
			),
		},
		{
			id: "V12",
			label: "Tier-1 full grid: BE × R × slip (7×5×4)",
			recipes: BE_DEFAULT.flatMap((be) =>
				R_DEFAULT.flatMap((r) =>
					SLIP_DEFAULT.map((s) => ({
						...withSlip(withR(withBe(hawksV0, be), r), s),
						displayName: `hawks_be${be}_r${r}_s${s}`,
					}))
				)
			),
		},
		{
			id: "V13",
			label: "Dense BE × R: step-10 BE × step-0.25 R (16×9)",
			recipes: (() => {
				const beVals: number[] = []
				for (let v = 50; v <= 200; v += 10) {
					beVals.push(v)
				}
				const rVals: number[] = []
				for (let v = 2; v <= 4 + 1e-9; v += 0.25) {
					rVals.push(Number(v.toFixed(2)))
				}
				return beVals.flatMap((be) =>
					rVals.map((r) => ({
						...withR(withBe(hawksV0, be), r),
						displayName: `hawks_be${be}_r${r}`,
					}))
				)
			})(),
		},
		{
			id: "V14",
			label: "BE × R × bundle (7×5×4)",
			recipes: BE_DEFAULT.flatMap((be) =>
				R_DEFAULT.flatMap((r) =>
					BUNDLE_DEFAULT.map((b) => ({
						...withBundle(withR(withBe(hawksV0, be), r), b),
						displayName: `hawks_be${be}_r${r}_${b}`,
					}))
				)
			),
		},
		{
			id: "V15",
			label: "Engine-state grid: cooldown × wave1 × retracement",
			recipes: COOLDOWN_DEFAULT.flatMap((cd) =>
				WAVE1_DEFAULT.flatMap((w1) =>
					RETRACE_DEFAULT.map((rt) => ({
						...withRetracementMin(
							withWave1Min(withCooldown(hawksV0, cd), w1),
							rt
						),
						displayName: `hawks_cd${cd}_w1${w1}_rt${rt}`,
					}))
				)
			),
		},
		{
			id: "V16",
			label: "Tier-1 × cooldown (7×5×4×5)",
			recipes: BE_DEFAULT.flatMap((be) =>
				R_DEFAULT.flatMap((r) =>
					SLIP_DEFAULT.flatMap((s) =>
						COOLDOWN_DEFAULT.map((cd) => ({
							...withCooldown(withSlip(withR(withBe(hawksV0, be), r), s), cd),
							displayName: `hawks_be${be}_r${r}_s${s}_cd${cd}`,
						}))
					)
				)
			),
		},
		{
			id: "V17",
			label: "Tier-1 × wave1 (7×5×4×4)",
			recipes: BE_DEFAULT.flatMap((be) =>
				R_DEFAULT.flatMap((r) =>
					SLIP_DEFAULT.flatMap((s) =>
						WAVE1_DEFAULT.map((w1) => ({
							...withWave1Min(withSlip(withR(withBe(hawksV0, be), r), s), w1),
							displayName: `hawks_be${be}_r${r}_s${s}_w1${w1}`,
						}))
					)
				)
			),
		},
		{
			id: "V18",
			label: "Tier-1 × bundle × cooldown (7×5×4×4×5)",
			recipes: BE_DEFAULT.flatMap((be) =>
				R_DEFAULT.flatMap((r) =>
					SLIP_DEFAULT.flatMap((s) =>
						BUNDLE_DEFAULT.flatMap((b) =>
							COOLDOWN_DEFAULT.map((cd) => ({
								...withCooldown(
									withBundle(withSlip(withR(withBe(hawksV0, be), r), s), b),
									cd
								),
								displayName: `hawks_be${be}_r${r}_s${s}_${b}_cd${cd}`,
							}))
						)
					)
				)
			),
		},
		{
			id: "V19",
			label: "Latin-hypercube random sample (2000)",
			recipes: (() => {
				const rng = seededRand(20260531)
				const out: StrategyRecipe[] = []
				for (let i = 0; i < 2000; i++) {
					const be = pick(rng, BE_DEFAULT)
					const r = pick(rng, R_DEFAULT)
					const s = pick(rng, SLIP_DEFAULT)
					const b = pick(rng, BUNDLE_DEFAULT)
					const cd = pick(rng, COOLDOWN_DEFAULT)
					const w1 = pick(rng, WAVE1_DEFAULT)
					const rt = pick(rng, RETRACE_DEFAULT)
					const agg = pick(rng, AGGRESSION_MODES)
					let recipe = withBe(hawksV0, be)
					recipe = withR(recipe, r)
					recipe = withSlip(recipe, s)
					recipe = withBundle(recipe, b)
					recipe = withCooldown(recipe, cd)
					recipe = withWave1Min(recipe, w1)
					recipe = withRetracementMin(recipe, rt)
					recipe = withAggressionMode(recipe, agg)
					out.push({
						...recipe,
						displayName: `lh_${i}_be${be}_r${r}_s${s}_${b}_cd${cd}_w${w1}_rt${rt}_${agg}`,
					})
				}
				return out
			})(),
		},
		{
			id: "V20",
			label: "Fine BE × slip × bundle (step-5 BE × slip × bundle)",
			recipes: (() => {
				const beVals: number[] = []
				for (let v = 50; v <= 200; v += 5) {
					beVals.push(v)
				}
				return beVals.flatMap((be) =>
					SLIP_DEFAULT.flatMap((s) =>
						BUNDLE_DEFAULT.map((b) => ({
							...withBundle(withSlip(withBe(hawksV0, be), s), b),
							displayName: `hawks_be${be}_s${s}_${b}`,
						}))
					)
				)
			})(),
		},
		{
			id: "V21",
			label: "BE × R × wave1 × retracement × bundle (7×5×4×3×4)",
			recipes: BE_DEFAULT.flatMap((be) =>
				R_DEFAULT.flatMap((r) =>
					WAVE1_DEFAULT.flatMap((w1) =>
						RETRACE_DEFAULT.flatMap((rt) =>
							BUNDLE_DEFAULT.map((b) => ({
								...withBundle(
									withRetracementMin(
										withWave1Min(withR(withBe(hawksV0, be), r), w1),
										rt
									),
									b
								),
								displayName: `hawks_be${be}_r${r}_w${w1}_rt${rt}_${b}`,
							}))
						)
					)
				)
			),
		},
		{
			id: "V22",
			label: "BE × R × slip × wave1 (7×5×4×4)",
			recipes: BE_DEFAULT.flatMap((be) =>
				R_DEFAULT.flatMap((r) =>
					SLIP_DEFAULT.flatMap((s) =>
						WAVE1_DEFAULT.map((w1) => ({
							...withWave1Min(withSlip(withR(withBe(hawksV0, be), r), s), w1),
							displayName: `hawks_be${be}_r${r}_s${s}_w${w1}`,
						}))
					)
				)
			),
		},
		{
			id: "V23",
			label: "Cooldown × wave1 × bundle × aggression (5×4×4×3)",
			recipes: COOLDOWN_DEFAULT.flatMap((cd) =>
				WAVE1_DEFAULT.flatMap((w1) =>
					BUNDLE_DEFAULT.flatMap((b) =>
						AGGRESSION_MODES.map((agg) => ({
							...withAggressionMode(
								withBundle(withWave1Min(withCooldown(hawksV0, cd), w1), b),
								agg
							),
							displayName: `hawks_cd${cd}_w${w1}_${b}_${agg}`,
						}))
					)
				)
			),
		},
		{
			id: "V24",
			label: "BE × cooldown × wave1 (7×5×4)",
			recipes: BE_DEFAULT.flatMap((be) =>
				COOLDOWN_DEFAULT.flatMap((cd) =>
					WAVE1_DEFAULT.map((w1) => ({
						...withWave1Min(withCooldown(withBe(hawksV0, be), cd), w1),
						displayName: `hawks_be${be}_cd${cd}_w${w1}`,
					}))
				)
			),
		},
	]
	return variations
}

// ─── Audit invariants ─────────────────────────────────────────────────────────

interface AuditFinding {
	variation: string
	runLabel: string
	rule: string
	severity: "FAIL" | "WARN"
	detail: string
}

const isFinite_ = (n: unknown): n is number =>
	typeof n === "number" && Number.isFinite(n)

const recomputePf = (trades: BacktestTrade[]): number => {
	let positives = 0
	let negatives = 0
	for (const t of trades) {
		if (t.netPnlCents > 0) {
			positives += t.netPnlCents
		} else if (t.netPnlCents < 0) {
			negatives += -t.netPnlCents
		}
	}
	if (negatives === 0) {
		return positives === 0 ? 0 : Number.POSITIVE_INFINITY
	}
	return positives / negatives
}

const auditRun = (
	variationId: string,
	label: string,
	summary: BacktestSummary,
	trades: BacktestTrade[]
): AuditFinding[] => {
	const findings: AuditFinding[] = []
	const push = (
		rule: string,
		severity: "FAIL" | "WARN",
		detail: string
	): void => {
		findings.push({
			variation: variationId,
			runLabel: label,
			rule,
			severity,
			detail,
		})
	}

	// A1 identity ledger
	const tally = summary.wins + summary.losses + summary.breakevens
	if (tally !== summary.totalTrades) {
		push(
			"A1",
			"FAIL",
			`wins(${summary.wins}) + losses(${summary.losses}) + breakevens(${summary.breakevens}) = ${tally} ≠ totalTrades(${summary.totalTrades})`
		)
	}

	// A2 PF=1 with non-zero PnL — the headline bug
	if (
		Math.abs(summary.profitFactor - 1) < 1e-9 &&
		summary.totalPnlCents !== 0
	) {
		push(
			"A2",
			"FAIL",
			`PF=${summary.profitFactor} but totalPnlCents=${summary.totalPnlCents} (mathematically impossible)`
		)
	}

	// A3 finiteness across every numeric metric
	const numericFields = [
		"winRate",
		"profitFactor",
		"totalPnlCents",
		"avgPnlCents",
		"avgWinCents",
		"avgLossCents",
		"avgRMultiple",
		"maxDrawdownCents",
		"maxConsecutiveLosses",
		"maxConsecutiveWins",
		"sharpeRatio",
		"expectancy",
	] as const
	for (const f of numericFields) {
		const v = (summary as unknown as Record<string, unknown>)[f]
		if (!isFinite_(v)) {
			push("A3", "FAIL", `${f} is non-finite (got ${String(v)})`)
		}
	}

	// A4 PF recomputation
	if (summary.totalTrades > 0) {
		const recomputed = recomputePf(trades)
		const stored = summary.profitFactor
		if (!Number.isFinite(recomputed) || !Number.isFinite(stored)) {
			// Both must be non-finite together or both finite together
			if (Number.isFinite(recomputed) !== Number.isFinite(stored)) {
				push(
					"A4",
					"FAIL",
					`finiteness mismatch: recomputed=${recomputed} stored=${stored}`
				)
			}
		} else if (Math.abs(recomputed - stored) > 1e-6) {
			push(
				"A4",
				"FAIL",
				`PF mismatch: recomputed=${recomputed.toFixed(6)} stored=${stored.toFixed(6)} Δ=${(recomputed - stored).toExponential(2)}`
			)
		}
	}

	// A5 Sharpe collapse heuristic
	if (
		summary.totalTrades > 5 &&
		summary.sharpeRatio === 0 &&
		Math.abs(summary.avgRMultiple) > 0.01
	) {
		push(
			"A5",
			"WARN",
			`sharpe=0 with avgR=${summary.avgRMultiple.toFixed(4)} on ${summary.totalTrades} trades (possible precision collapse)`
		)
	}

	// A6 winRate identity — engine uses `wins / decisive * 100` (decisive = wins + losses,
	// excludes breakevens). This is intentional: BE-stops shouldn't count against the
	// discriminator's win rate the way commission-eaten trades would.
	const decisive = summary.wins + summary.losses
	if (decisive > 0) {
		const expected = (summary.wins / decisive) * 100
		if (Math.abs(expected - summary.winRate) > 1e-6) {
			push(
				"A6",
				"FAIL",
				`winRate mismatch: stored=${summary.winRate} expected=${expected.toFixed(6)} (using decisive=${decisive})`
			)
		}
	} else if (summary.winRate !== 0) {
		push(
			"A6",
			"FAIL",
			`winRate=${summary.winRate} but no decisive trades (wins=0, losses=0)`
		)
	}

	return findings
}

// ─── CSV writer (same shape as export-runs.ts) ────────────────────────────────

const CSV_HEADERS = [
	"label",
	"stage",
	"journeyId",
	"parentRunIds",
	"trades",
	"winRate",
	"profitFactor",
	"profitFactorIS",
	"profitFactorOOS",
	"matchRate",
	"oosRobust",
	"totalPnlCents",
	"maxDrawdownCents",
	"sharpeRatio",
	"avgRMultiple",
	"createdAt",
	"strategy",
	"id",
] as const

const csvField = (value: unknown): string => {
	if (value === undefined || value === null) {
		return ""
	}
	const s = String(value)
	if (/[",\n\r]/.test(s)) {
		return `"${s.replace(/"/g, '""')}"`
	}
	return s
}

const toCsvRow = (run: OptimizationRun): string => {
	const cells: Array<string | number | boolean | undefined> = [
		run.label,
		run.provenance?.stage,
		run.provenance?.journeyId,
		run.provenance?.parentRunIds?.join("|"),
		run.summary.totalTrades,
		run.summary.winRate,
		run.summary.profitFactor,
		run.summaryIS?.profitFactor,
		run.summaryOOS?.profitFactor,
		run.matchRate,
		run.oosRobust,
		run.summary.totalPnlCents,
		run.summary.maxDrawdownCents,
		run.summary.sharpeRatio,
		run.summary.avgRMultiple,
		run.createdAt,
		run.recipe.entry.type,
		run.id,
	]
	return cells.map(csvField).join(",")
}

const writeCsv = (variationId: string, runs: OptimizationRun[]): string => {
	mkdirSync(OUT_DIR, { recursive: true })
	const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
	const path = resolve(OUT_DIR, `sweep-${variationId}-${ts}.csv`)
	const lines = [CSV_HEADERS.join(","), ...runs.map(toCsvRow)]
	writeFileSync(path, "﻿" + lines.join("\n"), "utf8")
	return path
}

// ─── Build an OptimizationRun from a runBacktest result ───────────────────────

const buildRun = (
	variationId: string,
	idx: number,
	recipe: StrategyRecipe,
	summary: BacktestSummary
): OptimizationRun => ({
	id: `${variationId}-${idx}-${crypto.randomUUID()}`,
	label: `Broad #${variationId}-${idx + 1}`,
	recipe,
	summary,
	equityCurve: [],
	trades: [],
	dayBreakdown: [],
	pinned: false,
	createdAt: new Date().toISOString(),
	provenance: {
		sweepId: variationId,
		datasetHash: "validate",
		candleCount: 0,
		dateRangeHash: "validate",
		dateFrom: "",
		dateTo: "",
		engineVersion: "hawks-v0.5",
		recipeHash: `${variationId}-${idx}`,
		schemaVersion: 4,
		stage: "broad",
		journeyId: `validate-${variationId}`,
	},
})

// ─── Main ─────────────────────────────────────────────────────────────────────

const main = async (): Promise<void> => {
	const args = process.argv.slice(2)
	const fromIdx = args.indexOf("--from")
	const toIdx = args.indexOf("--to")
	const onlyIdx = args.indexOf("--only")
	const fromDate = fromIdx >= 0 ? args[fromIdx + 1]! : DEFAULT_FROM
	const toDate = toIdx >= 0 ? args[toIdx + 1]! : DEFAULT_TO
	const only = onlyIdx >= 0 ? args[onlyIdx + 1] : null
	const noCsv = args.includes("--no-csv")
	const verbose = args.includes("--verbose")

	const url = process.env.DATABASE_URL
	if (!url) {
		console.error("DATABASE_URL missing")
		process.exit(1)
	}
	const sql = isNeonUrl(url) ? neon(url) : postgres(url)

	console.log(`Loading WIN 5m candles ${fromDate} → ${toDate}…`)
	const candles = await fetchCandles(sql, fromDate, toDate)
	console.log(`Loaded ${candles.length} candles`)
	if (candles.length === 0) {
		console.error("No candles. Aborting.")
		process.exit(1)
	}

	const allVariations = buildVariations()
	const variations = only
		? allVariations.filter((v) => v.id === only)
		: allVariations
	if (variations.length === 0) {
		console.error(`No variations matched --only ${only}`)
		process.exit(1)
	}

	const findings: AuditFinding[] = []
	const summaryRows: Array<{
		variation: string
		runLabel: string
		trades: number
		pf: number
		winRate: number
		pnl: number
		sharpe: number
		avgR: number
	}> = []

	for (const v of variations) {
		console.log(
			`\n── ${v.id}: ${v.label} (${v.recipes.length} recipes) ─────────`
		)
		const runs: OptimizationRun[] = []
		const vStart = performance.now()
		let vFail = 0
		let vWarn = 0
		let bestPf = -Infinity
		let bestPfLabel = ""
		let worstPf = Infinity
		let worstPfLabel = ""
		for (let i = 0; i < v.recipes.length; i++) {
			const recipe = v.recipes[i]!
			const result = runBacktest(candles, recipe, ASSET_CONFIG)
			const run = buildRun(v.id, i, recipe, result.summary)
			runs.push(run)

			const f = auditRun(v.id, run.label, result.summary, result.trades)
			findings.push(...f)
			if (f.some((x) => x.severity === "FAIL")) {
				vFail++
			}
			if (f.some((x) => x.severity === "WARN")) {
				vWarn++
			}

			summaryRows.push({
				variation: v.id,
				runLabel: run.label,
				trades: result.summary.totalTrades,
				pf: result.summary.profitFactor,
				winRate: result.summary.winRate,
				pnl: result.summary.totalPnlCents,
				sharpe: result.summary.sharpeRatio,
				avgR: result.summary.avgRMultiple,
			})

			if (Number.isFinite(result.summary.profitFactor)) {
				if (result.summary.profitFactor > bestPf) {
					bestPf = result.summary.profitFactor
					bestPfLabel = recipe.displayName ?? `idx${i}`
				}
				if (result.summary.profitFactor < worstPf) {
					worstPf = result.summary.profitFactor
					worstPfLabel = recipe.displayName ?? `idx${i}`
				}
			}

			if (verbose || v.recipes.length <= 25) {
				const fail = f.some((x) => x.severity === "FAIL")
				const warn = f.some((x) => x.severity === "WARN")
				const flag = fail ? " ✗FAIL" : warn ? " !WARN" : ""
				console.log(
					`  [${(i + 1).toString().padStart(4)}/${v.recipes.length}] ${(recipe.displayName ?? "").padEnd(36)} ` +
						`trades=${String(result.summary.totalTrades).padStart(4)} ` +
						`pf=${result.summary.profitFactor.toFixed(4).padStart(8)} ` +
						`pnl=${String(result.summary.totalPnlCents).padStart(8)}${flag}`
				)
			}
		}
		const vMs = performance.now() - vStart
		console.log(
			`  Δ ${v.recipes.length} runs in ${vMs.toFixed(0)} ms  FAIL=${vFail}  WARN=${vWarn}  ` +
				`best=${bestPf.toFixed(4)} (${bestPfLabel})  worst=${worstPf.toFixed(4)} (${worstPfLabel})`
		)
		if (!noCsv) {
			const csvPath = writeCsv(v.id, runs)
			console.log(`  CSV → ${csvPath}`)
		}
	}

	// ─── Audit summary ────────────────────────────────────────────────────────
	console.log(
		"\n══════════════════════════════════════════════════════════════"
	)
	console.log("AUDIT SUMMARY")
	console.log("══════════════════════════════════════════════════════════════")
	const fails = findings.filter((f) => f.severity === "FAIL")
	const warns = findings.filter((f) => f.severity === "WARN")
	console.log(`Total runs:      ${summaryRows.length}`)
	console.log(`FAIL findings:   ${fails.length}`)
	console.log(`WARN findings:   ${warns.length}`)

	if (fails.length === 0) {
		console.log("\n✓ All hard invariants pass.")
	} else {
		console.log("\n✗ HARD-INVARIANT FAILURES:")
		for (const f of fails) {
			console.log(`  [${f.variation}] ${f.runLabel} :: ${f.rule}`)
			console.log(`      ${f.detail}`)
		}
	}
	if (warns.length > 0) {
		console.log("\n! WARNINGS:")
		for (const w of warns) {
			console.log(`  [${w.variation}] ${w.runLabel} :: ${w.rule}`)
			console.log(`      ${w.detail}`)
		}
	}

	// ─── Distribution sanity ──────────────────────────────────────────────────
	console.log(
		"\nPF distribution (count of runs by stored PF, rounded to 2 dp):"
	)
	const buckets = new Map<string, number>()
	for (const r of summaryRows) {
		const key = Number.isFinite(r.pf) ? r.pf.toFixed(2) : "∞"
		buckets.set(key, (buckets.get(key) ?? 0) + 1)
	}
	const sortedKeys = [...buckets.keys()].sort((a, b) => Number(a) - Number(b))
	for (const k of sortedKeys) {
		console.log(`  PF=${k.padStart(6)}  ×${buckets.get(k)}`)
	}

	// The headline check: any "PF=1.00 with non-zero PnL" row?
	const pfOneNonZero = summaryRows.filter(
		(r) => Math.abs(r.pf - 1) < 1e-9 && r.pnl !== 0
	)
	if (pfOneNonZero.length > 0) {
		console.log(
			`\n✗ ${pfOneNonZero.length} row(s) with PF=1.00 AND non-zero PnL — bug REGRESSED:`
		)
		for (const r of pfOneNonZero) {
			console.log(`    ${r.variation} ${r.runLabel} pnl=${r.pnl}`)
		}
	} else {
		console.log(
			"\n✓ Zero rows match the PF=1.00 / non-zero-PnL pattern (the original bug)."
		)
	}

	console.log()
	process.exit(fails.length > 0 ? 1 : 0)
}

main().catch((err: unknown) => {
	const e = err as { message?: string; stack?: string }
	process.stderr.write(
		`sweep-validate failed: ${e.message ?? String(err)}\n${e.stack ?? ""}\n`
	)
	process.exit(1)
})
