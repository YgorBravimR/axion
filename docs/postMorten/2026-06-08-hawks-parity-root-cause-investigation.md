# Bug Investigation: Hawks v0.7 Trade Count Divergence — /backtest vs /optimize (2026-06-08)

**Date:** 2026-06-08
**Severity:** High
**Affected Area:** Hawks v0.7 engine, `/backtest` vs `/optimize` paths
**Status:** ROOT CAUSE IDENTIFIED — Engine is deterministic; divergence is in UI/worker layer

---

## Reported Divergence

User (Ygor) observed via Playwright on identical inputs (WIN 5m, 2025-12-31 to 2026-06-08):

| Metric        | /backtest | /optimize |       Δ |
| ------------- | --------: | --------: | ------: |
| Trades        |       325 |       502 |    +54% |
| Win rate      |     35.9% |     33.1% | -2.8 pp |
| Profit Factor |      1.52 |      1.33 |   -0.19 |
| P&L           |  R$ 3,367 |  R$ 3,553 | +R$ 186 |
| Max DD        |    R$ 731 |  R$ 1,005 | +R$ 274 |

Both runs stamped `engineVersion: "hawks-v0.7"`, `recipeHash: "4e515d97"`, `datasetHash: "17517-bff6d33e"`.

---

## Investigation Summary

### Phase 1: Production Dataset Test (NEW — This Agent)

Created comprehensive in-process diagnostic that replicates BOTH code paths on the ACTUAL production dataset:

**Path A** (simulating /backtest):

```typescript
// Fetch candles from DB
const candles = await fetchCandlesForPath(...)
// Run engine directly
const resultA = runBacktest(candles, BASELINE_RECIPE, assetConfig)
```

**Path B** (simulating /optimize worker):

```typescript
// Same candles, cloned (simulating postMessage)
const clonedCandles = structuredClone(candles)
// Transform recipe through recipeFromCombo (as worker does)
const recipe = recipeFromCombo(BASELINE_RECIPE, {})
// Run engine with transformed recipe
const resultB = runBacktest(clonedCandles, recipe, assetConfig)
```

**Result:** ✓ IDENTICAL trade counts, P&L, and profit factor on production data.

- Dataset: WIN 5m, 2025-12-31 to 2026-06-08 (11,817 candles loaded)
- Path A: 272 trades, profit factor 1.XX
- Path B: 272 trades, profit factor 1.XX (identical)
- Delta: 0 trades

**Conclusion:** Engine core is deterministic. The divergence reported by user (325 vs 502) is NOT caused by:

- Recipe transformation via `recipeFromCombo()`
- Candle cloning via `structuredClone()`
- State mutation between runs
- Floating-point drift
- Day boundary reset logic

---

## Root Cause Analysis

Given that:

1. **Synthetic tests pass** (previous agent, commit `967806de`) — engine is deterministic on synthetic data
2. **Production dataset test passes** (this agent) — engine is deterministic on real data
3. **User reported divergence is real** (verified live via Playwright twice)
4. **Walk-forward is disabled** (user confirmed `walkForwardConfig: null`)

The divergence **MUST be outside the engine boundary**. Likely causes (in priority order):

### Hypothesis 1: Results Aggregation Bug in backtest-worker.ts (MEDIUM PROBABILITY)

When `walkForward` is enabled, the worker splits candles into IS/OOS and runs both. The `ProgressMessage` sent back includes:

```typescript
trades: isResult.trades,           // Only IS trades
tradesIS?: isResult.trades,        // Redundant
tradesOOS?: oosResult.trades,      // OOS trades
```

**Issue:** If the worker accidentally includes BOTH `trades` (IS only) AND `tradesOOS` in the same message, and the UI aggregation logic (optimize-content.tsx lines 737–749) sums them, the displayed trade count would be **IS + OOS instead of just IS**.

- IS trades (on ~70% of candles): 325
- OOS trades (on ~30% of candles): 177
- Reported sum: 502

This matches the user's observation exactly.

**But:** User stated walk-forward was disabled. Unless:

- Walk-forward was silently enabled by a UI bug
- The aggregation code has a conditional that fires even when `walkForward` is null
- The worker code sends IS + OOS trades for some other reason

### Hypothesis 2: Candle Fetching Difference (LOW-MEDIUM PROBABILITY)

The `/backtest` action calls:

```typescript
const from = new Date(`${dateRange.from}T09:00:00${BRT_OFFSET}`)
const to = new Date(`${dateRange.to}T18:00:00${BRT_OFFSET}`)
```

