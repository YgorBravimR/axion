# Scan: Reports, Plans & Simulations — Performance — 2026-06-02

**Branch**: `feat/optimize-phase-1-trust-foundations`
**Base**: `origin/main` @ `4a76ab6f`
**HEAD**: `89d0cf7d`
**Files audited**: ~85 source files across `src/app/[locale]/(app)/{reports,plan,risk-simulation}`, `src/components/{reports,fractal-plan,risk-simulation}`, and related `src/app/actions/*`
**Verdict**: 8 critical / 14 high / 12 medium / 26 low → **15 fixed**, **4 deferred (correct)**, **4 deferred (audit wrong)**, **26 deferred (low/cosmetic)**, **1 deferred (structural — backlog)**

## Findings (full table)

### Critical

| #   | Severity | Category        | File:Line                                                       | Issue                                                                                 | Rule violated                                               | Status                                                                                                                                                               |
| --- | -------- | --------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | critical | RSC streaming   | `src/app/[locale]/(app)/reports/page.tsx:38-113`                | 14 fetches awaited in one `Promise.all`; all data passed to a single client component | No Suspense streaming on a tabbed dashboard                 | **deferred** — requires breaking `ReportsContent` into per-section RSC subcomponents (structural refactor comparable to S2); dominant TTI win already captured by R2 |
| R2  | critical | N+1             | `src/app/actions/annual-reports.ts:218` (`getWeeklyMetaVsReal`) | 52 weeks awaited sequentially                                                         | Sequential `await` in loop where iterations are independent | **fixed** — pre-compute week metadata, then `Promise.all` aggregates                                                                                                 |
| R3  | critical | N+1             | `src/app/actions/annual-reports.ts:367` (`getAnnualRollup`)     | 12 months awaited sequentially                                                        | Sequential `await` in loop                                  | **deferred (correct)** — `runningPatrimonio` at line 394 carries balance forward; iterations have real data dependency                                               |
| F1  | critical | Bundle          | `plan/[year]/page.tsx:21-24`                                    | 4 tab components (Tax/Weekly/Payoff/Exit) eagerly imported, only 1 visible            | Eager import of inactive tab content                        | **fixed** — created 4 `.lazy.tsx` client wrappers using `next/dynamic({ ssr: false })`; page imports wrappers                                                        |
| F2  | critical | Re-render       | `cockpit/annual-cockpit-grid.tsx:108-255`                       | 12 `MonthCard` children re-render on any parent prop change                           | Missing `React.memo` on hot-list child                      | **fixed** — `MonthCard` wrapped with `memo()`                                                                                                                        |
| F3  | critical | Data fetching   | `plan/[year]/page.tsx:282-295`                                  | `yearTrades` query runs sequentially after `Promise.all` block                        | Independent query outside parallel block                    | **fixed** — moved into existing `Promise.all`                                                                                                                        |
| S1  | critical | Bundle          | `risk-simulation/equity-curve-overlay.tsx:4`                    | `recharts` imported eagerly; only used when `result !== null`                         | Heavy chart lib eagerly loaded                              | **fixed** — `next/dynamic({ ssr: false })` at the call site in `risk-simulation-content.tsx`                                                                         |
| S2  | critical | Client boundary | `risk-simulation-content.tsx:1`                                 | Entire subtree marked `"use client"`                                                  | RSC opportunities behind a shallow client boundary          | **deferred (backlog)** — route-level refactor; S5 already captures the dominant modal-bundle win and Group C memos remove the re-render storm justification          |

### High

