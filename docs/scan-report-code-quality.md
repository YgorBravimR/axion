# Code Quality Audit — Axion
Date: 2026-04-21

## Summary
- Total issues: 54
- Critical: 5 | High: 18 | Medium: 22 | Low: 9

---

## Findings by Feature

### 1. Dashboard

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 1 | High | `src/components/dashboard/dashboard-content.tsx:270` | Component is 270 lines and defines an inner `PeriodToggle` component in the same file — the inner component is never exported and could be extracted | CLAUDE.md — avoid excessive nesting/large files |
| 2 | High | `src/components/dashboard/dashboard-content.tsx:109` | `DashboardContent` uses `export const` directly (no bottom export), while inner `PeriodToggle` at line 76 is never exported but is defined inline — inconsistent with "export at end of file" | CLAUDE.md — export at end of file |
| 3 | Medium | `src/components/dashboard/dashboard-content.tsx:123` | `useState(() => new Date(initialYear, initialMonthIndex, 1))` — long inline expression in state initializer; consider extracting to a named helper for readability | CLAUDE.md — readability over performance |
| 4 | Low | `src/components/dashboard/kpi-cards.tsx` | No issues identified beyond normal component size | — |

---

### 2. Journal

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 5 | Critical | `src/components/journal/trade-form.tsx:277` | `zodResolver(createTradeSchema) as any` — `as any` cast is used to work around react-hook-form type mismatch. Comment exists (`// eslint-disable-next-line @typescript-eslint/no-explicit-any`). Justified for library boundary but the eslint suppression is per-line rather than scoped, which is looser than necessary | CLAUDE.md — never use `any` except at library boundaries |
| 6 | High | `src/components/journal/trade-form.tsx` | File is 1,631 lines — far exceeds the ~300-line threshold. The component handles direction, asset, timeframe, dates, prices, risk, journal notes, rating, screenshot, and tags all in one component. Should be split into sub-sections or extracted tab components | CLAUDE.md — avoid oversized components |
| 7 | High | `src/components/journal/journal-content.tsx:127` | `readExtendedFilters` is defined as a plain arrow function inside the component body but called at render time (line 154). It reads URL params on every render — this should be memoized with `useMemo` since `urlParams` is a stable hook ref | CLAUDE.md — state that could be derived; react-best-practices |
| 8 | High | `src/components/journal/journal-content.tsx:255–261` | `useEffect` dep array contains `JSON.stringify(extendedFilters)` (line 260) as a serialized dep to force referential equality — this is a known unstable pattern and the reason for the `eslint-disable-line` on line 261. The proper fix is to memoize `extendedFilters` with `useMemo` | CLAUDE.md — `useEffect` with incorrect dependencies |
| 9 | Medium | `src/components/journal/trade-form.tsx:455` | `handleTagToggle` is defined with arrow syntax correctly, but it calls `setValue` with inline array operations. Not wrapped in `useCallback`, so it recreates on every render even though the form and tag list rarely change | CLAUDE.md — unnecessary re-renders |
| 10 | Medium | `src/components/journal/trade-form.tsx:521–522` | Variables `setupTags`, `mistakeTags`, `generalTags` are derived from `localTags` on every render — these should be `useMemo` | CLAUDE.md — state that could be derived |

---

### 3. Analytics

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 11 | High | `src/components/analytics/analytics-content.tsx:187` | `applyDashboard` is defined as an arrow function inside the component body (line 187) but is not wrapped in `useCallback`. It is called from `useEffect` at line 177 and from within another `useEffect` at line 220 — missing from dep arrays in both cases | CLAUDE.md — `useEffect` missing dependencies |
| 12 | High | `src/components/analytics/analytics-content.tsx:241` | `useEffect` dep array is `[filterKey]` with `eslint-disable-line react-hooks/exhaustive-deps` comment. The effect uses `filters`, `groupBy`, `tagStats` (for fallback), `filterKey`, `lastFetchedKey` — all omitted from deps. Root cause is stale closure risk on `tagStats` | CLAUDE.md — `useEffect` with incorrect dependencies |
| 13 | Medium | `src/components/analytics/analytics-content.tsx:82–90` | `toFilterKey` uses `JSON.stringify` inline as a cache key builder — this is fine for its purpose, but the function has no return type annotation | CLAUDE.md — type everything |

---

### 4. Playbook

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 14 | High | `src/components/playbook/playbook-content.tsx:46–63` | `handleDelete`, `handleConfirmDelete`, and `handleEdit` are not wrapped in `useCallback`. They are passed as props to `StrategyCard` children, causing re-renders on every parent state update | CLAUDE.md — inline function creation in JSX props |
| 15 | Medium | `src/components/playbook/playbook-content.tsx:53–63` | `handleConfirmDelete` contains async logic inside `startTransition`. The early return on line 54 is correct, but no toast is shown on failure — silent failures are hard to debug | CLAUDE.md — graceful error handling |

