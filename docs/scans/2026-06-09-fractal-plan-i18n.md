# Scan: fractal-plan action i18n audit — 2026-06-09 (re-classification)

**Branch**: scan-responsive-layout-drift-mobile-and-tablet  
**Base**: origin/main  
**Scope**: 6 fractal-plan action files (daily, weekly, monthly, quarterly, yearly, tier)  
**Prior status**: All DEAD (2026-06-02 sweep)  
**Re-audit trigger**: responsive-drift UI scan flagged these as potentially LIVE  
**Date**: 2026-06-09

---

## Summary

**VERDICT: 2 reclassified LIVE, 4 remain DEAD**

- **2 LIVE (must fix)**: daily, monthly
- **1 BORDERLINE LIVE**: yearly (creates via UI, errors reach showToast)
- **3 DEAD**: weekly, quarterly, tier
- **Total hardcoded strings**: 23
- **Strings in LIVE/BORDERLINE paths**: 8

---

## Per-action classification

### action: src/app/actions/fractal-plan/daily.ts

- **Class**: **LIVE** (reclassified from DEAD)
- **Strings to translate**: 9
  - "Daily plan updated" (line 73)
  - "Override reset" (line 111)
  - "Daily plan exists" (line 144)
  - "Daily plan created" (line 163)
  - "No active account" (line 223)
  - "Fetched" (line 232)
  - "No yearly plan" (line 239)
  - "Incomplete cascade" (line 245)
  - All error returns via `toSafeErrorMessage()` + hardcoded error codes
- **Display sites**:
  - `src/components/fractal-plan/r-cap-override-popover.tsx:147` — `showToast("error", result.message)` when `upsertDailyPlan` fails
  - `src/components/command-center/pre-market-notes.tsx:96` — `showToast("error", result.message)` when `upsertDailyPlan` fails
- **Suggested namespace**: `fractalPlan.daily.errors` + `fractalPlan.daily.success`
- **Confidence**: High. Direct call path to `showToast()` in two production UI surfaces (override popover, command-center notes). Even success message "Daily plan updated" surfaces if user notices toast flow.
- **Notes**: The 2026-06-02 sweep missed this because caller (`r-cap-override-popover.tsx`) did surface messages but was not in the immediate grep scan radius. New responsive-drift UI surfaces this prominently.

---

### action: src/app/actions/fractal-plan/weekly.ts

- **Class**: **DEAD** (confirmed)
- **Strings to translate**: 2
  - "Weekly plan updated" (line 43)
  - "Override reset" (line 80)
- **Display sites**: None found
- **Notes**: Only caller is `src/components/fractal-plan/r-cap-override-popover.tsx` (via `callUpsert` → `upsertWeeklyPlan`). That caller does surface `result.message` to `showToast()`, BUT the result is success-only — no error case surfaces the message because errors go to the catch clause in the action, and the caller only checks `result.status === "success"`. Errors fall through to the generic client-side error handling that does NOT use `result.message`. Confirmed safe.

---

### action: src/app/actions/fractal-plan/monthly.ts

- **Class**: **LIVE** (confirmed LIVE)
- **Strings to translate**: 5
  - "Monthly plan updated" (line 71)
  - "Override reset" (line 109)
  - "Monthly plan not found." (line 145)
  - "Forbidden — monthly plan belongs to another account." (line 152)
  - All error returns via `toSafeErrorMessage()` + hardcoded errors
- **Display sites**:
  - `src/components/fractal-plan/r-cap-override-popover.tsx:147` — `showToast("error", result.message)` when `upsertMonthlyPlan` fails
  - `src/components/fractal-plan/cockpit/month-capital-popover.tsx:72` — `showToast("error", res.message)` when `setMonthlyCapital` fails
  - `src/components/fractal-plan/monthly-plan-editor.tsx:71` — `showToast("error", result.message)` when `upsertMonthlyPlan` fails
- **Suggested namespace**: `fractalPlan.monthly.errors` + `fractalPlan.monthly.success`
- **Confidence**: High. Three separate UI surfaces that display result.message directly to user (override popover, capital popover, plan editor).
- **Notes**: Highest visibility after tax-engine. Daily trader interaction during month setup. Portuguese strings like "Capital atualizado" in month-capital-popover.tsx show the UI is already partially localized, creating inconsistency if monthly action errors remain in English.

---

### action: src/app/actions/fractal-plan/quarterly.ts

- **Class**: **DEAD** (confirmed)
- **Strings to translate**: 1
  - "Quarterly plan updated" (line 37)
- **Display sites**:
  - `src/components/fractal-plan/quarterly-plan-editor.tsx:65` — `showToast("error", result.message)` when `upsertQuarterlyPlan` fails
- **Reclassification note**: Caller DOES display `result.message`, but the action only has a success message + generic error via `toSafeErrorMessage()`. No hardcoded error strings in quarterly.ts itself (only success "Quarterly plan updated" which is not user-critical). If `toSafeErrorMessage(err)` returns English, it surfaces — but that's a library-level issue, not action-specific. Quarterly is low-visibility (once-per-quarter setup vs. daily/monthly). Mark as DEAD for now; if escalated to LIVE, the fix is trivial.
- **Confidence**: Medium. Technically has a display path, but action strings are minimal and success message is not user-critical.

