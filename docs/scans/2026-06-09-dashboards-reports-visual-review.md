# Visual Review — Dashboards & Reports

**Date**: 2026-06-09
**Reviewer**: Claude (Sonnet)
**Environment**: Production (`https://axion-bravo.vercel.app`)
**Account**: Hawks Pro (149 trades, R$88.9K cumulative P&L, Jan–May 2026)
**Viewport**: 1440×900 desktop + 390×844 mobile
**Pages**: `/` (Painel), `/command-center`, `/analytics`, `/reports`

> Screenshots saved at the project root as `review-0[1-7]-*.png` for visual reference.

---

## Severity legend

- 🔴 **BLOCKER** — numeric / correctness bug. Erodes user trust in the data.
- 🟠 **MAJOR** — visible UX issue that hurts core flow (information hierarchy, accessibility).
- 🟡 **MINOR** — polish / consistency, low-leverage but easy to fix.

---

## Cross-cutting findings (touch multiple pages)

### 🔴 C1. Locale prefix lost on internal navigation

Navigating from `/pt-BR/reports` resolves to `/reports` (locale dropped). Navigating from `/en/login` while authenticated redirects to `/` and renders pt-BR even if the user picked English. Source: Next.js `middleware` likely defaults to negotiated `Accept-Language` instead of persisting the user's last selection.

**Fix**: Persist user locale in a cookie on first selection; middleware should prefer cookie > URL prefix > Accept-Language. See `src/middleware.ts` and `src/i18n/request.ts`.

### 🔴 C2. Hard-coded English strings leaking into pt-BR pages

Found in production with browser in pt-BR:

| Location                         | String                                             | Should be                                       |
| -------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| `/analytics` chart title         | "Cumulative P&L"                                   | "P&L Acumulado"                                 |
| `/analytics` Distribuição de R   | "1R to 1.5R"                                       | "1R a 1.5R"                                     |
| `/reports` R-distribution header | "R DISTRIBUTION — 2026"                            | "DISTRIBUIÇÃO DE R — 2026"                      |
| `/reports` R-distribution bins   | "< -1R", "-1R to 0", "0 to 1R", "1R to 2R", "≥ 2R" | "< -1R", "-1R a 0", "0 a 1R", "1R a 2R", "≥ 2R" |

Already aligns with the `2026-06-02 i18n deep sweep` (memory log) findings — these are the missed conditional / chart-axis strings. **Fix**: extract via `useTranslations()` (next-intl).

### 🔴 C3. Two identical metric panels with contradicting visual treatments

- `/analytics` → "Distribuição de R" — histogram, red→neutral→green color encoding, ⓘ tooltips, sample size in header.
- `/reports` → "R DISTRIBUTION — 2026" — bar list, **all bars same gold color**, no win/loss encoding, no tooltips.

Same data, two implementations. Tradezella / Edgewonk use a single distribution component reused everywhere with consistent semantics. **Fix**: Consolidate into a `<RDistribution variant="histogram|bar" />` component.

### 🟠 C4. KPI cards lack a consistent visual language

The 6 dashboard KPIs (P&L, Capital, Win Rate, Profit Factor, Avg R, Discipline) each use a different visualization style:

- P&L → sparkline
- Capital → text-only with delta
- Win Rate → donut
- Profit Factor → text with sub-stats
- Avg R / Discipline → horizontal bar gauge

This forces the eye to re-parse each card. TraderVue and Tradezella both use a strict KPI template: large number, small delta, single optional micro-chart, same color rules across the row. **Fix**: Pick one of (a) all cards have sparkline, (b) all cards have meter, (c) all text-only. Reserve charts for the next row.

### 🟠 C5. Zero values rendered as green (positive)

`$0.00` / `R$ 0,00` is shown in the same green as profitable values across the Circuit Breaker card, KPI cards, and DARF table. Zero is **neutral**, not positive. This breaks the at-a-glance color signal that traders rely on.

**Fix**: In `src/lib/format/money.ts` (or wherever the formatting wrapper lives), classify `value > 0 → green`, `value < 0 → red`, `value === 0 → muted/neutral foreground`.

### 🟠 C6. Mobile layout broken below `md` breakpoint

At 390×844 (iPhone 13/14):

