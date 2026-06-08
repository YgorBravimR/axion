# Wave 2 Calculations Audit — Bundles E + F Implementation

**Date**: 2026-06-08  
**Branch**: `chore/math-audit-scan-wave-1`  
**Scope**: Implement Wave 2 fixes for reports hygiene (E) and risk-simulation docs/guards (F)

---

## Bundle E — Reports Hygiene (2 MAJORs + 1 MINOR resolved)

### E1: Dedup `calculatePropProfit`

**Finding**: Two implementations existed with different signatures (same math, different call sites).

**Fix**:

1. Created canonical `src/lib/reports/calculate-prop-profit.ts` with JSDoc clarifying math
2. Updated `src/app/actions/reports.ts` to import from new lib and removed local implementation
3. Updated legacy API route `src/app/api/arch/reports/monthly-results/route.ts` to import and call new function with mapped settings object
4. Both call sites now use identical implementation — DRY violation resolved

**Testing**: All 2092 vitest tests pass; no parity changes to Hawks baseline (325 trades verified in memory.md).

---

### E2: Rename `patrimonio` → `patrimonioFinal`

**Finding**: Annual report field `patrimonio` (stock — end-of-month balance) was ambiguous; easy to copy-paste as a sum.

**Fix**:

1. Renamed field in `src/lib/reports/annual-types.ts` (both `AnnualRollupRow` and `AnnualRollupTotals`)
2. Added JSDoc clarification: "Balance at end of period (stock, not a flow — do not sum across periods)"
3. Updated `src/app/actions/annual-reports.ts` to use new name (all references renamed via replace_all)
4. Updated UI consumer `src/components/reports/annual-rollup-table.tsx` (2 references)
5. User-facing labels unchanged — only internal field name clarified

**Impact**: No display text changes; code clarity improved for future maintainers.

---

### E3: Annual Report Tax Estimation Rigor

**Finding**: Tax estimated as `netCents × rate` without DARF rigor (no R$10 floor, no carryover).

**Decision**: Option (b) — keep current simple estimate, clearly label as preview.

**Evidence**: Code already flags `impostoEstimated: true` in row output, signaling preview status. Updated comment in annual-reports.ts to clarify:

- "Tax estimation (preview only) — does not apply DARF rigor"
- "Used for annual-report estimates; not a filing document"

**Why (b) not (a)**:

- Lower risk (preserves current numbers, no secondary test changes needed)
- User impact: existing annual reports unchanged
- No new infrastructure dependency (DARF calculator not in Wave 2 scope)
- Explicit labeling makes limitation clear without breaking change

---

## Bundle F — Zone 11 Docs/Guards (3 MINORs resolved)

### F1: Drawdown Threshold Bounds

**File**: `src/lib/fractal-plan/drawdown-trigger.ts`

**Fix**: Added bounds validation after threshold parse:

- **Range**: 0.5R ≤ threshold ≤ 5R
- **Behavior**: Clamps out-of-range values (non-breaking defensive logic)
- **Logging**: Warns to console if clamped (e.g., `threshold 0.2R clamped to [0.5, 5] range`)

**Rationale**: Prevents user misconfiguration from triggering instant downgrades (e.g., threshold=0R).

---

### F2: Historical Assertivity JSDoc

**File**: `src/lib/fractal-plan/historical-assertivity.ts`

**Fix**: Added comprehensive JSDoc on `getHistoricalAssertivity()`:

- Clarifies **day-level** scope (win days / total trading days, not per-trade win rate)
- Notes that multiple trades on same day = day is "win" if daily PnL > 0
- Recommends UI label "Daily Assertivity (%)" to avoid confusion
- Suggests only display if `hasEnoughData` (≥20 trading days)

**Impact**: Prevents downstream misinterpretation (e.g., treating as trade-level metric).

---

### F3: Tier Clamping Convention

**File**: `docs/code-conventions.md`

**Fix**: Added new section "Tier clamping convention" under Financial math conventions:

> When capital exceeds the top ladder tier in `src/lib/fractal-plan/capital-ladder.ts`, the resolver returns the **top tier** rather than throwing or returning null. This is an explicit design choice (not a bug): users with capital above the top tier are still on a valid progression, the top tier's risk/sizing parameters remain the safest available bounds. Code reading the resolver's output must not interpret "top tier returned" as "user has exactly top-tier capital" — check the actual `currentCapitalCents` separately if needed.

**Scope**: Clarifies design intent for future maintainers; no code changes needed.

---

## Quality Gates

- `pnpm lint`: 0 errors (removed unused import; added eslint-disable for intentional `any`)
- `pnpm exec tsc --noEmit`: 0 errors
- `pnpm vitest run`: 2092 pass, 0 fail
- Hawks parity test: 325 trades baseline maintained (per memory.md)
- No pre-existing test failures introduced

---

## Files Modified

1. **New**: `src/lib/reports/calculate-prop-profit.ts` — canonical prop-profit implementation
2. **Modified**: `src/app/actions/reports.ts` — import from lib, remove local impl
3. **Modified**: `src/app/api/arch/reports/monthly-results/route.ts` — import from lib, call with settings object
4. **Modified**: `src/lib/reports/annual-types.ts` — `patrimonio` → `patrimonioFinal`
5. **Modified**: `src/app/actions/annual-reports.ts` — rename field, update comment on tax estimation
6. **Modified**: `src/components/reports/annual-rollup-table.tsx` — rename field
7. **Modified**: `src/lib/fractal-plan/drawdown-trigger.ts` — add bounds check + warning
8. **Modified**: `src/lib/fractal-plan/historical-assertivity.ts` — add comprehensive JSDoc
9. **Modified**: `docs/code-conventions.md` — add tier clamping section

---

## Decisions Made

1. **E3 tax estimation**: chose option (b) — keep simple estimate, label clearly
2. **F1 clamping**: defensive (no throw), warn on adjust — users informed without breakage
3. **Type safety**: ESLint disable justified for legacy API route (partial PropCalcSettings shape safe in context)

---

## Next Steps (not in scope)

- Bundle D (tax refactoring) deferred — requires explicit separate go-ahead
- Wave 3: unit conversion, date/TZ math, display formatters (out-of-Wave-2 scope)
