# Axion — Product Features & Architecture

As the Product Manager for this project, my goal is to ensure this platform doesn't just record what happened, but tells you **why** it happened and **how** to improve. Since this is a personal, high-performance tool, we are stripping away the "noise" (multi-user features) and focusing on **Deep Insight and Behavioral Correction.**

---

## Features

### 1. Command Center (Daily Cockpit)

Pre-market preparation, live session control, and post-market reflection in one view.

- **Bias Selector** — Directional bias (bullish/bearish/neutral) before session starts
- **Mood Selector** — Emotional state tracking for behavioral correlation
- **Daily Checklist** — Customizable pre-market routine verification
- **Pre-Market / Post-Market Notes** — Rich text areas for preparation and reflection
- **Circuit Breaker Panel** — Auto-lock trading after hitting daily loss limits
- **Live Trading Status Panel** — Real-time session state (market open/closed, active trades)
- **Asset Rules Panel** — Per-asset rules and constraints for the day
- **Daily Summary Card** — End-of-day snapshot with key metrics

**Page:** `src/app/[locale]/(app)/command-center/page.tsx`
**Components:** `src/components/command-center/`
**Server Actions:** `src/app/actions/command-center.ts`, `src/app/actions/live-trading-status.ts`

---

### 2. Journal (Trade Logging & Autopsy)

Core trade recording system — manual entry, CSV import, brokerage nota import, and OCR extraction.

- **Trade Form** — Full trade entry with executions, tags, playbook link, screenshots
- **Execution List** — Multi-execution support per trade (scaling in/out)
- **CSV Import** — Parse trades from broker CSVs (Clear, XP, Genial parsers)
- **Nota Import** — Parse Brazilian brokerage notas (Sinacor format)
- **OCR Import** — Screenshot-to-trade extraction via Tesseract + OpenAI Vision
- **Trade Detail View** — Full autopsy: planned vs realized R, MFE/MAE, narrative log
- **Smart Search** — Fuzzy search across all trades
- **Period Filter** — Date range, quick filters (week/month/custom)
- **Trade Day Groups** — Trades organized by session date
- **Scaled Trade Form** — Specialized form for multi-execution entries
- **R-Multiple Bar** — Visual planned vs actual risk visualization
- **PnL Display** — Formatted profit/loss with color coding

**Pages:**
- `src/app/[locale]/(app)/journal/page.tsx` — Trade list
- `src/app/[locale]/(app)/journal/new/page.tsx` — New trade
- `src/app/[locale]/(app)/journal/[id]/page.tsx` — Trade detail
- `src/app/[locale]/(app)/journal/[id]/edit/page.tsx` — Edit trade

**Components:** `src/components/journal/`
**Server Actions:** `src/app/actions/trades.ts`, `src/app/actions/executions.ts`, `src/app/actions/csv-import.ts`, `src/app/actions/nota-import.ts`, `src/app/actions/ocr-import.ts`, `src/app/actions/candle-import.ts`

---

### 3. Dashboard (Performance Overview)

Main performance dashboard with KPIs, calendar, and equity curve.

- **KPI Cards** — Net P&L, Win Rate, Profit Factor, Avg R-Multiple, Discipline Score
- **Trading Calendar** — Monthly grid, color-coded days by performance
- **Equity Curve** — Account growth line chart with drawdown overlay
- **Cumulative PnL Chart** — Running total P&L over time
- **Daily PnL Bar Chart** — Day-by-day profit/loss bars
- **Performance Radar Chart** — Multi-axis spider chart of trading dimensions
- **Quick Stats** — At-a-glance session stats
- **Day Detail Modal** — Click calendar day → full session breakdown
- **Coaching Insights Card** — AI-powered pattern detection and suggestions

**Page:** `src/app/[locale]/(app)/page.tsx` (root app page)
**Components:** `src/components/dashboard/`
**Server Actions:** `src/app/actions/analytics.ts`, `src/app/actions/coaching.ts`

---

### 4. Analytics Engine (Filter & Slice)

Deep performance analysis with variable comparison and statistical breakdowns.

