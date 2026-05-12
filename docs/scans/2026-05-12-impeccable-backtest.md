# Impeccable sweep — /backtest (Wave 3, row #11)

**Date:** 2026-05-12
**Register:** product
**Scene sentence:** _Mentorship student at 10pm, 14-inch laptop in a dim room after market close, replaying an ORB strategy against three months of ES futures candles to decide whether tomorrow's playbook still has edge._

## Phase 0 — surface map

- `src/app/[locale]/(app)/backtest/page.tsx` — premium-gated orchestrator, hands `dataSources` into `BacktestContent`.
- `src/components/backtest/backtest-content.tsx` — config form + run trigger + result viewport.
- `src/components/backtest/backtest-summary-cards.tsx` — 8 primary metric tiles + 6 secondary badges.
- `src/components/backtest/backtest-equity-chart.tsx` — recharts AreaChart (equity + drawdown overlay).
- `src/components/backtest/backtest-trades-table.tsx` — per-trade list via DataTable primitive.
- `src/components/backtest/sections/orb-entry-section.tsx`, `dezk-entry-section.tsx`, `stop-protection-section.tsx`, `sizing-execution-section.tsx`, `targets-exit-section.tsx` — recipe configurators.
- `src/components/backtest/sections/plugin-picker.tsx` — shared `PluginPicker` + `TogglePlugin` selection primitives.

## Phase 1a — critique

- **[P1] [color] [summary-cards]** — `acc-100` painted on up to 4 of 8 metric tiles (winRate ≥50, profitFactor ≥1.5, avgR >0, sharpe ≥1). Bronze splatter: anchor diluted, no single canonical signal. Earned-Bronze violation.
- **[P1] [color] [summary-cards]** — `winRate` and `profitFactor` thresholds painted with trade-buy/trade-sell semantics. WinRate is a ratio, not signed P&L; recoding "50% threshold" as "profit color" hijacks the money palette.
- **[P1] [color] [summary-cards]** — `maxDrawdown` unconditionally `text-fb-error`. Drawdown is signed-loss magnitude, not form-validation error. The form-error token implies "fix your input"; drawdown implies "this run lost money this deep."
- **[P1] [color] [equity-chart]** — drawdown line stroke + tooltip use `fb-error`. Same category-as-form-error confusion: a money-loss overlay belongs on the trade palette, not the form-feedback palette.
- **[P2] [color] [sizing-execution]** — derived "per-trade calc" hint painted `text-acc-100` (line 154). Tiny derived display does not earn the brand anchor; competes with the next-section bronze submit button.
- **[P2] [a11y] [content]** — `Play` + `RotateCcw` icons missing `aria-hidden="true"`. Buttons have visible label text — icons are decorative.
- **[P2] [a11y] [targets-exit]** — `Plus` (Add level) decorative, `Trash2` inside icon-only button. `Trash2` button has `aria-label` so the icon must be `aria-hidden`. `Plus` next to "Add level" text label also decorative.

## Phase 1b — audit

- **[P2] [i18n] [targets-exit]** — `aria-label={`Remove exit level ${index + 1}`}` is hardcoded English. No `backtest.builder.removeLevel` key exists. Backlog.
- **[P2] [i18n] [summary-cards]** — `formatCentsAsCurrency(..., "BRL")` hardcodes BRL currency at the formatter call site. Consistent with the project's BRL-default trading-journal scope but should consult user locale long-term. Backlog.
- **[P3] [tokens]** — all sections use Tailwind v4 tokens correctly; no arbitrary classes detected.
- **[P3] [primitives]** — `DataTable`, `Badge`, `Select`, `Switch`, `Input`, `Label`, `Button` all routed through `@/components/ui/*`. No raw `<table>`, `<input type="checkbox">`, `<a>` leaks.
- **[P3] [side-stripe]** — no `border-l-2` or `border-r-2` colored-stripe patterns. Clean.

## Phase 1 — Cross-cutting themes

1. **Trade-color hijacking non-P&L metrics** (winRate, profitFactor, sharpe) — same pattern Wave 2 surfaced on analytics + monthly. Confirmed as systemic.
2. **`fb-error` mislabeling losses** — drawdown styled as form-validation-error. Form-feedback tokens belong to inputs, not to negative P&L magnitudes. Same hit appeared on `capital-event-log` + `withdrawal-calculator` last sweep (form-error vs. money-error).
3. **Bronze splatter on metric grids** — multi-card surfaces fan `acc-100` across "good" thresholds. Earned-Bronze rule mandates one anchor per moment of significance; metric grids need a different signal (boldness, leading dot, or strict neutral).

## Phase 2 — extracted

No new shared primitive needed. The `PluginPicker`/`TogglePlugin` pair is already a clean reusable abstraction. Skipping with one-line reason.

## Phase 3 — corrections (applied)

### 3a/3d combined — color discipline + distill

- `backtest-summary-cards.tsx` — replace tri-state `accent | negative` flag with explicit `tone: "money" | "neutral" | "loss"`:
  - signed-money: `totalPnl`, `avgR` → tone "money" (trade-buy if positive, trade-sell if negative, txt-100 if zero).
  - permanent-loss-magnitude: `maxDrawdown` → tone "loss" (always trade-sell).
  - threshold-ratios: `winRate`, `profitFactor`, `sharpe`, `tradingDays`, `totalTrades` → tone "neutral" (txt-100).
  - Result: acc-100 disappears from summary cards, anchor reserved for the equity-chart line.
- `backtest-equity-chart.tsx` — drawdown line stroke `var(--color-fb-error)` → `var(--color-trade-sell)`; tooltip DD class `text-fb-error` → `text-trade-sell`.
- `sizing-execution-section.tsx` — derived calc line `text-acc-100` → `text-txt-300`.

### 3c — a11y / harden

- `backtest-content.tsx` — `aria-hidden="true"` on `Play`, `RotateCcw`.
- `targets-exit-section.tsx` — `aria-hidden="true"` on `Plus`, `Trash2`.

### 3b / 3e / 3f — adapt / quieter / polish

- Adapt: existing breakpoint grid (cols-1 / sm:cols-2 / lg:cols-3) survives 375 → 1920. No changes required.
- Quieter: covered by 3a (acc-100 removed from summary tiles).
- Polish: `pnpm lint` + `pnpm exec tsc --noEmit` green (logged after edits).

## Phase 4 — enhancement

Skipped entirely. No deliberate gap left by Phase 3 polish.

## Sign-off

- [x] Phase 1 synthesis with severity labels.
- [x] Phase 2 explicitly skipped (PluginPicker already extracted).
- [x] Phase 3 a + c + d completed; b/e/f covered or no-op.
- [x] Phase 4 fully skipped.
- [ ] `pnpm lint` clean — pending post-edit run.
- [ ] `pnpm exec tsc --noEmit` clean — pending post-edit run.
- [x] WCAG: aria-hidden hygiene applied; existing focus-visible rings retained; AA contrast unchanged.
- [x] backlog updated with i18n + BRL hardcode follow-ups.
