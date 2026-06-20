# Keltner Outer Block — Window-sweep audit

**Date**: 2026-06-15.
**Window**: 2026-03-02 → 2026-06-13 (full catalog, 8,280 5m bricks).
**Script**: [`scripts/audit-keltner-outer-block-window-sweep.ts`](../../scripts/audit-keltner-outer-block-window-sweep.ts)
**Builds on**: [`docs/scans/2026-06-15-keltner-outer-block-ab.md`](2026-06-15-keltner-outer-block-ab.md) (which found N=1 produced 0 vetoes).

## TL;DR

Sweeping the lookback window from N=1 (same brick) to N=20 (~100 minutes back) on the same 332-trade baseline. Findings:

- **N=1, 2, 3**: 0 vetoes. Zero impact.
- **N=4, 5**: 1 veto, R$ 0 PnL impact (it was a BE trade).
- **N=6, 7, 8**: 3 vetoes, +R$ 76.60 net (one R$ -76.60 stop removed).
- **N=9, 10**: 4 vetoes, +R$ 230.83 net (two stops removed).
- **N=15, 20**: 5 vetoes, +R$ 346.24 net (three stops removed).

**Across ALL window sizes tested, zero winners were vetoed.** All 5 vetoed trades at N=20 are stop-outs (3) or BEs (2). The methodology's outer-band exhaustion signal appears to be identifying losing entries with 100% precision in this catalog.

## Raw table

|   N | Vetoed | Kept |  Net (kept) | Δ vs baseline | Vetoed net | Win / Loss in vetoed |
| --: | -----: | ---: | ----------: | ------------: | ---------: | -------------------- |
|   1 |      0 |  332 |   R$ 926.81 |      +R$ 0.00 |    R$ 0.00 | 0 / 0                |
|   2 |      0 |  332 |   R$ 926.81 |      +R$ 0.00 |    R$ 0.00 | 0 / 0                |
|   3 |      0 |  332 |   R$ 926.81 |      +R$ 0.00 |    R$ 0.00 | 0 / 0                |
|   4 |      1 |  331 |   R$ 926.81 |      +R$ 0.00 |    R$ 0.00 | 0 / 0                |
|   5 |      1 |  331 |   R$ 926.81 |      +R$ 0.00 |    R$ 0.00 | 0 / 0                |
|   6 |      3 |  329 | R$ 1,003.41 |     +R$ 76.60 |  R$ -76.60 | 0 / 1                |
|   7 |      3 |  329 | R$ 1,003.41 |     +R$ 76.60 |  R$ -76.60 | 0 / 1                |
|   8 |      3 |  329 | R$ 1,003.41 |     +R$ 76.60 |  R$ -76.60 | 0 / 1                |
|   9 |      4 |  328 | R$ 1,157.64 |    +R$ 230.83 | R$ -230.83 | 0 / 2                |
|  10 |      4 |  328 | R$ 1,157.64 |    +R$ 230.83 | R$ -230.83 | 0 / 2                |
|  15 |      5 |  327 | R$ 1,273.05 |    +R$ 346.24 | R$ -346.24 | 0 / 3                |
|  20 |      5 |  327 | R$ 1,273.05 |    +R$ 346.24 | R$ -346.24 | 0 / 3                |

## All 5 vetoed trades at N=20

| Date / Time         | Dir   | Exit           |        PnL | Outer reject seen |
| ------------------- | ----- | -------------- | ---------: | ----------------- |
| 2026-03-03 12:11:10 | short | stop           |  R$ -76.60 | 5 bricks ago      |
| 2026-03-03 12:12:31 | short | stop           | R$ -115.41 | 10 bricks ago     |
| 2026-03-03 14:38:07 | short | breakeven_stop |    R$ 0.00 | 3 bricks ago      |
| 2026-04-08 12:11:43 | long  | breakeven_stop |    R$ 0.00 | 5 bricks ago      |
| 2026-04-08 13:24:43 | long  | stop           | R$ -154.23 | 8 bricks ago      |

The 5 vetoed trades cluster into **only 2 trading days**: 2026-03-03 (3 SHORTs, heavy KC2_INF day with 16 outer-band events over 340 bricks) and 2026-04-08 (2 LONGs).

## Reads

### What it says

The methodology's outer-band exhaustion read **does** correctly identify losing entry zones in this catalog — at the wider-window interpretation. Zero winners removed, multiple losers removed, +R$ 346 / +37.4% PnL improvement at N=20. The narrow-window interpretation I shipped is too tight; the methodologically-correct interpretation is closer to "don't enter against the trend for ~5-10 bricks after a confirmed outer-band exhaustion".

### What it doesn't say

**5 trades over 3 months is statistically insignificant.** This is not "the veto works" — it's "in this catalog, the 5 trades the veto catches happened to all be losers." A 0/3 win/loss split is consistent with both "100% precision" AND "5 random unlucky alignments." With this sample size, I cannot distinguish the two.

For reference, the baseline win rate is 22.6%. Random selection of 5 trades from the catalog would produce 1.1 winners and 3.9 losers on average. Observed: 0 / 3 (the other 2 are BEs). p-value via Fisher's exact ≈ 0.5 — not significant.

### Conclusion

**Tantalising but unproven.** The shape of the result (100% precision, all-loser cluster) is the kind of pattern you'd expect if the methodology is real. But N=5 trades won't pass any honest statistical bar.

## What to do next

Three paths, in order of cost:

1. **Confirm with Ygor whether the methodology's outer-band exhaustion implies a ~5-10 brick "no-entry zone".** Free; resolves Read A vs Read B without more data. If yes → ship with the wider window even at low sample size, because the methodology is the source of truth. If no → remove the wiring.
2. **Backtest on more historical data**, beyond the 2026-03-02 → 2026-06-13 catalog window. The materializer + audit script both take date args; the bottleneck is just having more parquet data. ~10× more days would push the vetoed-trade sample to ~50 and the signal would be statistically resolvable.
3. **Live forward-test for one month.** Run with the gate on (whichever window) and the gate off, compare. Same statistical issue as backtesting (sample size) but with real money on the line, less attractive than (1) or (2).

**My recommendation**: Path 1. The methodology is the source of truth; we're not trying to _discover_ a signal, we're trying to _implement what Ygor's trading book teaches_. If the book says "outer-band exhaustion = no entries for ~5-10 bricks," ship the wider window. If the book says "same-brick only," remove the wiring as dead in practice.

I will not promote the gate on by default in either case until (1) is resolved.

## File pointers

- Window-sweep script: `scripts/audit-keltner-outer-block-window-sweep.ts`
- Original A/B audit: `docs/scans/2026-06-15-keltner-outer-block-ab.md`
- Veto logic: `src/lib/backtest/modules/entry/hawks-playbook.ts:79-105`
- Group C audit doc: `docs/hawks-strategy/indicator-isolation/group-c-keltner.md`