| #   | Severity | Category       | File:Line                                          | Issue                                                                                             | Rule violated                                                | Status                                                                                                                                                                                                                               |
| --- | -------- | -------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R4  | high     | Memoization    | `reports/capital-event-log.tsx:162`                | `.reverse()` mutates and returns new ref every render                                             | Mutating + un-memoized in render                             | **fixed** — `.toReversed()` (ES2023) inside `useMemo`                                                                                                                                                                                |
| R5  | high     | Memoization    | `reports/capital-event-log.tsx:73`                 | `.filter()` unmemoized                                                                            | Un-memoized derived list                                     | **fixed** — `useMemo([events, year])`                                                                                                                                                                                                |
| R6  | high     | Bundle         | `reports/weekly-meta-chart.tsx:6-17`               | recharts (~80 KB pre-tree-shake) imported eagerly                                                 | Heavy chart lib                                              | **fixed** — chart rendering extracted to new `weekly-meta-chart-renderer.tsx` and loaded via `next/dynamic`                                                                                                                          |
| R7  | high     | Memoization    | `reports/weekly-meta-chart.tsx:86-93`              | `chartData` mapped every render                                                                   | Un-memoized derived data                                     | **fixed (superseded)** — chart logic moved to renderer file in R6                                                                                                                                                                    |
| R9  | high     | N+1            | `reports.ts:467-500` (`getMistakeCostAnalysis`)    | Audit reported per-trade tag lookups                                                              | (premise wrong)                                              | **deferred (audit wrong)** — function already uses `inArray(tradeTags.tagId, tagIdsList)` batch at line 451                                                                                                                          |
| R10 | high     | Data shape     | `reports.ts:576-621` (`getCommissionFeeImpact`)    | Audit reported 6-pass trade scan                                                                  | (premise wrong)                                              | **deferred (audit wrong)** — function is already a single-pass loop with `Map` aggregation; no DB calls in loop                                                                                                                      |
| F4  | high     | Memoization    | `cockpit/month-card.tsx:137-408`                   | `bars`, `deltaCents`, `deltaPct`, `monthlyR`, `monthlyNetCents` recomputed each render            | Un-memoized derived state in a hot-list child                | **fixed** — each wrapped in `useMemo` with correct deps                                                                                                                                                                              |
| F5  | high     | RSC            | `cockpit/setup-summary-card.tsx:1`                 | Audit: convert from `"use client"` to RSC                                                         | (premise wrong)                                              | **deferred (audit wrong)** — component genuinely needs client (useState/useEffect/useTranslations/slideover toggle); display-only refactor would split section header for no measurable win                                          |
| F6  | high     | Serialization  | `plan/[year]/page.tsx:489-508`                     | Audit: pass primitives to `SetupSummaryCard` instead of full arrays                               | (premise wrong)                                              | **deferred (audit wrong)** — `ladderRules` is consumed by `computeLadderRunway()` in render; `riskProfiles` is required by `YearlyPlanSlideover` editor child                                                                        |
| F7  | high     | N+1            | `cockpit/quarter-report.tsx:87-92`                 | Audit reported 3 sequential monthly queries                                                       | (premise wrong)                                              | **deferred (audit wrong)** — already `Promise.all(months.map(...))` at line 179                                                                                                                                                      |
| S3  | high     | State shape    | `risk-simulation-content.tsx:54-68`                | Monolithic `result` causes full-tree re-renders                                                   | Render storm on a heavy subtree                              | **deferred (defeated)** — Group C wrapped `SummaryCards`, `TradeComparisonTable`, `DecisionTraceModal`, `SkippedTradesWarning` in `React.memo`; `result` only changes on Run click, so the cascade no longer fires                   |
| S4  | high     | Input handling | `risk-params-form.tsx:71,129,163`                  | Every keystroke calls `onParamsChange={setParams}`                                                | Unnecessary parent state churn on input                      | **deferred (anti-pattern risk)** — `useTransition` on the setter would defer the controlled input's own displayed value (input lag). Clean fix requires lifting form state to local (commit-on-blur) — form/parent contract redesign |
| S5  | high     | Bundle         | `risk-simulation/decision-trace-modal.tsx:1`       | Heavy modal tree always in DOM                                                                    | Modal eagerly imported                                       | **fixed** — `next/dynamic({ ssr: false })` at call site; modal only mounts when `traceModalOpen && result`                                                                                                                           |
| S6  | high     | Memoization    | `risk-simulation/trade-comparison-table.tsx:71-79` | Table re-renders on unrelated parent state                                                        | Missing `React.memo`                                         | **fixed** — wrapped with `memo()`; `paginatedTrades`/`activeStatuses` already memoized                                                                                                                                               |
| S7  | high     | Memoization    | `risk-simulation/summary-cards.tsx:45`             | 6 cards re-render on unrelated parent state                                                       | Missing `React.memo` on child + `ComparisonRow` subcomponent | **fixed** — both wrapped                                                                                                                                                                                                             |
| S8  | high     | Memoization    | `risk-simulation/day-trace-card.tsx:111`           | 100+ cards re-render on modal page change                                                         | Missing `React.memo` on hot-list child                       | **fixed** — `DayTraceCard` + `TradeFlowItem` both wrapped                                                                                                                                                                            |
| S9  | high     | N+1            | `risk-simulation.ts:159-177`                       | 3N sequential awaits per unique asset (`getAssetBySymbol` → `getAssetFees` → `getBreakevenTicks`) | Sequential per-asset query chain                             | **fixed** — two-phase parallelization (resolve assets in `Promise.all`, then fetch fees+ticks in `Promise.all` per asset)                                                                                                            |

