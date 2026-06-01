/**
 * sweep-detective.ts
 *
 * Detective harness — for every sweepable axis in HAWKS_SWEEPABLE_PARAMS,
 * run an *isolated* per-axis sweep with the rest of the recipe fixed and
 * determine empirically whether the axis CAN affect PnL / PF / trade count.
 *
 * Outputs three verdicts per axis:
 *
 *   GATES      — flips trade count or PnL. Sweeping it changes outcomes.
 *                Optimizer benefits from sweeping it.
 *   LABEL-ONLY — changes tier metadata only. Same trades, same PnL, same
 *                PF. Sweeping wastes optimizer time. The UI should grey it
 *                out / mark it "not gating" when the user wants outcome
 *                optimization.
 *   DEAD       — no observable effect at all. Same trades AND same tier
 *                contributions. Almost certainly a bug — wired into config
 *                but no rule reads it.
 *
 * Runs each axis twice: once with bundle=off (baseline), once with
 * bundle=strict (all gates active). If an axis is dead with bundle=off but
 * GATES with bundle=strict, it's conditionally active and not a bug.
 *
 * Usage:
 *   pnpm tsx scripts/sweep-detective.ts
 *   pnpm tsx scripts/sweep-detective.ts --from 2026-04-01 --to 2026-05-30
 *
 * Exit code 0 always (this is a diagnostic, not a gate).
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
	BacktestSummary,
	BacktestTrade,
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

// ── Mutators ────────────────────────────────────────────────────────────────

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

// ── Dual-mode rule mode axes (Piece B.1) ───────────────────────────────────
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

// ── Fingerprint comparison ──────────────────────────────────────────────────

interface RunFingerprint {
	trades: number
	pnl: number
	pf: number
	wr: number
	sharpe: number
	avgR: number
	maxDD: number
	tierSummary: string
	/** Per-rule signal counts: rule-key → { favor, penalty, neutral } */
	contribSummary: string
	/** Total raw score sum across all trades (catches negative-only deltas). */
	totalScore: number
}

const sigOf = (s: BacktestSummary, trades: BacktestTrade[]): RunFingerprint => {
	const tiers: Record<string, number> = {
		"AAA": 0,
		"AA": 0,
		"A": 0,
		"B": 0,
		"?": 0,
	}
	const contribs: Record<
		string,
		{ favor: number; penalty: number; neutral: number }
	> = {}
	let totalScore = 0
	for (const t of trades) {
		const k = t.quality?.tier ?? "?"
		tiers[k] = (tiers[k] ?? 0) + 1
		totalScore += t.quality?.score ?? 0
		for (const c of t.quality?.contributions ?? []) {
			if (!contribs[c.key]) {
				contribs[c.key] = { favor: 0, penalty: 0, neutral: 0 }
			}
			if (c.signal === "favor") {
				contribs[c.key]!.favor++
			} else if (c.signal === "penalty") {
				contribs[c.key]!.penalty++
			} else {
				contribs[c.key]!.neutral++
			}
		}
	}
	const contribKeys = Object.keys(contribs).sort()
	const contribSummary = contribKeys
		.map(
			(k) =>
				`${k}:f=${contribs[k]!.favor},p=${contribs[k]!.penalty},n=${contribs[k]!.neutral}`
		)
		.join("|")
	return {
		trades: s.totalTrades,
		pnl: s.totalPnlCents,
		pf: Number.isFinite(s.profitFactor)
			? Number(s.profitFactor.toFixed(8))
			: NaN,
		wr: Number(s.winRate.toFixed(8)),
		sharpe: Number(s.sharpeRatio.toFixed(8)),
		avgR: Number(s.avgRMultiple.toFixed(8)),
		maxDD: s.maxDrawdownCents,
		tierSummary: `AAA=${tiers["AAA"]}|AA=${tiers["AA"]}|A=${tiers["A"]}|B=${tiers["B"]}`,
		contribSummary,
		totalScore: Number(totalScore.toFixed(8)),
	}
}

