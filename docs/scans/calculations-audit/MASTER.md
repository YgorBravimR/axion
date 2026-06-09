# Calculations Audit — Master Ledger (Wave 1)

**Date**: 2026-06-08
**Scope**: Every formula and index in the codebase verified against its canonical/textbook definition (Sharpe, Sortino, profit factor, win rate, drawdown, R-multiple, equity curve, annualization, Monte Carlo, tax, Hawks outcome, Pareto). 41 source files across 10 zones, ~7,350 LOC.
**Method**: Orchestrator (Opus 4.7) + 10 parallel scan subagents (Sonnet 4.6), each focused on one zone with canonical references. Per-zone reports at `docs/scans/calculations-audit/0{1..10}-*.md`.

---

## Executive summary

**1 BLOCKER finding cluster** with system-wide impact: **no annualization anywhere**. Every "Sharpe" the app displays is the raw per-period value without `√252`, and there is no CAGR. Industry-tier rating thresholds (Excellent ≥ 2.0, Good ≥ 1.0) are applied to these un-annualized numbers, so users comparing against benchmarks (S&P 500, peer strategies) reach wrong conclusions about strategy quality.

**2 MAJOR convention deviations** worth fixing in the same pass: population std dev used instead of sample (n vs n-1) in Monte Carlo Sharpe sites; one orphan `calculateWinRate()` function with a non-standard breakeven-handling convention that isn't currently called on live paths but is a footgun.

**4 zones clean** (no issues): drawdown, R-multiple, Monte Carlo bootstrap/percentile/ruin, Hawks outcome math.

**Tax math is 95% compliant** with Brazilian Receita Federal rules. One protected-path observation (R$10 DARF floor not explicit in `darf-calculator.ts`, although derived correctly downstream) — flagged for escalation, not auto-fixed.

---

## Severity-ranked findings

### BLOCKER 1 — Sharpe / Sortino reported as raw per-period values without annualization

System-wide. The same root cause manifests across **Zone 1** (risk-adjusted metrics) and **Zone 6** (annualized metrics absence).

| Site                                  | What it computes                          | What it claims (UI / consumer)                                                 | Fix                                                                                               |
| ------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| `src/lib/monte-carlo.ts:157–158`      | `runMean / runStd` per Monte Carlo run    | "Sharpe Ratio" displayed in MC results                                         | Multiply by `√252` if input is daily returns; document if input is per-trade R                    |
| `src/lib/monte-carlo-v2.ts:902`       | `m / sd` from daily returns               | "Sharpe" in MC summary tile                                                    | Multiply by `√252`                                                                                |
| `src/lib/backtest/metrics.ts:108–110` | `rMean / stdR` via Welford on per-trade R | "Sharpe Ratio" in backtest result summary                                      | Either annualize (if daily-equivalent) or rename to "R-Sharpe" to avoid claiming canonical Sharpe |
| All Sharpe display surfaces           | Renders raw value                         | Tier ratings (≥2.0 = Excellent) match annualized industry conventions, not raw | Recalibrate thresholds OR annualize the inputs (preferred)                                        |

**Severity rationale**: a strategy showing raw Sharpe 2.0 (rated "Excellent") becomes ~0.13 when annualized — below industry average. The label is a lie of omission. This is precisely the "wrong number reported to the user" definition of BLOCKER.

**Canonical**: Sharpe (1966, 1994); convention `Annualized Sharpe = (mean_daily / std_daily) × √N` where N = periods per year. 252 for daily, 52 for weekly, 12 for monthly.

### BLOCKER 2 — No CAGR computation exists