---

### 5. Command Center

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 16 | Medium | `src/components/command-center/asset-rules-panel.tsx:73,105,127,139` | Four `catch` blocks log `console.error` but none surface an error to the user via toast. Silent failure in a pre-market checklist is a UX concern | CLAUDE.md — graceful error handling |
| 17 | Medium | `src/components/command-center/post-market-notes.tsx:51` | `console.error("Failed to save notes:", error)` — error is swallowed, no user feedback | CLAUDE.md — graceful error handling |
| 18 | Medium | `src/components/command-center/pre-market-notes.tsx:57` | Same as above — `console.error` without user notification | CLAUDE.md — graceful error handling |
| 19 | Medium | `src/components/command-center/checklist-manager.tsx:94,109` | Both `catch` blocks only log; no toast shown on failure | CLAUDE.md — graceful error handling |

---

### 6. Monte Carlo

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 20 | High | `src/components/monte-carlo/v2/monte-carlo-v2-content.tsx:93` | `handleUseStats` (line 93) and `handleCustomize` (line 108) and `handleRunAgain` (line 229) are not wrapped in `useCallback`. They are passed as props to child components | CLAUDE.md — inline function creation in JSX props |
| 21 | High | `src/components/monte-carlo/v2/monte-carlo-v2-content.tsx:613` | File is 613 lines — should be split. The input parameter grid (rows 1 & 2) alone is 200+ lines of repetitive label+input markup that could be extracted into a typed `ParamInput` sub-component | CLAUDE.md — components over 300 lines |
| 22 | Medium | `src/components/monte-carlo/v2/monte-carlo-v2-content.tsx:79–85` | `loadSourceStats` wraps a `try/catch` correctly. However the `catch` block logs with `console.error` and then sets state to null — user sees no feedback that stats failed to load, only the absence of data | CLAUDE.md — graceful error handling |

---

### 7. Risk Simulation

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 23 | High | `src/components/risk-simulation/risk-simulation-content.tsx:94–97` | `useEffect` on mount calls `handleDateChange` with `eslint-disable-next-line react-hooks/exhaustive-deps` on line 96. The proper fix is to call the underlying fetch logic directly in the effect, not a handler function | CLAUDE.md — `useEffect` with incorrect dependencies |
| 24 | Medium | `src/components/risk-simulation/simulation-config-panel.tsx` | Props passed to `SimulationConfigPanel` at line 148 span 17 props — exceeds the "more than 2 params → object" rule and suggests the component may be doing too much | CLAUDE.md — functions with >2 parameters use typed object |

---

### 8. Reports

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 25 | Low | `src/components/reports/reports-content.tsx` | `ReportsContent` uses `export const` at line 23 (not at end-of-file). File is clean otherwise | CLAUDE.md — export at end of file |
| 26 | Medium | `src/app/actions/reports.ts:371,538,644,849,954,1020,1097,1252` | Eight `console.error` calls across report actions — all valid error logging. However the file is 1,258 lines with high copy-paste similarity across weekly/monthly/projection fetch functions that could share an abstraction | CLAUDE.md — DRY principle |

---

### 9. Settings

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 27 | Medium | `src/components/settings/settings-content.tsx:108` | `Indicators` tab label is hardcoded as `"Indicators"` (line 108) instead of using a translation key like `{t("indicators")}` — inconsistent with all other tabs | CLAUDE.md — consistency |
| 28 | High | `src/components/settings/account-settings.tsx:965–966` | Uses raw Tailwind color classes `border-red-500/30` and `text-red-500` instead of the design system semantic token `fb-error` or `trade-sell`. This is the only place raw red- colors appear in settings | CLAUDE.md — use only custom colors from globals.css |

---

### 10. Backtest / Optimize

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 29 | High | `src/components/optimize/optimize-content.tsx` | File is 722 lines. Contains three wizard steps in a single component file. Step 2 (parameters) and Step 3 (results) could be separate components | CLAUDE.md — components over 300 lines |
| 30 | High | `src/components/optimize/optimize-content.tsx:149,158,164,182,203` | `handlePresetChange`, `handleStrategyChange`, `handleSourceChange`, `handleQuickRange`, `handleDateRangeManual`, `handleLoadData` are all NOT wrapped in `useCallback` but are passed to child components as props or called from JSX `onValueChange`. This is intentional code-smell for a complex optimizer but still violates the guideline | CLAUDE.md — inline function creation in JSX props |
| 31 | Medium | `src/components/backtest/backtest-content.tsx:56–57` | `handlePresetChange`, `handleStrategyChange`, `handleSourceChange`, `handleQuickRange`, `handleDateRangeManual` are defined without `useCallback`. Acceptable for a non-frequently-re-rendering component, but worth noting | CLAUDE.md — inline function creation |