const sameOutcome = (a: RunFingerprint, b: RunFingerprint): boolean =>
	a.trades === b.trades &&
	a.pnl === b.pnl &&
	a.pf === b.pf &&
	a.wr === b.wr &&
	a.sharpe === b.sharpe &&
	a.avgR === b.avgR &&
	a.maxDD === b.maxDD

const sameTiers = (a: RunFingerprint, b: RunFingerprint): boolean =>
	a.tierSummary === b.tierSummary &&
	a.contribSummary === b.contribSummary &&
	a.totalScore === b.totalScore

// ── Axis definitions ────────────────────────────────────────────────────────

interface AxisProbe {
	id: string
	label: string
	values: Array<{
		key: string
		apply: (_r: StrategyRecipe) => StrategyRecipe
	}>
	/** If true: also test with bundle=strict baseline to surface conditional axes. */
	dependsOnBundle?: boolean
	expectedRole: "GATES" | "LABEL-ONLY" | "DEAD" | "GATES (engine)"
	notes?: string
}

const axes: AxisProbe[] = [
	// ── Tier 1: outcome knobs ───────────────────────────────────
	{
		id: "stop.breakeven.triggerPct",
		label: "BE trigger %",
		values: [50, 100, 150, 200].map((v) => ({
			key: String(v),
			apply: (r) => withBe(r, v),
		})),
		expectedRole: "GATES (engine)",
	},
	{
		id: "target.levels.0.value",
		label: "Target R-multiple",
		values: [2, 2.5, 3, 3.5, 4].map((v) => ({
			key: String(v),
			apply: (r) => withR(r, v),
		})),
		expectedRole: "GATES (engine)",
	},
	{
		id: "slippageTicks",
		label: "Slippage ticks",
		values: [0, 1, 2, 3].map((v) => ({
			key: String(v),
			apply: (r) => withSlip(r, v),
		})),
		expectedRole: "GATES (engine)",
	},

	// ── Tier 2A: quality bundle ─────────────────────────────────
	{
		id: "qualityGates.__bundle__",
		label: "Quality bundle",
		values: (["off", "lite", "standard", "strict"] as const).map((v) => ({
			key: v,
			apply: (r) => withBundle(r, v),
		})),
		expectedRole: "GATES",
	},

	// ── Tier 2B: within-bundle numerics ────────────────────────
	{
		id: "qualityGates.srBlockBufferBricks",
		label: "SR block buffer bricks",
		values: [1, 2, 3, 4].map((v) => ({
			key: String(v),
			apply: (r) => withGate(r, "srBlockBufferBricks", v),
		})),
		dependsOnBundle: true,
		expectedRole: "GATES",
		notes: "Used in srLevelBlockRule (BLOCK rule)",
	},
	{
		id: "qualityGates.srFavorRangeBricks",
		label: "SR favor range bricks",
		values: [2, 3, 4, 5].map((v) => ({
			key: String(v),
			apply: (r) => withGate(r, "srFavorRangeBricks", v),
		})),
		dependsOnBundle: true,
		expectedRole: "LABEL-ONLY",
		notes: "Used only in buildSrFavorRule (score rule, label only)",
	},
	{
		id: "qualityGates.keltnerNearBricks",
		label: "Keltner near bricks",
		values: [1, 2, 3].map((v) => ({
			key: String(v),
			apply: (r) => withGate(r, "keltnerNearBricks", v),
		})),
		dependsOnBundle: true,
		expectedRole: "GATES",
		notes:
			"Used in keltnerOuterBlockRule (BLOCK) and keltnerInnerPenaltyRule (score)",
	},
	{
		id: "qualityGates.macdSlopeWindow",
		label: "MACD slope window",
		values: [2, 3, 4, 5].map((v) => ({
			key: String(v),
			apply: (r) => withGate(r, "macdSlopeWindow", v),
		})),
		dependsOnBundle: true,
		expectedRole: "LABEL-ONLY",
		notes:
			"Sizes the recentMacd buffer consumed by macdSignSlopeRule (score only)",
	},
	{
		id: "qualityGates.aggressionThreshold",
		label: "Aggression threshold",
		// Range spans p25 → p99 of the observed aggression_balance distribution
		// for WIN 5m (see scripts/peek-aggression-sign.ts). The previous range
		// [5000..25000] missed the upper tail (max ≈ 44K) and — combined with the
		// default scoreMode="off" baseline — never let the threshold's effect
		// surface, producing a false "DEAD" verdict.
		values: [2500, 5000, 10000, 15000, 20000, 30000, 40000].map((v) => ({
			key: String(v),
			// Force scoreMode="original" so the rule actually consults the
			// threshold (with scoreMode="off" the rule short-circuits and the
			// threshold is unobservable regardless of value).
			apply: (r) =>
				withGate(
					withAggressionScoreMode(r, "original"),
					"aggressionThreshold",
					v
				),
		})),
		dependsOnBundle: true,
		expectedRole: "LABEL-ONLY",
		notes:
			"Used only in aggressionRule (score rule, label only). Probe forces aggression.scoreMode='original' so threshold has observable effect.",
	},
	{
		id: "qualityGates.volumeEmaPeriod",
		label: "Volume EMA period",
		values: [300, 400, 500, 600, 700].map((v) => ({
			key: String(v),
			apply: (r) => withGate(r, "volumeEmaPeriod", v),
		})),
		dependsOnBundle: true,
		expectedRole: "LABEL-ONLY",
		notes: "volumeAboveEmaRule is a score rule (label only)",
	},

	// ── Tier 2C: boolean toggles ───────────────────────────────
	{
		id: "qualityGates.srLevelBlock",
		label: "SR level block toggle",
		values: [false, true].map((v) => ({
			key: v ? "on" : "off",
			apply: (r) => withGate(r, "srLevelBlock", v),
		})),
		expectedRole: "GATES",
	},
	{
		id: "qualityGates.srLevelFavor",
		label: "SR level favor toggle",
		values: [false, true].map((v) => ({
			key: v ? "on" : "off",
			apply: (r) => withGate(r, "srLevelFavor", v),
		})),
		expectedRole: "LABEL-ONLY",
	},
	{
		id: "qualityGates.keltnerOuterBlock",
		label: "Keltner outer block toggle",
		values: [false, true].map((v) => ({
			key: v ? "on" : "off",
			apply: (r) => withGate(r, "keltnerOuterBlock", v),
		})),
		expectedRole: "GATES",
	},
	{
		id: "qualityGates.keltnerInnerPenalty",
		label: "Keltner inner penalty toggle",
		values: [false, true].map((v) => ({
			key: v ? "on" : "off",
			apply: (r) => withGate(r, "keltnerInnerPenalty", v),
		})),
		expectedRole: "LABEL-ONLY",
	},
	{
		id: "qualityGates.macdAlignmentScore",
		label: "MACD alignment score toggle",
		values: [false, true].map((v) => ({
			key: v ? "on" : "off",
			apply: (r) => withGate(r, "macdAlignmentScore", v),
		})),
		expectedRole: "LABEL-ONLY",
		notes: "Activates macdSignSlopeRule (score rule, tier-label only)",
	},
	{
		id: "qualityGates.volumeScore",
		label: "Volume score toggle",
		values: [false, true].map((v) => ({
			key: v ? "on" : "off",
			apply: (r) => withGate(r, "volumeScore", v),
		})),
		expectedRole: "LABEL-ONLY",
	},
	{
		id: "qualityGates.htfMaBlock",
		label: "HTF MA block toggle (legacy)",
		values: [false, true].map((v) => ({
			key: v ? "on" : "off",
			apply: (r) => withGate(r, "htfMaBlock", v),
		})),
		expectedRole: "GATES",
	},
	{
		id: "qualityGates.aggressionMode",
		label: "Aggression mode",
		values: (["off", "original", "reversed"] as const).map((v) => ({
			key: v,
			apply: (r) => withGate(r, "aggressionMode", v),
		})),
		expectedRole: "LABEL-ONLY",
		notes: "Score rule only; sweeping changes tier label, not PnL",
	},

	// ── Tier 2D: dual-mode rule modes (Piece B.1) ──────────────
	{
		id: "entry.config.qualityGates.keltnerInner.mode",
		label: "Keltner inner dual-mode",
		values: (["off", "score", "block", "both"] as const).map((v) => ({
			key: v,
			apply: (r) => withKeltnerInnerMode(r, v),
		})),
		dependsOnBundle: true,
		expectedRole: "GATES",
		notes:
			"Dual-mode rule; can gate (block) or score (penalty); sweeping changes PnL and trade count",
	},
	{
		id: "entry.config.qualityGates.macd.mode",
		label: "MACD dual-mode",
		values: (["off", "score", "block", "both"] as const).map((v) => ({
			key: v,
			apply: (r) => withMacdMode(r, v),
		})),
		dependsOnBundle: true,
		expectedRole: "GATES",
		notes:
			"Dual-mode rule; can gate (block) or score (penalty/favor); sweeping changes PnL and trade count",
	},
	{
		id: "entry.config.qualityGates.volume.mode",
		label: "Volume dual-mode",
		values: (["off", "score", "block", "both"] as const).map((v) => ({
			key: v,
			apply: (r) => withVolumeMode(r, v),
		})),
		dependsOnBundle: true,
		expectedRole: "GATES",
		notes:
			"Dual-mode rule; can gate (block) or score (penalty/favor); sweeping changes PnL and trade count",
	},
	{
		id: "entry.config.qualityGates.aggression.scoreMode",
		label: "Aggression split-mode scoreMode",
		values: (["off", "original", "reversed"] as const).map((v) => ({
			key: v,
			apply: (r) => withAggressionScoreMode(r, v),
		})),
		dependsOnBundle: true,
		expectedRole: "GATES",
		notes:
			"Split-mode rule; can score with different signal interpretation; sweeping changes tier score and PnL",
	},
	{
		id: "entry.config.qualityGates.aggression.blockMode",
		label: "Aggression split-mode blockMode",
		values: (["off", "blockOnAligned", "blockOnAnti"] as const).map((v) => ({
			key: v,
			apply: (r) => withAggressionBlockMode(r, v),
		})),
		dependsOnBundle: true,
		expectedRole: "GATES",
		notes:
			"Split-mode rule; can gate with different signal interpretation; sweeping changes trade count",
	},

	// ── Tier 3A: engine state machine ──────────────────────────
	{
		id: "entry.config.fireCooldownBricks",
		label: "Fire cooldown bricks",
		values: [3, 4, 5, 6, 7].map((v) => ({
			key: String(v),
			apply: (r) => withCooldown(r, v),
		})),
		expectedRole: "GATES (engine)",
	},
	{
		id: "entry.config.wave1MinBricks",
		label: "Wave-1 min bricks",
		values: [3, 4, 5, 6].map((v) => ({
			key: String(v),
			apply: (r) => withWave1(r, v),
		})),
		expectedRole: "GATES (engine)",
	},
	{
		id: "entry.config.retracementMinBricks",
		label: "Retracement min bricks",
		values: [1, 2, 3].map((v) => ({
			key: String(v),
			apply: (r) => withRetrace(r, v),
		})),
		expectedRole: "GATES (engine)",
	},
]