- Sidebar stays visible permanently → eats ~50% of horizontal space.
- KPI cards collapse to a 2-column grid with content clipped: "TX ACERT[O]", "DISCIPL[INA]", "CAPITA[L]".
- Numbers truncate: "R$88.[9K]".
- Calendar day labels mash together: "SegTerQuaQuiSex" (no spacing).
- Filter dropdowns clipped at the right edge.

Per the existing `2026-05-11-responsiveness.md` scan this category was flagged before but the sidebar fix never landed.

**Fix**: Hide sidebar behind hamburger `<768px`; KPI grid `grid-cols-2 md:grid-cols-3 lg:grid-cols-6`; calendar day header `gap-1`.

### 🟡 C7. Account-selector page is information-poor

Each card shows `<Account Name>` + `<accountType>` (e.g. "Personal / personal") — second line duplicates first. No balance, no last-trade date, no current day P&L. For a trader who switches accounts daily this is a missed opportunity.

**Pattern reference**: Topstep / Apex dashboards show per-account "today's P&L", "open positions", and "risk used" right on the switcher. **Fix**: each row → name + ticker emoji (already done for prop) + day P&L + 7-day sparkline.

---

## Page-specific findings

### Painel ("/") — Dashboard

🔴 **D1. "P&L Diário Líquido" chart shows "Nenhum dado disponível"** while Total de Trades = 149 and equity curve renders ~149 points. Data source mismatch — either the chart uses a different period than the rest of the page or the daily-rollup aggregation isn't joined. Check `getAnalyticsDashboard` action vs `daily_pnl_aggregate`.

🔴 **D2. Profit Factor mismatch — 5.34 vs 5.00** on the same page. Top KPI card shows "FATOR LUCRO 5.34"; right-column quick metrics show "Fator de Lucro 5.00". Likely the two read from different scopes (lifetime vs. filtered period) but **no label disambiguates them**. Either reconcile to one source or add scope labels.

