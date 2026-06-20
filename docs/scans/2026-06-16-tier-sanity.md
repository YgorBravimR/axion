# 2026-06-16 — Tier sanity audit (post-15m wiring)

**Script**: `pnpm tsx scripts/audit-tier-sanity.ts`
**Window**: 2026-03-02 → 2026-06-13 (8,280 5m bricks, 2,453 15m bricks; 332 baseline trades)
**Engine**: hawks v0, baseline (all gates default-off), 5-booster checklist live (htf15m + htfPivot15m + macd + ema5m + vwap).

## Headline

**The booster tier ordering is NOT well-formed. B beats AAA on every outcome metric:**

| tier  | n      | %         | W/L/BE       | WR        | avgR       | net          | avg/trade    |
| ----- | ------ | --------- | ------------ | --------- | ---------- | ------------ | ------------ |
| AAA   | 55     | 16.6%     | 14/26/15     | 35.0%     | +0.076     | +R$576       | +R$10.47     |
| AA    | 118    | 35.5%     | 25/60/33     | 29.4%     | +0.013     | -R$917       | -R$7.77      |
| A     | 68     | 20.5%     | 14/36/18     | 28.0%     | -0.002     | -R$410       | -R$6.03      |
| **B** | **91** | **27.4%** | **22/38/31** | **36.7%** | **+0.214** | **+R$1,678** | **+R$18.44** |

The U-shape (AAA and B both outperform the middle) is the diagnostic signal. The booster checklist is supposed to monotonically order: more boosters → better outcome. The observed shape is:

- WR: 35.0 → 29.4 → 28.0 → **36.7** (not monotonic, B is the highest)
- avgR: +0.076 → +0.013 → -0.002 → **+0.214** (B's avgR is **2.8× AAA's**)
- net/trade: +R$10 → -R$8 → -R$6 → **+R$18**

## Interpretation

Three candidate explanations, by likelihood:

**1. One or more boosters is picking up the WRONG side of the signal.** The 5 boosters all check "is X aligned with trade direction" — but on a Renko engine that fires INTO extension, "EMA5m aligned" can mean "price has already moved well past EMA5m," which historically fades. Same logic plausibly applies to vwap alignment. This is consistent with B-tier (fewer "alignments") catching the better fades the methodology over-filters.

**2. The thresholds are mis-calibrated.** The spec maps 5 → AAA, 3-4 → AA, 2 → A, 0-1 → B. If the boosters are individually weak (each only ~30-35% WR), summing them doesn't accumulate into a clean signal. Custom `tierThresholds` (per `TierBreakdownRow` in `tier-analytics.ts`) can be retuned, but won't fix a fundamentally wrong booster.

**3. Sample-size noise at the tails.** AAA has n=55. That's enough for a ballpark WR estimate but the avgR is volatile. **However**, B has n=91 — by far the most reliable bucket — and its outperformance is large enough that this explanation alone can't account for it.

The first explanation is the most actionable. The next probe is a **per-booster outcome audit**: for each of the 5 boosters individually, what's the WR of trades where it fires=true vs fires=false? If one booster fires=true correlates with WORSE outcomes than fires=false, that booster is mis-signed and should be inverted or removed.

## What this DOESN'T mean

- **It does NOT mean the engine is broken.** The trade stream is healthy (332 trades, net +R$927 at baseline). The issue is the _labeling_ layer (which tier is assigned at fire time), not the trade selection.
- **It does NOT mean we should ship "filter to B-only".** The U-shape suggests AAA and B are _different_ setups — the engine's selection logic is mixing two distinct populations. Without understanding which booster is mis-signed, "trade only B" is just curve-fitting to this window.
- **It does NOT invalidate the 15m plumbing work.** Without the 15m candles, AAA would still be 0/332 (unreachable). The plumbing made the AAA bucket measurable; the audit only became possible after that landed.

## Recommended next probe

Write `scripts/audit-per-booster.ts`: instrument the engine (or re-compute the checklist at each fire's brick) and report, per booster, the WR/avgR of trades where it fired vs didn't. The booster whose `fires=true` cohort is WORSE than its `fires=false` cohort is the mis-signed one.

Wire this as a tracked follow-up in `docs/backlog.md`. Until that audit runs, **don't reshuffle tier thresholds or modify the booster checklist** — fixing the wrong booster makes the U-shape worse, not better.

## Pointers

- Booster checklist: `src/lib/backtest/modules/entry/hawks-boosters.ts` (interface), `src/lib/backtest/modules/entry/hawks-playbook.ts:computeBoosterChecklist` (computation)
- Tier mapping: `tierFromChecklist` in hawks-boosters.ts (5 → AAA, 3-4 → AA, 2 → A, 0-1 → B)
- Re-tier path: `tier-analytics.ts:scoreTier` uses `quality.score` (not booster checklist) when custom `TierThresholds` are supplied. Today `quality.score` is independent of the booster checklist — driven by aggression/volume/colorStreak score-modes (Group F/G/H wiring).
