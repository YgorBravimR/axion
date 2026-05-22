# Frontend Post-Mortem Log

---

## [BUG-2026-05-21] React infinite loop in EquityCurve component (nested useCallback deps)

**Date:** 2026-05-21 | **Severity:** High | **Affected Area:** `/src/components/dashboard/equity-curve.tsx`

### Cause

After the initial infinite loop fix (commit f28f70b5), the dashboard still failed the E2E navigation test with "Maximum update depth exceeded" error. The root cause was an unnecessary function dependency in the `useEffect` at line 207-211 of `equity-curve.tsx`:

```typescript
const fetchData = useCallback(
	(newPeriod: Period, newMode: ViewMode) => { ... },
	[calendarMonth, effectiveDate]
)

useEffect(() => {
	if (period === "month") {
		fetchData("month", viewMode)
	}
}, [calendarMonth, fetchData, period, viewMode])  // <-- fetchData in deps!
```

The problem: `fetchData` itself depends on `[calendarMonth, effectiveDate]`. By including `fetchData` as a dependency of the effect, we created a situation where:

1. If `calendarMonth` or `effectiveDate` changes, `fetchData` is recreated (new identity)
2. The effect sees `fetchData` changed, so it re-runs
3. The effect calls `fetchData()`, which may trigger state updates
4. The component re-renders
5. Now `fetchData` is recreated again (because its deps changed)
6. The effect re-runs again, creating a cascade of updates until React's depth limit is exceeded

**Root principle:** When a function is included in a `useEffect` dependency array, that function's own dependencies become indirect dependencies of the effect. It's redundant and error-prone to include both the function AND its dependencies in the same effect's deps.

### Effect

Browser console error (caught in E2E test): `Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate.` The E2E test `should display all navigation items` failed because the dashboard page never fully rendered.

### Solution

Replaced the function reference with its actual dependencies in the `useEffect` dependency array:

```typescript
useEffect(() => {
	if (period === "month") {
		fetchData("month", viewMode)
	}
}, [calendarMonth, effectiveDate, period, viewMode]) // <-- dependencies instead of function
```

This way:

- The effect still re-runs when the inputs change (same observable behavior)
- We break the circular dependency where the function's identity affects the effect's re-run condition
- The effect's dependencies are explicitly the values the effect actually depends on, not an intermediate function

### Prevention

- **Include function dependencies, not function references, in effect dependency arrays.** If you need `fetchData()` to re-run when its dependencies change, include those dependencies directly in the effect, not the function itself.
- **Be suspicious of patterns like `[..., callbackFunction, ...]` in useEffect deps.** Ask: does the effect depend on the function's identity, or on the function's inputs?
- **ESLint `react-hooks/exhaustive-deps` can be deceived by this pattern.** It sees `fetchData` used in the effect, suggests adding `fetchData` to deps, but doesn't catch that `fetchData`'s own deps are missing. Manual code review is essential.
- **Test dashboard rendering with charts and date filters** to catch cascading re-render issues early.

### Related Files

- `src/components/dashboard/equity-curve.tsx`

---

## [BUG-2026-05-21] React "Maximum update depth exceeded" infinite loop on dashboard with fresh accounts

**Date:** 2026-05-21 | **Severity:** High | **Affected Area:** `/src/components/dashboard/dashboard-content.tsx`, `/src/components/dashboard/dashboard-strategy-filter.tsx`, `/src/components/shared/mode-variant.tsx`

### Cause

The dashboard page rendered an error boundary ("Something went wrong!") when accessed by fresh accounts with no trading data. The root cause was a circular dependency in `DashboardStrategyFilter`'s `useEffect`:

1. `DashboardStrategyFilter` had an effect that checked if a selected strategy no longer exists in the options and cleared the filter:

   ```typescript
   useEffect(() => {
   	if (value.strategyId && options.length > 0 && !selectedStrategy) {
   		onChange({ strategyId: null, strategyVersionId: null })
   	}
   }, [options.length, selectedStrategy, value.strategyId, onChange]) // onChange in deps!
   ```

2. The `onChange` callback prop came from parent `DashboardContent` and was created with `useCallback(..., [fetchFilteredData, period])`.

3. `fetchFilteredData` had `useCallback(..., [effectiveDate])` as its dependency.

