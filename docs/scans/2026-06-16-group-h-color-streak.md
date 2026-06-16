# 2026-06-16 — Group H scan: color-streak run-length

**Script**: `pnpm tsx scripts/indicator-isolation/group-h-color-streak.ts`
**Window**: 2026-03-02 → 2026-06-13 (8,280 5m Renko bricks; 332 baseline trades)
**Baseline**: hawks v0, all veto flags off, all booster flags default. Net R$ +926,81 / WR 31.91% / avgR +0.076.

## Headline

STREAK_1 (Virada de Box / box-flip) is **76.9% of all ALIGNED fires AND the only consistently profitable bucket**:

- STREAK_1: n=243, WR 32.75%, avgR +0.131, net **+R$1,789**
- STREAK_2..5+: n=73 combined, net **-R$606** (each individual bucket is small n=12-25 and net-negative)

ANTI fires (4.8% of catalog, n=16) are uniformly poor (every bucket with n ≥ 5 is a net loser) but n is too small to act on as a hard veto.

## Decision

Wire as `qualityGates.colorStreakFavor` score-mode boolean, default off. Contribute `+1` to `quality.score` when fire brick is STREAK_1, else `0`. No walker needed — streak length is O(N) from `priorBricksToday`.

**Do NOT wire as a block.** STREAK_2-5 are net-negative aggregated but per-bucket n is too small to confidently veto. Score-mode lets the optimizer prefer STREAK_1 without removing trades.

## Full output

```
ALIGNED — 316 trades (95.2% of fires)
  bucket                n       %        W/L/BE   winRate     avgR          netPnL
  STREAK_1            243   76.9%     56/115/72    32.75%    0.131     R$ 1.789,03
  STREAK_2             13    4.1%         2/6/5    25.00%   -0.362      R$ -462,04
  STREAK_3             12    3.8%         3/6/3    33.33%    0.312        R$ -2,56
  STREAK_4             25    7.9%        7/12/6    36.84%   -0.044       R$ -85,35
  STREAK_5_plus        23    7.3%        5/12/6    29.41%   -0.087       R$ -56,31

ANTI — 16 trades (4.8% of fires)
  STREAK_1              1    6.3%         0/0/1     0.00%    0.000         R$ 0,00
  STREAK_2              1    6.3%         0/1/0     0.00%   -0.620       R$ -63,32
  STREAK_3              5   31.3%         0/3/2     0.00%   -0.600      R$ -180,00
  STREAK_4              4   25.0%         1/1/2    50.00%    0.500       R$ 167,51
  STREAK_5_plus         5   31.3%         1/4/0    20.00%   -0.200      R$ -180,15

NEUTRAL: (empty)
```

## Notes

- The engine is already de-facto ALIGNED — 95.2% of fires land on a brick whose color matches the trade direction (per-playbook checks in mean-reversion, retracement, vwap-rejection). Adding a redundant ALIGNED check has zero leverage.
- ANTI fires come from the dip-and-reject playbooks (mean_reversion fires on a counter-color brick when the dip recovers mid-brick). Worth a follow-up audit of which playbook produces them once n gets larger.
- The "stretched leg" intuition (continuation fires worsen with streak length) is _directionally correct_ in this data but not statistically resolvable at current sample size.
