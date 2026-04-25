# Performance Scan — Skipped (Low Priority) Items

All items below were identified during performance scans but intentionally skipped as low-impact.
Kept here for future reference if deeper optimization is needed.

---

## Round 1 — Analytics, Backtest, MC, Optimize, Risk Sim (commit 40fbfc7)

All identified issues were fixed. No items skipped.

## Round 2 — Hooks, UI, Shared, Layout, Playbook, Monthly (commit 14de353)

All identified issues were fixed. No items skipped.

## Round 3 — Settings, Auth, Account Comparison, Trade Detail (commit 0143f82)

| # | File | Issue | Why Skipped |
|---|------|-------|-------------|
| L1 | `brand-switcher.tsx:56` | Manual `mounted` state hydration guard causes extra paint cycle. Could use `dynamic({ ssr: false })` | Acceptable pattern — single extra paint on mount, settings page only |

## Round 4 — Final Sweep: Dashboard, Journal, CC, Providers, Market, etc.

| # | File | Issue | Why Skipped |
|---|------|-------|-------------|
| L1 | `daily-summary-card.tsx` | Pure display component, no list rendering, no expensive derivations | Already clean |
| L2 | `day-trace-card.tsx:14` | `outcomeBadge` closure in `TradeFlowItem` sub-component recreated each render | Sub-component is small, not list-heavy |
| L3 | `trade-comparison-table.tsx:22` | `setPage` inline without `useCallback` — simple URL param setter | Low frequency navigation handler |
| L4 | `equity-curve-chart.tsx:72` | `Math.min/max(...values)` spread operator in memoized computation | Safe at realistic chart data sizes |
| L5 | `weekly-report-card.tsx:119` | `handleWeekChange` without `useCallback` — nav button handler | Low frequency, not passed to memoized children |
| L6 | `weekly-breakdown.tsx:23` | `maxAbsPnl`/`totalPnl` already correctly `useMemo`'d | Already optimized |
| L7 | `hero-quote-card.tsx` | All derivations are cheap boolean checks from props | Already clean |
| L8 | `simulation-params-form.tsx:34` | `totalIterations`/`budgetUsage` trivial inline arithmetic | Negligible cost per keystroke |
| L9 | `calculator-form.tsx:221` | `strategies.find()` duplicated (also called in parent) | Trivial O(n) on small array |
| L10 | `comparison-stats-table.tsx:146` | `expectancyMode` spurious dep in `metrics` useMemo — metrics don't use it directly | Causes unnecessary recompute on mode toggle but computation is cheap |
| L11 | `auto-refresh-indicator.tsx` | Countdown timer drives 60 React state updates/min for cosmetic display. Could use rAF + ref for direct DOM update | Functional but wasteful — consider if market page feels sluggish |
| L12 | `post-market-notes.tsx` / `pre-market-notes.tsx` | May render disabled `<textarea>` instead of read-only text on historical dates | Verify `isReadOnly` renders display-only elements |

## Round 5 — Final Mop-Up: Journal, Dashboard, MC, Equity Shield, CC, Market, etc.

| # | File | Issue | Why Skipped |
|---|------|-------|-------------|
| L1 | `new-trade-tabs.tsx` | Both `TradeForm` (1654 lines) and `ScaledTradeForm` (1183 lines) always mounted simultaneously — inactive tab hidden via `className="hidden"` | Intentional state-preservation trade-off — unmounting would lose form state |
| L2 | `brand-script.tsx:11` | `brandList` and script string rebuilt on every render | Server component — no client re-renders |
| L3 | `runs-comparison-table.tsx:46` | `columns` useMemo deps include callback props from parent — could recompute if parent doesn't stabilize | Deps are correct; parent stabilization is outside this component's scope |
| L4 | `backtest-content.tsx:158` | `showLoading` before `startTransition` + `hideLoading` inside — potential flicker | Acceptable UX pattern — loading overlay provides feedback |
| L5 | `risk-simulator-content.tsx:104` | useEffect deps broader than necessary (guarded by hasInitialFetchRef) | Ref guard prevents re-execution; fragile but functional |
| L6 | Various Recharts components | Inline `margin`, `tick` objects on chart components that have dynamic deps | Recharts doesn't deeply compare props internally — memoizing these has minimal impact |
| L7 | `monthly-plan-tab.tsx:86` | `handleSave` type-cast `Parameters<typeof upsertMonthlyPlan>[0] extends infer T ? T : never` | Type inference is compile-time only, zero runtime cost |
| L8 | `kpi/avg-r-card.tsx:52` | `subValue` JSX element (`<RMultipleBar>`) constructed inline | Single instance, not list-rendered |
| L9 | `kpi/discipline-card.tsx:25` | `indicator` JSX (`<TrendIcon>`) constructed inline | Single instance, not list-rendered |

---

*Generated 2026-04-25 across 5 performance scan rounds covering ~230+ files.*
