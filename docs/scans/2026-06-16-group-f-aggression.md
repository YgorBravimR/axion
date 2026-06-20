# Group F — Aggression audit (findings)

**Date**: 2026-06-16.
**Window**: 2026-03-02 → 2026-06-13 (full catalog, 8,280 5m bricks, 332 baseline trades).
**Script**: [`scripts/indicator-isolation/group-f-aggression.ts`](../../scripts/indicator-isolation/group-f-aggression.ts)
**Audit spec**: [`docs/hawks-strategy/indicator-isolation/group-f-aggression.md`](../hawks-strategy/indicator-isolation/group-f-aggression.md)
**Standing directive**: drop `reversed` polarity from any wiring decision.

## TL;DR — DELETE THE FLAGS

Three facts force the verdict:

1. **The `ANTI` / reversed bucket is structurally empty.** Across all 332 baseline trades, ZERO fire with `agr_saldo` opposite the direction at any tested threshold T ∈ {5K, 10K, 15K, 20K, 25K}. **The HTF gate is doing aggression alignment implicitly.** Wiring `blockOnAnti` would veto nothing.
2. **The `original` ALIGNED bucket has a mild but unconvincing selectivity ratio.** At T=15K the win-rate lift over NEUTRAL is 1.133×. The lift grows monotonically with T (1.054 → 1.357 from 5K to 25K) but sample size collapses to n=14 at T=25K — the bigger ratios are noise.
3. **The "1.67× selectivity at 15K reversed" folklore is unreproducible.** Both polarities have been graded. Original is at 1.133×. Reversed has zero trades to grade. The claim does not survive a fresh audit on this engine version.

**Recommendation: Option 3 from the audit doc — delete the aggression config knobs.** They have no consumer, no probe script, no test, no audit support, and the implicit HTF behavior already enforces the conservative version of the rule (alignment-only entries).

This is the cleanest outcome. Dead config knobs that LOOK toggleable are worse than no flag — they tempt future readers into chasing a non-effect.

## Raw table — per-threshold buckets at the 332 fire bricks

| T (\|agr_saldo\| ≥) | ALIGNED n | ALIGNED wr | NEUTRAL n | NEUTRAL wr | ANTI n | Selectivity (ALIGNED/NEUTRAL) |
| ------------------: | --------: | ---------: | --------: | ---------: | -----: | ----------------------------: |
|               5,000 | 265 (80%) |     32.26% |  67 (20%) |     30.61% |  **0** |                     **1.054** |
|              10,000 | 194 (58%) |     32.09% | 138 (42%) |     31.68% |  **0** |                     **1.013** |
|              15,000 |  97 (29%) |     34.92% | 235 (71%) |     30.81% |  **0** |                     **1.133** |
|              20,000 |  43 (13%) |     37.04% | 289 (87%) |     31.25% |  **0** |                     **1.185** |
|              25,000 |   14 (4%) |     42.86% | 318 (96%) |     31.58% |  **0** |                     **1.357** |

Baseline overall winRate = 31.91%, n = 332. The 5K and 10K rows show essentially no lift (ratios within ~5%). The 15K–25K rows show monotone growth, but at T=25K the ALIGNED bucket has only 14 trades and the apparent 42.9% win-rate is one or two trades' worth of noise.

## Distribution context (from the type-spec probe)

Catalog-wide `agr_saldo` distribution (all 8,280 bricks, not just engine fires):

- Median 0, p10/p90 = ±13K, max ±35–44K.
- ~50/50 positive/negative split.
- |agr_saldo| ≥ 15K fires on 13% of bricks; ≥ 30K on 0.5%.

At engine fires, |agr_saldo| ≥ 15K fires on **29%** of fires — meaningfully more selective than at random bricks (13%). This is consistent with point #1 above: Hawks already self-selects toward bricks with material aggression.

## Why the `ANTI` bucket is empty — the proof that the HTF gate enforces aggression

The hawks v0 HTF gate selects bricks where:

- 60m EMA stack aligns with direction (e.g., EMA27 > EMA55 for LONG)
- 15m EMA stack aligns with direction
- 5m brick MACD histogram has correct sign

