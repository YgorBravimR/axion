# Equity Curve Construction Audit

**Date**: 2026-06-08  
**Auditor**: Arch  
**Status**: PASS with one MINOR inconsistency

---

## Executive Summary

All four equity curve construction sites in Axion use **arithmetic cumulative P&L** (not log returns). High Water Mark (HWM) and drawdown logic are computed correctly and consistently across surfaces. One labeling inconsistency exists in `analytics-helpers.ts` where `accountEquity` mirrors `equity` when there is no initial balance context.

---

## Sites Audited

### 1. `src/lib/analytics-helpers.ts` — `computeEquityCurve()` (lines 235–275)

**Formula**: Arithmetic cumulative P&L with rolling HWM.

**Data flow**:

- Aggregates trades by exit/entry date into daily buckets (line 240–247).
- Iterates sorted dates (line 255), accumulating `cumulativePnL` per day (line 257).
- Tracks `peak` as cumulative maximum (line 259–261).
- Drawdown = `(peak − cumulative) / |peak| × 100` (line 264).

**Observations**:

- ✅ Daily aggregation is done before cumulative — correct order.
- ✅ Sort is alphabetic on date key (YYYY-MM-DD) — orders correctly.
- ✅ HWM is taken as running maximum of cumulative P&L (line 259).
- ⚠️ **MINOR**: Line 269 sets `accountEquity = cumulativePnL` when no initial balance is passed. This mirrors `equity` exactly, making the two fields redundant. Works, but semantically awkward.

**Used by**: Client-side decryption flows (e.g., private equity curves, encryption-dependent queries).

---

### 2. `src/lib/backtest/metrics.ts` — `buildEquityCurve()` (lines 146–162)

**Formula**: Trade-by-trade cumulative P&L with rolling HWM (per-trade granularity, not daily aggregated).

**Data flow**:

- Maps over trade array in input order (line 150).
- Accumulates `cumulativePnl` per trade (line 151).
- Tracks `peakEquity` as running maximum (line 152).
- Drawdown in absolute cents = `peakEquity − cumulativePnl` (line 153).

**Observations**:

- ✅ Correct arithmetic accumulation.
- ✅ HWM correctly taken as rolling maximum.
- ✅ Note: per-trade granularity (not daily) — this is intentional for backtest detail.
- ✅ Drawdown stored in absolute cents (not percentage) — matches `EquityCurvePoint` type (backtest.ts).

**Used by**: Backtest engine, breakeven filter. Entry point: `src/lib/backtest/engine.ts` calls `buildEquityCurve(trades)`.

---

### 3. `src/lib/cache/cached-queries.ts` — `computeEquityCurveFromTrades()` (lines 294–327)

**Formula**: Arithmetic cumulative P&L with running HWM, initialized to `initialBalance`.

**Data flow**:

- Aggregates trades into daily P&L buckets (line 302–308).
- Iterates sorted dates (line 315).
- Accumulates `cumulativePnL` (line 317).
- Computes `accountEquity = initialBalance + cumulativePnL` (line 318).
- Tracks `peak` starting at `initialBalance` (line 313), updated to max of `accountEquity` (line 319–321).
- Drawdown = `(peak − accountEquity) / peak × 100` (line 322).

**Observations**:

- ✅ Daily aggregation before cumulative — correct.
- ✅ HWM initialized to account balance (line 313) — appropriate baseline.
- ✅ Drawdown as percentage from peak — matches dashboard UX.
- ✅ Both `equity` (P&L offset) and `accountEquity` (balance-adjusted) returned — allows UI to show either.

**Used by**: Server-side analytics queries, dashboard equity curve card, risk simulations.

---

### 4. `src/app/actions/analytics.ts` — `getEquityCurve()` (lines 301–409)

**Formula**: Same as `cached-queries.ts`, with two modes: daily aggregated (default) and per-trade.

**Data flow**:

**Daily mode (lines 370–402)**:

- Aggregates trades by entry date into daily buckets (line 371–377).
- Iterates sorted dates (line 384).
- Accumulates `cumulativePnL` (line 386).
- Computes `accountEquity = initialBalance + cumulativePnL` (line 387).
- Tracks `peak` starting at `initialBalance` (line 382), updated to max of `accountEquity` (line 389–391).
- Drawdown = `(peak − accountEquity) / peak × 100` (line 393).

**Per-trade mode (lines 344–368)**:

- Iterates result array in order (line 349).
- Same accumulation and HWM logic as daily mode.
- Returns one point per trade (line 361–368).

**Observations**:

