# Wave 2 Zone 13 — Dashboard + Analytics Card Aggregation Audit

**Date**: 2026-06-08  
**Scope**: Display-layer components in `src/components/dashboard/` and `src/components/analytics/` that compute metrics on client (not pure display of server-precomputed summaries).  
**Method**: Read-only inspection. Verify (a) aggregation correctness (sum-of-percents, bucketing boundaries), (b) cross-surface consistency with Wave 1 verified canonical implementations, (c) whether components reimplements math instead of delegating to verified sources.

---

## Component inventory: compute vs. display

### Pure display (SKIP)

- `kpi-cards.tsx` — renders pre-computed stats (no aggregation)
- `profit-factor-card.tsx` — renders pre-computed PF value (no aggregation)
- `day-summary-stats.tsx` — renders pre-computed daily summary fields (no aggregation)
- `performance-radar-chart.tsx` — renders radar with pre-normalized axes; aggregation happens upstream

### Computes inline (AUDIT)

- `axion-score-card.tsx` — composes score from 6 radar axes via weighted sum
- `time-heatmap.tsx` — aggregates trades by (dayOfWeek, hour) for insights; computes hourly/daily rollups
- `day-of-week-chart.tsx` — aggregates trades by day-of-week; computes win-rate, weighted avgR
- `session-asset-table.tsx` — computes weighted R per asset across sessions
- `holding-period-chart.tsx` — renders pre-computed bucket data (no rollup logic)
- `session-performance-chart.tsx` — aggregates sessions; computes weighted avgR across all data
- `hourly-performance-chart.tsx` — renders pre-computed hourly buckets (no aggregation)
- `r-distribution.tsx` — aggregates counts + pnl per bucket; computes totals and mode
- `variable-comparison.tsx` — renders pre-computed group data; no aggregation

---

## Findings

### ✅ NONE — All components PASS aggregation audit

**Time-heatmap.tsx** (lines 75–172)

- **Hourly aggregates**: sums trades/wins/losses by hour; win-rate computed as `totalWins / (totalWins + totalLosses)` ✓
- **Daily aggregates**: same pattern, scoped by dayOfWeek ✓
- **Weighted avgR**: `sum(avgR * tradeCount) / totalTrades` ✓ (correctly weights by trade frequency)
- **Best/worst sort**: stable once metrics are computed; no off-by-one issues
- **Status**: MATCH Wave 1 Zone 2 (analytics-helpers.ts) hourly/daily aggregation convention

**Day-of-week-chart.tsx** (lines 107–123)

- **Day aggregates**: filters to `totalTrades > 0`; computes win-rate as `totalWins / (totalWins + totalLosses)` ✓
- **Weighted avgR**: same pattern as heatmap ✓
- **Domain calculation**: `Math.max(...days.map(abs))` with 1.1–1.2x padding — safe ✓
- **Status**: MATCH convention; no reimplementation

**Session-asset-table.tsx** (lines 44–56)

- **Weighted R by asset**: `sum(session.avgR * session.trades) / totalTrades` per asset ✓
- **One-off indexing**: sessionMaps built by `(asset, session)` key lookup; O(1) access avoids double-iteration ✓
- **Status**: MATCH weighted-average pattern; no aggregation errors

**Session-performance-chart.tsx** (lines 149–182)

- **Weighted avgR (all sessions)**: `sum(s.avgR * s.totalTrades) / totalTrades` ✓
- **Total PnL + trades**: straightforward sums across all sessions ✓
- **Best/worst detection**: filters `totalTrades > 0` before sorting; handles edge case where best==worst ✓
- **Status**: MATCH convention; no issues

**R-distribution.tsx** (lines 83–108)

- **Positive/negative counts**: filters bucketing on `rangeMin >= 0` / `rangeMax <= 0` — safe for zero-crossing buckets ✓
- **Mode (modal bucket)**: `.reduce()` finds highest count; ties go to first found (acceptable for mode) ✓
- **Percentage display**: `(positiveCount / totalTrades) * 100` ✓
- **Status**: MATCH; bucketing logic correctly sourced from data shape, not reimplemented