// ── Probe ───────────────────────────────────────────────────────────────────

interface AxisVerdict {
	id: string
	label: string
	bundle: "off" | "strict"
	gates: boolean
	changesTier: boolean
	fingerprints: Map<string, RunFingerprint>
	expectedRole: AxisProbe["expectedRole"]
	notes?: string
}

const probeAxis = (
	axis: AxisProbe,
	candles: CandleRow[],
	bundleBaseline: "off" | "strict"
): AxisVerdict => {
	const fingerprints = new Map<string, RunFingerprint>()
	const baseline = withBundle(hawksV0, bundleBaseline)
	for (const v of axis.values) {
		const recipe = v.apply(baseline)
		const result = runBacktest(candles, recipe, ASSET_CONFIG)
		fingerprints.set(v.key, sigOf(result.summary, result.trades))
	}
	const fps = [...fingerprints.values()]
	const first = fps[0]!
	const outcomesIdentical = fps.every((f) => sameOutcome(first, f))
	const tiersIdentical = fps.every((f) => sameTiers(first, f))
	return {
		id: axis.id,
		label: axis.label,
		bundle: bundleBaseline,
		gates: !outcomesIdentical,
		changesTier: !tiersIdentical,
		fingerprints,
		expectedRole: axis.expectedRole,
		notes: axis.notes,
	}
}

