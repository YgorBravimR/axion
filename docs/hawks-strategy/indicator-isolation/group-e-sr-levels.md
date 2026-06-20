# Indicator-Isolation Audit — Group E: S/R Horizontal Levels (Proximity Block + Favor)

**Status**: GRADED — **PRIMITIVE SHIPPED, NOT YET WIRED INTO ENGINE**. The methodology-correct proximity walker (`src/lib/backtest/hawks-sr-walker.ts`) was promoted on 2026-06-16, mirroring the Keltner walker pattern. The orchestrator (`hawks-playbook.ts`) does NOT yet consume it — that's blocked on the methodology-weighting question (Open Question 1 below). The `qualityGates.srLevelBlock` / `srLevelFavor` flags still have no engine reader.
**Date filed**: 2026-06-15.
**Date graded**: 2026-06-15.
**Date walker landed**: 2026-06-16.
**Source code as of**: branch `main` post Keltner-veto HOLD (`b8943aea`).

---

## Verdict — NOT WIRED

| Aspect                                         | Status          | Evidence                                                                                                                                                                                                                                                      |
| ---------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Engine reads `srLevelBlock`                    | **NOT WIRED**   | `grep -rn "srLevelBlock" src/lib/backtest/modules` returns 0 matches. The orchestrator (`hawks-playbook.ts`) and playbooks (mean_reversion, retracement, vwap_rejection) never reference the flag.                                                            |
| Engine reads `srLevelFavor`                    | **NOT WIRED**   | Same shape — config-only.                                                                                                                                                                                                                                     |
| Config exposes the 4 flags + 2 distance fields | **PRESENT**     | `EntryQualityGates.srLevelBlock / srLevelFavor / srBlockBufferBricks / srFavorRangeBricks` (`src/types/backtest.ts:236-269`). Default block-buffer = 2 bricks, favor-range = 3 bricks.                                                                        |
| Legacy `htfMaBlock` flag                       | **NOT WIRED**   | `EntryQualityGates.htfMaBlock` is documented as the legacy alias for srLevelBlock restricted to the 4 HTF MAs (no vwap_d / ajuste). Also unread by engine code.                                                                                               |
| UI gate toggles                                | **DEAD UI**     | `hawks-quality-controls.tsx:235-248` renders both `srLevelBlock` and `srLevelFavor` toggles. No engine consumer.                                                                                                                                              |
| `strict` quality bundle hits these             | **CONFIG-ONLY** | `hawks-quality-presets.ts:69-78` opt-in bundle sets `srLevelBlock: true` + `srLevelFavor: true`. Selecting it changes nothing at runtime (no consumer).                                                                                                       |
| Methodology-correct proximity walker           | **SHIPPED**     | `src/lib/backtest/hawks-sr-walker.ts` (2026-06-16). Per-brick `SrWalkerSnapshot` with both directions, full `levelsAhead[]` (sorted nearest-first) + `favorCount` + `favorLevels[]`. 13/13 unit tests pass. Engine consumer = pending.                        |
| Data coverage                                  | **GOOD**        | All 6 primary levels (mme27_60m, mme55_60m, mme27_15m, mme55_15m, vwap_d) are in the per-brick parquet. `ajuste` is injected via `asset_session_anchors` at fetch time (same as Group D — present at engine boundary but absent from the raw parquet schema). |

**Same shape as Group C before the wiring landed**: a real methodology concept that ships with UI affordances but zero engine consumption. This is the natural next domino.

---

## What this audit is and is not

This is a **wiring audit** in the same sense as Groups A/B/C/D. We're grading whether Axion implements the methodology, not whether the indicator has predictive power.

For S/R levels specifically, the audit's scope is:

1. **Proximity classification** — for each brick + each trade direction, classify whether any level is "ahead" of the trade within `srBlockBufferBricks` bricks (the block condition) and/or "behind" the trade within `srFavorRangeBricks` bricks (the favor condition).
2. **Per-level identity** — when multiple levels are ahead, the audit should record WHICH level (mme27_60m, vwap_d, etc.) so we can later score by level type. The methodology weight may differ (60m EMA = harder S/R than 15m EMA; ajuste = session-level structural; etc.).
3. **Engine fire bricks vs methodology fires** — same diff pattern as Groups A/B/C/D: at the bricks where the playbook engine actually fires, how often is the methodology saying "BLOCKED"? The Keltner audit found that diff ratio was ~0.4% (KC outer rejects are rare). For S/R levels, distances of 2-3 bricks against 5+ candidate levels should produce a much higher fire rate.

---

## Source mapping

The methodology consumes **two distinct groups** of horizontal levels:

| Family   | Level               | Source                        | Notes                                                            |
| -------- | ------------------- | ----------------------------- | ---------------------------------------------------------------- |
| HTF EMAs | `mme27_60m`         | parquet per-brick             | 60m exponential MA 27 — strongest of the 4                       |
|          | `mme55_60m`         | parquet per-brick             | 60m exponential MA 55                                            |
|          | `mme27_15m`         | parquet per-brick             | 15m exponential MA 27                                            |
|          | `mme55_15m`         | parquet per-brick             | 15m exponential MA 55                                            |
| Anchors  | `vwap_d`            | parquet per-brick             | Daily VWAP — also consumed by `vwap_rejection` playbook          |
|          | `ajuste`            | `asset_session_anchors` table | D-1 settlement — single horizontal per session                   |
| (Opt)    | `vwap_w` / `vwap_m` | parquet per-brick             | Weekly / monthly VWAP. Currently dead in the indicator snapshot. |

The legacy `htfMaBlock` flag restricts the level set to **just the 4 HTF EMAs** (no vwap_d, no ajuste). Per `types/backtest.ts:276-278`, "Prefer srLevelBlock" — `htfMaBlock` is held for back-compat with old recipes only.

---

## Paragraph 1 — What Axion's code currently does

**Nothing at runtime.** The engine never reads any of these proximity gates. The UI toggles are dead affordances. The `strict` quality bundle includes the flags as "true" but selecting `strict` produces the same fire stream as `off`. Same trap shape as the pre-v0.10 Keltner state.

The closest live consumer is the `vwap_rejection` playbook (`src/lib/backtest/modules/entry/playbooks/vwap-rejection.ts`) which reads `vwap_d` for the dip-and-recover trigger — but that's a trigger, not a proximity gate.

The HTF-walker readouts (`HawksIndicatorSnapshot.vwapD / vwapW / vwapM / ajuste`) carry `distance: close - level` per snapshot. So the **data the methodology needs is computed** — it just feeds into the dead `favorableCount` (per Group D audit) instead of into a gate.

## Paragraph 2 — What the methodology requires

For each brick at fire time (= candidate entry):

**Block condition (`srLevelBlock`):**
For each level L in {mme27_60m, mme55_60m, mme27_15m, mme55_15m, vwap_d, ajuste}:

- For SHORT entry at price P: L is "ahead" if `L < P` (below entry — would act as floor). It's within block buffer if `(P - L) <= srBlockBufferBricks * brickSize`.
- For LONG entry at price P: L is "ahead" if `L > P` (above entry — would act as ceiling). Within block buffer if `(L - P) <= srBlockBufferBricks * brickSize`.

If ANY level satisfies the within-buffer-ahead condition → veto the fire.

**Favor condition (`srLevelFavor`):**
Mirror logic. L is "behind" the trade if:

- For SHORT: `L > P` (above entry — acts as ceiling above, cushion for the trade).
- For LONG: `L < P` (below entry — acts as floor below, cushion).

Within favor range if the distance is ≤ `srFavorRangeBricks * brickSize`. Each "behind level" within range adds +1 to the favor count. Currently this is a score-only signal, not a block.

**Per-level identity matters for follow-up scoring.** The methodology may weight `mme27_60m` (a strong HTF EMA, hard S/R) differently from `vwap_d` (a fast-moving anchor, soft S/R). The walker should preserve which level triggered, not just a boolean.

**Window unit reminder.** "Bricks" here means **brick-body units**, not chart bars. With `brickSize5mPoints = 100`, `srBlockBufferBricks = 2` = 200 points. On WIN that's 40 ticks. Honest size — the average daily range on WIN is ~400-800 points, so 200 points is a meaningful "near" threshold.

---

## What the wiring audit script will check

The script in [`scripts/indicator-isolation/group-e-sr-levels.ts`](../../../scripts/indicator-isolation/group-e-sr-levels.ts) computes, on the catalog window:

1. **Per-brick proximity classification** for both SHORT and LONG candidates, for each level in the 6-level set. Output:
   - `block` flag (any level ahead within `srBlockBufferBricks`)
   - `nearest_ahead_level` and `nearest_ahead_distance_bricks` (which level + how close)
   - `favor_count` (number of levels behind within `srFavorRangeBricks`)
2. **Aggregate distributions**:
   - % of all bricks where block fires (per direction)
   - per-level "lead the block" frequency (which levels actually cause the veto, vs which are just along for the ride)
   - distribution of `favor_count` (0, 1, 2, 3, …)
3. **Engine fire vs methodology block overlap**: at the 332 baseline trades' bricks, how many would be block-vetoed? Same diff structure as the Keltner A/B.

Output mirrors Groups B/C/D: per-class counts and percentages, sample timestamps, an "engine fires by class" breakdown.

