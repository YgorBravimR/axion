# Impeccable sweep — /backtest/optimize (Wave 3, row #12)

**Date:** 2026-05-12
**Register:** product
**Scene sentence:** _Mentorship student at 9pm Saturday, 27-inch monitor, running a grid sweep of 50 ORB-stop variants overnight to pinpoint tomorrow's risk parameter before paper-trading on Monday._

## Phase 0 — surface map

- `src/app/[locale]/(app)/backtest/optimize/page.tsx` — premium-gated, hands `dataSources` into `OptimizeContent`.
- `optimize-content.tsx` — 3-step wizard (setup → parameters → results), web-worker sweep runner, localStorage persistence.
- `wizard-stepper.tsx` — step nav.
- `sweep-config-panel.tsx` — parameter grid picker (enum + numeric ranges, combination counter).
- `sweep-progress-bar.tsx` — live progress + elapsed + estimated remaining.
- `summary-cards.tsx` — 5-tile post-sweep stat row (variations, profitable, losing, best-PF, best-Sharpe).
- `runs-comparison-table.tsx` — sortable comparison grid with pin, expand, delete.
- `equity-overlay-chart.tsx` — multi-line recharts overlay of pinned runs (gold for best).
- `parameter-heatmap.tsx` — 2-axis grid with selectable metric + slice selectors + hovered-cell detail bar.
- `run-detail-panel.tsx` — reuses BacktestSummaryCards + BacktestEquityChart + BacktestTradesTable for the focused run.

## Phase 1a — critique