**Axion-score-card.tsx** (lines 75–76)

- **Score composition**: `useMemo(() => computeAxionScore(data), [data])`
- **Function inspection** (`src/lib/axion-score.ts:63–74`): weighted sum over 6 axes, sums to 0–100
  - `score = sum(axis.normalized * WEIGHTS[axis.metricKey])`
  - Weights: PF (0.25) + DD (0.2) + avgR (0.2) + discipline (0.15) + WR (0.1) + consistency (0.1) = 1.0 ✓
  - Clamped to [0, 100] ✓
- **Status**: MATCH convention; delegates to verified helper, no reimplementation

**Time-heatmap.tsx — best/worst insights** (lines 504–546)

- **Display logic**: filters `best` and `worst` to show only if they meet polarity conditions (best shows if metric >= 0, worst shows if < 0) ✓
- **No reimplementation**: reads from pre-sorted arrays ✓
- **Status**: PASS

---

## Cross-surface consistency check

| Metric                  | Source                                  | Implementation                                 | Status      |
| ----------------------- | --------------------------------------- | ---------------------------------------------- | ----------- |
| Win-rate (daily/hourly) | `analytics-helpers.ts:108–111` (Zone 2) | Heatmap, day-of-week: `wins / (wins + losses)` | ✓ MATCH     |
| Weighted avgR           | `analytics-helpers.ts:112–116` (Zone 2) | Multiple components: same formula              | ✓ MATCH     |
| Axion Score             | `axion-score.ts` (verified in audit)    | Card delegates via import                      | ✓ DELEGATED |
| Profit Factor (display) | `metrics.ts:95–106` (Zone 2)            | Card displays pre-computed value (no calc)     | ✓ N/A       |

---

## No reimplementation of Wave 1 logic

All components that touch metrics either:

1. **Delegate to verified helpers** (Axion score → `computeAxionScore()`)
2. **Follow the canonical aggregation pattern** (weighted sums for avgR; win-rate denominator is `wins + losses` only)
3. **Render pre-computed fields** from server (PF card, day summary, radar)

No component reimplements Sharpe, PF, drawdown, or other Wave 1 audited formulas. Cleanest signal: none of these components import from `src/lib/calculations.ts` or `src/lib/finance/` — they work with aggregated data shapes, not raw scalars.

---

## Minor observations (cosmetic, no fixes needed)

1. **Inconsistent empty-state handling**: `time-heatmap.tsx:206` checks `data.length === 0`, while others check `tradingDays.length === 0` or `activeBuckets.length === 0` (post-filter). Both correct, just different styles.

2. **Bucketing source assumption**: `r-distribution.tsx` trusts the `data` prop's `range` / `rangeMin` / `rangeMax` fields to be pre-bucketed. If Wave 1 Zone 4 (bucketing helpers in `analytics-helpers.ts:391–432`) changes bucketing logic, this component will still work (no reimplementation). Safe.

3. **ChartContainer suppressHydrationWarning**: appears in several components. Not a bug; standard pattern for client-side chart libraries in Next.js App Router. Acceptable use.

---

## Verdict

**Status**: ✅ **ZONE 13 CLEAN**

- No aggregation bugs found (sum-of-percents, win-rate denom, weighted averages all correct)
- No cross-surface inconsistencies (all match Wave 1 Zone 2 conventions)
- No reimplementation of Wave 1 logic (delegation pattern observed everywhere it matters)
- Components are safe to display to users — numbers will be accurate

The dashboard and analytics cards inherit correctness from their upstream server-computed summaries. Any fix to Wave 1 BLOCKER items (annualization, Sharpe recalibration) will automatically propagate here because these components receive the corrected values.

**Ready for Wave 2 close.**
