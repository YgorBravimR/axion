# Hawks engine v0.6 — state machine + quality registry

Source-of-truth doc for the autonomous Hawks Triple-Screen entry engine and
its quality-scoring layer. Companion to:

- [`README.md`](./README.md) — Renko brick rules + BE/stop mechanics
- [`./indicator-inventory.md`](./indicator-inventory.md) — indicator decisions
- [`./improvement-plan.md`](./improvement-plan.md) — 8-step roadmap
- [`../../scripts/audit-parallel.ts`](../../scripts/audit-parallel.ts) — reproduction audit
- [`../../scripts/probe-*.ts`](../../scripts/) — per-indicator selectivity probes

---

## TL;DR

| Item                                               | Value                                                               |
| -------------------------------------------------- | ------------------------------------------------------------------- |
| Engine version                                     | `hawks-v0.6`                                                        |
| Entry module                                       | `src/lib/backtest/modules/entry/hawks-triple-screen.ts`             |
| Quality registry                                   | `src/lib/backtest/modules/entry/hawks-quality-rules.ts`             |
| Catalog reproduction (all gates off)               | **51.4%** (52 EXACT + 2 NEAR / 105 catalog fires)                   |
| Catalog reproduction (`htfMaBlock + srLevelFavor`) | **52.4%** / 55 EXTRAS                                               |
| Best tier separation                               | AAA = 12 catalog / 5 extras (full rules + agg-original + volume)    |
| Trigger semantics                                  | `brick_close` (no intra-brick wick triggers)                        |
| Cross-day continuity                               | TOPO/FUNDO anchors persist; intraday trackers clear at day boundary |
| Cooldown between fires                             | 5 bricks                                                            |

---

## Part 1 — Entry state machine

### Phases

| Phase                | Meaning                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `WAITING_TOPO_MAIOR` | No anchor pivot yet — pre-history                                               |
| `WAVE_1_DOWN`        | SHORT: have TOPO MAIOR, waiting for indicator FUNDO                             |
| `WAVE_2_UP`          | SHORT: have TOPO MAIOR + FUNDO, watching every brick for the lower-high trigger |
| `WAVE_1_UP`          | LONG (mirror): have FUNDO MAIOR, waiting for indicator TOPO                     |
| `WAVE_2_DOWN`        | LONG (mirror): have FUNDO MAIOR + TOPO, watching for higher-low trigger         |

### SHORT setup (mirror for LONG)

1. Indicator paints **TOPO MAIOR** (anchor pivot).
2. Indicator paints **FUNDO** with `(TOPO_MAIOR − FUNDO) ≥ 4 × brick`.
3. After FUNDO, engine tracks `maxHighSinceFundo` brick-close-by-brick-close (no wicks).
4. On every bearish brick where:
   - `brick.high < TOPO_MAIOR` (descending lower-high), AND
   - `maxHighSinceFundo − FUNDO ≥ 2 × brick` (sufficient retracement), AND
   - 15m/60m EMA gate aligned bearish (both prev-15m and prev-60m bricks O+C below both `mme27/55` EMAs), AND
   - 5-brick cooldown elapsed since last fire,
     → **fire SHORT at this brick's close**. Stop reference = `2 × open − close + tickSize`.

### brickSize per brick

Dynamic, not from preset:

```ts
bodySize = abs(close − open)
brickSize = bodySize > 0 ? bodySize : config.brickSize5mPoints  // preset fallback for doji
```

ProfitChart Renko-R: body = `(R − 1) × tickSize`. For WIN tickSize=5, a 33R Renko brick body is `32 × 5 = 160 pts`.

### Stay-armed re-arm policy

After a fire, the engine does NOT reset to `WAVE_1_DOWN`. It stays in `WAVE_2_UP` (SHORT) or `WAVE_2_DOWN` (LONG) with:

- `topoMaiorPrice` preserved (TOPO continuity for wave-1)
- `fundoPrice` reset to the **fire brick's close**
- `maxHighSinceFundo` reset to the fire brick's close
- `lastFireBrickIndex` set to current candle index

Two paths to re-fire:

