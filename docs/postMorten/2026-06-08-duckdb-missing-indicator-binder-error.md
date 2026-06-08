# DuckDB Binder Error on Missing Parquet Columns

**Date:** 2026-06-08
**Severity:** High
**Affected Area:** `/backtest/optimize` page, Hawks strategy + WIN — R15 source combination

## Cause

The DuckDB Parquet reader implementation in `src/lib/candle-store/duckdb-impl.ts` (lines ~214–217) contained a **false assumption in its comment**: it claimed that DuckDB's `read_parquet()` returns NULL for unknown columns, making it "graceful for recipes that ask for indicators a file hasn't been ingested with."

**In reality:** DuckDB raises a **Binder Error** when the SELECT statement references a column that doesn't exist in the Parquet file.

### The Mismatch

- **Hawks strategy** (`hawksV0` preset) declares `requiredIndicators` including cross-timeframe MMEs: `["mme27_60m", "mme55_60m", "mme27_15m", "mme55_15m", "topos_fundos", ...]`
- **WIN — R15 Parquet** (ProfitChart-sourced) contains only: `["ema27", "ema200", "volume_fin", "macd2_histo", ...]`
- **No overlap** on the critical indicator keys → SELECT fails at query time

### Why It Escaped CI

The Phase 4 verification (via Playwright against dev server) only exercised **Range Breakout strategy**, which declares `requiredIndicators: []` (empty). This meant the SELECT statement never attempted to read missing columns. Hawks remained untested against WIN — R15 until the backtest optimize flow was manually tried.

## Effect

User navigates to `/backtest/optimize`, selects Hawks + WIN — R15, clicks "Carregar Dados" → inline error:

```
Binder Error: Referenced column "mme27_60m" not found in FROM clause!
Candidate bindings: "ema27", "ema200", "timestamp", "volume_fin", "macd2_histo"
```

## Solution

Modified `src/lib/candle-store/duckdb-impl.ts`:

1. **Added `getParquetColumns()` helper** (lines 208–224): Probes the Parquet schema via `DESCRIBE SELECT * FROM read_parquet()` and caches results per file path (files are immutable post-export, so cache is safe).

2. **Updated `buildSelectColumns()` signature** (lines 226–249): Now accepts `availableColumns: Set<string>` parameter. For each requested indicator:
   - If present: project as `"key"`
   - If absent: project as `NULL AS "key"` to maintain row shape

3. **Updated `fetchRange()`** (lines 265–270): Calls `getParquetColumns()` before building the SELECT statement, then passes the result to `buildSelectColumns()`.

4. **Removed misleading comment** at the old line 214. New comment (lines 237–238) now accurately describes the fix.

### Example Query Transformation

Before (breaks):

```sql
SELECT timestamp, open, high, low, close, candle_index, "mme27_60m", "mme55_60m", ...
FROM read_parquet('...')
```

After (works):

```sql
SELECT timestamp, open, high, low, close, candle_index,
       NULL AS "mme27_60m", NULL AS "mme55_60m", ...
FROM read_parquet('...')
```

Rows come back with `{ indicators: { ... } }` where absent-then-aliased keys stay undefined (null converted by `toNumber()` check at lines 294–310).

## Prevention

- **Any future changes to the candle reader** must be tested with a recipe that declares non-trivial `requiredIndicators` (Hawks qualifies; Range Breakout does not).
- **Phase 5 verification** (or any subsequent manual testing) should explicitly exercise the Hawks + R15 combination to catch similar schema mismatches.
- Consider adding a **test fixture** that creates a minimal Parquet file with only a subset of expected columns, then runs a Hawks backtest against it — this would have caught the bug in CI.

## Related Files

- `src/lib/candle-store/duckdb-impl.ts` — The fix
- `src/lib/backtest/presets/hawks-presets.ts` — Strategy declaring the indicators
- `src/app/actions/backtest.ts` — The caller that passes `requiredIndicators` to `fetchRange()`
- `src/__tests__/lib/candle-store/duckdb-impl.test.ts` — New test file documenting the scenario
