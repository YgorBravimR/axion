# Scan: server-action error i18n sweep — 2026-06-02 (round 2)

**Branch**: feat/optimize-phase-1-trust-foundations  
**Base**: origin/main  
**Scope**: 18 action files identified by Phase 0 detector  
**Methodology**: per-action caller trace to determine display path  
**Date**: 2026-06-02

## Summary

- **18 action files audited**
- **6 classified MUST_FIX** (with ~40 strings to translate)
- **7 classified DEAD** (no display path — confirmed safe to defer)
- **4 classified DEV_ONLY or NO_CALLER**
- **1 already translating correctly** (annual-reports.ts)

---

## Per-action classification

### action: src/app/actions/tax-engine.ts

- **Class**: MUST_FIX
- **Strings to translate**: 12
- **Display sites**:
  - `src/components/fractal-plan/cockpit/month-darf-row.tsx:70` — `showToast("error", result.message ?? ...)`
  - `src/components/fractal-plan/cockpit/tax-tab.tsx:73` — `showToast("error", result.message)`
  - `src/components/fractal-plan/cockpit/tax-tab.tsx:89` — `showToast("error", result.message)`
  - `src/components/reports/month-closing-section.tsx:93` — `showToast("error", result.message ?? ...)`
- **Suggested namespace**: `tax.errors`
- **Notes**: All 6 exported functions (`getMonthlyDarf`, `getCarryoverState`, `recomputeLedger`, `getYearTaxSummary`, `getEffectiveTaxRate`, `markDarfPaid`) have hardcoded English messages reaching end-user UI. High impact — daily user workflow (tax cockpit).

### action: src/app/actions/filter-presets.ts

- **Class**: DEAD
- **Strings to translate**: 10
- **Display sites**: None found
- **Notes**: All 3 exported functions (`listFilterPresets`, `createFilterPreset`, `updateFilterPreset`, `deleteFilterPreset`) return error messages, but no caller displays `result.message`. Only caller is `src/components/analytics/preset-selector.tsx` — confirmed it does NOT use the message.

### action: src/app/actions/trading-conditions.ts

- **Class**: MUST_FIX
- **Strings to translate**: 9
- **Display sites**:
  - `src/components/settings/condition-form.tsx:94` — `setError(result.message ?? ...)`
  - `src/components/playbook/conditions-scorecard.tsx:112` — `setError(result.message || ...)`
- **Suggested namespace**: `conditions.errors`
- **Notes**: 4 exported functions (`createCondition`, `updateCondition`, `getConditions`, `deleteCondition`) have hardcoded messages. Medium impact — settings/playbook UI.

### action: src/app/actions/ocr-import.ts

- **Class**: MUST_FIX
- **Strings to translate**: 7
- **Display sites**:
  - `src/components/journal/ocr-import.tsx:401` — `showToast("success", result.message)`
  - `src/components/journal/ocr-import.tsx:404` — `showToast("error", result.message)`
- **Suggested namespace**: `import.errors`
- **Notes**: 4 exported functions (`createTradeFromOcr`, `bulkCreateTradesFromOcr`, `validateAsset`, `extractTradesWithVision`). User-facing import flow.

### action: src/app/actions/trade-conditions.ts

- **Class**: DEAD
- **Strings to translate**: 4
- **Display sites**: None found (internal to trade create/edit flow, caller does not surface message)
- **Notes**: 2 exported functions (`setTradeConditions`, `getTradeConditions`). Confirmed callers in `src/app/actions/trades.ts` do not display errors to user.

### action: src/app/actions/bug-reports.ts

- **Class**: DEAD
- **Strings to translate**: 4
- **Display sites**: None found (admin-only, internal error handling)
- **Notes**: 4 exported functions (`submitBugReport`, `getBugReports`, `updateBugReportStatus`, `getBugReportDetail`). Admin-only callers in pages swallow messages.

