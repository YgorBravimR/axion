# Axion Full Codebase Scan Report

**Date**: 2026-03-25
**Scope**: All component directories, pages, and layouts
**Tool**: `/scan` (parallel code quality + design/UX audit agents per target)

---

## Overview

14 scans across 4 phases, producing 14 commits. ~120 files touched, ~200 individual fixes applied. Zero TypeScript errors introduced.

| Metric | Count |
|--------|-------|
| Scans executed | 14 |
| Commits produced | 14 |
| Files modified | ~120 |
| Undefined tokens resolved | ~100 locations |
| console.log removed | ~20 |
| Default exports fixed | ~25 |
| React namespace fixes | ~10 |
| Hardcoded colors → tokens | ~15 |
| String concat → cn() | ~10 |
| Accessibility fixes | ~25 |
| i18n keys added | 8 |
| Dead code removed | 3 files/functions |
| Deferred findings documented | 7 |

---

## Phase 1: Foundation

### 1. Shared Components — `e848715`

**10 files** | `src/components/shared/`

| Category | Fixes |
|----------|-------|
| Code conventions | Added `"use client"` to direction-badge, fixed `React.ReactNode` → `import type { ReactNode }` in empty-state, named `TrendIcon` interface in stat-card, fixed `useCallback` deps in image-upload |
| Theming | `text-caption` → `text-tiny` in image-upload (undefined token), `focus:` → `focus-visible:` in filter-pill, `min-h-[44px]` touch target on filter-pill, deduplicated `default`/`accent` variants, removed AI-tell circle wrapper in empty-state |
| Design | `font-bold` → `font-semibold` on stat-card values (per "Bold reserved for major emphasis" principle), image remove buttons now always visible on mobile |
| Accessibility | `aria-label` on colored-value (semantic direction), win-rate-badge (threshold context), direction-badge, stat-card; `role="status"` on empty-state; descriptive alt on image thumbnails; `motion-reduce:animate-none` on loading-spinner |
| i18n | Added `imageUpload.thumbnail` key to en.json and pt-BR.json |

### 2. Dashboard — `beb1cf9`

**13 files** | `src/components/dashboard/` + `src/app/[locale]/(app)/page.tsx`

| Category | Fixes |
|----------|-------|
| Code conventions | Removed `console.log` from SSR page, `export default` → `export { X as default }`, removed `eslint-disable` by wrapping `fetchData` in `useCallback`, documented Recharts unsafe casts, removed dead `showDrawdown` prop, stabilized `createCustomTooltip` factory → `EquityTooltip` component, added `useMemo` for derived data in 4 chart components |
| Theming | Fixed hardcoded `"pt-BR"` → `useLocale()` in 3 chart tooltips, replaced all string concat → `cn()` in 5 files, raw `text-[0.625rem]` → `text-micro` in trading-calendar, raw `p-0.5`/`mt-1`/`gap-2` → spacing tokens across 4 files, added responsive padding to cumulative-pnl-chart |
| Responsive | `h-32` → `min-h-32` on KPI cards to prevent content clipping |
| Accessibility | `aria-pressed` on PeriodToggle and ViewModeToggle, `role="group"` on toggle containers, `role="region"` + `aria-label` on equity-curve and radar chart sections |
| Animation | `transition-opacity duration-200` for smooth loading state on equity curve |

### 3. Layout — `171ea56`

**11 files** (1 deleted) | `src/components/layout/` + `src/app/layout.tsx`

| Category | Fixes |
|----------|-------|
| Code conventions | `export default` → `export { X as default }` in root layout, `React.Dispatch`/`React.SetStateAction` → extracted `CreateAccountForm` interface, deprecated `navigator.platform` → `navigator.userAgent` regex, array index key → `crumb.href ?? crumb.label` in breadcrumb, removed dead `main-layout.tsx` + barrel export |
| Theming | `text-red-400` → `text-destructive` in user-menu logout, `text-white` → `text-bg-100` on sidebar new trade button, raw `px-2`/`pt-2`/`space-y-1`/`px-4`/`px-6`/`px-8` → design tokens |
| Accessibility | **Skip-to-content link** as first focusable element, `id="main-content"` on both `<main>` elements, `aria-label` on mobile `<header>`/sidebar `<aside>`/expanded account-switcher, fixed `tabIndex={-1}` on active nav links → `tabIndex={0}`, removed forced `blur()` ref |
| Reduced motion | `motion-reduce:transition-none` on sidebar width, app-shell margin-left, and sidebar logo crossfade |
| i18n | Added `skipToContent`, `appHeader`, `mainNavigation` keys |

### 4. Providers — `477f904`

**6 files** | `src/components/providers/`

| Category | Fixes |
|----------|-------|
| Code conventions | `React.ReactNode` → `import type { ReactNode }` in brand-provider and effective-date-provider, removed dead `getStoredBrand` function/commented-out code/unused `defaultBrand` prop, removed unused `isValidBrand` re-export |
| Performance | `useMemo` wrapping context value in brand-provider (matching effective-date-provider pattern) |
| Harden | `try/catch` on theme-synchronizer `getUserTheme()`, `try/catch` on brand-synchronizer `getCurrentAccount()`, `console.warn` in brand-script silent catch for debuggability |
| Performance | Fixed misleading `useEffect` deps in brand-synchronizer → empty array (mount-only intent) |

