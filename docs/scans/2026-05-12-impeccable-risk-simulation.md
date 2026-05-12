# /risk-simulation — impeccable sweep (Wave 3, row #14)

**Date:** 2026-05-12
**Route:** `/[locale]/(app)/risk-simulation`
**Wave:** 3 — Modeling
**Cadence:** Phase 0 → 1a → 1b → themes → 2 → 3 → 4 → sign-off

---

## Phase 0 — Surface map

Orchestrator: `src/app/[locale]/(app)/risk-simulation/page.tsx` → renders `<RiskSimulationContent>` with risk profiles + trade years preloaded server-side.

Widgets:

1. `risk-simulation-content.tsx` — top-level orchestrator (header + config + run + results)
2. `simulation-config-panel.tsx` — date range, year filter, prefill, params form
3. `prefill-selector.tsx` — profile vs manual selector (clean — bronze for active state)
4. `risk-params-form.tsx` — form (clean form-feedback patterns; protected scope)
5. `preview-banner.tsx` — pre-run preview chip (CheckCircle uses trade-buy)
6. `summary-cards.tsx` — original/simulated/delta cards + comparison
7. `equity-curve-overlay.tsx` — original vs simulated area chart
8. `skipped-trades-warning.tsx` — expandable skipped-trade breakdown
9. `trade-comparison-table.tsx` — full row-by-row table with status dot legend
10. `decision-trace-modal.tsx` — right-side sheet showing week-by-week
11. `day-trace-card.tsx` — per-day trade-flow card inside the modal

---

## Phase 1a — Critique (UX)

### P1 — Category-as-P&L on `statusDotColors` (trade-comparison-table)

```tsx
const statusDotColors: Record<SimulatedTradeStatus, string> = {
	executed: "bg-trade-buy",
	skipped_no_sl: "bg-txt-300",
	skipped_daily_limit: "bg-trade-sell",
	skipped_daily_target: "bg-action-buy",
	skipped_max_trades: "bg-txt-300",
	skipped_consecutive_loss: "bg-trade-sell",
	skipped_monthly_limit: "bg-trade-sell",
	skipped_weekly_limit: "bg-trade-sell",
	skipped_recovery_complete: "bg-trade-buy",
	skipped_gain_stop: "bg-action-buy",
}
```

Identical shape to row #13's `MODE_COLORS`. Ten **trade-status reasons** mapped to **trade direction tokens**. The colors loosely track desirability — executed = good, blocked-by-loss-rule = bad — but the channel is wrong. These are verdicts on whether the rule engine accepted or blocked a trade, not signed P&L magnitudes.

The right vocabulary is the verdict triad we promoted in row #13 (`fb-success` / `fb-error` / `warning` / `txt-300`):

| Status                      | Now             | Better                               |
| --------------------------- | --------------- | ------------------------------------ |
| `executed`                  | `bg-trade-buy`  | `bg-fb-success` — engine ran trade   |
| `skipped_recovery_complete` | `bg-trade-buy`  | `bg-fb-success` — protective success |
| `skipped_daily_limit`       | `bg-trade-sell` | `bg-fb-error` — blocked by loss rule |
| `skipped_consecutive_loss`  | `bg-trade-sell` | `bg-fb-error`                        |
| `skipped_monthly_limit`     | `bg-trade-sell` | `bg-fb-error`                        |
| `skipped_weekly_limit`      | `bg-trade-sell` | `bg-fb-error`                        |
| `skipped_daily_target`      | `bg-action-buy` | `bg-warning` — paused at target      |
| `skipped_gain_stop`         | `bg-action-buy` | `bg-warning` — paused at gain stop   |
| `skipped_no_sl`             | `bg-txt-300`    | `bg-txt-300` (keep)                  |
| `skipped_max_trades`        | `bg-txt-300`    | `bg-txt-300` (keep)                  |

Note `action-buy` is the directional intent (buy order) color, conceptually unrelated to "trade was paused because target was reached". `warning` is the precise vocabulary for "rule paused you, on purpose, while ahead".

### P1 — Day-level verdict hijack (day-trace-card)

The "trade-status badge" inside `TradeFlowItem` is signed P&L (`pnl > 0 ? buy : pnl < 0 ? sell : neutral`) — that's correct, the badge **is** the trade's signed result. ✓