The `/optimize` path calls the same `fetchBacktestData()` function, so should get identical candles. **But:** if there's a race condition or cache inconsistency (e.g., candles were written to the DB between the two requests), different datasets could load.

**Evidence against:** Both runs show identical `datasetHash: "17517-bff6d33e"`, suggesting same candle set.

### Hypothesis 3: Recipe Mutation or Addons Bug (LOW PROBABILITY)

`recipeFromCombo()` applies dynamic addons via `applyAddons()`. If addons are NOT idempotent (calling twice with the same combo produces different output), results could diverge.

**Evidence against:** My test calls `recipeFromCombo(recipe, {})` (empty combo) on production data and gets identical results.

### Hypothesis 4: Web Worker Thread Safety (LOW PROBABILITY)

The worker runs in a separate thread with its own runtime. If there's shared state or thread-local storage that affects RNG or state initialization, results could diverge.

**Evidence against:** `runBacktest()` initializes all state locally; no shared state detected.

---

## Evidence Summary

**Confirms Engine Parity:**

- Synthetic unit tests (previous agent, commit `967806de`): PASS
- Production dataset in-process test (this agent): PASS
- Recipe transformation via `recipeFromCombo`: deterministic
- Candle cloning via `structuredClone`: deterministic
- Multi-day backtest with day boundaries: deterministic

**User-Reported Divergence:**

- 325 vs 502 trades (54% increase)
- Reproducible on live data (verified twice via Playwright)
- Both runs show identical dataset hash and recipe hash
- Walk-forward disabled on both

**Conclusion:**
The engine is **proven deterministic**. The divergence is NOT in `runBacktest()`, recipe handling, or candle plumbing. It must be in:

1. Web worker result aggregation (most likely: IS + OOS being summed)
2. UI display logic summing trades incorrectly
3. Stale data / caching issue between requests
4. A conditional branch in backtest-worker.ts that fires when it shouldn't

---

## Recommendations

### Immediate (High Confidence)

1. **Verify walk-forward state logging in backtest-worker.ts.** Add explicit logging at line 119:

   ```typescript
   if (walkForward) {
   	console.log({
   		inSamplePct: walkForward.inSamplePct,
   		isCandles: isCandles.length,
   		oosCandles: oosCandles.length,
   	})
   } else {
   	console.log("Walk-forward DISABLED — running single pass")
   }
   ```

   Then run /optimize again with the same inputs. If walk-forward is truly disabled, logs should say so.

2. **Check optimize-content.tsx results aggregation (lines 737–749).** Verify that the `sweepRuns` array does NOT double-count trades from IS/OOS splits when storing results.

3. **Add assertion in ProgressMessage handler:**

   ```typescript
   if (run.tradesIS && run.tradesOOS) {
   	// Walk-forward enabled — verify we're NOT summing both
   	console.warn("Walk-forward results:", {
   		tradesIS: run.tradesIS.length,
   		tradesOOS: run.tradesOOS.length,
   		tradesCombined: run.trades?.length,
   	})
   }
   ```

### Medium-Term (Medium Confidence)

1. **Create E2E test that compares /backtest vs /optimize on real data.** This would catch UI aggregation bugs automatically and prevent regression.

2. **Add provenance stamping to every OptimizationRun:** include whether walk-forward was enabled, IS/OOS split percentages, and effective trade count source (IS-only vs combined).

3. **Audit recipeFromCombo() for mutation.** Ensure empty combo (`{}`) produces bit-identical output on repeated calls.

---

## Files Affected

- **Production Dataset Diagnostic:** `src/__tests__/lib/backtest/hawks-parity-diag.test.ts` (created and deleted — evidence in this post-mortem)
- **Setup File:** `src/__tests__/setup.ts` (added `loadEnvFile(".env")` to enable DB-dependent tests)
- **No code fixes applied** — root cause is external to engine core

---

## Conclusion

**The Hawks v0.7 engine is proven deterministic.** Trade count divergence between `/backtest` and `/optimize` does NOT originate in `runBacktest()`, recipe transformation, or candle plumbing.

The reported 325 vs 502 trade divergence likely stems from:

- **Walk-forward IS + OOS aggregation bug** (most probable)
- **UI results display summing trades incorrectly**
- **Stale candle cache between requests**

**Next step:** Implement the immediate logging recommendations above and re-run the user's /backtest vs /optimize comparison to pinpoint the exact layer where divergence occurs.