---

## Phase 2: Core User Journey

### 5. Command Center — `dce01a6`

**14 files** | `src/components/command-center/` + page

| Category | Fixes |
|----------|-------|
| Code conventions | Removed `console.log` + `performance.now()` from page, `export default` → `export { X as default }`, reused `MoodType` import instead of inline cast, removed non-functional GripVertical button + import, array index key → `summary.tradeStepNumber`, pathname locale detection → `useLocale()` |
| Undefined tokens (4 tokens, 10+ locations) | `bg-bg-400` → `bg-bg-300` (progress bar was invisible), `text-h4` → `text-h3` (3 metrics at browser default), `text-txt-400` → `text-txt-placeholder` (disabled state invisible), `accent-primary` → `acc-100` (across 5 files), `border-bg-400` → `border-bg-300` (dashed border invisible), `text-white` → `text-bg-100` in circuit-breaker |
| Accessibility | Fixed broken template literal `id` in daily-checklist, added `aria-label` on checklist move up/down buttons, `role="status"` on date-navigator read-only badge, added `DateNavigator` to barrel export |
| i18n | Added `moveUp`, `moveDown` keys |

### 6. Playbook — `b3684ab`

**4 files** | `src/components/playbook/` + pages

| Category | Fixes |
|----------|-------|
| Code conventions | Removed `console.log` + `performance.now()`, `export default` → `export { X as default }` |
| Theming | `text-white` → `text-txt-100` in scenario lightbox |
| Code quality | String concat → `cn()` in strategy-card (2 locations) and strategy detail page (3 locations) |

### 7. Journal — `98ed57d`

**17 files** | `src/components/journal/` + 4 pages (largest scan)

| Category | Fixes |
|----------|-------|
| Undefined tokens (9 tokens, ~30 locations) | `text-txt-400` → `text-txt-300` (6 in ocr-import), `hover:bg-bg-400` → `hover:bg-bg-200` (period-filter), `text-h4` → `text-h3` (csv-import-summary), `border-stroke-100` → `border-bg-300` (7 in execution-list + position-summary), `text-fb-warning` → `text-warning` (2), `text-fb-info` → `text-acc-200` (2), `bg-fb-info` → `bg-acc-200` (1), `text-caption` → `text-tiny` (9 across 5 files), `text-white` → `text-bg-100` (csv-trade-card) |
| Code conventions | Removed `console.log` + `performance.now()`, 4 `export default` fixes, `React.ReactNode`/`React.KeyboardEvent`/`React.MouseEvent` → direct imports, 4 string concat → `cn()` with missing `cn` imports added |
| Accessibility | `role="tablist"` on new-trade-tabs, `focus-visible:ring` on trade-card link |

---

## Phase 3: Analysis Tools

### 8. Analytics + Account Comparison — `28da1eb`

**13 files** | `src/components/analytics/` + `src/components/account-comparison/` + pages

| Category | Fixes |
|----------|-------|
| Undefined tokens (~60 locations) | `text-caption` → `text-tiny` (~55 across 7 files — largest single-token fix), `text-heading` → `text-h3` (2), `text-txt-400` → `text-txt-300` (1), `text-white/90` → `text-txt-100` (time-heatmap) |
| Code conventions | Removed 8 `console.log` debug statements (7 in analytics-content + 1 in page), removed `performance.now()` timing, 2 `export default` fixes |

### 9. Monte Carlo — `a1710ac`

**9 files** | `src/components/monte-carlo/` (including v2/)

| Category | Fixes |
|----------|-------|
| Undefined tokens (~25 locations) | `accent-primary` → `acc-100` (~10), `text-fb-warning`/`bg-fb-warning` → `text-warning`/`bg-warning` (~8), `text-h4` → `text-h3` (3), `text-caption` → `text-tiny` (2), `hover:border-bg-400` → `hover:border-bg-200` (2), `var(--color-fb-warning)` → `var(--color-warning)` (1) |
| Code conventions | Removed `console.log` + `performance.now()`, `export default` → `export { X as default }`, `React.ReactNode` → `import type { ReactNode }` |

### 10. Risk Simulation — `0253603`

**3 files** | Very clean module

| Category | Fixes |
|----------|-------|
| Code conventions | Removed `console.log` + `performance.now()`, `export default` → `export { X as default }` |
| Theming | `text-white` → `text-bg-100` |
| Code quality | `React.ChangeEvent` → `import type { ChangeEvent }` |

### 11. Monthly + Reports — `c25a420`

**2 files** | Very clean modules

| Category | Fixes |
|----------|-------|
| Code conventions | Removed `console.log` + `performance.now()` from both pages, `export default` → `export { X as default }` |

---

## Phase 4: Supporting Flows

### 12. Auth + Settings + Public — `23cdef4`

