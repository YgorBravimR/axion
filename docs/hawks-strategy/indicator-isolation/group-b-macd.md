# Indicator-Isolation Audit — Group B: MACD (Sign + Slope)

**Status**: GRADED — **PARTIAL**. Sign wiring correct on 5m; **slope missing entirely**; higher-TF MACD never read.
**Date filed**: 2026-06-13.
**Date graded**: 2026-06-13.
**Source code as of**: branch `main` post-rename pass (`macd_key` plumbed through `HawksTripleScreenConfig`).

---

## Verdict — PARTIAL

| Aspect                                     | Status           | Evidence                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign reading (5m, `macd1_histo`)           | **CORRECT**      | On the 5m parquet across 17,517 bricks: `AGREE_BULL = 50.2%`, `AGREE_BEAR = 49.8%`, `DISAGREE_FLICKER = 0`, `DISAGREE_ZERO = 0`. Methodology and axion produce the **identical 566 sign transitions**. Axion's stateless `readMacd` matches the methodology sign 1-for-1. |
| Sticky-walker assumption (Group A pattern) | **NOT REQUIRED** | The audit was written expecting a sticky rule similar to Group A. The methodology spec for MACD sign flips on every strict-opposite cross — which is exactly what axion does. Methodology and axion are equivalent on this dimension. The audit confirms it.              |
| Slope dimension                            | **MISSING**      | Axion's `readMacd` returns only `sign`. There is no slope concept in code. Slope is a separable quality grade ("rising vs falling histogram"), needed per Ygor's spec to differentiate `sign=BULL+slope=RISING` (best) from `sign=BULL+slope=FALLING` (degrading).        |
| Per-TF MACD                                | **MISSING**      | `hawksV0.macd_key = "macd1_histo"` is a single key applied to the 5m brick only. The 15m parquet has `macd2_histo` (4,964 readings) and the 60m has it too (1,050 readings) — neither is read by the engine today. 3 TFs × 2 dimensions = 6 readouts; only 1 is wired.    |
| Data coverage                              | **GOOD**         | `AXION_UNKNOWN = 0%` across all three TFs in the audit window. Unlike Group A's 19% gap on 60m, MACD columns are populated on every brick — no source-data deficit on the MACD dimension.                                                                                 |

**Sign × Slope distribution** (methodology cross-tab — gives a feel for how often "best grade" occurs):

| TF  | BULL/RISING     | BULL/FALLING  | BEAR/RISING   | BEAR/FALLING  |
| --- | --------------- | ------------- | ------------- | ------------- |
| 5m  | 4,489 (25.6%)   | 4,313 (24.6%) | 4,291 (24.5%) | 4,423 (25.3%) |
| 15m | 1,166 (23.5%)   | 1,192 (24.0%) | 1,301 (26.2%) | 1,304 (26.3%) |
| 60m | (see audit run) | …             | …             | …             |

Across all TFs, ~50% of bricks are in a "best grade" cell (`BULL+RISING` or `BEAR+FALLING`). That's a usable quality-grade dimension — slope is not noise.

**Bottom line.** Axion's MACD sign read is **correct as-is for 5m**. The fix is purely additive: (1) add a slope dimension to the snapshot, (2) plumb three keys (`macd_5m_key`, `macd_15m_key`, `macd_60m_key`) so each TF has its own MACD readout. No sticky walker is needed — the sign is point-in-time correct.

**Audit-result correction to Paragraph 1 and 2 below**: those paragraphs were drafted with a sticky-walker assumption (mirroring Group A). The script run REJECTED that pre-registered hypothesis — `DISAGREE_FLICKER = 0` proves methodology and axion behave identically on sign. The paragraphs are kept below for traceability of the original audit design, but the verdict above supersedes them.

---

## What this audit is and is not

This is a **wiring audit**, not a predictivity test. The question is: **does Axion's code read the MACD histogram the way Hawks methodology defines it?**

Per the indicator-isolation methodology, every indicator goes through 3 steps:

