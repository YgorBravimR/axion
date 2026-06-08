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
**Server Actions:** `src/app/actions/trades.ts`, `src/app/actions/executions.ts`, `src/app/actions/csv-import.ts`, `src/app/actions/nota-import.ts`, `src/app/actions/ocr-import.ts`

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

Automated weekly/monthly summaries, capital tracking, R-distribution, and BR tax outputs.

- **Weekly Report Card** — 7-day performance summary
- **Monthly Report Card** — 30-day performance summary with trends
- **Mistake Cost Analysis** — Dollar cost of each mistake tag
- **Commission/Fee Impact Card** — Brokerage cost breakdown
- **R-Distribution Tab** — R-multiple distribution histogram + buckets
- **Annual Rollup Table** — 12-month patrimônio + capital tracking
- **Capital Event Log** — Deposit / withdrawal history per account
- **Withdrawal Calculator** — Auto-withdrawal projection vs target
- **Weekly Meta Chart** — Weekly meta vs. real result comparison
- **Monthly DARF Card** — Current-month DARF status, fees, and IRRF breakdown
- **Carryover Ledger** — IR carryover (prejuízo fiscal) running balance
- **Annual Tax Summary** — Year-to-date tax rollup card
- **PDF Export** — Downloadable weekly/monthly report generation

**Page:** `src/app/[locale]/(app)/reports/page.tsx`
**Components:** `src/components/reports/`, `src/components/tax/`
**Server Actions:** `src/app/actions/reports.ts`, `src/app/actions/annual-reports.ts`, `src/app/actions/tax-engine.ts`
**Lib:** `src/lib/pdf/` (PDF generation), `src/lib/reports/` (annual types), `src/lib/tax/` (BR tax engine)

---

### 7. Monthly Review

Month-over-month performance tracking and projections. Planning has been moved to the Fractal Planning Suite (see §14) — this page is now read-only analysis.

- **Month Navigator** — Browse historical months
- **Month Comparison** — Side-by-side month metrics
- **Weekly Breakdown** — Performance by week within month
- **Monthly Projection** — Extrapolated performance at current pace
- **Prop Profit Summary** — Prop firm profit tracking

**Page:** `src/app/[locale]/(app)/monthly/page.tsx`
**Components:** `src/components/monthly/`
**Server Actions:** `src/app/actions/reports.ts` (`getMonthlyResultsWithProp`, `getMonthlyProjection`, `getMonthComparison`)

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

### 12. Settings

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
**Server Actions:** `src/app/actions/settings.ts`, `src/app/actions/accounts.ts`, `src/app/actions/assets.ts`, `src/app/actions/tags.ts`, `src/app/actions/timeframes.ts`, `src/app/actions/trading-conditions.ts`, `src/app/actions/indicators.ts`, `src/app/actions/user-management.ts`, `src/app/actions/bug-reports.ts`, `src/app/actions/risk-profiles.ts`, `src/app/actions/tax-engine.ts` (fee-rate config)

---

### 13. Fractal Planning Suite

Three-level hierarchical planning (Year → Quarter → Month → Week → Day) with cascading defaults, capital ladder, and R-based targets. Replaces the old monthly-plan layer.

- **Yearly Plan Editor** — Initial capital, capital-ladder tiers, trading days/week, default daily/weekly/monthly R limits
- **Quarterly Plan Editor** — Quarter-level R targets, override risk profile; inherits from yearly defaults
- **Monthly Plan Editor / Slideover** — Month-level R targets, snapshot capital/1R, weekly breakdown strips
- **Annual Cockpit Grid** — Full-year monthly grid with plan vs. reality
- **Week Strip / Week Row** — Week-level breakdown inside the month cockpit
- **Quarter Plan vs Reality** — Quarter-level comparison
- **Plan vs Reality** — Month-level comparison
- **Setup Summary Card** — Resolved active setup summary
- **Provenance Badge** — Marks each value's origin (year / quarter / month / account default)
- **Risk Profile Picker** — Attach a named risk profile to any plan level
- **Snapshot Hero** — Active snapshot of capital + 1R for the month
- **R-Cap Override Popover** — Inline R-cap overrides with snapshot capture
- **What-If Calculator** — Quick projection sandbox

**Pages:**

- `src/app/[locale]/(app)/plan/[year]/page.tsx` — Yearly cockpit
- `src/app/[locale]/(app)/plan/[year]/[quarter]/page.tsx` — Quarter view
- `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/page.tsx` — Month cockpit

