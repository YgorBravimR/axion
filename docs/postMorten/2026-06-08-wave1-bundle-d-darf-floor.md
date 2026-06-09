# Wave 1 Calculations Audit — Bundle D (R$10 DARF Floor)

**Date**: 2026-06-08
**Branch**: `chore/math-audit-scan-wave-1`
**Scope**: Apply Lei 9.430/96 art. 68 minimum filing threshold in `darf-calculator.ts` without touching the protected `recompute-month.ts`

---

## Background

The Wave 1 calculations audit (`docs/scans/calculations-audit/08-tax-computations.md`) flagged Brazilian DARF computation as 95% compliant. The one gap: Lei 9.430/96 art. 68 establishes a R$10.00 minimum filing threshold — DARF is only required when monthly IR owed is ≥ R$10.00 — and `darf-calculator.ts` was returning `darfDue` regardless of magnitude.

The audit categorized this as a "Minor discrepancy [that] does not affect financial correctness, but output semantics could be tightened" because the downstream consumer `recompute-month.ts` derives an `exempt` status flag when `darfDueCents === 0`. In practice, however, sub-R$10 cases produced `darfDue` values like 500 cents (R$5.00), which downstream would surface as `pending` status rather than `exempt` — directly contradicting Receita Federal's no-DARF-below-R$10 rule.

Bundle D was deferred from Wave 1 implementation because `recompute-month.ts` sits on the CLAUDE.md protected paths list. The user authorized explicit go-ahead on 2026-06-08 with the qualifier that only `darf-calculator.ts` would be modified.

---

## Root Cause

`darf-calculator.ts:61` (pre-fix):

```ts
const darfDue = Math.max(0, irGross - input.irrfCents)
```

The IRRF-offset operation was the final transformation. No threshold check was applied. The function's contract was "return whatever IR is owed net of withholdings, never negative" — but the legal contract is "return whatever IR is owed net of withholdings AND ≥ R$10 filing threshold, never negative".

The downstream consumer's "exempt" derivation relied on the calculator to zero out sub-threshold amounts (which it didn't), creating a silent semantic mismatch between layers.

---

## Fix

### `src/lib/tax/darf-calculator.ts`

1. Added `DARF_MINIMUM_FILING_CENTS = 1000` constant with inline citation to Lei 9.430/96 art. 68 and explicit note that art. 68 §1° deferral is NOT implemented (deferred to backlog).
2. Added `belowMinimumThreshold: boolean` field to `DarfOutput` so consumers can distinguish "no tax owed at all" (`darfDue=0`, `belowMinimumThreshold=false`) from "owed but below filing threshold" (`darfDue=0`, `belowMinimumThreshold=true`).
3. Replaced single-line `darfDue` calculation with a two-step:
   - `irNetOfIrrf = max(0, irGross - irrfCents)` (intermediate, identical to old behavior)
   - Apply threshold: zero out when `0 < irNetOfIrrf < 1000`; pass through otherwise
4. Updated JSDoc to cite Lei 9.430/96 art. 68 and document the new field's semantics.

The protected `recompute-month.ts` was NOT modified. Its existing `darfDueCents === 0 → status: exempt` derivation now fires correctly for sub-threshold months automatically, because the calculator now zeroes those cases.

### `src/__tests__/lib/tax/darf-calculator.test.ts`

1. Updated the pre-existing "IRRF exceeds IR gross" test to assert the new floor behavior (the net-50 case now floors to 0 with `belowMinimumThreshold=true`).
2. Added a new `describe("R$10 minimum filing threshold")` block with 8 cases:
   - Constant export check (`DARF_MINIMUM_FILING_CENTS === 1000`)
   - Just below R$10 (999 cents → floored)
   - Exactly at R$10 (1000 cents → preserved)
   - Just above R$10 (1001 cents → preserved)
   - IRRF brings amount below threshold (irGross 1500 − irrf 600 = 900 → floored)
   - IRRF brings amount exactly to threshold (irGross 2000 − irrf 1000 = 1000 → preserved)
   - Prop account passthrough (belowMinimumThreshold stays false)
   - Loss month passthrough (belowMinimumThreshold stays false)

