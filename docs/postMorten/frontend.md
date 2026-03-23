# Frontend Post-Mortem Log

---

> **[FIX-2026-02-13]** `Severity: Medium` — **Affected:** `src/components/journal/trade-form.tsx`, `src/components/journal/scaled-trade-form.tsx`, `src/app/[locale]/(app)/journal/new/page.tsx`
> **Report:** "The replay date is from January and on create a new trade it is from today, February 13th"
> **Fix:** The trade form used `new Date()` for default entry/exit dates instead of the account's effective date. Added `getCurrentAccount()` fetch to the new trade page, computed effective date via `getEffectiveDate(account)`, and threaded it as `defaultDate` prop through `NewTradeTabs` → `TradeForm` / `ScaledTradeForm`. Also updated the `max` attribute on date inputs to use the effective date instead of real today.

---

> **[FIX-2026-02-15]** `Severity: Low` — **Affected:** `/src/components/journal/scaled-trade-form.tsx`
> **Report:** "Exit table headers misaligned compared to entry headers in scaled position form"
> **Fix:** The exits section header used `grid-cols-[1fr_80px_90px_90px_100px_40px]` (fixed pixel widths) while the entries header and `InlineExecutionRow` both used `grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]` (fractional widths). Changed exits header to match: `grid-cols-[4fr_2fr_3fr_2fr_3fr_1fr]`.

---

> **[FIX-2026-02-15]** `Severity: Low` — **Affected:** `/src/components/journal/inline-execution-row.tsx`
> **Report:** "Commission currency placeholder 'BRL' overlaps with input value in the commission column"
> **Fix:** The input had `pl-5` (20px left padding) which was insufficient for 3-character currency codes like "BRL" positioned at `left-2` (8px). Increased to `pl-10` (40px) for adequate clearance. Also added `pointer-events-none` to the currency prefix span to prevent it from blocking input clicks.

---

> **[FIX-2026-03-07]** `Severity: Medium` — **Affected:** `src/components/risk-simulation/risk-params-form.tsx`
> **Report:** "When typing any number in the 'Saldo da Conta' input field, the cursor drags to the end of ',00', blocking the user from typing"
> **Fix:** Replaced all currency `Field` usages with a new `CurrencyField` component that maintains local string state while focused and only formats on blur. See `~/.claude/post-mortems/react.md` for the general pattern (controlled input cursor jump on reformat).

---

> **[FIX-2026-03-18]** `Severity: Medium` — **Affected:** `src/components/reports/weekly-report-card.tsx`, `src/components/reports/monthly-report-card.tsx`, `src/components/reports/mistake-cost-card.tsx`
> **Report:** "Reports page components display monetary values without currency formatting — raw numbers like +428.34 instead of R$ 428,34 or $428.34"
> **Fix:** Replaced all `.toFixed(2)` calls on monetary values (netPnl, grossPnl, totalFees, avgWin, avgLoss, bestTrade, worstTrade, daily/weekly/asset pnl, trade pnl, mistake costs) with `formatCurrencyWithSign()` for P&L values and `formatCurrency()` for absolute values, using the `useFormatting` hook. Removed manual `+`/`-` prefixes since `formatCurrencyWithSign` handles sign display. Left non-monetary `.toFixed()` calls (win rate, profit factor, R-multiples) unchanged.

---

> **[FIX-2026-03-19]** `Severity: Low` — **Affected:** `src/components/command-center/live-trading-status-panel.tsx`
> **Report:** "Raw i18n key `riskSimulation.reasons.t1BaseRisk` displayed as text in Live Trading Status panel instead of translated string"
> **Fix:** Imported `translateRiskReason` from `@/lib/risk-reason-i18n` and added a `tRisk = useTranslations("riskSimulation")` hook. Applied `translateRiskReason(tRisk, status.riskReason)` in both the stop-trading and active-trading branches where `status.riskReason` was rendered raw as a `subLabel`.

---

> **[FIX-2026-03-19]** `Severity: Low` — **Affected:** `src/components/command-center/circuit-breaker-panel.tsx`
> **Report:** "Circuit Breaker card shows `$` prefix instead of `R$` for all monetary values (P&L Diario, P&L Mensal, Meta, Limite Mensal, Risco Diario Restante)"
> **Fix:** Removed the local `formatCurrency(value, currency = "$")` function and `currency` prop. Replaced with `useFormatting` hook's locale-aware `formatCurrency` which correctly resolves to `R$` for pt-BR locale. Removed all `currency` parameter references from `formatCurrency` calls throughout the component.

---

## [BUG-2026-03-23] Analytics page crashes when clicking date filter ("This Month")

**Date:** 2026-03-23
**Severity:** High
**Affected Area:** `src/components/analytics/analytics-content.tsx`

### Cause
The React state variable `const [performance, setPerformance] = useState(...)` shadowed the global `window.performance` Web API. Inside the filter-change `useEffect`, the code called `performance.now()` to measure fetch timing. JavaScript resolved `performance` to the React state array (`PerformanceByGroup[]`) instead of the global Performance API, causing `TypeError: performance.now is not a function`.

The error propagated up to `src/app/error.tsx`, which itself called `useTranslations()` from next-intl. Because the error boundary rendered outside the `NextIntlClientProvider` context during the error recovery path, the error boundary also crashed with "Failed to call `useTranslations` because the context from `NextIntlClientProvider` was not found."

### Effect
Clicking any date filter preset (e.g., "This Month", "This Week") crashed the entire analytics page with no recovery possible. The error boundary's own crash masked the real root cause, making it appear to be an i18n provider issue.

### Solution
1. Renamed the state variable from `performance` to `performanceData` to eliminate the shadowing.
2. Changed `performance.now()` calls to `globalThis.performance.now()` for explicit reference to the Web Performance API, preventing any future shadowing.

### Prevention
- Avoid naming state variables after global browser APIs (`performance`, `location`, `history`, `navigator`, `screen`).
- Use `globalThis.performance` instead of bare `performance` when accessing the Web Performance API in components that may have variable name collisions.
- See `~/.claude/post-mortems/javascript.md` for the general variable shadowing rule.

### Related Files
- `src/components/analytics/analytics-content.tsx`
- `src/app/error.tsx`

---

> **[FIX-2026-03-23]** `Severity: Medium` -- **Affected:** `src/components/analytics/analytics-content.tsx`, `src/lib/cache/analytics-cache.ts`
> **Report:** "Analytics client cache resets on every page navigation -- switching from /analytics to /journal and back always re-fetches from DB"
> **Fix:** Replaced `useRef(new Map())` in-component cache with a module-level singleton cache (`src/lib/cache/analytics-cache.ts`) that survives component unmount/mount cycles. The module cache has 5-minute TTL auto-expiry. Cache is cleared when SSR delivers fresh `initialDashboard` props (triggered by `revalidatePath` after trade/tag/strategy mutations). Server-side invalidation flow: mutation -> `invalidateTradeData()` -> `revalidatePath("/analytics")` -> next SSR is fresh -> reset effect fires -> `clearAnalyticsCache()`.