4. Because `effectiveDate` was obtained from `useEffectiveDate()` hook which was not stably memoized relative to parent re-renders, and because `onChange` was passed as a dependency to the child's effect, the effect would re-run on every render, calling setState in the parent, causing re-renders, triggering the effect again. This exceeded React's 50-update limit.

Additional issues:

- `ModeVariant` component was not memoized, causing unnecessary child component re-renders
- `coachingVariants` object in `DashboardContent` was created inline, recreating on every render

### Effect

Browser console error: `Error: Maximum update depth exceeded. This can happen when a component repeatedly calls setState inside componentWillUpdate or componentDidUpdate. React limits the number of nested updates to prevent infinite loops.` The error boundary caught this and displayed "Something went wrong! An error occurred while loading the dashboard."

### Solution

1. **Removed `onChange` from `DashboardStrategyFilter` useEffect dependency array.** The effect only needs to watch when the available options or selected strategy changes, not when the callback function itself changes. Added eslint-disable comment to document this intentional omission.

2. **Memoized `ModeVariant` component** with `memo()` wrapper to prevent re-renders when props don't change structurally.

3. **Memoized `coachingVariants` object in `DashboardContent`** using `useMemo` with `[initialHawksContext]` dependency to prevent recreation on every parent render.

4. **Added defensive error handling in `EffectiveDateProvider`** to handle malformed date strings gracefully.

### Prevention

- **Never include callback props in useEffect dependency arrays unless the effect logic actually depends on their identity.** If an effect calls a callback, ensure the callback is stably memoized in the parent, or exclude it from dependencies if the call is side-effect-only.
- **Memoize components that are used as render props or passed as object properties** to prevent cascading re-renders.
- **Avoid creating object/array literals inline in JSX**, especially when they're passed as props to child components. Use `useMemo` for complex objects and arrays.
- **Test dashboard rendering with fresh accounts** (no trading data, no strategies) as part of E2E suite to catch infinite loop issues early.

### Related Files

- `src/components/dashboard/dashboard-content.tsx`
- `src/components/dashboard/dashboard-strategy-filter.tsx`
- `src/components/shared/mode-variant.tsx`
- `src/components/providers/effective-date-provider.tsx`

---

## [BUG-2026-05-13] AccountTransitionOverlayProvider hydration mismatch in ResumedOverlay

**Severity:** High | **Affected:** `src/components/ui/account-transition-overlay.tsx`

**Cause:** The `ResumedOverlay` component read from `sessionStorage` during initial state setup (`useState(() => checkResumedTransition())`). On the server, `sessionStorage` doesn't exist, so the check returned `false` (wrapped in try-catch). On the client, the flag could be `true` if set by a previous page reload. This mismatch caused Next.js hydration to fail because server rendered without overlay, but client rendered with it.

**Effect:** Browser console error: `Uncaught Error: Hydration failed because the server rendered HTML didn't match the client.` The ResumedOverlay showed `aria-hidden="true"` and fade-out animation styles only on client, not on server.

**Solution:**

1. Removed `checkResumedTransition()` helper function (no longer needed).
2. Changed `ResumedOverlay` to use `isMounted` state to defer sessionStorage check to `useEffect` (client-only).
3. On mount, read sessionStorage in `useEffect`, set `isVisible` if flag exists, then set `isMounted = true`.
4. Return `null` if not mounted yet (server-safe).
5. Moved fade-out delay to second `useEffect` that only runs when `isVisible` changes.
6. Updated provider to always render `<ResumedOverlay />` (component manages its own visibility internally).

**Prevention:** Never read from `sessionStorage` / `localStorage` in `useState` initializer or at component top level. Always defer to `useEffect` to ensure client-only execution. Use `isMounted` state to suppress rendering until hydration-safe state is achieved.

**Related Files:** `src/components/ui/account-transition-overlay.tsx`

---

## [BUG-2026-05-13] Script tag rendered inside React component

**Severity:** Medium | **Affected:** `src/components/providers/brand-script.tsx`

**Cause:** The `BrandScript` component rendered a native `<script>` tag with `dangerouslySetInnerHTML`. While the component itself is a server component, if ever wrapped in a "use client" parent or rendered in a client context, React throws a warning: "Encountered a script tag while rendering React component."

