# Indicator-Isolation Audit — Group C: Keltner Bands (Touch + Reject)

**Status**: GRADED — **NOT WIRED**. The engine does not read Keltner anywhere; the only consumers are the visual isolation lab and the UI quality-gate toggles, which are dead code at the engine layer.
**Date filed**: 2026-06-15.
**Date graded**: 2026-06-15.
**Source code as of**: branch `main` post-rename pass, engine v0.10 with the fibo-lab page just landed.

---

## Verdict — NOT WIRED

| Aspect                                  | Status        | Evidence                                                                                                                                                                                                                                        |
| --------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine reads any KC column              | **NOT WIRED** | `grep -rE 'kc1_inf\|kc1_sup\|kc2_inf\|kc2_sup' src/lib/backtest` returns 0 matches. The entry engine modules (`hawks-playbook.ts`, `hawks-triple-screen.ts`, all 3 playbooks, `hawks-indicators.ts`) never touch the Keltner bands.             |
| Config exposes the 4 KC band keys       | **PRESENT**   | `HawksTripleScreenConfig.keltner_{inner,outer}_{inf,sup}_key` defaults to `kc{1,2}_{inf,sup}` (`src/types/backtest.ts:197-200`). Plumbed through `hawksV0` preset (`src/lib/backtest/presets/hawks-presets.ts:80-83`). Never read at run-time.  |
| UI gate toggles wired to the engine     | **DEAD UI**   | `qualityGates.keltnerOuterBlock`, `keltnerInnerPenalty`, `keltnerNearBricks`, `keltnerInner.mode` all exist as `EntryQualityGates` fields with full UI controls in `hawks-quality-controls.tsx:280-308`. None are consumed by any entry module. |
| Methodology-correct touch+reject walker | **ABSENT**    | No "did the brick touch the band and close back inside" logic anywhere in the codebase. The only KC classifier (`keltnerSignalAt` in `hawks-isolation-charts.tsx:834`) only labels position (`above` / `inside` / `below`), no touch+reject.    |
| Visual isolation lab plots the bands    | **PRESENT**   | `/dev/hawks-isolation` renders KC1/KC2 inf+sup overlays on all 3 TFs and a per-cursor position badge. Used for visual sanity-checks during this audit.                                                                                          |
| Data coverage                           | **GOOD**      | All 4 KC columns (`kc1_inf`, `kc1_sup`, `kc2_inf`, `kc2_sup`) present and non-NULL on every brick across all 3 timeframes (5m / 15m / 60m). No source-data deficit.                                                                             |

**The audit is short because the diagnosis is simple**: Group C is at the same place Groups A and B were before the wiring audits — except for KC, Axion never even shipped the stateless reader. The reference implementation in the visual lab does the position classification correctly; promoting it to the engine is the wiring fix.

---

## What this audit is and is not

This audit is a **wiring audit**: it grades whether Axion reads the indicator the way the methodology says it should be read. It does **not** grade whether the indicator has predictive power — that's the next phase per the indicator-isolation plan in [`docs/backlog.md`](../../backlog.md). Predictive-power isolation comes after the wiring layer is methodology-correct.

For Keltner specifically, the audit's scope is:

1. **Position** — is the close above/inside/below each band? (Trivial, already in the visual lab.)
2. **Touch + reject** — Ygor's flagged trigger. A 5m brick "touches" the outer band if any part of the brick (wick included) reaches or pierces the band, AND the next brick closes back inside. This is the asymmetric pattern that signals exhaustion at a key level.
3. **Per-TF** — Ygor uses Keltner on 5m primarily, but the 15m + 60m bands also exist and should be readable. Touch+reject on a higher TF is rarer but stronger.

---

## Source mapping (per timeframe)

All three timeframes use the same column names, all four bands present, all populated:

| Timeframe | Parquet                                         | Inner (1.25× ATR)     | Outer (1.65× ATR)     |
| --------- | ----------------------------------------------- | --------------------- | --------------------- |
| 5m        | `data/parquet/candles/hawk_5m_win/WIN.parquet`  | `kc1_inf` / `kc1_sup` | `kc2_inf` / `kc2_sup` |
| 15m       | `data/parquet/candles/hawk_15m_win/WIN.parquet` | `kc1_inf` / `kc1_sup` | `kc2_inf` / `kc2_sup` |
| 60m       | `data/parquet/candles/hawk_60m_win/WIN.parquet` | `kc1_inf` / `kc1_sup` | `kc2_inf` / `kc2_sup` |

