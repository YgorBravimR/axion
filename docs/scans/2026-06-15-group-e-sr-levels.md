# Group E — S/R level proximity audit

**Date**: 2026-06-15.
**Window**: 2026-03-02 → 2026-06-13 (full catalog, 8,280 5m bricks).
**Script**: [`scripts/indicator-isolation/group-e-sr-levels.ts`](../../scripts/indicator-isolation/group-e-sr-levels.ts)
**Audit spec**: [`docs/hawks-strategy/indicator-isolation/group-e-sr-levels.md`](../hawks-strategy/indicator-isolation/group-e-sr-levels.md)
**Config**: block buffer = 2 bricks (200 pts), favor range = 3 bricks (300 pts), brickSize = 100 pts.

## TL;DR

The `srLevelBlock` methodology gate is **NOT WIRED** at runtime (confirmed at the audit-spec phase). The empirical run shows the block fires on a **non-trivial fraction of all bricks**:

|         |  SHORT |   LONG |
| ------- | -----: | -----: |
| Blocked | 30.53% | 33.30% |
| Free    | 69.47% | 66.70% |
| NO_DATA |  0.00% |  0.00% |

For reference, the Keltner outer-block at the equivalent 1-brick interpretation fired on **0.16%** of bricks across the same catalog (and 0 of 332 engine fires). S/R proximity catches **~190×** more bricks. That makes this a much more likely real-signal candidate.

Ajuste was loaded for 66 / ~70 trading sessions — missing days (likely month rollovers / holidays) propagate `null` and don't contribute to the block decision per the audit-spec rule.

## Which level leads the block

For both directions, ranked by "how often it's the nearest blocking level":

| Level       | SHORT blocks | SHORT % of all bricks |   LONG blocks | LONG % of all bricks |
| ----------- | -----------: | --------------------: | ------------: | -------------------: |
| `vwap_d`    | 879 (34.77%) |                10.62% | 1001 (36.31%) |               12.09% |
| `mme27_15m` | 612 (24.21%) |                 7.39% |  594 (21.55%) |                7.17% |
| `mme55_15m` | 461 (18.24%) |                 5.57% |  475 (17.23%) |                5.74% |
| `mme27_60m` | 265 (10.48%) |                 3.20% |  361 (13.09%) |                4.36% |
| `mme55_60m` | 173 ( 6.84%) |                 2.09% |  153 ( 5.55%) |                1.85% |
| `ajuste`    | 138 ( 5.46%) |                 1.67% |  173 ( 6.27%) |                2.09% |

`vwap_d` dominates by a wide margin — it's the most fast-moving level and crosses the price most often, so it shows up as "nearest" disproportionately. The 60m EMAs (a stronger structural S/R per methodology) cause ~17% of blocks combined, the 15m EMAs cause ~40%. Ajuste contributes 6% — fewer than expected, but it's stationary across a session, so when it isn't close it stays not-close all day.

## Favor distribution

How many levels behind the trade are within `srFavorRangeBricks` (3) of the close — i.e., how "cushioned" by S/R support is the entry:

|         | SHORT count (%) | LONG count (%) |
| ------- | --------------: | -------------: |
| favor=0 |   4665 (56.34%) |  5061 (61.12%) |
| favor=1 |   2458 (29.69%) |  2166 (26.16%) |
| favor=2 |    852 (10.29%) |   792 ( 9.57%) |
| favor=3 |    228 ( 2.75%) |   198 ( 2.39%) |
| favor=4 |     64 ( 0.77%) |    50 ( 0.60%) |
| favor=5 |     13 ( 0.16%) |    13 ( 0.16%) |

~3% of bricks have stacked S/R cushion (3+ levels) — those are the "high-quality" trades the methodology's `srLevelFavor` is meant to reward. The audit confirms the signal exists in the data and is computable.

## Reads

### What this confirms