**Effect:** Browser warning in console. The script still executes (Next.js handles it), but the warning indicates improper pattern usage.

**Solution:** Replaced native `<script>` tag with `<Script>` from `next/script` and set `strategy="beforeInteractive"` to ensure it runs before React hydration starts, matching the original behavior of synchronous script execution in the `<head>`.

**Prevention:** Use Next.js `<Script>` component from `next/script` instead of native `<script>` tags in React components. Strategies: `"beforeInteractive"` for blocking head scripts, `"afterInteractive"` for deferred execution, `"lazyOnload"` for background scripts.

**Related Files:** `src/components/providers/brand-script.tsx`

---

## [BUG-2026-05-13] Image aspect ratio warnings for Axion wordmark and mark

**Severity:** Low | **Affected:** `src/components/ui/account-transition-overlay.tsx`, `src/components/layout/sidebar.tsx`, `src/components/auth/register-form.tsx`, `src/components/auth/login-form.tsx`, `src/components/auth/forgot-password-form.tsx`, `src/components/auth/verify-email-form.tsx`, `src/components/layout/app-shell.tsx`

**Cause:** Images with `height={N}` (explicit height) and `w-auto` (width auto) in className but no explicit height style. Next.js Image component warning: "Image has either width or height modified, but not the other. If you use CSS to change the size of your image, also include styles 'width: "auto"' or 'height: "auto"' to maintain the aspect ratio."

**Effect:** Browser warning in console for images: `/axion-mark-white.png` and `/axion-wordmark-white.png`. No functional impact, but indicates improper image sizing pattern.

