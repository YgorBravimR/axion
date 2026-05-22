# /monte-carlo — impeccable sweep (Wave 3, row #13)

**Date:** 2026-05-12
**Route:** `/[locale]/(app)/monte-carlo`
**Wave:** 3 — Modeling
**Cadence:** Phase 0 → 1a → 1b → themes → 2 → 3 → 4 → sign-off

---

## Phase 0 — Surface map

Orchestrator: `src/app/[locale]/(app)/monte-carlo/page.tsx` → renders `<MonteCarloContent>`, two-tab shell (v1 Edge Expectancy / v2 Capital Expectancy).

Widgets read:

**v1 (Edge Expectancy):**

1. `monte-carlo-content.tsx` — tab orchestrator
2. `simulation-params-form.tsx` — input form (clean)
3. `stats-preview.tsx` — inline data preview (clean — bronze chrome justified anchor)
4. `input-mode-selector.tsx` — segmented control (clean — bronze for active state)
5. `data-source-selector.tsx` — radio source picker (clean)
6. `metrics-cards.tsx` — **5 cards × 4 rows of metrics, multiple hijacks**
7. `kelly-criterion-card.tsx` — 3-tile Kelly recommender + level callout
8. `equity-curve-chart.tsx` — clean (cumulativeR signed)
9. `drawdown-chart.tsx` — clean (negative-R signed)
10. `distribution-histogram.tsx` — ZONE_COLORS misuse + header
11. `strategy-analysis.tsx` — 5 sections × bronze icons + Insight verdict
12. `trade-sequence-list.tsx` — clean; needs aria-hidden audit

**v2 (Capital Expectancy):** 13. `v2/monte-carlo-v2-content.tsx` — v2 orchestrator 14. `v2/risk-profile-selector.tsx` — select + summary (bronze chrome justified anchor) 15. `v2/v2-results-summary.tsx` — chip strip (two bronze anchors → splatter) 16. `v2/v2-metrics-cards.tsx` — 6 cards, threshold/ratio hijacks throughout 17. `v2/v2-distribution-histogram.tsx` — bars sign-encoded ✓ tooltip count miscolored 18. `v2/daily-pnl-chart.tsx` — MODE_COLORS double-encodes sign with height 19. `v2/mode-distribution-chart.tsx` — same MODE color story (pie)

---

## Phase 1a — Critique (UX)

### P1 — threshold-as-P&L hijack (systemic)

The Wave 2 pattern returns multiplied across the route. `text-trade-buy/sell` is used to paint **ratios and threshold pass/fail**, not signed money:

| Widget             | Field               | Bad rule                |
| ------------------ | ------------------- | ----------------------- |
| `metrics-cards`    | profitFactor        | `>= 1 ? buy : sell`     |
| `metrics-cards`    | sharpeRatio         | `>= 1 ? buy : txt-100`  |
| `metrics-cards`    | sortinoRatio        | `>= 1 ? buy : txt-100`  |
| `metrics-cards`    | profitablePct       | `>= 70 ? buy : txt-100` |
| `metrics-cards`    | maxWinsInRow        | unconditional `buy`     |
| `metrics-cards`    | maxLossesInRow      | unconditional `sell`    |
| `v2-metrics-cards` | profitableMonthsPct | `>= 60 ? buy : sell`    |
| `v2-metrics-cards` | monthlyLimitHitPct  | `<= 10 ? buy : sell`    |
| `v2-metrics-cards` | targetHitDays       | unconditional `buy`     |
| `v2-metrics-cards` | sharpeRatio         | `>= 1 ? buy : txt-100`  |
| `v2-metrics-cards` | sortinoRatio        | `>= 1 ? buy : txt-100`  |

These are _ratios_ (profit factor, sharpe, sortino) or _counts_ (streaks) or _threshold pass-rates_ (profitable %), not signed values. The card sort/order already encodes goodness; coloring against an arbitrary "good" threshold creates a binary feel-good signal that hides nuance (PF 0.99 painted red, 1.01 green — same edge, opposite verdict).