The materializer that builds these parquets (`scripts/materialize-hawks-timeframes.ts`) populates all 4 bands on every brick — no per-TF coverage gap. This is the case across the entire 2026-03-02 → 2026-06-13 catalog window.

---

## Paragraph 1 — What Axion's code currently does

**At the engine layer: nothing.** None of the entry modules read any Keltner column. The data is present in the brick payload (`candle.indicators.kc1_sup`, etc.) but no playbook consumes it. The `EntryQualityGates` config block defines four KC-related fields:

- `keltnerOuterBlock: boolean` — intended to hard-reject when 165 band acts as floor/ceiling.
- `keltnerInnerPenalty: boolean` — intended to penalize (score down) when price is past 125 on the trade side.
- `keltnerNearBricks: number` — distance threshold (default 2 bricks) for "near a band".
- `keltnerInner.mode: "off" | "score" | "block" | "both"` — newer nested shape replacing the boolean above.

All four are persisted in the run-config schema, surfaced in the run-builder UI, and editable per-run. **None of them control engine behaviour.** Confirmed by code search across `src/lib/backtest/modules/**` and by running an engine in the lab with the toggles flipped — fire count and exit modes are identical regardless of the toggle state.

The visual isolation lab (`src/components/dev/hawks-isolation-charts.tsx:834`, `keltnerSignalAt`) is the only piece of code in the repo that reads the KC columns. It classifies the close vs. (sup, inf) into `above` / `inside` / `below` per TF and shows the result as a badge under the cursor. This classifier is correct and matches the methodology's position concept, but it is not state-aware (no touch+reject memory) and lives outside the engine.

## Paragraph 2 — What the methodology requires (per Ygor's corrections)

Ygor's spec for Keltner has two dimensions:

1. **Position** — same as the visual lab does: classify each brick as above / inside / below each band. For SHORT, the "ahead" band is the inf (lower) band — price approaching it from above means we're approaching exhaustion. For LONG, the ahead band is the sup (upper). The 125 (inner) and 165 (outer) variants escalate the signal — 165 is the "exhaustion" level.

2. **Touch + reject** — the trigger pattern Ygor flagged for the [`vwap_rejection`](../../../src/lib/backtest/modules/entry/playbooks/vwap-rejection.ts) and (when added) Keltner-rejection playbook variants. A brick "touches" the outer band when any part of the brick body or wick reaches/pierces the band; the touch is **confirmed as a reject** when the same brick closes back inside, OR the immediately following brick closes back inside. The asymmetric form (touch on brick N, reject on brick N+1) is intentional — it lets the engine see the touch in real time and then commit to the reject pattern one brick later, the same delayed-confirmation shape as the TOPOS E FUNDOS pivot detector and the period-2 walker behind the HTF gate.

   Touch+reject classes the methodology cares about:
   - **`NONE`** — neither side of the brick touched either band.
   - **`TOUCH_KC1_SUP`** / **`TOUCH_KC1_INF`** — touched the inner band (warning-grade signal).
   - **`TOUCH_KC2_SUP`** / **`TOUCH_KC2_INF`** — touched the outer band (exhaustion-grade signal).
   - **`REJECT_KC1_SUP_FROM_ABOVE`** / `_FROM_BELOW` and same for KC1_INF, KC2_SUP, KC2_INF — the close-back-inside confirmation.

   For SHORT entries the engine cares about `TOUCH_KC2_SUP` followed by `REJECT_KC2_SUP_FROM_ABOVE` (price spiked above the outer upper band then closed back inside — short the rejection). Mirror for LONG.

3. **Per-TF independence** — the same walker runs independently per TF. A 60m touch+reject is rare and strong; a 5m touch+reject is common and weak. The engine reads all three.

The "near band" notion from the legacy `keltnerNearBricks` and `keltnerInnerPenalty` config is a different concept entirely (proximity, not touch) and Ygor flagged it as anti-selective in the 2026-05-28 audit — price already PAST the 125 band is _favored_ in the catalog (8.6% vs 4.8%) so the "near 125" penalty was the wrong shape. Touch+reject replaces that scoring concept, and the proximity gates should be removed from the UI in a follow-up — they're dead code today, but their presence implies they do something.

---

## What the wiring audit script will check

The script in [`scripts/indicator-isolation/group-c-keltner.ts`](../../../scripts/indicator-isolation/group-c-keltner.ts) computes, for each TF independently:

1. **Methodology-correct touch+reject walker** — per-brick state machine emitting the touch/reject classes from §2 above.
2. **Methodology-correct position** — same classifier as the visual lab, re-implemented in the script so we don't depend on `hawks-isolation-charts.tsx`.
3. **Axion's current state** — `UNREAD` everywhere (no engine reader exists). The audit's diff is therefore degenerate (100% UNREAD), but it makes the gap explicit and serves as the baseline for re-running after we ship the walker.

Output is a cross-tab of methodology touch+reject classes per TF (so we see how often each class fires across the catalog window) plus the position distribution. The cross-tab tells us whether the touch+reject classes are common enough to be a useful filter — if `TOUCH_KC2_SUP` fires on 0.1% of bricks across 60 trading days, it's a Group C2 signal not a Group C1 gate.

---

## Visual smoke test (Step 3, after script verdict)

The visual lab already plots all 4 bands per TF (`/dev/hawks-isolation` Group C section, or the `kcSig5m/15m/60m` badges). Once the methodology walker lands, add a touch+reject marker overlay (small triangle pointing into the band on the touch brick, X on the rejection brick) to the same view so Ygor can scroll the catalog and confirm the script's classification matches the eye. This is the same smoke-test pattern used for Groups A and B.

The acceptance bar: pick 5 catalog days at random, scroll through each one with Ygor, point at every methodology-detected touch+reject, and get a yes/no on whether the eye sees the same signal. ≥4 out of 5 days fully agreed = audit confirmed.

---

## After Group C is verified

1. **Promote the walker into the engine.** New `walkKeltner(rows, keys): KeltnerSnapshot[]` in `src/lib/backtest/`, mirroring the Group A/B pattern. `readKeltner(brick, keys)` stays as the stateless point-in-time reader (still useful for analytics).

2. **Extend `getHawksIndicatorsAt`** to attach the per-TF KC state (`kc5m`, `kc15m`, `kc60m`) to `HawksIndicatorSnapshot`. This unblocks the journaling enrichment plan (which already wires the indicator snapshot into the enrichment pass) and lets the fire-time `EntrySignal.indicatorSnapshot` carry KC context.

3. **Wire into the `vwap_rejection` playbook.** Today's `vwap_rejection.ts` only checks VWAP touch+reject. The "rejection" family of trades should be generalized — a `keltner_rejection` playbook OR a generalised `band_rejection` playbook that accepts a band source (VWAP, KC1, KC2) as a config. Decide which after seeing the touch+reject frequency from this audit.

4. **Remove the dead UI toggles.** `keltnerOuterBlock`, `keltnerInnerPenalty`, `keltnerNearBricks`, `keltnerInner.mode` all need to be either (a) wired to a real gate that reads from the new walker, or (b) deleted from the UI + config + leaves catalog + presets. The current half-state (toggles exist, do nothing) is a footgun.

5. **Move to Group D (VWAP touch+reject).** The same wiring audit applies — VWAP_D / VWAP_S / VWAP_M / AJUSTE. Most of the touch+reject machinery from Group C will be reusable since the signal shape is the same; only the band source changes.

---

## Empirical results — full catalog (2026-03-02 → 2026-06-13)

Ran [`scripts/indicator-isolation/group-c-keltner.ts`](../../../scripts/indicator-isolation/group-c-keltner.ts) on the full materialised window. Counts are **per brick**, not per trading day.

### 5m (8,280 bricks)

| Class                       | Count |     % |
| --------------------------- | ----: | ----: |
| `NONE`                      | 7,993 | 96.53 |
| `TOUCH_KC1_INF`             |   169 |  2.04 |
| `TOUCH_KC1_SUP`             |    32 |  0.39 |
| `TOUCH_KC2_INF`             |    12 |  0.14 |
| `TOUCH_KC2_SUP`             |    18 |  0.22 |
| `REJECT_KC1_INF_SAME_BRICK` |    19 |  0.23 |
| `REJECT_KC1_SUP_SAME_BRICK` |     4 |  0.05 |
| `REJECT_KC2_INF_SAME_BRICK` |     4 |  0.05 |
| `REJECT_KC2_SUP_SAME_BRICK` |     3 |  0.04 |
| `REJECT_KC1_INF_NEXT_BRICK` |    16 |  0.19 |
| `REJECT_KC1_SUP_NEXT_BRICK` |     3 |  0.04 |
| `REJECT_KC2_INF_NEXT_BRICK` |     4 |  0.05 |
| `REJECT_KC2_SUP_NEXT_BRICK` |     3 |  0.04 |

Position distribution: 97.04% inside KC1, 99.64% inside KC2. KC2 (outer) is so wide that price is almost always inside it — touching the outer band is genuinely an exhaustion signal because it happens on ≤0.4% of bricks total.

