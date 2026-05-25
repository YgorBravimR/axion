# Axion — Zero to Hero

> **The complete user journey from "I just signed up" to "Axion is my daily operating system."**
> Non-technical, product-side. For the feature catalog, see [`features.md`](./features.md).

---

## What this guide is

This is the **playbook for a brand-new Axion user** — the path from creating an account to using every part of the platform with intent. It's written linearly because real adoption is linear: you cannot meaningfully use the Dashboard until you have trades logged, and you cannot meaningfully log trades until you've defined the assets, tags, and accounts the journal references.

The guide is organized into **eight stages**. Each stage answers four questions:

1. **Why this stage exists** — what problem this part of Axion solves.
2. **What to do** — the actions in order.
3. **What you have at the end** — the outputs that unlock the next stage.
4. **Time investment** — realistic estimates.

Stages 0–3 are **one-time setup** (the first week). Stages 4–7 are the **recurring loops** (daily, weekly, monthly, yearly). Stage 8 is the **improvement flywheel** that compounds over months.

A trader who completes Stages 0–3 once and then runs Stages 4–7 on cadence is using Axion at full strength.

---

## Running example — Hawks methodology

Wherever this guide references "your strategy", "a playbook", or "a preset", we use **Hawks** as the running example. Hawks is Axion's first structured methodology — the proof-of-concept for the methodology-aware operating system (see [`feature-manifesto-2026-05.md`](feature-manifesto-2026-05.md) §5). The shape of every step is the same for ORB, DezK, or any methodology that lands later — substitute the name when the time comes.

If you trade your own undocumented setups (no mentor, no curriculum), substitute "Your Setup" wherever you read "Hawks". The Playbook + scorecard + compliance model still applies — Hawks is just the first one with a name.

Shipped Hawks-specific surfaces (verified in the feature manifesto):

- **Command Center**: Hawks pre-flight switches, Hawks scorecard, B3 cap card.
- **Journal**: Hawks sidecar fields on trade entry.
- **Backtest**: Hawks preset (`hawks_v0`, engine v0.2+).
- **Settings**: Hawks CSV import for back-loading prior trades.
- **Dashboard**: Hawks-flavored coaching insights card.

---

## Stage 0 — Welcome (Day 1, ~5 minutes)

### Why this stage exists

Get a verified, authenticated identity and select which trading account context you're working in. Everything downstream is account-scoped, so picking the right one matters from minute one.

### What to do

1. **Register** with email and password at `/register`. Use the email address you actually check — Axion will send a verification link there.
2. **Verify your email** by clicking the link. Until you do, your account is in a half-created state.
3. **Log in** at `/login`. You'll be redirected to the account selector.
4. **Select an account** — for first-time users, this is your default personal trading account. If you trade multiple accounts (a personal account plus one or more prop firm accounts), you'll create the additional accounts in Stage 1; for now, start with the default.
5. (Optional) **Set your language** — English or Portuguese (Brazil) — from the language switcher.

### What you have at the end

A verified, logged-in session inside one selected trading account. The app sidebar is visible, but most pages will show empty states because no data has been entered yet.

### Time investment

5 minutes.

---

## Stage 1 — Foundation Week (Days 1–3, ~2–3 hours total)

### Why this stage exists

Axion is a data-driven product. Everything from analytics to tax compliance reads from a small set of foundational definitions: **what accounts you trade, what assets you trade, what tags describe your setups and mistakes, what risk rules you follow, what strategies you run**.

This is the boring part. Skip it and the rest of the app shows empty cards, missing dropdown options, and broken analytics. Spend the 2–3 hours here and everything downstream just works.

You'll do this from the **Settings** page.

### What to do

Work through these in order. Each item builds on the previous.

#### 1. Trading accounts

Define every account you trade — personal accounts, prop firm accounts (FTMO, MFF, etc.), simulated accounts. For each, set the starting balance and the broker. Multi-account users will switch between these contexts later via the account picker.

#### 2. Assets

Define every instrument you trade — tickers, lot sizes, tick values. Common B3 assets like WINFUT (mini-Bovespa) and WDOFUT (mini-Dólar) need to exist here before they can appear in trade entry forms.

#### 3. Timeframes

Define the chart timeframes you reference (M1, M5, M15, H1, etc.). These appear in the strategy playbook and analytics filters.

