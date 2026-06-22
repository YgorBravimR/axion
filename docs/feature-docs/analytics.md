# Analytics

> Real-time + historical performance self-analysis. Layered by time, asset, strategy, session, and discipline.

**Routes:** `/[locale]/analytics`
**Server actions:** `analytics.ts` (51 KB), `account-comparison.ts`
**Files:** `src/app/[locale]/(app)/analytics/**`

## Purpose

Turn trade rows into actionable self-awareness. The Plan tells you what you intended; Analytics tells you what actually happened, sliced enough ways to find patterns the trader can't see by scrolling Journal.

## What lives there

- Overall stats: gross/net P&L, fees, win rate, profit factor, avg R, counts.
- Equity curves (daily-agg + per-trade) with drawdown overlay.
- Discipline score + trend (followed-plan %).
- Daily P&L calendar (heatmap).
- Streaks (current, longest win/loss; best/worst days).
- Performance by variable: asset, timeframe, hour, day-of-week, strategy.
- Expected value ($ + R based).
- R-multiple distribution.
- Hourly and day-of-week breakdowns.
- Time heatmap (24 × 5 grid).
- B3 session performance (pre-open / morning / afternoon / close).
- Radar (win rate, avg R, profit factor, drawdown, discipline, consistency).
- Account comparison (premium, ≥2 accounts).

## Inputs

- Date range, assets, directions, outcomes, strategies, timeframes, account scope (single or all).

## Outputs

- JSON metrics for every widget.
- Drilldown payloads filtered by predicate.

## Cross-feature integrations

- **Plan** — discipline trend pulled here, displayed on Plan month view.
- **Journal** — `followedPlan` + `outcome` drive discipline %.
- **Settings** — account balance is the equity baseline.
- **Playbook** — strategy filter feeds per-strategy stats.
- **Tax engine** — fee structure flows in via Reports, not Analytics directly.

## Where it fails

- **Account balance defaults to R$10k.** Hardcoded fallback when settings is empty. Equity numbers look reasonable but are wrong.
- **Equity curve = sum of P&L, not account value.** Capital events absent. Treats deposit + 10 winning trades the same as 10 winning trades.
- **Drawdown calc requires sorted trades.** Orphan or out-of-order rows produce false highs.
- **R-multiple averages skip trades without realized R.** Histograms exclude them silently; users assume completeness.
- **TZ drift on dayOfWeek.** `getBrtTimeParts()` anchors to BRT but date-fns weekStart/weekEnd uses local TZ — divergence around DST.
- **B3 session times are hardcoded.** When B3 shifts hours (it has), code needs manual update.
- **No drill-down from radar.** "Consistency = 78%" → no click target → power user must rebuild the predicate in Journal.
- **No reconciliation with B3 settlement.** Analytics uses `entryDate`; B3 settles D+1/D+2; year-end can misalign with what the broker reports.
- **Large unfiltered date ranges trigger N+1.** Visible as slow loads on accounts with 5K+ trades.

## Power combos

1. **Discipline drift detector.** Compare recent compliance (last 10 trades) vs older (trades 10–20). Drop → review Plan and CC checklist before next session.
2. **Best session × asset.** Cross-reference session-asset performance with strategy filter to surface "80% win rate, pre-open, PETR4, Strategy X" — replay it.
3. **Mistake tag + daily replay.** Filter Journal by mistake tag, see which days they cluster on, compare to equity curve dip days — quantify the cost of repeated errors.
4. **Risk per R bucket.** R-distribution histogram + expected value → if avg win is 1.2R and avg loss is 1.8R, the math is bad regardless of win rate. Drill the losers for oversized stops.
5. **Per-strategy + per-account comparison.** Two accounts (paper vs live) on the same strategy → comparison view exposes execution drag. Premium-only.