- ✅ Both modes use the same arithmetic formula.
- ✅ HWM correctly initialized and maintained.
- ✅ Drawdown consistent across modes.
- ✅ Initial balance fetched from settings with fallback to 10,000 (line 316–321).
- ✅ Trades ordered by `entryDate` asc before processing (line 331).

**Used by**: API endpoints for dashboard, equity curve chart, historical analytics.

---

## Cross-Site Consistency Check

| Aspect                | Helper                  | Backtest           | Cached Query                | Analytics Action            |
| --------------------- | ----------------------- | ------------------ | --------------------------- | --------------------------- |
| **Formula type**      | Arithmetic cum P&L      | Arithmetic cum P&L | Arithmetic cum P&L          | Arithmetic cum P&L          |
| **Daily aggregation** | Yes                     | N/A (per-trade)    | Yes                         | Yes (default mode)          |
| **HWM computation**   | Running max of cum      | Running max of cum | Running max of account      | Running max of account      |
| **Drawdown formula**  | `(peak−cum)/(peak)×100` | Absolute cents     | `(peak−account)/(peak)×100` | `(peak−account)/(peak)×100` |
| **Initial balance**   | None (relative to 0)    | N/A (backtest)     | Required param              | Fetched from settings       |
| **Sort order**        | Date key (asc)          | Trade order        | Date key (asc)              | Entry date (asc)            |

**Finding**: ✅ **All four sites use the same underlying arithmetic formula.** Differences are intentional:

- `analytics-helpers.ts` operates relative to starting capital = 0 (for encrypted/private flows).
- `metrics.ts` operates at per-trade granularity for backtest detail.
- `cached-queries.ts` and `analytics.ts` both use account balance as baseline.

---

## HWM & Drawdown Logic Verification

All four sites correctly implement drawdown as:

```
drawdown = (peak − current_equity) / peak [× 100 for percentage]
```

Examples from code:

- **Helper** (line 264): `((peak - cumulativePnL) / denom) * 100`
- **Backtest** (line 153): `peakEquity - cumulativePnL` (absolute cents)
- **Cached query** (line 322): `((peak - accountEquity) / peak) * 100`
- **Analytics action** (line 393): `((peak - accountEquity) / peak) * 100`

All start HWM at the first point (either cumulative P&L or account balance) and update as a running maximum. **No issues found.**

---

## Daily Aggregation Order Check

All three sites that aggregate by day follow the correct order:

1. **Sum all P&L for each date** into a daily bucket (Map).
2. **Sort dates** (ascending).
3. **Iterate dates and accumulate** P&L cumulatively.
4. **Compute HWM and drawdown** per date.

Example:

- `cached-queries.ts` lines 302–308: build daily buckets.
- `cached-queries.ts` line 310: sort dates.
- `cached-queries.ts` lines 315–324: iterate and accumulate.

**No double-counting or out-of-order processing detected.**

---

## Findings

### PASS (Green)

- ✅ All four sites use consistent arithmetic cumulative P&L formula.
- ✅ HWM is computed as running maximum across all sites.
- ✅ Drawdown logic is correct everywhere.
- ✅ Daily aggregation order is correct (sum first, then cumulate).
- ✅ Trade sort order is deterministic (by date, ascending).

### MINOR (Yellow)

- ⚠️ **`analytics-helpers.ts` labeling**: Line 269 comments `accountEquity: cumulativePnL // no initial balance context` — this creates semantic redundancy. If the function is ever called with actual account balance context in the future, the comment will be misleading. Consider adding a boolean parameter `withInitialBalance?: boolean` to disambiguate, or rename fields when called in private (non-balance) contexts.

### BLOCKER / MAJOR

- ✅ None found.

---

## Verification URLs

- Helper: `/Users/ygorbravim/personal/projects/bravo/axion/src/lib/analytics-helpers.ts#L235`
- Backtest: `/Users/ygorbravim/personal/projects/bravo/axion/src/lib/backtest/metrics.ts#L146`
- Cached query: `/Users/ygorbravim/personal/projects/bravo/axion/src/lib/cache/cached-queries.ts#L294`
- Analytics action: `/Users/ygorbravim/personal/projects/bravo/axion/src/app/actions/analytics.ts#L305`

---

## Recommendation

No action required for correctness. For future clarity:

- Consider documenting in `docs/code-conventions.md` that all equity curves use **arithmetic cumulative P&L**, never log returns, and why (fixed-size position sizing, futures, R-multiple system).
- Document the relationship between `equity` (P&L offset) and `accountEquity` (balance-adjusted) in type comments.

---
