# Group H — Color-streak (VB / Virada de Box) audit

**Status**: audit complete 2026-06-16. Walker not built (the signal is point-in-time per fire brick, no stateful walker needed). Default-off score-mode wiring is the recommendation.

## Methodology hook

Renko bricks come in two colors. A "color streak" at brick `i` is the maximal run of consecutive same-color bricks ending at `i`, INCLUSIVE of `i`. Examples:

- Single bullish brick after a bearish run → STREAK_1 ("Virada de Box" / "box flip" / "VB")
- Second bullish brick in a row → STREAK_2 (first continuation)
- Fifth bullish brick in a row → STREAK_5_plus (extension)

The methodology gates each playbook fire to require the brick color to match the trade direction (`isBullishBrick === long`). The orchestrator does NOT condition on streak length today. The audit asks: does streak length predict outcome?

## Buckets

Per fire, two dimensions:

1. **Alignment**: ALIGNED (brick color matches trade direction), ANTI (opposes), NEUTRAL (doji — rare on WIN Renko).
2. **Streak length**: STREAK_1, STREAK_2, STREAK_3, STREAK_4, STREAK_5_plus.

Cross-product = 15 buckets (3 × 5), but only ALIGNED × {1..5+} typically has meaningful n.

## Sample window

`2026-03-02 → 2026-06-13`, 8,280 5m Renko bricks, 332 baseline trades (Hawks v0, all veto flags off, all booster flags as default).

## Findings

```
ALIGNED — 316 trades (95.2% of fires)
  STREAK_1       n=243  76.9%   W/L/BE 56/115/72   WR 32.75%  avgR  0.131   net +R$1,789
  STREAK_2       n= 13   4.1%   W/L/BE   2/6/5     WR 25.00%  avgR -0.362   net   -R$462
  STREAK_3       n= 12   3.8%   W/L/BE   3/6/3     WR 33.33%  avgR  0.312   net    -R$  2
  STREAK_4       n= 25   7.9%   W/L/BE   7/12/6    WR 36.84%  avgR -0.044   net   -R$ 85
  STREAK_5_plus  n= 23   7.3%   W/L/BE   5/12/6    WR 29.41%  avgR -0.087   net   -R$ 56

ANTI — 16 trades (4.8% of fires)
  STREAK_1       n=  1   (skip — too few)
  STREAK_2       n=  1   (skip)
  STREAK_3       n=  5   WR 0%, net -R$180  (avoid)
  STREAK_4       n=  4   (too few)
  STREAK_5_plus  n=  5   WR 20%, net -R$180  (avoid)
```

## Reading

**1. The engine is already de-facto ALIGNED.** 95.2% of fires land on a brick whose color matches the trade direction. The orchestrator's existing per-playbook color check explains this — there's no audit value in adding a redundant ALIGNED block.

**2. ANTI fires (4.8%) are uniformly poor.** Every ANTI bucket with n ≥ 5 is a net loser. n total is still only 16, so this is suggestive, not conclusive. The mean_reversion playbook is the most likely source — it allows a counter-color fire when the dip-and-reject completes mid-brick.

**3. STREAK_1 dominates the profitability.** 76.9% of all ALIGNED fires AND the only consistently profitable bucket. Net +R$1,789 vs the other ALIGNED buckets combined at -R$606 (across n=73). This matches the methodology's "VB" / "Virada de Box" preference for FLIP fires over continuation fires.

**4. Continuation buckets (STREAK_2–5+) are net negative across n=73.** The win-rate at STREAK*4 (36.84%) looks decent but the avgR is -0.044 because the wins are smaller and the BE rate is high. The methodology's intuition that a "stretched" leg is less likely to follow through is \_directionally correct on this data*, but the per-bucket sample sizes (n=12-25) don't allow a confident veto.

## Recommendation

**Wire as a score-mode favor, default off.** Add `qualityGates.colorStreakFavor` toggle that emits a positive contribution when the fire brick is STREAK_1 (VB). Do NOT wire as a block — STREAK_2-5 lose net but each bucket's n is too small to confidently veto. The score lets the optimizer prefer STREAK_1 fires through the tier-analytics re-tier path without removing trades.

Implementation matches the Group F (aggression) score-mode pattern that landed 2026-06-16: add a `colorStreakFavor: boolean` flag, populate `quality.contributions[]` with a `{key: "colorStreakVB", signal: "favor" | "neutral", weight: 1, ...}` entry. No walker needed — streak length is computable from `priorBricksToday` in O(N) at fire time.

**Optional probe**: also wire as `colorStreakAntiBlock`, default off. ANTI fires are 4.8% of the catalog and all-lose, but n=16 is too small to ship by default. If the user later wants to A/B test, the wiring is trivial.

## Pointers

- Audit script: `scripts/indicator-isolation/group-h-color-streak.ts`
- Findings: `docs/scans/2026-06-16-group-h-color-streak.md` (this file is the spec; that one will hold the dated scan record)
- Playbook color checks: `src/lib/backtest/modules/entry/playbooks/{mean-reversion,retracement,vwap-rejection}.ts` — all check `isBullishBrick` / `isBearishBrick` already.
- Sibling: Group F (aggression score-mode wiring pattern) at `src/lib/backtest/modules/entry/hawks-playbook.ts:computeQualityContributions`.
