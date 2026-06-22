---

## [BUG-2026-06-22] Hawks Dev Lab TypeScript Type Debt

**Date:** 2026-06-22
**Severity:** Medium
**Affected Area:** Hawks dev lab components and data actions

### Cause

The Hawks dev lab layer—used for visualization, inspection, and orchestration testing—had accrued type debt across four files due to API signature changes and incomplete narrowing of discriminated union types:

1. **hawks-engine-lab.tsx** (marker shapes): Lightweight-charts library removed support for `shape: "text"`. The `text` field is separate; shapes must be visual markers like `"circle"`.
2. **hawks-engine-lab-data.ts** (function signature): `processHawksPlaybookCandle` signature expanded from 6 to 10 parameters (added Keltner, SR, VWAP, and volume snapshot optionals), but the call site in the dev lab wasn't updated.
3. **hawks-isolation-charts.tsx** (discriminated union spread): TypeScript couldn't narrow the `State` discriminated union through the `if (state.name === "...")` guards when using object spread syntax (`{ ...state }`). The union members were being treated as unspreadable (`never`) type.
4. **hawks-isolation-data.ts** (Record type mismatch): Assigning `Record<string, unknown>` to `Record<string, number>` without narrowing the values to numeric types.

### Effect

- Build-time TypeScript strict mode (`pnpm lint:strict`) failed with 9 TS errors, blocking the push.
- None of these were runtime bugs—the code would have executed correctly since the logic paths were sound.

### Solution

1. **hawks-engine-lab.tsx** (lines 655, 662, 669): Replaced `shape: "text"` with `shape: "circle"` for all three marker definitions. The text label is still passed via the separate `text` field, so visual intent is preserved.

2. **hawks-engine-lab-data.ts** (line 800): Added four missing arguments to `processHawksPlaybookCandle` call with `null` defaults for Keltner, SR, VWAP, and volume snapshots (the dev lab doesn't compute these advanced indicators, unlike the production engine).

3. **hawks-isolation-charts.tsx** (lines 1254–1423): Removed intermediate variable assignments that confused TypeScript's type narrowing. Replaced object spreads with explicit object literals that TypeScript could type-check against the narrowed union member (e.g., when `state.name === "cooldown"`, reconstruct the full `{ name: "cooldown", side, bricksLeft, level }` object instead of spreading).

4. **hawks-isolation-data.ts** (line 221): Added a type check and coercion when merging indicator values from the daily anchor payload: `typeof v === "number" ? v : 0` ensures all merged values are numbers, matching `c.indicators: Record<string, number>`.

5. **hawks-isolation-charts.tsx** (line 1556): Added non-null assertion (`values[i]!`) for array access; TypeScript's strict array indexing rules flag potential `undefined`, but the loop invariant guarantees `i < values.length`.

### Prevention

- Keep discriminated union narrowing explicit; explicit object literals are more type-safe than spread syntax for unions.
- When updating library/function signatures, search for all call sites (not just the primary one) and verify they match.
- Use `pnpm lint:strict` in pre-commit or CI to catch type debt before merging.

### Related Files

- `/src/components/dev/hawks-engine-lab.tsx`
- `/src/components/dev/hawks-isolation-charts.tsx`
- `/src/app/actions/hawks-engine-lab-data.ts`
- `/src/app/actions/hawks-isolation-data.ts`
