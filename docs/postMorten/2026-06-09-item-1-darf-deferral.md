# Post-Mortem: DARF Sub-Threshold Deferral Implementation (Lei 9.430/96 art. 68 §1°)

**Date**: 2026-06-09  
**Item**: Item #1 from Wave 1 math audit (Bundle D)  
**Status**: Shipped on branch `chore/math-audit-scan-wave-1`

## What Was Done

Implemented strict Lei 9.430/96 art. 68 §1° compliance for sub-R$10 DARF obligations. Previously, amounts below R$10 were zeroed (under-taxing slightly but acceptably for Axion's user base). The new implementation defers sub-threshold IR to the next month and accumulates until the cumulative crosses R$10.

## Architecture

### 1. `DarfInput` / `DarfOutput` Changes

- **Added to input**: `deferredIrInCents: number` — sub-threshold IR carried from prior months (≥ 0)
- **Added to output**: `deferredIrOutCents: number` — sub-threshold IR to carry to next month

### 2. Deferral Logic (` darf-calculator.ts`)

```
cumulativeIr = deferredIrInCents + (irGross - irrfCents)

if cumulativeIr > 0 AND cumulativeIr < R$10:
  darfDue = 0
  deferredIrOutCents = cumulativeIr
  belowMinimumThreshold = true
else:
  darfDue = cumulativeIr
  deferredIrOutCents = 0
  belowMinimumThreshold = false
```

Special cases:

- **Loss months**: `deferredIrOutCents = deferredIrInCents` (pass-through)
- **Prop accounts**: `deferredIrOutCents = deferredIrInCents` (pass-through); no IR calculated
- **Cumulative exactly at R$10**: DARF emitted, not deferred

### 3. Cross-Month Persistence (`recompute-month.ts`)

- Fetches prior month's `deferredIrCents` from `monthly_tax_ledger` (query with `.limit(1)`)
- Passes as `deferredIrInCents` to `computeDarf()`
- Persists current month's `deferredIrOutCents` in the output row

First month with no prior row: `deferredIrInCents = 0`

### 4. Schema Migration (`0020_hard_nitro.sql`)

Added `deferred_ir_cents` column to `monthly_tax_ledger`:

```sql
ALTER TABLE "monthly_tax_ledger" ADD COLUMN "deferred_ir_cents" bigint DEFAULT 0 NOT NULL;
```

Existing rows auto-populate with default 0 (no backfill needed).

## Test Coverage

### `darf-calculator.test.ts` (new test suite)

- Single month with sub-R$10 IR → deferred forward ✓
- Two-month chain: M1 defers 600, M2 has 800 → cumulative 1400 crosses R$10 → DARF emitted ✓
- Three-month chain: M1=400, M2=300, M3=500 → M3 cumulative=1200 → DARF emitted ✓
- Loss month preserves deferred balance (pass-through) ✓
- Prop account preserves deferred balance (pass-through) ✓
- Cumulative exactly at R$10 (1000 cents) → DARF emitted, not deferred ✓

All 6 new tests pass alongside 15 existing tests.

## Files Changed

1. `src/lib/tax/darf-calculator.ts` — deferral logic + JSDoc
2. `src/lib/tax/recompute-month.ts` — prior month fetch + deferral pass-through
3. `src/db/schema.ts` — added `deferredIrCents` column
4. `src/db/migrations/0020_hard_nitro.sql` — generated migration
5. `src/__tests__/lib/tax/darf-calculator.test.ts` — new test suite (6 tests)
6. `docs/backlog.md` — removed entry (shipped)
7. `docs/code-conventions.md` — updated DARF section

## Compliance & Audit Trail

The implementation satisfies art. 68 §1° of Lei 9.430/96:

> _Os valores não pagos, em razão do disposto neste artigo, serão adicionados ao imposto devido no período subseqüente, em que se atinja o valor mínimo._

Translation: "Unpaid amounts under the threshold shall be added to tax owed in the following period until the minimum is reached."

The `deferredIrCents` field on `monthly_tax_ledger` serves as the audit trail of deferred balances month-by-month.

## Known Limitations & Future Work

- **No UI panel for deferred balances**: The monthly tax ledger row persists `deferredIrCents`, but the dashboard doesn't surface it. Worth adding to the tax status card if traders want visibility into "next month owes X deferred from prior months."
- **No special handling for year-end**: If a trader has a deferred balance at Dec 31, it carries into Jan of the next year. This is correct per art. 68 but may warrant a year-boundary callout in the annual report.

## Regression Testing

- `pnpm vitest src/__tests__/lib/tax/darf-calculator.test.ts --run` — 21 tests pass ✓
- `pnpm lint` — 0 errors ✓
- `pnpm tsc --noEmit` — 0 new errors (pre-existing renko-pipeline failures remain) ✓
- `pnpm lint:strict` — checked (no new type issues in tax module) ✓

## Commits & PR

Single commit: `feat(tax): implement DARF sub-threshold deferral (art. 68 §1°, Item #1)`  
Branch: `chore/math-audit-scan-wave-1`  
Not pushed (awaiting sign-off per task requirements)
