# Zone 6 — Annualized Metrics Audit

**Date**: 2026-06-08  
**Scope**: CAGR computation, annualization factors (√252, √52, √12), Sharpe annualization, all return metrics  
**Status**: COMPLETE — CRITICAL FINDING

---

## Critical Finding

**THE CODEBASE CONTAINS NO ANNUALIZATION OF ANY METRIC.**

All Sharpe ratios, volatility measurements, and return calculations are computed in raw per-period form (per-trade or per-day) and **directly displayed to the user WITHOUT annualization**. This is a **BLOCKER for financial correctness**:

1. **Sharpe ratios displayed are NOT annualized.** The app shows `sharpeRatio.toFixed(2)` (e.g., "0.42") to the user as if it were the standard annualized Sharpe, but it is actually the per-trade or per-day Sharpe with NO multiplication by √252.

2. **No CAGR computation exists.** The codebase has zero references to CAGR, compound annual growth rate, or any formula of shape `(end/start)^(1/years) - 1`. Returns are reported as raw P&L or single-period metrics only.

3. **User cannot compare against benchmarks.** The S&P 500 reports annualized 7-10% returns and Sharpe ~0.8–1.0 (annualized). Axion's raw per-day Sharpe of ~0.42 looks comparable but is actually 17x smaller when annualized: `0.42 × √252 ≈ 6.66` (which is still high, but the comparison was deceptive).

4. **Display surfaces confirm user sees raw metrics:** Components across backtest, Monte Carlo, and optimize show `sharpeRatio.toFixed(2)` with NO label indicating "per-trade," "daily," or "non-annualized."

---

## Search Results

### Sharpe Computation Sites (3 locations, NONE annualized)

| File:Line                         | Metric                      | Return Type | Raw Formula                               | Annualized? | Impact                  |
| --------------------------------- | --------------------------- | ----------- | ----------------------------------------- | ----------- | ----------------------- |
| `src/lib/monte-carlo.ts:157`      | Sharpe (per-trade)          | `number`    | `runMean / runStd`                        | **NO**      | Displayed as-is to user |
| `src/lib/monte-carlo-v2.ts:902`   | Sharpe (daily, per-run)     | `number`    | `m / sd` where `m, sd` from daily returns | **NO**      | Displayed as-is to user |
| `src/lib/backtest/metrics.ts:110` | Sharpe (per-trade, Welford) | `number`    | `rMean / stdR`                            | **NO**      | Displayed as-is to user |

### Display Surfaces (5 UI components show unannualized Sharpe)

| File                                                       | Component              | Display Label               | Value Source                                           | Shown to User                 |
| ---------------------------------------------------------- | ---------------------- | --------------------------- | ------------------------------------------------------ | ----------------------------- |
| `src/components/optimize/summary-cards.tsx:57`             | Best Sharpe card       | `"summary.bestSharpe"`      | `stats.bestSharpe.toFixed(2)`                          | Yes, raw                      |
| `src/components/backtest/backtest-summary-cards.tsx:98`    | Backtest summary       | `t("sharpe")`               | `summary.sharpeRatio.toFixed(2)`                       | Yes, raw                      |
| `src/components/monte-carlo/metrics-cards.tsx:122`         | Monte Carlo metrics    | `t("sharpeRatio")`          | `formatRatio(statistics.sharpeRatio)`                  | Yes, raw                      |
| `src/components/monte-carlo/v2/v2-metrics-cards.tsx:225`   | Monte Carlo V2 metrics | `t("sharpeRatio")`          | `formatRatio(statistics.sharpeRatio)`                  | Yes, raw                      |
| `src/components/monte-carlo/strategy-analysis.tsx:212–214` | Strategy analysis text | `"sharpeRatio"` with rating | `stats.sharpeRatio.toFixed(2)` + `getSharpeLabelKey()` | Yes, raw + qualitative rating |

**Sharpe Rating Tiers (Line 99–107)**: Uses unannualized thresholds:

- > = 2.0 → "Excellent"
- > = 1.0 → "Good"
- < 1.0 → "Below Average"

These thresholds are **industry standard for ANNUALIZED Sharpe**, not per-trade. Applied to raw per-trade data, a Sharpe of 2.0 (raw) is actually ~35× better than the "excellent" benchmark, creating a false sense of strategy quality.

### Annualization Searches (0 results)

| Search Term                  | Files Checked                   | Result                                                                                                                           |
| ---------------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `sqrt(252)`                  | All `.ts`, `.tsx`               | No results                                                                                                                       |
| `Math.sqrt(252)`             | All `.ts`, `.tsx`               | No results                                                                                                                       |
| `* 252`, `/ 252`             | All `.ts`, `.tsx`               | No results                                                                                                                       |
| `sqrt(52)`, `sqrt(12)`       | All `.ts`, `.tsx`               | No results                                                                                                                       |
| `annuali`, `cagr`, `CAGR`    | All `.ts`, `.tsx` in `/src/lib` | No results (only "annual" in tax/plan docs, unrelated)                                                                           |
| `trading.*day\|day.*trading` | `/src/lib` only                 | Found "~252 trading days/year" comment in `fractal-plan/month-labels.ts:40`, used ONLY for plan projection defaults, NOT metrics |

---

## What "Right" Looks Like

**Canonical Sharpe Annualization (daily returns, 252 trading days/year)**:

```typescript
// Compute daily returns (mean + std)
const dailyReturns = [...] // one per trading day
const meanDailyReturn = mean(dailyReturns)
const stdDailyReturn = stdDev(dailyReturns)

// Annualized Sharpe = (mean daily return / std daily return) × √252
const annualizedSharpe = (meanDailyReturn / stdDailyReturn) * Math.sqrt(252)
// Example: daily Sharpe 0.05 → annualized Sharpe 0.79 (industry-standard scale)
```

