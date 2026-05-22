# /impeccable sweep — monthly (`/monthly`)

**Date:** 2026-05-12
**Wave / row:** 2 — Heavy data, row #10
**Register:** product (app UI)
**Scope:** `/monthly` route + 6 widgets it renders (`monthly-content`, `month-navigator`, `prop-profit-summary`, `monthly-projection`, `month-comparison`, `weekly-breakdown`).

---

## Preflight — scene

Solo prop trader (FTMO / TAT mentorship) on the 1st of the month, doing payout math. They open `/monthly` to answer: "How much will my prop firm pay me this month after the split, and what will I owe in IR after that?" — the **payout calculator** job. Secondary job: "Am I on pace? How does this month compare to last?" The page must speak in **decisive single numbers** — the trader-share / net-profit pair is the headline; the projection + comparison + weekly breakdown are supporting context. Decision-grade for the payout call to the prop firm.

---

## Phase 1a — critique

### Setting expectations — this page is already clean

After 9 prior sweeps, `/monthly` is the first surface where the structural anti-patterns (rank-as-P&L, side-stripe borders, category-as-P&L hijacks, hover-only controls) are mostly absent. `MonthNavigator` already has `aria-label` on prev/next. Error states already use `fb-error` (`monthly-content.tsx:150`). Most widgets use `useFormatting()`. The work here is hygiene + one bronze-splatter fix, not a structural overhaul.

### P1 — `prop-profit-summary.tsx` bronze splatter on the 3-card payout row

Lines 67 (Wallet), 88-90 (Net Profit card chrome + Landmark icon), 115 (Building2 in breakdown):

The Net Profit card uses `border-acc-100/20 bg-acc-100/5` — canonical **earned-bronze chrome** for the key metric, exactly the right call. But two adjacent bronze icons compound on top of it:

- Card 2 "Trader Share" → `<Wallet className="text-acc-100" />` (line 67)
- Card 3 "Net Profit" → `<Landmark className="text-acc-100" />` (line 90) + the bronze card chrome

Three bronze touchpoints across the 3-card row. Bronze loses its power when it stops being the rare anchor.

Fix: demote Wallet and Landmark to `text-txt-300`. The Net Profit card's chrome (`bg-acc-100/5` tint) is the singular bronze anchor and carries the "this is the payout you actually take home" semantic on its own. Keep Building2 bronze on the breakdown sub-heading (line 115) — that's a different surface, the breakdown panel, and it's the only bronze element on that surface.

### P1 — Decorative icons missing `aria-hidden`

Surveying all touched files for Lucide icons inside aria-labeled containers or alongside their own text labels:

- `month-navigator.tsx:60` — ChevronLeft inside aria-labeled Button.
- `month-navigator.tsx:64` — Calendar adjacent to the visible month name heading.
- `month-navigator.tsx:79` — ChevronRight inside aria-labeled Button.
- `month-comparison.tsx:26,29,31` — ArrowUp/ArrowDown/Minus inside `ChangeIndicator`. The sign of the change value (`+5.2pp`, `-1.5R`) already conveys direction to screen readers; the arrow is decorative redundancy for sighted users.
- `month-comparison.tsx:109,125` — GitCompare on h3 "Comparison" heading.
- `monthly-projection.tsx:28` — TrendingUp on h3 heading. Heading text says "Projection."
- `monthly-projection.tsx:37` — CalendarDays inside "X days traded of Y" text row.
- `prop-profit-summary.tsx:46,48` — TrendingUp/TrendingDown next to "Gross Profit" label. The signed amount below conveys direction.
- `prop-profit-summary.tsx:67` — Wallet (also being demoted per P1 above).
- `prop-profit-summary.tsx:90` — Landmark (also being demoted per P1 above).
- `prop-profit-summary.tsx:115` — Building2 inside "Breakdown" subheading.
- `weekly-breakdown.tsx:52` — Calendar on h3 "Weekly Breakdown" heading.

13 spots total. All decorative — the surrounding text/labels carry the semantic. Add `aria-hidden="true"`.

### P2 — `month-comparison.tsx` ChangeIndicator paints non-P&L deltas as P&L

Lines 146-164 — the change badge paints:

- `row.change > 0` → `bg-trade-buy/10 text-trade-buy` + ArrowUp
- `row.change < 0` → `bg-trade-sell/10 text-trade-sell` + ArrowDown
- `row.change === 0` → neutral

This is consistent across all 4 comparison rows: **profit**, **winRate**, **avgR**, **trades**.

Only the first row (profit) is canonical signed-P&L magnitude. The other three are non-money deltas — recoding "improvement direction" as "made money." Same family as the rank-as-P&L pattern retired in row #8 (`comparison-stats-table.tsx`), though milder here because the colors are applied to a directional delta rather than a category rank.

Why defer: the fix needs a per-row `isMoney` flag plumbed through `comparisonRows`, and the existing pattern is internally consistent in a way that the row-#8 case was not (which painted everything from `totalFees` to `avgLoss` with rank colors). Mark this as a follow-up so we can revisit alongside any future "comparison improvement-direction" widgets.