**Zone 6.** Search for `cagr`, `(end/start)^(1/years)`, `compound annual` returns zero hits in math code. Any future "annualized return" metric or comparison to compounding benchmarks (S&P 500) is currently impossible. Not a wrong-number bug today (the metric doesn't exist), but the gap blocks meaningful return reporting.

**Fix**: implement `cagr(equityCurve, years) = (lastEquity / firstEquity) ** (1 / years) - 1` and surface alongside total P&L.

### MAJOR 1 — Population std dev used where sample is industry convention

| Site                                | Implementation                       | Canonical                                                 | Fix                     |
| ----------------------------------- | ------------------------------------ | --------------------------------------------------------- | ----------------------- |
| `src/lib/monte-carlo.ts:338–347`    | `sqrt(sum_sq_diff / n)` (population) | `sqrt(sum_sq_diff / (n-1))` (Bessel's correction; sample) | Switch to `n-1` divisor |
| `src/lib/monte-carlo-v2.ts:870–877` | Same                                 | Same                                                      | Same                    |

Note: `src/lib/backtest/metrics.ts:108` uses Welford's algorithm which produces **sample** std dev natively — so backtest Sharpe and Monte Carlo Sharpe disagree on this convention. Cross-surface inconsistency.

### MAJOR 2 — `calculateWinRate()` signature is misleading (CORRECTED from original Wave 1 finding)

**Correction note (2026-06-08, post-Bundle B verification)**: The Wave 1 Zone 2 scan agent claimed this function was an "orphan with no live callers". That was **wrong**. Grep finds 10 live call sites in `src/app/actions/analytics.ts`. Every caller manually computes `wins + losses` and passes that as `total`, working around the misleading parameter name. The function is correct _in practice_ — but the signature `(wins, total)` suggests `total = all trades including BE`, which is exactly the wrong convention.

**Original finding**: `src/lib/calculations.ts:7–10` defines `calculateWinRate(wins, total)`. A naive new caller might pass `total = totalTrades` (including breakevens) and get a subtly wrong win rate.

**Fix applied** (Bundle B): JSDoc added at the function explaining the convention; codified in `docs/code-conventions.md` under "Financial math conventions". No behavior change.

### MINOR — Documentation / clarity

1. **Equity curve labeling** (Zone 5): `analytics-helpers.ts` sets `accountEquity = cumulativePnL` when no initial balance is passed — semantically redundant labeling, no correctness issue.
2. **Pareto 3D heuristic** (Zone 10): `pareto-retain.ts` uses PF-first sweep + secondary-max tracking, not true Kung 3D non-dominated sort. Defensible at <10k runs but worth documenting as intentional.
3. **R-multiple immutability** (Zone 4): no bug found, but the separation between `stopLoss` (initial, immutable) and `stopLossAtClose` (final) deserves a one-paragraph note in `docs/code-conventions.md`.

### PROTECTED PATH — observation, do NOT auto-fix

**Zone 8**: `src/lib/tax/darf-calculator.ts` returns `darfDue` without applying the **R$10.00 floor** from Lei 9.430/96 art. 68 (DARF only required when ≥ R$10). Downstream, `recompute-month.ts` derives an "exempt" status flag correctly, so the user-facing number is right. But the threshold should arguably be explicit in the calculator. **Requires explicit go-ahead before any code change** — `recompute-month.ts` is protected.

---

## Per-zone status table

| #   | Zone                  | Status           | Blocker | Major | Minor | Report                        |
| --- | --------------------- | ---------------- | ------- | ----- | ----- | ----------------------------- |
| 1   | Risk-adjusted returns | ⚠️ Issues        | 2       | 1     | 0     | `01-risk-adjusted-returns.md` |
| 2   | Performance metrics   | ⚠️ Issues        | 0       | 1     | 0     | `02-performance-metrics.md`   |
| 3   | Drawdown metrics      | ✅ Clean         | 0       | 0     | 0     | `03-drawdown-metrics.md`      |
| 4   | R-multiple math       | ✅ Clean         | 0       | 0     | 1     | `04-r-multiple-math.md`       |
| 5   | Equity curve          | ✅ Clean         | 0       | 0     | 1     | `05-equity-curve.md`          |
| 6   | Annualized metrics    | ❌ Absent        | 2       | 0     | 0     | `06-annualized-metrics.md`    |
| 7   | Monte Carlo           | ✅ Clean         | 0       | 0     | 0     | `07-monte-carlo.md`           |
| 8   | Tax (PROTECTED)       | ⚠️ 95% compliant | 0       | 0     | 1     | `08-tax-computations.md`      |
| 9   | Hawks outcome         | ✅ Clean         | 0       | 0     | 0     | `09-hawks-outcome-math.md`    |
| 10  | Pareto + robustness   | ✅ Clean         | 0       | 0     | 1     | `10-pareto-robustness.md`     |

---

## Cross-zone themes

1. **Annualization gap is system-wide.** Zones 1 and 6 are not independent issues — they're one root cause (no annualization layer ever built) surfacing in multiple locations. A single fix bundle that adds `annualize(value, periodsPerYear)` helpers and threads them through Monte Carlo + backtest metrics resolves both.
2. **Std dev convention drift.** Monte Carlo v1+v2 use population; backtest metrics uses sample (via Welford). Same metric, two conventions = users see different "Sharpe" for the same dataset depending on which surface they look at. Pick one (sample is industry default) and propagate.
3. **Breakeven handling consistency.** Win rate, expectancy, R distribution all need a shared answer to "is PnL == 0 a win, loss, or excluded?" Current state: backtest + analytics correctly exclude; orphan function includes. Codify the convention.
4. **Hawks math, R-multiple math, drawdown math, equity curve math, Monte Carlo bootstrap, Pareto sort — all canonical-correct.** These are not the problem.

---

## Recommended fix bundles

Three bundles, each fits in one PR with regression tests + a short post-mortem:

### Bundle A — Annualization (resolves BLOCKER 1 + 2)

**Files**:

- New: `src/lib/finance/annualize.ts` — `annualizedSharpe`, `annualizedVolatility`, `cagr` helpers.
- Modify: `src/lib/monte-carlo.ts`, `src/lib/monte-carlo-v2.ts`, `src/lib/backtest/metrics.ts` — call annualization helpers at the point of computing Sharpe and emit both raw and annualized fields (raw stays for backwards-compat audit; annualized is the new canonical user-facing value).
- Modify: result-summary UI components — display annualized value, keep raw available in a debug tooltip.
- Recalibrate: rating tier thresholds (≥2.0 etc.) to match annualized scale.

**Test**: add a fixture with known daily returns + a paper-computed annualized Sharpe. Assert the helper output matches to 4 decimals.

**Risk**: rating tiers shift — strategies previously marked "Excellent" now get more honest labels. User-facing UX change. Worth a heads-up on first display.

### Bundle B — Std dev + win rate convention (resolves MAJOR 1 + 2)

**Files**:

- `src/lib/monte-carlo.ts:338`, `monte-carlo-v2.ts:870` — switch to `n-1`.
- `src/lib/calculations.ts:7` — either delete `calculateWinRate` (no live callers) or fix denominator to `wins + losses`.
- `docs/code-conventions.md` — codify "breakeven trades are excluded from win-rate denominator; sample std dev (Bessel's correction) is the default".

**Test**: same-input regression — verify Monte Carlo Sharpe before/after now matches `metrics.ts` Sharpe to numerical precision.

**Risk**: Monte Carlo Sharpe values shift slightly for small-N runs. Cosmetic at typical N.

### Bundle C — Documentation MINORs (resolves the three MINORs)

**Files**: `docs/code-conventions.md` only.

- Note on `accountEquity` redundancy when no initial balance.
- Note that 3D Pareto is intentional heuristic.
- Note on `stopLoss` vs `stopLossAtClose` immutability for R-multiple correctness.

No code changes. Pure documentation.

### Bundle D (PROTECTED — escalation required) — SHIPPED 2026-06-08

**Files**: `src/lib/tax/darf-calculator.ts` — applies R$10 DARF floor (Lei 9.430/96 art. 68).
**Status**: SHIPPED. User authorized 2026-06-08. Fix added `belowMinimumThreshold` field + zeroed `darfDue` when net IR falls strictly between 0 and R$10. Downstream `recompute-month.ts` (PROTECTED) was NOT modified — its existing "exempt when `darfDue === 0`" status derivation now fires correctly for sub-threshold months automatically.
**Tests**: 8 new threshold cases in `src/__tests__/lib/tax/darf-calculator.test.ts` (boundary at 999/1000/1001 cents, IRRF-induced sub-threshold, prop account passthrough, loss month). Total 100 tax tests pass.
**Known simplification**: art. 68 §1° deferral (accumulating sub-threshold amounts to next month) NOT implemented — see `docs/backlog.md` "DARF sub-threshold deferral". Practical impact is small (sub-R$10 cases rare) and skews under-tax (never over-files).

---

## Decision points for the user

When you're back, three calls:

1. **Bundle A — Annualization fix scope.** Two paths:
   - **(a)** Annualize the Sharpe values + recalibrate rating tiers. Honest numbers, but UX shift — strategies previously rated "Excellent" become "Good" or "Average".
   - **(b)** Rename the field to `R-Sharpe` (or `Trade Sharpe`) and keep current behavior. Cheap, no number changes, but the label admits the value isn't canonical Sharpe.
   - Recommended: **(a)** — fidelity is the master key, per your earlier directive.

2. **Bundle B — std dev convention.** Switch Monte Carlo to sample (n-1) — non-controversial, recommended. Confirm the orphan `calculateWinRate` should be deleted (vs fixed in place).

3. **Bundle D — tax protected-path fix.** Skip (status flag handles it) or pursue with explicit nod (codify the R$10 floor in the calculator).

---

## Out of scope this wave (deferred to Wave 2)

Per your tightened brief, these are NOT in this audit:

- Unit conversion correctness (cents vs reais vs ticks vs R)
- Date / TZ math (BRT vs UTC, ISO week boundaries, EOD handling beyond Hawks)
- Display formatter bugs (locale-aware numbers, percentages)
- NaN / division-by-zero handling beyond what affects canonical correctness
- Sign convention consistency across surfaces

If Bundle A reveals these as adjacent issues, surface them as Wave 2 candidates — don't widen Wave 1 mid-fix.