**10 files** | All remaining pages and layouts

| Category | Fixes |
|----------|-------|
| Code conventions | Removed `console.log` + `performance.now()` from settings page, `export default` → `export { X as default }` across all 10 files (settings, login, register, verify-email, forgot-password, select-account, auth layout, public layout, painel, monitor) |

---

## Systemic Issues Resolved

### 1. Undefined Design Tokens (~100 locations)

The most impactful fix across the entire scan. Nine token names were used extensively but never defined in `globals.css`, causing elements to render with no styling:

| Undefined Token | Replacement | Occurrences | Files |
|----------------|-------------|-------------|-------|
| `text-caption` | `text-tiny` | ~75 | 15+ |
| `accent-primary` | `acc-100` | ~15 | 8 |
| `text-fb-warning` / `bg-fb-warning` | `text-warning` / `bg-warning` | ~12 | 6 |
| `border-stroke-100` | `border-bg-300` | ~7 | 2 |
| `text-h4` | `text-h3` | ~7 | 4 |
| `text-txt-400` | `text-txt-300` / `text-txt-placeholder` | ~8 | 3 |
| `text-heading` | `text-h3` | ~2 | 2 |
| `bg-bg-400` / `hover:border-bg-400` | `bg-bg-300` / `hover:border-bg-200` | ~4 | 3 |
| `text-fb-info` / `bg-fb-info` | `text-acc-200` / `bg-acc-200` | ~3 | 1 |

### 2. Debug Logging (~20 locations)

Every SSR page had `performance.now()` + `console.log("[YGORDEV:...]")` timing code left in production. All removed. Additionally, `analytics-content.tsx` had 7 debug logs for cache/fetch tracing.

### 3. Default Exports (~25 files)

All `export default X` patterns across pages and layouts converted to `export { X as default }` to comply with CLAUDE.md's "avoid default exports" convention while satisfying Next.js requirements.

### 4. Hardcoded Colors (~15 locations)

`text-white`, `text-red-400`, `text-white/90` replaced with theme-adaptive tokens (`text-bg-100`, `text-destructive`, `text-txt-100`).

### 5. React Namespace Access (~10 locations)

`React.ReactNode`, `React.KeyboardEvent`, `React.MouseEvent`, `React.ChangeEvent`, `React.Dispatch`, `React.SetStateAction` all replaced with direct imports per CLAUDE.md convention.

---

## Deferred Findings

Issues intentionally skipped during scans — documented for future refactor sessions.

### Layout — Architectural

| Item | Files | Complexity | Description |
|------|-------|------------|-------------|
| Client-side data fetching → server props | `user-menu.tsx`, `account-switcher.tsx` | Medium | Both fetch via `useEffect` causing loading spinner flash. Should resolve in server layout and pass as props. |
| DRY duplication in collapsed/expanded | `user-menu.tsx`, `account-switcher.tsx` | Medium | Nearly identical JSX in both render paths. Extract shared dropdown content. |

### Providers — Performance

| Item | Files | Complexity | Description |
|------|-------|------------|-------------|
| PostHog eager initialization | `posthog-provider.tsx` | Medium | `posthog.init()` runs at module scope, adding SDK to initial bundle. Should defer via `next/dynamic` or `useEffect`. |

### Command Center — Code Quality

| Item | Files | Complexity | Description |
|------|-------|------------|-------------|
| Native inputs → UI components | `live-trading-status-panel.tsx` | Low-Medium | MiniCalculator uses raw `<select>`/`<input>` instead of design system components. |
| useEffect → derived state | `pre-market-notes.tsx`, `post-market-notes.tsx` | Low | `hasChanges` can be computed inline instead of synced via effect. |

### Analytics — Design

| Item | Files | Complexity | Description |
|------|-------|------------|-------------|
| Hardcoded hex colors | `comparison-colors.ts` | Low | Four hex colors bypass the token system. |
| Inline export pattern | 10 analytics files | Low | `export const` inline instead of end-of-file exports. Style preference. |
| String concat → cn() | 8 analytics chart files | Low | ~20 template literal className locations. |

### Monte Carlo — i18n

| Item | Files | Complexity | Description |
|------|-------|------------|-------------|
| Hardcoded English in analysis insights | `src/lib/monte-carlo.ts` | Medium | `generateAnalysisInsights` returns raw English strings. Should return translation keys. |
| Hardcoded chart tooltip labels | 3 chart files | Low | "days", "simulations" in tooltip text. |

---

## Areas Not Deep-Scanned

| Area | Reason |
|------|--------|
| `src/components/ui/` (39 files) | Shadcn primitives — low risk, high stability |
| `src/app/actions/` (server actions) | `console.error` in catch blocks is legitimate server-side error logging |
| `src/app/global-error.tsx`, `loading.tsx`, `error.tsx`, `not-found.tsx` | Next.js special files — `export default` is required |
| `src/components/calculator/` (3 files) | Grep-verified clean — no issues found |
| `src/components/imports/` (1 file) | Grep-verified clean — no issues found |