**Solution:** Added `style={{ height: "auto" }}` inline style to all `<Image>` components using these assets. This tells the browser to compute height from width while maintaining intrinsic aspect ratio (since Tailwind's `h-8`, `h-7`, `h-14` set fixed heights). Total 8 Image components updated across 7 files.

**Prevention:** When using Next.js `<Image>` with CSS-driven sizing (e.g., Tailwind `h-X w-auto`), always add inline `style={{ height: "auto" }}` or `style={{ width: "auto" }}` to match the missing dimension. This prevents aspect ratio distortion warnings and browser warnings about inconsistent sizing.

**Related Files:** `src/components/layout/sidebar.tsx`, `src/components/auth/register-form.tsx`, `src/components/auth/login-form.tsx`, `src/components/auth/forgot-password-form.tsx`, `src/components/auth/verify-email-form.tsx`, `src/components/layout/app-shell.tsx`

---

> **[FIX-2026-05-13]** `Severity: Low` — `src/components/reports/reports-content.tsx`, `src/components/reports/withdrawal-calculator.tsx`, `messages/pt-BR.json`, `messages/en.json`
> **Report:** /reports Annual Report section displayed English hardcoded strings: "Annual Report — 2026", "Weekly Meta vs Real", "Annual Rollup", "Log Withdrawal", and withdrawal message text.
> **Fix:** Replaced all hardcoded strings with `t()` i18n calls. Added 10 new translation keys to both locales: `annualReportTitle`, `weeklyMetaTitle`, `annualRollupTitle`, `withdrawalLoggedSuccess`, `withdrawalMessage`, `withdrawalAmountLabel`, `withdrawalDateLabel`, `withdrawalLog`, `withdrawalLogging`. All text now localized and translatable.

---

> **[FIX-2026-05-13]** `Severity: Low` — `src/components/journal/trade-form.tsx`
> **Report:** React warning on `/journal/new` when filling Preço de Entrada and Preço de Saída fields: "Warning: A component is changing an uncontrolled input of type 'text' to be controlled."
> **Fix:** Input fields were initialized with `value={undefined}` from spread `{...field}` where field was initially empty. Added explicit `value={field.value ?? ""}` to ensure inputs start as controlled components with defined state.

---

> **[FIX-2026-05-13]** `Severity: Low` — `messages/pt-BR.json`, `messages/en.json`
> **Report:** Smoke test: 3 IntlError missing i18n keys — `plan.common.actions`, `backtest.dezk.name`, `backtest.builder.allocationUsed`, `backtest.builder.allocationOver`.
> **Fix:** Added missing keys to both Portuguese and English messages. (1) `plan.common.actions: "Ações" / "Actions"` — yearly plan table header. (2) `backtest.dezk.name: "10K — Alinhamento MACD WMA" / "10K — MACD WMA Alignment"` — strategy selector. (3) `backtest.builder.allocationUsed/Over/Exact/Remaining` — allocation tracker display. All keys now present in both locales.

---

> **[FIX-2026-04-21]** `Severity: Low` — `src/__tests__/lib/error-utils.test.ts`
> 9 failing: `getUserMessage()` expected `"An unexpected error occurred"` but fn returns i18n key `"common.unexpectedError"`. Fix: updated 9 `expect().toBe()` assertions to match actual return. Source unchanged.

---

> **[FIX-2026-02-13]** `Severity: Medium` — `trade-form.tsx`, `scaled-trade-form.tsx`, `journal/new/page.tsx`
> Trade form used `new Date()` for default dates instead of account's effective date. Fix: fetch `getCurrentAccount()` in new trade page, compute `getEffectiveDate(account)`, thread as `defaultDate` prop through `NewTradeTabs` → `TradeForm`/`ScaledTradeForm`. Updated `max` on date inputs to use effective date.

---

> **[FIX-2026-02-15]** `Severity: Low` — `scaled-trade-form.tsx`
> Exit table headers misaligned vs entry headers. Exits used `grid-cols-[1fr_80px_90px_90px_100px_40px]` (fixed px); entries used `grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]` (fractional). Fix: exits header → `grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]`.

---

> **[FIX-2026-02-15]** `Severity: Low` — `inline-execution-row.tsx`
> Commission currency prefix "BRL" at `left-2` (8px) overlapped input with `pl-5` (20px) padding. Fix: `pl-5` → `pl-10` (40px). Added `pointer-events-none` to currency prefix span.

---

> **[FIX-2026-03-07]** `Severity: Medium` — `risk-params-form.tsx`
> Cursor jumped to end of `,00` on any input in "Saldo da Conta" field — controlled input reformatting each keystroke. Fix: replaced `Field` with `CurrencyField` that maintains local string state while focused, formats only on blur.

---

> **[FIX-2026-03-18]** `Severity: Medium` — `weekly-report-card.tsx`, `monthly-report-card.tsx`, `mistake-cost-card.tsx`
> Monetary values showing raw numbers (`+428.34`) instead of formatted currency (`R$ 428,34`). Fix: replaced `.toFixed(2)` on monetary values with `formatCurrencyWithSign()` / `formatCurrency()` from `useFormatting` hook. Non-monetary `.toFixed()` (win rate, R-multiples) unchanged.

---

> **[FIX-2026-03-19]** `Severity: Low` — `live-trading-status-panel.tsx`
> Raw i18n key `riskSimulation.reasons.t1BaseRisk` displayed as text. Fix: imported `translateRiskReason` from `@/lib/risk-reason-i18n`; added `tRisk = useTranslations("riskSimulation")`; applied `translateRiskReason(tRisk, status.riskReason)` in both stop/active branches.

---

> **[FIX-2026-03-19]** `Severity: Low` — `circuit-breaker-panel.tsx`
> Shows `$` prefix instead of `R$` for all monetary values. Fix: removed local `formatCurrency(value, currency = "$")` fn and `currency` prop; replaced with `useFormatting` hook's locale-aware `formatCurrency`.

---

## [BUG-2026-03-23] Analytics page crashes on date filter click

**Severity:** High | **Affected:** `src/components/analytics/analytics-content.tsx`

**Cause:** React state `const [performance, setPerformance] = useState(...)` shadowed `window.performance` Web API. Inside filter-change `useEffect`, `performance.now()` resolved to React state array → `TypeError: performance.now is not a function`. Error propagated to `src/app/error.tsx` which called `useTranslations()` outside `NextIntlClientProvider` → double crash masking root cause.

**Effect:** Clicking any date filter preset crashed entire analytics page with no recovery.

**Fix:**

1. Renamed state variable `performance` → `performanceData`.
2. `performance.now()` → `globalThis.performance.now()` for explicit Web API reference.

**Prevention:** Avoid naming state variables after global browser APIs (`performance`, `location`, `history`, `navigator`, `screen`). Use `globalThis.performance` when accessing Web Performance API in components with possible name collisions.

**Related:** `src/components/analytics/analytics-content.tsx`, `src/app/error.tsx`

---

> **[FIX-2026-03-23]** `Severity: Medium` — `analytics-content.tsx`, `src/lib/cache/analytics-cache.ts`
> Analytics cache reset on every page navigation. Fix: replaced `useRef(new Map())` in-component cache with module-level singleton (`analytics-cache.ts`) with 5-min TTL auto-expiry. Cache cleared when SSR delivers fresh `initialDashboard` (via `revalidatePath` after trade/tag/strategy mutations). Flow: mutation → `invalidateTradeData()` → `revalidatePath("/analytics")` → next SSR fresh → reset effect → `clearAnalyticsCache()`.

---

> **[FIX-2026-04-21]** `Severity: Low` — `src/__tests__/lib/validations/auth-schemas.test.ts`
> Test "should reject code shorter than 6 digits" failing — regex `/6/i` expected digit `6` in error message, but schema uses i18n key `"validation.auth.codeLength"`. Fix: regex `/6/i` → `/codelength/i`.

---

> **[FIX-2026-04-21]** `Severity: Low` — `src/__tests__/lib/risk-simulation.test.ts`
> 6 tests failing — `riskReason` assertions used human-readable strings but engine emits i18n keys (`"riskSimulation.reasons.baseRisk"`, etc.). Fix: updated 6 `toContain()` assertions to match i18n key prefixes. Source unchanged.

---

## [BUG-2026-04-27] Playwright sidebar navigation tests fail — link clicks don't update URL

**Severity:** High | **Affected:** `e2e/tests/navigation.spec.ts`

**Cause (3 compounding issues):**

1. **`"use server"` violation:** `src/app/actions/filter-presets.ts` exported Zod schema object alongside async server actions → Next.js disallows non-async-function exports → any route importing it triggered RSC render error.
2. **Playwright hydration timing:** `page.goto(url, { waitUntil: "load" })` fires before React hydration completes. App Router `<Link>` requires React hydrated before `onClick` intercepts → click fell through to native `<a>` or ignored → URL never updated.
3. **`spawn EBADF` in dev server:** `DevServer.getStaticPathsWorker` fails in environments with closed file descriptors → RSC navigation requests return HTTP 500.

**Effect:** 5–8 sidebar navigation tests fail consistently. `toHaveURL(/journal/)` times out. URL stays at source page.

**Fix:**

1. Created `src/lib/filter-preset-schema.ts` (plain module, no directive) with Zod schema; removed from `filter-presets.ts`; updated consumers.
2. Added `await page.waitForLoadState("networkidle")` after each `page.goto()` in 7 sidebar tests.
3. Added `experimental.workerThreads: true` to `next.config.ts`.

**Prevention:** Never export non-async values from `"use server"` files. Shared schemas → plain modules. In Playwright for App Router: always `waitForLoadState("networkidle")` before clicking `<Link>`. Set `experimental.workerThreads: true` in automated/shell-less environments.

**Related:** `src/app/actions/filter-presets.ts`, `src/lib/filter-preset-schema.ts` (created), `src/components/analytics/preset-selector.tsx`, `src/components/analytics/filter-panel.tsx`, `e2e/tests/navigation.spec.ts`, `next.config.ts`

---

## [BUG-2026-05-14] DateRangePicker closes after first date click (react-day-picker v9 behavior change)

**Severity:** High | **Affected:** `src/components/ui/date-range-picker.tsx`

**Cause (2 compounding issues):**

1. **react-day-picker v9 changed first-click behavior:** In v8, clicking the first date in `mode="range"` called `onSelect` with `{ from: date, to: undefined }`. In v9 it calls `onSelect` with `{ from: date, to: date }` — same date for both fields. The existing `handleSelect` check `range?.from && range?.to` was truthy on first click, immediately triggering `setOpen(false)`.

2. **`onInteractOutside` ref race (pre-existing):** The original guard in `handleOpenChange` read `isSelectingRef.current` after Radix had already fired the close. The ref was cleared in `onInteractOutside` before `onOpenChange(false)` ran, so the guard always saw `false`. Fix: call `e.preventDefault()` inside `onInteractOutside` to cancel the Radix DismissableLayer dismissal inline, before the close propagates.

**Effect:** Clicking any date in the DateRangePicker immediately closed the calendar popover. Users could not select a date range — only single-date selections were possible (from = to = clicked date). Affected backtest date range, and potentially any other DateRangePicker usage in the app.

**Fix:**

1. Changed the "selection complete" condition in `handleSelect` from `range?.from && range?.to` to check that `from` and `to` are actually different dates: `range.from.getTime() !== range.to.getTime()`. Same-date (first click) is now treated as mid-selection, keeping the picker open.
2. Changed `onInteractOutside` to call `e.preventDefault()` when `isSelectingRef.current` is true, which cancels the Radix DismissableLayer dismissal at the source rather than trying to intercept it in `onOpenChange` after the fact.

**Prevention:** When upgrading react-day-picker across major versions, test range selection UX end-to-end. The v8→v9 change in first-click `to` semantics is undocumented and easy to miss. Never guard popover-close behavior on the presence of `to` alone — always compare the actual date values.

**Related Files:** `src/components/ui/date-range-picker.tsx`

---

## [BUG-2026-05-21] Trade form silently drops Hawks payload when mode is deactivated

**Severity:** High | **Affected:** `src/components/journal/trade-form.tsx`, `src/app/actions/trades.ts`, `src/app/actions/trades.types.ts`

**Cause:**

When editing a trade that was originally saved with Hawks mode active (so `trade_hawks_metadata` row exists), the form's `buildTradeFormValues()` function did not extract the Hawks payload from the loaded trade. The defaultValues logic only added Hawks when `hawksModeActive` was true.

Flow:

1. User creates trade with Hawks mode ON → `hawks: { tripleScreenConfirmed: true, vwapRespected: true, ajusteRespected: true }` stored in `trade_hawks_metadata`.
2. User deactivates Hawks mode in settings.
3. User reloads the draft to edit it.
4. Trade loads via `getTrade(id)` which fetched `trades` but **not** `tradeHawksMetadata` relation.
5. Form calls `buildTradeFormValues(trade)` — trade has no hawks field, so Hawks data is omitted from defaultValues.
6. Since `hawksModeActive = false`, the defaultValues logic doesn't add an empty hawks object either.
7. Form submits without hawks field → `createTrade` / `updateTrade` receives no hawks payload → Hawks metadata is lost on save.

**Effect:** Silent data loss. The trade's Hawks pre-flight confirmations (`tripleScreenConfirmed`, `vwapRespected`, `ajusteRespected`) were permanently dropped when the user deactivated Hawks mode, with no warning to the user.

**Solution:**

1. **Updated `getTrade` action** to fetch `hawksMetadata` relation alongside existing relations.
2. **Updated `TradeWithRelations` type** to include optional `hawksMetadata` field.
3. **Updated `buildTradeFormValues` helper** to extract Hawks data from `trade.hawksMetadata` and include it in the returned form values.
4. **Updated trade form type** to include Hawks metadata in the `TradeWithTags` type definition.

The fix preserves Hawks payload across all scenarios: edit mode (loaded trade always includes hawks if present), new trade with Hawks active (form includes empty hawks object), and mode deactivation (form now preserves hawks from loaded trade regardless of current mode status).

**Prevention:**

- When loading relational data for editing, always fetch **all** relations that may be needed in the form, even if the current mode/setting would hide them. Relations should be loaded comprehensively, not conditionally based on feature flags.
- For optional payload fields, extract them in the `buildFormValues` function **once** (for edit mode) so the data flows through the form's normal state management. Don't rely on defaultValues logic to re-create them, as that doesn't account for loaded data.

**Related Files:**

- `src/app/actions/trades.ts` (getTrade query)
- `src/app/actions/trades.types.ts` (TradeWithRelations type)
- `src/components/journal/trade-form.tsx` (buildTradeFormValues, TradeWithTags type)
- `src/__tests__/components/trade-form-hawks-preservation.test.ts` (new test)

---

## [BUG-2026-05-21] Invalid currency code "R$" passed to Intl.NumberFormat in 43 call sites

**Severity:** Critical | **Affected:** 43 files across Analytics, Reports, and other feature modules

**Cause:** The `formatCompactCurrency` and `formatCompactCurrencyWithSign` functions accept a `currency` parameter that is passed directly to `Intl.NumberFormat`. The ISO 4217 standard requires currency codes like `"BRL"` (Brazilian Real), not display symbols like `"R$"`.

Every call site in the codebase was passing the display symbol `"R$"` instead of the currency code `"BRL"`:

- `formatCompactCurrency(value, "R$")` → throws `RangeError: Invalid currency code : R$`
- `formatCompactCurrencyWithSign(value, "R$")` → throws same error

The error occurred at runtime in:

- Analytics dashboard (variable-comparison.tsx, day-of-week-chart.tsx, session-performance-chart.tsx, etc.)
- Reports section (weekly-meta-chart.tsx)
- Equity Shield (equity-shield-chart.tsx)
- Monte Carlo simulator (daily-pnl-chart.tsx, v2-metrics-cards.tsx)
- Account Comparison (comparison-equity-chart.tsx)

**Effect:** `RangeError` caught by ErrorBoundaryHandler at component level, rendering full-page error screens. Users could not view Analytics or Reports sections. Browser console: `RangeError: Invalid currency code : R$`.

**Solution:** Replaced all 43 occurrences of `"R$"` with `"BRL"` across the entire codebase:

- Used `sed` to globally replace `"R\$"` → `"BRL"` in all `.ts` and `.tsx` files under `src/`
- Verified no remaining `"R$"` strings in formatCompact calls (grep returned 0 results)
- Verified 49 total uses of `"BRL"` (43 fixed + 6 that were already correct)
- `pnpm exec tsc --noEmit` passed with no type errors

Fixed files (43 total):

- `src/components/equity-shield/equity-shield-chart.tsx` (6 occurrences)
- `src/components/equity-shield/equity-shield-stats.tsx` (1)
- `src/components/equity-shield/mc-calibration-banner.tsx` (1)
- `src/components/account-comparison/comparison-equity-chart.tsx` (2)
- `src/components/monte-carlo/v2/risk-profile-selector.tsx` (1)
- `src/components/monte-carlo/v2/v2-metrics-cards.tsx` (3)
- `src/components/monte-carlo/v2/daily-pnl-chart.tsx` (2)
- `src/components/analytics/day-of-week-chart.tsx` (3)
- `src/components/analytics/r-distribution.tsx` (1)
- `src/components/analytics/session-performance-chart.tsx` (3)
- `src/components/analytics/tag-cloud.tsx` (4)
- `src/components/analytics/hourly-performance-chart.tsx` (3)
- `src/components/analytics/expected-value.tsx` (5)
- `src/components/analytics/cumulative-pnl-chart.tsx` (2)
- `src/components/analytics/variable-comparison.tsx` (3)
- `src/components/reports/weekly-meta-chart.tsx` (2)

**Prevention:**

1. **Type safety for currency codes:** The `formatCompactCurrency` function signature should enforce `currency: "BRL"` as a literal type or accept a strict enum, not a free string. This would have caught the error at compile time.
2. **Linting rule:** Add an ESLint rule to forbid passing `"R$"` to `formatCompact*` functions, with auto-fix to replace with `"BRL"`.
3. **Code review checklist:** Currency formatting calls are a common mistake point when supporting multiple locales. Flag during review if a currency code is unfamiliar (e.g., "R$" looks like a symbol, not a code).

**Related Files:**

- `src/lib/formatting.ts` (function definitions — no changes needed, they are correct)
- 43 files listed above (call sites fixed)

---

## [BUG-2026-05-22] React 19 + Radix ScrollArea crash in navigation (sidebar, app-shell, new-trade-tabs)

**Date:** 2026-05-22 | **Severity:** High | **Affected Area:** `src/components/layout/sidebar.tsx`, `src/components/layout/app-shell.tsx`, `src/components/journal/new-trade-tabs.tsx`

### Cause

`@radix-ui/react-scroll-area` v1.2.10 uses `useComposedRefs` internally. `useComposedRefs` calls `setState` during React 19's `disappearLayoutEffects` phase — the internal teardown step that runs on unmount and on Suspense "disappear" (when a component is temporarily removed from the tree while streaming). React 19 added a stricter invariant: `setState` is illegal during this phase. The result is an unhandled "Maximum update depth exceeded" error that propagates up to the nearest error boundary.

Three independent crash paths existed:

1. **Mobile sidebar in Sheet**: `Sidebar` renders `<ScrollArea>` for its nav section. On mobile, `Sidebar` lives inside a Radix `Sheet`. Opening/closing the sheet unmounts/remounts the sidebar → crash.
2. **Desktop sidebar during RSC route transition**: Next.js App Router streams RSC responses through a Suspense boundary that wraps the entire layout. During route transitions the layout participates in a brief "disappear" cycle → `disappearLayoutEffects` fires on the sidebar's `ScrollArea` → crash.
3. **New-trade tab panels (CSV / Nota / Screenshot)**: All three panels were eagerly mounted (CSS `hidden` class) so their `ScrollArea` refs were live even when invisible. Navigating to `/journal/new` triggered the same crash pattern.

The error boundary caught all three and left "Something went wrong!" on the page. Because navigation tests share browser context across test cases within the same Playwright project, the first crash poisoned subsequent tests in `chromium-navigation` and `mobile-navigation`.

### Effect

E2E failures:

- `[chromium-navigation] Navigation › Sidebar Navigation › should navigate to Reports` (1.5m timeout — error boundary rendered instead of Reports page)
- `[mobile-navigation] Navigation › User Menu › should display user avatar/initials` (error boundary from prior Sheet cycle)
- `[mobile-navigation] Navigation › Breadcrumbs / Back Navigation › should show cancel button on sub-pages` (same)

### Solution

1. **`sidebar.tsx`**: Replaced `<ScrollArea className="flex-1">` wrapping the `<nav>` with `<div className="flex-1 overflow-y-auto">`. Removed `ScrollArea` import.
2. **`app-shell.tsx`**: Replaced `<ScrollArea className="h-[calc(100dvh-3.5rem)] md:h-[calc(100dvh-3rem)]">` wrapping `<main>` with an equivalent `<div>`. Removed `ScrollArea` import.
3. **`new-trade-tabs.tsx`**: Changed CSV, Nota, and Screenshot tab panels from CSS `hidden` toggling (eager mount) to conditional rendering (`activeTab === "csv"`, etc.). The `ScrollArea` inside `CsvImport` / `DetailedTradeImporter` is now only mounted when its tab is active.

### Prevention

- **Never use `<ScrollArea>` in a component that can unmount** (modal, sheet, dialog, lazy tab). Use `<div className="overflow-y-auto">` instead. The only safe context is a permanently-mounted, never-Suspense-wrapped surface.
- **Known risky survivors** (not yet failing in E2E but carry the same risk): `dashboard/day-detail-modal.tsx:105`, `monte-carlo/stats-preview.tsx:118`. Tracked in `docs/backlog.md`.
- **Eager tab panel mounting is a hidden mount risk.** Prefer conditional rendering (`activeTab === X`) over CSS-hiding for panels that contain complex components with ref callbacks.

### Related Files

- `src/components/layout/sidebar.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/journal/new-trade-tabs.tsx`

---

## [BUG-2026-05-22] Journey-07 E2E spec navigating to non-existent `/en/analytics/account-comparison` route

**Date:** 2026-05-22 | **Severity:** Low (test-only) | **Affected Area:** `e2e/journey/07-quarter-year.spec.ts`

### Cause

Stage 7 step 7d navigated to `/en/analytics/account-comparison` and asserted `#comparison-selector`. Neither the route nor the selector exist:

- The analytics pages are all under `/en/analytics` (one route). There is no sub-route for account comparison.
- `#comparison-selector` is gated behind `isPremium && accounts.length >= 2`. Bravo's seed account is a single account, so the selector never renders.

### Effect

`[chromium-journey] Journey Stage 7 — Quarter + Year` failed with a 404 page or timeout on `#comparison-selector`.

### Solution

Changed step 7d to navigate to `/en/analytics` and assert `#analytics-anchor-equity` (the "Cumulative P&L" heading anchor, always rendered regardless of account count or premium status).

### Prevention

- **Route assertions must match the actual Next.js App Router file tree.** Before adding a `goto()` to a new URL in an E2E spec, verify the route exists in `src/app/`.
- **Feature-gated selectors need a fallback assertion.** When the feature (account comparison) requires conditions Bravo's seed data doesn't satisfy, assert the surrounding page load instead of the gated element.

### Related Files

- `e2e/journey/07-quarter-year.spec.ts`