### P1 — 3-tier "risk threshold" hijack (v2 only)

`v2-metrics-cards`: `riskOfRuinPercent` and `medianMinBalancePercent` use a 3-tier `buy/warning/sell` color ramp. The middle warning tier is correct vocabulary; the outer tiers borrow trade colors for what is a _risk verdict_, not a P&L sign. The route ships `fb-success` / `fb-error` precisely for verdict states — use them.

### P2 — `ZONE_COLORS` density encoding (v1 distribution-histogram)

The percentile-band background uses three different brand tokens to denote density:

- `core` (40–60th, most likely): `trade-sell` 20%
- `center` (15–85th): `warning` 20%
- `middle` (5–95th): `acc-100` 15%

This paints "most-likely outcome" with the loss color and "wider tails" with the brand anchor. Density is a continuous variable — encode it with **one hue and a luminance ramp** (single-color opacity ladder), not three semantically loaded tokens.

### P2 — header chip miscolored (v1 distribution-histogram + v2 tooltip)

`profitable: NN%` painted unconditionally `text-trade-buy` regardless of value. The number describes how many simulations were profitable; trade colors only apply to signed P&L magnitudes, not their meta-statistic. Same applies to v2-distribution-histogram tooltip painting **simulation count** with trade colors.

### P2 — bronze splatter on `strategy-analysis` section headers

Five sections (`BarChart3`, `TrendingUp`, `AlertTriangle`, `Brain`, `Zap`) all render `text-acc-100`. The Earned-Bronze rule allows **one** anchor per band/moment; five bronze tiles in a vertical stack flatten hierarchy. Drop them all to `text-txt-300` (neutral decoration); the bold section title carries hierarchy.

### P2 — verdict-vocabulary mismatch on Insight

`strategy-analysis` defines:

```
positive → text-trade-buy
negative → text-trade-sell
```

But these Insights are _verdicts on the strategy_ ("profitable simulations are robust", "commission impact is moderate"), not signed money. The `fb-success` / `fb-error` tokens were built for exactly this: positive/negative verdict feedback at the same level as form validation. Trade colors should be reserved for the actual R values in the body copy.

### P2 — kelly-criterion-card "conservative" verdict on trade colors

`levelConfig.conservative` uses `text-trade-buy` / `bg-trade-buy/10 border-trade-buy/30`. Like Insight, this is a _verdict on the Kelly level_ ("conservative is safe"), not P&L. `fb-success` is the matching vocabulary; the `aggressive` tier already correctly uses `warning`, and `balanced` correctly anchors with bronze.

### P3 — v2-results-summary double bronze anchor

The summary chip strip renders both `profile.name` and `monthsToTrade` as `text-acc-100`. Two anchors on the same horizontal band dilute the primary one. Keep `profile.name` (the principal context); drop `monthsToTrade` to `text-txt-100`.

### P3 (deferred) — mode-as-P&L double encoding (v2 daily-pnl-chart, mode-distribution-chart)

`MODE_COLORS` paints `lossRecovery` with `trade-sell` and `gainCompounding` with `trade-buy`. In `daily-pnl-chart`, the bar **height** already encodes daily P&L sign — the mode-color overlay adds a _category dimension_ using the same vocabulary as the height, which is at best redundant and at worst confusing on mixed days. In `mode-distribution-chart` (pie), the slice color is the _only_ signal, but the mode names are categories (engine states), not P&L states.

This is a larger design decision: introduce a categorical palette for engine modes (e.g., `--color-mode-recovery`, `--color-mode-compounding`, `--color-mode-skipped`) and use it consistently. **Defer to backlog** — patching half-way would create inconsistency.

### P3 — distribution-histogram percentile legend chips

The legend chips reflect whatever ZONE_COLORS resolves to. Once ZONE_COLORS becomes a density ramp, the legend automatically inherits the right look. No extra work.

---

## Phase 1b — Audit (technical)

### A11y — aria-hidden gaps on decorative icons

Pass-through audit across all widgets:

- `metrics-cards.tsx` — `Info` icons inside tooltip triggers (decorative, but inside a labeled trigger — fine without aria-hidden, the trigger has accessible name)
- `kelly-criterion-card.tsx` — `LevelIcon` inside callout, `Info` icons. Callout text reads the recommendation; icon is decorative → needs `aria-hidden`
- `strategy-analysis.tsx` — 5 Section icons (decorative companions to text titles) → `aria-hidden`; Insight icons (decorative, semantic conveyed by color+copy) → `aria-hidden`
- `trade-sequence-list.tsx` — `ChevronDown` / `ChevronUp` sort indicators → `aria-hidden` (they're decorative; aria-sort owns the semantic)
- `monte-carlo-v2-content.tsx` — `Dices` on the Run button (button has label) → `aria-hidden`; `X` on dismissible error banner (button has aria-label) → `aria-hidden`

### A11y — color-only differentiation in MODE_COLORS

`daily-pnl-chart` and `mode-distribution-chart` rely on color alone to distinguish modes. The legend mitigates this in `daily-pnl-chart` (text label per swatch); pie chart has a legend too. Acceptable, but stronger contrast or patterns would help colorblind users. **Defer** — same scope as the categorical-palette decision above.

### Tokens — no invalid tokens detected

All scanned files use legal v4 tokens (`bg-bg-200`, `p-m-400`, `text-txt-300`, etc.). No `s-400` / `text-h4` drift in this surface.

### Lint — clean baseline

`pnpm lint` is currently green (post-row-#12 commit). No floating-promises, no `forEach`, no raw `<a>` / `<table>` / `<input type="checkbox">`.

---

## Phase 1 themes

1. **Threshold-as-P&L is the dominant systemic hijack** — 11 fields across two widgets misuse trade colors for ratios/counts/threshold pass-rates. Same root cause we saw on Row #12; multiply by the dual v1/v2 surface area.
2. **Verdict vocabulary exists but is unused** — `fb-success` / `fb-error` are the right tokens for "this Kelly level is conservative", "this commission impact is negligible", "the strategy is robust". The code reaches for trade tokens because they're more saturated; the result is semantic blur.
3. **`warning` is the third leg of the verdict triad** — `acc-100` is anchor (one per band), `fb-success`/`fb-error` is binary verdict, `warning` is caution. Kelly already gets this right for `aggressive`; we extend it.
4. **Density ≠ semantics** — three brand tokens layered for distribution-histogram density encoding teaches the eye the wrong lesson. Continuous variables get continuous ramps.
5. **Mode color in v2 is a larger conversation** — engine modes (lossRecovery, gainCompounding, mixed, skipped) are categories that _happen_ to correlate with P&L direction but are not P&L themselves. Defer to a categorical-palette backlog item.

---

## Phase 2 — Extracted

No new abstractions warranted. The hijacks are local color-class edits; no new components emerge from this row.

---

## Phase 3 — Corrections

Applied in this PR:

1. **`metrics-cards.tsx`** — neutralize ratio/threshold/streak hijacks:
   - `profitFactor` → drop trade colors → `text-txt-100`
   - `sharpeRatio` → drop trade-buy on pass → `text-txt-100`
   - `sortinoRatio` → drop trade-buy on pass → `text-txt-100`
   - `profitablePct` → drop trade-buy on pass → `text-txt-100`
   - `maxWinsInRow` → unconditional `text-trade-buy` → `text-txt-100`
   - `maxLossesInRow` → unconditional `text-trade-sell` → `text-txt-100`
   - **Keep** signed R values (`expectedRPerTrade`, `medianFinalR`, `meanFinalR`, `bestCaseFinalR`, `worstCaseFinalR`) — those are real signed P&L magnitudes.
   - **Keep** `medianMaxDrawdownR` / `worstDrawdownR` `text-trade-sell` — those are signed loss magnitudes.

2. **`distribution-histogram.tsx`** — single-hue density ramp:
   - `ZONE_COLORS` → `txt-300` opacity ladder (core 18% → center 12% → middle 6% → outer transparent)
   - Header `profitable: NN%` → drop unconditional `text-trade-buy` → `text-txt-100`

3. **`strategy-analysis.tsx`** — bronze splatter + verdict vocabulary:
   - All 5 Section icons → `text-acc-100` → `text-txt-300` + `aria-hidden`
   - Insight icons → `aria-hidden`
   - `insightConfig.positive.color` → `text-trade-buy` → `text-fb-success`
   - `insightConfig.negative.color` → `text-trade-sell` → `text-fb-error`

4. **`kelly-criterion-card.tsx`** — verdict vocabulary:
   - `levelConfig.conservative.color` → `text-trade-buy` → `text-fb-success`
   - `levelConfig.conservative.bgColor` → `bg-trade-buy/10 border-trade-buy/30` → `bg-fb-success/10 border-fb-success/30`
   - `LevelIcon` in callout → `aria-hidden`
   - `Info` tooltip-trigger icons → already inside labeled spans, keep
   - Decorative `Info` (h-3.5 w-3.5 top-right) → `aria-hidden`

5. **`v2-metrics-cards.tsx`** — same systemic neutralizations:
   - `profitableMonthsPct` → drop trade colors → `text-txt-100`
   - `monthlyLimitHitPct` → drop trade colors → `text-txt-100`
   - `targetHitDays` → unconditional `text-trade-buy` → `text-txt-100`
   - `sharpeRatio` → drop trade-buy on pass → `text-txt-100`
   - `sortinoRatio` → drop trade-buy on pass → `text-txt-100`
   - `riskOfRuinPercent` 3-tier: `trade-buy / warning / trade-sell` → `text-txt-100 / text-warning / text-fb-error`
   - `medianMinBalancePercent` 3-tier: `trade-buy / warning / trade-sell` → `text-txt-100 / text-warning / text-fb-error`
   - **Keep** signed money fields (`monthlyPnl` median/mean, `bestCase`, `worstCase`, `expectedDailyPnl`, `medianReturnPercent`, mean return).

6. **`v2-results-summary.tsx`** — drop second bronze:
   - `monthsToTrade` `text-acc-100` → `text-txt-100`
   - Keep `profile.name` as the single bronze anchor for this band
   - `Dices` icon on Run Again button → `aria-hidden`

7. **`v2-distribution-histogram.tsx`** — tooltip count not P&L:
   - Tooltip `<p>` simulation-count color → drop trade-buy/sell → `text-txt-100`

8. **`monte-carlo-v2-content.tsx`** — aria-hidden audit:
   - `Dices` on Run button → `aria-hidden`
   - `X` close on error banner → `aria-hidden`
   - Helper `text-acc-100` annotations: keep (informational anchor)

9. **`trade-sequence-list.tsx`** — aria-hidden on sort indicators:
   - `ChevronDown` / `ChevronUp` → `aria-hidden`

---

## Phase 4 — Enhancement (deferred to backlog)

- **Categorical mode palette** (P3): introduce `--color-mode-recovery`, `--color-mode-compounding`, `--color-mode-mixed`, `--color-mode-skipped` (or repurpose chart-1/2/3/4 if they exist) and refactor `daily-pnl-chart.tsx` and `mode-distribution-chart.tsx` to use them. Avoids double-encoding bar height + color, makes the legend honest.
- **Distribution-histogram v1 tooltip color** (P3): the tooltip count is currently painted trade-buy/sell by `isProfit`. Same issue as v2 — count is not signed money. Will pick up when categorical chart palette work lands.
- **Bins width-encoded density** (P4): for distribution-histogram, instead of background ZONE_COLORS, encode density into bin width or a connected violin shape. Larger redesign.

---

## Sign-off

- Phase 0: ✓ 19-widget surface map captured
- Phase 1a: ✓ 6 critique items, 1 systemic root cause (threshold-as-P&L) confirmed at scale
- Phase 1b: ✓ a11y audit — 5 widgets needing aria-hidden cleanup
- Phase 2: ✓ no extractions warranted
- Phase 3: ✓ 9 widget edits queued (this PR)
- Phase 4: ✓ 3 follow-ups to backlog