### Medium / Low

All medium and low items deferred — out of approved fix scope (Critical + High). Full list lives in the three raw agent reports captured in the session transcript. Spot-check candidates for next pass: F8 (582-line page extraction), F11 (barrel imports from `@/components/ui`), F12 (TZ-naive `new Date()` in `plan/[year]/page.tsx` — should use existing `getServerEffectiveNow()` helper), S11 (table virtualization with `@tanstack/react-virtual`).

## Root causes

### Eager bundling of heavy client deps (recharts, modals, tab content)

`recharts` is in `next.config.ts` `optimizePackageImports` (tree-shaken), but the package is still eagerly downloaded and parsed when imported at the top of a route. The codebase had **zero** existing `next/dynamic` usage before this scan — the team was relying on tree-shaking alone, which doesn't defer parse/eval. The fix introduced the `next/dynamic` pattern (with `.lazy.tsx` client wrappers when the call site is RSC, since `{ ssr: false }` requires a client component).

**When it manifests**: at every route load that doesn't immediately render the heavy widget (modal closed, tab inactive, results-not-yet-computed). Cost is parse + eval of dead bundle bytes, which inflates TTI and Total Blocking Time.

**Anti-pattern signature**: a top-level `import { ... } from "recharts"` (or any heavy widget lib) in a component that conditionally renders the widget. Detector below.

### Sequential `await` in loops over independent items

Three independent server actions (R2, S9 confirmed; R3 has a real data dep so it stays) iterate `for (...) { const x = await ... }` instead of `Promise.all`. For a 52-week loop, sequential cost compounds with the DB roundtrip — most of the wall-clock budget is wasted idle. The R9/R10 audit findings were false positives because the code was already batched — so the **real bug class is narrower** than the audit suggested, but it does exist (R2 was real and very expensive).

**When it manifests**: in `for...of` / `forEach` blocks containing `await` where each iteration is independent. **Manual verification needed before applying** — many loops carry forward state (running totals, ledgers, cumulative balances) and cannot be parallelized (R3 was correctly deferred for this reason).

**Anti-pattern signature**: `for (...) { ... await ... }` and `.map(async ... )` where the result is then awaited inline.

### Missing `React.memo` on hot-list children

The fractal-plan annual cockpit renders 12 month cards each frame the parent updates. Risk-sim renders 100+ day-trace cards in a modal. These are exactly the cases where `React.memo` pays off — and exactly the cases where the codebase didn't use it. Five components got `memo()` wraps in this scan (MonthCard, TradeComparisonTable, SummaryCards, ComparisonRow, DayTraceCard, TradeFlowItem).

**Caveat surfaced during fix**: `React.memo` only short-circuits when parent props are referentially stable. Inline objects/callbacks defeat it. Group C verified the parent `annual-cockpit-grid` passes stable props before wrapping — that verification step must be part of any future `React.memo` work.

**When it manifests**: on parent re-render from unrelated state (date picker, modal toggle, page change) while the data feeding the list is unchanged.

### Audit-driven anti-pattern: don't trust line-snippet findings without reading the file

Four "high" findings (R9, R10, F5, F6, F7) had **wrong premises** — the audit agent flagged code based on the line range, but the actual function/component already did the right thing or genuinely required the "anti-pattern" shape. This wasted no production effort because Group B/C verified before applying, but it consumed agent budget.

**Mitigation**: in future scans, the diagnose agent should be prompted to **read the full function and confirm the premise** before reporting a finding, not just flag the line range.

## Prevention rules

- **Rule**: Never import a heavy chart/widget library (`recharts`, `@tanstack/react-virtual`, modal trees, slideovers) eagerly at the top of a route or page-level component. Use `next/dynamic({ ssr: false })`. If the call site is RSC, create a `.lazy.tsx` client wrapper.
  **Detector**: `rg -n 'from "recharts"' src/components src/app | rg -v '\.lazy\.tsx|next/dynamic'`
  **Auto-fix**: manual — depends on whether the call site is RSC or client.

- **Rule**: No `for ... { ... await ... }` over independent items in a server action. Use `Promise.all` (chunked if the DB pool is small).
  **Detector**: `rg -nA 3 'for \(.*\) \{' src/app/actions | rg -B 1 'await'` (manual review needed — false positives on dependent loops are common).
  **Auto-fix**: manual — verify no inter-iteration state dependency before parallelizing.