### 15m (2,453 bricks)

KC2 touches: **zero** in the full window on the asymmetric SUP side. Only one same-brick and one next-brick KC2_INF reject. KC1 inner touches dominate at 1.43%. Direction skew: every touch in the full catalog is on the INF side — no KC1_SUP touches at all on 15m. Read: market has been compressing-to-down through the catalog window, KC upper bands are not getting tested at 15m granularity.

### 60m (565 bricks)

Same shape — only KC1_INF touches (3.19%) and INF rejects (1.24% each, same+next). Zero KC2 touches at 60m. This makes sense: KC2 at 1.65× ATR on a 60m brick is a very wide band; reaching it requires a serious trend exhaustion that didn't happen in the 3-month window.

### Cross-TF read for engine wiring

1. **Outer (KC2) touch+reject is a rare-and-strong gate.** Total catalog: 30 KC2 touches + 14 KC2 rejects on 5m (~0.5% of bricks). If we wire `keltnerOuterBlock` to "veto SHORT entries when last 5m brick was `REJECT_KC2_INF_*`" we'll see it fire <1 per trading day. That's the right cadence for an exhaustion veto — it doesn't have to fire often, it has to be right when it does.

2. **Inner (KC1) touch+reject is selective enough to be a tradable signal, not a penalty.** ~2.5% non-NONE rate on 5m, mostly INF side in this catalog. The legacy `keltnerInnerPenalty` was the wrong primitive — KC1 touch+reject should be a rejection-playbook trigger (like vwap_rejection), not a quality-score deduction.

3. **Direction asymmetry is huge in this catalog.** 169 KC1_INF touches vs 32 KC1_SUP touches on 5m. Don't over-fit the walker or the playbook to one side — the engine needs both, but expect more LONG-side opportunities (KC1_INF rejects → LONG) in down-trending periods like this catalog.

4. **TF dependency works as expected.** Non-NONE rates: 5m ~3.5%, 15m ~2.1%, 60m ~5.7%. The 60m number is higher because the band classification on a 60m brick reaches a wider price excursion that doesn't always show up as a touch on tighter 5m bands. The walker is per-TF independent (no cross-TF dedup at this layer), which is correct.

### Audit verdict (revised after data)

- **Wiring**: NOT WIRED (no engine reader). Unchanged.
- **Methodology walker**: implemented in the audit script, ready to be promoted to `src/lib/backtest/`.
- **Data**: clean. No NULL bricks on any KC column on any TF across the full catalog.
- **Signal frequency**: KC2 touch+reject is a low-fire high-conviction veto (good); KC1 touch+reject is a low-fire trade trigger (good); position-only classification is too noisy to be a filter on its own (97%+ inside KC1 means the "inside" class carries almost no information).

The audit-doc's "Verdict — NOT WIRED" stands. The wiring fix has higher upside than the audit suggested before running the script — touch+reject as a rejection-playbook trigger is a new playbook, not a gate-tweak.

---

## Open questions (parking lot, decide before coding the walker)

1. **Touch definition — wick vs body?** The methodology spec from Ygor says "touch" includes the wick (any brick extreme reaching/piercing the band). The fibo-lab session 2026-06-15 codified wick-based direction classification as the engine-wide convention ([`CLAUDE.md`](../../../CLAUDE.md) rule #0a). **Recommendation**: wick-based. The visible touch is at the wick, same logic as structural pivots.

2. **Reject window — same brick or N+1 only?** Ygor's spec is ambiguous on whether a same-brick touch+reject (wick pierces band, close back inside) counts, or only the cleaner N+1 pattern (full brick beyond band, next brick closes back inside). **Recommendation**: emit both with distinct classes (`REJECT_SAME_BRICK` vs `REJECT_NEXT_BRICK`) and let the engine composition decide which to consume. The visual smoke test will show which Ygor's eye actually pattern-matches on.

3. **State carry across data gaps?** Same shape as Group A — if the next brick's KC columns are NULL (which the audit confirms doesn't happen on the current parquet, but could on a future TF) carry the prior class or emit `NO_DATA`? **Recommendation**: carry prior class. Same rationale as Group A.

4. **Cross-TF dedup?** When a 60m touch+reject lines up with the 5m one underneath (which it must — the 60m brick contains the 5m bricks that make up the touch), do we double-count? **Recommendation**: no dedup at the walker layer — emit independent per-TF state, let the engine composition decide if a multi-TF aligned touch+reject is a stronger signal than 5m alone.

These are pre-coding decisions, not audit-blocking. Confirm before we write the walker.