These EMA-alignment + MACD-sign filters are **highly correlated with `agr_saldo` sign at the same brick** (MACD trend + EMA trend = price movement + price movement = volume-weighted aggressive participation). The catalog measurement validates this empirically: every one of 332 fires has `agr_saldo` either NEUTRAL (\|x\| < threshold) or ALIGNED with direction. Never ANTI.

This is the most important finding of the audit. It tells us:

- The existing engine v0 IS implementing "aggression must not oppose direction" — just not via a named flag. It's a consequence of the HTF+MACD filters.
- The `aggressionMode = "reversed"` rule could only have effect on a much weaker upstream gate. The "20-day 1.67×" claim was almost certainly measured on a pre-v0.9 engine version.
- Any future re-introduction of an aggression rule must justify what it adds OVER the implicit HTF filter — not in isolation.

## Verdict on the folklore claim

The `src/types/backtest.ts:257-264` comment block states:

> "reversed" = aligned is PENALTY ("late to the move"); probe data on 20 days supports this polarity at threshold 15K with 1.67× selectivity

After this audit: **the claim is unreproducible on the current engine version.** It is folklore. Three honest paths forward for the comment:

1. Delete it with the config knob (option 3, the recommended path).
2. Replace with a one-line pointer: "See group-f-aggression.md — gate has no empirical support on engine v0.10; preserved here for historical context only."
3. Add a date-stamped addendum noting the audit failed to reproduce.

## Decision matrix

| Option                      | Action                                                                                                                                                                                                 | Cost                                             | Risk                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| **1 (wire score-original)** | Add an engine consumer for `aggression.scoreMode = "original"`, default-off                                                                                                                            | M (1-2h walker primitive + orchestrator + tests) | The lift at T=15K is 1.13× — within statistical noise for n=97. We'd be wiring a non-effect.                      |
| **2 (wire blockOnAnti)**    | Add an engine consumer for `aggression.blockMode = "blockOnAnti"`, default-off                                                                                                                         | M                                                | The ANTI bucket is empty — the wired rule would veto 0 trades. Pure dead code.                                    |
| **3 (DELETE)**              | Strip `aggressionMode`, `aggressionThreshold`, `aggression.*` from `EntryQualityGates`. Remove UI controls. Remove preset bundles. Remove leaves entries. Replace folklore comment with audit pointer. | S (30-45 min in one PR)                          | Some sweep recipes in `data/sweep-recipes/` may reference aggression paths — must grep first. Otherwise low risk. |

**Recommendation: Option 3.** The empirical case is clear. Keeping dead toggles around to "maybe wire later" costs every future config refactor more than it saves.

## What this audit does NOT say

- It does NOT say `agr_saldo` is a useless indicator in general. It says the existing flag design (binary alignment threshold at the fire brick) has no remaining lift over what the HTF gate already provides.
- A richer aggression signal (e.g., divergence between price and `agr_saldo`, change-of-sign, persistent-aggression streak) was NOT measured. If you want one of those, it's a fresh design + fresh audit — not a "turn on the existing flag" decision.
- It does NOT validate the folklore on older engine versions. The 20-day claim may have been correct on whatever code shape existed when it was measured. It is not correct now.

## File pointers

- Audit script: `scripts/indicator-isolation/group-f-aggression.ts`
- Audit spec: `docs/hawks-strategy/indicator-isolation/group-f-aggression.md`
- Folklore-comment source: `src/types/backtest.ts:257-264`
- Dead config knobs: `EntryQualityGates.aggressionMode`, `aggressionThreshold`, `aggression.{scoreMode,blockMode,threshold}` (all in `src/types/backtest.ts`)
- Dead UI: `src/components/hawks/hawks-quality-controls.tsx` (aggression controls)
- Dead preset bundle: `src/lib/backtest/presets/hawks-quality-presets.ts`
- Dead leaves entries: `src/lib/backtest/presets/hawks-leaves.ts:107-108, 325, 336`
- Stale gotcha: `docs/gotchas.md:524` references a `hawks-quality-rules.ts` that no longer exists. Needs an update or removal.