- **Variable Comparison** — Compare by timeframe, asset, time of day, direction
- **Tag Cloud Analysis** — Setup tags vs mistake tags performance breakdown
- **Expected Value Calculator** — Projected outcome over N trades
- **Session/Asset Table** — Tabular performance by session or asset
- **Day of Week Chart** — Performance distribution by weekday
- **Hourly Performance Chart** — Performance by hour of day
- **Time Heatmap** — 2D heatmap (day × hour) of performance
- **Holding Period Chart** — Performance vs trade duration
- **R-Distribution Histogram** — R-multiple distribution visualization
- **Cumulative PnL Chart** — Filtered equity curve
- **Session Performance Chart** — Per-session metrics
- **Filter Panel** — Multi-criteria filtering (date, asset, tag, direction, etc.)
- **Preset Selector** — Save/load filter configurations
- **Insight Cards** — Contextual metric summaries

**Pages:**
- `src/app/[locale]/(app)/analytics/page.tsx` — Main analytics
- `src/app/[locale]/(app)/analytics/account-comparison/page.tsx` — Cross-account comparison

**Components:** `src/components/analytics/`, `src/components/account-comparison/`
**Server Actions:** `src/app/actions/analytics.ts`, `src/app/actions/account-comparison.ts`, `src/app/actions/filter-presets.ts`

---

### 5. Strategy Playbook (Compliance)

Strategy library with rules, conditions, and compliance tracking.

- **Strategy Cards** — Visual strategy overview with key stats
- **Setup Definitions** — Entry/exit criteria, conditions, screenshots
- **Condition Picker** — Reusable condition blocks (technical indicators, price action)
- **Condition Tiers** — Mandatory vs optional conditions with weight
- **Scenario Section** — Strategy variations (different market conditions)
- **Compliance Dashboard** — How often you follow your own rules
- **Strategy Detail Guide** — Interactive walkthrough of strategy components

**Pages:**
- `src/app/[locale]/(app)/playbook/page.tsx` — Strategy list
- `src/app/[locale]/(app)/playbook/new/page.tsx` — New strategy
- `src/app/[locale]/(app)/playbook/[id]/page.tsx` — Strategy detail
- `src/app/[locale]/(app)/playbook/[id]/edit/page.tsx` — Edit strategy

**Components:** `src/components/playbook/`
**Server Actions:** `src/app/actions/strategies.ts`, `src/app/actions/strategy-conditions.ts`, `src/app/actions/scenarios.ts`

---

### 6. Performance Reports

Automated weekly/monthly summaries with mistake cost analysis.

- **Weekly Report Card** — 7-day performance summary
- **Monthly Report Card** — 30-day performance summary with trends
- **Mistake Cost Analysis** — Dollar cost of each mistake tag
- **Commission/Fee Impact Card** — Brokerage cost breakdown
- **PDF Export** — Downloadable report generation

**Page:** `src/app/[locale]/(app)/reports/page.tsx`
**Components:** `src/components/reports/`
**Server Actions:** `src/app/actions/reports.ts`
**Lib:** `src/lib/pdf/` (PDF generation)

---

### 7. Monthly Review

Month-over-month performance tracking and projections.

- **Month Navigator** — Browse historical months
- **Month Comparison** — Side-by-side month metrics
- **Weekly Breakdown** — Performance by week within month
- **Monthly Projection** — Extrapolated performance at current pace
- **Prop Profit Summary** — Prop firm profit tracking

**Page:** `src/app/[locale]/(app)/monthly/page.tsx`
**Components:** `src/components/monthly/`, `src/components/monthly-plan/`
**Server Actions:** `src/app/actions/monthly-plans.ts`

---

### 8. Monte Carlo Simulation

Statistical simulation of trade outcomes for risk analysis.

- **V1 (Classic)** — Standard Monte Carlo with manual or trade-based inputs
  - Simulation Params Form, Equity Curve Chart, Drawdown Chart, Distribution Histogram
  - Kelly Criterion Card, Strategy Analysis, Trade Sequence List
  - Data Source Selector (manual stats or import from real trades)

- **V2 (Risk Profile-Aware)** — Enhanced simulation using risk profiles
  - Risk Profile Selector, Mode Distribution Chart, Daily PnL Chart
  - V2 Metrics Cards, V2 Results Summary, V2 Distribution Histogram

**Page:** `src/app/[locale]/(app)/monte-carlo/page.tsx`
**Components:** `src/components/monte-carlo/`, `src/components/monte-carlo/v2/`
**Server Actions:** `src/app/actions/monte-carlo.ts`
**Lib:** `src/lib/monte-carlo.ts`, `src/lib/monte-carlo-v2.ts`

---

### 9. Equity Shield (Drawdown Protection)

Dynamic position sizing based on equity curve health — scale down during drawdowns, scale up during winning streaks.

