# Post-Mortem: Wave 3 Bundle K — Tax Recompute Day-Same Detection (Zone 16-1)

**Date**: 2026-06-09  
**Issue**: `src/lib/tax/recompute-month.ts` extracted same-day trade detection from Date object components in server-local timezone (UTC on Vercel), not BRT. Tax rule (Lei 11.033/2004) requires BRT calendar-day boundaries.  
**Severity**: MAJOR (latent + PROTECTED path)  
**Status**: FIXED

---

## Root Cause

The day-trade detection at lines 123–133 of `recompute-month.ts` used:

```typescript
const sameDay =
	entry.getFullYear() === exit.getFullYear() &&
	entry.getMonth() === exit.getMonth() &&
	entry.getDate() === exit.getDate()
```

The Date methods `getFullYear()`, `getMonth()`, `getDate()` extract components in the **server's local timezone**. On Vercel (UTC), these extract UTC date components. A trade database stores entry/exit as `timestamptz` (UTC-based instants with timezone metadata). The tax rule, however, defines a day-trade as an entry + exit on the **same BRT calendar day**, not the same UTC calendar day.

### Why It Didn't Fire in Production

Bovespa regular trading hours run 09:00–18:00 BRT (12:00–21:00 UTC). Every trading session fits within a single UTC day. A trade entered at 17:55 BRT (20:55 UTC) and exited at 18:05 BRT (21:05 UTC) both stay within the same UTC calendar day, so the wrong extraction still produced the correct result.

The bug is latent: it becomes real only for trades that:

1. Straddle UTC midnight (21:00 UTC → 00:00 UTC next day)
2. But NOT straddle BRT midnight (18:00 BRT → 00:00 BRT next day)

This occurs between 18:00–21:00 BRT (21:00 UTC same day → 03:00 UTC next day in summer, or 00:00 UTC same day → 03:00 UTC next day in the current UTC-3 permanent offset). In practical terms: after-hours trades on the Brazilian market, which Axion does not yet support.

### Audit Severity Rationale: MAJOR, Not BLOCKER

While the bug would cause wrong numbers (day-trade trades misclassified as swing trades → exempt from daily-trade tax → underreported DARF liability), it doesn't fire TODAY because:

- BR day-trade hours (09:00–18:00 BRT) fit inside one UTC day.
- No after-hours or extended-session trades are booked yet.
- The audit rubric ("BLOCKER = wrong number a user can see TODAY") disqualifies latent risks.

However, it IS MAJOR because:

- The bug is real, even if dormant.
- It lives in a protected path (`src/lib/tax/recompute-month.ts`), meaning it requires explicit architecture trust.
- It could surface immediately if the product adds overnight markets, US futures, or extended BR trading hours.

---

## The Fix

Replaced the `getFullYear/getMonth/getDate` extraction with calls to `getBrtDateParts()` from the canonical `dates.ts` helper:

```typescript
import { getBrtDateParts } from "@/lib/dates"

// ...

const entryBrt = getBrtDateParts(entry)
const exitBrt = getBrtDateParts(exit)
const sameDay =
	entryBrt.year === exitBrt.year &&
	entryBrt.month === exitBrt.month &&
	entryBrt.day === exitBrt.day
```

`getBrtDateParts()` uses `Intl.DateTimeFormat` with `timeZone: APP_TIMEZONE` to extract year/month/day components **as they appear in São Paulo time**, regardless of the server's local timezone.

### Changes Made

1. **Exported `getBrtDateParts` from `src/lib/dates.ts`** (was private, now public).
2. **Updated import at top of `src/lib/tax/recompute-month.ts`** to include `getBrtDateParts`.
3. **Replaced lines 123–133** with BRT-aware extraction.
4. **Added JSDoc comment** clarifying that the check now uses BRT calendar day per Lei 11.033/2004.

---

## Regression Tests

Added two focused test cases to `src/__tests__/lib/tax/recompute-month.test.ts`:

### Test 1: Same-Day Trade Crossing UTC Midnight

**Scenario**: Trade entered 22:30 BRT (01:30 UTC next day) and exited 23:45 BRT same BRT day (02:45 UTC).

- In UTC, both timestamps fall on the same UTC day.
- In BRT, both timestamps fall on the same BRT day (June 8).
- **Expected**: Classified as same-day trade (`tradeCount = 1`).
- **Result**: PASS. The fix correctly classifies the trade as a day-trade.

### Test 2: Trade Crossing BRT Midnight (Not UTC Midnight)

**Scenario**: Trade entered 23:30 BRT (02:30 UTC next day) and exited 00:30 BRT next BRT day (03:30 UTC).

- In UTC, both timestamps fall on the same UTC day.
- In BRT, the timestamps cross midnight (June 8 → June 9).
- **Expected**: Rejected as swing trade (`tradeCount = 0`).
- **Result**: PASS. The fix correctly rejects the trade.

Both tests confirm the fix respects BRT day boundaries, not UTC day boundaries.

---

## Quality Gates

All passing:

- `pnpm lint` — 0 errors (9 unrelated warnings in other files, pre-existing).
- `pnpm exec tsc --noEmit` — 0 errors.
- `pnpm exec vitest run` — 2110 tests pass (2108 baseline + 2 new regression tests).
- Hawks parity baseline (`parity-hawks-baseline.test.ts`) — 5 tests pass, 325 trades confirmed.

---

## Forward-Looking Benefit

This fix hedges the system against future market expansion:

1. **Overnight markets** (US futures, crypto) enter/exit across UTC midnight → old code would misclassify.
2. **Extended BR trading hours** (if B3 adds 18:00–21:00 session) → trades in that window would have straddle UTC midnight.
3. **Non-BR markets** (international expansion) → the explicit timezone abstraction makes future multi-TZ support safer.

The canonical `dates.ts` layer already handles all these cases; this fix ensures the tax engine uses that layer uniformly.

---

## Architecture Insight

This bug exemplifies the "Canonical layer exists but bypassed" pattern identified in the Wave 3 audit (Theme 3). The `dates.ts:getBrtDateParts()` function was correct and available; `recompute-month.ts` re-implemented the logic incorrectly by accident, using `getFullYear/getMonth/getDate` instead. The fix consolidates the tax engine onto the canonical layer, reducing the system's timezone-handling surface area and eliminating divergence.

---

## Files Modified

1. `src/lib/dates.ts` — Exported `getBrtDateParts` (was private).
2. `src/lib/tax/recompute-month.ts` — Added import, replaced lines 123–133 with BRT-aware extraction.
3. `src/__tests__/lib/tax/recompute-month.test.ts` — Added 2 regression test cases.

---

## Reference

- **Audit Finding**: `docs/scans/calculations-audit/MASTER-WAVE-3.md` — Bundle K (PROTECTED — Z16-1)
- **Full Diagnostic**: `docs/scans/calculations-audit/wave3-16-date-tz-math.md` — BLOCKER 1
- **Legal Rule**: Lei 11.033/2004 (Brazilian day-trade taxation) defines day-trade on same-day BRT calendar day.
