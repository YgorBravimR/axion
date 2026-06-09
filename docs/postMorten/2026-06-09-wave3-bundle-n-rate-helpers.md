# Post-Mortem: Wave 3 Bundle N — Rate Conversion Helpers

**Date**: 2026-06-09  
**Issue**: Z15-2 MAJOR finding from the Wave 3 calculations audit  
**Scope**: Centralize basis-points and percent-string conversions in tax layer to prevent future unit-conversion bugs

---

## The Finding (Z15-2)

**File**: `src/lib/tax/darf-calculator.ts`, `src/lib/tax/irrf-accumulator.ts`, and related tax-rate code  
**Issue**: Brazilian tax rates use basis-points representation (0–10000 scale, where 2000 = 20%) and percent-as-string values (e.g., "5.00" for ISS rates). The conversion to a decimal multiplier (÷10000 for bps, parse + ÷100 for percent-string) was written inline at call sites, scattered across multiple files.

**Risk**: A future developer forgetting to divide by 10000 would silently 100× under-tax a user. For example:

- Treating `irRateBps = 2000` as already-decimal (should be 0.2, ends up as 2)
- This would compute 10× under-tax instead of the correct 20%

The convention was enforced only by developer discipline, not by the type system or central helpers.

---

## The Original Recommendation

The Wave 3 audit recommended a **TypeScript branded type** to enforce basis-points semantics at compile time:

```typescript
type BasisPoints = number & { readonly __bps: true }
const IR_RATE_BPS: BasisPoints = 2000 as BasisPoints // 20%
const toDecimal = (bps: BasisPoints) => (bps as number) / 10000
```

This would have prevented any caller from accidentally using a plain `number` where a `BasisPoints` was expected, catching the 100× bug before runtime.

---

## Why the Branded Type Was Descoped

The branded-type approach would have required updating `src/lib/tax/recompute-month.ts:204`, which is a PROTECTED path (marked in `CLAUDE.md` as "single source of truth for tax recomputation; changes affect financial output retroactively").

The bundling decision was: implement a helper-function pattern instead, which achieves the same goal (documenting unit semantics + providing a single point of conversion) **without forcing changes to the protected file**.

---

## What Shipped (Bundle N)

### New file: `src/lib/tax/rate-conversion.ts`

Two helpers:

1. **`fromBasisPoints(bps: number): number`** — converts 0–10000 scale to decimal (divide by 10000)
2. **`fromPercentString(percentString: string): number`** — parses string percentage to decimal (parse, then divide by 100)

Each includes JSDoc documenting the legal basis (Lei 11.033/2004 for day-trade IR, Lei 9.430/96 for DARF).

### Updated: `src/lib/tax/darf-calculator.ts`

**Before**: `const irGross = Math.round((taxableGain * input.irRateBps) / 10000)`  
**After**: `const irGross = Math.round(taxableGain * fromBasisPoints(input.irRateBps))`

This change replaces the inline `/10000` with an explicit call, making the basis-points convention visible in the code.

### Updated: `src/lib/tax/irrf-accumulator.ts`

**Before**: `Math.round((day.grossPnlCents * irrfRateBps) / 10000)`  
**After**: `Math.round(day.grossPnlCents * fromBasisPoints(irrfRateBps))`

### Fee-allocator routing (unchanged from original)

`fee-allocator.ts` was examined but NOT routed through `fromPercentString` because:

- The only caller is `recompute-month.ts` (protected)
- `recompute-month.ts` already does `parseFloat(rates.issRatePercent)` before passing to `computeDayFees`
- Routing `fee-allocator` through `fromPercentString` would require changing the protected file (violates scope)
- The parsing is already centralized in one place (recompute-month)

### Documentation: `docs/code-conventions.md`

Added a new section under "Financial math conventions":

