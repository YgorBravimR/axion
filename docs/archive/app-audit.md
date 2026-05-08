# Axion — Complete Application Audit

> Full inventory of every page, component, feature, API route, and infrastructure piece.
> Generated: March 2026

---

## Pages & Routes

### Authentication Routes — `[locale]/(auth)`

**Layout:** Centered auth container, no sidebar.

| Route | Page | Type | Components Used | Data |
|-------|------|------|-----------------|------|
| `/:locale/login` | Login | SSC | `LoginForm`, `AccountPicker` | Session check, redirects if logged in; `callbackUrl` & `registered` query params |
| `/:locale/register` | Register | SSC | `RegisterForm` | Session check, redirects if logged in |
| `/:locale/forgot-password` | Password Reset | SSC | `ForgotPasswordForm` | Password reset form, redirects logged-in users |
| `/:locale/select-account` | Account Selection | SSC | Custom account selector | Guards against unauthenticated/already-selected users |

### Public Routes — `[locale]/(public)`

**Layout:** Minimal wrapper, no sidebar, no auth required.

| Route | Page | Type | Components Used | Data |
|-------|------|------|-----------------|------|
| `/:locale/painel` | Market Monitor | CSC | `MarketMonitorContent`, `HeroQuoteCard`, `QuoteRow`, `MarketStatusPanel`, `EconomicCalendar`, `B3TradingCalendar`, `AutoRefreshIndicator` | Parallel provider dispatch (Yahoo, BrAPI, CoinGecko), 60s auto-refresh, in-memory TTL cache |
| `/:locale/monitor` | Market Monitor (alias) | CSC | Same as `/painel` | Same as above |

### Protected App Routes — `[locale]/(app)`

**Layout:** `AppShell` with collapsible sidebar + `EffectiveDateProvider` for replay accounts.

#### Dashboard & Overview

| Route | Page | Type | Components Used | Data Sources |
|-------|------|------|-----------------|--------------|
| `/:locale/` | Dashboard | SSC | `DashboardContent`, `KpiCards`, `QuickStats`, `EquityCurve`, `CumulativePnlChart`, `DailyPnlBarChart`, `PerformanceRadarChart`, `TradingCalendar`, `DayDetailModal`, `DayEquityCurve`, `DaySummaryStats`, `DayTradesList` | `getOverallStats`, `getDisciplineScore`, `getEquityCurve`, `getStreakData`, `getDailyPnL`, `getRadarChartData` |
| `/:locale/reports` | Reports | SSC | `ReportsContent`, `MonthlyReportCard`, `WeeklyReportCard`, `MistakeCostCard` | `getWeeklyReport`, `getMonthlyReport`, `getMistakeCostAnalysis` |
| `/:locale/monthly` | Monthly View | SSC | `MonthlyContent`, `MonthNavigator`, `MonthComparison`, `WeeklyBreakdown`, `MonthlyProjection`, `PropProfitSummary` | `getMonthlyResultsWithProp`, `getMonthlyProjection`, `getMonthComparison` |

#### Analytics

| Route | Page | Type | Components Used | Data Sources |
|-------|------|------|-----------------|--------------|
| `/:locale/analytics` | Analytics | SSC | `AnalyticsContent`, `FilterPanel`, `VariableComparison`, `TagCloud`, `ExpectedValue`, `RDistribution`, `CumulativePnlChart`, `HourlyPerformanceChart`, `DayOfWeekChart`, `TimeHeatmap`, `SessionPerformanceChart`, `SessionAssetTable`, `ExpectancyModeToggle`, `InsightCard` | 12 sources: performance, expected value, R-distribution, equity curve, hourly, day-of-week, time heatmap, session, assets, timeframes, tag stats, session-asset |

#### Journal (Trade Management)

| Route | Page | Type | Components Used | Data Sources |
|-------|------|------|-----------------|--------------|
| `/:locale/journal` | Journal List | SSC | `JournalContent`, `TradeCard`, `TradeRow`, `TradeDayGroup`, `PeriodFilter`, `FilterPill`, `DirectionBadge`, `ColoredValue`, `WinRateBadge` | Dynamic client fetching with filters |
| `/:locale/journal/new` | New Trade | SSC | `NewTradeTabs`, `TradeForm`, `ScaledTradeForm`, `TradeModeSeletor`, `CsvImport`, `CsvImportSummary`, `CsvTradeCard`, `CsvSlTpGenerator`, `OcrImport`, `NotaImport`, `NotaMatchCard` | `getStrategies`, `getTags`, `getActiveAssets`, `getActiveTimeframes`, `getServerEffectiveNow` |
| `/:locale/journal/[id]` | Trade Detail | SSC | `TradeMetric`, `PnlDisplay`, `RMultipleBar`, `DirectionBadge`, `ExecutionList`, `InlineExecutionRow`, `PositionSummary`, `TradeExecutionsSection`, `ColoredValue` | `getTrade(id)`, `getAssetBySymbol()` |
| `/:locale/journal/[id]/edit` | Edit Trade | SSC | `TradeForm` (edit mode) | `getTrade(id)`, `getStrategies`, `getTags`, `getActiveAssets`, `getActiveTimeframes` |

#### Playbook (Strategy Management)

| Route | Page | Type | Components Used | Data Sources |
|-------|------|------|-----------------|--------------|
| `/:locale/playbook` | Playbook List | SSC | `PlaybookContent`, `StrategyCard`, `ComplianceDashboard`, `DeleteConfirmDialog` | `getStrategies`, `getComplianceOverview` |
| `/:locale/playbook/new` | New Strategy | CSC | Strategy form, `ImageUpload`, `ScenarioForm`, `ConditionPicker` | None (form only) |
| `/:locale/playbook/[id]` | Strategy Detail | SSC | `ConditionTierDisplay`, `ScenarioSection` | `getStrategy(id)`, `getStrategyConditions(id)` |
| `/:locale/playbook/[id]/edit` | Edit Strategy | CSC | Strategy form (edit mode), `ScenarioSection`, `ConditionPicker` | Async load via `useEffect` |

#### Command Center

