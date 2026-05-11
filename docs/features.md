# Axion — Feature Catalog (Product View)

> **Audience**: product, design, business stakeholders, and onboarding teammates who need to understand **what** Axion does and **why**, without reading code.
> For the engineering-side map (file paths, components, server actions), see [`project-description.md`](./project-description.md).

---

## What Axion is

Axion is a **professional-grade journal and decision system for solo day traders and trading-mentorship students**, built around Brazilian market reality (B3 assets, DARF tax compliance, BRT timezone).

It exists because most trading platforms record trades but don't help traders **improve**. Axion's job is to turn raw trade data into actionable self-awareness — understanding not just _what_ happened in a session, but _why_, and _what to do differently tomorrow_.

The product is structured around the trader's daily rhythm:

| Mode                 | When                | What the trader needs                                             |
| -------------------- | ------------------- | ----------------------------------------------------------------- |
| **Plan & Prepare**   | Before market open  | Goals, capital limits, strategy review, bias setting              |
| **Live Session**     | During market hours | Mood/bias logging, live status, position sizing, circuit breaker  |
| **Record & Reflect** | After market close  | Trade journaling, screenshots, mistake tagging, post-market notes |
| **Review & Improve** | Weekly / monthly    | Performance analytics, pattern detection, plan vs reality, taxes  |

Every feature below maps to one or more of those modes.

---

## Plan & Prepare

### Fractal Planning Suite

**Purpose** — Help the trader plan their year, quarter, month, week, and day as a single connected hierarchy, so that daily decisions are anchored to long-term goals.

**Delivers** —

- A **yearly cockpit** showing capital ladder, projected end-of-year capital, monthly DARF strip, and plan-vs-reality across the year.
- A **quarter view** for R-based targets at the quarter level.
- A **month cockpit** with weekly breakdowns, snapshot capital, 1R value, and what-if calculations.
- **Provenance badges** on every value so the trader knows whether a number was inherited from the yearly default, a quarterly override, or set explicitly for that month.
- A **what-if calculator** for quick projection sandboxing without committing changes.
- **Risk profile attachment** at any plan level so risk rules cascade down with the plan.

**Connects to** —

- **Journal** — real trade results flow up into plan-vs-reality views.
- **Reports** — weekly/monthly cards consume the same monthly capital snapshots.
- **Yearly Tax Reporting** — the year cockpit hosts the DARF Impostos tab.
- **Risk Simulation** — plans can be prefilled into what-if simulations.
- **Equity Shield** — capital ladder informs shield thresholds.

---

### Strategy Playbook

**Purpose** — Force the trader to write down their strategies before trading them, then track how well they actually follow their own rules.

**Delivers** —

- A **strategy library** with entry/exit criteria, technical conditions, screenshots, and scenarios for different market conditions.
- **Reusable condition blocks** (technical indicators, price-action patterns) that can be shared across strategies.
- **Tiered conditions** (mandatory vs optional with weights) so partial setups can be scored.
- A **compliance dashboard** showing how often the trader actually followed each strategy versus deviated.
- **Interactive strategy walkthrough** for review and onboarding.

**Connects to** —

- **Journal** — each trade can be linked to a strategy, which feeds compliance metrics.
- **Backtest** — strategy presets can be backtested on historical data.
- **Analytics** — performance can be sliced by strategy.

---

### Position Calculator

**Purpose** — Give the trader a fast, risk-aware lot-size answer at any moment without leaving the page they're on.

**Delivers** —

- A floating calculator that returns position size based on capital, stop distance, and risk-per-trade rules.
- Accessible from anywhere via a dialog, including during a live session.

**Connects to** —

- **Settings → Risk Profiles** — defaults pulled from the active profile.
- **Command Center** — used as part of the pre-trade routine.

---

## Live Session

### Command Center (Daily Cockpit)

**Purpose** — Be the trader's pre-market preparation, live-session control room, and post-market reflection space — all in one screen.

**Delivers** —

- **Bias selector** (bullish / bearish / neutral) to commit a directional view before the session starts.
- **Mood selector** for emotional-state tracking that can later be correlated with performance.
- **Daily checklist** for pre-market routine verification (chart prep, news scan, calendar check).
- **Pre-market and post-market notes** as rich-text fields for preparation and reflection.
- **Circuit breaker panel** that auto-locks trading once a daily loss limit is hit, removing the "one more trade" temptation.
- **Live trading status panel** showing whether the market is open, whether the trader is in an active position, and current session P&L.
- **Asset rules panel** for per-asset constraints (e.g., "no overnight in WIN", "max 3 contracts on WDO").
- **Daily summary card** that closes out the day with key metrics and a place to write a one-line lesson.