Defer to backlog.

### P2 — Section-heading bronze icons (carryover observation, no change)

5 of the 6 widget surfaces use a bronze icon on their section heading: MonthNavigator/Calendar (page identity), MonthComparison/GitCompare, MonthlyProjection/TrendingUp, WeeklyBreakdown/Calendar, PropProfitSummary/Building2 (breakdown sub-heading).

This is **precedent** — rows #1-9 swept `/dashboard`, `/journal`, `/playbook`, `/analytics`, `/reports` and consistently kept bronze on single section-heading icons as the per-surface anchor. The accumulation across `/monthly`'s 6 widgets is noticeable but no single surface has multiple bronze section anchors (after the PropProfitSummary fix above).

Keep. Calling this out for the agent reading future sweeps: if a single page accumulates more than ~5 bronze section icons, that's a distill candidate — not a rule yet, but a heuristic. Logging it as an observation.

### P2 — `prop-profit-summary.tsx` & `monthly-projection.tsx` — `bg-acc-100/X` highlight cards

- `prop-profit-summary.tsx:88` — Net Profit card `border-acc-100/20 bg-acc-100/5` ✓ canonical earned-bronze chrome.
- `monthly-projection.tsx:96` — Projected Net card `bg-acc-100/10` ✓ canonical earned-bronze chrome.

Both are the "key metric of the surface" — payout you take home, projected payout. Keep.

### P2 — Card-stack rhythm (carryover)

`/monthly` stacks 5 cards top-to-bottom (navigator, prop-profit-summary, projection, comparison, weekly-breakdown), all using `border-bg-300 bg-bg-200 rounded-lg`. Same uniform-card-stack observation as `/analytics`, `/account-comparison`, `/reports`. Scope-extends the existing backlog distill entry — no new item.

---

## Phase 1b — audit

### P2 — Semantically-correct usages to KEEP

- `prop-profit-summary.tsx` TrendingUp/TrendingDown next to grossProfit, trade-buy/trade-sell on the dollar amount itself — canonical signed P&L.
- `prop-profit-summary.tsx` "- propFirmShare" in `text-trade-sell` (line 134) — canonical "this is money flowing away from you."
- `prop-profit-summary.tsx` Net Profit row `text-trade-buy` (line 165) when shown — canonical (only renders when isPositive).
- `monthly-projection.tsx` dailyAverage / projectedMonthly / projectedNet trade-buy/sell on signed amounts — canonical.
- `month-comparison.tsx` profitChange colored trade-buy/sell — canonical.
- `weekly-breakdown.tsx` per-week bars trade-buy/50 / trade-sell/50 — canonical signed bar.
- `month-navigator.tsx` bronze Calendar icon next to the formatted month — page-level identity anchor. The MonthNavigator IS the page header (no surrounding h1 above it), so the bronze Calendar is the page's "moment of significance." Keep.

---

## Phase 1 — Cross-cutting themes

1. **Aria-hidden hygiene.** Recurring across the wave — `/analytics`, `/account-comparison`, `/reports`, and now `/monthly`. Worth a future codemod to flag any Lucide icon inside an aria-labeled parent or adjacent to a text label and add `aria-hidden`.
2. **Bronze chrome > bronze icons** for highlighting key metrics. `/monthly` has two clean uses of this (Net Profit, Projected Net) and one that needed cleanup (the icon splatter in PropProfitSummary).
3. **Improvement-direction colored as P&L** — milder version of the rank-as-P&L from row #8. Defer; not blocking.

---

## Phase 2 — system-level extracts

No new shared primitives. The `ChangeIndicator` inline subcomponent in `month-comparison.tsx` could plausibly be promoted to `@/components/ui/change-indicator` if the same up/down/flat directional badge appears elsewhere — currently it's only used here. Leave inline until a second consumer surfaces.

---

## Phase 3 — corrections (this slice)

Files touched:

1. `src/components/monthly/prop-profit-summary.tsx` — demote Wallet + Landmark to neutral; `aria-hidden` on all 5 decorative icons.
2. `src/components/monthly/month-navigator.tsx` — `aria-hidden` on ChevronLeft, ChevronRight, Calendar.
3. `src/components/monthly/month-comparison.tsx` — `aria-hidden` on ChangeIndicator arrows and GitCompare heading icon (2 GitCompare instances).
4. `src/components/monthly/monthly-projection.tsx` — `aria-hidden` on TrendingUp + CalendarDays.
5. `src/components/monthly/weekly-breakdown.tsx` — `aria-hidden` on Calendar.

Deferred to backlog:

- `month-comparison.tsx` ChangeIndicator trade-color hijack on non-P&L deltas (winRate, avgR, tradeCount). Needs per-row `isMoney` flag.

---

## Phase 4 — register check (product)

Heavy data, reference register. No motion/copy/bolder/overdrive. Skipped intentionally.

---

## Sign-off

- `pnpm lint` — 0 errors
- `pnpm exec tsc --noEmit` — clean
- Backlog updated with the deferred follow-up
- Runbook row #10 marked done
