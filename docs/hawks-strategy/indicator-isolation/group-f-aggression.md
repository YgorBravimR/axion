# Indicator-Isolation Audit — Group F: Aggression (`agr_saldo`)

**Status**: GRADED — **DEAD GATE. NO ENGINE CONSUMER. NO PROBE SCRIPT.**
The `qualityGates.aggressionMode` flag exists in `EntryQualityGates`. It also exists in the newer nested shape `qualityGates.aggression.{scoreMode,blockMode,threshold}`. Both are surfaced in UI controls, presets, leaves, sweep paths, and `optimize/storage.ts` migration code. **No engine module reads either.** The gotchas entry from 2026-06-01 (gotchas.md:524) cited `src/lib/backtest/modules/entry/hawks-quality-rules.ts:336-343` as the consumer — that file no longer exists in the tree. The probe script (`scripts/peek-aggression-sign.ts`) the gotcha referenced is also gone. The "20 days, 1.67× selectivity at 15K reversed" claim now lives only as a comment in `src/types/backtest.ts:257-264` with no reproducible artifact.

**Date filed**: 2026-06-16.
**Date graded**: 2026-06-16.
**User directive (2026-06-16)**: "About aggression, remove the 'against', or in favor or we simply don't use." → **drop `reversed` polarity from this audit.** The grading only considers `original` (aligned aggression = favor) and `off`. If the wiring lands at all, it lands as `original` only.

---

## Verdict — DEAD GATE

| Aspect                                              | Status        | Evidence                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Engine reads `aggressionMode` (legacy flat)         | **NOT WIRED** | `grep -rn "aggressionMode" src/lib/backtest/` returns 0 hits in any engine module. Only presets, optimize/storage, optimize/loser-pattern. The runtime entry-decision path never reads it.                                                                                                             |
| Engine reads `aggression.scoreMode` / `.blockMode`  | **NOT WIRED** | Same — the dual-mode nested shape is referenced by leaves catalog + presets only, never consumed at runtime.                                                                                                                                                                                           |
| `evaluateScoreSignal` / `aggressionRule.*` consumer | **DELETED**   | The 2026-06-01 gotcha (gotchas.md:524) cited `hawks-quality-rules.ts:336-343`. That file does NOT exist in the tree. `find src/lib/backtest -name "*quality*"` returns only `presets/hawks-quality-presets.ts`. The actual rule implementation was either renamed away or removed without replacement. |
| Probe script `peek-aggression-sign.ts`              | **DELETED**   | The 2026-06-01 gotcha also cited this script; it is gone from `scripts/`.                                                                                                                                                                                                                              |
| 20-day "1.67× selectivity at 15K reversed" claim    | **UNREPRO**   | Only artifact: comment block at `src/types/backtest.ts:257-264`. No test, no audit doc, no script reproduces it. Treat as folklore.                                                                                                                                                                    |
| Data coverage                                       | **GOOD**      | `agr_saldo` is in the 5m parquet (and 15m, 60m by projection). Distribution on the 8,280-brick catalog: min −35,302, p10 −12,842, median 0, p90 +13,111, max +43,816. 13% of bricks have `\|agr_saldo\| ≥ 15K`.                                                                                        |
| UI gate toggles                                     | **DEAD UI**   | `hawks-quality-controls.tsx` renders aggression mode / threshold controls (legacy AND nested shape). No engine reader.                                                                                                                                                                                 |
| `strict` preset bundle                              | **DEAD**      | Sets aggression flags; identical fires to `off`.                                                                                                                                                                                                                                                       |

**Worse than KC / SR were pre-audit**: at least those had a methodology mapping that the visual lab partially honored. Aggression has nothing — no walker, no engine reader, no probe script, only a folklore comment.

---

## What this audit is and is not

**This is a wiring audit AND a folklore audit.** We grade two things:

1. **Wiring** — does Axion implement the methodology? (No.)
2. **Folklore** — does the "1.67× selectivity at 15K reversed" claim survive a fresh probe?

Per the standing user directive, the **reversed** polarity is excluded from the wiring decision regardless of audit outcome. So even if "reversed" looks empirically better, we will NOT wire it. The audit just measures the `original` polarity (aligned aggression = favor) against baseline so we can decide whether to wire it OR delete the config knobs entirely.

---

## Source mapping

