# /impeccable sweep — account-comparison (`/analytics/account-comparison`)

**Date:** 2026-05-12
**Wave / row:** 2 — Heavy data, row #8
**Register:** product (app UI)
**Scope:** `/analytics/account-comparison` route + 6 widgets it renders (`account-comparison-content`, `account-selector`, `comparison-stats-table`, `comparison-normalized-table`, `comparison-equity-chart`, `comparison-config-summary`). Shared module: `comparison-colors.ts`.

---

## Preflight — scene

Solo trader (or mentorship student) at 7 p.m. on Sunday, weekend post-mortem. Three accounts open in their list: personal cash, prop FTMO challenge, replay sandbox. They open this page to answer one specific question: "**Which account's strategy actually has the edge once I normalize away position size?**" — i.e., is my prop performance just bigger bets, or is the strategy genuinely better trading? The page is decision-grade reference, read maybe once a month before deciding whether to scale a prop account or retire the replay strategy. It must speak in ranked comparisons, not in cheering.

---

## Phase 1a — critique

### P0 — `comparison-stats-table.tsx` paints rank as P&L color (recurring anti-pattern, inverted)

Lines 272-274: `isBest && "text-trade-buy"`, `isWorst && "text-trade-sell"`. Every metric — including `totalFees`, `winRate`, `avgLoss`, `maxDrawdown`, `totalTrades` — is painted trade-buy on the winner and trade-sell on the loser. The semantic claim: trade-buy = "wins the rank", trade-sell = "loses the rank." This is using trade colors as a **leaderboard primitive**, not as P&L magnitude.

Concrete misfires:

- Best `totalFees` (lowest fee account) → painted trade-buy. Fees aren't P&L direction; lowest fees is just "less of a cost". Trade-buy here implies "this account made money on fees," which is false.
- Worst `maxDrawdown` (largest drawdown) → painted trade-sell. Drawdown IS a loss already; painting the worst drawdown red is _loss-on-loss_ color collision — every cell in the row is a negative number, the rank winner just has a smaller negative.
- Best `winRate` → painted trade-buy. Same threshold-as-magnitude pattern we retired in `/analytics`.

Fix: drop trade colors from rank semantics. Rank conveyed by font weight + neutral hierarchy:

- best → `text-txt-100 font-semibold` (winner stands out by bold weight + brightest text)
- worst → `text-txt-300 font-normal` (faded)
- middle / no-rank → `text-txt-100 font-normal`

This preserves the at-a-glance "who wins this row" scan without recoding rank as P&L direction. (P&L sign is already conveyed by the formatted value itself — `formatBrlWithSign` prepends `+`/`-`.)

### P0 — `comparison-normalized-table.tsx` mirrors the same anti-pattern

Lines 253-255 — identical `isBest && "text-trade-buy"` / `isWorst && "text-trade-sell"` rank-as-P&L coloring. Same fix.

### P1 — `account-selector.tsx` bronze on selected chip collides with primary CTA

Line 82: selected state uses `border-acc-100 bg-acc-100/10 text-txt-100`. Multi-select chips painted bronze means every selected chip is a "moment of significance" — but the Compare button below (`variant="default"`) is itself the primary bronze CTA on this surface. Two bronze anchors in the same panel dilute the signal.

Fix: demote selected chip to neutral elevation — `border-txt-300 bg-bg-100 text-txt-100`. The chip still reads as selected (higher contrast vs the unselected `border-bg-300 bg-bg-100 text-txt-300`), but no longer competes with the Compare CTA for premium status.

### P2 — `comparison-colors.ts` token bypass + trade-color hijack

The series palette is the entire chart's color identity, used by `comparison-equity-chart`, `comparison-stats-table`, `comparison-normalized-table`, `comparison-config-summary`. Two problems:

1. **Hardcoded hex** at lines 10-13 (`#f59e0b`, `#ef4444`, `#14b8a6`, `#f97316`) bypass the token system. Same pattern as the cumulative-pnl-chart RGB literal fixed in row #7.
2. **Trade-color hijack** at lines 8-9: account 3 = `var(--color-trade-buy)` (green), account 4 = `var(--color-trade-sell)` (purple). Account A's equity line is green just because it's the third in selection — recoding "category" as "made money."

