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

---

*Generated 2026-04-24 across 4 performance scan rounds covering ~160+ files.*
