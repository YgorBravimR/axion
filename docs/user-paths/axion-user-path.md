# The Axion User Path — Daily, Weekly, Monthly, Quarterly, Yearly

> What a power user actually does inside Axion at each cadence. Feature-by-feature, in order, with the explicit handoffs between surfaces. Companion to [`../feature-docs/`](../feature-docs/).
>
> The bias is **toward what serious traders should do to extract more value from the combination of features**, not what a casual user gets by default. Where features fail to support a step, that's called out inline — not buried.
>
> Compiled 2026-06-20.

---

## The five cadences

| Cadence       | Anchor moment      | Primary surface                                   | Output                                           |
| ------------- | ------------------ | ------------------------------------------------- | ------------------------------------------------ |
| **Daily**     | Pre-market + close | Command Center → Journal → Dashboard              | Today's trades + bias + post-mortem              |
| **Weekly**    | Sunday review      | Reports (weekly) → Plan (month) → Playbook        | Next week's intent + breaker config              |
| **Monthly**   | Last trading day   | Plan (month) → Reports (monthly) → Annual Reports | DARF row + month post-mortem + next-month intent |
| **Quarterly** | End of quarter     | Plan (quarter) → Playbook → Backtest              | Strategy roster decision + capital ladder check  |
| **Yearly**    | Year-end           | Annual Reports → Tax Engine → Plan (year)         | DARF filing + carryover + next-year capital plan |

Each cadence builds on the previous. Skip a daily and the weekly is harder. Skip a monthly and the quarterly is impossible.

---

## Cross-cadence principles

Three rules govern every cadence below. They're worth internalising before reading the rest.

1. **Plan top-down, journal bottom-up, reconcile in the middle.** Plan cascades targets from Year → Month. Journal accumulates real trades. Reports + Analytics is where the two meet. Don't read Analytics without first re-reading the Plan intent — you'll rationalise whatever you see.
2. **Write before you read.** At every cadence boundary, write the post-mortem note before opening the metrics. Memory + intent first, data second. The friction of remembering is the value.
3. **Combine, don't browse.** Any feature in isolation is mediocre. The power comes from chains: CC → Journal → Analytics → Plan; Backtest → MC → Risk Sim → Profile → Plan; Journal enrich → tax dirty → annual rollup. Pick a chain per cadence and run it end to end.

---

# DAILY PATH

> Roughly 30 min pre-market, live during session, 30 min post-close. Two hard boundaries: bell open and bell close.

## D-1: The night before (optional but high-leverage)

If your bias for tomorrow is already informed:

1. Open **Command Center** with `?date=YYYY-MM-DD` for tomorrow.
   _Limitation:_ read-only for future dates. Write a draft note in your own scratchpad app; copy in at 05:30.
2. Glance at **Dashboard** Hawks coaching card. Note the suggested action.
3. If you're trading a new Playbook version tomorrow, open the strategy detail and re-read the entry criteria text.

## D0: 05:30–08:30 — Pre-market ritual

1. **Login** → account picker. Pick today's account.
   _Power use:_ the 7-day P&L sparkline tells you which account is bleeding. Pick that one.
2. **Command Center → Command tab**:
   - Confirm/edit the **daily checklist**. Hard rule: don't trade until the checklist is 100%.
   - Read the **circuit breaker panel**. Note `oneRCents`, daily loss cap, max trades. Internalise the numbers — don't trust the UI to enforce them mid-session (it shows them but the broker doesn't know).
   - Write **pre-market notes** (premium): macro calendar, key levels, news risks, what you will and won't trade.
3. **Hawks-only:** confirm **daily bias** (bullish/bearish/neutral) + the four screens (Renko60, MACD, EMA stack, VWAP, ajuste). No bias → no trades. Write Portuguese notes if context demands.
   _Limitation:_ bias missing alert is a soft warning, not a hard block on the CC page — but it does block trades at journal entry. Better: treat the absence as a no-trade day.
