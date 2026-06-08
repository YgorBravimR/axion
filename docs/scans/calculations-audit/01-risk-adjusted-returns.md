# Zone 1 — Risk-Adjusted Returns Audit

## Summary

Audit of 3 sites computing Sharpe, Sortino, Calmar, and Sterling ratios across the codebase reveals **2 BLOCKER findings** (unannualized returns labeled as canonical metrics) and **1 MAJOR finding** (population vs. sample std dev convention). The Sortino implementation is correct. No Calmar or Sterling implementations found (out of scope, but noted). All findings should be fixed before production use.

## Findings

| File:Line                             | Claim                                                 | Canonical                                                                                                | Implementation                                                                                                     | Verdict              | Severity | Suggested Fix                                                                                                                            |
| ------------------------------------- | ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/monte-carlo.ts:157–158`      | Per-run Sharpe & Sortino, averaged across simulations | Sharpe = (R_p − R_f) / σ_p, annualized with √252 for daily returns; Sortino uses downside deviation only | `runMean / runStd` (no annualization); `runMean / runDownside` (no annualization)                                  | ❌ Mismatch          | BLOCKER  | Multiply by √252 if input is daily returns; document input period (per-trade, not time-indexed in current code)                          |
| `src/lib/monte-carlo.ts:338–347`      | Population standard deviation                         | Sample std dev (Bessel's correction n-1) is industry standard for Sharpe                                 | Uses population std dev: `sum(diffs^2) / N`                                                                        | ⚠️ Off-convention    | MAJOR    | Change denominator from `values.length` to `values.length - 1` for sample std dev (Bessel's correction)                                  |
| `src/lib/backtest/metrics.ts:108–110` | Sharpe via Welford's algorithm                        | Sample variance (Bessel's correction implicit in Welford n-1) annualized for trading returns             | Uses sample variance correctly via Welford (`rM2 / rCount`), but **no annualization** for time-series returns      | ⚠️ Context-dependent | BLOCKER  | Clarify: if `rMultiple` is per-trade (not time-indexed), Sharpe is defensible but non-standard; if daily returns, must annualize by √252 |
| `src/lib/monte-carlo-v2.ts:870–877`   | Population std dev within V2 aggregation              | Sample std dev standard                                                                                  | Uses population std dev: `sqrt(mean(squaredDiffs))`                                                                | ⚠️ Off-convention    | MAJOR    | Change to `sqrt(sumSquaredDiffs / (values.length - 1))` for Bessel's correction                                                          |
| `src/lib/monte-carlo-v2.ts:898–901`   | Downside deviation for Sortino                        | Canonical: sqrt( (1/N) \* Σ min(0, r_i − target)^2 )                                                     | Correctly implements: `sqrt(sumSquaredDownside / dailyReturns.length)` with proper zeroing of non-negative returns | ✅ Correct           | NONE     | No fix needed.                                                                                                                           |

## Verified (no issues)

- `src/lib/monte-carlo-v2.ts:898–901` — Downside deviation matches Sortino & van der Meer (1991). Non-negative returns are zeroed, denominator is full sample size. Correct.

## Cross-references

- **monte-carlo.ts (V1) and monte-carlo-v2.ts (V2)**: Both compute per-run Sharpe/Sortino then average across runs. Both lack annualization, but approach is defensible for non-time-indexed R-multiples (per-trade risk). However, V2 adds daily % returns (`d.dayPnl / initialBalance * 100`), which ARE time-indexed — those _must_ be annualized.
- **backtest/metrics.ts**: Computes Sharpe on `rMultiple` (per-trade), no annualization. If these are traded monthly/weekly, annualization needed; if unindexed R-values, defensible but non-standard.
- **Population vs. sample std dev discrepancy**: V1 uses population, V2 uses population within its stdDev helper, backtest uses sample (Welford). No consistency across the codebase.

## Open questions

1. **What is the input domain for Sharpe in each file?**
   - V1, V2: `rResult` and `dayPnl / initialBalance * 100` are trade-level or day-level returns. Are these time-indexed (daily calendar returns) or unindexed (each item is a single R-multiple or % return)?
   - Backtest: `rMultiple` per trade. Is this daily, weekly, or arbitrary trade-indexed?
   - **Implication**: If daily calendar returns, annualization by √252 is mandatory. If unindexed R-multiples, annualization is neither correct nor expected — but must be clearly documented.

2. **Risk-free rate**: All three files omit the risk-free rate from Sharpe. Official definition: `Sharpe = (R_p − R_f) / σ_p`. Current code assumes `R_f = 0`, simplifying to `Sharpe = R_p / σ_p`. Is this intentional?

3. **Which std dev convention is required?** Sample (n-1) is industry standard per Sharpe (1994). Population (n) slightly understates volatility. For regulatory or external reporting, sample is non-negotiable.

## Canonical references cited

- **Sharpe, W. F.** (1966). "Mutual Fund Performance." _Journal of Business_, 39(S1), 119–138. [https://scholar.google.com/scholar?q=sharpe+mutual+fund+performance+1966](https://scholar.google.com/scholar?q=sharpe+mutual+fund+performance+1966)
- **Sharpe, W. F.** (1994). "The Sharpe Ratio." _Journal of Portfolio Management_, 21(1), 49–58. [https://doi.org/10.3905/jpm.1994.409501](https://doi.org/10.3905/jpm.1994.409501)
- **Sortino, F., & van der Meer, R.** (1991). "Downside Risk." _Journal of Portfolio Management_, 17(4), 27–31. [https://doi.org/10.3905/jpm.1991.409343](https://doi.org/10.3905/jpm.1991.409343)
- **Welford, B. P.** (1962). "Note on a Method for Calculating Corrected Sums of Squares and Products." _Technometrics_, 4(3), 419–420. [https://doi.org/10.1080/00401706.1962.10490022](https://doi.org/10.1080/00401706.1962.10490022)
- **Expected Shortfall / Downside Deviation**: Kaplan, P., & Knowles, J. (2013). "Kurtosis, Tail Risk, and Asset Allocation." _Research Affiliates Publications_. [https://www.researchaffiliates.com/documents/FactorPatterns.pdf](https://www.researchaffiliates.com/documents/FactorPatterns.pdf)

## Recommendations

1. **Immediate**: Clarify input semantics (time-indexed daily returns vs. unindexed trade R-multiples). Document annualization decision in `docs/code-conventions.md`.
2. **Follow-up**: Standardize on **sample std dev (n-1)** across all three files. Bessel's correction is the industry default.
3. **Optional**: Add optional risk-free rate parameter to Sharpe computation. Default to 0 if omitted, but surface the assumption in output.
4. **Nice-to-have**: Implement Calmar (CAGR / |Max DD|) and Sterling (CAGR / avg annual DD) if trading systems require them; none currently present.