`agr_saldo` ("aggression balance") is a per-brick scalar in the parquet. Interpretation: positive = net aggressive buying in the brick's window, negative = net aggressive selling. The methodology hypothesis (per the deleted-rule's intent and the comment): a SHORT entry into a brick with strongly NEGATIVE `agr_saldo` is "aligned" (sellers active when you're selling). Original polarity rewards this alignment with a +score; the deleted `reversed` polarity penalized it as "late to the move."

| Column      | Source            | TF coverage  | Notes                                                                  |
| ----------- | ----------------- | ------------ | ---------------------------------------------------------------------- |
| `agr_saldo` | parquet per-brick | 5m, 15m, 60m | All three TFs carry it. Methodology cares about 5m brick at fire time. |

Distribution on the 2026-03-02 → 2026-06-13 catalog (8,280 5m bricks):

| Statistic      |             Value |
| -------------- | ----------------: |
| Count          |             8,280 |
| Min / Max      | −35,302 / +43,816 |
| Mean           |        +2.76 (≈0) |
| Median         |                 0 |
| p10 / p90      | −12,842 / +13,111 |
| p25 / p75      |   −8,426 / +8,292 |
| Positive count |    3,896 (47.05%) |
| Negative count |    4,049 (48.90%) |
| Zero count     |       335 (4.05%) |
| \|x\| ≥ 15,000 |    1,076 (13.00%) |
| \|x\| ≥ 30,000 |        39 (0.47%) |

The default `aggressionThreshold = 15,000` sits roughly at p90 — only ~13% of bricks ever trigger the rule. The "1.67× selectivity" claim therefore measures a thin-tail effect.

---

## Paragraph 1 — What Axion's code currently does

**Nothing at runtime.** The engine never reads any aggression key. The dual-mode nested shape (`aggression.scoreMode`, `aggression.blockMode`, `aggression.threshold`) lives in types, presets, leaves, and optimize-storage migrations, but no entry-decision module consults it. Flipping any aggression flag on a run produces identical output to OFF.

The visible-lab chart (`hawks-isolation-charts.tsx:1459`) renders `agr_saldo` as an overlay — read-only display, no decision logic.

## Paragraph 2 — What the methodology requires (per the comment + standing directive)

For each candidate entry at brick fire time:

**Original polarity, score mode:**

- SHORT entry: if `agr_saldo ≤ −threshold` → +1 score (aligned: sellers active during your sell).
- LONG entry: if `agr_saldo ≥ +threshold` → +1 score (aligned: buyers active during your buy).
- Otherwise: 0 (no contribution).

**Original polarity, block mode** (`blockOnAligned` / `blockOnAnti`):

- Per type definitions, the block can fire on the aligned OR anti-aligned condition.
- Standing directive: drop `reversed` polarity → only `blockOnAnti` survives as a meaningful block ("don't enter against the prevailing aggression").
  - SHORT entry: block if `agr_saldo ≥ +threshold` (anti-aligned: buyers winning while you're trying to sell).
  - LONG entry: block if `agr_saldo ≤ −threshold` (anti-aligned: sellers winning while you're trying to buy).

The audit script measures BOTH score-original and block-anti, separately, against baseline.

**Threshold default**: 15,000. The catalog distribution shows this is ~p90 — the rule barely fires.

---

## What the wiring audit script will check

Script: [`scripts/indicator-isolation/group-f-aggression.ts`](../../../scripts/indicator-isolation/group-f-aggression.ts).

For the full catalog window (2026-03-02 → 2026-06-13, 8,280 bricks), compute per brick + per direction:

1. **Classification**:
   - `ALIGNED` (would +score under original) — SHORT with `agr_saldo ≤ −T`, LONG with `agr_saldo ≥ +T`.
   - `ANTI` (would block under blockOnAnti) — SHORT with `agr_saldo ≥ +T`, LONG with `agr_saldo ≤ −T`.
   - `NEUTRAL` — `|agr_saldo| < T`.

2. **Aggregate distributions** at thresholds T ∈ {5K, 10K, 15K, 20K, 25K}:
   - % of bricks ALIGNED / ANTI / NEUTRAL per direction.
   - How many engine fires (from the 332-trade baseline) fall in each bucket — this is the diff the wiring would actually change.

3. **Empirical selectivity test of the folklore claim**: at T=15K original, does the ALIGNED bucket at the 332 engine-fire bricks have a different win rate than the NEUTRAL bucket? If yes — by how much? If the gap is < ~5pp at this sample size, the "1.67× selectivity" claim is not reproducible and the audit will say so.

Output mirrors B/C/D/E: per-bucket counts and percentages, sample timestamps, engine-fire breakdown.

---

## After Group F is verified

Three paths depending on what the audit finds:

1. **If `original` ALIGNED at the engine-fire bricks shows ≥ 5pp win-rate lift over NEUTRAL** at T=15K (or any T in {5K..25K}): wire `aggression.scoreMode = "original"` into the orchestrator following the same primitive-first pattern as KC and SR. Run A/B. Default-off pending Ygor's go-ahead.

2. **If `blockOnAnti` at engine-fire bricks vetoes mostly losers** (mirror of the KC-wider-window finding): wire it as a veto consumer alongside `keltnerOuterBlock`. Default-off pending A/B.

3. **If neither shows signal**: **remove the dead flags entirely.** Strip `aggressionMode` from `EntryQualityGates`, strip `aggression.{scoreMode,blockMode,threshold}` from the nested shape, remove UI controls, remove preset bundles, remove leaves entries. The folklore comment in `types/backtest.ts:257-264` either gets a "removed 2026-06-16, no empirical support" addendum or gets deleted with the type.

   This is the cleanest outcome if the data doesn't support the rule. Dead config knobs are a tax on every future config refactor.

The standing directive ("remove the 'against', or in favor or we simply don't use") explicitly leaves room for option 3 — "we simply don't use" maps to "delete the flags."

---

## Open questions (parking lot, decide before any wiring decision)

1. **Which threshold to grade at?** Default is 15K (≈ p90). 10K (≈ p83) would fire ~17% of bricks; 5K (≈ p70) would fire ~30%. The folklore claim is at 15K, but if the audit finds the signal is denser at a lower threshold, that's the threshold worth wiring.

2. **Score weight magnitude.** If we wire score-original, should it contribute +1 (same as other score signals) or something else? Today no scoring system actually CONSUMES tier scores (`EntrySignal.quality.score` has no writer rule). Wiring aggression to a non-existent scorer is hollow.

3. **Block-mode default behavior on null `agr_saldo`.** Some bricks have `agr_saldo = 0` (4% of catalog). Treat as NEUTRAL (no block, no favor). Confirmed.

4. **Volume of leaves churn.** The leaves catalog has entries for the aggression nested shape. If we delete the gate entirely (option 3 above), the leaves entries also go. This will invalidate any in-flight sweep recipes that reference them — Ygor, check whether anything in `data/sweep-recipes/` references aggression paths before we delete.

5. **Folklore comment in `types/backtest.ts:257-264`.** Should it stay (with an addendum) or be deleted with the type? Recommendation: replace the comment with a one-line "see Group F audit at docs/.../group-f-aggression.md" pointer so future readers don't re-discover the same dead end.

These are pre-wiring decisions, confirm before promoting any code change.

---

## Empirical results (2026-06-16 catalog run)

Full findings: [`docs/scans/2026-06-16-group-f-aggression.md`](../../scans/2026-06-16-group-f-aggression.md).

Three load-bearing findings:

1. **`ANTI` bucket is empty across all thresholds.** Across 332 baseline trades, ZERO fire with `agr_saldo` opposite the direction at any tested T. The HTF + MACD gates already enforce aggression alignment implicitly. `blockOnAnti` would veto 0 trades.

2. **Original-polarity selectivity at T=15K is 1.133×, NOT 1.67×.** The folklore claim is unreproducible on engine v0.10. The lift grows monotonically with T but n collapses (n=14 at T=25K with 42.86% wr is noise).

3. **`reversed` polarity has nothing to grade.** Confirmed by a separate probe — every baseline trade is either NEUTRAL or original-ALIGNED. Reversed-ALIGNED has count 0 at every threshold.

| T (\|agr_saldo\| ≥) | ALIGNED n | ALIGNED wr | NEUTRAL n | NEUTRAL wr | ANTI n | Selectivity |
| ------------------: | --------: | ---------: | --------: | ---------: | -----: | ----------: |
|               5,000 | 265 (80%) |     32.26% |  67 (20%) |     30.61% |      0 |       1.054 |
|              10,000 | 194 (58%) |     32.09% | 138 (42%) |     31.68% |      0 |       1.013 |
|              15,000 |  97 (29%) |     34.92% | 235 (71%) |     30.81% |      0 |       1.133 |
|              20,000 |  43 (13%) |     37.04% | 289 (87%) |     31.25% |      0 |       1.185 |
|              25,000 |   14 (4%) |     42.86% | 318 (96%) |     31.58% |      0 |       1.357 |

**Verdict: DELETE the flags.** Option 3 from the wiring-decision section. The existing HTF+MACD gates already implement the conservative version of the rule for free; the named flag adds nothing measurable on top.
