# /impeccable sweep — reports (`/reports`)

**Date:** 2026-05-12
**Wave / row:** 2 — Heavy data, row #9
**Register:** product (app UI)
**Scope:** `/reports` route + 9 widgets it renders (`reports-content`, `weekly-report-card`, `monthly-report-card`, `mistake-cost-card`, `commission-fee-impact-card`, `weekly-meta-chart`, `annual-rollup-table`, `capital-event-log`, `withdrawal-calculator`, `r-distribution-tab`).

---

## Preflight — scene

Solo trader at 10 p.m. Sunday, end-of-week ritual. They open `/reports` to do two distinct jobs in one sitting: (1) **weekly post-mortem** ("did I do what I said I would this week?") via WeeklyReportCard + MonthlyReportCard, and (2) **monthly bookkeeping** ("how much do I owe in IR, what's my YTD picture, do I need to log a withdrawal?") via the annual rollup + tax section + capital-event log. Mentorship students often hit this page on Monday morning before their accountant call. The page must speak in **structured authority** — section boundaries that read clean, money badges that don't lie about direction, decision-grade tables that survive PDF export.

---

## Phase 1a — critique

### P0 — `reports-content.tsx` side-stripe borders on 3 section headers (absolute ban)

Lines 123, 180, 236 — each major section heading uses:

```tsx
<div className="border-acc-100 pl-s-300 flex items-center justify-between border-l-2">
```

This is the canonical **side-stripe pattern** from the impeccable absolute-ban list: _"`border-left` or `border-right` greater than 1px as a colored accent on cards, list items, callouts, or alerts. Never intentional."_

The bronze itself is correct in spirit — three section boundaries ("Annual Report", "Impostos", "R Distribution") are genuine navigational anchors. The geometry is wrong.

Fix: replace the stripe with a **leading bronze 1.5×1.5 round dot** + neutral pl. Preserves the earned-bronze section signal as a "leading icon" (allowed rewrite per the rule), retires the banned stripe.

```tsx
<div className="gap-s-300 flex items-center justify-between">
	<div className="gap-s-200 flex items-center">
		<span className="bg-acc-100 h-1.5 w-1.5 rounded-full" aria-hidden="true" />
		<h2 className="text-txt-200 text-tiny tracking-wider uppercase">…</h2>
	</div>
</div>
```

### P0 — `capital-event-log.tsx` deposit/withdrawal toggle paints category as P&L

Lines 93-114 — the segmented toggle for `formType` paints:

- Selected "Deposit" → `bg-trade-buy text-bg-100` (green-filled)
- Selected "Withdrawal" → `bg-acc-100 text-bg-100` (bronze-filled)

Three problems compounding:

1. **Deposit is not profit.** Painting `bg-trade-buy` on a capital inflow recodes "money in" as "profit made," misleading the trader at the exact moment they're separating broker performance from capital structure.
2. **Bronze double-anchor.** The "Log" submit button below (line 136-142) is itself `bg-acc-100 text-bg-100` — the primary CTA. Painting the Withdrawal toggle bronze too means two bronze anchors compete in the same form.
3. **List badges mirror the same hijack.** Lines 162-168 paint event-list badges `bg-trade-buy/20 text-trade-buy` for deposit, `bg-acc-100/20 text-acc-100` for withdrawal — category recoded as P&L color again.

Fix:

- Toggle selected state → `bg-bg-100 text-txt-100` (neutral elevation, clearly "this is the chosen segment" without competing with the bronze submit). Unselected stays `bg-bg-200 text-txt-300`.
- List badges → both neutral (`bg-bg-100 text-txt-200`). The label text itself (`t("depositLabel")` / `t("withdrawalLabel")`) carries the differentiation — no need to recode it as color.

### P1 — `weekly-report-card.tsx` & `monthly-report-card.tsx` — prev/next buttons missing accessible names

Both cards have icon-only navigation buttons that read as bare "button" to screen readers:

- `weekly-report-card.tsx` lines 106-114 (ChevronLeft prev), 116-124 (ChevronRight next)
- `monthly-report-card.tsx` lines 113-121 (ChevronLeft prev), 123-131 (ChevronRight next)