- **Equity Shield Chart** — Equity curve with shield zones overlay
- **Equity Shield Params** — Configurable thresholds and scaling rules
- **Equity Shield Stats** — Current shield state, position size recommendation
- **MC Calibration Banner** — Auto-calibrate shield params from Monte Carlo results

**Page:** `src/app/[locale]/(app)/equity-shield/page.tsx`
**Components:** `src/components/equity-shield/`
**Server Actions:** `src/app/actions/equity-shield.ts`
**Lib:** `src/lib/equity-shield.ts`, `src/lib/mc-calibration.ts`

---

### 10. Risk Simulation (What-If Analysis)

Replay historical trades with modified risk parameters to see alternate outcomes.

- **Risk Params Form** — Adjust stop, target, position size rules
- **Simulation Config Panel** — Choose date range and trade subset
- **Prefill Selector** — Load params from existing risk profiles
- **Equity Curve Overlay** — Original vs simulated equity curves
- **Trade Comparison Table** — Side-by-side original vs simulated results
- **Summary Cards** — Key metrics delta
- **Decision Trace Modal** — Step-by-step decision replay per trade
- **Day Trace Card** — Per-day simulation breakdown
- **Skipped Trades Warning** — Flagged trades excluded from simulation

**Page:** `src/app/[locale]/(app)/risk-simulation/page.tsx`
**Components:** `src/components/risk-simulation/`
**Server Actions:** `src/app/actions/risk-simulation.ts`
**Lib:** `src/lib/risk-simulation.ts`, `src/lib/risk-simulation-advanced.ts`

---

### 11. Backtest Engine

Strategy backtesting on historical candle data with modular entry/exit logic.

- **Backtest Content** — Main orchestrator (params → engine → results)
- **Backtest Equity Chart** — Simulated equity curve from backtest
- **Backtest Summary Cards** — Key backtest metrics
- **Backtest Trades Table** — Full trade log with entries/exits
- **Plugin Picker** — Select entry/stop/target modules
- **Entry Sections** — ORB (Opening Range Breakout), DezK entry modules
- **Stop Protection Section** — Initial stop, trailing stop config
- **Targets/Exit Section** — Fixed levels, partial exits
- **Sizing/Execution Section** — Position sizing rules

**Pages:**
- `src/app/[locale]/(app)/backtest/page.tsx` — Main backtest
- `src/app/[locale]/(app)/backtest/optimize/page.tsx` — Parameter optimization

**Components:** `src/components/backtest/`, `src/components/backtest/sections/`, `src/components/optimize/`
**Server Actions:** `src/app/actions/backtest.ts`
**Lib:** `src/lib/backtest/` (engine, modules, presets), `src/lib/optimize/` (sweep runner, heatmap)

---

### 12. MACD Test (Experimental)

Experimental MACD indicator visualization and testing.

- **MACD Chart View** — Interactive MACD indicator chart

**Page:** `src/app/[locale]/(app)/macd-test/page.tsx`
**Components:** `src/components/macd-test/`

---

### 13. Settings

User configuration, account management, and data definitions.

- **Account Settings** — Trading accounts (multi-account support)
- **Asset Management** — Define tradeable assets (tickers, lot sizes)
- **Tag Management** — Setup tags and mistake tags
- **Timeframe Management** — Define chart timeframes
- **Condition Management** — Reusable trading conditions
- **Indicator Definitions** — Custom indicator groups and definitions
- **Brand Switcher** — Theme/brand selection
- **Language Switcher** — i18n (EN, PT-BR)
- **User Profile** — Profile settings
- **User Management** — User list (admin)
- **Bug Reports List** — Submitted bug reports
- **Recalculate Buttons** — Force PnL/metrics recalculation

**Page:** `src/app/[locale]/(app)/settings/page.tsx`
**Components:** `src/components/settings/`
**Server Actions:** `src/app/actions/settings.ts`, `src/app/actions/accounts.ts`, `src/app/actions/assets.ts`, `src/app/actions/tags.ts`, `src/app/actions/timeframes.ts`, `src/app/actions/trading-conditions.ts`, `src/app/actions/indicators.ts`, `src/app/actions/user-management.ts`, `src/app/actions/bug-reports.ts`

---

## Cross-Cutting Features

### Authentication
- Email/password + email verification + password recovery
- Multi-account switching (trading accounts, not user accounts)
- **Components:** `src/components/auth/`
- **Server Actions:** `src/app/actions/auth.ts`, `src/app/actions/email-verification.ts`, `src/app/actions/password-recovery.ts`
- **API Routes:** `src/app/api/auth/[...nextauth]/`