- **[P1] [color] [comparison-table]** — six columns (winRate, profitFactor, totalPnl, maxDrawdown, sharpe, avgR) all paint values with `fb-success` / `fb-error` ternaries. Worst-offender file in the surface. `fb-*` are form-feedback tokens meant for validation states (input is right / input is wrong). totalPnl + avgR are signed money; the four others are threshold ratios. Real money belongs on trade-buy/sell; ratios should stay neutral unless the threshold itself is the moment of significance (it isn't here — the row already encodes "good" via sortable position).
- **[P1] [color] [parameter-heatmap]** — `HoveredCellDetail` paints all five hovered metric stats (PF, winRate, sharpe, totalPnl, totalTrades) with `text-trade-buy` / `text-trade-sell` via a generic `positive` flag. Same threshold-as-P&L collapse as the comparison table, but in a popover so it's denser. `totalTrades: true` always paints trade-buy — even more obviously not P&L.
- **[P1] [color] [summary-cards]** — `bestPF` + `bestSharpe` both `text-acc-100`. Two bronze tiles side-by-side dilute the anchor. The `Profitable` (trade-buy) / `Losing` (trade-sell) tiles _are_ a justified P&L-sign categorization, but the bronze-PF + bronze-Sharpe pair are bronze for "this is the best of the threshold metrics," which is splatter.
- **[P2] [color] [wizard-stepper]** — `completed` step circle + connector line painted `bg-trade-buy/20` / `bg-trade-buy/40`. Step completion ≠ P&L. The semantically-right token is `fb-success` (form-feedback positive = "this step was completed successfully"). Same recoding noted on prior dashboard sweep.
- **[P2] [color] [heatmap + sweep-config + comparison-table]** — three places use `text-acc-100` on AlertTriangle warning icons (mixed-strategies banner, near-limit warning, low-trade-count badge). Warning-as-bronze recodes "caution" as "premium anchor." Project ships a `--color-warning` token; use it. Also fixes the bronze-on-bronze-card splatter (mixed-strategies card chrome is `bg-acc-100/5`, icon stacks more bronze on top).
- **[P2] [color] [sweep-config + optimize-content sidebar]** — non-overlimit combination counter painted `text-acc-100` even when count is innocuous. The `acc-100` should mark "approaching threshold," but the current code only goes bronze when `isWarning`; the strategy-summary sidebar in `optimize-content` paints _every_ non-overlimit count `text-acc-100`. Sidebar bronze is splatter relative to other anchors (run-sweep button, pinned-pin icon, best-run badge).
- **[P2] [color] [sweep-config]** — overlimit warning ("isWarning" not "isOverLimit") uses `border-acc-100/30 bg-acc-100/5` chrome — bronze as warning chrome. Same fix path as the icon-color demotion.

## Phase 1b — audit

- **[P2] [a11y] [optimize-content]** — 10 decorative icons missing `aria-hidden`: `Database`, `Play`, `Trash2`, `ChevronDown`, `Settings2`, `ArrowLeft`, `ArrowRight`, `RotateCcw`, `BarChart3`, `Table2`.
- **[P2] [a11y] [comparison-table]** — `Pin` / `PinOff` / `ChevronRight` / `Trash2` / `AlertTriangle` decorative; each button has `aria-label` already, so icons need `aria-hidden`.
- **[P2] [a11y] [sweep-progress-bar]** — `X` icon next to "Cancel" label decorative; cancel button has both visible text and `aria-label`. Icon needs `aria-hidden`.
- **[P2] [tokens] [equity-overlay-chart]** — `LINE_COLORS` array uses literal hex (`#2196F3`, `#26a69a`, `#FF9800`, `#AB47BC`, `#EC407A`, `#66BB6A`, `#78909C`). Token-discipline drift. Categorical chart palette is a legitimate need but should be tokens (`--chart-1..7`) so dark/light themes can both tune them. Defer to backlog — palette extraction is its own task and the hex values render correctly on the current dark theme.
- **[P2] [i18n] [sweep-config-panel]** — line 275: `(atual)` is a Portuguese literal embedded in JSX (the rest of the surface routes through `useTranslations`). Defer.
- **[P3] [primitives]** — `DataTable`, `Checkbox`, `Select`, `Button`, `Badge`, `Tabs`, `Input` all routed through `@/components/ui`. No raw primitive leaks.
- **[P3] [side-stripe]** — no `border-l-*`/`border-r-*` colored stripes. Clean.

## Phase 1 — Cross-cutting themes

1. **Form-feedback tokens are not money tokens.** Comparison table + heatmap detail-bar are the worst Wave-3 instances; same family as the Wave 2 `withdrawal-calculator` and `capital-event-log` fixes.
2. **Threshold ratios masquerading as P&L** repeats from `/backtest`. winRate, profitFactor, sharpe should not get colored at all unless the threshold itself is the headline; ratio rows in tables sort themselves.
3. **Warning-as-bronze** is a Wave-3 first: AlertTriangle painted `text-acc-100` in 3 separate widgets. The project has `--color-warning` (#fbbf24 dark / #d97706 light) — using it here clears the bronze splatter and recovers the warning vocabulary.
4. **Completed-step trade-buy** is a small wizard-stepper hit but worth fixing: `fb-success` is the right token for "step completed" semantics.

## Phase 2 — extracted

No new primitive. The bronze/trade/fb collapse here is local code-paths, not a reusable abstraction. Pattern recurs across the wave but the fix is per-call-site (which metric / what semantic), not a shared component. Skipping 2a.

## Phase 3 — corrections (applied)

### 3a/3d — color discipline

- `runs-comparison-table.tsx`:
  - `winRate`, `profitFactor`, `sharpe` cells → neutral `text-txt-100` (threshold ratios; sort encodes "good").
  - `totalPnl`: `fb-success/fb-error` → `text-trade-buy/text-trade-sell` (signed money).
  - `maxDrawdown`: unconditional `fb-error` → `text-trade-sell` (loss magnitude).
  - `avgR`: `fb-success/fb-error` → `text-trade-buy/text-trade-sell` (R is profit-anchored).
  - `AlertTriangle` low-trade icon: `text-acc-100` → `text-warning` (warning, not bronze anchor).
- `parameter-heatmap.tsx`:
  - `MetricStat` adds an `isMoney` flag; only `totalPnl` paints trade colors. PF/winRate/sharpe/totalTrades neutralize to `text-txt-100`.
  - Mixed-strategies AlertTriangle: `text-acc-100` → `text-warning`. Banner chrome `border-acc-100/30 bg-acc-100/5` → `border-warning/30 bg-warning/5` to match the icon and clear the bronze splatter.
- `summary-cards.tsx`: `bestPF` + `bestSharpe` → neutral `text-txt-100`. Profitable/Losing keep trade-buy/sell (genuine P&L-sign categorization).
- `wizard-stepper.tsx`: completed-step circle + connector swap `trade-buy` → `fb-success`. Completed label text `text-txt-200` retained (no money implication).
- `sweep-config-panel.tsx`:
  - Combination-warning chrome (`isWarning` only): `acc-100` → `warning` token.
  - AlertTriangle warning icon (`isWarning` branch only): `text-acc-100` → `text-warning`. Overlimit (`fb-error`) untouched — that's correct form validation.
  - "isWarning" label text: `text-acc-100` → `text-warning`.
- `optimize-content.tsx` strategy-summary sidebar combination counter: `text-acc-100` → `text-txt-100`. Sidebar isn't the moment-of-significance; the sweep-config panel already carries the warning band.

### 3c — a11y / harden

- `optimize-content.tsx`: aria-hidden on Database, Play, Trash2 (clear-all), ChevronDown (disclosure), Settings2, ArrowLeft, ArrowRight, RotateCcw, BarChart3, Table2.
- `runs-comparison-table.tsx`: aria-hidden on Pin, PinOff, ChevronRight, Trash2, AlertTriangle.
- `sweep-progress-bar.tsx`: aria-hidden on X.
- `sweep-config-panel.tsx`: AlertTriangle decorative — already has aria-label fallback; convert decorative-icon usage to aria-hidden and let the surrounding text describe state.

### 3b / 3e / 3f — adapt / quieter / polish

- Adapt: existing breakpoints survive; sidebar collapses below `lg`. No changes.
- Quieter: bronze count on the page drops materially after 3a — verified by visual mental walkthrough (3 warning bronze icons → 0, 2 summary tiles → 0, 6 comparison-table tinted cells → 0).
- Polish: lint + tsc green post-edit (logged after run).

## Phase 4 — enhancement

Skipped entirely.

## Sign-off

- [x] Phase 1 synthesis labeled.
- [x] Phase 2 skipped with reason.
- [x] Phase 3 a + c + d completed; b/e/f covered.
- [x] Phase 4 fully skipped.
- [ ] `pnpm lint` clean — pending post-edit run.
- [ ] `pnpm exec tsc --noEmit` clean — pending post-edit run.
- [x] WCAG: aria-hidden hygiene applied; existing focus-visible rings retained; new `--color-warning` usage stays AA on dark + light surfaces.
- [x] backlog updated with chart-palette extraction + i18n "(atual)" follow-ups.