The visible week/month label between the two buttons orients sighted users, but the buttons themselves carry no accessible name.

Fix: add `aria-label` on each button (`t("previousWeek")` / `t("nextWeek")` / `t("previousMonth")` / `t("nextMonth")`) and `aria-hidden="true"` on the icons. Translation keys should already exist — fall back to `tCommon("previous")` / `tCommon("next")` if not.

### P1 — `capital-event-log.tsx` & `withdrawal-calculator.tsx` — form error uses `text-trade-sell`

- `capital-event-log.tsx:145` — `<p className="text-trade-sell text-tiny col-span-full">{formError}</p>`
- `withdrawal-calculator.tsx:128` — same pattern for `error`.

Validation errors are not P&L magnitude. The project has a dedicated `--color-fb-error` token (and `text-fb-error` class) for form/feedback errors. Same family as the rank-as-P&L collision retired in row #8 — trade colors must mean "this trade's signed money," nothing else.

Fix: `text-trade-sell` → `text-fb-error`.

### P2 — Decorative icons missing `aria-hidden`

Surveying all touched files for Lucide icons without `aria-hidden`:

- `reports-content.tsx:85` — BarChart2 in empty state. **Already has `aria-hidden="true"`** ✓
- `weekly-report-card.tsx` — ChevronLeft, ChevronRight, Loader2, Download, TrendingUp (line 290), TrendingDown (line 332). All decorative.
- `monthly-report-card.tsx` — ChevronLeft, ChevronRight, Loader2, Download, TrendingUp (line 215), TrendingDown (line 234), Calendar (line 270). All decorative.
- `mistake-cost-card.tsx` — AlertTriangle (lines 34, 52). Header text says "Mistake Cost Analysis," icon is decorative.
- `commission-fee-impact-card.tsx` — Receipt (lines 105, 123). Header text says "Commission & Fee Impact," icon is decorative. TrendingUp/TrendingDown/Minus in monthly-trend (lines 237-253) **already have `aria-label`** ✓ (semantic — convey trend direction).

Fix: add `aria-hidden="true"` to all icons in the first four bullets.

### P2 — `capital-event-log.tsx` and `withdrawal-calculator.tsx` use raw `<input>` / hardcoded English copy

- `capital-event-log.tsx` lines 116, 127 — raw `<input>` elements. The codebase has `@/components/ui/input` but this card was built before the primitive lock-in. Working but stylistically off.
- `withdrawal-calculator.tsx` — multiple hardcoded English strings ("Based on your…", "Amount (R$)", "Date", "Log Withdrawal", "Logging…", "Withdrawal logged successfully.", "Enter a valid amount greater than zero", "Failed to log withdrawal"). Should be `useTranslations`.

Both defer to backlog — touchy refactors that aren't visual misfires.

### P2 — Inline `formatBRL` helpers bypass the formatting hook

- `weekly-meta-chart.tsx:36-42` — defines its own `formatBRL`.
- `annual-rollup-table.tsx:24-34` — defines its own `formatBRL`.
- `capital-event-log.tsx:174` & `withdrawal-calculator.tsx:74` — inline `new Intl.NumberFormat("pt-BR", …)`.

The project has `useFormatting()` hook (used in 4 of the other widgets here) that respects user locale + currency preference. Hardcoded `pt-BR` + R$ in these four spots breaks the locale-switching path for English-speaking users.

Defer to backlog — i18n cleanup.

### P2 — Card-stack rhythm (carryover)

`/reports` stacks 7 surfaces top-to-bottom: weekly+monthly grid, mistake-cost, commission-fee-impact, annual section (rollup + chart + withdrawal calc + capital log), tax section, R-distribution. All but the section dividers use `border-bg-300 bg-bg-200 rounded-lg border`. Same uniform-card-stack observation as `/analytics` and `/analytics/account-comparison`. Scope-extends the existing backlog distill entry — no new item.

---

## Phase 1b — audit

### P1 — `weekly-report-card.tsx` & `monthly-report-card.tsx` — Download button icon

Both download buttons have `aria-label={t("downloadPdf")}` on the Button wrapper but the Download icon lacks `aria-hidden`. Add it.