**Connects to** —

- **Journal** — trades logged today fill the daily summary.
- **Fractal Planning Suite** — daily R limits, asset rules, and capital snapshots come from the active monthly plan.
- **Market Monitor** — live quotes and B3 status feed the live panel.
- **Analytics** — historical mood/bias data is correlated with performance over time.

---

### Market Monitor

**Purpose** — Give the trader a single live view of the assets and calendar events that matter to them, without opening a separate chart platform.

**Delivers** —

- **Real-time quotes** from multiple providers (Yahoo Finance, BRAPI, CoinGecko, BCB).
- **B3 trading calendar** with Brazilian market holidays and partial-session flags.
- **Economic calendar** with high-impact event highlights.
- A **public version** at `/monitor` and `/painel` for non-authenticated reference.

**Connects to** —

- **Command Center** — live status panel reads market open/close state from this system.
- **Journal** — asset definitions used here also drive trade entry forms.

---

## Record & Reflect

### Journal (Trade Logging & Autopsy)

**Purpose** — Be the single source of truth for every trade, captured by whatever method is fastest for the trader in the moment — and turn each entry into a learning artifact, not just a row in a table.

**Delivers** —

- **Manual trade entry** with full execution detail (scaling in/out), tags, playbook link, and screenshots.
- **Multi-execution support** so a trade with three partial entries and two scaled exits is one trade, not five.
- **CSV import** for broker statements (Clear, XP, Genial parsers).
- **Brokerage nota import** parsing the Brazilian Sinacor format directly.
- **OCR import** that turns a broker screenshot into a trade via Tesseract (offline) or OpenAI Vision (richer extraction).
- **Trade detail view** as a full autopsy: planned vs realized R-multiple, MFE/MAE (max favorable/adverse excursion), narrative log, chart view.
- **Smart search** with fuzzy matching across all trades.
- **Period filter** with date range and quick presets (this week / this month / custom).
- **Day groupings** that organize trades by session date, with day-level P&L and trade-count headers.
- **R-multiple bar** that visualizes planned versus actual risk taken on each trade.

**Connects to** —

- **Dashboard / Analytics / Reports** — every trade flows into all downstream performance views.
- **Strategy Playbook** — trades can be linked to a strategy for compliance scoring.
- **Settings → Tags** — setup tags and mistake tags annotate trades for behavioral analysis.
- **Yearly Tax Reporting** — closed trades feed the monthly DARF ledger.

---

## Review & Improve

### Dashboard (Performance Overview)

**Purpose** — Be the first screen the trader sees on login and tell them, at a glance, how they've been performing and where to look next.

**Delivers** —

- **KPI cards** for Net P&L, Win Rate, Profit Factor, Avg R-Multiple, and Discipline Score.
- **Trading calendar** as a monthly grid color-coded by day performance.
- **Equity curve** as a line chart with drawdown overlay.
- **Cumulative P&L chart** and **daily P&L bar chart** for two complementary views of the same data.
- **Performance radar chart** showing the trader's strengths and weaknesses across multiple dimensions on one chart.
- **Day detail modal** — clicking a calendar day opens the full session breakdown.
- **Coaching insights card** that uses pattern detection on the trader's own history to suggest behavioral corrections.

**Connects to** —

- **Journal** — source of all trade data.
- **Analytics** — "see more" links jump to deeper slices.
- **Fractal Planning Suite** — KPIs are evaluated against the active monthly plan.

---

### Analytics Engine

**Purpose** — Let the trader slice their performance by any variable that matters (time, asset, tag, strategy) to find the patterns that aren't visible in the headline numbers.

**Delivers** —

- **Variable comparison** — group performance by timeframe, asset, time of day, direction, or strategy.
- **Tag cloud analysis** showing how setup tags and mistake tags each contribute to P&L.
- **Expected value calculator** projecting outcomes over N future trades (edge-based or R-based modes).
- **Time-axis analysis** including hourly chart, day-of-week chart, session-by-session table, and 2D heatmap (day × hour).
- **Holding period chart** correlating performance with trade duration.
- **R-distribution histogram** showing the spread of R-multiples across all trades.
- **Filter panel** for multi-criteria filtering, with saveable **preset configurations**.
- **Insight cards** that pull out the most consequential finding from the current filter.

**Connects to** —