But the day-level footer uses trade tokens for _verdicts_:

```tsx
{day.dayResult.hitDailyLimit && (
  <StopCircle className="text-trade-sell h-3.5 w-3.5 …" />
  <span className="text-tiny text-trade-sell font-medium">{t("dailyLimitHit")}</span>
)}
{day.dayResult.hitDailyTarget && !day.dayResult.hitDailyLimit && (
  <StopCircle className="text-acc-100 h-3.5 w-3.5 …" />
  <span className="text-tiny text-acc-100 font-medium">{t("dailyTargetHit")}</span>
)}
```

`hitDailyLimit` = "engine blocked further trades because losses hit the cap" — that's a protective-error verdict, not a P&L magnitude. → `text-fb-error`.

`hitDailyTarget` = "engine paused at the daily profit target" — that's the "good rule fired" verdict. → `text-warning` or `text-fb-success` depending on read. Aligning with `statusDotColors.skipped_daily_target` → `text-warning` (pause-on-purpose) keeps the vocabulary consistent across the page.

### P1 — `EquityCurveOverlay` simulated curve hardcoded to trade-buy

```tsx
<Area dataKey="original" stroke="var(--color-acc-200)" fill="var(--color-acc-200)" ... />
<Area dataKey="simulated" stroke="var(--color-trade-buy)" fill="var(--color-trade-buy)" ... />
```

The simulated curve is the **outcome under different rules** — it can end above or below the original. Coloring the whole series `trade-buy` declares the simulation is profit before any data renders. Even if the simulated curve crashes, the line stays green.

Same fix as everywhere else: the simulated curve is the **anchor / focus** of this page, so `acc-100` is the natural choice. Keeps `acc-200` (blue) on original (the reference) and the bronze anchor on the focus.