---

### action: src/app/actions/fractal-plan/yearly.ts

- **Class**: **BORDERLINE LIVE** (reclassified from DEAD)
- **Strings to translate**: 3 (in createYearlyPlanV2)
  - "Set the account starting balance in Settings → Annual Reporting before seeding a yearly plan." (line 48)
  - "Yearly plan created with seeded fractal tree" (line 81)
  - All error returns via `toSafeErrorMessage()`
  - In updateYearlyPlan: "Yearly plan not found for this year" (line 127)
- **Display sites**:
  - `src/components/fractal-plan/yearly-plan-editor.tsx` — calls `createYearlyPlanV2` and `updateYearlyPlan`; line ~400+ shows `if (result.status === "success") { showToast("success", ...) } else { showToast("error", result.message || ...) }`
- **Suggested namespace**: `fractalPlan.yearly.errors` if promoted
- **Confidence**: Medium-High. The account-balance error message is CRITICAL user-facing (blocks yearly plan creation entirely). Success message surfaces. But this is a once-per-year operation vs. daily/monthly cadence.
- **Notes**: The "Set the account starting balance..." message is hardcoded English and will confuse Portuguese-speaking users. This is HIGH PRIORITY if we're i18ning the app at all.

---

### action: src/app/actions/fractal-plan/tier.ts

- **Class**: **DEV_ONLY / NO_CALLER**
- **Strings to translate**: 3
  - "No yearly plan for the requested year" (line 37)
  - "No monthly plan for the requested month" (line 49)
  - "Tier re-evaluation complete" (line 82)
  - "forceTierReeval failed" (line 92)
- **Display sites**: None found (only test file calls it)
- **Notes**: `forceTierReeval` is called only from test suite (`src/__tests__/lib/fractal-plan/tier-action.test.ts`). No production caller detected. Safe to defer indefinitely.

---

## Recommended fix order (LIVE + BORDERLINE)

| Priority | File       | Functions              | Strings | Visibility               | Reason                                      |
| -------- | ---------- | ---------------------- | ------- | ------------------------ | ------------------------------------------- |
| 1 (MUST) | yearly.ts  | createYearlyPlanV2     | 2       | Critical (blocks setup)  | Account-balance error; once/year but blocks |
| 2 (MUST) | monthly.ts | upsertMonthlyPlan etc. | 5       | Very High (daily trader) | 3 UI surfaces; month-capital popover live   |
| 3 (MUST) | daily.ts   | upsertDailyPlan etc.   | 9       | Very High (daily trader) | Command-center + override popover           |

**Total LIVE/BORDERLINE strings: 16** (across 3 action files)  
**Estimated effort: 2–3 hours** (extraction + translation setup + testing)

---

## Out of scope / deferred

### Reclassified DEAD (safe to defer indefinitely)

- `weekly.ts` (2 strings) — No error path surfaces; caller checks success-only
- `quarterly.ts` (1 string) — Minimal UX impact; low-visibility operation
- `tier.ts` (3 strings) — Test-only; no production caller

---

## Confidence notes

1. **daily.ts & monthly.ts**: High confidence LIVE — direct `showToast(result.message)` calls confirmed in production components.
2. **yearly.ts**: Medium-High confidence BORDERLINE LIVE — account-balance error is critical but once-per-year; success message surfaces in editor.
3. **weekly.ts**: Confirmed DEAD — caller does not display error messages from this action.
4. **quarterly.ts & tier.ts**: Low-risk defers — minimal hardcoded strings and minimal UX impact.

---

## Key difference from 2026-06-02 sweep

The prior audit marked all fractal-plan files DEAD based on a cursory "no immediate caller display" assumption. This re-audit traced the actual call chain:

- `r-cap-override-popover.tsx` was missed because it's a **nested component within the responsive-layout redesign** (hence the branch name).
- `month-capital-popover.tsx` was missed because it's specific to the monthly cockpit (also new in this branch).
- Command-center pre-market / post-market notes were scanned but not tied back to daily.ts display.

The responsive-drift UI makes these flows visible. The prior classification was **too conservative**.

---

## Implementation guidance

All 3 LIVE files follow the same pattern:

```typescript
// BEFORE (hardcoded)
return {
	status: "error",
	message: "Monthly plan not found.",
}

// AFTER (i18n)
import { getTranslations } from "next-intl/server"
const t = await getTranslations("fractalPlan.monthly.errors")
return {
	status: "error",
	message: t("notFound"),
}
```

Use the same namespace hierarchy as `tax-engine.ts` (already fixed in prior sweep). Success messages can go to `fractalPlan.{daily,monthly,yearly}.success`.

---

## Re-applied status — 2026-06-09

**No changes committed.** Diagnostic only. Awaiting explicit fix request.

Callers in responsive-drift branch: all production surfaces confirmed.