---

### 11. Equity Shield

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 32 | High | `src/components/equity-shield/equity-shield-content.tsx:106–109` | `useEffect` on mount calls `handleDateChange` with `eslint-disable-next-line react-hooks/exhaustive-deps`. Same pattern as Risk Simulation — should call the fetch logic directly | CLAUDE.md — `useEffect` with incorrect dependencies |
| 33 | Medium | `src/components/equity-shield/equity-shield-content.tsx:94–103` | `handleDateChange` wraps `getEquityShieldPreview` in a `try/finally` but swallows errors silently — no error state is set if the preview fetch fails | CLAUDE.md — graceful error handling |

---

### 12. Monthly

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 34 | High | `src/components/monthly/monthly-content.tsx:95–102` | `useEffect` dep array is `[monthOffset, hasNavigated]` — the effect calls `loadData(monthOffset)` which is defined inside the component (line 65) but is NOT in the dep array. This creates a stale-closure risk if `loadData` ever captures other state. No eslint-disable comment explains the omission | CLAUDE.md — `useEffect` missing dependencies |
| 35 | High | `src/components/monthly/monthly-content.tsx:104` | `handleMonthChange` is not wrapped in `useCallback` but is passed to `MonthNavigator` as the `onMonthChange` prop — recreates on every render | CLAUDE.md — inline function creation in JSX props |
| 36 | Medium | `src/components/monthly/monthly-content.tsx:65` | `loadData` is a non-memoized async function defined inside the component — called from both a `useEffect` and indirectly from `handleMonthChange`. Should be wrapped in `useCallback` | CLAUDE.md — `useCallback` for stable references |

---

### 13. Imports

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 37 | Critical | `src/components/imports/detailed-trade-importer.tsx:207,272,317,364,380` | Uses raw Tailwind palette colors (`bg-red-100`, `border-red-300`, `text-red-600`, `text-red-700`, `bg-yellow-100`, `border-yellow-300`, `text-yellow-900`, `text-yellow-700`, `bg-green-50`, `border-green-300`, `text-green-600`, `bg-red-50`, `border-red-300`) instead of design system tokens (`fb-error`, `trade-buy`, `warning`). This component is entirely outside the design system | CLAUDE.md — use only custom colors from globals.css |
| 38 | Critical | `src/components/imports/detailed-trade-importer.tsx:284` | `key={idx}` (array index as key) on trade list items — unstable key, can cause rendering bugs when items reorder or filter | CLAUDE.md / react-best-practices — non-stable keys |
| 39 | High | `src/components/imports/detailed-trade-importer.tsx:142–145` | Uses `setTimeout(() => { router.refresh(); router.push(...) }, 2000)` for post-import redirect. `setTimeout` in React components is a side effect that is not cleaned up and can cause state-update-after-unmount warnings | CLAUDE.md — correct React patterns |
| 40 | Medium | `src/components/imports/detailed-trade-importer.tsx:26–27` | Two separate `import type` lines for `BrokerName` and `ImportPreview` from the same module — can be merged into one | CLAUDE.md — clean imports |

---

### 14. Market Monitor

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 41 | Medium | `src/components/market/market-monitor-content.tsx` | No critical issues — component is well structured. `console.error` calls in `lib/market/orchestrator.ts` (lines 93, 117, 176, 185) are valid server-side error logging | — |

---

### 15. Auth

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 42 | Medium | `src/components/auth/login-form.tsx:29` | `LoginForm` uses named export at end of file (line 395) ✓. However the component is 395 lines and handles two full steps (credentials + account-selection) inline. The account-selection step JSX (lines 135–245) could be extracted to its own component | CLAUDE.md — avoid oversized components |
| 43 | Medium | `src/app/actions/auth.ts:96,107,259,471,524,573` | Six `console.error` calls in auth actions — all valid server-side error logging | CLAUDE.md — console.log left in production |

---

### 16. Shared / UI

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 44 | Medium | `src/components/command-center/live-trading-status-panel.tsx:83` | `key={index}` on an array-rendered list — unstable key | react-best-practices — non-stable keys |
| 45 | Medium | `src/components/shared/image-lightbox.tsx:133` | `key={index}` on image thumbnails list — unstable key | react-best-practices — non-stable keys |
| 46 | Medium | `src/components/backtest/sections/targets-exit-section.tsx:124` | `key={index}` on rendered items — unstable key | react-best-practices — non-stable keys |
| 47 | Medium | `src/components/dashboard/trading-calendar.tsx:134` | `key={index}` on calendar day rows — unstable key | react-best-practices — non-stable keys |
| 48 | Medium | `src/components/monthly-plan/decision-tree-modal.tsx:408` | `key={index}` on decision tree nodes — unstable key | react-best-practices — non-stable keys |
| 49 | Low | `src/components/ui/color-picker.tsx:137` | `eslint-disable-line react-hooks/exhaustive-deps` — dep array suppressed without explanation | CLAUDE.md — linter suppression must be justified |
| 50 | Low | `src/components/ui/page-guide/page-guide-provider.tsx:50` | `eslint-disable-next-line react-hooks/exhaustive-deps` — dep suppression without comment explaining why | CLAUDE.md — linter suppression must be justified |