| Route | Page | Type | Components Used | Data Sources |
|-------|------|------|-----------------|--------------|
| `/:locale/command-center` | Command Center | SSC | `CommandCenterTabs`, `DailyChecklist`, `ChecklistManager`, `DailySummaryCard`, `DateNavigator`, `PreMarketNotes`, `PostMarketNotes`, `MoodSelector`, `BiasSelector`, `AssetRulesPanel`, `LiveTradingStatusPanel`, `CircuitBreakerPanel`, `MonthlyPlanForm`, `MonthlyPlanSummary`, `MonthlyPlanTab`, `DecisionTreeModal`, `RecoveryPathsTree` | 11 sources: checklists, completions, notes, asset settings, circuit breaker, daily summary, strategies, monthly plan, risk profiles, assets, live trading status |

#### Advanced Simulations

| Route | Page | Type | Components Used | Data Sources |
|-------|------|------|-----------------|--------------|
| `/:locale/monte-carlo` | Monte Carlo | SSC | `MonteCarloContent`, `InputModeSelector`, `DataSourceSelector`, `SimulationParamsForm`, `StatsPreview`, `EquityCurveChart`, `DrawdownChart`, `DistributionHistogram`, `MetricsCards`, `KellyCriterionCard`, `TradeSequenceList`, `StrategyAnalysis` + V2 variants: `MonteCarloV2Content`, `RiskProfileSelector`, `V2DailyPnlChart`, `V2ModeDistributionChart`, `V2MetricsCards`, `V2DistributionHistogram`, `V2ResultsSummary` | `getDataSourceOptions`, `listActiveRiskProfiles` |
| `/:locale/risk-simulation` | Risk Simulation | SSC | `RiskSimulationContent`, `SimulationConfigPanel`, `RiskParamsForm`, `PrefillSelector`, `SummaryCards`, `EquityCurveOverlay`, `TradeComparisonTable`, `SkippedTradesWarning`, `DecisionTraceModal`, `PreviewBanner` | `getActiveMonthlyPlan`, `listActiveRiskProfiles` |

#### Settings

| Route | Page | Type | Components Used | Data Sources |
|-------|------|------|-----------------|--------------|
| `/:locale/settings` | Settings | SSC | `SettingsContent`, `UserProfileSettings`, `AccountSettings`, `TradingAccountSettings`, `AssetForm`, `AssetList`, `TimeframeForm`, `TimeframeList`, `TagForm`, `TagList`, `ConditionForm`, `ConditionList`, `UserList` (admin), `GeneralSettings`, `LanguageSwitcher`, `BrandSwitcher`, `RecalculateButton`, `RecalculatePnlButton` | `getAssets`, `getAssetTypes`, `getTimeframes`, `getCurrentUser`; seeds risk profiles if admin |

---

## Layouts (4 nested levels)

```
src/app/layout.tsx (ROOT)
├── Fonts: Plus Jakarta Sans, Geist Mono
├── Metadata: "Axion"
└── children only

[locale]/layout.tsx
├── next-intl → messages from server
├── ThemeProvider → dark theme
├── ToastProvider
├── LoadingOverlayProvider
├── AuthProvider (NextAuth SessionProvider)
├── AccountTransitionOverlayProvider
└── Locale validation (pt-BR, en only)

[locale]/(auth)/layout.tsx
├── Centered flex container
└── No sidebar

[locale]/(public)/layout.tsx
├── Simple min-h-screen wrapper
└── No sidebar, public access

[locale]/(app)/layout.tsx
├── AppShell (with sidebar)
├── EffectiveDateProvider (replay account date override)
└── Fetches current account & effective date server-side
```

**Provider chain (render order):**

```
ThemeProvider
  └── ToastProvider
      └── LoadingOverlayProvider
          └── AuthProvider
              └── AccountTransitionOverlayProvider
                  └── EffectiveDateProvider (app routes only)
                      └── AppShell + Sidebar
                          └── Page Content
```

**Error & Loading states:**

| File | Location | Purpose |
|------|----------|---------|
| `error.tsx` | `src/app/` | Global error boundary with "Try Again" & reload buttons |
| `loading.tsx` | `src/app/` | Dashboard skeleton with animated placeholders |
| `not-found.tsx` | `src/app/[locale]/` | 404 page with link back to home |

---

## All Features (by domain)

### 1. Authentication & Access Control

- Email/password login with bcrypt (12 rounds)
- User registration with default trading account creation
- Password recovery (email-based with OTP input)
- JWT sessions (edge-compatible, stateless)
- Multi-account per user (personal, prop, replay types)
- Account switcher with transition overlay animation
- Role-based access control: admin > trader > viewer
- Feature gating per role via `canAccessFeature()`
- Rate limiting: 5 login attempts / 15 min per email
- Session check on all auth pages with redirect

### 2. Trade Journal (CRUD)

- Create trades in 3 modes: single, scaled, manual entry
- Edit and delete trades
- Trade detail view with full execution history
- Trade grouping by day (visual day groups)
- Period filtering (date range picker)
- Multi-filter: asset, direction, outcome, strategy, tag
- P&L display with color coding (green for profit, red for loss)
- R-multiple calculation and bar visualization
- Direction badges (long/short with color)
- MFE/MAE (Maximum Favorable/Adverse Excursion) tracking
- Commission and fee tracking per execution
- Screenshot attachments via S3 upload
- Trade notes (text field)
- Import source tracking (CSV, OCR, manual)
- `?returnTo=` and `?asset=` query param support on new trade

### 3. Trade Import (4 methods)

**CSV Import:**
- Supported brokers: Clear, XP, Genial
- 3-step flow: select broker/file → preview grouped trades → confirm import
- Auto-groups executions into trades using weighted average pricing: `sum(qty × price) / sum(qty)`
- Auto entry/exit detection
- Edge case warnings (partial exits, open positions)
- 30-minute rate limiting (in-memory MVP)
- 1-hour preview cache between upload and confirmation
- AES-256-GCM encryption on all imported prices/quantities

**OCR Import:**
- Screenshot-to-trade extraction via AI vision cascade
- Provider fallback chain: Claude → Groq → Google Vision → OpenAI GPT-4V
- Automatic field extraction (asset, direction, price, quantity)

**Nota de Corretagem Import:**
- Brazilian brokerage statement parsing (Sinacor XML format)
- Automatic asset and direction detection
- Match card UI for verification

**SL/TP Auto-Generator:**
- Retroactive stop-loss/take-profit generation for imported trades
- Standalone script (`scripts/generate-sl-tp.ts`) for batch processing
- React component for inline generation during CSV import

### 4. Execution Tracking