4. **Playbook**: open the strategy you plan to trade today. Re-read entry / exit / risk criteria + conditions. If the conditions don't hold pre-open, don't pretend they will mid-session.
5. **Settings → Risk Profiles** (rare; only if today is a regime change): confirm the active profile matches today's intent. If you switched from "Aggressive" to "Conservative" overnight, double-check the CC breaker updated.

## D0: 08:30–17:00 — Live session

Axion does _not_ fire orders. Every loop below is manual.

For each trade:

1. **Before entry**:
   - Check **Command Center** for current daily ordinal (Hawks) and remaining R budget (`getLiveTradingStatus`).
   - Open **Calculator** tab → punch in stop distance → get position size that respects today's R.
2. **At entry**:
   - **Journal → New** (Quick-Add FAB from CC). Choose Single or Scaled mode.
   - Fill: asset, direction, entry price, stop, target, strategy, **pre-trade thoughts**. The pre-trade field is optional but everything Coaching can detect later depends on it.
   - For Hawks: trade gets blocked if bias missing or daily ordinal at cap.
3. **During the trade**:
   - Don't reopen Axion. Stay on the broker.
   - If you take a partial / scale, hold the fill data for entry later in Scaled mode.
4. **At exit**:
   - Update the trade row with exit price, post-trade reflection, rating, tags.
   - Mark `followedPlan` honestly. Lying here destroys the discipline metric across every other surface.

## D0: 17:00–18:00 — Post-close ritual

1. **Journal → Enrich** if any trade is `enrichmentStatus = pending` (you skipped fields during the session). Resume from snapshot if mid-batch.
   _Limitation:_ no auto-save. Don't navigate away mid-batch.
2. **Command Center → Command tab**:
   - Write **post-market notes** (premium): what worked, what broke, what to do differently tomorrow.
   - Review the daily P&L summary.
3. **Dashboard**: skim the equity curve and discipline radar. If today was a red day, look at the heatmap for the prior week — is this a streak or an outlier?
4. **Hawks-only**: glance at the coaching card. Tomorrow's bias should be informed by what it says.

## Where the daily path fails

- **Pre-market notes are premium.** Free users have nowhere inside Axion to write the plan — they end up using Notes / Notion and the context never makes it into the same screen as the live status.
- **Calculator tab doesn't read the active strategy's R-target.** You retype values you already have in Playbook.
- **Quick-Add FAB pre-fills asset/timeframe but not strategy.** You set the strategy fresh each trade, which is error-prone.
- **No real-time live-status refresh.** R-drawn is server-rendered; refresh required.
- **Enrichment auto-save absent.** Mid-batch nav = lost work.
- **Hawks coaching is one card.** The pattern detector finds more than one insight; you only see the top one.

## Daily power combos

1. **Plan resolver → CC breaker → Journal gate.** This is the canonical chain. Tighten the Plan profile; CC breaker reflects it; Journal blocks over-risk trades. If any link is misconfigured, you'll over-risk and not know.
2. **Pre-trade thoughts → Post-trade reflection → Coaching detection.** Force yourself to write three sentences pre-trade and three post-trade. Coaching's pattern detector picks up themes you can't see in your own writing.
3. **Bias → Hawks ordinal → Coaching loop.** Confirm bias → trades increment ordinal → next day's coaching grades the bias. Closed loop, 24-hour cycle.
4. **Same-day CC time travel.** During Friday review, walk back through the week via `?date=` — read each day's pre-market notes vs post-market notes vs P&L. Three columns of context per day.

---

# WEEKLY PATH — Sunday review + Monday set-up

> Roughly 60–90 min on Sunday evening. The single highest-ROI cadence — most traders skip it. Don't.

## Sunday: Review the week

1. **Reports → Weekly**. Pick last week.
   - Skim: trades, P&L, win rate, fees, avg R.
   - Read top 3 wins and top 3 losses. Open each in **Journal detail**. Re-read your reflection.
