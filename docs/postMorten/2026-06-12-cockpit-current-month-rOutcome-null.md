# Cockpit "Current Month" Card Shows Placeholder Values Despite Real Trades

**Date:** 2026-06-12  
**Severity:** High  
**Affected Area:** `/src/app/[locale]/(app)/plan/[year]/page.tsx` (lines 282–335), `/src/app/actions/trades.ts` (trade creation/update), `/src/lib/fractal-plan/r-snapshot.ts`, `/src/lib/fractal-plan/backfill-trades.ts`

## Cause

The Fractal Plan cockpit's "current month" card reads from `trades.rOutcome` to compute monthly real performance metrics (SALDO FINAL, +%, R real, Líq real). However, **`rOutcome` was never written by any trade save path** — only `realizedRMultiple` was populated on trade close.

The database schema (line 644–647 of `src/db/schema.ts`) explicitly states: `rOutcome = pnl / oneRSnapshotCents, populated on close`. But no code path implemented this write despite the utility function `computeROutcome` existing in `src/lib/fractal-plan/r-snapshot.ts` since its inception.

### Why This Bug Existed

- **Semantic confusion**: Two different R-based metrics were defined:
  - `realizedRMultiple = pnl / plannedRiskAmount` (per-trade actual risk vs planned risk)
  - `rOutcome = pnl / oneRSnapshotCents` (per-trade P&L against account-wide 1R at entry)
- The cockpit was built to read `rOutcome` (account-wide ladder 1R) because it aggregates monthly performance per the fractal plan ladder.
- The trade creation code was wired to compute `realizedRMultiple` but the developer never connected the dots to also compute `rOutcome`.
- The utility `computeROutcome` was implemented but never imported or called.

### Confirmed Impact

- **Hawk T2 Live account** (`42aab2ef-eabf-4069-a1b7-524820ce2937`)
- **June 2026**: 48 closed trades with `rOutcome=NULL`, `realizedRMultiple=NULL`
  - 22/48 trades have `oneRSnapshotCents=8000` (snapshot captured at entry)
  - 26/48 have `oneRSnapshotCents=NULL` (captured later via backfill)
  - All 48 have `pnl` populated with real P&L values
- **Symptom**: Cockpit card displayed:
  - SALDO FINAL: R$ 5.000,00 (= opening balance, zero movement)
  - +0.0% (should be +X%)
  - R real: +0.0R (should be +YR or -YR)
  - Líq real: R$ 0,00 (should be +Z or -Z)

## Solution

### A. Write `rOutcome` in All Trade Save Paths

**Files modified:** `/src/app/actions/trades.ts`

1. **Simple create** (createTrade, line 301–343): Added `computeROutcome({pnlCents, oneRSnapshotCents})` when both are present.
2. **Update** (updateTrade, line 700–718): When exitPrice is set, compute `rOutcome` from existing `oneRSnapshotCents` and new `pnl`.
3. **CSV import** (bulkCreateTrades, line 1406–1483): Compute `rOutcome` per trade when oneRSnapshotCents is captured.
4. **Scaled trade** (createScaledTrade, line 1718–1775): Compute `rOutcome` after capturing oneRSnapshotCents.

Import added: `import { captureROnEntry, computeROutcome } from "@/lib/fractal-plan/r-snapshot"`

### B. Extended Backfill Logic

**File modified:** `/src/lib/fractal-plan/backfill-trades.ts`

Changed the query predicate from `isNull(trades.oneRSnapshotCents)` to:

```sql
(oneRSnapshotCents IS NULL) OR (rOutcome IS NULL AND pnl IS NOT NULL)
```

This catches two cases:

1. Trades where oneRSnapshotCents was never captured (original backfill case)
2. Trades where oneRSnapshotCents exists but rOutcome was never computed (the bug)

The backfill now splits logic into two branches per row:

- **Case 1**: oneRSnapshotCents missing → capture from fractal plan + compute rOutcome
- **Case 2**: rOutcome missing but oneRSnapshotCents + pnl both exist → compute rOutcome directly

Used `isNotNull` from drizzle-orm for the NOT NULL check.

### C. Backfill for Affected Account

Run the backfill for Hawk T2 Live:

```bash
node --eval "
const { backfillTradesForAccount } = require('./src/lib/fractal-plan/backfill-trades.ts');
(async () => {
  const result = await backfillTradesForAccount({
    accountId: '42aab2ef-eabf-4069-a1b7-524820ce2937',
    dryRun: true
  });
  console.log('DRY RUN:', result);
  const real = await backfillTradesForAccount({
    accountId: '42aab2ef-eabf-4069-a1b7-524820ce2937',
    dryRun: false
  });
  console.log('RESULT:', real);
})();
"
```

Or invoke via an existing CLI/REPL entry point if available in the project.

## Prevention

1. **Type-level enforcement**: Add a constraint at the DB layer (or ORM middleware) that enforces: _"If pnl IS NOT NULL and oneRSnapshotCents IS NOT NULL, then rOutcome MUST NOT be NULL"_. Could be a CHECK constraint or a pre-insert trigger.

2. **Test coverage**: Add a unit test in the trade creation suite that verifies `rOutcome` is populated whenever `pnl` and `oneRSnapshotCents` are both present. Example:

   ```typescript
   it("computes rOutcome when pnl and oneRSnapshotCents are both set", async () => {
     const trade = await createTrade({..., pnl: 500, oneRSnapshotCents: 1000});
     expect(trade.rOutcome).toBe("0.50"); // pnl / oneRSnapshotCents
   });
   ```

3. **Documentation**: Document the semantics of `realizedRMultiple` vs `rOutcome` in the schema comments and in `docs/code-conventions.md` to prevent future confusion.

## Related Files

- `src/db/schema.ts` (line 644–647) — rOutcome column definition
- `src/app/[locale]/(app)/plan/[year]/page.tsx` (line 282–335) — cockpit aggregation logic
- `src/lib/fractal-plan/r-snapshot.ts` — utility functions
- `src/lib/fractal-plan/backfill-trades.ts` — backfill logic
- `src/app/actions/trades.ts` — all trade creation/update paths (4 locations patched)

## Additional Notes

- The bug was introduced when `rOutcome` was added to the schema but the trade creation code was never updated.
- `computeROutcome` existed as a utility since the fractal plan feature was built but was never imported.
- The cockpit aggregation logic correctly reads `rOutcome`, so the bug was purely a missing write, not a reading issue.
- All existing `realizedRMultiple` values remain unchanged; this fix adds a previously-missing sibling metric.
