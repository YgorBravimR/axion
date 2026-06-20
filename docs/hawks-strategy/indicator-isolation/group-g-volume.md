# Indicator-Isolation Audit — Group G: Volume (`volume_fin`)

**Status**: GRADED — **DEAD GATE. NO ENGINE CONSUMER. NO METHODOLOGY SPEC.**
The `qualityGates.volumeScore` flag (legacy) and `qualityGates.volume.{mode, emaPeriod}` (nested) exist in `EntryQualityGates`. Both are surfaced in UI controls, preset bundles, the leaves catalog, and `optimize/storage.ts` migration code. **No engine module reads either.** The methodology spec is one sentence in `src/types/backtest.ts:266`: _"+weight if brick volume > running EMA"_. The configurable knob is the EMA period (default 500). There's no historical probe, no folklore claim, and the `(planned)` tag has been sitting there indicating the gate was never actually finished.

**Date filed**: 2026-06-16.
**Date graded**: 2026-06-16.

---

## Verdict — DEAD GATE (likely DELETE, audit will confirm)

| Aspect                                             | Status        | Evidence                                                                                                                                                                                       |
| -------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine reads `volumeScore` (legacy flat)           | **NOT WIRED** | `grep -rln "volumeScore" src/lib/backtest/` returns presets only. The runtime entry-decision path never reads it.                                                                              |
| Engine reads `volume.mode` / `.emaPeriod` (nested) | **NOT WIRED** | Same — referenced by leaves catalog + presets only.                                                                                                                                            |
| Probe / audit history                              | **NONE**      | No prior probe script existed. Type comment is tagged `(planned)` — the rule was scoped but never implemented.                                                                                 |
| Data coverage                                      | **GOOD**      | `volume_fin` is in the 5m parquet (and 15m / 60m). Catalog distribution: min 0, p10 0.43B, median 2.87B, p90 10.43B, max 61B. 319 zeros (~4%) — likely pre-open / post-close bricks. No nulls. |
| UI gate toggles                                    | **DEAD UI**   | `hawks-quality-controls.tsx` renders volume mode + emaPeriod controls. No engine reader.                                                                                                       |
| `strict` preset bundle                             | **DEAD**      | Sets volume flags; identical fires to OFF.                                                                                                                                                     |

Same shape as aggression (Group F) — UI affordances + config + leaves but zero engine consumption. Simpler than F because there's no polarity question (volume is direction-agnostic) and no folklore claim to grill.

---

## What this audit checks

For each baseline engine fire (332 trades, hawks v0 OFF run on the 2026-03-02 → 2026-06-13 catalog), classify the fire-brick volume against the running EMA at multiple EMA periods:

- **ABOVE** — `volume_fin > ema(volume_fin, N)` at fire brick
- **BELOW** — `volume_fin ≤ ema(volume_fin, N)` and `volume_fin > 0`
- **ZERO** — `volume_fin === 0` (degenerate)

Tested EMA periods: N ∈ {50, 100, 200, 500, 1000}. The default config knob is 500 ≈ 4 trading days; we sweep around it to see whether the result is sensitive to N.

Per bucket per N, report:

- count, % of all baseline trades
- win rate, net PnL, avg R-multiple

**Decision criterion**: ABOVE bucket needs ≥5pp win-rate lift over BELOW with n ≥ ~30 to be worth wiring. Anything smaller is noise at the catalog sample size.

---

## Source mapping

| Column       | Source            | TF coverage  | Notes                                                                      |
| ------------ | ----------------- | ------------ | -------------------------------------------------------------------------- |
| `volume_fin` | parquet per-brick | 5m, 15m, 60m | Financial volume per brick. Methodology cares about 5m brick at fire time. |

The "running EMA" is computed on the same TF as the candles being graded (5m). Standard EMA recurrence: `ema[i] = α * v[i] + (1 − α) * ema[i−1]` with `α = 2 / (N + 1)`. Seed with the first non-zero value or the simple average of the first N values (audit script chooses; document the choice).

---

## Paragraph 1 — What Axion's code currently does

**Nothing at runtime.** The engine never reads `volume_fin`. The visible-lab chart (`hawks-isolation-charts.tsx`) renders volume as an overlay — read-only display. The `volumeScore` flag and `volume.mode` toggles have no consumer. The `(planned)` tag in the type comment is the honest label — this rule was scoped but never implemented.

## Paragraph 2 — What the methodology requires (per the one-sentence spec)

For each candidate entry at brick fire time:

**Score mode (only one sensible polarity for volume):**

- if `volume_fin > ema(volume_fin, emaPeriod)` → +1 score (high volume = conviction)
- else → 0 (no contribution)