- **Slide-down fundo**: a later bearish brick whose close < current `fundoPrice` slides `fundoPrice` to that new low (and resets `maxHighSinceFundo`). This extends wave-1 without needing the indicator to paint a new FUNDO (which would lag 2 bricks).
- **Bounce-and-go**: from the current `fundoPrice`, a 2-brick close-based retracement up triggers the lower-high check on the next bearish brick.

Both paths require the 5-brick cooldown to have elapsed.

### Day boundary

At `candleIndexInDay === 0`:

- `phase` → `WAVE_1_DOWN`
- Clear intraday trackers: `fundoPrice`, `maxHighSinceFundo`, `topoPrice`, `minLowSinceTopo`, `lastFireBrickIndex`, `consecutiveAgainstInWave1`
- **Preserve** `topoMaiorPrice`, `fundoMaiorPrice`, `lastPivotPrice` (pivot continuity across sessions)
- **Preserve** `qualityContext` (volume EMA must not reset)

### Time window

`startTime: 900` to `endTime: 1730` (BRT HHMM). The 09:00 start is intentional — the morning's first pivots (FUNDO around 09:04, TOPO around 09:10) need to update state. Gating later would silently skip them.

---

## Part 2 — Quality registry

Quality is **opt-in metadata**: every rule defaults OFF. The engine baseline behaves identically to the no-quality version when no flags are set. Each rule contributes:

- **BLOCK**: refuses the fire (hard disqualifier)
- **FAVOR**: `+weight` toward `TradeQuality.score`
- **PENALTY**: `−weight` toward `TradeQuality.score`
- **NEUTRAL**: no contribution

After all rules evaluate, score is bucketed into tier:

- `AAA` if `score ≥ tierThresholds.AAA` (default 3)
- `AA` if `score ≥ tierThresholds.AA` (default 2)
- `A` if `score ≥ tierThresholds.A` (default 1)
- `B` otherwise (including negative)

Weights are 1.0 across all rules. The shape supports per-indicator weighting later when richer data justifies tuning.

### Group A — S/R levels

| Indicator   | Role                                  | Config flag                                                           | Default | Probe finding                          |
| ----------- | ------------------------------------- | --------------------------------------------------------------------- | ------- | -------------------------------------- |
| `mme27_60m` | BLOCK + FAVOR                         | `srLevelBlock` / `srLevelFavor` (or legacy `htfMaBlock` for MAs only) | OFF     | FAVOR predictiveness 5.83× (strongest) |
| `mme55_60m` | BLOCK + FAVOR                         | same                                                                  | OFF     | FAVOR 3.17×                            |
| `mme27_15m` | BLOCK + FAVOR                         | same                                                                  | OFF     | FAVOR 1.45×                            |
| `mme55_15m` | BLOCK + FAVOR                         | same                                                                  | OFF     | FAVOR 1.33×                            |
| `vwap_d_5m` | FAVOR only (BLOCK was probe-rejected) | `srLevelFavor`                                                        | OFF     | FAVOR 1.32×; BLOCK borderline          |
| `ajuste_d1` | FAVOR only                            | `srLevelFavor`                                                        | OFF     | FAVOR neutral but stays for re-probe   |

**Geometric rule** (sign convention: `signedDelta = dir === "short" ? L − P : P − L`):

- BLOCK if `−2 × brickSize ≤ signedDelta < 0` (level ahead within BE reach)
- FAVOR if `0 < signedDelta ≤ 3 × brickSize` (level behind within "launch" range)
- Tunable via `srBlockBufferBricks` (default 2), `srFavorRangeBricks` (default 3)

Recommended Group A config: `htfMaBlock + srLevelFavor`. Drops EXTRAS from 57→55 and lifts reproduction 51.4% → 52.4%. `srLevelBlock` (full 6-level BLOCK) was probe-rejected: vwap_d + ajuste BLOCK costs more catalog than it saves.

### Group B — Keltner exhaustion