---

## Why we did not implement full art. 68 §1° deferral

Lei 9.430/96 art. 68 §1° text: _"Os valores não pagos, em razão do disposto neste artigo, serão adicionados ao imposto devido no período subseqüente, em que se atinja o valor mínimo."_

Strict compliance requires sub-threshold amounts to be **deferred** across months until the cumulative figure crosses R$10, at which point the next eligible month emits a DARF for the accumulated total. We are NOT implementing this in Bundle D because:

1. **Protected path crossing**: deferral requires reading + writing a `deferredIrCents` balance per month, which means `recompute-month.ts` (PROTECTED) plus a new DB column on `monthly_darf_status`. The user explicitly scoped this bundle to `darf-calculator.ts`.
2. **Small practical impact**: sub-R$10 day-trade months are rare (only occur when carryover almost-but-not-quite offsets a small gain).
3. **Direction of error favors the user**: our current implementation under-taxes by at most ~R$9 per month; it never over-files or asks the user to pay tax they don't owe. Strict deferral would catch the missing R$9, but the asymmetric risk of over-filing under naive deferral is higher than the asymmetric risk of slight under-taxation under flooring.
4. **Not a filing tool yet**: Axion currently surfaces DARF estimates for user visibility, not Receita-ready filing documents. Strict deferral matters once filing-grade output ships.

The deferral upgrade is filed as a P3 backlog entry: `docs/backlog.md` → "DARF sub-threshold deferral (Lei 9.430/96 art. 68 §1°)".

---

## Quality Gates

- `pnpm exec vitest run`: 2100 pass, 0 fail (+8 from the new threshold tests on top of the 2092 baseline established by Bundles E + F).
- `pnpm exec tsc --noEmit`: 0 errors.
- `pnpm lint`: 0 errors, 9 warnings (all pre-existing, none in tax code).
- `recompute-month.ts` (PROTECTED) untouched — confirmed via `git status` showing only `darf-calculator.ts`, `darf-calculator.test.ts`, `code-conventions.md`, `backlog.md`, `MASTER.md`, and the post-mortem in the diff.

---

## Files Modified

1. `src/lib/tax/darf-calculator.ts` — added constant, field, threshold logic, JSDoc
2. `src/__tests__/lib/tax/darf-calculator.test.ts` — updated 1 case, added 8 new
3. `docs/code-conventions.md` — added "R$10 DARF minimum filing floor" section under Financial math conventions
4. `docs/backlog.md` — added P3 entry "DARF sub-threshold deferral" under new "Tax & Compliance" section
5. `docs/scans/calculations-audit/MASTER.md` — marked Bundle D as SHIPPED with status + known-simplification notes
6. `docs/postMorten/2026-06-08-wave1-bundle-d-darf-floor.md` — this file

---

## Lessons

1. **Protected paths don't preclude correctness improvements**: the protected file's contract was based on a calculator-side assumption (`darfDueCents === 0 → exempt`) that the calculator wasn't enforcing. Tightening the upstream side made the downstream side correct without touching it.
2. **Document the known simplification at every layer**: the deferral gap is flagged in the calculator (inline comment), the conventions doc (Financial math section), the audit ledger (MASTER.md), and the backlog (P3 entry). Four layers of cross-reference make it impossible to lose the trail.
3. **The audit was right about the diagnostic and slightly wrong about the impact**: the audit said the downstream "exempt" derivation was correct in the R$5 case, but reading `recompute-month.ts:248-249` shows it gates on `darfDueCents === 0` — which the R$5 case was NOT. Without the calculator-side floor, the downstream produced `pending` status for sub-R$10 months. Bundle D's fix makes the audit's optimistic claim actually true.
