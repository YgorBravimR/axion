# Group G — Volume audit (findings)

**Date**: 2026-06-16.
**Window**: 2026-03-02 → 2026-06-13 (full catalog, 8,280 5m bricks, 332 baseline trades).
**Script**: [`scripts/indicator-isolation/group-g-volume.ts`](../../scripts/indicator-isolation/group-g-volume.ts)
**Audit spec**: [`docs/hawks-strategy/indicator-isolation/group-g-volume.md`](../hawks-strategy/indicator-isolation/group-g-volume.md)

## TL;DR — DELETE THE FLAGS (and the spec is backwards)

The methodology spec (`types/backtest.ts:266`) says: _"+weight if brick volume > running EMA"_. The empirical data says the opposite: **HIGH-volume bricks at engine fires consistently UNDERPERFORM low-volume bricks across every tested EMA period.**

Two load-bearing facts:

1. **Win-rate "lift" (ABOVE − BELOW) is negative at every N**: −2.70pp (N=50), −4.54pp (N=100), −0.53pp (N=200), −1.65pp (N=500), −0.46pp (N=1000). The widest gap is at the lower EMA periods, but none reach the +5pp wiring threshold. The direction is wrong, the magnitude is small.
2. **PnL spread is decisively negative**: at the default N=500, ABOVE fires net −R$612 while BELOW fires net +R$1,485. That's a R$2,097 polarity reversal vs the spec's prediction. The block-mode simulation (veto BELOW-EMA) destroys R$874–1,485 of PnL at every N.

The recommendation is identical to Group F: **delete the config knobs entirely.** No wiring is defensible.

## Raw table — per-EMA-period buckets at the 332 fire bricks

| N (EMA period) | ABOVE n | ABOVE wr | ABOVE net | BELOW n | BELOW wr | BELOW net | Lift (pp) |
| -------------: | ------: | -------: | --------: | ------: | -------: | --------: | --------: |
|             50 |     157 |   30.63% |   −R$ 767 |     165 |   33.33% | +R$ 1,640 | **−2.70** |
|            100 |     159 |   29.63% |   −R$ 911 |     163 |   34.17% | +R$ 1,784 | **−4.54** |
|            200 |     153 |   31.73% |     −R$ 2 |     169 |   32.26% |   +R$ 875 | **−0.53** |
|            500 |     157 |   31.13% |   −R$ 612 |     165 |   32.79% | +R$ 1,485 | **−1.65** |
|           1000 |     155 |   31.78% |   −R$ 359 |     167 |   32.23% | +R$ 1,232 | **−0.46** |

Baseline overall: 332 trades, +R$926.81, 31.91% wr. Across every EMA period, the BELOW-EMA bucket carries the entire baseline PnL and then some — the ABOVE-EMA bucket actively bleeds.

ZERO-volume bucket is small (10 trades at every N, +R$54, 28.6% wr) — degenerate and ignorable.

## Block-mode simulation

Vetoing every BELOW-EMA fire at engine output (post-hoc filtering, no engine re-run since vetoes only suppress):

|    N | Vetoed | Kept | Kept net | Δ vs baseline | Vetoed winRate |
| ---: | -----: | ---: | -------: | ------------: | -------------: |
|  200 |    169 |  163 |   +R$ 52 |   **−R$ 875** |         32.26% |
|  500 |    165 |  167 |  −R$ 558 | **−R$ 1,485** |         32.79% |
| 1000 |    167 |  165 |  −R$ 305 | **−R$ 1,232** |         32.23% |

**Wiring `volume.mode = "block"` would destroy R$ 875–1,485 of baseline PnL.** The methodology's "block low-conviction" idea is exactly backwards on this engine version.

## Why might the methodology be backwards on WIN 5m Renko?

Three honest hypotheses — none can be confirmed at this sample size, but all worth flagging:

1. **Volume "conviction" is a folk-wisdom heuristic that doesn't port to Renko bricks.** A 5m Renko brick is built by a fixed-size price move. "High volume in a 5m window" doesn't have the same meaning as "high volume in a continuous-time bar" — by the time the brick closes, the price has already moved its full distance. High volume often means lots of late-arrivers piling into an already-extended move. The methodology heuristic from continuous-time literature doesn't map cleanly.
2. **The 5m EMA baseline conflates intraday seasonality.** US open (14:30 BRT) has structurally higher volume than 09:00 BRT. ABOVE-EMA fires may be biased toward afternoon trades; BELOW-EMA toward morning. If morning Hawks setups happen to be better than afternoon ones (a real possibility — morning is often the consolidation that mean-reversion likes), the spec's polarity gets reversed not because volume is the wrong signal but because the EMA is the wrong baseline. This is open question Q3 from the audit doc. Worth a follow-up time-of-day-normalized probe IF you care — but the spread is so large (R$2K) that a seasonal effect alone wouldn't explain it.
3. **Hawks v0 plays mean-reversion + retracement.** Both setups structurally prefer quiet, ordered tape over fast/noisy tape. The BELOW-EMA group is consistent with "quiet consolidation where the mean-reversion plays work" — exactly the regime Hawks was tuned for. This is the most parsimonious explanation: the methodology spec was generic ("more volume = better"), but Hawks specifically thrives on the opposite regime.

