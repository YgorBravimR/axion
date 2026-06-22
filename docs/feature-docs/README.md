# Axion — Feature Docs

> **Hard-usage documentation, one file per feature.** Each doc answers the same six questions: what it does, what it produces, what reads from it, where it fails, and how a power user wrings more out of it by combining it with others.
>
> Compiled 2026-06-20 by walking every page under `src/app/[locale]/(app)/` and `src/app/[locale]/(auth)/` plus the actions in `src/app/actions/`. Companion: [`../user-paths/axion-user-path.md`](../user-paths/axion-user-path.md) — the daily/weekly/monthly/quarterly/yearly path through these features.

---

## How to read these docs

Each file follows the same shape so you can diff features against each other:

| Section                        | Question                                                                 |
| ------------------------------ | ------------------------------------------------------------------------ |
| **Purpose**                    | What problem this solves in one sentence.                                |
| **What lives there**           | Concrete UI: tabs, forms, panels, charts.                                |
| **Inputs**                     | What the user types/uploads/picks.                                       |
| **Outputs**                    | What gets persisted + what downstream features read.                     |
| **Cross-feature integrations** | Where the data flows in and out.                                         |
| **Where it fails**             | Friction, edge cases, silent footguns, brittle parsers.                  |
| **Power combos**               | How a serious user chains it with 2–3 other features for compound value. |

The bias is **toward honesty**: every section names the specific places where the feature lets the user down. The point is to make those gaps visible.

---

## Feature index

### Daily operations

- [Command Center](./command-center.md) — pre-market plan, live status, circuit breaker, mood/bias logging. **Most important daily surface.**
- [Dashboard](./dashboard.md) — passive performance overview, Hawks coaching insights.
- [Journal](./journal.md) — trade entry (manual, scaled, CSV, nota, OCR), enrichment, tags, coaching reflection.

### Planning & rules

- [Plan (Fractal Plan)](./plan.md) — Year → Quarter → Month → Week target cascade, compliance trend, tax ledger.
- [Playbook](./playbook.md) — strategy library, versioned rule set, conditions scorecard, Hawks discipline score.
- [Settings](./settings.md) — accounts, capital, tax config, risk profiles, assets, timeframes, catalog bundles, user management.

### Performance review

- [Analytics](./analytics.md) — equity curve, discipline score, hourly/session/strategy breakdowns, radar.
- [Reports](./reports.md) — weekly/monthly summaries, mistake cost, prop-firm profit split, projection.
- [Annual Reports & Tax Engine](./annual-reports.md) — yearly DARF rollup, carryover chain, capital snapshot.

### Quant research & risk

- [Backtest](./backtest.md) — Renko/candle replay, Hawks quality gates, optimization sweeps.
- [Indicator Lab](./indicator-lab.md) — indicator catalog, formula browser, group CRUD.
- [Monte Carlo](./monte-carlo.md) — V1 strategy-quality and V2 capital-aware simulations.
- [Risk Simulation](./risk-simulation.md) — "what if I had different rules" replay over historical trades.
- [Equity Shield](./equity-shield.md) — drawdown protection with live/sim/suspended zones.

### Foundation

- [Auth & Multi-account](./auth.md) — register, verify email, login, account select, password recovery.
- [Hawks Mode](./hawks-mode.md) — daily bias confirmation, trade cap, coaching cascade.
- [Bug Reports](./bug-reports.md) — in-app feedback with console/network capture and screenshots.
- [Dev / Hawks Audit](./dev-pages.md) — internal engine lab, audit, fibo lab.

---

## Themes that recur across all features

These show up enough times that they belong here, not buried in any one doc:

1. **Brazilian-market reality is hardcoded.** B3 session times, SINACOR nota parser, DARF computation, BRT timezone, R$20k day-trade exemption assumption. International users would not be able to use most of these features. Anything time-bucket related drifts on DST boundaries.

2. **Hawks methodology pervades.** It's marketed as an optional mode but it leaks into Command Center, Journal (daily cap, bias gate), Playbook (Hawks discipline score), Backtest (quality gates), Dashboard (coaching). A non-Hawks user gets the cleaner UX; a Hawks user gets the most features. There's no third path.

3. **Premium gating is inconsistent.** Compliance trend (Plan), Conditions + Scenarios (Playbook), Account Comparison (Reports) all gate the _interesting_ features. Free users can create the empty containers but can't read what makes them valuable. The gates are not surfaced consistently.

4. **Cache invalidation is named explicitly but easy to miss.** `markTaxLedgerDirty`, `invalidateAggregates`, `invalidateTagData`, `invalidateSettingsData` — each mutation has to call the right one. When a write misses an invalidation, downstream views look stale and there's no UI signal.

5. **The R-multiple convention is load-bearing.** Renko R-size stores `R<N>` where N is the brick number, not ticks or points. Anywhere R-math happens (stops, BE thresholds, fibo measured moves) must convert `(size − 1) × 5`. This has bitten the engine repeatedly — see `CLAUDE.md` rule 0.

6. **Drill-down is shallow.** Most aggregate widgets (radar chart, mistake cost, hourly breakdown) are read-only summaries. Users can't click a bar to see the underlying trades. Power users have to build the link by hand: filter the journal by the same predicate.

7. **There is no live execution integration.** Axion records and reflects; it doesn't fire orders. The circuit breaker is a suggestion, not a kill switch on the broker. Discipline depends on the trader manually honoring the limits the UI shows.

---

## Conventions used in these docs

- File paths are relative to repo root.
- "Cents" means integer cents (the storage convention everywhere in the codebase).
- "Premium-only" or "(premium)" means the feature is gated behind the `premium` role.
- "Hawks-only" means the feature only renders/runs when `accountMode === "hawks"`.
- "(admin)" means the action requires admin role.