- **Journal** — filters are applied to the same trade pool.
- **Settings → Tags / Strategies / Assets** — these are the dimensions analytics slices on.
- **Reports** — heavier breakdowns are picked up in weekly/monthly cards.

---

### Account Comparison

**Purpose** — Compare performance across multiple trading accounts (e.g., prop firm A vs prop firm B vs personal account) on the same chart.

**Delivers** —

- A normalized side-by-side view of equity curves, KPIs, and configuration across selected accounts.
- A summary table for at-a-glance ranking.

**Connects to** —

- **Settings → Accounts** — pulls the account roster.
- **Journal** — each trade belongs to one account.

---

### Monthly Review

**Purpose** — Provide a focused read-only month view for the trader who wants the monthly story without the noise of daily charts.

**Delivers** —

- **Month navigator** for browsing historical months.
- **Month comparison** with side-by-side metrics.
- **Weekly breakdown** showing performance week-by-week within the month.
- **Monthly projection** extrapolating end-of-month outcome at the current pace.
- **Prop profit summary** for prop-firm-specific profit tracking.

**Connects to** —

- **Fractal Planning Suite** — month-level planning lives there; this page is the review counterpart.
- **Reports** — feeds the monthly PDF export.

---

### Performance Reports

**Purpose** — Hand the trader pre-built weekly and monthly review artifacts so they don't have to assemble their own narrative every time.

**Delivers** —

- **Weekly report card** — 7-day performance summary.
- **Monthly report card** — 30-day summary with trend deltas vs the prior month.
- **Mistake cost analysis** — dollar cost attributable to each mistake tag.
- **Commission and fee impact card** — how much brokerage costs ate from gross profit.
- **R-distribution tab** — R-multiple distribution histogram + bucket breakdown.
- **Annual rollup table** — 12-month patrimônio + capital tracking.
- **Capital event log** — deposit and withdrawal history per account.
- **Withdrawal calculator** — auto-withdrawal projection vs target.
- **Weekly meta chart** — weekly target versus actual result.
- **Monthly DARF card** — current-month DARF status, fees, and IRRF breakdown.
- **Carryover ledger** — running prejuízo fiscal (tax loss carryover) balance.
- **Annual tax summary** — year-to-date tax rollup card.
- **PDF export** — downloadable weekly and monthly reports.

**Connects to** —

- **Journal** — all trade data flows here.
- **Yearly Tax Reporting** — tax cards share the same DARF engine.
- **Fractal Planning Suite** — weekly meta comparison uses monthly plan targets.

---

## Simulate & Optimize

### Monte Carlo Simulation

**Purpose** — Stress-test the trader's expected outcome statistically before they put real money at risk, so they can size and plan around realistic drawdown scenarios rather than the best-case headline number.

**Delivers** —

- **V1 (Classic / Edge Expectancy)** — Standard Monte Carlo with manual stats or trade-imported inputs; equity curve, drawdown chart, distribution histogram, Kelly Criterion card, strategy analysis, trade sequence list.
- **V2 (Capital Expectancy / Risk-Profile-Aware)** — Enhanced simulation that respects a chosen risk profile and produces mode distribution, daily P&L view, and capital-trajectory results.

**Connects to** —

- **Equity Shield** — Monte Carlo results can auto-calibrate shield parameters.
- **Journal** — V1 can pull real trade stats as inputs.
- **Settings → Risk Profiles** — V2 reads risk-profile config.

---

### Equity Shield (Drawdown Protection)

**Purpose** — Protect the trader from themselves during drawdowns by enforcing automatic position-size reduction, then scale back up during recovery.

**Delivers** —

- **Equity shield chart** — the equity curve overlaid with shield zones (full / reduced / suspended).
- **Equity shield params** — configurable thresholds and scaling rules.
- **Equity shield stats** — current zone and the position size recommendation that flows from it.
- **Method 1: MDD Exercise** — shield zones derived from a maximum-drawdown exercise.
- **Method 2: SMA Crossover** — shield zones derived from a moving-average crossover signal.
- **MC calibration banner** — auto-fill shield params from a recent Monte Carlo run.

**Connects to** —

- **Monte Carlo** — primary calibration source.
- **Fractal Planning Suite** — capital ladder informs zone thresholds.
- **Risk Simulation** — shield rules can be enabled in simulation runs.

---

### Risk Simulation (What-If Analysis)

**Purpose** — Let the trader replay their historical trades with modified risk parameters to see how the alternate version of themselves would have done.

**Delivers** —

