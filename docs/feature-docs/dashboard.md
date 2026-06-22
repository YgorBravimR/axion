# Dashboard

> The greeting screen for returning users. Passive analytics + Hawks coaching insights.

**Routes:** `/[locale]/` (root, redirects to dashboard for authenticated users)
**Server actions:** `analytics.ts` (`getDashboardBatch`), `hawks-coaching.ts` (`getHawksCoachingInsights`)
**Files:** `src/app/[locale]/(app)/page.tsx`, dashboard content component

## Purpose

Show a returning trader where they stand: monthly P&L, win rate, drawdown, discipline, equity curve, and (for Hawks) one actionable coaching insight — all without any input from them.

## What lives there

- Year/month picker (client state).
- Monthly stats: total PnL, win/loss count, win rate, avg win:loss, Sharpe, max drawdown.
- Discipline score: % trades that followed the plan, % stops honored.
- Equity curve (monthly), daily P&L heat map, 7-day streak.
- Radar chart: win rate, avg R, profit factor, drawdown, discipline, consistency.
- Hawks coaching card (Hawks-only): recent biases, win rate per bias direction, one suggested action.

## Inputs

- Year + month index (controls the snapshot window).

## Outputs

- Read-only metrics rendered as cards/charts.
- No mutations.

## Cross-feature integrations

- **Journal** — trade rows are the single source.
- **Account mode provider** — Hawks coaching only when `accountMode === "hawks"`.
- **Risk profiles** — used in radar (discipline vs target).
- **Plan** — discipline % is the same value the Plan month view shows; both anchor to the followed-plan flag on each trade.

## Where it fails

- **No trades → all metrics null.** Empty state copy is minimal; new users don't know what they're supposed to see.
- **Equity curve sums trade P&L, not actual account balance.** Capital events (deposits, withdrawals, prop-firm payouts) are invisible. Users confuse "equity curve" with "account value".
- **Radar chart has no drill-down.** "Consistency = 78%" — clicking does nothing. To find the trades that pulled it down you have to filter Journal manually with the same predicate.
- **Coaching card surfaces one insight at a time.** Pattern detector finds more (revenge trades, hour buckets, mistake co-occurrence) but only one fits the card slot. The rest are buried in `coaching.ts` and never shown.
- **Hawks coaching uses 90-day window.** Not configurable. For a trader who just had 20 days of bad behavior, the window is too long; for someone evaluating quarterly trends, too short.
- **Clock skew on `exitDate`.** Aggregation must use `getServerEffectiveNow()` — bugs here move trades between days.
- **No "yesterday vs today" mode.** Most useful comparison the dashboard could offer; absent.

## Power combos

1. **Dashboard → CC drill.** Spot a red day in the heat map → click into CC for that date → read your own pre/post-market notes → diagnose what broke. Only path that uses both surfaces together.
2. **Radar + Playbook compliance.** Compare radar discipline to Playbook compliance trend. If radar says 75% but Playbook (per-strategy) says 50% on Strategy A, the bad strategy is dragging the average — kill or fork it.
3. **Hawks coaching → bias edit.** Card says "win rate after bullish bias is 30%". Tomorrow's bias confirmation gets framed by that: either tighten the bias screens or skip bullish-bias days entirely.
