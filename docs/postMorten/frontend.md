# Frontend Post-Mortem Log

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