- **Risk params form** — adjust stop placement, target, and position sizing rules.
- **Simulation config panel** — choose date range and trade subset; prefill from manual, monthly plan, or risk profile.
- **Equity curve overlay** — original vs simulated curves on one chart.
- **Trade comparison table** — side-by-side original-vs-simulated results.
- **Summary cards** — key-metric deltas (P&L, drawdown, win rate change).
- **Decision trace modal** — step-by-step decision replay for any single trade.
- **Day trace card** — per-day breakdown.
- **Skipped trades warning** — flags trades that were excluded from the simulation and why.

**Connects to** —

- **Journal** — historical trades are the simulation input.
- **Settings → Risk Profiles** — prefill source.
- **Fractal Planning Suite** — monthly plan parameters can prefill the form.

---

### Backtest Engine

**Purpose** — Test strategies on historical candle data before committing real capital, with a modular architecture so the trader can mix entry, stop, target, and sizing components like LEGO blocks.

**Delivers** —

- **Main backtest** — configure params, run the engine, see the equity curve, summary cards, and full trade log.
- **Modular plugins** — pluggable modules for entry (ORB / Opening Range Breakout, DezK / MACD-WMA alignment), stop (initial, trailing), target (fixed levels, partial exits), and sizing (R-based, fixed-lot).
- **Plugin picker** — visual selector for combining modules.
- **Strategy presets** — pre-built configurations for common strategies.

**Connects to** —

- **Strategy Playbook** — presets correspond to documented playbook strategies.
- **Backtest Optimizer** — same engine, batched across parameter sweeps.

---

### Backtest Optimizer

**Purpose** — Run a parameter sweep across the same backtest config to find the best-performing combination, then visualize the result space.

**Delivers** —

- **3-step wizard** — setup → parameter ranges → results.
- **Heatmap** — 2D heatmap of parameter combinations colored by selected metric (profit factor, Sharpe, max drawdown, win rate, etc.).
- **Runs table** — sortable comparison of all sweep runs with one row per parameter combination.
- **Parameter detection** — automatically identifies which parameters vary across the run set.

**Connects to** —

- **Backtest** — shares the engine and module system.

---

## Tax & Compliance

### Yearly Tax Reporting (BR DARF Engine)

**Purpose** — Handle Brazilian day-trade tax reality for the trader: monthly DARF calculation, prejuízo fiscal carryover, fee allocation, and IRRF accounting — without the trader needing a separate spreadsheet.

**Delivers** —

- **DARF strip** — 12-chip monthly status row (pending / paid / exempt / overdue) across the year.
- **Monthly DARF card** — gross gain, fees, IRRF withholding, DARF due, and current status per month.
- **EOY projection banner** — end-of-year capital projection derived from year-to-date average R/day, the capital ladder, the IR rate, and the withdrawal target.
- **Carryover ledger** — running prejuízo fiscal (tax loss carryover) balance + history.
- **Annual tax summary** — year-to-date rollup card.
- **Fee rate form** — per-account and per-asset fee configuration (corretagem, emolumentos, ISS, registro).
- **Mark DARF paid** flow with paid amount tracking (only allowed on finalized months).
- **Recompute ledger** — force recompute the chained monthly ledger from a given month forward when historical data changes.

**Connects to** —

- **Journal** — closed trades drive monthly gains and fee allocations.
- **Fractal Planning Suite** — the Impostos tab lives inside the yearly plan cockpit; EOY projection consumes capital ladder.
- **Reports** — monthly DARF card and annual tax summary appear in `/reports` as well.
- **Settings → Accounts** — fee rates are configured per account.

---

## System, Account, and Personalization

### Authentication

**Purpose** — Get the trader securely in and out of the app, and let them switch between trading accounts (prop firm A, prop firm B, personal) without re-logging.

**Delivers** —

- **Email + password login**, **registration**, **email verification**, **password recovery**.
- **Account selector** for multi-trading-account users.
- **Session management** with secure cookie handling.

**Connects to** —

- Every authenticated route in the app.
- **Settings → Accounts** for managing the trading-account roster.

---

### Settings

**Purpose** — One place for the trader to define everything the rest of the app references: accounts, assets, tags, timeframes, strategies' building blocks, risk profiles, and personal preferences.

**Delivers** —