---

## Visual smoke test (Step 3, after script verdict)

Add a per-brick badge to the existing `/dev/hawks-isolation` lab showing the proximity readout: e.g. `BLOCK[mme27_60m at -1.8 bricks]` or `FAVOR×3`. Promote the walker into the engine once Ygor scrolls 5 catalog days and confirms ≥4 of them visually match the badge classifications.

---

## After Group E is verified

1. **Promote the walker into the engine.** New `walkSrLevels(candles, config): Map<timestamp, SrSnapshot>` mirroring `hawks-keltner-walker.ts`. The snapshot carries the block + favor classifications for BOTH directions (since direction is unknown until fire time). Then the orchestrator picks the relevant direction.

2. **Wire into the playbook orchestrator** alongside the existing `keltnerOuterBlock` veto. Same shape: after playbooks fire, before signal emission, check `srLevelBlock` against the methodology snapshot.

3. **Decide on the favor signal** — score weight, tier bump, or block-replacement? Today it's documented as +weight; that needs to feed into a real scoring rule (which doesn't exist yet — `EntrySignal.quality.score` is computed but no rule writes to it).

4. **Decide on `htfMaBlock` deprecation** — once `srLevelBlock` is wired with the full level set, the `htfMaBlock` subset alias is redundant. Mark for removal in a follow-up.

5. **Run an A/B audit** like the Keltner one. Block rate is likely much higher than Keltner's 0.4% — possibly 10-30% of bricks given 6 levels at ±2-brick proximity. This is more likely to be a real signal because:
   - Higher base rate → more catches → statistical significance achievable on the existing catalog window.
   - Methodology motivation is direct ("don't enter into a wall"), not exhaustion-pattern-conditional like KC.

---

## Open questions (parking lot, decide before coding the walker)

1. **Should `vwap_w` and `vwap_m` be in the level set?** Today the dead `favorableCount` includes them. Methodology mentions D-VWAP explicitly but not W/M. Recommendation: start with the 6-level set (4 HTF EMAs + vwap_d + ajuste); add W/M only if Ygor's spec calls for them.

2. **Should the brick-buffer scale by current ATR / brickSize / per-week renko size?** Today `brickSize5mPoints = 100` is a recipe constant. If a per-week sizing change ever lands, the proximity test should scale with it. Recommendation: read brickSize from the recipe config at engine init (already there), use that.

3. **For `ajuste`, what happens on session-1 of a new month / instrument rollover?** The D-1 settlement may not exist. The walker should emit "level not available" for that level, not treat the absence as "no block". Recommendation: filter null levels out of the comparison set per brick, don't propagate them into the block decision.

4. **Block on FIRST ahead level OR all levels at once?** Methodology block is binary — any level within buffer = block. Recommendation: emit the first hit + the count of total hits (so analytics can see "stacked" S/R zones).

5. **Does the methodology block fire when the entry price IS the level?** Edge case: P == L within rounding. Recommendation: distance 0 counts as a block (the level is literally at the entry, can't get more obstructed than that).

These are pre-coding decisions, confirm before promoting the walker.

---

## Empirical results (2026-06-15 catalog run)

Full audit output: [`docs/scans/2026-06-15-group-e-sr-levels.md`](../../scans/2026-06-15-group-e-sr-levels.md).

Headline figures on the 8,280-brick catalog window:

| Direction | Block rate |   Free | NO_DATA |
| --------- | ---------: | -----: | ------: |
| SHORT     |     30.53% | 69.47% |   0.00% |
| LONG      |     33.30% | 66.70% |   0.00% |

vs Keltner outer-block at the equivalent 1-brick buffer: 0.16% block rate, 0 of 332 engine fires touched. S/R proximity is **~190× denser**.

Block-leader frequency:

| Level       | SHORT %-of-blocks | LONG %-of-blocks |
| ----------- | ----------------: | ---------------: |
| `vwap_d`    |            34.77% |           36.31% |
| `mme27_15m` |            24.21% |           21.55% |
| `mme55_15m` |            18.24% |           17.23% |
| `mme27_60m` |            10.48% |           13.09% |
| `mme55_60m` |             6.84% |            5.55% |
| `ajuste`    |             5.46% |            6.27% |

**Verdict on signal density**: this is a real, dense, methodology-driven signal that's invisible to the engine. The wiring gap is meaningful — order-of-magnitude bigger than the Keltner gap, and big enough that the A/B audit (next step after walker promotion) will produce a statistically resolvable answer.

**Recommendation**: proceed with walker promotion **after** Ygor resolves the methodology-weighting open question (Q above). Do not default-on the flag in this PR — same posture as the Keltner HOLD.