### Market Monitor
- Real-time quotes (Yahoo Finance, BRAPI, CoinGecko, BCB providers)
- B3 trading calendar with holidays
- Economic calendar
- **Components:** `src/components/market/`
- **API Routes:** `src/app/api/market/quotes/`, `src/app/api/market/calendar/`
- **Lib:** `src/lib/market/` (orchestrator, registry, providers, cache)

### Bug Report Capture
- In-app screenshot capture + bug reporting
- **Components:** `src/components/bug-report/`
- **Server Actions:** `src/app/actions/bug-reports.ts`

### Page Guide System
- Interactive onboarding overlays per feature
- **Components:** `src/components/ui/page-guide/`

### Position Calculator
- Standalone position size calculator (not a page, accessed via layout/dialog)
- **Components:** `src/components/calculator/`

---

## Architecture Overview

### Source Structure

```
src/
├── app/
│   ├── [locale]/(app)/          # All authenticated pages (i18n-wrapped)
│   │   ├── page.tsx             # Dashboard (root)
│   │   ├── analytics/           # Analytics + account comparison
│   │   ├── backtest/            # Backtest + optimize
│   │   ├── command-center/
│   │   ├── equity-shield/
│   │   ├── journal/             # CRUD: list, new, [id], [id]/edit
│   │   ├── macd-test/
│   │   ├── monte-carlo/
│   │   ├── monthly/
│   │   ├── playbook/            # CRUD: list, new, [id], [id]/edit
│   │   ├── reports/
│   │   ├── risk-simulation/
│   │   └── settings/
│   ├── actions/                 # Server Actions (40+ files)
│   └── api/                     # API Routes
│       ├── arch/                # Internal API (analytics, bugs, etc.)
│       ├── auth/                # NextAuth
│       ├── imports/             # CSV detailed imports
│       ├── market/              # Quotes & calendar
│       └── uploads/             # File uploads
│
├── components/
│   ├── analytics/               # Analytics charts & filters
│   ├── account-comparison/      # Cross-account comparison
│   ├── auth/                    # Auth forms & providers
│   ├── backtest/                # Backtest UI + sections/
│   ├── bug-report/              # Bug capture system
│   ├── calculator/              # Position calculator
│   ├── command-center/          # Daily cockpit panels
│   ├── dashboard/               # Dashboard + kpi/
│   ├── equity-shield/           # Shield charts & params
│   ├── imports/                 # Detailed trade importer
│   ├── journal/                 # Trade forms, cards, views
│   ├── layout/                  # App shell, sidebar, command menu
│   ├── macd-test/               # MACD chart view
│   ├── market/                  # Market monitor components
│   ├── monte-carlo/             # MC v1 + v2/
│   ├── monthly/                 # Monthly review
│   ├── monthly-plan/            # Monthly planning
│   ├── optimize/                # Backtest optimization UI
│   ├── playbook/                # Strategy management
│   ├── providers/               # App-wide providers
│   ├── reports/                 # Report cards
│   ├── risk-simulation/         # What-if simulation UI
│   ├── settings/                # All settings panels
│   ├── shared/                  # Reusable primitives
│   └── ui/                      # Design system (Shadcn-based)
│
├── db/
│   ├── schema.ts                # Drizzle schema
│   ├── drizzle.ts               # DB connection
│   ├── migrations/              # SQL migrations
│   └── seed-*.ts                # Seed scripts
│
├── hooks/                       # Custom React hooks
│   ├── use-chart-config.ts
│   ├── use-debounced-search.ts
│   ├── use-feature-access.ts
│   ├── use-formatting.ts
│   ├── use-is-mobile.ts
│   └── use-url-params.ts
│
├── i18n/                        # Internationalization config
│   ├── config.ts
│   ├── index.ts
│   ├── request.ts
│   └── routing.ts
│
├── lib/
│   ├── backtest/                # Backtest engine
│   │   ├── engine.ts            # Core backtest loop
│   │   ├── metrics.ts           # Performance metrics
│   │   ├── modules/             # Pluggable modules
│   │   │   ├── entry/           # Entry strategies (ORB, DezK, MACD)
│   │   │   ├── stop/            # Stop management (initial, trailing)
│   │   │   ├── target/          # Target levels (fixed)
│   │   │   ├── sizing/          # Position sizing
│   │   │   └── reversal/        # Reversal logic
│   │   └── presets/             # Strategy presets (ORB, DezK)
│   ├── cache/                   # Query caching & invalidation
│   ├── chart/                   # Chart utilities & theme
│   ├── coaching/                # AI coaching (pattern detection)
│   ├── constants/               # App constants
│   ├── csv-parsers/             # Broker CSV parsers (Clear, XP, Genial)
│   ├── market/                  # Market data system
│   │   ├── orchestrator.ts      # Multi-provider coordination
│   │   ├── registry.ts          # Provider registry
│   │   ├── providers/           # Yahoo, BRAPI, CoinGecko, BCB
│   │   └── cache.ts
│   ├── nota-parser/             # Brokerage nota parsing (Sinacor)
│   ├── ocr/                     # OCR pipeline (Tesseract + OpenAI Vision)
│   ├── optimize/                # Backtest optimization
│   │   ├── sweep-runner.ts      # Parameter sweep
│   │   ├── parameter-grid.ts    # Grid generation
│   │   └── heatmap-utils.ts     # Heatmap visualization
│   ├── pdf/                     # PDF report generation
│   ├── validations/             # Zod schemas (20+ files)
│   ├── vision/                  # Vision API integration
│   ├── equity-shield.ts         # Equity shield engine
│   ├── mc-calibration.ts        # MC → Shield calibration
│   ├── monte-carlo.ts           # MC simulation v1
│   ├── monte-carlo-v2.ts        # MC simulation v2
│   ├── risk-simulation.ts       # Risk simulation engine
│   ├── risk-simulation-advanced.ts
│   ├── risk-profile.ts          # Risk profile logic
│   ├── calculations.ts          # Shared math
│   ├── formatting.ts            # Number/date formatting
│   ├── navigation.ts            # Route definitions
│   └── ...                      # Various utility modules
│
├── types/                       # TypeScript type definitions
│   ├── backtest.ts
│   ├── candle.ts
│   ├── equity-shield.ts
│   ├── indicator.ts
│   ├── live-trading-status.ts
│   ├── market.ts
│   ├── mc-calibration.ts
│   ├── monte-carlo.ts
│   ├── page-guide.ts
│   ├── risk-profile.ts
│   ├── risk-simulation.ts
│   └── trading-condition.ts
│
└── messages/                    # i18n translations
    ├── en.json
    └── pt-BR.json
```

