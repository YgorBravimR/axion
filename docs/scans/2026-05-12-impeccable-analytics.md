# /impeccable sweep — analytics (`/analytics`)

**Date:** 2026-05-12
**Wave / row:** 2 — Heavy data, row #7
**Register:** product (app UI)
**Scope:** `/analytics` route + 13 widgets it renders (`analytics-content`, `variable-comparison`, `tag-cloud`, `expected-value`, `r-distribution`, `cumulative-pnl-chart`, `hourly-performance-chart`, `day-of-week-chart`, `time-heatmap`, `session-performance-chart`, `session-asset-table`, `holding-period-chart`, `expectancy-mode-toggle`). Filter panel + preset selector are out of scope for palette discipline (chrome only).

---

## Preflight — scene

Solo trader at 5:35 p.m. ET, market just closed. Coffee on the desk, twelve trades logged today, four-week R-streak ending tonight. They open `/analytics` to compare today against the rolling 30-day baseline and to spot anything decaying: a fading session, a strategy losing edge, a tag bleeding R. The page is post-mortem reference; the user reads it once, then closes it. It must speak in P&L magnitudes, not in cheering.

---

## Phase 1a — critique

### P0 — `tag-cloud.tsx` paints setup/mistake/general as trade-buy/trade-sell/acc-100

`getTagTypeColor` (line 23) and the inline ternary on the detailed-stats table badge (line 322) duplicate the exact anti-pattern retired on `/journal/[id]`: setup = green-as-good, mistake = violet-as-bad, general = bronze-as-premium. Tag _type_ is a category label, not a P&L outcome. The trader will read this against actual P&L magnitudes on the same row and the colour-collision drowns the real signal.

Fix: adopt the existing `TradeTag` from `src/components/journal/trade-badges.tsx` for the detailed-stats table cell, and recolour `getTagTypeColor` (cloud tiles) with the same palette discipline:

- `setup` → `border-bg-300 bg-bg-300/40` (neutral surface)
- `mistake` → `border-warning/40 bg-warning/10` (severity-amber)
- `general` → `border-bg-300 bg-bg-200` (dim neutral)

### P0 — `variable-comparison.tsx` bronze leaks

- Line 237: `getBarColor` returns `acc-100` for the `tradeCount` metric. Bronze on every bar of a count chart is decorative — and the bar height already encodes the count. Demote to `txt-200`.
- Line 50: `HeaderWithTooltip` tooltip body text uses `text-acc-100`. Tooltips are reference text, not "moments of significance." Demote to `text-txt-100`.

ProfitFactor coloring (≥1 → trade-buy, <1 → trade-sell) **stays** — PF crossing 1 is the canonical outcome boundary, same shape as win/loss-count.

### P0 — `r-distribution.tsx` bronze on mode bucket

Line 165 paints the mode bucket label `text-acc-100`. The mode is descriptive ("most trades land in the 0.5R bucket"), not a primary KPI. Bronze here is chrome. Demote to `text-txt-100`.

### P0 — `cumulative-pnl-chart.tsx` hardcoded RGB literals

Lines 107 and 129: gradient `stopColor` uses `rgb(0, 255, 150)` and `rgb(128, 128, 255)` — token-bypass. Replace with `var(--color-trade-buy)` and `var(--color-trade-sell)` directly in `stopColor` (stopOpacity is already set, so dropping `rgb()` keeps the same visual).

### P0 — winRate ≥ 50 threshold coloring (recurring)

Same anti-pattern in **four** files: `day-of-week-chart.tsx:71`, `hourly-performance-chart.tsx:56`, `time-heatmap.tsx:345`, `session-performance-chart.tsx:89`, `holding-period-chart.tsx:68`. WinRate above 50 ≠ a magnitude — it's a threshold the user already understands without colour reinforcement, and the surrounding P&L value carries the actual signal. Demote winRate to neutral (`text-txt-100`).

### P0 — best/worst summary labels colored as outcomes

In `day-of-week-chart.tsx`, `hourly-performance-chart.tsx`, `holding-period-chart.tsx`, `time-heatmap.tsx`: the best/worst summary lines paint the time label (day name, hour text, bucket label) in trade-buy/trade-sell. The label itself isn't a P&L magnitude — only the metric value is. Demote labels to neutral; the metric value retains its canonical trade-colour. (The "Best Window" / "Worst Window" column headers in time-heatmap stay coloured — those are explicit outcome category labels and the icons reinforce them.)

### P1 — `session-asset-table.tsx` double-bronze

Best-session highlight tile uses `bg-acc-100/10` at line 168, _and_ the Trophy badge uses `bg-acc-100/10 text-acc-100` at line 191. Two bronze halos per row dilute the anchor. Keep the Trophy badge (canonical bronze: trophy = moment of significance), demote the tile highlight to `bg-bg-100`.

### P2 — uniform card stack (repeat)

Eleven sibling cards across the page (variable comparison, equity, EV, R-dist, tags, heatmap+session, session-asset table, hourly+day-of-week, holding period), all with identical `border-bg-300 bg-bg-200 rounded-lg` chrome. Already captured in the existing backlog distill entry — adding this page to its scope rather than adding a new item.

### P2 — InsightCard is dead code

`src/components/analytics/insight-card.tsx` is not exported via `index.ts` and grep finds no consumers. Best/worst summaries are inlined per chart. Punt deletion to backlog so the next sweep can ship it cleanly.

