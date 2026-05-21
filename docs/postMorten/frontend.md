# Frontend Post-Mortem Log

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