1. **Theory definition** (Ygor's words, locked in writing).
2. **Wiring audit** (this doc — code-fact paragraph vs methodology-intent paragraph + diff script).
3. **Visual smoke test** (chart with the indicator state colored beneath each brick).

Group B is **two indicators packed under one MACD source**: **MACD sign** (BULL/BEAR signal, sticky) and **MACD slope** (quality grade conditional on the sign). These are NOT one combined indicator. They are validated independently and may end up wired differently in the engine: sign as a directional signal, slope as a strength/grade qualifier.

Per Ygor's 2026-06-13 spec:

> Group B - Partial; positive macd long, negative short, the slope of macd (raising/decreasing) it's something to be considered too, [...] Either part of [the signal] or separate from sign, just consider that slope is conditional on sign — slope is only meaningful in the direction the sign already points.

And on which MACD source to read:

> `macd1` is to be used on 5m and `macd2` is to be used in higher timeframes — two different configs. Use only the **histogram**.

---

## Source mapping (per timeframe)

| Timeframe            | Methodology MACD column to read |
| -------------------- | ------------------------------- |
| 5m (`hawk_5m_win`)   | `macd1_histo`                   |
| 15m (`hawk_15m_win`) | `macd2_histo`                   |
| 60m (`hawk_60m_win`) | `macd2_histo`                   |

The other 4 columns (`macd*_linha`, `macd*_sinal`) are present in all three parquets but **out of scope**. The histogram already encodes the line-vs-signal delta; reading both would double-count.

---

## Paragraph 1 — What Axion's code currently does

### `src/lib/backtest/hawks-indicators.ts:readMacd` (the snapshot reader)

Stateless, point-in-time read. Pulls a single number from `candle.indicators[config.macd_key]`. Three branches:

- `value > 0` → `sign = "positive"`
- `value < 0` → `sign = "negative"`
- `value === 0` → `sign = "zero"`
- value missing or non-numeric → `sign = "unknown"`

`favorable` per direction:

- SHORT favorable iff `sign === "negative"`
- LONG favorable iff `sign === "positive"`

`zero` and `unknown` are both **unfavorable** for any direction. There is **no memory** between bricks; no comparison to the previous brick's histogram value; no slope concept at all.

### `src/lib/backtest/presets/hawks-presets.ts:hawksV0` (the wiring)

`macd_key = "macd1_histo"` — a **single key shared across all three timeframes** (5m + 15m + 60m). The 5m brick's `macd1_histo` is read at fire time; the 15m and 60m bricks' MACD histograms are NOT read by the engine today.

The engine carries no notion of MACD on the higher timeframes. The HTF-gate decision (Group A) uses only the prev_open/prev_close vs EMAs. MACD never enters the HTF gate.

### How this differs from methodology (per Ygor's Group B corrections, 2026-06-13)

| Aspect                 | Axion today                                | Methodology                                                                  |
| ---------------------- | ------------------------------------------ | ---------------------------------------------------------------------------- |
| Number of indicators   | 1 (just sign)                              | 2 — sign (sticky directional signal) + slope (quality grade conditional)     |
| Memory                 | None                                       | Sign is sticky — flip on histogram zero-cross, NOT every flicker             |
| Per-timeframe config   | One shared `macd_key` for all TFs          | Two configs — `macd1_histo` on 5m, `macd2_histo` on 15m and 60m              |
| Higher-TF MACD readout | Not read                                   | Methodology expects all 3 TFs to have a sign + slope signal independently    |
| Slope                  | Not computed                               | Compute as `histo[t] - histo[t-1]`; **only meaningful in direction of sign** |
| Zero handling          | Treated as own state (`zero`), unfavorable | Boundary — last non-zero state persists until a strict cross to the opposite |

**Bottom line.** Axion's MACD wiring is **lossy in two distinct ways**: (1) it flickers state at every sign change on the histogram (no sticky memory), and (2) it reads only the 5m `macd1_histo` and never the higher-TF `macd2_histo`. The slope dimension does not exist in the codebase yet.

---

## Paragraph 2 — What the methodology requires (per Ygor's corrections)

### Sub-indicator 2A: MACD sign (sticky BULL/BEAR signal)

Each timeframe has a current state `S ∈ {BULL, BEAR, NO_SIGNAL}`. Per brick on that timeframe:

- Define `flip_to_BULL = histo[t] > 0`
- Define `flip_to_BEAR = histo[t] < 0`

State update rule:

- If `S = NO_SIGNAL` and `flip_to_BULL` ⟹ `S = BULL`. If `flip_to_BEAR` ⟹ `S = BEAR`.
- If `S = BULL` and `flip_to_BEAR` ⟹ new `S = BEAR`. Otherwise stay `S = BULL` (including when `histo = 0`).
- If `S = BEAR` and `flip_to_BULL` ⟹ new `S = BULL`. Otherwise stay `S = BEAR` (including when `histo = 0`).

The MACD-sign walker is **less sticky than the HTF walker** — a single strict-opposite-sign tick is enough to flip (versus the HTF walker, which requires all 4 inequalities). This is intentional: the histogram is already a derivative-of-derivative, so a single sign change is a stronger signal than e.g. one of four EMA inequalities flipping.

### Sub-indicator 2B: MACD slope (quality grade, conditional on sign)

Slope is **not** a sign-changer; it is a **quality grade** applied on top of the current sign. The walker computes `slope = histo[t] - histo[t-1]` per brick and outputs:

- If sign is BULL: `RISING` (slope > 0) is HIGH QUALITY, `FALLING` (slope < 0) is LOW QUALITY.
- If sign is BEAR: `FALLING` (slope < 0, i.e. becoming more negative) is HIGH QUALITY, `RISING` (slope > 0) is LOW QUALITY.
- If sign is NO_SIGNAL: slope undefined.
- If slope is exactly 0: keep prior slope class (degenerate single-brick stall — not a state change).

Operationally: a SHORT trade with `sign=BEAR + slope=FALLING` is the best grade; `sign=BEAR + slope=RISING` is a degrading signal even though the sign hasn't flipped yet. The engine downstream can either treat slope as a multiplier on the trade's quality score or as a hard filter ("only trade when slope agrees with sign"). That decision is a separate composition question after Group B's wiring locks.

### Initial state seeding

The walker emits `NO_SIGNAL` for sign until the histogram's first strict non-zero reading. Once seeded, the sign state **carries across session boundaries** — same rule as Group A. Slope requires two consecutive non-null histograms to compute; emits `slope=NO_DATA` for the first reading after a gap.

### Per-timeframe walker

Three independent walkers (5m, 15m, 60m), each reading its own column:

| Walker | Reads                              | Notes                                                                |
| ------ | ---------------------------------- | -------------------------------------------------------------------- |
| 5m     | `hawk_5m_win` rows, `macd1_histo`  | Trade-timing TF — the engine's existing fire-site brick              |
| 15m    | `hawk_15m_win` rows, `macd2_histo` | Intermediate TF — used as confluence with the 15m HTF gate           |
| 60m    | `hawk_60m_win` rows, `macd2_histo` | Macro TF — slowest of the three, used as a strong directional anchor |

### Stale / missing indicator handling

If `histo[t]` is missing/null → carry sign forward (same as Group A). Slope emits `slope=NO_DATA` for that brick (cannot compute a delta against null). Once the next non-null reading arrives, slope resumes by comparing to that next reading vs the last available non-null (NOT vs null). This avoids spurious slope flips at data-gap boundaries.

### Output per indicator (per timeframe)

Each timeframe emits, per brick: `{ sign: BULL | BEAR | NO_SIGNAL, slope: RISING | FALLING | NO_DATA, histo: number | null }`.

Combined into a per-brick readout: `{ macd5m, macd15m, macd60m }`.

---

## What the wiring audit script will check

The script `scripts/indicator-isolation/group-b-macd.ts` will, for each timeframe (5m / 15m / 60m):

1. Load all bricks for the audit window from the timeframe's parquet (`hawk_5m_win` / `hawk_15m_win` / `hawk_60m_win`).
2. Run the methodology-correct stateful walker — sign sticky on strict-opposite-cross, slope as `histo[t] - histo[t-1]`.
3. Run Axion's current `readMacd` on each brick with `direction = "short"` and `direction = "long"` to extract its 4-state read (`positive / negative / zero / unknown`).
4. Diff sign output per brick and bin into:
   - `AGREE_BULL` — methodology=BULL AND axion=positive
   - `AGREE_BEAR` — methodology=BEAR AND axion=negative
   - `DISAGREE_FLICKER` — methodology=<prior sign>, axion=<opposite> due to a sign flicker that the methodology's sticky rule doesn't honor (expected — confirms axion is memoryless)
   - `DISAGREE_ZERO` — axion=zero (treated as unfavorable), methodology=<prior sign> (carry forward)
   - `AXION_UNKNOWN` — axion=unknown due to missing data
5. Separately count slope distribution (`RISING / FALLING / NO_DATA`) and report sign×slope cross-tabs so we can see how often the "best grade" (sign+slope agree) occurs in the data.
6. Print a summary table per timeframe + per-bucket sample timestamps for visual spot-check.

**Pre-registered hypothesis** (so we know what to look for):

- `AGREE_*` should dominate during clean trending segments.
- `DISAGREE_FLICKER` should cluster around the histogram zero line — chop zones where `histo` flips sign frequently. Methodology smooths through them via the sticky rule; axion flickers.
- `DISAGREE_ZERO` should be rare and concentrated at session opens / data-thin regions.
- `AXION_UNKNOWN` should match the bricks where the `macd*_histo` column projects to null — primarily affected by the same source-data gap filed in `docs/backlog.md` (the Hawks materializer issue), if `macd1_histo` / `macd2_histo` are part of the missing-source cascade.
- Slope should produce roughly half RISING + half FALLING + a small NO_DATA tail per timeframe over a balanced window.

If the hypothesis holds, the audit confirms: **Axion's MACD wiring reads the histogram sign correctly but treats every flicker as a state change and ignores slope and the higher-TF MACDs entirely.** The fix is structural: add stateful walkers per timeframe + a slope dimension.

If `DISAGREE_*` is dominated by anything other than flickers and zero — we have a real bug to investigate before any engine change.

---

## Visual smoke test (Step 3, after script verdict)

I'll emit a per-day HTML page with three rows of brick streams (5m, 15m, 60m), each with two ribbons:

- Row 1: methodology sign (green BULL / red BEAR / gray NO_SIGNAL) and slope marker (▲ rising, ▼ falling, · no data).
- Row 2: axion sign (green positive / red negative / yellow zero / gray unknown).

Eyeball test: does the methodology ribbon agree with the histogram visually? Does the axion ribbon flicker through chop zones the methodology ribbon walks through cleanly? Is the per-TF MACD readable (i.e. does the 60m walker look slow, the 5m fast)?

Sample days: pick 2 trending days + 2 chop days from the catalog to cover both regimes.

---

## After Group B is verified

1. Apply the fix: precomputed `Map<timestamp, MacdSnapshot>` per TF populated at engine init, mirroring the Group A walker pattern. `readMacd` stays as the stateless point-in-time reader; new `walkMacd(rows, key): MacdState[]` builds the sticky/slope series.
2. Wire the higher-TF MACD readouts into `getHawksIndicatorsAt` so the snapshot includes `macd5m`, `macd15m`, `macd60m` independently.
3. Re-run all snapshot + engine tests; expect new tests for slope and per-TF walkers.
4. Move to Group C (Keltner inner/outer touch + reject — the "touch and close against" trigger Ygor flagged).

---

## Open questions (parking lot, decide before coding the walker)

1. **Slope smoothing**: should slope be the raw 1-brick delta, or a 2-3 brick moving delta to ride out noise? **Recommendation**: raw 1-brick delta for now — visual smoke test will show whether noise is a problem. If it is, we add a smoothed sibling rather than change the canonical definition.

2. **`macd_key` config field shape**: today there's one `macd_key`. For the per-TF spec we need three keys (5m, 15m, 60m). **Recommendation**: deprecate `macd_key` and replace with `macd_5m_key`, `macd_15m_key`, `macd_60m_key` on `HawksTripleScreenConfig`, defaults `macd1_histo` / `macd2_histo` / `macd2_histo`. Pure rename + plumbing pass, no logic change.

3. **Slope as multiplier vs hard filter** (engine composition, not wiring): defer to a composition decision after all groups audit. The Group B wiring only needs to _expose_ both sign and slope per TF; how the engine uses them is downstream.

These are pre-coding decisions, not audit-blocking. Confirm before we write the walkers.