### P2 — `annual-rollup-table.tsx` `border-acc-100/20` bottom-border on column-group headers

Lines 153, 160, 167, 174 — colgroup headers use `border-acc-100/20` bottom-border. Mild bronze elevation on what's structurally a table header underline. Not a stripe (it's a bottom-border on a header row, which is conventional table chrome), but the `acc-100/20` tint borrows brand color for structural lines. Leave for now — table chrome convention overrides theme purity here.

### P2 — Semantically-correct usages to KEEP

- `weekly-report-card.tsx` topWins/topLosses trade-buy/trade-sell on pnl — canonical signed P&L.
- `monthly-report-card.tsx` bestDay/worstDay trade-buy/trade-sell on pnl — canonical signed P&L.
- `commission-fee-impact-card.tsx` trade-sell on fees (line 132) — fees are direct cost-on-money, displayed as a negative number; this is the rare "signed magnitude" case where trade-sell on a non-P&L scalar is semantically accurate.
- `weekly-meta-chart.tsx` bars colored by `resultado >= 0 ? trade-buy : trade-sell` — canonical signed bar.
- `r-distribution-tab.tsx` bars colored `bg-acc-100` — single-series distribution, bronze as chart-lead. Canonical earned-bronze.
- `annual-rollup-table.tsx` `CellBRL highlight` on resultadoLiquido column + totals — canonical signed-magnitude.

---

## Phase 1 — Cross-cutting themes

1. **Side-stripe borders as section dividers** — first time we hit the absolute-ban geometry in this sweep wave. `reports-content.tsx` is the only offender, but it offends three times.
2. **Category recoded as P&L color (again)** — `capital-event-log.tsx` deposit-toggle hijack is the same family as the rank-as-P&L pattern in `/analytics/account-comparison` and the threshold-as-magnitude pattern in `/analytics`. Trade colors must mean signed money. Nothing else.
3. **Icon-only nav buttons without accessible names** — both report cards. Quick fix, but a real WCAG failure for keyboard-only / screen-reader users.
4. **Form errors using trade-sell** — `fb-error` exists for a reason. Recurring with `capital-event-log` + `withdrawal-calculator`.

---

## Phase 2 — system-level extracts

No new shared primitives. The leading-bronze-dot section header pattern in `reports-content.tsx` could plausibly become a `<SectionDivider>` primitive, but it appears in only one file and the three usages are inline-readable. Premature abstraction. If a second page picks it up, extract then.

---

## Phase 3 — corrections (this slice)

Files touched:

1. `src/components/reports/reports-content.tsx` — replace 3 side-stripe section dividers with leading bronze-dot pattern.
2. `src/components/reports/weekly-report-card.tsx` — `aria-label` on prev/next, `aria-hidden` on decorative icons.
3. `src/components/reports/monthly-report-card.tsx` — `aria-label` on prev/next, `aria-hidden` on decorative icons.
4. `src/components/reports/mistake-cost-card.tsx` — `aria-hidden` on AlertTriangle (2 places).
5. `src/components/reports/commission-fee-impact-card.tsx` — `aria-hidden` on Receipt (2 places).
6. `src/components/reports/capital-event-log.tsx` — neutralize deposit/withdrawal toggle + badges; swap `text-trade-sell` error → `text-fb-error`.
7. `src/components/reports/withdrawal-calculator.tsx` — swap `text-trade-sell` error → `text-fb-error`.

Deferred to backlog:

- `capital-event-log.tsx` raw `<input>` → `@/components/ui/input` migration.
- `withdrawal-calculator.tsx` hardcoded English copy → `useTranslations`.
- Inline `formatBRL` helpers in `weekly-meta-chart.tsx` + `annual-rollup-table.tsx` and inline `Intl.NumberFormat` calls in `capital-event-log.tsx` + `withdrawal-calculator.tsx` → consolidate behind `useFormatting()`.

---

## Phase 4 — register check (product)

Heavy data, reference register. No motion/copy/bolder/overdrive. Skipped intentionally.

---

## Sign-off

- `pnpm lint` — 0 errors
- `pnpm exec tsc --noEmit` — clean
- Backlog updated with the three deferred items
- Runbook row #9 marked done