| Indicator                             | Role    | Config flag           | Default | Probe finding                                                                   |
| ------------------------------------- | ------- | --------------------- | ------- | ------------------------------------------------------------------------------- |
| `keltner_inf_165` / `keltner_sup_165` | BLOCK   | `keltnerOuterBlock`   | OFF     | Within 2 bricks of outer wall = exhaustion; ∞× selectivity (tentative 1-sample) |
| `keltner_inf_125` / `keltner_sup_125` | PENALTY | `keltnerInnerPenalty` | OFF     | NEAR_125 (0 < d ≤ 2 bricks) selectivity 4.45× — strong                          |

**Direction-aware**: SHORT trades use `inf` (lower band) as their "ahead band"; LONG uses `sup`. The 125 band penalizes only when **NEAR** (approaching). When price has already crossed 125 (PAST*125), the catalog \_favors* it (8.6% vs 4.8% — anti-selective) so PAST_125 is intentionally NOT penalized.

Tunable via `keltnerNearBricks` (default 2).

### Group C — MACD

**Skipped**: probe at thresholds 2/3/4/5/7 showed selectivity ≈ 1.0× for both sign alignment and slope streaks. Redundant with HTF EMA gate (which pre-filters for sign alignment). The against-streak signal showed weak reversed polarity (catalog fires INTO falling MACD = "fade-the-move"), but absolute differences too small to ship.

### Group D — Aggression balance

| Indicator            | Role                         | Config flag                                         | Default | Probe finding                      |
| -------------------- | ---------------------------- | --------------------------------------------------- | ------- | ---------------------------------- |
| `aggression_balance` | FAVOR or PENALTY (tri-state) | `aggressionMode: "off" \| "original" \| "reversed"` | `"off"` | Selectivity 1.67× at threshold 15K |

**Polarity switch** with `aggressionMode`:

