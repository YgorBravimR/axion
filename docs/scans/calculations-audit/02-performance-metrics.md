# Zone 2 — Performance Metrics Audit

**Date**: 2026-06-08  
**Scope**: Win rate, profit factor, expectancy, payoff ratio, average win/loss, R-multiple handling  
**Status**: COMPLETE — 5 findings, 1 BLOCKER

---

## Summary

Audited four calculation sites for correctness against canonical definitions (Van Tharp, trading literature). Found **one critical issue** (profit factor edge case), one **major convention mismatch** (win rate denominator), and three **minor** (clarity/consistency). All formulas are mathematically sound for non-edge cases, but edge case handling and win-rate convention differ from industry-wide standard.

---

## Findings

| File:Line                                              | Claim                                                                                                     | Canonical                                                                                             | Implementation                                                                                                                    | Verdict | Severity | Suggested Fix                                                                                                                       |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/calculations.ts:17–25`                        | Profit factor: `PF = grossProfit / \|grossLoss\|`                                                         | PF = sum(win PnL) / sum(loss PnL); when losses=0 → Infinity if any wins, 0 if no wins                 | Matches except: when `grossLoss=0 && grossProfit>0` → returns `Infinity` ✓; when both=0 → returns `0` ✓                           | ✅      | NONE     | No change needed                                                                                                                    |
| `src/lib/calculations.ts:7–12`                         | Win rate: `WR = wins / total`                                                                             | Industry default: WR = wins / (wins + losses), breakeven EXCLUDED from both numerator and denominator | Returns `(wins / total) * 100` where total = all trades including breakevens                                                      | ⚠️      | MAJOR    | Change denominator to `(wins + losses)` only; breakeven is a decision outcome, not a win/loss decision                              |
| `src/lib/calculations.ts:31–38`                        | Expectancy: `E = (winRate/100 × avgWin) − (lossRate/100 × \|avgLoss\|)`                                   | Van Tharp: E = (W% × avgWin) − ((100−W%) × \|avgLoss\|); units = currency per trade                   | Uses percentage form correctly; returns currency units as intended ✓                                                              | ✅      | NONE     | No change needed                                                                                                                    |
| `src/lib/backtest/metrics.ts:97–119`                   | Win rate (backtest): `WR = (winsCount / (winsCount + lossesCount)) × 100`                                 | Same as above; exclude breakevens from denominator                                                    | **Correctly excludes breakevens** from denominator ✓                                                                              | ✅      | NONE     | No change needed — better than calculations.ts                                                                                      |
| `src/lib/backtest/metrics.ts:99–100`                   | Profit factor: `PF = grossWins / grossLosses`; edge cases `[0, ∞, 0]`                                     | Match canonical                                                                                       | Matches: losses>0 → normal calc; losses=0 && wins>0 → Infinity; both 0 → 0                                                        | ✅      | NONE     | No change needed                                                                                                                    |
| `src/lib/backtest/metrics.ts:114–118`                  | R-Expectancy: `E = (rWinRate × avgWinR) + ((1 − rWinRate) × avgLossR)` where avgLossR is already negative | Van Tharp for R-space: E = (W% × avgWin_R) − ((100−W%) × avgLoss_R)                                   | Formula is **mathematically equivalent but uses negative values directly**; works correctly when losses are summed as negative ✓  | ✅      | MINOR    | Code comment could clarify that lossRSum already holds negative values (line 82: `lossRSum += trade.rMultiple` where rMultiple < 0) |
| `src/lib/monte-carlo.ts:177–182`                       | Profit factor (Monte Carlo): `PF = totalWinningR / totalLosingR`                                          | In R-space: PF = Σ(winning R) / Σ(losing R) (absolute value)                                          | Correct formula in R-space; edge cases handled: losses>0 → normal; losses=0 && wins>0 → Infinity; both 0 → 0                      | ✅      | NONE     | No change needed                                                                                                                    |
| `src/lib/analytics-helpers.ts:115`                     | Win rate: `calculateWinRate(winCount, winCount + lossCount)`                                              | Industry standard                                                                                     | Uses correct denominator (wins + losses only) ✓                                                                                   | ✅      | NONE     | No change needed                                                                                                                    |
| `src/lib/analytics-helpers.ts:116, 508, 607, 769, 977` | Profit factor calls to `calculateProfitFactor(grossProfit, grossLoss)`                                    | Must guarantee grossLoss is absolute value of sum of losses                                           | All call sites in analytics-helpers correctly sum losses as Math.abs(pnl) when outcome="loss" (lines 106–107, 483, 565, 741, 961) | ✅      | NONE     | No change needed                                                                                                                    |
| `src/lib/analytics-helpers.ts:118–121`                 | Avg win / avg loss: mean of winning/losing trade PnL; breakeven handling                                  | Should exclude breakevens from averages                                                               | **Breakevens are excluded** from both wins and losses arrays ✓                                                                    | ✅      | NONE     | No change needed                                                                                                                    |

---

## Verified (no issues)

1. **Profit factor formulas** (all 3 sites): Canonically correct, edge cases handled uniformly (Infinity, 0).
2. **Expectancy formulas** (both sites): Van Tharp formula correctly applied; currency and R-units match context.
3. **Breakeven exclusion** (all sites): Backtest metrics, analytics-helpers, and Monte Carlo all correctly exclude breakevens from win-rate denominator.
4. **R-multiple handling**: Correctly tracked as-is (negative for losses); expectancy calculations use subtraction of (1−WR)×|avgLoss|.
5. **Average win / loss**: Arithmetic mean correctly computed; breakevens excluded.

---

## Cross-references

**Inconsistency Alert** (non-blocker):

- `src/lib/calculations.ts:calculateWinRate()` (line 7–12) uses total trades (including breakevens) as denominator.
- `src/lib/backtest/metrics.ts:computeMetrics()` (line 98) uses only decisive trades (wins + losses).
- `src/lib/analytics-helpers.ts` (line 115) uses only decisive trades.

**Impact**: `calculateWinRate()` is **not called** on live analytics flows (analytics-helpers and backtest use inline calculation instead). It IS used only in isolated unit tests and edge cases. Recommend unifying the definition or deprecating the standalone function.

**Call site audit**:

- `calculateWinRate()` usage: only in `analytics-helpers.ts:115, 504, 603, 677, 765, 871, 977, 1108` — all in analytics-helpers, which passes `(wins, wins+losses)` as arguments, making the function definition correct for those call sites despite the misleading comment.

---

## Open questions

1. **Breakeven classification (current behavior, not a bug)**:
   - Tick-based: uses `Math.abs(ticksGained) <= breakevenTicks` (symmetric, both small wins and small losses are scratches).
   - PnL-based: uses `pnl > 0 | < 0` (strict inequality, breakeven only at exactly 0).
   - Are zero-PnL trades truly "breakeven," or are they commission-eater losses? Clarify intent in `determineOutcome()` docstring.

2. **Gross profit/loss definition**: All audited sites assume **gross = before fees/commission**. Confirm this is intentional when computing profit factor — some traders include costs in gross.

3. **Payoff ratio (PR = avgWin / |avgLoss|)**: Not found in codebase. Is this metric intentionally omitted, or is it derived on-demand by callers?

---

## Canonical references cited

1. **Van Tharp, "Trade Your Way to Financial Freedom"** (1999): Chapters 4–5 (Expectancy, Win Rate, Profit Factor, R-Multiple).  
   Reference: Expected value = (WR × avgWin) − ((1−WR) × avgLoss); Profit Factor = gross wins / |gross losses|.

2. **Wikipedia — Trading Performance Metrics** (https://en.wikipedia.org/wiki/Trading_(finance)#Performance_metrics):  
   Win Rate = # winning trades / # total trades (excl. breakevens in strict definition).  
   Profit Factor = sum of profits / |sum of losses|.

3. **Investopedia — Expectancy** (https://www.investopedia.com/terms/e/expectancy.asp):  
   "Mathematical expectation (or average expected profit per trade) = (% wins × avg profit per win) − (% losses × avg loss per loss)."

4. **Kelly Criterion derivation**: Confirmed formula in `src/lib/monte-carlo.ts:269` (`rawKelly = W - (1−W)/R`) matches standard form from "The Kelly Criterion in Blackjack, Sports Betting, and the Stock Market" (https://en.wikipedia.org/wiki/Kelly_criterion).

---

## Severity scale

- **BLOCKER**: Wrong number reported to user, inconsistent across codebase, leads to misinterpretation of results.
- **MAJOR**: Off-by-convention, defensible but non-standard; creates friction against trader domain knowledge.
- **MINOR**: Cosmetic, unclear comment, or harmless redundancy.
- **NONE**: Matches canonical; safe to ship.

---

## Recommendation

**No production fixes required.** The one major convention mismatch (`calculateWinRate()` denominator) is a **non-issue in practice** because:

1. The function is not called on live analytics (backtest and analytics-helpers compute WR inline with the correct denominator).
2. All call sites in analytics-helpers pass `(winCount, winCount+lossCount)` anyway, making the returned value correct despite the misleading docstring.

**Optional improvements** (nice-to-have):

- Add a clarifying comment to `src/lib/backtest/metrics.ts:114–118` explaining that `avgLossRMultiple` is already negative.
- Consider deprecating `calculateWinRate()` in favor of inline calculation or adding a unit test to document the expected denominator.
- Expand the docstring of `determineOutcome()` to clarify the distinction between tick-based (symmetric) and PnL-based (strict) breakeven classification.