The data doesn't pick between (1), (2), and (3) — but it doesn't need to in order to make the wiring decision. Whatever the cause, the spec is wrong on this code/data. Don't wire it.

## What this audit does NOT say

- It does NOT say volume is a useless indicator universally. It says the existing flag design (above-EMA = score positive, below-EMA = score negative or block) has no empirical support on this engine version against this catalog.
- A richer volume signal (volume divergence, vs ATR-normalized volume, vs time-of-day baseline) was NOT measured. If you want one of those, fresh design + fresh audit.
- It does NOT say the BELOW-EMA pattern would replicate on a forward sample. With n=165 vs 167 per side, a +4pp lift on one tail is plausibly noise; the consistent negative direction is suggestive, but not statistically airtight. We're confident the rule isn't HELPING, not confident BELOW is actively a +signal.

## Verdict on the spec

The `(planned)` tag in `types/backtest.ts:265-266` was honest — the rule was scoped but never implemented. The audit confirms there was a reason it never got finished: the conjecture is wrong (or, at minimum, doesn't survive contact with the engine that exists). Three paths for the comment:

1. Delete it with the config knob (option 3, the recommended path).
2. Replace with a one-line pointer: "See group-g-volume.md — the proposed rule's polarity is inverted on engine v0.10; treat as folk wisdom that doesn't port to Renko."
3. Keep the `(planned)` tag and pray — not recommended; it leaves the same trap for the next reader.

## Decision matrix

| Option                                | Action                                                                                                                                                                                                     | Cost                                                                 | Risk                                                                                                                                                                                                                               |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 (wire score-original-polarity)**  | Add engine consumer for `volume.mode = "score"` per spec                                                                                                                                                   | M (1-2h walker + tests)                                              | The polarity is empirically WRONG. We'd be wiring a confirmed negative-EV rule.                                                                                                                                                    |
| **1b (wire score-inverted-polarity)** | Wire the OPPOSITE — high volume = penalty                                                                                                                                                                  | M                                                                    | Same risk on a smaller scale: BELOW lift is consistent in direction (5/5 N values negative) but small (−0.5 to −4.5pp). At n=160 per bucket, a real but tiny effect. The honest version requires more data than the catalog gives. |
| **2 (wire block-mode per spec)**      | `volume.mode = "block"` vetoes BELOW-EMA                                                                                                                                                                   | M                                                                    | Block-mode simulation shows this DESTROYS R$ 875–1,485 of PnL. Empirically the worst possible wiring.                                                                                                                              |
| **3 (DELETE)**                        | Strip `volumeScore`, `volumeEmaPeriod`, `volume.*` from `EntryQualityGates`. Remove UI controls. Prune presets / leaves. Clean optimize/storage migration. Replace `(planned)` comment with audit pointer. | S (30-45 min in one PR — same cleanup shape as the Group F deletion) | Some sweep recipes may reference these paths — grep first. Otherwise low.                                                                                                                                                          |

**Recommendation: Option 3.** Same shape as the aggression decision.

## Combined cleanup opportunity with Group F

The Group F deletion (aggression flags) and this Group G deletion (volume flags) are mechanically identical:

- Same files touched (`types/backtest.ts`, `hawks-quality-controls.tsx`, `hawks-leaves.ts`, `hawks-quality-presets.ts`, `optimize/storage.ts`).
- Same shape of cleanup (strip both legacy flat AND nested config; prune leaves; replace folklore comments with audit pointers).
- Same risk profile (sweep-recipe grep + verify lint+tests).

Doing them as ONE cleanup PR is cheaper than two. Worth flagging.

## File pointers

- Audit script: `scripts/indicator-isolation/group-g-volume.ts`
- Audit spec: `docs/hawks-strategy/indicator-isolation/group-g-volume.md`
- Spec source: `src/types/backtest.ts:265-266` (legacy), `:291-294` (nested)
- Dead config knobs: `EntryQualityGates.volumeScore`, `volumeEmaPeriod`, `volume.{mode, emaPeriod}` (all in `src/types/backtest.ts`)
- Dead UI: `src/components/hawks/hawks-quality-controls.tsx` (volume controls)
- Dead preset bundle: `src/lib/backtest/presets/hawks-quality-presets.ts`
- Dead leaves entries: `src/lib/backtest/presets/hawks-leaves.ts`
- Migration code: `src/lib/optimize/storage.ts` (volume nested-shape migration)