- `"off"` — rule disabled (default)
- `"original"` — ALIGNED → favor, ANTI → penalty (user's intuitive heuristic)
- `"reversed"` — ALIGNED → penalty, ANTI → favor (probe-supported: "late to the move")

Recommended setting when enabling: `"reversed"`. But combined with other rules, ORIGINAL produced the strongest AAA tier separation (12 vs 5).

Sign convention: positive `aggression_balance` = buy aggression (verified empirically against the catalog, 6.39× agree/disagree ratio with brick direction). Tunable via `aggressionThreshold` (default 15000).

### Group E — Volume vs running EMA

| Indicator | Role                       | Config flag   | Default | Probe finding                                                                            |
| --------- | -------------------------- | ------------- | ------- | ---------------------------------------------------------------------------------------- |
| `volume`  | FAVOR (direction-agnostic) | `volumeScore` | OFF     | **Strongest single signal**: catalog 54.3% / extras 40.0% at EMA-500 — selectivity 0.74× |

**Stateful**: volume EMA is maintained by `updateQualityContext()` on every brick, never reset. The rule compares `candle.indicators.volume > ctx.volumeEma`. Tunable via `volumeEmaPeriod` (default 500).

Single-brick EMA contribution is α = 2/501 ≈ 0.4%, so the bias from comparing against post-update EMA is negligible.

---

## Part 3 — QualityContext (engine state for stateful rules)

Lives on `HawksState.qualityContext`. Updated by `updateQualityContext()` once per brick BEFORE the fire check.

```ts
interface QualityContext {
	recentMacd: number[] // ring buffer; size = macdSlopeWindow + 1
	volumeEma: number | null // running EMA across all bricks, no day reset
}
```

`recentMacd` is wired but currently unused (Group C was skipped). It's available for future MACD slope rules when data justifies them.

---

## Part 4 — TradeQuality output shape

Attached to every fired trade via `BacktestTrade.quality`:

```ts
interface TradeQuality {
	tier: "AAA" | "AA" | "A" | "B"
	score: number
	contributions: IndicatorContribution[]
}

interface IndicatorContribution {
	key: string // e.g., "mme27_60m", "keltner_inner_penalty"
	signal: "favor" | "penalty" | "neutral"
	weight: number // 1.0 today
	contribution: number // +weight | -weight | 0
}
```

The `contributions` array preserves per-rule detail for UI surfaces and audit dashboards — useful for "why is this trade rated AA?" tooltips later.

---

## Part 5 — Audit + probe scripts

### Reproduction audit

`scripts/audit-parallel.ts` — runs the autonomous engine over the 20-day catalog, classifies each engine trade against the user's catalog as:

- **EXACT** (same brick + same direction)
- **NEAR** (±2 bricks, same direction)
- **DIRMISS** (same brick, wrong direction)
- **MISS** (catalog entry with no engine fire)
- **EXTRAS** (engine fires unmatched in catalog)

CLI flags toggle quality rules without touching the preset:

```
--htf-ma-block          legacy: BLOCK on 4 HTF MAs only
--sr-block              all 6 S/R BLOCK
--sr-favor              all 6 S/R FAVOR
--keltner-block         Keltner outer BLOCK
--keltner-penalty       Keltner inner PENALTY
--aggression            aggression rule, polarity = reversed
--aggression-original   aggression rule, polarity = original
--volume                volume FAVOR
```

### Selectivity probes (retired 2026-06-08)

The original per-indicator probes (`probe-level-zones`, `probe-keltner-exhaustion`, `probe-macd-alignment`, `probe-aggression-balance`, `probe-volume-vs-ema`, `inspect-indicator-keys`, `peek-aggression-sign`) ran against the pre-Parquet `price_candles` table and are deleted. The findings they produced (selectivity tables above, default thresholds, polarity decisions) remain the source of truth for current defaults. If a quality rule needs re-tuning as the catalog grows, write a fresh probe against the candle-store (`@/lib/candle-store`) instead of resurrecting these.

---

## Part 6 — Engine baseline contract

> "The BASE will have the MINIMUM CONDITION TO BE OPENED, we define the rest CONDITIONALLY BY USER INPUT" — Ygor, inventory note

Translation:

1. Engine baseline = structural rules only (5m brick + 15m EMA + 60m EMA + topo/fundo wave). No quality gates.
2. All quality gates default OFF. Toggle via `qualityGates.<flag>` config.
3. Each gate is an independent additive opt-in. No interactions enforced at config level.
4. UI surface (planned) reads from / writes to the same `qualityGates` shape — no serialization layer between UI and engine.

---

## Part 7 — Current results snapshot

20-day catalog, 105 catalog fires, varying EXTRAS counts:

| Configuration                             | Reproduction | EXTRAS | AAA (cat/extra) |
| ----------------------------------------- | ------------ | ------ | --------------- |
| Baseline (all OFF)                        | 51.4%        | 57     | 0 / 0 (all B)   |
| `htfMaBlock + srLevelFavor` (recommended) | **52.4%**    | 55     | 3 / 0           |
| + Keltner penalty + block                 | 52.4%        | 55     | 3 / 0           |
| + aggression-reversed                     | 52.4%        | 55     | 3 / 0           |
| + aggression-original                     | 52.4%        | 55     | 6 / 1           |
| + volume                                  | 52.4%        | 55     | 8 / 3           |
| + volume + aggression-reversed            | 52.4%        | 55     | 5 / 2           |
| **+ volume + aggression-original** (full) | **52.4%**    | 55     | **12 / 5**      |

Reproduction stays at 52.4% because quality rules are metadata only — they don't change which bricks fire, only how they're labeled. Tier separation varies dramatically — full-stack AAA has 12 catalog / 5 extras = 2.4× concentration.

---

## Part 8 — Engine version log

| Version | Key change                                                                                                                                                                            |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| v0.2    | Initial autonomous engine                                                                                                                                                             |
| v0.4    | Real-time TOPO MENOR detection (vs waiting for indicator)                                                                                                                             |
| v0.5    | Cooldown introduced (5 bricks); debug log removed                                                                                                                                     |
| v0.6    | Stay-armed re-arm + slide-fundo; dynamic brickSize; close-based retracement; trigger mode threaded through (`brick_close`); quality registry seeded; engine version label bumped here |

**v0.7 candidate** (not cut yet): all 5 groups wired, audit-validated. Currently `hawks-v0.6` still — baseline behavior preserved with flags off so no version bump strictly required. Cut v0.7 if you want the registry to be a binding part of the engine identity.