Volume is **direction-agnostic** — there's no SHORT/LONG distinction. High volume aids both. This is different from aggression (where polarity matters) and Keltner / SR (where direction determines block-vs-favor).

**Block mode** (per the nested-shape type definition): could fire on the OPPOSITE condition — block entries with below-EMA volume ("don't trade in dead bricks"). This is the only sensible block polarity.

The audit will measure BOTH:

1. **ABOVE-EMA score lift** — does ABOVE outperform BELOW at engine fires?
2. **BELOW-EMA block** — would vetoing BELOW-EMA fires remove mostly losers (improving residual PnL)?

---

## After Group G is verified

Three paths depending on what the audit finds (mirrors Group F):

1. **If ABOVE-EMA bucket shows ≥5pp win-rate lift** at any N with n ≥ 30: wire `volume.mode = "score"` as a +score rule, default-off. Requires a scoring system that actually CONSUMES tier scores (`EntrySignal.quality.score` has no writer rule today — same blocker as the SR-favor signal).

2. **If BELOW-EMA bucket has a clearly worse win rate** AND vetoing it would remove mostly losers without removing winners: wire `volume.mode = "block"` as a veto consumer alongside `keltnerOuterBlock`. Default-off.

3. **If neither**: **delete the flags entirely.** Same cleanup as Group F — strip `volumeScore`, `volumeEmaPeriod`, `volume.*` from `EntryQualityGates`, remove UI controls, prune presets / leaves, clean optimize/storage migration. Replace the `(planned)` comment with a "see Group G audit" pointer.

---

## Open questions (parking lot, decide before any wiring decision)

1. **EMA seeding.** Should the running EMA seed with the first non-zero brick value, or with a simple mean of the first N values? The audit will choose one (first-non-zero, simplest) but the choice matters for the first ~N bricks of the catalog. Recommendation: drop the first N bricks from the bucket counts so EMA warm-up doesn't pollute the analysis.

2. **Should zero-volume bricks count?** 319 of 8,280 bricks have `volume_fin = 0` (~4%, mostly pre-open). At engine fires the count is likely much lower (engine has `startTime`/`endTime` filters). Recommendation: bucket as ZERO separately, don't aggregate into BELOW.

3. **Is the EMA the right baseline?** Alternatives: simple moving average (less responsive), per-time-of-day baseline (volume has intraday seasonality — 09:00 BRT is dead, 11:30 BRT is hot, 14:30 BRT is the US open). A naive EMA mixes morning + afternoon, so "above-EMA at 14:30" is structurally easier than "above-EMA at 09:00". The audit will note this if results are inconclusive — a time-of-day-normalized baseline may be the real methodology.

4. **Volume on 15m or 60m TF instead of 5m?** Per the methodology comment, 5m volume vs 5m EMA. But a 5m brick's volume is noisy; a 15m or 60m view may be more stable. Out of scope for this first audit pass.

5. **Score weight + consumer.** Same as Group F: even if we wire score-mode, there's no live `EntrySignal.quality.score` consumer that reads it. Wiring this is hollow until a scoring system exists.

These are pre-wiring decisions, confirm before promoting any code change.

---

## Empirical results (2026-06-16 catalog run)

Full findings: [`docs/scans/2026-06-16-group-g-volume.md`](../../scans/2026-06-16-group-g-volume.md).

**The methodology spec's polarity is empirically wrong.** Across all 5 tested EMA periods (50, 100, 200, 500, 1000), the ABOVE-EMA bucket has LOWER win rate AND lower PnL than the BELOW-EMA bucket. At the default N=500: ABOVE 31.13% wr / −R$612; BELOW 32.79% wr / +R$1,485. The block-mode simulation (veto BELOW-EMA fires) destroys R$ 875–1,485 of baseline PnL at every N — wiring it would be the worst possible move.

| N (EMA period) | ABOVE wr | BELOW wr | Lift (pp) | ABOVE net | BELOW net |
| -------------: | -------: | -------: | --------: | --------: | --------: |
|             50 |   30.63% |   33.33% | **−2.70** |   −R$ 767 | +R$ 1,640 |
|            100 |   29.63% |   34.17% | **−4.54** |   −R$ 911 | +R$ 1,784 |
|            200 |   31.73% |   32.26% | **−0.53** |     −R$ 2 |   +R$ 875 |
|            500 |   31.13% |   32.79% | **−1.65** |   −R$ 612 | +R$ 1,485 |
|           1000 |   31.78% |   32.23% | **−0.46** |   −R$ 359 | +R$ 1,232 |

**Verdict: DELETE the flags.** Option 3 from the wiring-decision section. The conjecture from the spec is wrong (or doesn't port to Renko/Hawks), and even an inverted-polarity wiring isn't justifiable at this sample size. The cleanup mechanically matches the Group F (aggression) deletion — combine them in one PR.