### action: src/app/actions/equity-shield.ts

- **Class**: MUST_FIX
- **Strings to translate**: 3
- **Display sites**:
  - `src/app/[locale]/(app)/risk/shield/page.tsx` — Error page rendering
- **Suggested namespace**: `risk.errors`
- **Notes**: 2 exported functions (`runEquityShieldFromDb`, `getEquityShieldPreview`). Specialized feature, moderate visibility.

### action: src/app/actions/renko-pipeline.ts

- **Class**: DEV_ONLY
- **Strings to translate**: 2
- **Display sites**: Only `src/components/dev/debug-renko-pipeline.tsx` (dev component)
- **Notes**: 1 exported function (`regenerateRenkoBricks`). Dev-only tool — safe to defer per project policy.

### action: src/app/actions/inspector-data.ts

- **Class**: NO_CALLER
- **Strings to translate**: 2
- **Display sites**: None found
- **Notes**: 2 exported functions (`getInspectorWindow`, `getOverviewRange`). No callers detected in current codebase. Likely orphaned.

### action: src/app/actions/hawks-audit-debug.ts

- **Class**: DEV_ONLY
- **Strings to translate**: 2
- **Display sites**: Only dev/debug pages
- **Notes**: 1 exported function (`runHawksAuditDebug`). Admin-only audit tool — safe to defer.

### action: src/app/actions/csv-import.ts

- **Class**: MUST_FIX
- **Strings to translate**: 2
- **Display sites**:
  - `src/components/journal/csv-import.tsx:388` — `showToast("success", result.message)`
  - `src/components/journal/csv-import.tsx:391` — `showToast("error", result.message)`
- **Suggested namespace**: `import.csv.errors`
- **Notes**: 2 exported functions (`validateCsvTrades`, `importCsvTrades`). User-facing import flow.

### action: src/app/actions/candle-query.ts

- **Class**: NO_CALLER
- **Strings to translate**: 2
- **Display sites**: None (query engine used only by chart internals, errors logged not displayed)
- **Notes**: 4 exported functions. Internal chart library — no user-facing display.

### action: src/app/actions/annual-reports.ts

- **Class**: TRANSLATING_CORRECTLY
- **Strings to translate**: 0
- **Display sites**: Already using `getTranslations()` server-side
- **Notes**: 3 exported functions. Good example of correct pattern — uses `t()` directly from `getTranslations()` at action time.

### action: src/app/actions/hawks-coaching.ts

- **Class**: NO_CALLER
- **Strings to translate**: 1
- **Display sites**: None (error swallowed or handled upstream)
- **Notes**: 1 exported function (`getHawksCoachingInsights`). Callers do not display the message.

### action: src/app/actions/coaching.ts

- **Class**: DEAD
- **Strings to translate**: 0 (no hardcoded messages)
- **Display sites**: None
- **Notes**: 1 exported function (`getCoachingContext`). Caller handles errors gracefully.

### action: src/app/actions/fractal-plan/yearly.ts

- **Class**: DEAD
- **Strings to translate**: 2
- **Display sites**: None (caller in page catches and handles)
- **Notes**: Not in Phase 0 tally but referenced in monthly/quarterly. Callers swallow errors.

### action: src/app/actions/fractal-plan/tier.ts

- **Class**: DEAD
- **Strings to translate**: 2
- **Display sites**: None (internal, tier-to-month cascade)
- **Notes**: Caller handles errors upstream.

### action: src/app/actions/fractal-plan/monthly.ts

- **Class**: DEAD
- **Strings to translate**: 2
- **Display sites**: None (cascade, errors handled)
- **Notes**: Internal tier-month pipeline.

---

## Recommended fix order (MUST_FIX only)

Sort by impact: number of strings × visibility (daily trader exposure).

