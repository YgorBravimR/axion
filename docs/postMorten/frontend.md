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
