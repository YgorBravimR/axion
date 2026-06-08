# Post-Mortem: Hawks v0 Baseline Parity Bug (2026-06-08)

**Date:** 2026-06-08
**Severity:** High (177-trade divergence in optimization results)
**Affected Area:** `/backtest` (returns 325 trades) vs `/backtest/optimize` (returns 502 trades) on identical baseline

---

## Summary

The backtest and optimize pages diverged significantly when running the Hawks v0 strategy on the same dataset (WIN hawk_5m_win, 2026-01-01 → 2026-06-08, 17,517 candles, baseline configuration):

| Path                 | Trade Count | Profit Factor | P&L        |
| -------------------- | ----------- | ------------- | ---------- |
| `/backtest`          | **325**     | 1.52          | R$3,366.88 |
| `/backtest/optimize` | **502**     | 1.33          | R$3,553.46 |

**Difference:** 177 trades (54% divergence), causing the optimize page to misrepresent the baseline strategy performance.

---

## Root Cause

### The Missing Fields

The Hawks entry config schema was missing three tuning parameters that the engine reads:

- `fireCooldownBricks` (engine default: 5)
- `wave1MinBricks` (engine default: 4)
- `retracementMinBricks` (engine default: 2)

### How the Bug Manifested

**Path 1: /backtest (server action)**

1. User submits form with recipe based on `hawksV0` preset.
2. Server-side `runBacktestAction()` calls `backtestInputSchema.safeParse(input)`.
3. Zod schema does NOT list the three fields → Zod **silently strips them**.
4. Recipe reaches engine missing these three fields.
5. Engine falls back to hardcoded defaults: 5, 4, 2.
6. **Result: 325 trades** (using defaults 5, 4, 2).

**Path 2: /backtest/optimize (web worker)**

1. User loads same dataset and recipe.
2. OptimizeContent calls `deriveInitialSelections(HAWKS_LEAVES, recipe)`.
3. The function scans each leaf's path (e.g., `"entry.config.fireCooldownBricks"`).
4. The path doesn't exist in `hawksV0` preset.
5. Function falls back to `leaf.defaultMin` from `HAWKS_LEAVES` definition:
   - `fireCooldownBricks.defaultMin = 1`
   - `wave1MinBricks.defaultMin = 3`
   - `retracementMinBricks.defaultMin = 1`
6. These sweep-builder defaults are used as the baseline for the first run.
7. **Result: 502 trades** (using values 1, 3, 1 instead of 5, 4, 2).

### Why This Matters

These three parameters control the Hawks entry state machine:

- **fireCooldownBricks**: Minimum bricks between consecutive re-fires after a position closes. Lower = more aggressive re-entry, more trades.
- **wave1MinBricks**: Minimum impulse leg length. Lower = faster entry setup, more fires.
- **retracementMinBricks**: Minimum wave-2 bounce. Lower = looser trigger, more entries.

Lowering all three from (5, 4, 2) to (1, 3, 1) creates a much more trigger-happy engine. Hence the 177-trade surge.

---

## The Fix

### Change 1: Update Zod Schema

**File:** `src/lib/validations/backtest.ts` (lines 65–79)

Added three fields to `hawksTripleScreenConfigSchema`:

```typescript
fireCooldownBricks: z.number().int().min(1).max(50).optional(),
wave1MinBricks: z.number().int().min(1).max(50).optional(),
retracementMinBricks: z.number().int().min(1).max(50).optional(),
```

This ensures Zod doesn't strip these fields when the /backtest action validates the recipe.

### Change 2: Initialize Fields in Preset

**File:** `src/lib/backtest/presets/hawks-presets.ts` (lines 54–76)

Added the three fields to the `hawksV0` preset with values matching engine defaults:

```typescript
fireCooldownBricks: 5,
wave1MinBricks: 4,
retracementMinBricks: 2,
```

This ensures both code paths start from the same baseline. When /optimize calls `deriveInitialSelections`, it now reads these values from the preset instead of falling back to sweep-builder defaults.

### Change 3: Add Regression Test

**File:** `src/__tests__/lib/backtest/parity-hawks-baseline.test.ts`

Five tests verify:

1. The preset includes `fireCooldownBricks = 5`.
2. The preset includes `wave1MinBricks = 4`.
3. The preset includes `retracementMinBricks = 2`.
4. Sweep-derived baseline matches the preset (via `deriveInitialSelections`).
5. No fallback to sweep-builder defaults occurs.

---

## Verification

**Before Fix:**

- /backtest: 325 trades, PF 1.52, P&L R$3,366.88
- /optimize: 502 trades, PF 1.33, P&L R$3,553.46
- **Divergence: 177 trades**

**After Fix:**

- /backtest: 325 trades, PF 1.52, P&L R$3,366.88
- /optimize: 325 trades, PF 1.52, P&L R$3,366.88
- **Divergence: 0 trades** ✓

---

## Prevention

1. **Schema Completeness**: All engine-read fields must be listed in Zod schemas, not just "required" ones. Use `.optional()` if the field can be omitted.
2. **Preset Initialization**: Engine tuning parameters should always be explicit in presets, not rely on engine defaults. This makes the contract visible to clients (Zod, sweep builder).
3. **Parity Tests**: When a recipe is used in multiple contexts (server action, web worker), add a regression test that exercises both paths and asserts identical results for the same input.
4. **Type Guards**: The types already documented these fields were optional — the gap was in implementation (Zod schema vs. preset initialization).

---

## Files Modified

- `src/lib/validations/backtest.ts` — Added three fields to Zod schema.
- `src/lib/backtest/presets/hawks-presets.ts` — Initialized fields in `hawksV0` preset.
- `src/__tests__/lib/backtest/parity-hawks-baseline.test.ts` — New regression test (5 test cases).

---

## Related Code

- **Engine reads these fields:** `src/lib/backtest/modules/entry/hawks-triple-screen.ts:223–225`
- **Hardcoded defaults:** `src/lib/backtest/modules/entry/hawks-triple-screen.ts:100, 104, 105` (FIRE_COOLDOWN_BRICKS=5, etc.)
- **Sweep builder defaults:** `src/lib/backtest/presets/hawks-leaves.ts` (HAWKS_LEAVES definition)
- **Sweep-to-baseline mapping:** `src/lib/optimize/recipe-to-selections.ts:80–92` (fallbackValueForLeaf)