- Multiple executions per trade (scaled entries/exits)
- Execution modes: simple (single fill) and scaled (multiple fills)
- Order types: market, limit, stop, stop_limit
- Inline editing and deleting of individual executions
- Position summary for open/partial trades
- Encrypted prices, quantities, commissions, slippage per execution

### 5. Dashboard

- KPI cards: total P&L, win rate, profit factor, average trade, max drawdown, trade count
- Equity curve (area/line chart, cumulative P&L over time)
- Daily P&L bar chart (green/red bars per day)
- Performance radar chart (multi-axis: win rate, R-multiple, consistency, etc.)
- Trading calendar heatmap (color-coded profitable/loss days)
- Day detail modal: click any day → intraday equity curve + trades list + summary stats
- Period selector: month / year / all time
- Streak tracking (consecutive wins/losses, current and best)
- Discipline score metric
- Quick stats summary

### 6. Analytics (12 visualizations)

- Performance by variable comparison (asset, strategy, tag, timeframe)
- Expected value / expectancy distribution with aggregate/daily toggle
- R-multiple distribution histogram
- Cumulative P&L equity curve
- Hourly performance chart (P&L by hour of day)
- Day-of-week performance chart
- Time heatmap (2D grid: hour × day-of-week, color = P&L intensity)
- Session performance chart (pre-market, regular, after-hours)
- Session × asset performance cross-table
- Tag cloud (word cloud sized by frequency, colored by P&L)
- Variable comparison (side-by-side bar charts)
- Insight cards with trend indicators (up/down/neutral)
- Multi-filter panel: date range, assets, outcomes, directions

### 7. Reports

- Monthly report cards: P&L, trade count, win rate, best/worst trade, key metrics
- Weekly report cards: same metrics at weekly granularity
- Mistake cost analysis: tags of type "mistake" → cost quantification → ranked list
- Period comparison across months/weeks

### 8. Monthly Planning & Tracking

- Monthly plan creation: account balance, risk %, daily loss limit, profit target, max daily trades
- Plan summary card
- Month navigator (previous/next)
- Month-over-month comparison chart
- Weekly breakdown within month
- Monthly projection (extrapolate current pace to month-end)
- Prop firm profit summary (for prop accounts)
- Decision tree modal with recovery path visualization
- Recovery paths tree (visual tree of loss-recovery scenarios)
- Encrypted plan fields: accountBalance, dailyLossCents, riskPerTradeCents

### 9. Command Center (Daily Workflow)

**Pre-market phase:**
- Daily checklists with CRUD, progress tracking, completion state
- Checklist manager (create/edit/delete items)
- Pre-market notes (rich text editor)
- Mood selector (bad/neutral/good emotional state)
- Bias selector (bullish/bearish/neutral market bias)