#### 4. Tags — setup tags and mistake tags

This is the highest-leverage configuration step in Axion.

- **Setup tags** describe what you saw that made you take the trade ("ORB breakout", "VWAP rejection", "fakeout reversal").
- **Mistake tags** describe what went wrong with execution ("moved stop", "no stop set", "revenge trade", "FOMO entry").

Mistake tags drive the **Mistake Cost analysis** in Reports later — the dollar cost of each behavioral failure. Be honest and comprehensive; this is where Axion turns into a behavioral mirror.

#### 5. Trading conditions and indicator definitions

If you use technical conditions (e.g., "Price above 9 EMA", "RSI below 30") repeatedly across strategies, define them once here as reusable blocks. The Strategy Playbook will compose these into setup definitions.

#### 6. Risk profiles

Define one or more named risk profiles — for example, a "Conservative" profile with 0.5% risk per trade and a "Standard" profile with 1%. Risk profiles are attached to plans, simulations, and the equity shield, so changing the rule in one place propagates everywhere.

#### 7. Fee rates

For accurate tax math, configure broker fees per account and per asset class — corretagem, emolumentos, ISS, registro. The tax engine reads these directly. If you don't trade in Brazil, you can leave these at defaults.

#### 8. User profile and preferences

Set display name, brand/theme, and any preference toggles.

### Build the Hawks playbook

Now switch from Settings to the **Strategy Playbook** and create the Hawks playbook:

1. Click **New Strategy**. Name it **Hawks**.
2. Enter the Hawks entry criteria, exit criteria, and contextual conditions — the timeframes Hawks operates on, the assets it's valid for, the market sessions it's active in. Pull these from your Hawks curriculum / mentor spec.
3. Add Hawks setup screenshots — the canonical "what this setup looks like" reference images from the curriculum.
4. Tag each condition as **mandatory** (must be present to take a Hawks trade) or **optional** (improves the setup but not required). This is what powers per-trade compliance scoring later.
5. (Optional) Add **scenarios** — Hawks variants for different market regimes (trending day, ranging day, news/event day).

You'll need this playbook in place before you can link trades to it, before compliance tracking has anything to compare against, and before backtests have anything to validate. Hawks is the first methodology Axion treats as first-class — the Playbook detail page is being redesigned (per the manifesto) to make this gravity explicit.

### What you have at the end

A fully populated configuration layer: accounts, assets, tags, timeframes, conditions, risk profiles, fee rates, and at least one documented strategy. The Journal entry form now has all the dropdowns populated. The Playbook has at least one strategy card. The Settings page is no longer mostly empty.

### Time investment

2–3 hours total, spread across 1–3 days. Resist doing it in one sitting — tag lists especially benefit from a night of reflection.

---

## Stage 2 — Top-Down Planning (Day 4, ~45 minutes)

### Why this stage exists

Trading without a plan is gambling with extra steps. Axion forces a **fractal plan**: year goals decompose into quarter goals, into month goals, into week goals, into daily R limits. Every daily decision has a chain of context behind it.

You do this from the **Fractal Planning Suite**, starting at `/plan/[current-year]`.

### What to do

#### 1. Year-level plan

Open the year cockpit. Set:

- **Initial capital** for the year.
- **Capital ladder tiers** — the milestones at which you scale up position size (e.g., "at R$50k, go to 2 contracts; at R$100k, go to 3 contracts").
- **Trading days per week** — your default schedule (e.g., 4 days/week if you skip Fridays).
- **Default daily, weekly, and monthly R limits** — both gain caps (when you stop because you hit target) and loss caps (when the circuit breaker activates).
- **Default risk profile** to apply at the yearly level.

#### 2. Quarter-level plan

Open the current quarter. The yearly defaults cascade down automatically. Override only what's specifically different for this quarter — for example, you might widen daily R limits during a quarter where you're testing a new strategy, or attach a different risk profile.

The **provenance badge** on each value tells you whether the number came from the yearly default, a quarterly override, or a monthly override. This visibility is intentional: you should know why each number is what it is.

#### 3. Month-level plan

Open the current month. Set:

- **Snapshot capital** for the month start (Axion captures the actual starting balance).
- **Snapshot 1R value** — the dollar amount of one risk unit at this capital level.
- **Weekly breakdown** — week-by-week R targets within the month.
- Any **monthly-specific overrides** to daily R limits, risk profile, etc.