The clean fix needs new neutral chart-series tokens (`--color-chart-1` … `--color-chart-N`) added to `src/app/globals.css`. That's a theme-level change; punt to backlog as a unified slice ("chart series palette overhaul"). The remaining 4 widgets stop trade-coloring rank in this slice, which removes the _most-visible_ misfire; the equity-chart line palette will still hijack trade colors until the token migration lands, but at least the tables stop compounding the problem.

### P2 — Card-stack rhythm (carryover)

Four post-comparison cards (stats table → normalized table → equity chart → config summary), all `border-bg-300 bg-bg-200 rounded-lg`. Same uniform-card-stack observation as `/analytics`. Scope-extends the existing backlog distill entry — no new item.

---

## Phase 1b — audit

### P1 — `account-comparison-content.tsx` ArrowLeft missing `aria-hidden`

Line 61: `<ArrowLeft className="h-5 w-5" />` inside an aria-labelled Link. The icon is decorative — the parent Link already carries `aria-label={t("backToAnalytics")}`. Add `aria-hidden="true"`.

### P1 — `account-selector.tsx` redundant `tabIndex={0}` and `onKeyDown` (recurring)

Same as `expectancy-mode-toggle.tsx` (filed in backlog last sweep). Native `<button>` is in the tab order by default and fires `onClick` on Enter/Space. Lines 76, 86-91 (chip buttons) and line 113 (Compare button) all duplicate browser behavior.

Drop the `tabIndex={0}` and `onKeyDown` props from both the chip buttons and the Compare button.

### P2 — Color dots in headers use inline `style={{ backgroundColor }}`

`comparison-stats-table.tsx:238`, `comparison-normalized-table.tsx:199`, `comparison-config-summary.tsx:48` — color swatches use inline style with `COMPARISON_COLORS[i]`. Inline styles are needed here because Tailwind can't enumerate runtime-cycled palette values, but the _values_ should be tokens. Will be resolved as part of the chart-series palette overhaul (backlog).

### P2 — Semantically-correct usages to KEEP

- `account-comparison-content.tsx` ExpectancyModeToggle conditional render — canonical.
- `account-selector.tsx` `aria-pressed` on chips — correct multi-select semantics (toggles are independent; not a radiogroup).
- Equity-curve tooltip P&L coloured by sign — canonical signed-magnitude usage.

---

## Phase 1 — Cross-cutting themes

1. **Rank-as-P&L color** is the dominant anti-pattern across both stats tables. Sister surface to the best/worst session labels in `/analytics`. Same fix: rank → font weight, neutral text hierarchy.
2. **Comparison series palette** is a token bypass _and_ a trade-color hijack — biggest deferred item from this slice. Needs a unified chart-series token spec in `globals.css`.
3. **`tabIndex={0}` + `onKeyDown` duplication on `<button>`** is appearing across analytics and account-comparison. Already in backlog from row #7; the scope extends naturally here.

---

## Phase 2 — system-level extracts

No new shared primitives. The two comparison tables share the same best/worst tolerance algorithm (`bestWorstMap`), but the metrics rows differ enough (`MetricRow` vs `NormalizedMetric`) that the duplication is shallow and a premature abstraction would lock the wrong shape. Leave inline.

---

## Phase 3 — corrections (this slice)

Files touched:

1. `src/components/account-comparison/comparison-stats-table.tsx` — strip trade-color rank semantics, use font-weight + neutral hierarchy.
2. `src/components/account-comparison/comparison-normalized-table.tsx` — same fix.
3. `src/components/account-comparison/account-selector.tsx` — drop redundant `tabIndex={0}` + `onKeyDown` on chip buttons and Compare button, demote selected bronze to neutral.
4. `src/components/account-comparison/account-comparison-content.tsx` — `aria-hidden` on ArrowLeft.

Deferred to backlog (single line item):

- Chart-series palette overhaul (`comparison-colors.ts` + new `--color-chart-N` tokens in `globals.css`). Drops hardcoded hex and retires trade-color hijack for account-series lines. Spans equity-chart line palette + header swatches in all three tables.

---

## Phase 4 — register check (product)

Heavy data, reference register. No motion/copy/bolder/overdrive. Skipped intentionally.

---

## Sign-off

- `pnpm lint` — 0 errors
- `pnpm exec tsc --noEmit` — clean
- Backlog updated with chart-series palette overhaul (single deferred slice)
- Runbook row #8 marked done
