---

## [BUG-2026-06-22] Enrichment Library TypeScript Type Debt

**Date:** 2026-06-22
**Severity:** Medium
**Affected Area:**

- `src/lib/enrichment/actions/commit-trade-impl.ts` (line 67)
- `src/lib/enrichment/actions/save-draft-selections-impl.ts` (line 53)
- `src/lib/enrichment/passes/indicator-readout.ts` (line 94)
- `src/lib/enrichment/passes/operations.ts` (lines 104, 110, 118)

### Cause

Four unrelated type errors stemming from schema gaps and type inference mismatches:

1. **Nullable accountId:** The `trades.accountId` column in Drizzle schema lacks `.notNull()`, so TypeScript infers `string | null`. Authorization checks passed the nullable value directly to `authContext.allAccountIds.includes()`, which expects `string`.

2. **Untyped field records:** `Record<string, unknown>` assigned to variables that are structurally compatible with `Record<string, EnrichmentField<unknown>>` but not explicitly typed. TypeScript rejected the type mismatch despite correct runtime construction.

3. **Polymorphic input types:** The CSV parser can return mfe/mae as `string | number | null`, but the `checkAndAdd()` helper expects `number | null | undefined`. No explicit type narrowing before the call.

### Solution

1. **commit-trade-impl.ts & save-draft-selections-impl.ts:** Guard nullable `accountId` with `?? ""` coercion. Null accountId will never pass the `.includes()` check (treating null as empty string ensures consistent rejection).

2. **indicator-readout.ts:** Explicitly typed `fields` as `Record<string, EnrichmentField<unknown>>` via inline import to match return signature.

3. **operations.ts:** Added `EnrichmentField` import and explicitly typed `fields` record. Added type narrowing for mfe/mae: `typeof profitOperation.mfe === "string" ? Number(...) : ...` converts text-decimal input to number before passing to `checkAndAdd()`.

### Prevention

- **Schema enforcement:** Mark non-nullable columns in Drizzle with `.notNull()` at definition; use TypeScript strict mode to catch read-time null coercions.
- **Type narrowing:** When polymorphic CSV fields flow into type-strict contexts, narrow explicitly (e.g., `typeof x === "string"`) rather than relying on inference.
- **Field builders:** Use explicit type annotations on intermediate collections (`Record<string, T>`) when the final return type constrains them — this catches mismatches earlier.