### Key Packages

| Package | Purpose |
|---------|---------|
| Next.js | App router, server components, server actions |
| Drizzle ORM | Type-safe PostgreSQL queries |
| NextAuth | Authentication |
| next-intl | Internationalization (EN, PT-BR) |
| Recharts | Chart visualizations |
| Shadcn/ui + Radix | Component library |
| TailwindCSS | Styling |
| Zod | Schema validation |
| Tesseract.js | Client-side OCR |
| OpenAI | Vision API for trade screenshot parsing |
| React PDF | PDF report generation |
| cmdk | Command palette (⌘K) |
| PostHog | Product analytics |

---

### Observations

- All trade inputs are manual or CSV/nota/OCR import — no live broker connections (future feature)
- Real chart integrations (TradingView embed, etc.) not yet implemented (future feature)
- Multi-account support exists for switching between trading accounts (prop firms, personal)
- Backtest engine is modular with pluggable entry/stop/target strategies
- Monte Carlo has two versions: v1 (classic) and v2 (risk-profile-aware)

---

## Quick Reference

| Feature | Description |
|---------|-------------|
| **Command Center** | Pre-market prep, live session control, and post-market reflection cockpit |
| ↳ Plan | Monthly trading plan creation with goals, risk limits, and recovery paths |
| ↳ Centro de Comando | Circuit breaker, live status, checklist, pre/post notes, asset rules, daily summary |
| ↳ Monitor | Real-time quotes, B3 calendar, economic calendar, market status |
| ↳ Calculadora | Position size calculator with risk-based lot sizing |
| **Journal** | Trade logging via manual entry, CSV import, brokerage nota, or OCR screenshots |
| ↳ Trade List | Filterable trade list grouped by day with smart search and period filters |
| ↳ New Trade | Manual trade form with executions, tags, playbook link, and screenshots |
| ↳ Trade Detail | Full trade autopsy: planned vs realized R, MFE/MAE, narrative log, chart view |
| ↳ CSV Import | Parse trades from broker CSVs (Clear, XP, Genial) |
| ↳ Nota Import | Parse Brazilian brokerage notas (Sinacor format) |
| ↳ OCR Import | Screenshot-to-trade extraction via Tesseract + OpenAI Vision |
| **Dashboard** | Performance overview with KPIs, trading calendar, equity curve, and coaching insights |
| ↳ KPI Cards | Net P&L, Win Rate, Profit Factor, Avg R-Multiple, Discipline Score |
| ↳ Trading Calendar | Monthly grid color-coded by day performance with detail modal |
| ↳ Equity Curve | Account growth line chart with drawdown overlay |
| ↳ Coaching Insights | AI-powered pattern detection and behavioral suggestions |
| **Analytics** | Deep performance slicing by variable, tag, time, and asset with statistical charts |
| ↳ Variable Comparison | Group by asset, timeframe, hour, day of week, or strategy |
| ↳ Tag Cloud | Setup tags vs mistake tags performance breakdown |
| ↳ Expected Value | Projected outcome over N trades (edge vs R-based modes) |
| ↳ Time Analysis | Heatmap, hourly chart, session chart, day-of-week, holding period |
| **Account Comparison** | Side-by-side performance comparison across trading accounts |
| **Playbook** | Strategy library with entry/exit rules, conditions, and compliance tracking |
| ↳ Compliance Dashboard | Percentage-based tracking of rule adherence per strategy |
| ↳ Strategy Cards | Visual strategy overview with conditions, scenarios, and screenshots |
| **Reports** | Automated weekly/monthly summaries with mistake cost analysis and PDF export |
| ↳ Weekly Report | 7-day performance summary card |
| ↳ Monthly Report | 30-day performance summary with trends |
| ↳ Mistake Cost | Dollar cost breakdown by mistake tag |
| ↳ Commission Impact | Brokerage fee analysis |
| **Monthly Review** | Month-over-month tracking, weekly breakdowns, and performance projections |
| ↳ Month Comparison | Side-by-side metrics across months |
| ↳ Weekly Breakdown | Performance segmented by week within month |
| ↳ Projection | Extrapolated performance at current pace (current month only) |
| **Monte Carlo** | Statistical simulation of trade outcomes for drawdown and risk analysis |
| ↳ Edge Expectancy | Classic MC simulation with manual or trade-based inputs, Kelly criterion |
| ↳ Capital Expectancy | Risk-profile-aware simulation with mode distribution and daily PnL |
| **Equity Shield** | Dynamic position sizing that scales down in drawdowns and up in winning streaks |
| ↳ MDD Exercise | Method 1 — max drawdown exercise-based shield zones |
| ↳ SMA Crossover | Method 2 — SMA crossover-based shield zones |
| ↳ MC Calibration | Auto-calibrate shield params from Monte Carlo results |
| **Risk Simulation** | What-if replay of historical trades with modified risk parameters |
| ↳ Config Panel | Prefill from manual, monthly plan, or risk profile |
| ↳ Decision Trace | Step-by-step decision replay per trade |
| ↳ Equity Overlay | Original vs simulated equity curves side-by-side |
| **Backtest** | Strategy backtesting on candle data with modular entry/stop/target plugins |
| ↳ ORB Breakout | Opening Range Breakout entry strategy module |
| ↳ MACD/WMA Alignment | DezK entry strategy module |
| ↳ Stop & Trailing | Initial stop and trailing stop configuration |
| ↳ Targets & Sizing | Fixed target levels, partial exits, position sizing rules |
| **Backtest Optimizer** | Parameter sweep across backtest configs with heatmap visualization |
| ↳ Wizard | 3-step flow: setup → parameters → results |
| ↳ Heatmap | Parameter combination performance heatmap |
| ↳ Runs Table | Sortable comparison table of all sweep runs |
| **MACD Test** | Experimental MACD indicator visualization and signal testing |
| **Settings** | Account, asset, tag, timeframe, condition, and indicator management |
| ↳ Profile | User profile settings |
| ↳ Accounts | Trading account management (prop firms, personal) |
| ↳ Tags | Setup and mistake tag definitions |
| ↳ Conditions | Reusable trading condition blocks |
| ↳ Indicators | Custom indicator group and definition management |
| ↳ Assets | Tradeable asset definitions (tickers, lot sizes) |
| ↳ Timeframes | Chart timeframe definitions |
| ↳ Users | User list (admin) |
| ↳ Bugs | Submitted bug reports (admin) |
| **Market Monitor** | Real-time quotes, B3 calendar, and economic calendar (cross-cutting) |
| **Position Calculator** | Quick position size calculation from any page via dialog |
| **Bug Report Capture** | In-app screenshot capture and bug submission |
| **Page Guide** | Interactive onboarding overlays per feature |