2. **Analytics**: filter to the last 7 days. Look at:
   - Hourly breakdown — were you trading the wrong hours?
   - Asset breakdown — was one asset dragging the rest?
   - Discipline trend — was the followed-plan % stable or sliding?
   - Mistake tag cost — which mistake cost the most this week?
3. **Plan → Month view**: read the caps-strip (this week's row). Compare actual R to weekly target R. Note the gap.
   _Limitation:_ the weekly target column is currently a placeholder (`metaBruto: null`) until the fractal cascade emits weekly targets. Use the monthly target / 4 as a manual proxy.
4. **Playbook**: for each strategy you traded this week, check compliance trend (premium) and version stats. If a version has a long compliance dip, consider forking.
5. **Hawks-only**: open coaching. Look at win rate per bias direction over the trailing window.
6. **Write the Sunday post-mortem** in Plan → Month → intent/post-mortem notes. Three sections: what happened, what I learned, what I'll change next week.

## Monday morning: Set the week

1. **Plan → Month view**:
   - Update **intent notes** for this week.
   - Confirm the **risk profile override** for the week, if any (e.g., go to "Conservative" after a drawdown week).
   - Adjust **week-level target Rs** if last week was off-pace.
2. **Settings → Risk Profiles**: only if the profile itself needs a change (rare). Otherwise leave alone.
3. **Playbook**: archive or fork strategies that failed last week. Set which strategies are "in scope" this week.
4. **Command Center checklist**: revise checklist items if the post-mortem surfaced a discipline gap (e.g., "no trades in first 5 minutes").
5. **Monte Carlo** (every 4–6 weeks, not every week): re-run with the latest 90-day stats. If median outcome shifted, the strategy regime has changed.

## Weekly power combos

1. **Reports weekly → Journal detail → Plan intent.** Three surfaces. One narrative: what happened → why (per trade) → what to change.
2. **Mistake cost report + Tag stats.** Reports shows total cost per mistake tag. Cross-reference with Analytics tag breakdown to see whether the cost is concentrated in 2 trades or spread across 10. Two different remedies.
3. **Compliance dip → fork strategy.** Playbook compliance trend drops → open the live version → fork with tightened entry criteria → tag the new version with this week's intent.
4. **Discipline drift detector.** Compare this week's discipline % to last week's (Analytics). If the slide is real, tighten CC checklist before Monday.
5. **MC sanity check on streak.** After a 5-day win streak, MC is the antidote to overconfidence — median of 1000 sims tells you whether the streak is luck or edge.

## Where the weekly path fails

- **Weekly meta nulls** — Plan's weekly target column is empty until the cascade emits weekly targets.
- **No "weekly review" mode in Plan** — you write the post-mortem in the month-level intent notes, which conflates the weekly and monthly post-mortems.
- **Compliance trend is premium.** Free users can't see the headline data this review depends on.
- **Tag stats can be slow** at 5K+ trades; the Sunday review is the worst time for a 2-second spinner.

---

# MONTHLY PATH — Month-end + new-month set-up

> Roughly 2–3 hours over the last trading day + first weekend. Tax-implicated; do it right.

## Last trading day of the month

1. **Command Center**: write a final post-market note that explicitly addresses the month's intent (from Plan).
2. **Journal → Enrich**: clear all pending trades for the month. The tax ledger doesn't recompute reliably with incomplete data.
3. **Journal CSV/Nota import** (if any external broker statement): upload before the cutoff. Fees recomputed; tax ledger dirtied; annual rollup refreshes.

## First weekend after month-end

1. **Plan → Month view**:
   - Read the **plan-vs-reality scoreboard**. Note the gap.
   - Write the **month post-mortem** in intent/post-mortem notes. Hard rule: write it _before_ reading Analytics.
2. **Reports → Monthly**:
   - Read weekly breakdown — which week was the outlier?
   - Asset breakdown — concentration risk?
   - Mistake cost — which mistake category dominated?
   - Commission / fee impact — fees vs P&L ratio. Anything > 10% is a problem.
   - Prop calculation (if prop): trader share vs firm cut.
3. **Analytics** (full month filter):
   - Equity curve shape (steady vs spiky).
   - R-distribution histogram — is your avg loss bigger than your avg win?
   - Session performance — concentrated in pre-open or spread out?
   - Time heatmap (24 × 5) — which hour/day combo paid?
4. **Annual Reports → current year**:
   - Open the month row. Confirm `resultadoLiquido`, `imposto` (DARF), `taxas`.
   - **Tax Engine**: if DARF > 0, file it. Then `markDarfPaid(month, amount)`. Carryover updates.
     _Limitation:_ no Receita Federal API integration. Manual filing.
5. **Playbook**:
   - Per-strategy stats for the month. Which versions thrived?
   - Compliance trend per strategy.
   - Archive losing versions.
6. **Plan → Next month**:
   - Write next month's **intent**.
   - Set next month's **target Rs**.
   - Set next month's **risk profile** (carry over or change).
   - Adjust **monthly goal cents** if compounding changed the calc.

## Monthly power combos

1. **Plan intent → Analytics filter → Reports row → Tax ledger.** Four surfaces, one chain. Goal → reality (analytics) → summary (reports) → financial consequence (tax). Skip any link, the chain breaks.
2. **Capital event correction.** Deposit/withdraw during the month → Settings (capital snapshot) → annual rollup row updates → Plan EOY projection rebases. One change ripples five places.
3. **Strategy retirement decision.** Playbook detail says version X has 4 months of declining compliance. Plan month says it dragged this month's P&L. Decision: archive, fork, or pause. Document the call in next-month intent.
4. **MC re-calibration after good/bad months.** Run MC with the latest 6-month win rate / R. If median MC outcome shifted > 20%, your edge changed — regime change confirmed.
5. **Prop-firm month report.** Combine Reports monthly with Plan compliance trend → narrative for the firm. Win rate ±, avg R ±, discipline ±, system stability assessment.

## Where the monthly path fails

- **R$20k day-trade exemption not surfaced.** Brazilian traders skip the exemption they're owed because Reports doesn't break it out.
- **DARF status has no overdue alert.** If you forget to file, nothing reminds you. Calendar reminder is on you.
- **Tax engine doesn't auto-recompute on rate law change.** Manual `recomputeLedger()` call required if Lei changes.
- **B3 settlement mismatch.** Trades crossing month boundaries (Dec 31 entry, Jan 2 settlement) tax inconsistently.
- **Equity curve in Dashboard ignores capital events.** A monthly deposit looks like a winning trade.

---

# QUARTERLY PATH — Q-end strategy roster review + capital ladder check

> Roughly 4–6 hours over one weekend. Less time-sensitive than monthly, more strategic.

## Q-end weekend

1. **Plan → Quarter view**: read aggregated 3-month target vs actual. Note the gap at quarter scale (smooths out monthly volatility).
2. **Analytics** (full quarter filter):
   - Best / worst sessions, hours, assets, strategies — bigger sample, more stable signal.
   - R-distribution shape — is your distribution healthy (small losses, occasional large wins) or pathological (large losses, capped wins)?
3. **Backtest**:
   - Re-run your live strategy on the past quarter's data.
   - Compare backtest equity to live equity. The gap is your execution drag (slippage + discipline + timing).
   - If the gap is > 30%, the strategy isn't broken — your execution is.
4. **Monte Carlo**:
   - Feed in the quarter's measured win rate, R, commission.
   - Worst-case drawdown — is it within your DD tolerance?
   - Kelly fraction — compare to current Plan risk %.
5. **Risk Simulation**:
   - Replay the quarter's trades with alternative rules (tighter stops, post-loss size reduction, lower daily cap).
   - Compare simulated P&L to real P&L. The diff is what your current rules cost you.
6. **Equity Shield**:
   - Calibrate from MC worst case.
   - Adjust DD limit if quarterly drawdown taught you something new.
7. **Playbook**:
   - Per-strategy 3-month stats.
   - Decide the strategy roster for next quarter: keep, fork, pause, archive.
   - Per-strategy condition scorecard (premium): which conditions you keep missing.
8. **Plan → Next quarter**:
   - Quarter intent: what's the dominant arc for the next 3 months?
   - Capital ladder review: have you climbed a tier? Should you?
   - Update annual targets if reality has diverged > 20% from plan.
9. **Settings**:
   - Tax config: is your `taxExemptThreshold` still right?
   - Risk profiles: do any need new branches in the decision tree?
   - Asset roster: have you been ignoring an asset that should be retired?

## Quarterly power combos

1. **Live-vs-backtest delta.** Re-backtest the same strategy on the same quarter's data and overlay both equity curves. The gap is execution drag — quantified. Use the number to tighten CC checklist next quarter.
2. **MC → Shield → Plan triangle.** MC worst-case → Shield DD limit → Plan ladder tier. All three should agree on what risk is acceptable. If they disagree, one is wrong.
3. **Risk Sim quarter replay.** Run last quarter's trades with the rules you're considering for next quarter. The simulated P&L tells you whether the new rules would have helped.
4. **Strategy roster decision matrix.** Playbook per-strategy stats × Plan compliance × Backtest forward-test → 2×2 (Performance × Compliance) → keep top-right, fork mid, pause/archive rest.
5. **Quarterly post-mortem in Plan annual notes.** Plan year view supports notes; treat one paragraph per quarter as your year's narrative.

## Where the quarterly path fails

- **No "quarter post-mortem" field in Plan.** You squeeze it into year-level notes.
- **No live-vs-backtest overlay screen.** You have to screenshot and compare manually.
- **Risk Sim hindsight bias.** "I'd have done better with tighter stops" — but you wouldn't have, because slippage and decision latency don't transfer.
- **Capital ladder isn't auto-evaluated.** You eyeball "have I climbed a tier" against rules you wrote 3 months ago.

---

# YEARLY PATH — Tax filing + next-year capital plan

> Roughly 8–12 hours across the first two weeks of the new year. Highest stakes (DARF), longest horizon.

## Year-end (Dec 31 close)

1. **Journal**: clear all pending enrichments.
2. **Journal Nota import**: upload final notas. Tax ledger dirtied. Annual rollup refreshes.
3. **Plan → Year view**: write the _year_ post-mortem in annual notes before opening any report.

## Early new year (Jan 1–15)

1. **Annual Reports**:
   - 12-month rollup table. Confirm each `resultadoLiquido`, `imposto`, `taxas`, `pontos`.
   - Yearly capital snapshot: deposits, withdrawals, running balance.
   - Year totals.
2. **Tax Engine**:
   - `getYearTaxSummary()` for the IR burden %.
   - Per-month DARF status. File any pending. `markDarfPaid` after each.
   - **Carryover state**: note the December carryover-out balance — that's next year's starting offset.
     _Limitation:_ no Receita Federal integration. Export CSV; hand to accountant.
3. **Annual capital reconciliation**:
   - Patrimônio final at Dec 31 vs starting balance Jan 1 — does the delta match (P&L − fees − tax − withdrawals + deposits)?
   - Any mismatch → audit. Common cause: capital event misclassified or trade not enriched.
4. **Analytics → full year**:
   - Annual equity curve.
   - Year-over-year comparison if you have prior years.
   - R-distribution shape over the longest sample you have.
5. **Backtest → full year**:
   - Re-backtest your dominant strategy on the full year.
   - Compare backtest CAGR to live CAGR. The gap is your year's execution drag.
6. **Monte Carlo → year-forward**:
   - Use year's measured edge to project next year's distribution.
   - Plan against the median, prepare for the 25th percentile, survive the 5th.
7. **Plan → New year**:
   - Set annual targets (R, R%, capital).
   - Capital ladder rules — update tier thresholds if last year taught you the prior thresholds were wrong.
   - Default risk profile.
   - Annual notes: dominant arc for the year.
8. **Settings**:
   - Tax config: new year, new `taxExemptThreshold` if law changed.
   - User settings: re-evaluate prop firm % if contract renewed.
9. **Playbook**:
   - Annual per-strategy report.
   - Archive strategies that haven't worked.
   - Promote any backtest-only strategies that proved themselves in prior quarter.
10. **Equity Shield**: full re-calibration from a year of MC sims.

## Yearly power combos

1. **DARF filing chain.** Annual rollup → file per month → `markDarfPaid` → carryover updates → write the carryover number into next year's January intent so you don't forget it Apr 1.
2. **Carryover cascade across years.** Last December carryover-out → this Jan starting offset → annual rollup pre-loaded → next year's tax math correct from day 1.
3. **Year-over-year radar.** Take screenshots of Dashboard radar at Dec 31 each year. Year 1 vs Year 2 vs Year 3 — see whether the shape improved (more discipline, less drawdown, better R).
4. **Prop-firm annual renewal narrative.** Annual rollup totals + Plan compliance trend + Backtest vs live + RiskSim what-if → contract renewal one-pager.
5. **Backtest → MC → Plan re-anchoring.** Backtest full year → MC project next year → Plan annual target lands inside the MC 25th–75th percentile, not at the median. Realism by construction.

## Where the yearly path fails

- **Receita Federal integration absent.** Filing is manual.
- **Carryover chain can quietly break** if any month fails to recompute. `recomputeFromMonth` exists but isn't surfaced in the UI.
- **No "year archive" snapshot.** You can't freeze "the year as we filed it" — if you edit a December trade in March, the year's tax row re-derives.
- **B3 settlement boundary is fuzzy.** Dec 31 entries that settle Jan 2 land in last year's annual rollup by entry date but in this year's broker statement by settlement date.
- **Plan year view is mostly a setup form.** It doesn't show a full-year compliance ribbon; you have to walk each month manually.
- **No tax-year carryforward planning.** Annual rollup shows the carryover; doesn't help you decide how to deploy it.

---

# Where the platform falls short across cadences

These are the gaps that hurt regardless of which cadence you're in. They're the next mile of platform work, in priority order.

1. **Plan's weekly target column is null** until the fractal cascade emits weekly targets. The weekly review is hobbled.
2. **No live order integration.** Discipline depends on the trader honouring the CC breaker manually.
3. **Equity curve = sum of P&L, not account value.** Capital events are invisible. The most-viewed chart misrepresents account state.
4. **Premium gates the interesting stuff** without clear value comparison: compliance trend, conditions, account comparison.
5. **No drill-down from aggregate to trades.** Every chart should be a filter button.
6. **Reflection capture is sparse and unvalidated.** Coaching is starved of signal.
7. **No auto-save on enrichment.** Mid-batch nav kills the draft.
8. **R-multiple conversion is load-bearing and easy to misread** (Renko R-size). Every form that uses it should print the converted value.
9. **No yearly archive.** You can't pin a tax filing snapshot.
10. **TZ and DST edge cases** silently mis-bucket trades on rare days.
11. **Coaching is 1-card.** Pattern detector finds more; UI shows one.
12. **No journal of plan changes.** Risk profile or capital ladder edits don't write to an audit log.
13. **No quarterly post-mortem field.** Quarter view is summary-only.
14. **Multi-account features are inconsistent.** Picker is great; comparison is premium-gated; consolidated reports across accounts don't exist.
15. **No system for graduating a strategy** from backtest-only to live. Manual decision; no checklist.

---

# How to read this doc against `zero-to-hero.md`

[`../zero-to-hero.md`](../zero-to-hero.md) covers the **first** journey: from "I just signed up" to "I logged my first month." This doc covers the **steady-state** journey: what you do _after_ you're set up, week after week, year after year.

If you're new: read `zero-to-hero.md` first, do its steps, then come back here and start at the Daily section.

If you're already steady-state: this is the playbook. Skip to your weakest cadence. For most traders, that's the Weekly — the Sunday review is the highest-ROI hour of the week and the easiest to skip.
