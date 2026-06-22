# Plan (Fractal Plan)

> Hierarchical income planning: Year → Quarter → Month → Week. Cascades R-targets down and maps actual trades back up.

**Routes:** `/[locale]/plan/[year]`, `/plan/[year]/[quarter]`, `/plan/[year]/[quarter]/[month]`
**Server actions:** `fractal-plan/*`, `scenarios.ts`, `risk-profiles.ts`, `strategy-compliance-trend.ts`
**Files:** `src/app/[locale]/(app)/plan/**`, `src/app/actions/fractal-plan/`

## Purpose

Force the trader to define what success looks like at every cadence and then measure each cadence against it. Without the Plan, Axion is a journal. With the Plan, it becomes an accountability system.

## What lives there

### Year view (`/plan/[year]`)

- Setup summary: initial capital, capital ladder rules, daily/weekly/monthly win-loss R targets, assertivity %.
- Tabs: annual grid, weekly breakdown, payoff matrix (theoretical P&L by asset), exit conventions, tax ledger (DARF).

### Quarter view (`/plan/[year]/[quarter]`)

- 3-month aggregated summary with target vs actual.

### Month view (`/plan/[year]/[quarter]/[month]`)

- **The core operating hub.**
- Plan-vs-reality scoreboard.
- Caps-strip (week-by-week target Rs).
- Hawks scorecard (Hawks-only): VWAP %, ajuste %, triple-screen %, bias %.
- Compliance trend sparkline (premium).
- Month comparison (current vs prior).
- DARF tax row.
- Intent notes + post-mortem notes.
- Risk profile override.

## Inputs

- **Annual:** initial capital cents, capital ladder rules, default daily/weekly/monthly R targets, assertivity %, trading days per week, default risk profile, notes.
- **Monthly:** monthly goal override (cents), intent notes, post-mortem notes, risk profile override, week-level target Rs.
- **Historical:** actual trades populate the "real" side automatically.

## Outputs

- **Derived per-month targets** — cascade formula: annual → quarter → month via ladder tier × assertivity × compounding.
- **Plan-vs-reality scoreboard** — current PnL vs goal, daily average, projected month-end, tax estimate.
- **Weekly totals** — aggregated actual R + PnL per ISO week.
- **Tax ledger snapshots** — monthly gross, trader share %, tax owed (IR rate), withdrawal, net liquid.
- **EOY projection** — compounding projection if pace holds.
- **Compliance trend** (premium) — sparkline of compliance % across trading days.

## Cross-feature integrations

- **Journal** — trade rows populate the "real" columns.
- **Risk profiles** — daily resolver determines today's `oneRCents` and caps; month can override the default.
- **Playbook** — strategy condition compliance + Hawks discipline feed the month view's scorecard.
- **Command Center** — the breaker reads what Plan resolved.
- **Assets** — payoff matrix uses asset symbols.
- **Tax engine** — DARF row pulled from `recomputeAccountMonth()`.

## Where it fails

- **Stale snapshots are not explained.** Month "frozen" capital/tier/1R values get silently recalculated when ladder rules change, but the UI doesn't flag the change.
- **R-math footgun.** Hawks Renko brick sizes stored as `R<N>` (brick number), not ticks. Display R requires `(size − 1) × 5`. Easy to misread.
- **No month row → silent error.** If a month isn't created in the quarterly plan, the month view returns a vague "no month plan" message instead of offering to create it.
- **Nested URL validation fails silently.** `/plan/2026/Q1/m4` (month 4 in Q1) returns nothing useful.
- **Premium gating.** Compliance trend sparkline is paywalled — free users see a blank rectangle and no explanation.
- **22 trading days assumed.** Compounding logic doesn't adapt to real B3 holidays. Brazilian holidays shift weeks; the plan doesn't.
- **Weekly meta has no targets yet.** The annual report's weekly table has `metaBruto: null` because the fractal cascade doesn't actually emit weekly targets yet — only annual/quarterly/monthly. The week column is an empty shell.
- **No "draft" plan state.** Anything you type is live. There's no scratchpad mode.

## Power combos

1. **Plan + Hawks scorecard + Playbook.** Month view shows Hawks discipline per version of the active strategy. Cross-check against Playbook entry criteria; if discipline is low, fork the strategy with tightened entry rules and watch next month's score.
2. **Plan + Risk Profiles + Conditions.** Tag each strategy with conditions (VIX bands, RSI zones). Assign strategies to risk profiles. Monthly resolver picks the profile, conditions gate which strategies are allowed, Plan compliance shows whether you respected the gate. Iterate the conditions until compliance climbs.
3. **Plan + Tax ledger.** Watch the DARF row each month. If tax bite exceeds projected savings, adjust capital ladder or withdrawal % at quarter boundary — only place that exposes both at once.
4. **Monthly intent + post-mortem.** Open the month, write the intent. At month end, write the post-mortem before reading the metrics. Then read the metrics. The friction of writing the post-mortem from memory is the value.
