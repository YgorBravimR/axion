# Post-Mortem: E2E Live Trading Status Seed Bugs

**Date**: 2026-05-22  
**Branch**: `feat/hawks-mode-v0`  
**Files changed**: `e2e/utils/seed-trading-data.ts`, `e2e/tests/live-trading-status.spec.ts`

---

## Summary

Three independent seed bugs in `e2e/utils/seed-trading-data.ts` caused all live-trading-status E2E tests to fail. Each bug silently produced wrong values that were only visible at the UI assertion layer ("$0.00 instead of $500.00", "STOP TRADING badge instead of Gain Mode badge", etc.). The bugs existed because the seeder was never aligned with Phase 4b's R-multiples API changes.

---

## Bug 1: `BRAVO_DECISION_TREE` in cents format instead of R-multiples

### What broke

All "Next Risk" values displayed as `$0.00` in the live-trading-status panel. Every describe block with any Next Risk assertion was failing.

### Root cause

`adaptDecisionTree(tree, oneRCents)` in `src/lib/risk-profiles/cents-shape.ts` reads `tree.baseTrade.riskR`, `tree.cascadingLimits.weeklyLossR`, `tree.gainMode.dailyTargetR` (R-multiples format, Phase 4b). The seeder's `BRAVO_DECISION_TREE` constant was written in the old cents format: `riskCents: 50000`, `weeklyLossCents: 200000`, `dailyTargetCents: 150000`. When `adaptDecisionTree` read the R-multiple fields, they were all `undefined`. `Math.round(undefined * 50000) = NaN`. `fromCents(NaN)` returns `0` (explicit guard in `src/lib/money.ts:36-38`), so all risk values showed as `$0.00`.

### Fix

Updated `BRAVO_DECISION_TREE` to R-multiples: `riskR: 1`, `dailyTargetR: 3`, `weeklyLossR: 4`, `monthlyLossR: 15`. The canonical reference is `bravoTree` in `src/db/seed-risk-profiles.ts`.

### Why the fix self-heals stale DB rows

`ensureBravoRiskProfile()` always UPDATEs the existing profile with `decision_tree = JSON.stringify(BRAVO_DECISION_TREE)`. So fixing the constant fixes both new and pre-existing DB rows.

---

## Bug 2: `default_daily_loss_r` and `default_daily_win_r` wrong in yearly plan seed

### What broke

- Tests with 2+ non-breakeven trades that expected `shouldStopTrading = false` were seeing the STOP state.
- The "Gain Mode" phase badge was invisible (STOP state rendered instead).
- Recovery Step 2/3 badge was invisible (STOP state rendered instead).
- "Breakeven didn't change phase" test was failing.

### Root cause

The yearly plan INSERT had the two R values in the wrong positions:

```sql
-- Wrong (original):
default_daily_loss_r = 3.00,  -- gives dailyLossCents = 150000 (correct)
default_daily_win_r  = 2.00,  -- gives dailyTargetCents = 100000 (WRONG — should be 150000)
```

With `dailyTargetCents = 100000` (2R), two wins of $500 each (`dailyPnlCents = 100000`) hit the daily target at the after-loop check `dailyPnlCents >= dailyProfitTargetCents` → `shouldStopTrading = true`. Tests expected `shouldStopTrading = false`.

Additionally, the UPDATE path for existing yearly plans only updated `default_risk_profile_id` — it never corrected the R values, so stale DB rows from previous runs kept wrong values.

**Correct values**: Both thresholds must be `3.0` (3R = $1,500):

- `daily_loss_r = 3.0` → `dailyLossCents = 150000` → `maxTrades = Math.floor(150000/50000) = 3`, which allows the full 3-step Bravo recovery sequence.
- `daily_win_r = 3.0` → `dailyTargetCents = 150000`, matching the Bravo gain sequence's cumulative target.

### Fix

1. INSERT: changed both values to `3.00`.
2. UPDATE: added `default_daily_loss_r = 3.00` and `default_daily_win_r = 3.00` to the UPDATE statement so existing rows are self-corrected on next `seedScenario` call.

### Key insight: `maxTrades` coupling

`maxTrades = Math.floor(dailyLossCents / oneRCents)` is a derived field. With `dailyLossCents = 2R = $1000`, `maxTrades = 2`, stopping all 2-trade scenarios before their expected non-stopped state. Setting `dailyLossCents = 3R = $1500` gives `maxTrades = 3`, matching the Bravo recovery sequence depth.

---

## Bug 3: "Daily loss limit hit" test used wrong loss amounts

### What broke

The "Daily loss limit hit" describe block expected `stopReason = "dailyLossLimit"` but with the correct `dailyLossCents = 150000`, the original scenario (total −$1,100) never triggered the limit (−110000 > −150000).

### Root cause

The original test was written assuming `dailyLossCents = 100000` (2R). The scenario used T1: −70000, T2: −40000 = −110000 total, and the comment said "≤ −100000 → dailyLimitHit". Once the daily loss threshold was corrected to 150000 (3R), this scenario no longer triggered the limit.

### Fix

Updated the test scenario to use T1: −90000, T2: −70000 (total −160000 ≤ −150000 → triggers limit). Also updated the `dailyPnlCents` assertion from `fmtCurrency(-110_000)` to `fmtCurrency(-160_000)`. Updated `BRAVO.dailyLossCents` constant in the spec from `100_000` to `150_000`.

---

## Timeline of discovery

1. Session started with 23+ failures in `live-trading-status.spec.ts`.
2. Bug 1 (BRAVO_DECISION_TREE) was identified by tracing `$0.00` values through `fromCents(NaN) ← adaptDecisionTree(tree, oneRCents)` where `tree.baseTrade.riskR === undefined`.
3. After fixing Bug 1, a targeted run showed 1 failure remaining. A full-suite run revealed 5 failures.
4. Bug 2 was found by reading the playwright JSON reporter output: "Gain Mode" badge not found, but "Next Risk" value correct → panel was in STOP state → traced to `dailyTargetCents = 100000` triggering on `dailyPnlCents = 100000`.
5. Bug 3 was a consequence of fixing Bug 2 — the "daily loss limit" scenario test needed updating.

---

## Prevention

- The E2E seeder constants should be reviewed whenever `adaptDecisionTree` API changes. The canonical R-multiples format is in `src/db/seed-risk-profiles.ts`'s `bravoTree`.
- The UPDATE path in the seeder for plan rows must include ALL fields that affect test outcomes (R values, snapshot fields, profile link).
- When a `maxTrades` cap is relevant, verify that `Math.floor(dailyLossCents / oneRCents) ≥ (max expected trades per day)`.