🟠 **D3. "Pior Dia" shows "R$1K" with no minus sign** (color is red, value reads as positive). Accessibility issue (colorblind users can't tell loss from gain) and reads incorrectly to anyone scanning fast. **Fix**: prefix with `-` or wrap in parens: `-R$1K` / `(R$1K)`.

🟠 **D4. Date format inconsistency**: subtitle in Command Center uses `2026-06-09` (ISO); KPI cards use `R$88.9K` (BR thousand-separator); equity curve uses `13 de jan.` (BR short). ISO date in a pt-BR user-facing context is unusual. Standardize to `9 de jun de 2026` or `09/06/2026`.

🟠 **D5. Equity curve Y-axis ticks unevenly spaced**: R$2.5K, R$32.5K, R$62.5K, R$92.5K, R$107.7K. 30K-30K-30K-15.2K intervals. Either snap to clean intervals (0, 25K, 50K, 75K, 100K) or hide the final tick. Recharts auto-tick can usually do this with `domain={[0, 'dataMax']}` and `tickCount`.

🟠 **D6. Trade calendar wastes vertical space** — large empty tiles with just a number. Industry standard (Tradezella, TraderVue) overlays daily P&L as colored backgrounds (green = win day, red = loss day, intensity = magnitude). Also include a trade count badge per day.

🟡 **D7. Coaching Hawks "Entrada sem tripla confirm..." truncated** with ellipsis next to a red "Alerta" badge. Either drop the badge inline (move to row end) or allow 2-line wrap. Currently the truncated label is the only place the insight name lives until you expand the row.

🟡 **D8. Performance por Sessão chart is flat** — bars look identical because the range is too wide for the data (avg R per session: 0.79 / 0.80 / 0.95 / 0.95 across a -1.15R..+1.15R Y-axis). Reduce domain or convert to delta-bars from the overall mean (centering on 0).

### Central de Comando ("/command-center") — Command Center

🔴 **CC1. Inconsistent "max trades today"** — top card says "0 of 3 trades today"; Circuit Breaker card just below says "Trades 0 / 2 — Max: 2". Two different daily-trade-cap values from the same source. One is reading from a stale config / different profile. Check `getDailySummary` vs `getCircuitBreakerStatus`.

🔴 **CC2. Stale CTA copy** — info banner says "Link one [risk profile] in the **Plan tab** to see live trading guidance." Memory log notes: "Plan tab was removed from Command Center — standalone routes only." So the CTA points to a tab that no longer exists; user follows it and lands nowhere.

🟠 **CC3. Per-Asset Rules table can't tell "no limit configured" from "explicit no-max"** — all unfilled cells render `-`. Bias dropdown also shows `-` inside it, blending with empty cells. **Fix**: empty cells → empty / `–` (en-dash, muted); explicitly-set "no limit" → `∞` or "Sem limite". Configured-no-limit and unconfigured should never look identical in a risk table.

🟠 **CC4. Three action icons (+ shuffle trash) with no labels or tooltips** in the per-asset row. Trash is universal; + is ambiguous ("add what?"); shuffle is opaque. **Fix**: `aria-label` + `<Tooltip>` on each. Better — collapse to a `…` overflow menu with explicit labels.

🟠 **CC5. Daily bias card is one tall stack of every pre-session ritual** (bias toggle + 5 triple-screen checks + notes textarea + save). At 1440px the right half of the card is empty. **Fix**: 2-column layout — left: bias + checks; right: notes + risk preview. Or split the card.

🟡 **CC6. "Today" date navigator lacks an actual date** — back/forward arrows + label "Today" only. Traders reviewing yesterday's day need to see "Mon, Jun 9" beside the label so they know they're viewing today vs another date.

🟡 **CC7. Empty Pre-Market & Post-Market Notes cards** show the same string ("Create a monthly plan to set your risk parameters") — but that's not what those sections are for. Pre-market is for setup notes; post-market is for retrospective. Replace with section-specific empty-state CTAs.

🟡 **CC8. "Pre-Market Notes" card is an orphan in the third row** while Post-Market Notes shares a row with Daily Checklist. Reflow to 3-column or merge the two notes cards.

### Análises ("/analytics") — Analytics

🔴 **A1. Hard-coded English chart title** "Cumulative P&L" — see C2.

🟠 **A2. Cumulative P&L chart appears empty** — visible Y-axis with ticks but no rendered line (or line is so close to baseline it's invisible). Likely a domain/scale issue. The same data renders fine on the dashboard equity curve, so it's a per-chart config drift.

🟠 **A3. Performance by Hour bar chart Y-axis is symmetric** (-1.66R..+1.66R) but all data is positive. Half the chart is wasted. Same issue on Performance por Dia da Semana, Análise por Tempo de Permanência. **Fix**: in `Recharts.YAxis`, set `domain={['auto', 'auto']}` or compute a data-driven domain instead of `[-max, +max]`.

🟠 **A4. Day-of-week chart includes Sunday** despite B3 being closed on weekends. Empty bar at "Dom" position takes up space and signals false data. Filter out weekends (Mon–Fri) for B3 accounts.

🟠 **A5. Heat-map color legend missing** — Hora × Dia heatmap uses red/green intensity but never tells the user what the intensity encodes (P&L, trade count, win-rate?). Add a discrete legend strip below the grid.

🟠 **A6. Heat-map subtitle duplicated** — "Identifique suas janelas de operação mais e menos lucrativas" appears once below the title and once again at the bottom of the card. Likely a render-twice bug in the empty-state vs populated-state branches.

🟠 **A7. Tag analysis shows 16 tags, all with count 0** while account has 149 trades and visible tagged trades elsewhere. Either tagging isn't joined or the aggregation is broken.

🟡 **A8. Tag names render in snake_case** (`htf_60m_aligned`, `keltner_outer_breach`) — internal naming bled to user UI. Map to human-readable labels via a localization layer.

🟡 **A9. Account-comparison chip widths inconsistent** — "Hawks Backtest 2026 personal" overflows its chip while "Personal personal" fits. Set a consistent `min-w`; allow wrap if needed.

### Relatórios ("/reports") — Reports

🔴 **R1. SAME PAGE, CONTRADICTING TOTALS**

- "Consolidado Anual" table total row: Bruto R$ 88.940,00 / DARF Devido R$ 16.693,50.
- "Resumo Anual 2026" below: Resultado Bruto R$ 0,00 / Total Taxas -R$ 0,00 / DARF Pendente -R$ 0,00.
- "Carga Fiscal sobre Resultado Bruto: 0.0%" (should be ~18.8% based on the table above).

**This is the highest-priority bug.** The "Resumo" widget pulls from a different source — most likely the `monthly_tax_ledger` (Phase 1 BR Tax Engine — empty for Hawks Pro on prod) — while the consolidated table reads from `account_monthly_aggregate` (populated). Either join the two sources or hide the Resumo when ledger is empty. Right now the page contradicts itself in a way a tax filing review can't survive.

🔴 **R2. "Este Mês" report shows "maio 2026"** when current date is 2026-06-09. Either the label says "Este Mês" (this month) but value reads "maio" (May, last month), OR the user has paginated back and the label didn't update. Two likely fixes: (a) auto-default to current month (June) unless explicitly paginated; (b) update label to "Mês Selecionado" when user paginates.

🔴 **R3. Bruto == Líquido in Consolidado table** despite the DARF card listing Tx Corretagem / Tx Registro / Emolumentos / ISS as line items. Bruto and Líquido should differ by those costs. Either fees aren't being aggregated to the monthly view (likely seed-data gap on prod) or the formula is wrong.

🟠 **R4. Negative-zero rendered as "-R$ 0,00"** in DARF card (Tx Corretagem, Tx Registro, Emolumentos, ISS, Prejuízo Compensado, IRRF). When value is exactly 0, drop the sign. `Intl.NumberFormat` with the right `signDisplay: 'auto'` will do this.

🟠 **R5. Annual table forecasts future months as if real**: Jun–Dez rows show "Mês Anterior R$ 138.940" identically — visually loud but they're carry-forwards, not data. **Fix**: mute future-month rows (50% opacity) or em-dash the value columns.

🟠 **R6. R DISTRIBUTION bars all gold (theme color)** instead of red→green by R bin. See C3. Strip the `getChartColor()` and color each bar by sign of bin: `< 0 → chart-5 (red)`, `0 to 1R → chart-6 (neutral)`, `≥ 1R → chart-3 (green)`.

🟠 **R7. "IR Bruto (20%)" hard-coded rate** — for swing/position trades the rate is 15%. The label should respect the user's `accountFeeRates.taxRate` setting. (Already a known issue per `2026-05-04` memory log on tax-engine completeness.)

🟡 **R8. DARF table has no visual hierarchy** between aggregates (Resultado Bruto, Resultado Líquido, Base de Cálculo IR, IR Bruto, DARF a Pagar) and adjustments (Tx Corretagem, Tx Registro, etc.). Bold the aggregates; lighten the adjustments. Visual rhythm matters when 10 line items stack.

🟡 **R9. Consolidado table column headers wrap awkwardly** at 1440px — "DARF Devido", "Aporte Inicial", "Capital Invest." truncated. Either widen the grid (give the table its own scroll) or rotate header text 45°.

🟡 **R10. "Aporte Inicial" / "Retirada" columns always em-dash** for this account → consider hiding when 100% empty.

---

## Industry comparison — what other trade platforms do well

`★ Insight ─────────────────────────────────────`
None of the comparisons below mean "copy them" — they're reference points for how the trader audience already expects information to be organized. Axion's edge is the Hawks system specificity (triple-screen, OCO, Renko bias); the leverage is keeping that edge while adopting the proven information-hierarchy patterns.
`─────────────────────────────────────────────────`

### TraderVue (the OG trade journal — 2010+)

- **Strict KPI row** at top of dashboard: 6–8 cards, all text-only with single delta. No mixed chart styles.
- **Calendar with daily P&L overlay** — green/red intensity from net daily PnL, count badge in corner.
- **Equity curve as the dominant element**, takes ~60% of viewport width with drawdown shading overlaid.
- **Cleanly separates "all time" from "this period"** with a global date scope picker at top right.

> Axion gaps: D5, D6, the "scope label" ambiguity in D2 / Profit Factor.

### Tradezella (the modern challenger — 2020+)

- **Hour × Day heatmap with discrete legend strip and dropdown for what's encoded** (Net P&L vs Win Rate vs Trade Count vs R Multiple).
- **R-distribution histogram with red/green binning by sign** and a vertical dashed line at "Expected R" (EV).
- **Account selector inline in the header** (no separate page) with current-day P&L next to the account name.
- **Setup/Mistake tags** are first-class — analytics filtered by tag in one click.

> Axion gaps: A5, A7, A8, C7, R6, and the duplicated R-Distribution treatment (C3).

### Edgewonk (the most analytical — 2014+)

- **Edge-quality scoring component** that shows formula + computed value + sample size on the same card.
- **Mistake-cost tracker** rolled up by tag with monetary impact ("If you had skipped revenge-trades you'd be +R$12K").
- **Equity curve with annotations** (peaks, drawdowns, regime changes) — the trader can scrub the chart.

> Axion's "Expectativa de Edge (R)" card already does the formula thing well — this is the existing strongest pattern in the app and could be the template for other transparency-friendly metrics.

### TradingView (the platform — not a journal, but the design vocabulary)

- **Status pill in header**: market open/closed, time-to-close, current session.
- **Scope chips that always show the active filter chip count** ("Período: This Year · Estratégia: 2 selecionadas").
- **Number formatting respects locale** consistently (no ISO-vs-BR mixing).

> Axion gaps: D4, C7. Adding a market-status pill in the Command Center header would be a 1-day win.

### Topstep / Apex / FTMO dashboards (prop-firm patterns)

- **Risk-remaining gauges** as the dominant UI: "$2,000 of $3,000 left today" with a horizontal bar that depletes as the day progresses.
- **Hard ceilings rendered as a wall**: trade limit, daily loss limit, weekly limit — each with a visible threshold the user can't miss.
- **Single status indicator** at top: "✓ ON TRACK" / "⚠ WARNING" / "✕ BLOCKED".

> Axion's Circuit Breaker card already aspires to this but reads as a stat card, not a gauge. Major opportunity: turn "Remaining Daily Risk $2,000" into a horizontal progress bar (used / available) with the threshold color-coded.

---

## Recommended fix priority

### Wave 1 — Trust (this week)

1. 🔴 **R1**: Fix Annual Summary vs Consolidado totals. Decide on one source of truth.
2. 🔴 **CC1**: Reconcile daily-trade-cap value between header card and Circuit Breaker.
3. 🔴 **D2**: Either reconcile or label-disambiguate the two Profit Factor values.
4. 🔴 **C2**: Sweep i18n leaks (4 strings minimum) — Cumulative P&L, R DISTRIBUTION, R-bin "to" → "a".
5. 🔴 **C5**: Zero values render neutral, not green. Single fix in money formatter.

### Wave 2 — Hierarchy (next week)

6. 🟠 **C4**: Pick one KPI card visual language. Reskin 6 cards.
7. 🟠 **CC5 / CC7 / CC8**: Restructure Command Center cards.
8. 🟠 **A3 / A4**: Tighten chart domains, drop Sundays.
9. 🟠 **D3**: Add minus sign / parens to negative monetary values.
10. 🟠 **R4 / R5 / R6**: Negative-zero, mute future months, recolor R-distribution bars.

### Wave 3 — Mobile + polish

11. 🟠 **C6**: Hide sidebar on mobile, reflow KPI grid, fix calendar headers.
12. 🟡 **CC2**: Remove stale "Plan tab" reference (or restore the tab — whichever matches current product intent).
13. 🟡 **CC6**: Add actual date next to "Today" navigator.
14. 🟡 **C7**: Enrich account-selector rows with day P&L + sparkline.
15. 🟡 **A5**: Heatmap legend strip.

### Wave 4 — Pattern adoption (1–2 weeks)

- **R-remaining as gauge** (Topstep pattern) — Command Center hero card.
- **Calendar with daily P&L overlay** (Tradezella pattern) — Painel.
- **Heat-map metric switcher** (Tradezella) — Analytics.
- **Market-status pill** (TradingView) — global header.

---

## Open questions for product

1. Is the "Resumo Anual 2026" widget meant to read from `monthly_tax_ledger` (live tax ledger) or from `account_monthly_aggregate` (rolled-up trades)? Currently the gap is invisible to the user but produces R$ 0,00 vs R$ 16.693,50.
2. Should the dashboard KPI scope default to "lifetime" or to the active period filter? Whichever is chosen, every card should respect it — currently Profit Factor disagrees with itself across the same page.
3. Should the account-selector ALSO show day P&L per account, or do we want to keep it visually minimal as a first-time / re-auth step?
4. Mobile: is the trader expected to use Axion on a phone, or only desktop? Right now mobile is unusable below 768px — if it's not a target, hide the route on mobile and show a "Open on desktop" screen.