1. **The methodology gate has bite.** A 30%+ block rate is high enough to materially change the trade stream when wired. Unlike Keltner's outer block (0.4%, statistically invisible), this can be A/B tested with confidence on the existing catalog.
2. **`vwap_d` is over-represented.** When a 60m EMA _and_ `vwap_d` are both within buffer, `vwap_d` wins the "nearest" tiebreaker more often because its absolute distance is smaller. For the engine wiring this means: the block decision shouldn't only emit the _nearest_ level — it should emit the _full set_ of within-buffer levels so the strategy can weight them differently.
3. **Ajuste data is patchy but live.** 66 dates loaded, presumably 4–5 days missing in the window. The walker must treat absent ajuste as "no contribution" — fail-open per-level, never propagate null as block.

### What this doesn't say

1. **Block rate ≠ winning trade rate.** A 30% block on raw bricks does not mean 30% of engine fires would be vetoed. Engine fires are biased toward setups that already involve volatility — many of those bricks will sit further from levels than the random brick. Engine-fire overlap needs a separate A/B run (next step).
2. **No methodology weighting yet.** The audit treats all 6 levels equally. The methodology may say "60m EMA = hard block, vwap_d = soft block." This decision is one of the 5 open questions in the audit doc and is required before promoting the walker.
3. **Favor signal has no live consumer.** Even if wiring the block lands, `srLevelFavor` is +score and `EntrySignal.quality.score` has no rule writing to it. Favor wiring is downstream of a scoring system that doesn't exist.

## What to do next

In recommended order:

1. **Confirm the methodology weighting question with Ygor.** Treat all 6 levels equally, OR weight 60m > 15m > vwap_d > ajuste, OR something else. This is a parking-lot question from the audit spec — answer before walker code.

2. **Build the walker** at `src/lib/backtest/hawks-sr-walker.ts` mirroring `hawks-keltner-walker.ts` shape:
   - O(N) build pass: per brick, compute the proximity result for BOTH directions, emit both into a single `SrProximitySnapshot`.
   - Snapshot exposes `block.short / block.long` (bool) + `levelsAhead.short / levelsAhead.long` (full set, not just nearest) + `favorCount.short / favorCount.long`.
   - Same Map<timestamp, snapshot> lookup interface as the KC and VWAP walkers.
   - Lazy build — only when `qualityGates.srLevelBlock === true` or `qualityGates.srLevelFavor === true`.

3. **Wire as a veto consumer** in `hawks-playbook.ts`, mirroring the keltnerOuterBlock pattern (after playbooks fire, before signal emit, route blocked candidates to `appendPrior`). Don't promote to default-on without an A/B audit.

4. **Run the A/B audit** as `scripts/audit-sr-block-ab.ts`. Same shape as the Keltner one — measure: trades vetoed, vetoed-trade win/loss split, net PnL delta, profit factor delta. The high block rate means the statistical sample will be order(50-100) vetoed trades, not order(5), so the result will actually be decisive.

5. **Add a `/dev/hawks-isolation` visualization** showing per-brick badges: `BLOCK[vwap_d -0.5b]` or `FAVOR×3`. Visual smoke before promoting.

6. **Decide on `htfMaBlock` deprecation** — once `srLevelBlock` is wired with the 6-level set, the subset alias is dead. Mark for removal in a follow-up commit.

## File pointers

- Audit script: `scripts/indicator-isolation/group-e-sr-levels.ts`
- Audit spec: `docs/hawks-strategy/indicator-isolation/group-e-sr-levels.md`
- Config knobs: `src/types/backtest.ts` (EntryQualityGates.srLevelBlock / srLevelFavor / srBlockBufferBricks / srFavorRangeBricks)
- Dead UI: `src/components/hawks/hawks-quality-controls.tsx:235-248`
- Dead preset bundle: `src/lib/backtest/presets/hawks-quality-presets.ts:69-78` (strict bundle)
- Sibling wired veto: `src/lib/backtest/modules/entry/hawks-playbook.ts:79-105` (keltnerOuterBlock — model for srLevelBlock wiring)