The month cockpit also shows a **what-if calculator** — a quick projection sandbox to play with parameters without committing changes.

### What you have at the end

A documented top-down plan: year goals → quarter goals → month goals → week targets → daily R limits. The yearly cockpit shows the full calendar with empty "reality" cells waiting to be filled by actual trading results. The Command Center will read these limits on Day 1 of live trading.

### Time investment

45 minutes for the first time. After the first year is set, quarter and month rollovers take ~10 minutes each.

---

## Stage 3 — Pressure-Test the Plan (Days 5–7, ~3–4 hours)

### Why this stage exists

You have a plan, but you haven't proven it survives reality. Before risking real money, Axion gives you four tools to stress-test it: **Backtest**, **Backtest Optimizer**, **Monte Carlo**, and **Risk Simulation**. Then **Equity Shield** locks in the drawdown protections that come out of those tests.

A trader who skips this stage will discover their plan's flaws with real money. A trader who completes it discovers them with simulations.

### What to do

#### 1. Backtest the Hawks playbook

Open **Backtest** and load the **Hawks preset** (`hawks_v0` — engine v0.2 or later; see backlog P1 #76 for the engine-version badge that surfaces version provenance in the UI). For methodologies without a preset yet, assemble from the entry, stop, target, and sizing modules — e.g., ORB breakout, MACD/WMA alignment for DezK, trailing stop, fixed targets. Run on historical candle data.

The backtest produces:

- Equity curve.
- Summary cards (profit factor, Sharpe, max drawdown, win rate).
- Full trade log of every simulated entry and exit.

Iterate: tweak parameters, re-run, compare. If the strategy doesn't survive backtesting, it doesn't survive live trading either.

#### 2. Optimize parameters

Once you have a working strategy, open **Backtest Optimizer**. The 3-step wizard lets you define parameter ranges (e.g., "test entry stop at 1R, 1.5R, 2R" and "test target at 2R, 3R, 4R"). The optimizer sweeps every combination and surfaces:

- A **heatmap** colored by your chosen metric.
- A **runs table** sortable by any KPI.

Don't over-optimize. Pick the parameter combination that's robust — middle-of-the-road good across many cells — not the single best cell.

#### 3. Monte Carlo simulation

Open **Monte Carlo** and run a simulation:

- **V1 (Edge Expectancy)** — Manual stats or import real stats from your historical trades (if you have any). Produces equity curves, drawdown distribution, Kelly criterion. Use this if you want to see "what does my edge look like statistically over 1,000 sequences of 200 trades?"
- **V2 (Capital Expectancy)** — Risk-profile-aware. Produces mode distribution and daily P&L. Use this when you want to stress-test a specific risk profile against your edge.

The key output is the **drawdown distribution**. If the 95th percentile drawdown exceeds your psychological pain threshold, you need a tighter risk profile.

#### 4. Risk Simulation (what-if replay)

If you have any historical trades (e.g., imported from previous broker statements), open **Risk Simulation**. Replay them with modified risk parameters:

- "What if I had used a 0.5% risk per trade instead of 1%?"
- "What if my stop had been wider?"
- "What if I had skipped trades on Fridays?"

The **equity curve overlay** shows the original vs simulated curves side-by-side. The **decision trace modal** lets you step through any single trade and see exactly what would have changed.

#### 5. Equity Shield calibration

Open **Equity Shield**. Set up zone-based scaling rules:

- **Method 1: MDD Exercise** — Calibrate from a maximum-drawdown exercise.
- **Method 2: SMA Crossover** — Calibrate from a moving-average crossover signal on your equity curve.
- **MC Calibration banner** — Auto-fill shield params from your most recent Monte Carlo run. This is the path most traders should take.

The shield activates automatically: when your equity curve enters a "reduced" zone, position sizes scale down; in a "suspended" zone, trading pauses entirely.

### What you have at the end

- A backtested, parameter-optimized strategy.
- A statistical view of expected drawdowns from Monte Carlo.
- A what-if-grounded confidence that your risk profile is appropriate.
- An active Equity Shield that will protect you from yourself during drawdowns.

You are now ready to trade live.

### Time investment

3–4 hours. The first cycle takes the longest; subsequent recalibrations (e.g., after a strategy edit) take 30–60 minutes.

---

## Stage 4 — The Daily Loop (Every trading day, ~15 min pre + 15 min during + 20 min post)

### Why this stage exists

This is what you actually do every day. It's the loop the rest of the platform was built to support. Three sub-loops: **pre-market**, **live session**, **post-market**.

### What to do

#### Pre-market (before market open, ~15 minutes)

1. Open the **Command Center**.
2. Set today's **bias** — bullish, bearish, or neutral. Commit before the market opens, then check at end of day whether the bias was right.
3. Set your **mood** — honest emotional check-in.
4. Run through your **daily checklist** — chart prep, news scan, calendar check, anything else you've defined as your pre-market routine.
5. Write **pre-market notes** — context, key levels, news catalysts, today's Hawks focus (which mandatory conditions you expect to see).
6. Run the **Hawks pre-flight switches** in the Command Center (the methodology-specific panel). These are the day-start gates Hawks requires — daily bias aligned, volatility regime acceptable, B3 cap card status. If any pre-flight gate fails, today is a no-trade day. Honor it.
7. Open the **Strategy Playbook** in another tab and re-read the Hawks mandatory conditions list — this is the gate on whether any intraday setup qualifies.
8. Check the **Market Monitor** for real-time quotes, B3 calendar status (is today a partial-session day?), and high-impact economic events.

#### During the live session (continuous)

9. Use the **Live Trading Status Panel** in the Command Center to see market open/closed status, your current position state, and live session P&L.
10. Watch the **Asset Rules Panel** for per-asset constraints you defined (e.g., "no overnight in WIN", "max 3 contracts on WDO").
11. Watch the **Hawks scorecard** in the Command Center — it surfaces how the current session is grading against the playbook in real time. Use it to decide whether the next setup qualifies.
12. Before every trade, use the **Position Calculator** (accessible from any page) to confirm your lot size against your active risk profile.
13. As trades fill, **log them to the Journal** — either immediately (manual entry with executions) or in batch at end of day via CSV/nota import. Tag the trade against Hawks with its mandatory-conditions-met state.
14. If you hit your daily loss limit, the **Circuit Breaker Panel** automatically locks new trade entry. Honor the lock; don't override it.

#### Post-market (after market close, ~20 minutes)

15. Finish logging any trades you didn't log live. Import paths if you didn't enter manually:
    - **CSV import** for broker statements (Clear, XP, Genial).
    - **Brokerage nota import** for Sinacor-format Brazilian notas.
    - **Hawks CSV import** (Settings → Hawks CSV) for back-loading prior Hawks-tagged trades.
    - **OCR import** for screenshots — Tesseract for offline, OpenAI Vision for richer extraction.
16. For each trade, **tag setups and mistakes** honestly. Link the trade to the Hawks playbook (or whichever playbook applied). Fill in any **Hawks sidecar fields** the journal entry exposes — methodology-specific data the analytics layer reads later.
17. Open each trade's **detail view** for the full autopsy: planned vs realized R, MFE (max favorable excursion), MAE (max adverse excursion), and the **Hawks compliance score** (how many mandatory conditions were actually present at entry). Write a narrative log entry — what happened, what you thought, what you'd do differently.
18. Write **post-market notes** in the Command Center — one or two sentences on the session.
19. Check the **Daily Summary Card** — end-of-day snapshot. Pay attention to the **Hawks coaching insights** card on the Dashboard — it surfaces methodology-aware patterns the canonical analytics view doesn't make obvious.

### What you have at the end of each day

- Every trade is logged with tags, strategy link, and a narrative.
- Bias and mood are recorded for later correlation analysis.
- Pre- and post-market notes capture the day's intent and reflection.
- The Dashboard, Analytics, and Reports views are now up-to-date.

### Time investment

~50 minutes per trading day, spread across the day. The post-market reflection is the highest-leverage 20 minutes you'll spend on Axion.

---

## Stage 5 — Weekly Reflection (Once per week, ~30 minutes)

### Why this stage exists

Daily reflection captures the trade; weekly reflection captures the pattern. The trader who looks only at single trades misses the cluster — three losses on the same setup, two on Mondays, all of them between 10:30 and 11:00.

### What to do

1. Open **Reports**.
2. Read the **Weekly Report Card** — 7-day performance summary.
3. Read the **Mistake Cost Analysis** — the dollar cost of each mistake tag this week. If "moved stop" cost you R$2,400 this week, that's the lesson.
4. Check the **Commission/Fee Impact Card** — how much you paid the broker. If fees are eating more than 10% of gross profit, revisit position sizing.
5. Open the **Journal** and re-read every trade with the week's perspective. Some trades read differently a week later than they did the night of.
6. Open the **Analytics** page and slice by tag, hour, day of week. Look for one pattern you didn't see on the daily view.
7. Adjust the next week's Monthly Plan if needed — for example, narrowing daily R limits if you've been over-trading.

### What you have at the end

- A clear picture of the week's behavioral pattern, not just its results.
- One concrete adjustment to take into next week.
- (Optional) A **PDF export** of the weekly report card for your records or for sharing with a mentor.

### Time investment

30 minutes, weekend or Monday morning.

---

## Stage 6 — Monthly Review + Tax (Once per month, ~1 hour)

### Why this stage exists

A month is long enough to see strategy-level signal through trade-level noise — and short enough that adjustments can still affect outcomes. It's also the cadence the Brazilian tax system runs on: DARF is calculated and paid monthly.

### What to do

#### Monthly performance review

1. Open the **Month cockpit** under Fractal Planning Suite.
2. Compare **plan vs reality** for the month — were you ahead, behind, or on pace?
3. Open **Monthly Review** for a focused read-only view: month comparison vs prior months, weekly breakdown, monthly projection at current pace, prop profit summary if you trade prop accounts.
4. Open **Reports → Monthly Report Card** for the 30-day summary with trend deltas.
5. Read the **R-Distribution** tab in Reports — is your win-rate-vs-R-multiple shape what you expected?
6. **Export the monthly PDF report** for your records.

#### Tax & compliance

7. Open the **Impostos tab** in the year cockpit (or `/reports` for the same cards in a different surface).
8. Review the **DARF strip** — twelve chips showing each month's status (pending / paid / exempt / overdue).
9. Open the **Monthly DARF card** for the just-closed month. It shows gross gain, fees, IRRF withholding, DARF due, and current status.
10. Pay the DARF outside of Axion (Receita Federal portal), then **mark it paid** in the app with the paid amount.
11. Check the **Carryover Ledger** — running prejuízo fiscal balance + history. If you had a loss month, the loss carries forward to offset future gains.
12. If your broker fees changed (e.g., promotional rates ended), update the **Fee Rate** configuration. Then use **Recompute Ledger** to retroactively re-chain the monthly tax ledger from the affected month forward.
13. Read the **Annual Tax Summary** card for your year-to-date rollup.

#### Plan adjustment

14. Back in the Fractal Planning Suite, edit the **next month's plan** based on what you learned. Use **provenance badges** to make sure you understand which numbers were inherited and which are explicit overrides.

### What you have at the end

- A complete monthly performance picture, both behavioral and financial.
- A paid-or-tracked DARF for the closed month.
- An adjusted plan for the next month.
- One month closer to a full year of data — at which point your analytics start producing real signal.

### Time investment

1 hour, on the first weekend of the new month.

---

## Stage 7 — Quarter & Year Review (Once per quarter and once per year, ~2–3 hours)

### Why this stage exists

Quarters and years are the cadence at which the **strategy itself** is up for revision, not just the parameters. You see seasonal effects, regime changes, and macro-environment shifts only at this horizon.

### What to do

#### Quarter review

1. Open the **Quarter view** in the Fractal Planning Suite.
2. Compare **plan vs reality at the quarter level**.
3. Re-read the previous quarter's pre-market notes (Command Center archive). What did you think the quarter would look like? What actually happened?
4. Adjust quarterly R targets for the new quarter; override risk profile if needed.

#### Year review

5. Open the **Yearly Cockpit** at `/plan/[year]`.
6. Read the **Annual Rollup Table** — 12-month patrimônio + capital tracking.
7. Review the **Capital Event Log** — every deposit and withdrawal in the year.
8. Use the **Withdrawal Calculator** to plan next year's withdrawal cadence vs target.
9. Read the **Weekly Meta Chart** — weekly meta vs real result across the year.
10. Check the **EOY Projection Banner** — end-of-year capital projection.
11. If you trade multiple accounts, open **Account Comparison** to see normalized side-by-side performance across all your accounts. Which prop firm gave you the most return on your effort?
12. Open **Analytics** with the year-long filter and look for **patterns invisible at shorter horizons** — seasonal effects (does October always underperform?), regime correlations (do you do worse in low-VIX periods?), asset migration (did your edge in WIN fade while WDO improved?).
13. **Year-end tax close-out** — review the full DARF strip, confirm every month is either paid or carries forward, and confirm the carryover ledger balance for the new year's opening.

#### Re-validate the system

14. **Re-backtest** your active strategies on the full year's data (now with the most recent year added).
15. **Re-run Monte Carlo** with the updated trade stats.
16. **Re-calibrate Equity Shield** from the new MC output.
17. **Update the Playbook** — retire strategies that no longer work, add new ones from the lessons of the year.

#### Set up the new year

18. Open `/plan/[next-year]` and complete Stage 2 (yearly planning) for the new year. Capital ladder thresholds usually need adjustment as starting capital grows.

### What you have at the end

A complete strategic review and reset. Year-N closes; year-N+1 opens with updated playbook, recalibrated shield, fresh plan.

### Time investment

2 hours per quarter, 3 hours per year-end.

---

## Stage 8 — The Improvement Flywheel (Continuous)

### Why this stage exists

Stages 4–7 are the maintenance loops. Stage 8 is what compounds over multiple years — turning Axion from a journal into a **personal alpha-generation system**.

### What to do, on opportunity rather than cadence

#### Mine your own data

- Open **Analytics** with no filter and look for one anomaly per session. Use the **Variable Comparison** to group by every dimension (asset, hour, day, direction, strategy) and watch for outliers.
- Use the **Tag Cloud Analysis** to find which setup tags have the highest expected value — and which mistake tags are quietly bleeding you. Tag every trade, every time, and the cloud becomes ground truth over months.
- Read the **Coaching Insights** card on the Dashboard daily. It surfaces patterns the analytics view doesn't make obvious.

#### Test ideas before adopting them

- Every new strategy idea goes through **Backtest → Optimizer → Monte Carlo → Risk Simulation** before it earns a place in your active playbook. Never trade an untested idea with size.
- Every risk-rule change goes through **Risk Simulation** on historical data to see what it would have done to the past.
- Every equity-shield param change goes through **MC Calibration** to re-derive the zones.

#### Maintain the system

- When something breaks or feels wrong, use **Bug Report Capture** — inline screenshot + description from inside the affected page.
- Use the **Page Guide System** for any unfamiliar feature; the overlays exist precisely for the moment you forget how something works.
- Periodically **review your Settings**: are your tags still capturing the right behaviors? Are mistake tags being honest? Are fee rates current? Is the risk profile still aligned with current capital?

#### Honor the boundaries

- **Don't override the Circuit Breaker.** It exists because you asked it to.
- **Don't trade without a logged strategy link.** If a trade doesn't fit any documented playbook strategy, that's a flag — either the playbook is incomplete or the trade is undisciplined.
- **Don't skip the post-market reflection.** Even a one-sentence narrative log on a winning day is worth more than a thorough writeup three days later.

### What you have over time

Six months in: a tag cloud that genuinely reflects your behavior. A year in: the seasonal patterns visible. Two years in: strategy-life-cycle data that lets you retire and adopt strategies with confidence. Three years in: a behavioral baseline so well-mapped that drift from it is detectable as a leading indicator.

### Time investment

15 minutes per week, on top of Stages 4–7.

---

## The full cadence at a glance

| Cadence               | What you do                                                                                                                                                                     | Time            |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| **First week**        | Stages 0–3: account, foundation, top-down plan, pressure-test                                                                                                                   | 6–8 hours total |
| **Every trading day** | Pre-market (Command Center), during session (Position Calculator, Live Panel, Asset Rules), post-market (Journal entry, autopsy, post-market notes)                             | ~50 minutes     |
| **Every week**        | Reports → Weekly Report Card, Mistake Cost, Commission Impact; Analytics pattern scan; one plan adjustment                                                                      | 30 minutes      |
| **Every month**       | Monthly Review + Monthly Report PDF + Monthly DARF card + carryover ledger check + next month's plan edit                                                                       | 1 hour          |
| **Every quarter**     | Quarter view plan-vs-reality + quarterly R target reset                                                                                                                         | 2 hours         |
| **Every year**        | Yearly Cockpit + Annual Rollup + Capital Events + Account Comparison + Year-long Analytics + re-backtest + re-Monte Carlo + Equity Shield recalibration + new year's plan setup | 3 hours         |

---

## What "fully using Axion" looks like

A trader extracting 100% of Axion's value is doing all of the following:

1. **Every trade is logged**, tagged honestly with setups and mistakes, linked to a playbook strategy, and has a narrative log entry by end of day.
2. **The daily Command Center routine** (bias, mood, checklist, pre/post notes) is run on every trading day, not just "important" ones.
3. **The Circuit Breaker is respected**, every time it triggers, without exception.
4. **The Fractal Plan is current** — month, quarter, and year cockpits reflect the actual state of the trader's goals, not stale numbers from when the year started.
5. **The Playbook has at least two strategies**, each with mandatory and optional conditions, scenarios for different regimes, and compliance metrics ticking up over time.
6. **Monthly DARF is calculated, paid, and marked** every month. The carryover ledger reconciles. Annual tax summary is reviewed in Q1 of the following year.
7. **Equity Shield is active and calibrated** from a Monte Carlo run that's no more than 3 months old.
8. **Reports are exported as PDFs** weekly or monthly, archived somewhere the trader actually reads them.
9. **The Analytics page is opened at least once per week** for one pattern hunt, not just for vanity metrics.
10. **The Playbook is updated quarterly** with retirements and additions based on the year's data.

If a trader is doing 8+ of those, Axion is operating at full strength.

If a trader is doing fewer than 4, the rest of the platform is decoration — the journaling is happening but the learning loop isn't closed.

---

## A note on time

The first week looks like a lot — 6–8 hours of setup before you can really trade. That's intentional. Axion's promise is that the **second year of trading is meaningfully better than the first** because the data structure was right from day one. Skipping Stage 1 (foundation), Stage 2 (planning), or Stage 3 (pressure-testing) saves a few hours up front and costs months of muddled analytics downstream.

The daily 50 minutes is non-negotiable. If you can't spare 50 minutes per trading day for the Command Center routine and post-market reflection, the journaling problem isn't Axion's tools — it's the time budget.

---

## Where to look when you're stuck

| Situation                                              | Where to go                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------- |
| "I don't know what's normal performance for me"        | Dashboard KPI cards + R-Distribution tab in Reports                    |
| "I had a bad week — was it bad luck or bad execution?" | Reports → Mistake Cost Analysis + Analytics tag cloud                  |
| "I'm not sure my strategy still works in this market"  | Re-backtest with the most recent 6 months of data + check compliance   |
| "I'm scared to size up"                                | Monte Carlo V2 with the larger size + Equity Shield zone preview       |
| "My equity curve is choppy"                            | Equity Shield diagnostics + Analytics by-day-of-week + Risk Simulation |
| "I owe taxes but don't know how much"                  | Monthly DARF card + Carryover Ledger + Annual Tax Summary              |
| "I want to compare my prop accounts"                   | Account Comparison page                                                |
| "Something looks broken"                               | Bug Report Capture (in-app screenshot tool)                            |
| "I forgot how a feature works"                         | Page Guide System (the overlay icon on every feature page)             |

---

## Closing — the philosophy

Axion is a **discipline tool**, not a productivity tool. Productivity tools make existing work faster. Discipline tools make new behaviors possible.

The platform was built around a single belief: **most trader losses are behavioral, not analytical**. The analytics exist to make the behavioral patterns visible — once you can see them, you can change them.

The Zero-to-Hero path described above isn't optional polish. Each stage exists because, without it, a downstream stage fails silently:

- Skip Settings → Analytics breaks.
- Skip Playbook → Compliance breaks.
- Skip Planning → Command Center has no numbers to enforce.
- Skip Pressure-Testing → Risk Shield isn't calibrated.
- Skip Daily Routine → no data to analyze on weekends.
- Skip Weekly Reflection → daily insights don't compound.
- Skip Monthly Review → no plan adjustments, no tax compliance.
- Skip Quarter/Year → no strategy evolution.

A trader who completes all eight stages once and then runs the daily/weekly/monthly/yearly cadence is operating as a one-person quantitative-discretionary trading firm. That's the user we built Axion for.