const classify = (v: AxisVerdict): "GATES" | "LABEL-ONLY" | "DEAD" => {
	if (v.gates) {
		return "GATES"
	}
	if (v.changesTier) {
		return "LABEL-ONLY"
	}
	return "DEAD"
}

// ── Main ────────────────────────────────────────────────────────────────────

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
	console.log(`Loaded ${candles.length} candles\n`)

	console.log(
		"axis".padEnd(38) +
			"baseline".padEnd(12) +
			"actual".padEnd(12) +
			"expected".padEnd(12) +
			"agree?"
	)
	console.log("─".repeat(86))

	const disagreements: AxisVerdict[] = []
	for (const axis of axes) {
		const baselines: Array<"off" | "strict"> = axis.dependsOnBundle
			? ["off", "strict"]
			: ["off"]
		for (const baseline of baselines) {
			const v = probeAxis(axis, candles, baseline)
			const actual = classify(v)
			const expected = axis.expectedRole.replace(" (engine)", "")
			const agree = actual === expected
			console.log(
				`${axis.label.padEnd(38)}${baseline.padEnd(12)}${actual.padEnd(12)}${expected.padEnd(12)}${agree ? "✓" : "✗"}`
			)
			if (!agree && baseline === (axis.dependsOnBundle ? "strict" : "off")) {
				disagreements.push(v)
			}
			// Also print extended fingerprint when DEAD verdict
			if (classify(v) === "DEAD") {
				console.log(`    [DEAD details for ${axis.label} @ ${baseline}]`)
				for (const [k, f] of v.fingerprints) {
					console.log(
						`      ${k.padEnd(10)} trades=${f.trades} pnl=${f.pnl} totalScore=${f.totalScore} contribs=[${f.contribSummary || "—"}]`
					)
				}
			}
		}
	}

	console.log()
	console.log("══════════════════════════════════════════════════════════════")
	console.log("DETECTIVE SUMMARY")
	console.log("══════════════════════════════════════════════════════════════")
	const live = axes.length // each axis tested at least once
	console.log(`Axes probed:                   ${live}`)
	console.log(`Disagreements with prediction: ${disagreements.length}`)
	if (disagreements.length > 0) {
		console.log("\nDISAGREEMENTS (axis behavior ≠ predicted):")
		for (const d of disagreements) {
			console.log(`  ${d.id}`)
			console.log(`    expected ${d.expectedRole} but observed ${classify(d)}`)
			if (d.notes) {
				console.log(`    note: ${d.notes}`)
			}
			console.log(`    fingerprints:`)
			for (const [k, f] of d.fingerprints) {
				console.log(
					`      ${k.padEnd(10)} trades=${String(f.trades).padStart(4)} pnl=${String(f.pnl).padStart(8)} pf=${f.pf.toFixed(4)} tiers=[${f.tierSummary}]`
				)
			}
		}
	}

	// Classification roll-up
	const tally: Record<string, string[]> = {
		"GATES": [],
		"LABEL-ONLY": [],
		"DEAD": [],
	}
	for (const axis of axes) {
		const baseline: "off" | "strict" = axis.dependsOnBundle ? "strict" : "off"
		const v = probeAxis(axis, candles, baseline)
		tally[classify(v)]!.push(axis.id)
	}
	console.log(
		"\n── CLASSIFICATION (under strict bundle for bundle-dependent axes) ──"
	)
	for (const k of ["GATES", "LABEL-ONLY", "DEAD"] as const) {
		console.log(`\n${k} (${tally[k].length}):`)
		for (const id of tally[k]) {
			console.log(`  ${id}`)
		}
	}

	process.exit(0)
}

main().catch((err: unknown) => {
	const e = err as { message?: string; stack?: string }
	process.stderr.write(
		`sweep-detective failed: ${e.message ?? String(err)}\n${e.stack ?? ""}\n`
	)
	process.exit(1)
})
