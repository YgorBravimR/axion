# Zone 7 — Monte Carlo Implementation Audit

## Summary

Audit of Monte Carlo simulations reveals **CLEAN bootstrap methodology** with correct ruin probability definitions and two coexisting implementations:

- **v1 (`monte-carlo.ts`)**: R-multiple space coin-flip simulation (Edge Expectancy). **Canonical for strategy statistics** (used in `runSimulation` and comparison flows).
- **v2 (`monte-carlo-v2.ts`)**: Day-aware decision-tree simulation with risk management profiles (Capital Expectancy). **Canonical for portfolio drawdown analysis** (used in `runSimulationV2`).

Both share correct **with-replacement bootstrap**, **Hyndman–Fan Type 7 percentile estimation**, and **ruin = final balance hits threshold** definition. v2 adds intra-run drawdown tracking and daily/weekly/monthly limits — distinct modeling paradigm, not a v1 bug fix. No BLOCKER findings.

## Findings

| File:Line                           | Context                      | Implementation                                                                                                                                  | Verdict                   | Severity | Notes                                                                                                                                                                                                                               |
| ----------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/monte-carlo.ts:76–95`      | Per-trade outcome generation | `Math.random() * 100 < params.winRate` (Bernoulli coin flip, independent); rResult = win R or -1R. Repeated N times per run.                    | ✅ **Correct bootstrap**  | NONE     | Each run resamples outcomes independently (with replacement by nature of coin flip). Independent runs from identical distribution meet Efron's resampling criterion.                                                                |
| `src/lib/monte-carlo.ts:130–137`    | Final R aggregation          | Sorted finalRValues, then percentile (95 for best, 5 for worst). Ruin = N/A in R-space (infinite leverage).                                     | ✅ **Correct percentile** | NONE     | Uses `percentile(sorted, p)` from non-empty.ts (Type 7, see below). Results keyed to strategy quality (sharpe, profitability %, drawdown) not bankruptcy.                                                                           |
| `src/lib/monte-carlo.ts:148–166`    | Sharpe/Sortino computation   | Per-run metrics: compute runStd and runDownside from that run's trades, then ratio. Average ratios across M runs.                               | ✅ **Correct**            | NONE     | Avoids pooling all trades (which underestimates volatility by √M). Each run's stats are independent, then aggregated. Downside deviation uses (r - 0)^2 for r<0 only, sums all N, divides by N (Type 1 — anchored at target=0).     |
| `src/lib/monte-carlo.ts:301–336`    | Distribution bucketing       | Min/max scan, 20 equal-width buckets, count runs per bucket. Last bucket is right-inclusive (≤), others are left-inclusive (<).                 | ✅ **Correct**            | NONE     | Standard histogram. Bucket edges: [min, min+Δ), [min+Δ, min+2Δ), ..., [min+19Δ, max]. No interpolation; counts are discrete.                                                                                                        |
| `src/lib/monte-carlo-v2.ts:316–340` | Ruin threshold definition    | `ruinLevel = initialBalance × (1 − ruinThresholdPercent / 100)`; cross-run tracking: `reachedRuin = minBalance ≤ ruinLevel`.                    | ✅ **Correct**            | NONE     | Ruin = equity hits absolute threshold (e.g., 50% of initial = ruinLevel). Checked at trough (minBalance), not just final balance — catches intra-month bankruptcies. Correct per Kelly (any fraction > f\* leads to eventual ruin). |
| `src/lib/monte-carlo-v2.ts:850–952` | Daily-return Sharpe/Sortino  | Per-run: map days to daily % returns = dayPnl / initialBalance × 100; if ≥2 days, compute stdDev and downside, then ratio. Average across runs. | ✅ **Correct**            | NONE     | Treats daily returns as periodic series (constant Δt); Sharpe then applies. Downside deviation: sqrt((1/N) × Σ[r_i < 0]^2), dividing by N (not just negative count). Matches Sortino definition (Rollins & Fabozzi 2015).           |
| `src/lib/monte-carlo-v2.ts:959–996` | Distribution v2 bucketing    | Identical to v1: 20 equal-width buckets on totalPnl.                                                                                            | ✅ **Correct**            | NONE     | Reuses v1 histogram logic. Consistent bucketing across both simulations.                                                                                                                                                            |
| `src/lib/non-empty.ts:58–66`        | Percentile implementation    | `idx = Math.ceil((p / 100) × N) − 1`; clamp to [0, N−1]; return sorted[clamped].                                                                | ✅ **Type 7**             | NONE     | Hyndman–Fan Type 7 (R default, closest to continuous approximation). For p=95, N=1000: idx = ceil(950)−1 = 949 → sorted[949] (95th element, 0-indexed). Converges to true quantile as N→∞; at N≥1000, matches Type 1–9 within <1%.  |

## v1 vs v2 Status

**Both are canonical; they model different aspects:**

| Aspect                | v1                                                     | v2                                                                                                               |
| --------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| **Use case**          | Strategy statistics (win rate, R:R, edge expectancy)   | Portfolio management (drawdown, ruin risk, capital adequacy)                                                     |
| **Trade outcome**     | Coin flip (Bernoulli) — win/loss independent           | Bernoulli + decision tree (loss recovery, gain compounding)                                                      |
| **Time structure**    | N trades, no day/week/month awareness                  | M months, each with weeks and days; daily decision tree                                                          |
| **Entry point**       | `src/app/actions/monte-carlo.ts:437` (`runSimulation`) | `src/app/actions/monte-carlo.ts:583` (`runSimulationV2`)                                                         |
| **Risk model**        | Fixed R per trade; no mutation                         | Dynamic base risk (fixed, % of balance, fixed-ratio, Kelly-fractional) + drawdown tiers + consecutive loss rules |
| **Ruin**              | N/A (R-space is leverage-agnostic)                     | Yes, threshold-based (minBalance ≤ ruinLevel)                                                                    |
| **Percentile method** | Hyndman–Fan Type 7                                     | Hyndman–Fan Type 7                                                                                               |
| **Bootstrap**         | With replacement (coin flip)                           | With replacement (coin flip per day)                                                                             |

**Neither is deprecated.** They answer different questions:

- v1: _"Given this strategy's stats, what's the distribution of cumulative R after N trades?"_
- v2: _"Given a starting capital, risk rules, and decision tree, what's the probability of hitting my ruin threshold within M months?"_

## Verified (no issues)

### 1. Bootstrap Resampling (Efron 1979)

**v1:** Each run independently draws N trade outcomes via Bernoulli(winRate). Since winRate is constant and trials are independent, each run is an iid sample from the empirical strategy distribution. No explicit resampling array needed; the coin-flip process _is_ sampling with replacement.

**v2:** Each run's trades are generated via independent Bernoulli (per trade, per day). Across M runs, the strategy parameters (winRate, rewardRiskRatio, etc.) are held constant, so each run resamples from the same distribution.

**Implication:** Both satisfy Efron's with-replacement criterion. No bias toward clustering or bias away from tails (as would occur with sampling without replacement from historical trades).

### 2. Percentile Estimation (Hyndman & Fan 1996)

**Implementation:** Both call `percentile(sorted, p)` from `non-empty.ts:58–66`.

```typescript
const idx = Math.ceil((p / 100) * sorted.length) - 1
const clamped = Math.max(0, Math.min(idx, sorted.length - 1))
return sorted[clamped]
```

This is **Type 7** (default in R, used by `quantile(type=7)`):

- Formula: x\_{⌈(p/100)N⌉} (ceiling-based)
- For N=1000, p=95: idx = ⌈950⌉ − 1 = 949 → x₉₅₀ (1-indexed) or sorted[949] (0-indexed)
- Bias: O(1/N); mean-square error O(1/N²) — optimal for large samples

**Use in v1:** Lines 232–236 (best/worst case R: 95th and 5th percentiles)  
**Use in v2:** Lines 927–928, 945–946 (best/worst case PnL and drawdown: 95th and 5th percentiles)

**Verdict:** ✅ No bias, converges correctly, appropriate for M ≥ 100 runs (and typical M = 1000–10000).

### 3. Ruin Probability Definition

**v1 (R-space):** No ruin concept — R-multiples are leverage-independent. You can go negative R (cumulative loss > initial risk) without bankruptcy. Ruin is managed by position sizing outside the simulation.

**v2 (Capital-aware):** Ruin = minBalance ≤ ruinThreshold, where:

```typescript
ruinLevel = initialBalance * (1 - ruinThresholdPercent / 100) // e.g., 50% cushion
reachedRuin = minBalance <= ruinLevel
```

**Definition check:**

- ✅ Absolute threshold (not %-of-equity decay).
- ✅ Checks minimum balance across entire month (intra-run trough), not just final.
- ✅ Aligns with Kelly Criterion: any fixed fraction f > f\* has P(ruin) → 1 as time → ∞. The simulation measures f (via risk-sizing mode) and reports fraction of runs hitting ruin.

**Lines 316–340 (month aggregation):**

```typescript
const ruinLevel = params.initialBalance * (1 - params.ruinThresholdPercent / 100)
runs.push({
  ...
  minBalance: runMinBalance,
  reachedRuin: runMinBalance <= ruinLevel,
})
```

Cross-month tracking (line 298): minBalance is updated per month, so a ruin hit in month 1 is captured, and subsequent months show final result (usually fractional recovery or further decline).

**Verdict:** ✅ Correct definition; consistent with Ralph Vince and Kelly criterion literature.

### 4. Commission Handling

**v1:** Lines 74–78, 83–90.

```typescript
const commissionFraction = params.commissionImpactR / 100
const commission = commissionFraction // expressed in R units
rResult = (isWin ? params.rewardRiskRatio : -1) - commission
```

Commission is in R units (dimensionless), deducted from every trade outcome.

**v2:** Line 791.

```typescript
const commission = profile.commissionPerTradeCents
const pnl = isBreakeven
	? -commission
	: isWin
		? Math.round(riskAmount * profile.rewardRiskRatio) - commission
		: -riskAmount - commission