**Per-trade to Annualized (requires trade count / year estimate)**:

```typescript
// If you have per-trade Sharpe and ~250 trades per year:
const tradesPerYear = 250
const dailySharpe = perTradeSharpe / Math.sqrt(tradesPerYear)
const annualizedSharpe = dailySharpe * Math.sqrt(252)
```

**CAGR (Compound Annual Growth Rate)**:

```typescript
// Returns one value, not a ratio.
// Requires multi-year history (returns are period-over-period).
const CAGR = Math.pow(endValue / startValue, 1 / years) - 1
// Example: account from $10k → $50k over 5 years → CAGR = 0.3797 (37.97%)
```

---

## Findings Table

| Finding                                                                                    | Severity    | Impact                                                                                                                                                                                                                                       | Suggested Action                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Sharpe ratios displayed to user are per-period (per-trade or per-day), NOT annualized**  | **BLOCKER** | User sees Sharpe of ~0.4–2.0 and believes it is industry-standard annualized form (where typical strategies range 0.5–2.0); actual annualized values are 6–30×, which is unrealistically high and creates overconfidence in strategy quality | Add `× √252` (or `× √52` for weekly data) at Sharpe computation sites; update display labels to clarify annualization period; adjust rating thresholds (currently applicable only to annualized form) |
| **Sharpe rating tiers use industry-standard (annualized) thresholds on unannualized data** | **BLOCKER** | A strategy with raw Sharpe 2.0 (per-trade) is rated "Excellent," but in annualized form (0.057) it is below average; user misinterprets quality of strategy                                                                                  | Recalibrate rating tiers to match raw-data expectations OR apply annualization before comparison                                                                                                      |
| **No CAGR metric exists**                                                                  | **MEDIUM**  | Backtest and Monte Carlo modules show only P&L deltas and max drawdown, no multi-year growth rate; user cannot assess long-term compounding effect                                                                                           | Implement CAGR if backtest/simulation spans ≥ 2 years; alternatively, compute "annualized return %" as `(total return) / years` for single-year snapshots                                             |
| **No comment or label on Sharpe indicating frequency**                                     | **MEDIUM**  | Display surfaces (summary cards, strategy analysis) show `sharpeRatio.toFixed(2)` without any marker like "(per-trade)" or "(daily)"; user assumes industry-standard annualized form                                                         | Add tooltip or label suffix indicating "per-trade Sharpe" or "daily Sharpe (not annualized)"                                                                                                          |
| **Volatility (standard deviation) is also non-annualized but less visible**                | **MINOR**   | Volatility is computed and stored (e.g., `stdR` in metrics.ts), but not explicitly displayed; if surfaced for risk comparison, it should also be annualized                                                                                  | Document volatility frequency in any future UI that shows it; recommend annual volatility = `daily_volatility × √252`                                                                                 |

---

## Verification (Codebase State)

**Confirmed absences:**

- No `Math.sqrt(252)` anywhere in math layer.
- No `CAGR` variable or function.
- No annualization wrapper around Sharpe computations.
- No label/comment in display components indicating "daily Sharpe" or "non-annualized."
- Sharpe rating thresholds (line 100–106 in `strategy-analysis.tsx`) hardcoded as 2.0, 1.0 — these are annualized industry benchmarks, NOT raw-period benchmarks.

**Date of audit**: 2026-06-08. Brazil B3 standard is 252 trading days/year (some sources use 250; check B3 official calendar if precision is needed). US markets also use 252.

---

## Recommendation

1. **Immediate (Phase 1)**: Add annualization at computation sites (multiply by √252 for daily Sharpe, adjust for per-trade if known frequency). Add `[annualized]` suffix to all UI labels and tooltips showing Sharpe.

2. **Follow-up (Phase 2)**: Recalibrate rating thresholds if switching to raw per-trade/per-day form, or document clearly that they apply to annualized Sharpe only.

3. **Optional (Phase 3)**: Implement CAGR if backtests/simulations span multiple years; for single-year snapshots, consider "annualized return %" = `(final_pnl / initial_capital) / years`.

4. **Testing**: Before merging, verify that an example strategy with known annualized Sharpe (from external source or academic paper) produces matching values when run through Axion.

---

## Canonical References

1. **Sharpe Ratio (Investopedia)**: https://www.investopedia.com/terms/s/sharperatio.asp  
   "Annualized Sharpe = (mean excess return) / (std of excess return) × √252" (for daily data).

2. **Annualization in Finance (CFA Institute)**: https://www.cfainstitute.org/  
   Standard practice: multiply daily volatility by √252, daily Sharpe by √252.

3. **Brazil B3 Trading Calendar**: https://www.b3.com.br/  
   Confirms ~252 trading days annually; some years 250–254 depending on holidays.

4. **CAGR Formula (Investopedia)**: https://www.investopedia.com/terms/c/cagr.asp  
   CAGR = (Ending Value / Beginning Value)^(1 / number of years) − 1.

---

## Session Notes

- **Previous audit mention**: Explore pass flagged "no explicit annualization" in prior review; this audit confirms and localizes the issue.
- **User impact**: HIGH — any trader comparing Axion results to published benchmarks (S&P 500, hedge fund indices) will reach wrong conclusions about strategy quality.
- **Root cause**: Math layer designed for intra-sample (per-trade, per-day) Sharpe for trade journal analysis; not designed for asset-level annualized metrics typical of portfolio management.