**Execution phase:**
- Asset rules panel (shows asset-specific trading rules)
- Live trading status panel (current phase + constraints)
- Circuit breaker panel (daily loss limit vs current loss)
- Daily summary card (today's P&L and trade count)

**Post-market phase:**
- Post-market notes (rich text review/reflection)

**Additional:**
- Date navigator for replay accounts
- Replay mode via `?date=` query parameter
- Supports replay account date override for historical review

### 10. Strategy Playbook

- Strategy CRUD with name, description, image upload (S3)
- Trading conditions with categories: indicator, price_action, market_context, custom
- Condition tiers: mandatory / tier_2 / tier_3 → setup ranking (A / AA / AAA)
- Condition tier display (visual hierarchy)
- Scenario documentation per strategy (entry conditions, exit rules, notes)
- Scenario form for creating/editing scenarios
- Compliance dashboard showing strategy adherence metrics
- Strategy cards with performance stats
- Delete confirmation dialog
- Strategy-trade linkage for performance tracking

### 11. Monte Carlo Simulation

**V1 (Original):**
- Input mode: auto (from database trades) or manual entry
- Data source selection: recent trades, by asset, by strategy
- Configurable parameters: simulation count, confidence levels
- Stats preview of selected data source
- Equity curve fan chart (all simulation paths overlaid)
- Drawdown analysis chart
- Distribution histogram (final equity spread)
- Metrics cards: expectancy, max drawdown, Sharpe ratio, ruin probability
- Kelly criterion position sizing card
- Trade sequence list
- Strategy robustness analysis

**V2 (Enhanced):**
- Risk-profile-aware simulations
- Risk profile selector
- Daily P&L chart from simulations
- Mode distribution chart (base vs recovery vs gain)
- Enhanced metrics cards
- Enhanced distribution histogram
- Results summary card

### 12. Risk Simulation

- What-if scenario testing with customizable risk parameters
- Prefill from last N days or from risk profile template
- Date range selector
- Risk parameters form (stops, targets, position sizing)
- Original vs simulated equity curve overlay
- Trade-by-trade comparison table (real vs simulated outcomes)
- Skipped trades warning (trades excluded by filter)
- Decision trace modal (step-by-step phase transition walk-through)
- Preview banner for simulation mode
- Phase machine: base → loss_recovery → gain_mode
- Summary cards with simulation results

### 13. Live Trading Status

- Current phase resolution (base, loss_recovery, gain_mode)
- Available risk calculation for next trade
- Daily loss limit tracking (consumed vs remaining)
- Consecutive loss/win tracking
- Breakeven trade handling (skip phase transitions)
- Circuit breaker trigger detection
- Human-readable phase descriptions via `describeRiskCalc()`

### 14. Risk Profiles

- Risk profile template CRUD
- Decision tree configuration (loss recovery sequences, gain mode rules)
- Default profile seeding (admin-only, runs on settings page load)
- Profile selection for Monte Carlo V2 and Risk Simulation
- Multiple profiles per account
- Archived profile support

### 15. Market Monitor

- Real-time quotes from 3 providers: Yahoo Finance, BrAPI (B3), CoinGecko (crypto)
- Parallel provider dispatch with fallback retry for unresolved symbols
- Hero quote cards for major indices (IBOV, S&P 500, NASDAQ, Dollar)
- Companion symbol rows (additional assets)
- Market open/closed status panel
- Economic calendar (FairEconomy + Brazilian Central Bank)
- B3 trading calendar (holidays and special sessions)
- Auto-refresh indicator with last updated timestamp
- Auto-refresh every 60 seconds
- In-memory TTL caching
- Rate limit: 60 requests/min per IP
- Public route (no authentication required)

### 16. Settings & Configuration

- **User Profile:** name, email, password change with validation
- **Account Settings:** name, leverage, currency, account type (personal/prop/replay)
- **Trading Account Settings:** account-specific configuration
- **Assets:** CRUD with type classification (futures, stocks, options, forex)
- **Timeframes:** CRUD with types (time_based: 1m/5m/15m/1h; renko: brick size)
- **Tags:** CRUD with types (setup, mistake, general)
- **Trading Conditions:** CRUD with categories (indicator, price_action, market_context, custom)
- **User Management** (admin only): list users, change roles (admin/trader/viewer), deactivate accounts
- **Language Switcher:** pt-BR ↔ en
- **Brand Switcher:** 8 themes defined (currently disabled, defaults to "bravo")
- **Recalculate P&L:** one-click recalculation of all trade metrics
- **General Settings:** locale, theme, date format preferences

### 17. Security & Encryption

- AES-256-GCM envelope encryption
- Per-user Data Encryption Key (DEK) system
- Master key via `ENCRYPTION_MASTER_KEY` environment variable
- Encrypted fields across all domains:
  - Trades: entry/exit prices, P&L, position size
  - Executions: prices, quantities, commissions, fees, slippage
  - Accounts: tax rates, fees, risk limits
  - Monthly Plans: account balance, daily loss, risk per trade
  - Journal/Daily Notes: content fields
- Idempotent encryption checks (`isEncrypted()` guard)
- Cached per-request DEK lookup for performance

### 18. Internationalization (i18n)

- 2 locales: pt-BR (default), en
- `next-intl` integration with `[locale]` dynamic routing
- Locale-aware formatting:
  - Currency: BRL (R$) / USD ($)
  - Dates: dd/MM/yyyy (pt-BR) / MM/dd/yyyy (en)
  - Number separators: 1.000,00 (pt-BR) / 1,000.00 (en)
- `useFormatting()` hook: 14 formatting functions (currency, number, percent, date variants, time)
- Server-side locale resolution via `getRequestConfig()`
- JSON message files per locale in `/messages/`

### 19. File Storage

- S3-compatible storage (Cloudflare R2, MinIO, AWS S3)
- Upload and delete API endpoints with auth check
- Path-based organization: `{entityType}/{uuid}/{timestamp}-{hash}`
- Public URL generation from S3 keys
- File type and size validation
- Used for: strategy images, trade screenshots

---

## UI Component Library

### Shadcn/UI Primitives (25 components)

| Component | File | Variants / Subcomponents |
|-----------|------|--------------------------|
| `Button` | `ui/button.tsx` | Variants: default, destructive, outline, secondary, ghost, link. Sizes: default, sm, lg, icon. Supports `asChild` composition |
| `Card` | `ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter` |
| `Input` | `ui/input.tsx` | Standard HTML input with styling |
| `Textarea` | `ui/textarea.tsx` | Multi-line text input |
| `Label` | `ui/label.tsx` | Form label |
| `Select` | `ui/select.tsx` | `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` |
| `Badge` | `ui/badge.tsx` | Multiple color variants |
| `Checkbox` | `ui/checkbox.tsx` | Controlled with `checked`, `onCheckedChange` |
| `RadioGroup` | `ui/radio-group.tsx` | `RadioGroup` + `RadioGroupItem` |
| `Switch` | `ui/switch.tsx` | Toggle switch |
| `Tabs` | `ui/tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `AnimatedTabsContent`. Variants: line, default |
| `Dialog` | `ui/dialog.tsx` | `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogDescription`, `DialogFooter` |
| `AlertDialog` | `ui/alert-dialog.tsx` | Confirmation modal pattern |
| `Sheet` | `ui/sheet.tsx` | Slide-out side panel |
| `Popover` | `ui/popover.tsx` | Floating popover |
| `DropdownMenu` | `ui/dropdown-menu.tsx` | Full dropdown menu system |
| `Tooltip` | `ui/tooltip.tsx` | Hover tooltip |
| `DatePicker` | `ui/date-picker.tsx` | Single date selection |
| `DateRangePicker` | `ui/date-range-picker.tsx` | Date range selection with `dateFrom`, `dateTo` |
| `Calendar` | `ui/calendar.tsx` | Calendar widget |
| `ScrollArea` | `ui/scroll-area.tsx` | Custom scrollable area |
| `Separator` | `ui/separator.tsx` | Visual divider line |
| `Kbd` | `ui/kbd.tsx` | Keyboard key display |
| `Command` | `ui/command.tsx` | Command palette / search |
| `Form` | `ui/form.tsx` | `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` (react-hook-form + Zod) |
| `Table` | `ui/table.tsx` | `Table`, `TableHead`, `TableBody`, `TableRow`, `TableCell` |

### Custom UI Components (5)

| Component | File | Purpose |
|-----------|------|---------|
| `DataTable` | `ui/data-table.tsx` | TanStack table wrapper with sorting, filtering, pagination |
| `ChartContainer` | `ui/chart-container.tsx` | Recharts wrapper with config |
| `LoadingOverlay` | `ui/loading-overlay.tsx` | Full-screen loading spinner with `showLoading()` / `hideLoading()` |
| `InputOTP` | `ui/input-otp.tsx` | One-time password input fields |
| `ThemeToggle` | `ui/theme-toggle.tsx` | Dark/light mode toggler |
| `AccountTransitionOverlay` | `ui/account-transition-overlay.tsx` | Animated overlay during account switching |
| `Toast` | `ui/toast.tsx` | Toast notification system |

### Shared Components (8)

| Component | File | Props | Purpose |
|-----------|------|-------|---------|
| `ColoredValue` | `shared/colored-value.tsx` | `value`, `formatFn`, `showSign`, `type` (r-multiple, currency), `size` | Values color-coded green (profit) / red (loss) |
| `DirectionBadge` | `shared/direction-badge.tsx` | `direction` (long/short) | Badge showing trade direction |
| `EmptyState` | `shared/empty-state.tsx` | `title`, `description`, `icon`, `action` | Placeholder for empty lists/sections |
| `FilterPill` | `shared/filter-pill.tsx` | `label`, `variant`, `onRemove` | Removable filter tag |
| `LoadingSpinner` | `shared/loading-spinner.tsx` | `size`, `text` | Animated loading indicator |
| `StatCard` | `shared/stat-card.tsx` | `label`, `value`, `trend` (up, down, neutral) | KPI metric card |
| `WinRateBadge` | `shared/win-rate-badge.tsx` | `winRate`, `totalTrades` | Shows win rate percentage |
| `ImageUpload` | `shared/image-upload.tsx` | `onUpload`, `preview`, `disabled` | Image upload with preview |

### Layout & Navigation Components (7)

| Component | File | Purpose |
|-----------|------|---------|
| `AppShell` | `layout/app-shell.tsx` | Top-level app wrapper (sidebar + content area) |
| `MainLayout` | `layout/main-layout.tsx` | Sidebar + main content split |
| `Sidebar` | `layout/sidebar.tsx` | Collapsible nav with role-based item filtering |
| `AccountSwitcher` | `layout/account-switcher.tsx` | Switch between trading accounts |
| `UserMenu` | `layout/user-menu.tsx` | Profile, settings, logout dropdown |
| `CommandMenu` | `layout/command-menu.tsx` | Cmd+K search palette |
| `PageBreadcrumb` | `layout/page-breadcrumb.tsx` | Breadcrumb trail |

---

## Feature Components (by domain)

### Journal Components (`components/journal/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `trade-form.tsx` | Form | Complex trade entry form with calculation hooks, encrypted fields, ref support |
| `scaled-trade-form.tsx` | Form | Handles scaled entries/exits with multiple fills |
| `trade-card.tsx` | Display | Trade summary card with tags, direction, P&L |
| `trade-row.tsx` | Display | Compact single-row trade display |
| `trade-day-group.tsx` | Container | Groups trades by date |
| `trade-metric.tsx` | Display | Single labeled metric value |
| `pnl-display.tsx` | Display | P&L value with percentage and color |
| `r-multiple-bar.tsx` | Display | Visual bar showing R multiple |
| `execution-form.tsx` | Form | Add executions to existing trade |
| `execution-list.tsx` | Display | List of trade executions |
| `inline-execution-row.tsx` | Display | Single execution with edit/delete |
| `position-summary.tsx` | Display | Open position details |
| `trade-executions-section.tsx` | Container | Manages executions section |
| `trade-mode-selector.tsx` | Control | Switch between single/scaled/manual modes |
| `new-trade-tabs.tsx` | Container | Tab interface for trade entry modes |
| `csv-import.tsx` | Feature | Legacy CSV import (3-step flow) |
| `csv-import-summary.tsx` | Display | Import preview before confirmation |
| `csv-trade-card.tsx` | Display | CSV trade card for import preview |
| `csv-sl-tp-generator.tsx` | Feature | Auto-generates SL/TP for CSV imports |
| `ocr-import.tsx` | Feature | Screenshot-to-trade OCR import |
| `nota-import.tsx` | Feature | B3 nota de corretagem import |
| `nota-match-card.tsx` | Display | Matched B3 nota entry |
| `period-filter.tsx` | Filter | Date range filter |
| `journal-content.tsx` | Container | Main journal page layout |

### Dashboard Components (`components/dashboard/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `dashboard-content.tsx` | Container | Main dashboard with period selector |
| `kpi-cards.tsx` | Display | 4-6 key metric cards |
| `quick-stats.tsx` | Display | Smaller stat summary |
| `equity-curve.tsx` | Chart | Cumulative P&L area/line chart |
| `cumulative-pnl-chart.tsx` | Chart | Cumulative P&L over time |
| `daily-pnl-bar-chart.tsx` | Chart | Green/red daily P&L bars |
| `performance-radar-chart.tsx` | Chart | Multi-axis performance radar |
| `day-detail-modal.tsx` | Modal | Detailed view of a specific day |
| `day-equity-curve.tsx` | Chart | Intraday equity progression |
| `day-summary-stats.tsx` | Display | Day's key metrics |
| `day-trades-list.tsx` | Display | List of trades for a day |
| `trading-calendar.tsx` | Chart | Heatmap calendar of profitable/loss days |

### Analytics Components (`components/analytics/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `analytics-content.tsx` | Container | Main analytics with parallel data fetching |
| `filter-panel.tsx` | Filter | Date range, asset, outcome, direction filters |
| `variable-comparison.tsx` | Chart | Performance comparison across variables |
| `tag-cloud.tsx` | Chart | Word cloud of tag frequency/performance |
| `expected-value.tsx` | Chart | Expectancy distribution |
| `r-distribution.tsx` | Chart | R-multiple histogram |
| `cumulative-pnl-chart.tsx` | Chart | Equity curve |
| `hourly-performance-chart.tsx` | Chart | P&L by hour of day |
| `day-of-week-chart.tsx` | Chart | P&L by day of week |
| `time-heatmap.tsx` | Chart | 2D heatmap (hour × day) |
| `session-performance-chart.tsx` | Chart | P&L by trading session |
| `session-asset-table.tsx` | Table | Sessions × Assets grid |
| `expectancy-mode-toggle.tsx` | Control | Aggregate vs daily expectancy toggle |
| `insight-card.tsx` | Display | Small insight card with trend |

### Command Center Components (`components/command-center/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `daily-checklist.tsx` | Feature | Toggle checklist items, progress tracking |
| `checklist-manager.tsx` | Feature | CRUD for checklist items |
| `daily-summary-card.tsx` | Display | Day's P&L and trade count |
| `date-navigator.tsx` | Control | Navigate between dates (replay mode) |
| `pre-market-notes.tsx` | Feature | Rich text editor for pre-market plans |
| `post-market-notes.tsx` | Feature | Rich text editor for post-market review |
| `mood-selector.tsx` | Input | Emotional state selector |
| `bias-selector.tsx` | Input | Trading bias selector |
| `asset-rules-panel.tsx` | Display | Asset-specific trading rules |
| `live-trading-status-panel.tsx` | Display | Live trading status |
| `circuit-breaker-panel.tsx` | Display | Circuit breaker status |

### Monte Carlo Components (`components/monte-carlo/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `monte-carlo-content.tsx` | Container | Main page with tabs |
| `input-mode-selector.tsx` | Control | Auto vs manual input |
| `data-source-selector.tsx` | Input | Choose trade data source |
| `simulation-params-form.tsx` | Form | Simulation configuration |
| `stats-preview.tsx` | Display | Source data statistics |
| `equity-curve-chart.tsx` | Chart | All simulation equity paths |
| `drawdown-chart.tsx` | Chart | Drawdown analysis |
| `distribution-histogram.tsx` | Chart | Final equity distribution |
| `metrics-cards.tsx` | Display | Simulation metrics |
| `kelly-criterion-card.tsx` | Display | Position sizing recommendation |
| `trade-sequence-list.tsx` | Display | Individual trade results |
| `strategy-analysis.tsx` | Container | Robustness analysis |
| **V2 variants:** | | |
| `v2/monte-carlo-v2-content.tsx` | Container | Risk-profile-aware simulations |
| `v2/risk-profile-selector.tsx` | Input | Select risk profile |
| `v2/daily-pnl-chart.tsx` | Chart | Daily P&L from simulations |
| `v2/mode-distribution-chart.tsx` | Chart | P&L by trading mode |
| `v2/v2-metrics-cards.tsx` | Display | Enhanced metrics |
| `v2/v2-distribution-histogram.tsx` | Chart | Enhanced distribution |
| `v2/v2-results-summary.tsx` | Display | Results summary |

### Risk Simulation Components (`components/risk-simulation/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `risk-simulation-content.tsx` | Container | Main page with config + results |
| `simulation-config-panel.tsx` | Form | Date and parameter inputs |
| `risk-params-form.tsx` | Form | Position sizing parameters |
| `prefill-selector.tsx` | Input | Load preset params |
| `summary-cards.tsx` | Display | Simulation result metrics |
| `equity-curve-overlay.tsx` | Chart | Real vs simulated equity curves |
| `trade-comparison-table.tsx` | Table | Side-by-side trade comparison |
| `skipped-trades-warning.tsx` | Alert | Excluded trades list |
| `decision-trace-modal.tsx` | Modal | Step-by-step decision tree |
| `preview-banner.tsx` | Alert | Preview mode indicator |

### Monthly Components (`components/monthly/` + `components/monthly-plan/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `monthly-content.tsx` | Container | Month view with navigator |
| `month-navigator.tsx` | Control | Previous/next month buttons |
| `month-comparison.tsx` | Chart | Cross-month metric comparison |
| `weekly-breakdown.tsx` | Display | Week-by-week performance |
| `monthly-projection.tsx` | Display | Extrapolated month-end estimate |
| `prop-profit-summary.tsx` | Display | Prop account profit summary |
| `monthly-plan-form.tsx` | Form | Plan creation/editing |
| `monthly-plan-summary.tsx` | Display | Plan settings summary |
| `monthly-plan-tab.tsx` | Container | Plan tab wrapper |
| `decision-tree-modal.tsx` | Modal | Recovery path visualization |
| `recovery-paths-tree.tsx` | Display | Visual decision tree |

### Playbook Components (`components/playbook/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `playbook-content.tsx` | Container | Strategy list page |
| `strategy-card.tsx` | Display | Strategy with stats |
| `scenario-form.tsx` | Form | Entry/exit conditions and notes |
| `scenario-section.tsx` | Container | Grouped scenarios |
| `condition-picker.tsx` | Input | Select conditions |
| `condition-tier-display.tsx` | Display | Condition hierarchy visualization |
| `compliance-dashboard.tsx` | Display | Strategy compliance metrics |
| `delete-confirm-dialog.tsx` | Modal | Delete confirmation |

### Reports Components (`components/reports/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `reports-content.tsx` | Container | Reports page |
| `monthly-report-card.tsx` | Display | Monthly summary card |
| `weekly-report-card.tsx` | Display | Weekly summary card |
| `mistake-cost-card.tsx` | Display | Mistake cost analysis |

### Market Components (`components/market/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `market-monitor-content.tsx` | Container | Main monitor with auto-refresh |
| `hero-quote-card.tsx` | Display | Large quote card for major indices |
| `quote-row.tsx` | Display | Single quote row with change % |
| `market-status-panel.tsx` | Display | Market open/closed status |
| `economic-calendar.tsx` | Display | Upcoming economic events |
| `b3-trading-calendar.tsx` | Calendar | B3 trading days |
| `auto-refresh-indicator.tsx` | Display | Last update time |

### Settings Components (`components/settings/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `settings-content.tsx` | Container | Tab interface for all settings |
| `user-profile-settings.tsx` | Form | Email, password, preferences |
| `account-settings.tsx` | Form | Account name, leverage, currency |
| `trading-account-settings.tsx` | Form | Account-specific settings |
| `asset-form.tsx` | Form | Add/edit asset |
| `asset-list.tsx` | Display | Asset list with delete |
| `timeframe-form.tsx` | Form | Add/edit timeframe |
| `timeframe-list.tsx` | Display | Timeframe list with delete |
| `tag-form.tsx` | Form | Add/edit tag |
| `tag-list.tsx` | Display | Tag list with delete |
| `condition-form.tsx` | Form | Add/edit condition |
| `condition-list.tsx` | Display | Condition list with delete |
| `user-list.tsx` | Display | User management (admin only) |
| `general-settings.tsx` | Form | App preferences |
| `language-switcher.tsx` | Control | Switch i18n locale |
| `brand-switcher.tsx` | Control | Switch brand theme |
| `recalculate-button.tsx` | Action | Recompute all P&L |
| `recalculate-pnl-button.tsx` | Action | P&L recalculation variant |

### Auth Components (`components/auth/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `login-form.tsx` | Form | Email/password login |
| `register-form.tsx` | Form | Registration |
| `forgot-password-form.tsx` | Form | Password recovery |
| `account-picker.tsx` | Modal | Account selection after login |
| `auth-provider.tsx` | Provider | NextAuth session wrapper |

### Import Components (`components/imports/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `detailed-trade-importer.tsx` | Feature | 3-step import (select → preview → confirm) |

### Providers (`components/providers/`)

| Component | Type | Purpose |
|-----------|------|---------|
| `brand-provider.tsx` | Context | Brand theme context |
| `brand-script.tsx` | Script | Theme injection to head |
| `brand-synchronizer.tsx` | Sync | Updates theme on brand change |
| `theme-synchronizer.tsx` | Sync | Dark/light mode sync |
| `effective-date-provider.tsx` | Context | Replay date context |

---

## API Routes (6 endpoints)

| Endpoint | Methods | Auth | Rate Limit | Purpose |
|----------|---------|------|------------|---------|
| `/api/auth/[...nextauth]` | GET, POST | NextAuth | 5/15min per email | Authentication (login, logout, session) |
| `/api/uploads` | POST, DELETE | Required | — | S3 file upload and deletion |
| `/api/imports/detailed-trades` | POST | Required | 30-min cooldown | CSV upload and preview |
| `/api/imports/detailed-trades/confirm` | POST | Required | — | Confirm and commit import |
| `/api/market/calendar` | GET | Public | 60/min per IP | Economic calendar events |
| `/api/market/quotes` | GET | Public | 60/min per IP | Market quotes (multi-provider) |

---

## Server Actions (26 modules)

| Module | File | Actions | Key Features |
|--------|------|---------|--------------|
| **Auth** | `actions/auth.ts` | `registerUser`, `loginUser`, `logoutUser`, `getCurrentUser`, `changePassword`, `updateProfile`, `getAccountsForAccountPicker` | bcrypt 12 rounds, multi-account, rate limiting |
| **Accounts** | `actions/accounts.ts` | `createTradingAccount`, `updateTradingAccount`, `deleteTradingAccount`, `setDefaultAccount`, `getAccountDetails` | Encrypted fields, name uniqueness |
| **Trades** | `actions/trades.ts` (2087 lines) | `createTrade`, `updateTrade`, `deleteTrade`, `getTrade`, `getTrades`, `getTradeStats`, `updateTradeOutcome`, `batchUpdateTrades`, `calculateRMetrics` | Full encryption, MFE/MAE, import tracking |
| **Executions** | `actions/executions.ts` (898 lines) | `createExecution`, `updateExecution`, `deleteExecution`, `getExecutions`, `getExecutionsByTrade` | Simple + scaled modes, encrypted fields |
| **Analytics** | `actions/analytics.ts` (1094 lines) | Daily/weekly/monthly P&L, win rate, profit factor, Sharpe, drawdown, time-of-day, asset performance | Multi-range, multi-asset |
| **Reports** | `actions/reports.ts` (1094 lines) | Weekly/monthly reports, mistake cost analysis, tax estimates | Day trade vs swing tax |
| **Monthly Plans** | `actions/monthly-plans.ts` | `createMonthlyPlan`, `updateMonthlyPlan`, `getMonthlyPlan`, `getMonthlyStats` | Encrypted balance and limits |
| **Risk Profiles** | `actions/risk-profiles.ts` | `createRiskProfile`, `updateRiskProfile`, `deleteRiskProfile`, `getRiskProfile`, `listRiskProfiles`, `seedRiskProfiles` | Decision tree, admin seeding |
| **Strategies** | `actions/strategies.ts` (651 lines) | `createStrategy`, `updateStrategy`, `deleteStrategy`, `getStrategy`, `listStrategies` | Condition linkage, tier ranking |
| **Trading Conditions** | `actions/trading-conditions.ts` | `createCondition`, `updateCondition`, `deleteCondition`, `getConditions` | 4 categories, 3 tiers |
| **Tags** | `actions/tags.ts` | `createTag`, `updateTag`, `deleteTag`, `getTags` | 3 types: setup, mistake, general |
| **CSV Import** | `actions/csv-import.ts` | `importTradesFromCSV`, `validateCSVFormat`, `parseCSVExecutions` | Cache, rate limit, validation |
| **OCR Import** | `actions/ocr-import.ts` | `extractTradesFromImage`, `validateOCRExtract`, `parseOCRData` | 4 vision providers with fallback |
| **Nota Import** | `actions/nota-import.ts` | `parseNotaStatement`, `extractTradesFromNota` | Sinacor XML, B3 format |
| **Assets** | `actions/assets.ts` | `getAsset`, `listAssets`, `getAssetStats` | Type classification |
| **Timeframes** | `actions/timeframes.ts` | `createTimeframe`, `getTimeframes` | Time-based + renko |
| **Command Center** | `actions/command-center.ts` (1136 lines) | `executeTrade`, `closeTrade`, `updatePositionSize`, `getMarketMonitor`, `checkLiveStatus` | Phase machine, live risk |
| **Live Trading Status** | `actions/live-trading-status.ts` | `resolveLiveStatus`, `getPhaseStatus`, `getAvailableRisk` | Phase: base/recovery/gain |
| **Monte Carlo** | `actions/monte-carlo.ts` | `runMonteCarloSimulation`, `analyzeProbabilities`, `forecastDrawdown`, `computeRuin` | Sequential + advanced |
| **Risk Simulation** | `actions/risk-simulation.ts` | `simulateRiskScenario`, `computeDecisionTree`, `analyzeRecoverySequence` | What-if testing |
| **Scenarios** | `actions/scenarios.ts` | `createScenario`, `runScenario`, `compareScenarios` | A/B strategy testing |
| **Settings** | `actions/settings.ts` | `updateUserSettings`, `updateSecuritySettings`, `getSystemSettings` | Locale, theme, date format |
| **Password Recovery** | `actions/password-recovery.ts` | `requestPasswordReset`, `verifyResetToken`, `resetPassword` | Email + OTP |
| **User Management** | `actions/user-management.ts` | `getUsersList`, `updateUserRole`, `deactivateUser` | Admin only |

---

## Database Schema (19 tables, 12 enums)

### Tables

| Table | Purpose | Key Fields |
|-------|---------|------------|
| `users` | User accounts | id, name, email, passwordHash, role, encryptedDek, preferredLocale, theme |
| `trading_accounts` | Multiple accounts per user | id, userId, name, accountType (personal/prop/replay), brand, tax rates (encrypted) |
| `sessions` | Auth.js sessions | sessionToken, userId, expires |
| `oauthAccounts` | Future OAuth | provider, providerAccountId |
| `trades` | Core trade records | entryDate, exitDate, asset, direction, entryPrice, exitPrice, positionSize, P&L (all encrypted), status, outcome, importSource, screenshots |
| `executions` | Individual order fills | tradeId, price, quantity, commission, fees, slippage (encrypted), executionMode, executionType, orderType |
| `strategies` | Trading strategies | name, description, imageUrl, rules |
| `tradingConditions` | Setup rules | name, category, tier |
| `tradingAccounts_strategies_map` | Many-to-many | accountId, strategyId |
| `tags` | Labels | name, type (setup/mistake/general) |
| `trades_tags_map` | Many-to-many | tradeId, tagId |
| `monthlyPlans` | Monthly risk profiles | accountBalance, dailyLossLimit, profitTarget, maxTrades (encrypted) |
| `riskProfiles` | Risk templates | name, decisionTree, lossRecovery, gainMode |
| `timeframes` | Chart timeframes | type (time_based/renko), unit, value |
| `scenarios` | What-if tests | name, parameters, results |
| `accounts` | Account types | type (personal/prop) |
| `verificationTokens` | Email verification | token, expires |
| `passwordResetTokens` | Password recovery | token, email, expires |

### Enums

| Enum | Values |
|------|--------|
| `trade_direction` | long, short |
| `trade_outcome` | win, loss, breakeven |
| `account_type` | personal, prop, replay |
| `user_role` | admin, trader, viewer |
| `tag_type` | setup, mistake, general |
| `timeframe_type` | time_based, renko |
| `execution_mode` | simple, scaled |
| `execution_type` | entry, exit |
| `order_type` | market, limit, stop, stop_limit |
| `condition_category` | indicator, price_action, market_context, custom |
| `condition_tier` | mandatory, tier_2, tier_3 |
| `setup_rank` | A, AA, AAA |

---

## Infrastructure

### Custom Hooks (3)

| Hook | File | Purpose |
|------|------|---------|
| `useFormatting` | `hooks/use-formatting.ts` | 14 locale-aware formatting functions (currency, number, percent, dates, time) |
| `useIsMobile` | `hooks/use-is-mobile.ts` | Viewport detection (< 768px), SSR-safe |
| `useFeatureAccess` | `hooks/use-feature-access.ts` | Role-based feature access (role, canAccess, isAdmin, isTrader) |

### Context Providers (3)

| Provider | File | Purpose |
|----------|------|---------|
| `AuthProvider` | `auth/auth-provider.tsx` | NextAuth SessionProvider wrapper |
| `BrandProvider` | `providers/brand-provider.tsx` | Brand theming (7 brands + default, currently disabled) |
| `EffectiveDateProvider` | `providers/effective-date-provider.tsx` | Replay account date simulation |

### Utility Libraries (40+)

**Core:**
`utils.ts` (cn), `brands.ts`, `feature-access.ts`, `auth-utils.ts`, `error-utils.ts`, `formatting.ts` (324 lines)

**Data & Calculations:**
`calculations.ts` (446 lines), `calculator.ts`, `money.ts`, `dates.ts` (244 lines)

**Encryption:**
`crypto.ts` (AES-256-GCM), `user-crypto.ts` (per-user DEK), `otp.ts`, `rate-limiter.ts`

**Parsing & Import:**
`csv-parser.ts` (legacy), `csv-parsers/` (Clear, XP, Genial), `nota-parser/` (6 files), `deduplication.ts`, `ocr/` (Tesseract, OpenAI Vision), `vision/` (Claude, Groq, Google, OpenAI)

**Analytics & Simulation:**
`monte-carlo.ts`, `monte-carlo-v2.ts`, `risk-simulation.ts`, `risk-simulation-advanced.ts`, `risk-profile.ts`, `risk-profile-templates.ts`, `live-trading-status.ts`

**Market Data:**
`market/orchestrator.ts`, `market/registry.ts`, `market/cache.ts`, `market/quote-utils.ts`, `market/holidays.ts`, `market/providers/` (yahoo, brapi, coingecko, bcb, calendar)

**Storage & Email:**
`upload-files.ts`, `storage.ts`, `email.ts`, `email-templates.ts`

**Business Logic:**
`monthly-plan.ts`, `effective-date.ts`, `navigation.ts`, `account-brand.ts`

### Validation Schemas (13)

`auth.ts`, `trade.ts`, `execution.ts`, `asset.ts`, `timeframe.ts`, `strategy.ts`, `trading-condition.ts`, `risk-profile.ts`, `risk-simulation.ts`, `monthly-plan.ts`, `scenario.ts`, `command-center.ts`, `password-recovery.ts`, `user-management.ts`, `upload.ts`, `calculator.ts`, `monte-carlo.ts`, `settings.ts`

### Theming

**8 brand themes** defined in `globals.css`:
bravo (default), midnight, retro, luxury, tsr, neon, lannister, default

Each brand has:
- Dark mode variables (primary)
- Light mode variables (via `data-theme="light"`)
- Custom accent colors, backgrounds, text colors
- Trading-specific colors (profit/loss/long/short)

**Spacing scale:** `--spacing-s-100` (4px) through `--spacing-l-900` (64px)
**Font sizes:** h1 (3rem) → tiny (0.75rem)
**Shadows:** small → xl
**Breakpoints:** xs (480px) → 2xl (1536px)

**Animations:** `overlay-pulse-line`, `overlay-fade-in`, `overlay-progress-shimmer`, `transition-scale-in`, `transition-text-up`, `transition-ring-pulse`, `tab-fade-in` — all respect `prefers-reduced-motion`

### Environment Variables (36)

| Category | Variables |
|----------|-----------|
| **Database** | `DATABASE_URL` (Neon PostgreSQL) |
| **Auth** | `AUTH_SECRET`, `AUTH_TRUST_HOST` |
| **Encryption** | `ENCRYPTION_MASTER_KEY` (32 bytes hex) |
| **AI Vision** | `OPENAI_API_KEY`, `GROQ_API_KEY`, `GOOGLE_CLOUD_VISION_API_KEY`, `ANTHROPIC_API_KEY` |
| **Email** | `RESEND_API_KEY`, `EMAIL_FROM` |
| **S3 Storage** | `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_PUBLIC_URL` |
| **Market Data** | `BRAPI_TOKEN`, `EODHD_API_KEY` |

---

## Summary Statistics

| Category | Count |
|----------|-------|
| Pages/Routes | 18 unique + 2 aliases |
| Layouts | 4 nested levels |
| UI Primitives (shadcn) | 25 |
| Custom UI Components | 7 |
| Shared Components | 8 |
| Layout/Nav Components | 7 |
| Feature Components | ~180+ |
| Chart Components | ~20 (Recharts-based) |
| Server Action Modules | 26 |
| API Routes | 6 |
| Custom Hooks | 3 |
| Context Providers | 3 |
| Utility Libraries | 40+ |
| Validation Schemas | 18 |
| Type Definition Files | 10 |
| Brand Themes | 8 (dark + light) |
| Locales | 2 (pt-BR, en) |
| Database Tables | 19 |
| Database Enums | 12 |
| Environment Variables | 36 |
| **Total Components** | **~220+** |