**Components:** `src/components/fractal-plan/`, `src/components/fractal-plan/cockpit/`
**Server Actions:** `src/app/actions/fractal-plan/` (yearly, quarterly, monthly, weekly, daily, tier, reports)
**Lib:** `src/lib/fractal-plan/` (capital-ladder, projection, resolver, cascade-merge, auto-seed, tier-eval, drawdown-trigger)

---

### 14. Yearly Tax Reporting (BR DARF Engine)

Brazilian day-trade IR compliance engine, embedded in the `/plan/[year]` cockpit under an **Impostos** tab and surfaced again in `/reports`.

- **DARF Strip** — 12 chips with DARF status (pending / paid / exempt / overdue) per month
- **Monthly DARF Card** — Per-month breakdown: gross gain, fees, IRRF, DARF due, status
- **EOY Projection Banner** — End-of-year capital projection from YTD avg R/day, capital ladder, IR rate, and withdrawal target
- **Carryover Ledger** — Running prejuízo fiscal balance + history
- **Annual Tax Summary** — Year-to-date rollup card (in `/reports`)
- **Fee Rate Form / Table** — Per-account and per-asset fee config (corretagem, emolumentos, ISS, registro)
- **Mark DARF Paid** — User flow with paid amount; only valid for finalized months
- **Recompute Ledger** — Force recompute the chained `monthlyTaxLedger` from a given month forward

Storage: `monthlyTaxLedger` table — one row per account per month, lazily recomputed on read, chain-linked via carryover. Legal IR rates sourced from `src/lib/tax/legal-rates.ts` (Lei 11.033/2004).

**Components:** `src/components/fractal-plan/cockpit/tax-tab.tsx`, `darf-strip.tsx`, `eoy-projection-banner.tsx`; `src/components/tax/monthly-darf-card.tsx`, `carryover-ledger.tsx`, `annual-tax-summary.tsx`, `fee-rate-form.tsx`, `fee-breakdown-table.tsx`
**Server Actions:** `src/app/actions/tax-engine.ts` (`getMonthlyDarf`, `markDarfPaid`, `recomputeLedger`, `getYearTaxSummary`, `getEffectiveTaxRate`, `getFeeRates`, `upsertFeeRates`, `deleteFeeRates`, `listFeeRates`), `src/app/actions/annual-reports.ts` (`recordCapitalEvent`, `deleteCapitalEvent`, `getCapitalSnapshot`, `getWeeklyMetaVsReal`, `getAnnualRollup`)
**Lib:** `src/lib/tax/` (recompute-month, darf-calculator, fee-allocator, fee-resolver, irrf-accumulator, carryover-ledger, legal-rates, asset-defaults, mark-dirty, month-status, types)

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
│   │   ├── monte-carlo/
│   │   ├── monthly/
│   │   ├── plan/                # Fractal plan: [year], [year]/[quarter], [year]/[quarter]/[month]
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
│   ├── fractal-plan/            # Year/quarter/month plan editors + cockpit/
│   ├── imports/                 # Detailed trade importer
│   ├── journal/                 # Trade forms, cards, views
│   ├── layout/                  # App shell, sidebar, command menu
│   ├── market/                  # Market monitor components
│   ├── monte-carlo/             # MC v1 + v2/
│   ├── monthly/                 # Monthly review
│   ├── optimize/                # Backtest optimization UI
│   ├── playbook/                # Strategy management
│   ├── providers/               # App-wide providers
│   ├── reports/                 # Report cards (weekly, monthly, annual rollup, R-dist, capital events)
│   ├── risk-simulation/         # What-if simulation UI
│   ├── settings/                # All settings panels
│   ├── shared/                  # Reusable primitives
│   ├── tax/                     # BR tax cards, fee config, carryover ledger
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
│   ├── fractal-plan/            # Plan resolver, capital-ladder, projection, cascade-merge, tier-eval
│   ├── nota-parser/             # Brokerage nota parsing (Sinacor)
│   ├── ocr/                     # OCR pipeline (Tesseract + OpenAI Vision)
│   ├── optimize/                # Backtest optimization
│   │   ├── sweep-runner.ts      # Parameter sweep
│   │   ├── parameter-grid.ts    # Grid generation
│   │   └── heatmap-utils.ts     # Heatmap visualization
│   ├── pdf/                     # PDF report generation
│   ├── reports/                 # Annual report types
│   ├── tax/                     # BR tax engine: recompute, DARF, fees, IRRF, carryover, legal-rates
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