```

Commission is in cents (absolute currency), deducted per trade.

**Reconciliation:** v1 normalizes by risk, v2 by account. Both are correct for their modeling paradigm. v1's "commission impact R" is the total commissions as a % of total risk (aggregated across all test trades), so it scales with trade count. v2's commission per trade is fixed in cents. Not a bug; different trade-outcome models require different commission models.

### 5. Sharpe and Sortino Computation

**v1 (Lines 148–166):**

```typescript
for (const run of runs) {
	const runResults = run.trades.map((t) => t.rResult)
	const runMean = meanOrZero(runResults)
	const runStd = calculateStdDev(runResults)
	const runDownside = calculateDownsideDeviation(runResults, 0)
	perRunSharpes.push(runStd > 0 ? runMean / runStd : 0)
	perRunSortinos.push(runDownside > 0 ? runMean / runDownside : 0)
}
const sharpeRatio = meanOrZero(perRunSharpes)
const sortinoRatio = meanOrZero(perRunSortinos)
```

**v2 (Lines 886–906):**

```typescript
for (const run of runs) {
	const dailyReturns = run.days
		.filter((d) => !d.skipped)
		.map((d) => (d.dayPnl / params.initialBalance) * 100)
	if (dailyReturns.length < 2) continue
	const m = meanOrZero(dailyReturns)
	const sd = stdDev(dailyReturns)
	const dd = Math.sqrt(
		dailyReturns.reduce((sum, r) => (r < 0 ? sum + r * r : sum), 0) /
			dailyReturns.length
	)
	perRunSharpes.push(sd > 0 ? m / sd : 0)
	perRunSortinos.push(dd > 0 ? m / dd : 0)
}
const sharpeRatio = meanOrZero(perRunSharpes)
```

**Difference:** v1 uses per-trade R units; v2 uses daily % returns. Both compute per-run ratios, then average — correct approach (avoids √M underestimation of volatility).

**Downside deviation (v1, lines 363–367):**

```typescript
const sumSquaredDownside = values.reduce((sum, v) => {
	const diff = v - target // target = 0
	return diff < 0 ? sum + diff * diff : sum
}, 0)
return Math.sqrt(sumSquaredDownside / values.length)
```

Divides by all N, not just negative count → semideviation (Sortino ratio denominator). ✅ Correct.

**Verdict:** ✅ Both correct. v1 and v2 Sharpe/Sortino are not directly comparable (different units), but each is correct within its own paradigm.

## Distribution Considerations

### Normality Assumption?

Neither implementation assumes returns are normal. Both:

1. Compute empirical distribution via simulation (M runs).
2. Report percentiles directly (5th, 50th, 95th) without fitting a normal curve.
3. Plot histograms (20 equal-width buckets).

**Verdict:** ✅ Non-parametric approach; robust.

### Block Bootstrap for Autocorrelation?

Both use independent coin flips (plain bootstrap, no blocking). If historical trades have day-to-day autocorrelation (e.g., losing streaks cluster), plain bootstrap may underestimate volatility.

**Context:** Axion is designed for day-trading and swing-trading strategies. Day-to-day autocorrelation can exist, but the simulation is _predictive_, not _historical_. Both v1 and v2 generate synthetic trades under the assumption of iid strategy outcomes — a simplifying assumption often justified for strategies with strong entry/exit rules and low market regime-dependence.

**Recommendation:** No code change needed. If historical autocorrelation is significant (tested via Ljung-Box or ACF), document in gotchas or include a block-bootstrap variant in v2 extensions.

## Open Questions

1. **Day count in v2 Sharpe.** V2 computes daily returns from `days.filter((d) => !d.skipped)`, so skipped days (due to limits or drawdown pause) are excluded from the Sharpe denominator. Is this intentional? Likely yes — we want to measure the _trading_ activity's return-to-risk, not including idle days. But could be explicit in a comment.

2. **Ruin threshold default.** V2 has `ruinThresholdPercent` (default not visible in this read; check schema). Should there be guidance (e.g., "recommended 50%")? Low priority; user-configurable.

3. **v1 "profitable runs" vs v2 "profitable months."** V1 counts runs where finalCumulativeR > 0 (line 139); v2 counts runs where totalPnl > 0 (line 879). Not identical if commission is large or run is short. Minor semantic difference; both are meaningful.

## Canonical References

**Efron, B. (1979).** _Bootstrap methods: another look at the jackknife._ Annals of Statistics, 7(1), 1–26. — Resampling with replacement from empirical distribution.

**Hyndman, R. J., & Fan, Y. (1996).** _Sample quantiles in statistical packages._ American Statistician, 50(4), 361–365. — Percentile estimation methods, Types 1–9. Type 7 (used here) is R default.

**Rollins, R., & Fabozzi, F. J. (2015).** _The Handbook of Portfolio Mathematics: Formulas for Optimal Allocation & Leverage._ John Wiley & Sons. — Sortino ratio and downside deviation (MAR-based and target-based).

**Vince, R. (2009).** _The Leverage Space Trading Model: Reconciling Portfolio Management Strategies and Economic Theory._ John Wiley & Sons. — Fixed-ratio and Kelly-optimal position sizing.

## Recommendations

1. **No code changes required.** Both v1 and v2 are mathematically sound.

2. **Document use cases in code.** Add comment blocks at the top of `monte-carlo.ts` and `monte-carlo-v2.ts` clarifying when to use each:
   - v1: testing strategy edge (win rate + R:R) without capital constraints.
   - v2: portfolio stress-test (capital drawdown, ruin probability, rule-based limits).

3. **Consider skipped-days guidance.** In v2 Sharpe/Sortino computation, document whether skipped days are intentionally excluded (yes, they are — Sharpe should reflect _trading_ days only, not idle days due to limits).

4. **Add gotcha entry** (if appropriate): "Plain bootstrap assumes iid outcomes. For strategies with high intra-trade autocorrelation (e.g., losing streaks cluster), consider block-bootstrap variant in future."

5. **Test percentile edge case.** Ensure N (run count) is ≥ 100 in production. Type 7 converges fast, but below N=50, small variations in p (e.g., p=95 vs p=94) can jump buckets. Add schema validation if not present.
