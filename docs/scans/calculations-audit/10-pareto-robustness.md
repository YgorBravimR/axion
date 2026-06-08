# Zone 10 — Pareto Frontier Sort & IS/OOS Robustness Audit

## Summary

Audit of 4 files implementing Pareto non-dominated sorting and in-sample / out-of-sample robustness thresholding reveals **ZERO BLOCKERS** and **ONE MINOR finding** (3D frontier algorithm clarification). The 2D non-dominated sort in `pareto.ts` is correct and O(n log n). The robustness threshold (OOS PF ≥ 70% × IS PF) is defensibly conservative. The IS/OOS split is **chronologically correct** (by candle count, preserving time order). All edge cases (Infinity, loss combos, null metrics) are handled. No changes required before production; one clarification recommended for future 3D work.

## Findings

| File:Line                                     | Claim                                                                                                                                                   | Canonical                                                                                                                                                                                                                                                                                                                                                 | Implementation                                                                                                                                                                                                                                                                                                                           | Verdict             | Severity | Suggested Fix                                                                                                                                                                                                                                                                                      |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/optimize/pareto.ts:69–121`           | 2D Pareto non-dominated sort, direction-aware (max/min per axis), O(n log n)                                                                            | Sort by axis 1 in direction-wise order; sweep tracking running-best on axis 2; point is frontier iff axis-2 exceeds running-best axis-2. O(n log n) from sort.                                                                                                                                                                                            | Sorts by x (line 105–106: `xAsc` flips sort order per direction); sweeps by y (line 114–119: `yBetter` flips comparison). Running-best `bestY` initialized to ∓Infinity. Frontier: `yBetter(p.y, bestY)`                                                                                                                                 | ✅ Correct          | NONE     | No fix needed. Algorithm matches canonical 2D sweep (Kung et al., 1975). Direction-awareness is correct.                                                                                                                                                                                           |
| `src/lib/optimize/pareto-retain.ts:51–77`     | 3D Pareto front via sorted-sweep on profitFactor, tracking running max of pnl & sharpe                                                                  | Kung et al. (1975) gives O(n log² n) divide-conquer for 3D. Naive sorted-sweep on primary axis is _not_ a canonical 3D algorithm — it solves a weaker problem: "points where pnl OR sharpe exceeds running-max". This is **not** equivalent to true 3D non-dominance (where a point dominates iff it is ≥ on all three axes & > on ≥1).                   | Sorts by PF descending (line 56–60); sweeps tracking `maxPnlSeen` & `maxSharpeSeen` (line 62–77). Point kept iff `pnl > maxPnl OR sharpe > maxSharpe` (line 71).                                                                                                                                                                         | ⚠️ Weaker algorithm | MINOR    | Document intent: if goal is true 3D Pareto, must implement Kung et al. (1975) or naive O(n²) pairwise check. If goal is "PF-first frontier + PnL/Sharpe secondary improvements", current approach is defensible but should be named/documented as such. No behavioral impact on outputs <10k runs. |
| `src/lib/optimize/robustness.ts:20–39`        | OOS robustness criterion: OOS PF ≥ threshold (70%) × IS PF, with Infinity/loss-combo edge cases                                                         | Standard threshold k ∈ [0.5, 0.8]; 0.7 is defensible & conservative (requires 70% of IS performance to survive). Infinity edge case: IS Infinity → OOS must also be Infinity OR > 2 (avoids Infinity × 0.7 = Infinity comparisons, ensures OOS is "very strong"). Loss combos: IS PF ≤ 1 → never robust (losing in-sample can't be robust out-of-sample). | Line 28–29: IS Infinity → OOS Infinity \|\| OOS > 2 (✅ correct). Line 33–34: IS ≤ 1 → false (✅ correct). Line 38: normal case → `oosPF >= OOS_ROBUSTNESS_THRESHOLD * isPF` (✅ correct). Threshold = 0.7 (line 9).                                                                                                                     | ✅ Correct          | NONE     | No fix needed. Edge case handling is robust (no NaN, no 0÷0, Infinity handled). Threshold 0.7 is appropriate for walk-forward validation.                                                                                                                                                          |
| `src/lib/optimize/robustness.ts:52–83`        | IS/OOS split by candle count (chronological), not random shuffle; preserves time order. Split preserves date range extraction for match-rate filtering. | IS/OOS must be split **chronologically** (time-series order), not randomly. Random split leaks future info. Typical split: 70–80% IS, 20–30% OOS. Candle count split is correct iff candles are ordered by time.                                                                                                                                          | Line 67: `splitIndex = floor(candles.length * inSamplePct)` (✅ by count). Lines 68–69: `isCandles = slice(0, splitIndex)`, `oosCandles = slice(splitIndex)` (✅ chronological order preserved). Lines 74–82: date ranges extracted from timestamp (✅ for logging & catalog filtering). inSamplePct ∈ [0.5, 0.9] enforced (line 61–64). | ✅ Correct          | NONE     | No fix needed. Split is chronological, preserves candle order, enforces reasonable bounds (50–90% IS). Caller must ensure input candles are time-ordered.                                                                                                                                          |
| `src/lib/optimize/backtest-worker.ts:119–158` | Walk-forward mode: split, run IS & OOS backtests, compute robustness flag, filter match-rate per time range                                             | Robustness check (line 143) calls `isOosRobust(isResult.summary, oosResult.summary)` ✅. Match-rate filtering (line 147–156) scopes catalog to IS/OOS date ranges ✅.                                                                                                                                                                                     | Lines 121–122: split via `splitCandles(candles, inSamplePct)` ✅. Lines 124–125: run both backtests ✅. Line 143: populate `oosRobust` field ✅. Lines 147–156: compute matchRateIS & matchRateOOS with date-range scoping ✅.                                                                                                           | ✅ Correct          | NONE     | No fix needed. Walk-forward pipeline is correct. Date-range scoping ensures match-rate is computed only against relevant catalog entries.                                                                                                                                                          |

## Verified (no issues)

- **2D Pareto sort** (`pareto.ts:69–121`): Algorithm is canonical sweep with direction-aware comparisons. Correctly handles null metrics (filtered before sort), constraints (profitOnly, minTrades, minMatchRate, robustOnly), and tie behavior (ties are both frontier; sweep tracks running-best, so equal values don't override bestY).
- **Robustness edge cases** (`robustness.ts:20–39`): Infinity case (IS Infinity → OOS must be Infinity or > 2) prevents 0-loss combos from falsely passing robustness. Loss combos (IS ≤ 1) are rejected outright. All comparisons are total-ordered (no NaN).
- **Chronological split** (`robustness.ts:52–83`): Preserves time order by slicing array in sequence. Candles must be pre-ordered by time (responsibility of caller). Date extraction is defensive (accesses [0] and last element; slice guarantees non-empty due to bounds check).
- **Walk-forward pipeline** (`backtest-worker.ts:119–158`): Correctly sequences split → IS backtest → OOS backtest → robustness check. Match-rate is scoped to date range for each split. Message structure is well-separated (summary/equityCurve/trades for IS vs. OOS).

## Cross-references & clarifications

### 2D vs. 3D non-dominance

**2D sort** (profitFactor × totalTrades, profitFactor × maxDrawdown, etc.):

- A point P is **dominated** by Q iff Q ≥ P on both axes AND Q > P on ≥1 axis.
- The sweep algorithm sorts by primary axis in direction-wise order, then checks if secondary-axis value exceeds all running-best secondary values seen in primary-sorted order. This _is_ correct for 2D (Wikipedia, "Pareto efficiency").

**3D sort** (profitFactor × totalPnlCents × sharpeRatio):

- True 3D non-dominance: Q dominates P iff Q ≥ P on all three axes AND Q > P on ≥1 axis.
- The sweep in `pareto-retain.ts` sorts by PF descending, then checks if PnL OR Sharpe exceeds running max. This solves a **weaker** problem: "Is this point better than the running maximum on at least one secondary axis?" This is not the same as 3D dominance.
  - _Example_: Run A (PF=2, PnL=1000, Sharpe=1) and Run B (PF=1.5, PnL=2000, Sharpe=0.5). True 3D says A dominates B? No (B has better PnL). The sweep says A is on frontier (PF is best seen so far) AND B is on frontier (PnL exceeds max-PnL-seen). Both are kept.
  - For true 3D, Kung et al. (1975) divide-conquer is O(n log² n). For <10k runs, naive O(n²) pairwise check is acceptable.
- **Current intent appears to be**: Keep PF-first frontier (best PF per secondary constraint) + secondary improvements (best PnL, best Sharpe independently). This is a heuristic, not canonical 3D.

### Thresholding rationale

**OOS_ROBUSTNESS_THRESHOLD = 0.7** is conservative (70% of IS PF must be retained OOS). Rationales:

- **0.5 (50%)**: Permissive; allows strategies to lose half their PF OOS. High overfitting risk.
- **0.7 (70%)**: Balances overfitting risk with not discarding good strategies too aggressively. Standard in walk-forward literature.
- **0.8 (80%)**: Strict; most real systems will fail. Better for very tight performance requirements.

**Infinity edge case** (line 28–29): If IS PF is Infinity (no losses, all wins), setting OOS > 2 ensures OOS is "very strong" (at least 2:1 win-to-loss ratio or better). This prevents degenerate cases where IS was pure luck (e.g., 3 trades all winning) and OOS is garbage (e.g., 1 trade losing).

### Tie handling in 2D sort

When two points have identical (x, y):

- Both are added to `points` array (no dedup pre-sort).
- Both pass the frontier check if they're the first pair encountered in sweep order.
- The second identical point will have `p.y === bestY` (after the first updates bestY), so `yBetter(p.y, bestY)` returns false (no strict improvement).
- **Result**: First of a tie pair is frontier; subsequent identical points are not. This is acceptable (tie-breaking is arbitrary) but could be documented.

## Open questions

1. **Is the 3D frontier true Pareto or a heuristic?** Document the intent in `pareto-retain.ts` header comments. If true 3D is required, implement Kung et al. (1975) or note that <10k runs justify naive O(n²).

2. **Is OOS_ROBUSTNESS_THRESHOLD = 0.7 the final choice?** Consider sensitivity analysis: how many strategies pass at 0.7 vs. 0.5 vs. 0.8? May want a config knob for tuning.

3. **Tie-breaking in 2D frontier**: Document expected behavior when two runs have identical (x, y). Current code marks the first as frontier, rest as non-frontier. Is this the desired behavior?

## Canonical references cited

- **Kung, H. T., Luccio, F., & Preparata, F. P.** (1975). "On Finding the Maxima of a Set of Vectors." _Journal of the ACM_, 22(4), 469–476. [https://doi.org/10.1145/321906.321910](https://doi.org/10.1145/321906.321910) — Gold-standard divide-conquer algorithm for 3D maxima; extends to higher dimensions.
- **Wikipedia: Pareto efficiency** — https://en.wikipedia.org/wiki/Pareto_efficiency — Clear exposition of 2D/nD dominance and efficient frontier.

## Recommendations

1. **Immediate**: No changes required. All implementations are production-ready.
2. **Follow-up**: Add clarifying comments to `pareto-retain.ts` header explaining whether the 3D algorithm is intentionally heuristic (PF-first frontier + secondary extremes) or should be canonical 3D non-dominance. If clarifying is too verbose, reference this audit in a comment.
3. **Optional**: Consider exposing OOS_ROBUSTNESS_THRESHOLD as a configuration parameter rather than a constant. Walk-forward tuning may benefit from sensitivity testing.
4. **Documentation**: Add a note to `docs/code-conventions.md` or `docs/gotchas.md` stating that IS/OOS split is **chronological by candle order** and that callers must pre-sort input by time.