- **Account settings** — manage multiple trading accounts.
- **Asset management** — define tradeable assets (tickers, lot sizes).
- **Tag management** — setup tags and mistake tags used in journaling and analytics.
- **Timeframe management** — define chart timeframes used across the app.
- **Trading conditions** — reusable condition blocks for the playbook.
- **Indicator definitions** — custom indicator groups and definitions.
- **Risk profile management** — named risk profiles attached to plans and simulations.
- **Fee rate configuration** — per-account/per-asset fee tables for the tax engine.
- **Brand switcher** — visual brand/theme selection.
- **Language switcher** — English / Portuguese (Brazil).
- **User profile** — personal settings.
- **User list** — admin view of all users.
- **Bug reports list** — admin view of submitted bug reports.
- **Recalculate buttons** — force-recompute P&L and metrics when historical data shifts.

**Connects to** —

- Every other feature uses one or more settings as its configuration source (accounts → journal, tags → analytics, fee rates → tax engine, risk profiles → simulation/planning, etc.).

---

### Bug Report Capture

**Purpose** — Let the trader send a high-quality bug report from inside the app without leaving the screen they're on.

**Delivers** —

- Inline screenshot capture + bug description form.
- Admin-side bug report list under settings.

**Connects to** —

- **Settings → Bug Reports** for admin triage.

---

### Page Guide System

**Purpose** — Walk new users through complex screens without forcing them to read external documentation.

**Delivers** —

- Per-feature interactive overlays that highlight UI elements with explanations.
- Triggerable on-demand from each screen.

**Connects to** —

- Every primary feature page.

---

## Quick Reference — Feature × Mode Matrix

| Feature                       |           Plan & Prepare            | Live Session | Record & Reflect | Review & Improve |
| ----------------------------- | :---------------------------------: | :----------: | :--------------: | :--------------: |
| Fractal Planning Suite        |                  ✓                  |              |                  |        ✓         |
| Strategy Playbook             |                  ✓                  |      ✓       |                  |        ✓         |
| Position Calculator           |                  ✓                  |      ✓       |                  |                  |
| Command Center                |                  ✓                  |      ✓       |        ✓         |                  |
| Market Monitor                |                  ✓                  |      ✓       |                  |                  |
| Journal                       |                                     |              |        ✓         |        ✓         |
| Dashboard                     |                                     |              |                  |        ✓         |
| Analytics                     |                                     |              |                  |        ✓         |
| Account Comparison            |                                     |              |                  |        ✓         |
| Monthly Review                |                                     |              |                  |        ✓         |
| Performance Reports           |                                     |              |                  |        ✓         |
| Monte Carlo                   |                  ✓                  |              |                  |        ✓         |
| Equity Shield                 |                  ✓                  |      ✓       |                  |        ✓         |
| Risk Simulation               |                  ✓                  |              |                  |        ✓         |
| Backtest + Optimizer          |                  ✓                  |              |                  |                  |
| Yearly Tax Reporting          |                  ✓                  |              |                  |        ✓         |
| Settings / Auth / Bug / Guide | (foundation, cross-cuts every mode) |

---

## What Axion deliberately does NOT do

These exclusions are intentional and shape the product identity:

- **No live broker connections.** Trades are entered manually, by CSV/nota import, or via OCR — never by API hook to the broker. Trader-controlled data integrity over convenience.
- **No social/sharing features.** Axion is a solo discipline tool, not a community feed. No follow, no leaderboards, no copying.
- **No gamification.** No badges, confetti, or streak bonuses. Trading is serious work; the visual language reflects that.
- **No multi-user collaboration inside an account.** Multi-account refers to multiple _trading_ accounts owned by the same trader (prop firms + personal), not multi-tenant collaboration.
- **No embedded charting platform.** Axion does not replace TradingView or Profit. It journals and analyzes; chart workflows live in dedicated platforms.

---

## Cross-feature data lineage (at a glance)

```
Settings (accounts, assets, tags, risk profiles, fee rates)
   │
   ├─► Strategy Playbook ──► Backtest / Optimizer
   │            │
   │            └─► Journal (trade.strategyId)
   │
   ├─► Fractal Planning Suite ──► Command Center (daily limits, asset rules)
   │            │                       │
   │            │                       └─► Journal (trade entry)
   │            │
   │            └─► Yearly Tax Reporting (DARF strip, EOY projection)
   │
   └─► Journal ──► Dashboard / Analytics / Reports
                    │
                    ├─► Monte Carlo (V1 trade-import inputs)
                    │
                    ├─► Risk Simulation (historical replay)
                    │
                    └─► Yearly Tax Reporting (gain/loss per month)

Monte Carlo ──► Equity Shield (MC calibration)
```

The map above is the shortest path to understanding "if I change X, what's affected?" — useful for change-impact conversations across product, design, and engineering.