Tooltip `tooltipSimulated` line is `text-trade-buy` unconditionally — same hijack, drop to `text-txt-200` (it's a label, value is in the number).

### P2 — `PreviewBanner` verdict hijack

```tsx
{
	allTradesLackSl ? (
		<AlertTriangle className="text-fb-error h-4 w-4 …" />
	) : (
		<CheckCircle className="text-trade-buy h-4 w-4 …" />
	)
}
```

`AlertTriangle` uses `fb-error` — the correct verdict vocabulary ✓. But the success twin uses `trade-buy` — that's "preview validation passed", a verdict, not signed money. → `text-fb-success`.

### P2 — `executedTrades` count painted with trade colors (summary-cards)

```tsx
<span className="text-small text-trade-buy font-medium">
	{summary.executedTrades}
</span>
```

It's a count, not signed money. → `text-txt-100`.

### P2 — `ComparisonRow` dead-color branch (summary-cards)

```tsx
{
	delta && (
		<span
			className={cn(
				"text-tiny font-medium whitespace-nowrap",
				deltaPositive ? "text-trade-buy" : "text-trade-sell"
			)}
		>
			{delta}
		</span>
	)
}
```

All four callsites pass `originalValue` + `simulatedValue` but never `delta`/`deltaPositive`, so this branch is unreachable today. Could be deleted (dead code) but I'll leave the prop in place since the same component will be reused once delta UI ships — just rename the prop semantics to `signed`/`positive` once it does. **No code change this row** — flag for backlog if it gets reused without thinking.

### P2 — `skipped-trades-warning` ChevronUp/Down missing aria-hidden

```tsx
{
	isExpanded ? (
		<ChevronUp className="text-txt-300 h-4 w-4" />
	) : (
		<ChevronDown className="text-txt-300 h-4 w-4" />
	)
}
```

Toggle button has its own `aria-label`; chevrons are decorative state indicators. → add `aria-hidden`.

### P3 — Status dot legend reads correctly post-swap

The status-row legend at the top of `trade-comparison-table` (lines 84-98) renders one chip per `activeStatuses`, reusing `statusDotColors`. Once we re-token those, the legend automatically inherits the verdict palette. No separate fix.

---

## Phase 1b — Audit (technical)

### A11y — aria-hidden gaps

- `skipped-trades-warning.tsx` Chevron icons (covered in P2)
- `equity-curve-overlay.tsx` Legend renders text — no extra a11y work needed
- `decision-trace-modal.tsx` is clean; week-header `ColoredValue` carries its own semantics
- `day-trace-card.tsx` Status badges are visible labels (text inside) — accessible ✓; `StopCircle` icons already `aria-hidden` ✓

### Color-only differentiation on status dots

After the swap, the legend chip + label combination (dot + text) preserves color-independence. ✓

### Tokens — no invalid tokens detected

All scanned files use legal v4 tokens.

### Lint — clean baseline

Post row-#13 commit: `pnpm lint` and `pnpm exec tsc --noEmit` are green.

---

## Phase 1 themes

1. **The category-as-P&L hijack is the universal Wave 3 systemic problem** — first seen on monte-carlo `MODE_COLORS`, now identical-shape on risk-simulation `statusDotColors`. Two more chart palettes in v2 daily-pnl-chart / mode-distribution-chart are still pending the categorical-mode backlog item. The fix vocabulary is firmly the verdict triad (`fb-success` / `fb-error` / `warning` / `txt-300`).
2. **Verdict-vocabulary uptake is the dominant fix recipe across rows** — preview-banner CheckCircle, daily-limit-hit footer, daily-target-hit footer, statusDotColors all converge on the same fb-\*/warning replacement. Same pattern as row #13's Insight + Kelly conservative.
3. **Anchor/reference series convention** — overlay charts (this page's equity comparison, and any future comparison surface) settle on `acc-100` for the focus series and `acc-200` for the reference series. `trade-buy/sell` is never the right vocabulary for an unsigned outcome curve.

---

## Phase 2 — Extracted

No new abstractions warranted. The `statusDotColors` map is local to one widget; promoting it to a global is over-engineering until another surface needs it.

---

## Phase 3 — Corrections

Applied in this PR:

1. **`trade-comparison-table.tsx`** — verdict-palette rewrite of `statusDotColors`:
   - `executed`, `skipped_recovery_complete` → `bg-fb-success`
   - `skipped_daily_limit`, `skipped_consecutive_loss`, `skipped_monthly_limit`, `skipped_weekly_limit` → `bg-fb-error`
   - `skipped_daily_target`, `skipped_gain_stop` → `bg-warning`
   - `skipped_no_sl`, `skipped_max_trades` → `bg-txt-300` (unchanged)

2. **`day-trace-card.tsx`** — day-level verdict tokens:
   - `hitDailyLimit` icon + label: `text-trade-sell` → `text-fb-error`
   - `hitDailyTarget` icon + label: `text-acc-100` → `text-warning`

3. **`preview-banner.tsx`** — verdict-success vocabulary:
   - `CheckCircle` → `text-trade-buy` → `text-fb-success`

4. **`summary-cards.tsx`** — count is not signed money:
   - `executedTrades` → `text-trade-buy` → `text-txt-100`

5. **`equity-curve-overlay.tsx`** — anchor/reference convention:
   - simulated Area: stroke/fill `--color-trade-buy` → `--color-acc-100`
   - Tooltip `tooltipSimulated` line: `text-trade-buy` → `text-txt-100`

6. **`skipped-trades-warning.tsx`** — aria-hidden on Chevrons.

---

## Phase 4 — Enhancement (deferred)

- **`ComparisonRow` delta branch retirement** (P3): dead-color branch in `summary-cards.tsx` is unused. Rather than delete the prop API today, capture in backlog so the next reuse picks correct semantics.
- **Status-palette tokenization for risk-simulation + monte-carlo** (P4): if a third surface needs the same verdict-triad-with-pause palette, promote to a small set of semantic tokens (`--color-rule-blocked`, `--color-rule-paused`, `--color-rule-executed`) instead of leaving fb-error/warning/fb-success aliased in three places.

---

## Sign-off

- Phase 0: ✓ 11-widget surface map
- Phase 1a: ✓ 7 critique items (1 P1 ten-cell map, 2 P1 anchor swaps, 4 P2)
- Phase 1b: ✓ a11y audit clean except chevrons
- Phase 2: ✓ no extractions
- Phase 3: ✓ 6 widget edits queued (this PR)
- Phase 4: ✓ 2 follow-ups to backlog