- **Rule**: Any component rendered in a list of >5 with a complex render body should be wrapped in `React.memo`. Verify the parent passes referentially stable props (no inline `{...}` / `[...]` / `() => ...` to the memoized child).
  **Detector**: `rg -nB 2 '\.map\(\(.*\) =>' src/components | rg -A 3 '<[A-Z]'` (heuristic — flags lists of components).
  **Auto-fix**: manual — `React.memo` is misleading without parent prop stability audit.

- **Rule**: Don't `useTransition` on the setter of a controlled input's `value` prop. It defers the visible character and feels like keystroke lag. Defer downstream effects (computation, fetch, derived state) instead.
  **Detector**: `rg -nB 3 -A 3 'useTransition' src/components | rg 'setState|setValue|setParams' | rg 'value=\\{'` (heuristic).
  **Auto-fix**: manual — requires form architecture decision.

- **Rule**: Audit findings on file:line are **starting points**, not action items. Always read the full enclosing function and confirm the premise before applying a fix. False-positive rate observed in this scan: ~30% on "high" findings.
  **Detector**: process rule, not greppable.
  **Auto-fix**: N/A.

## Fix log

| Order | Group        | Items                      | Files touched                                                                                                                                                                                                      |
| ----- | ------------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | A (parallel) | R6, F1, S1, S5             | `weekly-meta-chart.tsx`, `weekly-meta-chart-renderer.tsx` (new), `plan/[year]/page.tsx`, `cockpit/{tax-tab,weekly-grid-tab,payoff-matrix-tab,exit-convention-tab}.lazy.tsx` (4 new), `risk-simulation-content.tsx` |
| 2     | B (parallel) | R2, F3, S9                 | `actions/annual-reports.ts`, `plan/[year]/page.tsx`, `actions/risk-simulation.ts`                                                                                                                                  |
| 3     | C (parallel) | R4, R5, F2, F4, S6, S7, S8 | `capital-event-log.tsx`, `month-card.tsx`, `trade-comparison-table.tsx`, `summary-cards.tsx`, `day-trace-card.tsx`                                                                                                 |
| 4     | post-fix     | tax-tab.lazy type drift    | `tax-tab.lazy.tsx` (`"proprietary"` → `"prop"` to match real `TaxTab` type)                                                                                                                                        |

## Still armed

Items the next scan should target:

- **R1**: reports page still loads all 14 sections in one `Promise.all`. Streaming would help once `ReportsContent` is split into per-section subcomponents. Track in `docs/backlog.md`.
- **S2**: risk-simulation content is `"use client"` at the root. RSC extraction is a route-level refactor — defer until next perf pass.
- **S4**: form keystrokes still churn parent state. Clean fix needs commit-on-blur (form-level state lift). Track in `docs/backlog.md`.
- **F8**: `plan/[year]/page.tsx` is 582 lines. Extracting `YearDataProvider` / `MonthAggregator` / `ProjectionSummary` would help maintenance and unlock more parallelism.
- **F11**: barrel imports from `@/components/ui` may be defeating tree-shaking. Audit with `pnpm build --analyze` if available.
- **F12**: `new Date()` is used in `plan/[year]/page.tsx` instead of `getServerEffectiveNow()`. Recurring Axion footgun (TZ-naive Date against `timestamptz`) — should be a future Phase 0 detector.
- **S11**: `trade-comparison-table.tsx` paginates at 25 rows. For datasets >500 trades, virtualization (`@tanstack/react-virtual`) would help — but only after Phase 1 wins are validated in production.
- ~~**Out-of-scope pre-existing**: monte-carlo `formatNumber` error~~ — initial misread of a `head`-truncated `git diff`. The destructure is correctly inside `EdgeExpectancyContent` (line 256); typecheck is clean. **Lesson**: don't diagnose TS scope errors from truncated diffs — read the full file.

## Verification

- `pnpm exec tsc --noEmit` → **0 errors** (initial false-positive on `monte-carlo-content.tsx` was a misread of a truncated diff; the file is correct)
- `git diff --stat` → 32 files (15 in-scope + 17 pre-existing uncommitted branch WIP, untouched by this scan)
- No lint run (scan policy: orchestrator does verification, not category-level lint runs)
- No commit (per `/scan` policy — user decides commit boundaries)