| Package           | Purpose                                       |
| ----------------- | --------------------------------------------- |
| Next.js           | App router, server components, server actions |
| Drizzle ORM       | Type-safe PostgreSQL queries                  |
| NextAuth          | Authentication                                |
| next-intl         | Internationalization (EN, PT-BR)              |
| Recharts          | Chart visualizations                          |
| Shadcn/ui + Radix | Component library                             |
| TailwindCSS       | Styling                                       |
| Zod               | Schema validation                             |
| Tesseract.js      | Client-side OCR                               |
| OpenAI            | Vision API for trade screenshot parsing       |
| React PDF         | PDF report generation                         |
| cmdk              | Command palette (⌘K)                          |
| PostHog           | Product analytics                             |

---

### Observations

- All trade inputs are manual or CSV/nota/OCR import — no live broker connections (future feature)
- Real chart integrations (TradingView embed, etc.) not yet implemented (future feature)
- Multi-account support exists for switching between trading accounts (prop firms, personal)
- Backtest engine is modular with pluggable entry/stop/target strategies
- Monte Carlo has two versions: v1 (classic) and v2 (risk-profile-aware)

---

## Quick Reference

| Feature                    | Description                                                                           | Access |
| -------------------------- | ------------------------------------------------------------------------------------- | ------ |
| **Command Center**         | Pre-market prep, live session control, and post-market reflection cockpit             | All    |
| ↳ Centro de Comando        | Circuit breaker, live status, checklist, pre/post notes, asset rules, daily summary   | Trader |
| ↳ Monitor                  | Real-time quotes, B3 calendar, economic calendar, market status                       | Admin  |
| ↳ Calculadora              | Position size calculator with risk-based lot sizing                                   | All    |
| **Journal**                | Trade logging via manual entry, CSV import, brokerage nota, or OCR screenshots        | All    |
| ↳ Trade List               | Filterable trade list grouped by day with smart search and period filters             | All    |
| ↳ New Trade                | Manual trade form with executions, tags, playbook link, and screenshots               | Trader |
| ↳ Trade Detail             | Full trade autopsy: planned vs realized R, MFE/MAE, narrative log, chart view         | All    |
| ↳ CSV Import               | Parse trades from broker CSVs (Clear, XP, Genial)                                     | Trader |
| ↳ Nota Import              | Parse Brazilian brokerage notas (Sinacor format)                                      | Admin  |
| ↳ OCR Import               | Screenshot-to-trade extraction via Tesseract + OpenAI Vision                          | Admin  |
| **Dashboard**              | Performance overview with KPIs, trading calendar, equity curve, and coaching insights | All    |
| ↳ KPI Cards                | Net P&L, Win Rate, Profit Factor, Avg R-Multiple, Discipline Score                    | All    |
| ↳ Trading Calendar         | Monthly grid color-coded by day performance with detail modal                         | All    |
| ↳ Equity Curve             | Account growth line chart with drawdown overlay                                       | All    |
| ↳ Coaching Insights        | AI-powered pattern detection and behavioral suggestions                               | Trader |
| **Analytics**              | Deep performance slicing by variable, tag, time, and asset with statistical charts    | All    |
| ↳ Variable Comparison      | Group by asset, timeframe, hour, day of week, or strategy                             | All    |
| ↳ Tag Cloud                | Setup tags vs mistake tags performance breakdown                                      | All    |
| ↳ Expected Value           | Projected outcome over N trades (edge vs R-based modes)                               | All    |
| ↳ Time Analysis            | Heatmap, hourly chart, session chart, day-of-week, holding period                     | All    |
| **Account Comparison**     | Side-by-side performance comparison across trading accounts                           | All    |
| **Playbook**               | Strategy library with entry/exit rules, conditions, and compliance tracking           | All    |
| ↳ Compliance Dashboard     | Percentage-based tracking of rule adherence per strategy                              | All    |
| ↳ Strategy Cards           | Visual strategy overview with conditions, scenarios, and screenshots                  | All    |
| **Reports**                | Automated weekly/monthly summaries with mistake cost analysis and PDF export          | All    |
| ↳ Weekly Report            | 7-day performance summary card                                                        | All    |
| ↳ Monthly Report           | 30-day performance summary with trends                                                | All    |
| ↳ Mistake Cost             | Dollar cost breakdown by mistake tag                                                  | All    |
| ↳ Commission Impact        | Brokerage fee analysis                                                                | All    |
| **Monthly Review**         | Month-over-month tracking, weekly breakdowns, and performance projections             | Trader |
| ↳ Month Comparison         | Side-by-side metrics across months                                                    | Trader |
| ↳ Weekly Breakdown         | Performance segmented by week within month                                            | Trader |
| ↳ Projection               | Extrapolated performance at current pace (current month only)                         | Trader |
| **Fractal Planning Suite** | Year → quarter → month → week cascade with capital ladder and R-based targets         | Trader |
| ↳ Yearly Cockpit           | Annual grid + EOY projection + DARF strip                                             | Trader |
| ↳ Quarter View             | Quarter-level R targets and plan vs. reality                                          | Trader |
| ↳ Month Cockpit            | Snapshot hero, week strip, monthly DARF, plan vs. reality, what-if calculator         | Trader |
| ↳ Provenance Badges        | Origin marker for each resolved value (year / quarter / month / default)              | Trader |
| **Yearly Tax Reporting**   | BR DARF engine: monthly ledger, carryover, IRRF, fee config, mark paid                | Trader |
| ↳ Impostos Tab             | Per-month DARF cards inside the year cockpit                                          | Trader |
| ↳ Carryover Ledger         | Running prejuízo fiscal balance + history                                             | Trader |
| ↳ Fee Rates                | Per-account and per-asset fee config (corretagem, emolumentos, ISS, registro)         | Admin  |
| **Monte Carlo**            | Statistical simulation of trade outcomes for drawdown and risk analysis               | All    |
| ↳ Edge Expectancy          | Classic MC simulation with manual or trade-based inputs, Kelly criterion              | All    |
| ↳ Capital Expectancy       | Risk-profile-aware simulation with mode distribution and daily PnL                    | All    |
| **Equity Shield**          | Dynamic position sizing that scales down in drawdowns and up in winning streaks       | Admin  |
| ↳ MDD Exercise             | Method 1 — max drawdown exercise-based shield zones                                   | Admin  |
| ↳ SMA Crossover            | Method 2 — SMA crossover-based shield zones                                           | Admin  |
| ↳ MC Calibration           | Auto-calibrate shield params from Monte Carlo results                                 | Admin  |
| **Risk Simulation**        | What-if replay of historical trades with modified risk parameters                     | All    |
| ↳ Config Panel             | Prefill from manual, monthly plan, or risk profile                                    | All    |
| ↳ Decision Trace           | Step-by-step decision replay per trade                                                | All    |
| ↳ Equity Overlay           | Original vs simulated equity curves side-by-side                                      | All    |
| **Backtest**               | Strategy backtesting on candle data with modular entry/stop/target plugins            | Admin  |
| ↳ ORB Breakout             | Opening Range Breakout entry strategy module                                          | Admin  |
| ↳ MACD/WMA Alignment       | DezK entry strategy module                                                            | Admin  |
| ↳ Stop & Trailing          | Initial stop and trailing stop configuration                                          | Admin  |
| ↳ Targets & Sizing         | Fixed target levels, partial exits, position sizing rules                             | Admin  |
| **Backtest Optimizer**     | Parameter sweep across backtest configs with heatmap visualization                    | Admin  |
| ↳ Wizard                   | 3-step flow: setup → parameters → results                                             | Admin  |
| ↳ Heatmap                  | Parameter combination performance heatmap                                             | Admin  |
| ↳ Runs Table               | Sortable comparison table of all sweep runs                                           | Admin  |
| **Settings**               | Account, asset, tag, timeframe, condition, and indicator management                   | Trader |
| ↳ Profile                  | User profile settings                                                                 | Trader |
| ↳ Accounts                 | Trading account management (prop firms, personal)                                     | Admin  |
| ↳ Tags                     | Setup and mistake tag definitions                                                     | Admin  |
| ↳ Conditions               | Reusable trading condition blocks                                                     | Admin  |
| ↳ Indicators               | Custom indicator group and definition management                                      | Admin  |
| ↳ Assets                   | Tradeable asset definitions (tickers, lot sizes)                                      | Admin  |
| ↳ Timeframes               | Chart timeframe definitions                                                           | Admin  |
| ↳ Users                    | User list (admin)                                                                     | Admin  |
| ↳ Bugs                     | Submitted bug reports (admin)                                                         | Admin  |
| **Market Monitor**         | Real-time quotes, B3 calendar, and economic calendar (cross-cutting)                  | Admin  |
| **Position Calculator**    | Quick position size calculation from any page via dialog                              | All    |
| **Bug Report Capture**     | In-app screenshot capture and bug submission                                          | All    |
| **Page Guide**             | Interactive onboarding overlays per feature                                           | All    |