---

### 17. Layout

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 51 | Low | `src/components/layout/sidebar.tsx` | Clean — all handlers are correctly named, component is well-structured, named export at end | — |

---

### 18. Server Actions

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 52 | High | `src/app/actions/trades.ts` | File is 2,226 lines — the single largest file in the codebase. Creates a large cognitive surface. Groups of related helpers (CSV bulk import ~lines 1100–1200, dedup logic, update/delete) could be extracted to sub-modules under `app/actions/trades/` | CLAUDE.md — DRY / avoid huge files |
| 53 | High | `src/app/actions/analytics.ts` | File is 2,122 lines — second largest. Multiple large data aggregation queries share minimal abstraction. Could be split into analytics sub-actions by domain (performance, equity, heatmap, holding) | CLAUDE.md — DRY / avoid huge files |

---

### 19. Lib Utilities

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 54 | Critical | `src/lib/zod-required-fields.ts:9` | `/* eslint-disable @typescript-eslint/no-explicit-any */` disables `any` checking for the entire file. The file uses `any` 5 times (lines 18, 39, 54, 56, 72) to introspect Zod 4 internals. The comment at line 9 justifies this as a Zod 4 schema introspection boundary — this is a legitimate library boundary case, but the file-level suppression is broader than needed. Each `any` usage should have its own inline comment | CLAUDE.md — scoped eslint suppression; `any` at library boundaries |
| 55 | High | `src/lib/pdf/generate-report-pdf.ts:35,51` | `element as any` cast twice for `renderToBuffer`. Both have `eslint-disable-next-line` with an explanatory comment — justified for `@react-pdf/renderer` poor TypeScript support. Acceptable but worth tracking for library upgrade | CLAUDE.md — `any` at library boundaries with comment |

---

### 20. Account Comparison

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 56 | Low | `src/components/account-comparison/account-comparison-content.tsx` | No significant issues — clean component, correct named exports | — |

---

### 21. Monthly Plan

| # | Severity | File:Line | Issue | Guideline |
|---|----------|-----------|-------|-----------|
| 57 | Medium | `src/components/monthly-plan/decision-tree-modal.tsx:408` | `key={index}` on decision path nodes — unstable key (already noted in #48 above — combined count) | react-best-practices — non-stable keys |

---

## Cross-Cutting Patterns

### `console.error` Usage
The codebase uses `console.error` extensively in server actions (`actions/*.ts`) and market orchestrator — this is correct server-side error logging. The issues flagged above are specifically in **client components** where errors are logged but not surfaced to the user via toast or UI feedback.

Affected client files with silently-swallowed errors:
- `src/components/command-center/asset-rules-panel.tsx`
- `src/components/command-center/post-market-notes.tsx`
- `src/components/command-center/pre-market-notes.tsx`
- `src/components/command-center/checklist-manager.tsx`
- `src/components/equity-shield/equity-shield-content.tsx`
- `src/components/monte-carlo/v2/monte-carlo-v2-content.tsx`

### Hardcoded `eslint-disable` for `react-hooks/exhaustive-deps`
Five locations suppress the exhaustive-deps rule without equivalent memoization or documented justification. The only truly justified cases are run-once mount effects. Pattern to review:
- `journal-content.tsx:261` (should use `useMemo` for `extendedFilters`)
- `analytics-content.tsx:241` (stale closure risk on `tagStats`)
- `risk-simulation-content.tsx:96` (mount-only fetch — acceptable with comment)
- `equity-shield-content.tsx:108` (mount-only fetch — acceptable with comment)
- `page-guide-provider.tsx:50` (needs comment)

### Positive Observations
- Zero `import * as React from "react"` usage — all React imports are named ✓
- Zero `export default` in component files (only Next.js-required error/loading/not-found pages) ✓
- Zero `function` keyword declarations (all arrow syntax) ✓
- Zero `.forEach()` calls — consistent use of `map`/`for...of` ✓
- `import type` used consistently for type-only imports (324 occurrences) ✓
- Consistent named exports at module end in well-maintained files ✓
- `aria-label`, `aria-pressed`, `aria-current` used throughout interactive elements ✓
- `motion-reduce:animate-none` applied consistently to all Loader2 spinners ✓