---

## Phase 1b — audit

### P1 — decorative icons missing `aria-hidden`

- `expected-value.tsx`: TrendingUp, TrendingDown, Calculator, Info (× ~5).
- `r-distribution.tsx`: BarChart3, Info (× ~4).
- `variable-comparison.tsx`: Info (×6).
- `day-of-week-chart.tsx`, `hourly-performance-chart.tsx`: no icons in the body, no action needed.
- `session-asset-table.tsx`: Trophy.
- `session-performance-chart.tsx`: TrendingUp / TrendingDown (× ~2).
- `expectancy-mode-toggle.tsx`: Info.

All decorative; add `aria-hidden="true"` consistently.

### P1 — `expectancy-mode-toggle.tsx` redundant tabIndex={0}

The three `<button>` elements explicitly set `tabIndex={0}` — buttons are already in the tab order by default, and redundant `tabIndex={0}` is noise. Remove. (The onKeyDown handlers for Enter / Space are also redundant on `<button>` — it already invokes the click handler on Space/Enter via the user agent — but removing them is a refactor concern, not an audit one. Leave for distill.)

### P1 — `session-performance-chart.tsx` and `holding-period-chart.tsx` ChartContainer ids OK

No ID drift — both follow the `chart-analytics-<slug>` convention.

### P2 — semantically correct trade-colour usages to KEEP

Documented so the next agent doesn't over-correct:

- All chart bar fills colored by sign of metric (`expected-value`, `r-distribution`, `variable-comparison`, `day-of-week-chart`, `hourly-performance-chart`, `session-performance-chart`, `holding-period-chart`) — canonical P&L magnitude.
- All tooltip P&L / avgR colored by sign — canonical.
- Heatmap cell fills (`time-heatmap.tsx`) by sign × intensity — canonical.
- Best/Worst window column headers in `time-heatmap.tsx` — canonical outcome category labels with icon reinforcement.
- `analytics-content.tsx` compare-accounts Link in bronze — canonical "discover premium" anchor; this is the page's one earned-bronze.
- `expectancy-mode-toggle.tsx` `bg-acc-100 text-bg-100` on active mode — canonical primary-CTA bronze.

---

## Phase 1 — Cross-cutting themes

1. **The "is this thing profitable?" colour ladder** keeps showing up — winRate ≥ 50, profitFactor ≥ 1, bestX vs worstX labels. We've now formalised the rule: trade colours encode **signed magnitude**, not thresholds and not categorical "good vs bad" labels. Threshold severity → neutrals.
2. **Tag categories (setup/mistake/general)** are a system-wide reuse opportunity — `journal/trade-badges.tsx` already has the right palette. Wire analytics into it.
3. **Hardcoded RGB literals** for gradient stops bypass the token system. Same problem will likely live in reports / monthly equity charts — flag for next page.

---

## Phase 2 — system-level extracts

`TradeTag` already exists from the journal-detail sweep (`src/components/journal/trade-badges.tsx`). This sweep is a consumer-only refactor for the table-row badge in `tag-cloud.tsx`.

The cloud-tile chip in `tag-cloud.tsx` keeps a custom shape (it varies in size by trade count), so it stays inline — but with the same palette as the shared badge.

---

## Phase 3 — corrections (this slice)

Files touched:

1. `src/components/analytics/tag-cloud.tsx` — recolour `getTagTypeColor`, adopt `TradeTag` for detailed-stats table cell.
2. `src/components/analytics/r-distribution.tsx` — demote mode bronze, aria-hidden pass.
3. `src/components/analytics/variable-comparison.tsx` — demote tradeCount bronze, retire bronze tooltip text, aria-hidden pass.
4. `src/components/analytics/cumulative-pnl-chart.tsx` — replace hardcoded RGB with CSS variables.
5. `src/components/analytics/day-of-week-chart.tsx` — demote winRate threshold, demote best/worst label colour, keep metric colour.
6. `src/components/analytics/hourly-performance-chart.tsx` — same shape.
7. `src/components/analytics/time-heatmap.tsx` — demote winRate threshold, demote day/hour label cells (keep header), keep cells/headers as canonical.
8. `src/components/analytics/session-performance-chart.tsx` — demote winRate threshold, aria-hidden pass.
9. `src/components/analytics/session-asset-table.tsx` — demote bronze tile highlight, keep Trophy badge bronze.
10. `src/components/analytics/holding-period-chart.tsx` — demote winRate threshold, demote bestBucket/worstBucket label.
11. `src/components/analytics/expectancy-mode-toggle.tsx` — drop redundant tabIndex, aria-hidden on Info.
12. `src/components/analytics/expected-value.tsx` — aria-hidden pass only.

---

## Phase 4 — register check (product)

Heavy data, reference register. No motion enhancement, no copy delight, no bolder/overdrive. Skipped intentionally.

---

## Sign-off

- `pnpm lint` — 0 errors
- `pnpm lint:strict` — 0 errors (450 pre-existing phase-in warnings on unrelated files, none introduced)
- `pnpm exec tsc --noEmit` — clean

All twelve files in the manifest landed. Cross-cutting findings (winRate threshold pattern, InsightCard deletion candidate, uniform card stack) appended to `docs/backlog.md`.