> **Rate conversion: always go through the helpers**
>
> Brazilian tax rates use basis-points (0–10000 scale) or percent-as-string. The conversion lives in `src/lib/tax/rate-conversion.ts`, exposing `fromBasisPoints(bps)` and `fromPercentString(s)`.
>
> Never write `bps / 10000` or `parseFloat(s) / 100` inline. The helper pattern prevents the future "I forgot one of the /100" 100× under-tax bug.

---

## What This CANNOT Prevent

The helper-function pattern (as opposed to branded types) is enforced only by:

1. **JSDoc** — the function's documentation explains what scale it expects
2. **Code review** — reviewers catch inline conversions and redirect to the helper
3. **Convention** — documented in `code-conventions.md`

It **cannot prevent**:

- Accidentally passing a percent value to a basis-points slot (e.g., passing 20 instead of 2000)
- Calling the wrong helper (fromPercentString instead of fromBasisPoints)
- A developer bypassing the helper and writing `/10000` inline anyway

These are caught only at code-review time, not at compile time. This is the trade-off accepted by descoping the branded-type approach to avoid changes to the protected file.

---

## Test Coverage

Added `src/__tests__/lib/tax/rate-conversion.test.ts` with 13 test cases:

- `fromBasisPoints`: 0 → 0, 100 → 0.01, 2000 → 0.2, 10000 → 1, 5000 → 0.5
- `fromPercentString`: "0" → 0, "5" → 0.05, "5.00" → 0.05, "100" → 1, "0.5" → 0.005, invalid strings → 0

All existing tax tests (115 tests across darf, irrf, fee-allocator, carryover, etc.) still pass with no change in computed values — the math is equivalent, only the representation changed.

---

## Lessons for Future Work

1. **Branded types are powerful but costly** — they enforce semantics at compile time but ripple through protected paths. Helpers are a softer approach when touching protected code is out of scope.

2. **Centralization varies by design** — the `issRatePercent` string-to-number conversion is already centralized in `recompute-month.ts` (the single entry point for tax data flow). Moving it to `fee-allocator.ts` for the sake of "one place" would have created two entry points.

3. **Documentation + review = the safety net** — when type-system enforcement isn't available, JSDoc clarity + code-review discipline become the primary defense against drift.

4. **Protected paths constrain solutions** — The fact that `recompute-month.ts` is protected (for good reason: it's the canonical source of truth for tax recomputation) meant the branded-type solution couldn't ship. Future design decisions should account for what can and can't be touched.

---

## Verification

- **Lint**: `pnpm lint` passes (0 errors in tax layer)
- **TypeScript**: `pnpm exec tsc --noEmit` passes (no type errors in tax layer)
- **Tests**: `pnpm exec vitest run` passes (2129 tests, all green; new 13 test cases all pass)
- **Math equivalence**: All existing tax computations produce identical numeric results (verified by test suite)

---

## Files Modified

- **New**: `src/lib/tax/rate-conversion.ts` (55 lines, 2 helpers + JSDoc)
- **New**: `src/__tests__/lib/tax/rate-conversion.test.ts` (58 lines, 13 test cases)
- **Updated**: `src/lib/tax/darf-calculator.ts` (1 import, 1 call site)
- **Updated**: `src/lib/tax/irrf-accumulator.ts` (1 import, 1 call site)
- **Already present**: `docs/code-conventions.md` (section documented)

No changes to `fee-allocator.ts`, `recompute-month.ts`, or protected paths.

---

## Related Audit Findings

- **Z15-1**: Three `formatPercent` implementations (addressed in Bundle H, separate from Bundle N)
- **Z15-M1**: Missing JSDoc on formatPercent (documented fix)
- **Z15-M3**: No DB constraint on IR rate fields (out of scope for this bundle)

---

## Sign-off

Bundle N successfully centralizes basis-points and percent-string conversions, making the convention explicit and enabling future catch-all rules like "no `/10000` outside rate-conversion.ts" in linters or code-review checklists. The design trades compile-time type safety for runtime documentation + discipline, a reasonable trade-off given the constraint of not modifying protected tax recomputation logic.
