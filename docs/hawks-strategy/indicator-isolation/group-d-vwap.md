# Indicator-Isolation Audit — Group D: VWAP (Touch + Reject)

**Status**: GRADED — **PARTIALLY WIRED, METHODOLOGY DRIFT**. The engine reads `vwap_d` for one playbook (`vwap_rejection`) and reads all three VWAPs (`vwap_d` / `vwap_w` / `vwap_m`) + `ajuste` into the indicator snapshot, but: (a) the playbook's trigger is **close-based dip-and-recover**, not the wick-based touch+reject the methodology specifies; (b) `vwap_w` / `vwap_m` / `ajuste` flow into `favorableCount` which is dead — no gate or playbook consumes it; (c) `ajuste` has no parquet column at all, it's injected from `asset_session_anchors` at fetch time and absent on direct reads.
**Date filed**: 2026-06-15.
**Date graded**: 2026-06-15.
**Source code as of**: branch `main` post Group C audit (commit `6e19dbb7`).

---

## Verdict — PARTIALLY WIRED, METHODOLOGY DRIFT

| Aspect                                       | Status                                | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine reads `vwap_d`                        | **WIRED — DRIFT**                     | `vwap_rejection.ts:44-79` consumes `vwap_d` for entry triggers. Trigger is **dip-and-recover by close** (`N=5` lookback for any close on the wrong side), with same-brick `open<vwap` and `close>vwap` to confirm the pierce. NOT the methodology touch+reject.                                                                                                                                                                                                   |
| Engine reads `vwap_w`                        | **DEAD WIRE**                         | `hawks-indicators.ts:218` reads `vwap_w` into the `vwapW: HawksVwapReadout` snapshot field and contributes to `favorableCount`. No downstream gate or playbook reads `vwapW` or `favorableCount`. The `vwap_w_key` config is plumbed (`hawks-presets.ts:78`) but the readout it produces is unused.                                                                                                                                                               |
| Engine reads `vwap_m`                        | **DEAD WIRE**                         | Same shape as `vwap_w`. Read into `vwapM`, contributes to `favorableCount`, no downstream consumer.                                                                                                                                                                                                                                                                                                                                                               |
| Engine reads `ajuste` (D-1 settlement)       | **NO DATA + DEAD WIRE**               | `hawks-indicators.ts:177` reads `candle.indicators[ajusteKey]`. But the column does **not exist in any of the 3 parquets** (`hawk_5m_win`, `hawk_15m_win`, `hawk_60m_win`). Comment at `hawks-presets.ts:39` says ajuste is "injected via asset_session_anchors, not parquet" — true only at fetch time on production runs; the audit script reading parquet directly will see null. Even when populated, the readout feeds `favorableCount` only, which is dead. |
| Methodology-correct wick touch+reject walker | **ABSENT**                            | No "did the brick wick touch VWAP and the next brick close back inside" logic anywhere. The existing playbook is the dip-and-recover variant, not touch+reject.                                                                                                                                                                                                                                                                                                   |
| Visual isolation lab plots all 3 VWAPs       | **PRESENT**                           | `hawks-isolation-charts.tsx:453-473` overlays VWAP D / W / M on all 3 TFs. `hawks-engine-lab.tsx:186` overlays VWAP daily on the engine lab. Used for visual sanity-checks during this audit.                                                                                                                                                                                                                                                                     |
| Data coverage                                | **GOOD for D/W/M, ABSENT for ajuste** | `vwap_d`, `vwap_w`, `vwap_m` populated on every brick across all 3 TFs in the full 2026-03-02 → 2026-06-13 catalog. `ajuste` column not in parquet at all.                                                                                                                                                                                                                                                                                                        |

**The story is more nuanced than Group C.** KC was nothing-wired. VWAP is half-wired and the wired half is doing a related-but-distinct signal:

- **`vwap_d` playbook trigger** = "close was below VWAP for at least one of the prior 5 bricks AND this brick punches through from open-below to close-above." That's a stricter signal than touch+reject — it requires a full close excursion below VWAP, then a same-brick pierce+recover. Touch+reject would catch wick-only touches that the current playbook misses, AND would catch the asymmetric N+1 reject pattern (touch on brick N, reject on brick N+1) that the current same-brick logic also misses.
- **`vwap_w` / `vwap_m` / `ajuste`** = read into `HawksIndicatorSnapshot.vwapW/vwapM/ajuste` with a `favorable` boolean each, summed into `favorableCount`. The snapshot rides on the trade record but **nothing acts on it**. Pure dead write.

---

## What this audit is and is not

This audit is a **wiring audit**: it grades whether Axion reads the indicator the way the methodology says it should be read. It does **not** grade whether the indicator has predictive power — that's the next phase per the indicator-isolation plan in [`docs/backlog.md`](../../backlog.md). Predictive-power isolation comes after the wiring layer is methodology-correct.

For VWAP specifically, the audit's scope is:

1. **Position** — close above/at/below each VWAP (D / W / M) and ajuste. The visual lab already does D/W/M; the audit confirms the classification matches and runs it on the full catalog.
2. **Touch + reject** — Ygor's flagged trigger, same shape as the Group C Keltner spec. A 5m brick "touches" VWAP if any part of the brick (wick included) reaches/pierces it; the touch is confirmed as a reject when the same brick closes back inside OR the immediately following brick closes back inside.
3. **Per-VWAP independence** — VWAP D / W / M and ajuste are four independent reference levels. The walker runs once per level; engine composition decides whether a touch+reject on one level is more important than another (D is typically the most relevant intraday — W and M are macro context, ajuste is the prior-day settlement).
4. **Per-TF** — Hawks uses VWAPs primarily on 5m. The 15m and 60m bricks contain the same VWAP series (it's a time-of-day level, not a TF-derived calc) but a 60m brick "sees" the touch only when the full 60m candle hit the level — finer-grained touches are aggregated away. Audit runs all 3 TFs for completeness.

---

## Source mapping

All three timeframes use the same column names. `ajuste` is the wildcard — methodology consumes it but parquet doesn't carry it:

| Timeframe | Parquet                                         | VWAP daily | VWAP weekly | VWAP monthly | Ajuste                                    |
| --------- | ----------------------------------------------- | ---------- | ----------- | ------------ | ----------------------------------------- |
| 5m        | `data/parquet/candles/hawk_5m_win/WIN.parquet`  | `vwap_d`   | `vwap_w`    | `vwap_m`     | absent (`asset_session_anchors` at fetch) |
| 15m       | `data/parquet/candles/hawk_15m_win/WIN.parquet` | `vwap_d`   | `vwap_w`    | `vwap_m`     | absent                                    |
| 60m       | `data/parquet/candles/hawk_60m_win/WIN.parquet` | `vwap_d`   | `vwap_w`    | `vwap_m`     | absent                                    |

The `vwap_s` historical alias ("semanal" Portuguese) is the same series as `vwap_w` — `hawks-presets.ts:38` documents the rename. No engine reader looks for `vwap_s`; if a future preset injects that key, the `readVwap` call will return null and `vwapW.favorable` will silently flip to `false`.

---

## Paragraph 1 — What Axion's code currently does

**Two distinct code paths, both partial.**

**Path A — the `vwap_rejection` playbook (engine consumer).** Lives in `src/lib/backtest/modules/entry/playbooks/vwap-rejection.ts`. Reads `vwap_d` only. Trigger (LONG):

1. Lookback `N=5` prior bricks. At least one of them closed strictly below VWAP D (the dip).
2. Current brick is bullish (`close > open`).
3. Current brick closes strictly above VWAP D.
4. Current brick opens at or below VWAP D (the pierce-from-below).

Mirror for SHORT. Stop is placed beyond the most extreme low (LONG) / high (SHORT) among the dip bricks, with a `brickBody` buffer. Exit config is locked to `PLAYBOOK_EXIT_DEFAULTS.vwap_rejection` (= Mode 2-ish, static 3R + trail-after-3R). This is the only place the engine actually trades off VWAP.

**Path B — the indicator snapshot (analytics consumer only).** Lives in `src/lib/backtest/hawks-indicators.ts:readVwap` + `readAjuste`. Per direction-aware trade, reads:

- `vwap_d` → `HawksVwapReadout vwapD` (side: above/at/below, favorable boolean, distance)
- `vwap_w` → `vwapW` (same shape)
- `vwap_m` → `vwapM` (same shape)
- `ajuste` → `HawksAjusteReadout ajuste` (position: above/at/below, favorable, distance) — only meaningful when fetched via `asset_session_anchors`; absent on raw parquet.

These four readouts feed into `favorableCount` alongside `gate15m`, `gate60m`, `macd` — a 7-way count of how many indicators favor the trade direction. **`favorableCount` is never consumed by any gate, playbook, or scoring rule.** It rides on the indicator snapshot, attaches to the trade record, surfaces in the journal UI for human reading, and that's the end of it. Same shape as the dead KC UI toggles from Group C, just one layer further along — it's not config-flipping that does nothing, it's a computed value that's never read.

The visual isolation lab (`hawks-isolation-charts.tsx`) overlays all 3 VWAPs on all 3 TFs and badges per-cursor position. Like KC, this is the only place the user can _see_ what the engine is silently computing.

## Paragraph 2 — What the methodology requires (per Ygor's corrections)

Ygor's spec is the same shape as Group C, applied to four reference levels instead of two band pairs:

1. **Position** — classify each brick as above / at / below each reference level (VWAP D, W, M, ajuste). The current snapshot already does this correctly via `readVwap` and `readAjuste` — that piece is methodology-aligned, it's just unused.

2. **Touch + reject (the trigger)** — wick-based. A brick "touches" VWAP D from below when `brick.low <= vwap_d` and the brick was previously below (i.e. the close at `t-1` was below); mirror for "touch from above". The touch is confirmed as a reject when:
   - **Same-brick reject**: `brick.low <= vwap_d AND brick.close > vwap_d` (the wick punched through and the close came back).
   - **Next-brick reject**: prior brick touched VWAP (wick crossed) AND the current brick closes back on the original side.

   The current `vwap_rejection` playbook is **stricter than touch** (requires a full prior-brick close beyond VWAP) and **narrower than reject** (same-brick pierce only — no asymmetric N+1). It will miss two real signals the methodology cares about: pure wick touches that don't generate a prior-brick close excursion, and clean N+1 rejects where brick N wicked through and brick N+1 closes back.

3. **Per-VWAP semantics**:
   - **VWAP D** = today's volume-weighted average. The primary intraday reference. Touch+reject signals are most actionable here.
   - **VWAP W** = current calendar week's VWAP. Slower-moving, swing-level reference.
   - **VWAP M** = current calendar month's VWAP. Macro context — touch+reject on VWAP M is rare and structurally important.
   - **AJUSTE** = prior-day settlement. A single horizontal price level per session. Touch+reject on ajuste is a session-open structural signal — price reaching back to the prior settlement and rejecting is a common Hawks setup.

4. **Per-TF independence** — same rule as Group C. Walker runs per TF; the engine composition decides cross-TF dedup (recommended: no dedup at the walker layer, let the engine pick the strongest signal across TFs).

5. **The dip-and-recover variant is a DIFFERENT signal, keep both.** The current `vwap_rejection.ts` logic is not _wrong_, it's just _not touch+reject_. The dip-and-recover (full prior close excursion + same-brick pierce+recover) is a tighter, lower-frequency, higher-conviction signal. The wick touch+reject is a looser, higher-frequency, lower-conviction signal. **Recommendation**: keep dip-and-recover as `vwap_rejection_strict`, add wick touch+reject as `vwap_rejection_wick` (or generalize both into a `band_rejection` playbook parameterized by source level + trigger variant). Decide after seeing frequency from the audit.

---

## What the wiring audit script will check

The script in [`scripts/indicator-isolation/group-d-vwap.ts`](../../../scripts/indicator-isolation/group-d-vwap.ts) computes, for each TF independently and for each VWAP source (D / W / M):

1. **Position walker** — close vs VWAP, classifies as `above` / `at` / `below`.
2. **Wick touch+reject walker** — emits per-brick events of class:
   - `NONE` (no touch this brick)
   - `TOUCH_FROM_ABOVE` / `TOUCH_FROM_BELOW` (wick crossed, no reject confirmed)
   - `REJECT_FROM_ABOVE_SAME_BRICK` / `REJECT_FROM_BELOW_SAME_BRICK`
   - `REJECT_FROM_ABOVE_NEXT_BRICK` / `REJECT_FROM_BELOW_NEXT_BRICK`
   - `CROSS` (the close crossed VWAP this brick — a non-reject crossing)
   - `NO_DATA` (VWAP null on this brick or the prior one)

   "From above" = brick was above VWAP at `t-1`, wicked down to touch at `t`. "From below" = mirror.

3. **Axion's `vwap_rejection` playbook trigger** — re-implemented (close-based dip-and-recover) per brick, emitting `AXION_REJECT_LONG` / `AXION_REJECT_SHORT` / `NONE`. This lets us diff "where does the playbook fire" against "where does methodology touch+reject fire" on the same brick stream.

4. **Diff classification**:
   - `AGREE_REJECT` — both methodology and axion fired on the same brick, same direction.
   - `METHODOLOGY_ONLY` — methodology saw a touch+reject the playbook missed (expected to be many).
   - `AXION_ONLY` — playbook fired but methodology didn't classify as touch+reject (expected: dip-and-recover patterns where the wick never touched VWAP cleanly).
   - `NO_DATA` — one or both readers had null.

5. **Cross-tab** — touch+reject class × VWAP source × TF. Tells us how often each signal type fires and where the biggest methodology/axion gap is.

Output mirrors Groups B and C: per-TF totals, per-class counts and percentages, sample timestamps per class, sign-flip counters.

---

## Visual smoke test (Step 3, after script verdict)

The visual lab already overlays VWAP D / W / M on all 3 TFs (`/dev/hawks-isolation` Group D section). Once the methodology walker lands, add touch+reject markers (small ▼ on touch from above, ▲ on touch from below, ✗ on the reject confirmation brick) at the wick extreme on the relevant brick. Acceptance bar: 5 random catalog days, scroll with Ygor, ≥4 of 5 fully agree visually.

---

## After Group D is verified

1. **Promote walkers into engine.** New shared `walkBandTouchReject` in `src/lib/backtest/` parameterized by band source — same walker covers VWAP D/W/M, ajuste, KC1, KC2. This is a meaningful refactor; it shifts the touch+reject machinery from "VWAP-specific playbook" + "KC-specific playbook" to a single primitive that the engine composes from.

2. **Extend `getHawksIndicatorsAt`** to attach per-VWAP touch+reject state alongside the existing position readout. The dead `favorableCount` becomes either (a) wired to a scoring rule that biases entry size, or (b) deleted as dead computation.

3. **Add `vwap_rejection_wick` playbook (or generalize).** The wick touch+reject variant is a new playbook id. Either ship alongside `vwap_rejection` (now `vwap_rejection_strict`) as a sibling, or refactor into a `band_rejection` playbook that takes `{source: "vwap_d" | "vwap_w" | "kc1_sup" | …, variant: "wick" | "close"}` as config. Decide after seeing comparative frequency.

4. **Decide on ajuste**. Either: (a) materialize ajuste into the parquet during `materialize-hawks-timeframes.ts` (consistent with the other indicators, audit-script readable), or (b) keep ajuste as a fetch-time injection from `asset_session_anchors` and clearly document the audit-script limitation. Recommendation: (a) — the inconsistency of "this one indicator gets a different injection path" is a footgun and the data is already in the asset table.

5. **Remove `favorableCount` from `HawksIndicatorSnapshot`** OR wire it. The dead-write state is the same trap as the KC UI toggles.

6. **Move to Group E** (next on the indicator-isolation plan — pivots / S/R levels, the existing `srLevelBlock` family).

---

## Empirical results — full catalog (2026-03-02 → 2026-06-13)

Ran [`scripts/indicator-isolation/group-d-vwap.ts`](../../../scripts/indicator-isolation/group-d-vwap.ts) on the full materialised window. Counts are **per brick**.

### 5m (8,280 bricks)

| Class                           | vwap_d % | vwap_w % | vwap_m % |
| ------------------------------- | -------: | -------: | -------: |
| `NONE`                          |    80.06 |    92.57 |    96.97 |
| `TOUCH_FROM_BELOW` (degenerate) |     0.04 |     0.01 |     0.00 |
| `REJECT_FROM_ABOVE_SAME_BRICK`  |     4.26 |     1.38 |     0.46 |
| `REJECT_FROM_BELOW_SAME_BRICK`  |     4.57 |     1.35 |     0.62 |
| `REJECT_FROM_ABOVE_NEXT_BRICK`  |     1.34 |     0.51 |     0.21 |
| `REJECT_FROM_BELOW_NEXT_BRICK`  |     1.58 |     0.66 |     0.29 |
| `CROSS`                         |     8.15 |     3.51 |     1.46 |

**Position distribution (vwap_d):** 45.58% above, 54.38% below — near-symmetric, consistent with VWAP being a true mean. Compare to KC1 (97% inside the band) — VWAP is a fundamentally different shape of indicator and the methodology touch+reject signal is much higher frequency here.

**Methodology vs Axion playbook diff (vwap_d only — the only level the playbook reads):**

| Bucket                        | Count |     % |
| ----------------------------- | ----: | ----: |
| `METHODOLOGY_ONLY_FROM_ABOVE` |   395 |  4.77 |
| `METHODOLOGY_ONLY_FROM_BELOW` |   436 |  5.27 |
| `AXION_ONLY_LONG`             |   378 |  4.57 |
| `AXION_ONLY_SHORT`            |   365 |  4.41 |
| `BOTH_NONE`                   | 6,706 | 80.99 |

**No `AGREE_*` rows.** Zero overlap across 8,280 bricks. The methodology touch+reject and the axion close-based dip-and-recover are **substantially disjoint signal sets** — not "drift" in the same direction, they fire on different bricks entirely. The audit doc's framing of "drift" undersells this; the more honest reading is "two different signals that happen to share the name 'vwap rejection'".

That has a real implication: when we wire the methodology walker, the new playbook (call it `vwap_rejection_wick`) is genuinely additive to `vwap_rejection_strict` (the current one) — they're not redundant. Whether both should be on by default, or whether one should replace the other, is now a backtest question rather than a refactor question. **Run both side by side, measure PnL of the disjoint fire sets separately, decide.**

### 15m (2,453 bricks)

| Class                          | vwap_d % | vwap_w % | vwap_m % |
| ------------------------------ | -------: | -------: | -------: |
| `NONE`                         |    67.02 |    87.04 |      ~94 |
| `REJECT_FROM_ABOVE_SAME_BRICK` |     7.75 |     2.49 |     ~0.7 |
| `REJECT_FROM_BELOW_SAME_BRICK` |     8.23 |     2.73 |     ~0.9 |
| `REJECT_FROM_ABOVE_NEXT_BRICK` |     1.47 |     0.65 |     ~0.4 |
| `REJECT_FROM_BELOW_NEXT_BRICK` |     2.57 |     0.98 |     ~0.5 |
| `CROSS`                        |    12.96 |     6.11 |       ~3 |

15m diff vs axion playbook (vwap_d):

- METHODOLOGY_ONLY: ~17% (vs 10% on 5m — touch+reject signal is denser on 15m).
- AXION_ONLY: ~14%. Still disjoint from methodology.
- BOTH_NONE: 69%.

### 60m (565 bricks)

Touch+reject and CROSS rates higher again because each 60m brick has a wider price excursion. Same pattern: methodology vs axion are disjoint.

### Cross-TF read for engine wiring

1. **VWAP touch+reject is a HIGH-frequency trigger, not a veto.** ~12% of 5m bricks are some flavor of reject on vwap_d. This is the opposite of KC2 (0.5% — exhaustion veto). VWAP should drive **playbook fires**, KC should drive **gate/veto**. Don't reuse the same engine wiring shape for both.

2. **vwap_w and vwap_m are sparser but follow the same pattern.** ~3.9% reject rate on 5m vwap_w, ~1.6% on vwap_m. Worth wiring — vwap_w / vwap_m rejects are higher-conviction (lines weighted by more data). The dead `favorableCount` should become live consumption of these.

3. **The disjoint-signal finding is the headline.** The current `vwap_rejection` playbook and the methodology wick touch+reject **share zero fires across 8,280 bricks**. That's not drift, that's two unrelated triggers wearing the same name. The wiring fix is to ship the wick variant as a NEW playbook, not to "fix" the existing one. The existing close-based variant is a real signal too — it just isn't methodology-named-correctly.

4. **Naming follow-up**: rename current playbook to `vwap_dip_recover` (or `vwap_rejection_close`) and reserve `vwap_rejection` (or use `vwap_rejection_wick`) for the methodology-aligned wick variant. The current name is misleading — the audit shows it's catching a different thing than the methodology calls "VWAP rejection".

5. **Ajuste data gap is its own follow-up.** Independent of the touch+reject work — materialize ajuste into parquet so the audit script can read it directly, or document the asset-anchor injection path so future audits know to handle ajuste differently. Either way, the current state (column missing from parquet, readout dead-write to `favorableCount`) is the least-useful possible state.

### Audit verdict (revised after data)

- **Wiring**: PARTIAL — `vwap_d` consumed by ONE playbook (close-based, not methodology touch+reject); `vwap_w` / `vwap_m` read but dead; `ajuste` absent from parquet.
- **Methodology walker**: implemented in the audit script.
- **Data**: clean for `vwap_d` / `vwap_w` / `vwap_m`; absent for `ajuste`.
- **Signal frequency**: high (~12% non-NONE on 5m vwap_d). Drives a playbook, doesn't gate.
- **Surprise finding**: methodology and existing playbook are **disjoint signal sets** — not the same signal with drift.

---

## Open questions (parking lot, decide before coding the walker)

1. **Touch direction memory — how far back?** The "from above" / "from below" classification needs to know which side the brick was on _before_ the wick touch. Options:
   - **t-1 close**: simple, but `at` (close exactly on VWAP) is ambiguous.
   - **Sticky state from last unambiguous side**: walker carries the last clearly-above-or-below side across `at` ambiguities.
     **Recommendation**: sticky state. Same shape as Group A's HTF gate sticky walker.

2. **"Touch" with same-brick close on the other side — is that already a reject?** If brick low <= vwap AND brick close > vwap, that's both touch_from_below AND reject_from_below_same_brick by my definitions. **Recommendation**: prefer the reject classification in the priority ordering (rejects beat touches when both hold) — same as Group C.

3. **Ajuste handling in the audit script?** Audit script reads parquet directly. Options:
   - **Skip ajuste in audit**: simplest. Note absence explicitly. Acceptable for wiring grade, less useful for empirical frequencies.
   - **Join with asset_session_anchors on date**: requires DB connection or anchor parquet (does one exist?). More accurate but more setup.
     **Recommendation**: skip in the audit script with an explicit "ajuste: NO DATA on parquet — see code path B" line in the output. Materialize ajuste into the parquet as a follow-up (open question 4 in "after verified" section).

4. **Cross-VWAP dedup?** When VWAP D touch+reject coincides with VWAP M touch+reject (they're near each other in a quiet market), do we double-count? **Recommendation**: no dedup at walker layer — let the engine composition decide. Same as Group C.

5. **Is the existing `vwap_rejection` playbook's same-brick pierce+recover requirement too strict?** Per the methodology, the open-at-or-below requirement (LONG case) is _stricter_ than needed — it forces the rejection to happen entirely within one brick. The methodology allows N+1 rejects too. **Recommendation**: confirm with Ygor whether the open-condition is methodology-faithful or an engineering simplification that drifted from spec. The audit script's diff will show how many fires the strict version misses.

These are pre-coding decisions, not audit-blocking. Confirm before we promote the walker.