| #   | File                  | Strings | Visibility                    | Priority |
| --- | --------------------- | ------- | ----------------------------- | -------- |
| 1   | tax-engine.ts         | 12      | Very High (tax cockpit daily) | CRITICAL |
| 2   | ocr-import.ts         | 7       | High (import flow)            | HIGH     |
| 3   | csv-import.ts         | 2       | High (import flow)            | HIGH     |
| 4   | trading-conditions.ts | 9       | Medium (settings/playbook)    | MEDIUM   |
| 5   | equity-shield.ts      | 3       | Medium (risk feature)         | MEDIUM   |

**Total strings to translate: ~40** (across 5 action files)  
**Estimated effort: 3–4 hours** (strings + testing + i18n extraction)

---

## Out of scope / deferred

### Classified DEAD (safe to defer indefinitely)

- `filter-presets.ts` (10 strings) — No display path confirmed
- `trade-conditions.ts` (4 strings) — Internal to trade flow
- `bug-reports.ts` (4 strings) — Admin-only, errors swallowed
- `fractal-plan/yearly.ts` (2 strings) — Caller handles upstream
- `fractal-plan/tier.ts` (2 strings) — Internal pipeline
- `fractal-plan/monthly.ts` (2 strings) — Internal pipeline

### Classified DEV_ONLY (safe to defer per project policy)

- `renko-pipeline.ts` (2 strings) — Dev-only component
- `hawks-audit-debug.ts` (2 strings) — Admin audit tool

### Classified NO_CALLER (likely orphaned)

- `inspector-data.ts` (2 strings) — No current callers found
- `candle-query.ts` (2 strings) — Internal query engine
- `hawks-coaching.ts` (1 string) — Error swallowed by caller

### Already translating correctly

- `annual-reports.ts` — Uses `getTranslations()` server-side; all errors already localized ✓
- `coaching.ts` — No hardcoded messages

---

## Open questions

1. **`renko-pipeline.ts`**: Confirm whether dev-only status persists or if this moves to user-facing in Phase 2.
2. **`inspector-data.ts` / `candle-query.ts`**: Are these truly orphaned, or used by internal features not scanned? Recommend code audit before committing to "no caller" status.
3. **Fractal-plan tier/monthly/yearly files**: Consider extracting from the tally and treating as a cohesive internal pipeline — defer unless user-facing errors are exposed by a parent action.

---

## Implementation notes

- All `MUST_FIX` files follow the same pattern: hardcoded English strings in `return { status: "error", message: "..." }`.
- The fix for `tax-engine.ts` should be a template for others: import `getTranslations("namespace.errors")` at action time, use `t("key")` instead of hardcoded strings.
- Example from `annual-reports.ts` (already correct):
  ```typescript
  const t = await getTranslations("reports.capitalEventErrors")
  return { status: "error", message: t("invalidEventType") }
  ```
- All error messages that reach `showToast()`, `setError()`, or `setFormError()` are user-visible and **must** be translated.

---

## Re-applied status — 2026-06-02

All MUST_FIX items from this audit landed via the post-reset re-application:

| File                    | Returns wrapped                                          | Commit     |
| ----------------------- | -------------------------------------------------------- | ---------- |
| `tax-engine.ts`         | 12 (6 functions, 7 keys; accountNotFound reused 6×)      | `3a4dd307` |
| `trading-conditions.ts` | 9 (4 functions, 7 keys; notFound + duplicateName reused) | `0595ba9b` |
| `ocr-import.ts`         | 3 (bulkCreateTradesFromOcr, ICU plural)                  | `0595ba9b` |
| `equity-shield.ts`      | 3 (2 functions, 3 keys)                                  | `e9b01ff0` |
| `csv-import.ts`         | 3 (incl. csvImported ICU plural)                         | `e9b01ff0` |
| `candle-query.ts`       | 1 (the leaky path at getCandlesForRange L101)            | `e9b01ff0` |

**i18n parity:** 5316 keys per locale, 0 gaps. **lint/tsc:** all green for touched files.
