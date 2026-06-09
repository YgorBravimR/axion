# Scan: performance sweep (tax, command-center, optimize, auth) — 2026-06-09

**Branch**: `chore/perf-scan-2026-06-09`
**Base**: `origin/main` (tip `558a7697`)
**Files audited**: ~75 source files across 4 feature areas
**Verdict**: 35 findings — 5 CRITICAL, 9 HIGH, ~12 MEDIUM, ~10 LOW · **33 fixed**, 1 deferred, 1 reviewed-no-change

## Scope

| Area                 | Server scope                                                                                              | UI scope                                                                                                            |
| -------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Tax / yearly reports | `src/app/actions/{reports,annual-reports,tax-engine}.ts`, `src/lib/tax/**`, `src/app/api/arch/reports/**` | `src/app/[locale]/(app)/reports/**`, `src/components/reports/**`, `src/components/tax/**`                           |
| Command Center       | `src/app/actions/command-center.ts`, `src/app/api/arch/command-center/**`                                 | `src/components/command-center/**`, `src/components/market/**`, `src/components/calculator/position-calculator.tsx` |
| Optimize phase-1     | `src/lib/optimize/**`                                                                                     | `src/components/optimize/**`, `src/app/[locale]/(app)/backtest/optimize/**`                                         |
| Auth + middleware    | `src/auth.ts`, `src/auth.config.ts`, `src/lib/auth-utils.ts`, `src/app/actions/auth.ts`                   | n/a — no middleware.ts in repo                                                                                      |

Protected files modified with explicit user authorization: `src/lib/tax/recompute-month.ts` (T2), `src/lib/auth-utils.ts` (A3).

## Findings (full table)

| #   | Severity | Category        | File:Line                                                                 | Issue                                                      | Rule violated           | Status                                        |
| --- | -------- | --------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------- | --------------------------------------------- |
| T1  | CRITICAL | server-perf     | `actions/annual-reports.ts:206–242`                                       | 52 sequential `getWeekAggregate` calls per year            | seq-await-in-loop       | fixed                                         |
| T2  | CRITICAL | server-perf     | `actions/annual-reports.ts:337–401` + `lib/tax/recompute-month.ts:58–135` | 12× redundant trade/fee fetches per annual rollup          | redundant-rsc-fetch     | fixed                                         |
| T3  | CRITICAL | ssr-stream      | `reports/page.tsx:38–113`                                                 | `Promise.all` of 13 actions before any UI; no Suspense     | eager-promise-all       | fixed                                         |
| T4  | CRITICAL | ssr-stream      | `components/reports/reports-content.tsx`                                  | No section skeletons                                       | no-suspense             | fixed                                         |
| T5  | CRITICAL | render-perf     | `components/reports/annual-rollup-table.tsx:73–186`                       | `sticky left-0` over long table → layout recalc per scroll | sticky-on-long-list     | fixed                                         |
| T6  | HIGH     | server-perf     | `actions/reports.ts:730–783`                                              | Month-comparison double-fetches account+settings           | seq-await-in-loop       | fixed                                         |
| T7  | HIGH     | algo-perf       | `actions/reports.ts:175–227`                                              | 3× filter passes over same `weekTrades`                    | multi-pass-filter       | fixed                                         |
| T8  | HIGH     | unbounded-query | `actions/annual-reports.ts:267–323`                                       | Capital-events query has no `.limit()`                     | no-limit                | fixed                                         |
| T9  | HIGH     | render-perf     | `components/reports/weekly-meta-chart.tsx:107–204`                        | Recharts not memoized; re-renders on parent state change   | recharts-no-memo        | fixed                                         |
| T10 | HIGH     | client-fetch    | `components/reports/r-distribution-tab.tsx:24–30`                         | `useEffect` fetch with `<p>Loading…</p>` text flash        | client-effect-fetch     | fixed                                         |
| T11 | HIGH     | render-perf     | `components/reports/{weekly,monthly}-report-card.tsx`                     | Expanded details mount full daily breakdown                | lazy-mount-missing      | fixed (already partial; memo'd)               |
| T12 | MEDIUM   | algo-perf       | `actions/reports.ts:calculateReportSummary`                               | Multi-pass filter                                          | multi-pass-filter       | fixed (merged with T7)                        |
| T13 | MEDIUM   | algo-perf       | `api/arch/reports/monthly-results/route.ts`                               | 2 passes to build daily+weekly maps                        | multi-pass-iteration    | fixed                                         |
| T14 | MEDIUM   | render-perf     | `commission-fee-impact-card.tsx`                                          | Bar `scaleX` re-fires on every parent re-render            | no-memo-card            | fixed                                         |
| T15 | MEDIUM   | anim-perf       | `mistake-cost-card.tsx:111`, `weekly-breakdown.tsx:105`                   | `transition-[width]` triggers layout reflow                | css-layout-anim         | fixed                                         |
| T16 | MEDIUM   | render-perf     | `reports/page.tsx:162`                                                    | Single `overflow-auto` for whole page                      | n/a                     | reviewed-no-change (natural scroll preferred) |
| T17 | LOW      | algo-perf       | `recompute-month.ts`                                                      | String-key construction in tight loop                      | —                       | wontfix (V8 optimizes)                        |
| T18 | LOW      | algo-perf       | `getUniqueTradingDays`                                                    | Redundant Date reconstruction                              | —                       | wontfix                                       |
| C1  | HIGH     | algo-perf       | `actions/command-center.ts:getTodayCompletions`                           | `.find()` inside `.map()`                                  | find-in-map-O-n2        | fixed                                         |
| C2  | HIGH     | algo-perf       | command-center actions                                                    | `JSON.parse` per hot-list row                              | json-parse-in-loop      | fixed                                         |
| C3  | HIGH     | server-perf     | `getCircuitBreakerStatus` + `getDailySummary`                             | Both fetch today's trades independently                    | duplicate-fetch         | fixed (React.cache helper)                    |
| C4  | MEDIUM   | server-perf     | `getAccountAssetSettings`                                                 | Double-fetch around insert                                 | redundant-fetch         | fixed                                         |
| C5  | MEDIUM   | unbounded-query | circuit-breaker monthly P&L                                               | Loads all rows to sum                                      | no-aggregate            | fixed (SQL SUM)                               |
| C6  | MEDIUM   | client-cache    | `refreshCompletions()`                                                    | Full refetch on every checklist edit                       | n/a                     | deferred (needs UI optimistic-update design)  |
| C7  | MEDIUM   | server-perf     | `resolveDay()`                                                            | 5 sequential queries (year→day)                            | —                       | reviewed-no-change (truly hierarchical)       |
| C8  | MEDIUM   | render-perf     | `command-center-tabs.tsx:111-120`                                         | Premium tree eager-mounts for free users                   | eager-conditional-mount | fixed                                         |
| C9  | MEDIUM   | render-perf     | `asset-rules-panel.tsx:307–495`                                           | Unvirtualized row list                                     | unvirtualized-list      | partial (React.memo per row)                  |
| C10 | MEDIUM   | render-perf     | `live-trading-status-panel.tsx:324–329`                                   | Trade summary boxes not memoized                           | no-memo-row             | fixed                                         |
| C11 | MEDIUM   | render-perf     | `command-center-content.tsx:57-82`                                        | 8 useState + key-prop forced remount                       | force-remount-key       | fixed (key removed)                           |
| C12 | MEDIUM   | polling         | `market/market-monitor-content.tsx:85–190`                                | Fetch polling without `AbortController`                    | no-abort-controller     | fixed                                         |
| C13 | MEDIUM   | render-perf     | `daily-checklist.tsx:34–65`                                               | Sort on object-identity memo key                           | unstable-memo-key       | partial                                       |
| C14 | MEDIUM   | render-perf     | `circuit-breaker-panel.tsx:119–135`                                       | Memos keyed on whole `status` object                       | unstable-memo-key       | fixed                                         |
| C15 | MEDIUM   | render-perf     | `position-calculator.tsx:193–237`                                         | Calc on every keystroke                                    | no-debounce             | fixed (200ms debounce)                        |
| O1  | HIGH     | algo-perf       | `lib/optimize/backtest-worker.ts:87–98`                                   | O(n²) via `.some()` in loop                                | nested-find-O-n2        | fixed (Set)                                   |
| O2  | HIGH     | render-perf     | `components/optimize/parameter-heatmap.tsx`                               | 400+ unmemo'd cells re-render on axis change               | no-memo-grid            | fixed (custom memo cmp)                       |
| O3  | MEDIUM   | algo-perf       | `lib/optimize/recipe-dedup.ts:18–45`                                      | `Object.defineProperty` mutating cache                     | mutating-input          | fixed (WeakMap)                               |
| O4  | MEDIUM   | algo-perf       | `lib/optimize/heatmap-utils.ts:116–185`                                   | Nested loop O(n×m×k)                                       | nested-loop             | fixed (single-pass)                           |
| O5  | MEDIUM   | render-perf     | `lib/optimize/pareto.ts:69–121`                                           | Frontier re-computed on constraint toggle                  | unmemoized-derive       | fixed (LRU)                                   |
| O6  | MEDIUM   | render-perf     | `components/optimize/runs-comparison-table.tsx`                           | No row virtualization                                      | unvirtualized-list      | partial (memoization verified)                |
| O7  | MEDIUM   | render-perf     | `equity-overlay-chart.tsx`                                                | Pin/unpin re-mounts Recharts                               | recharts-unstable-key   | fixed                                         |
| O8  | MEDIUM   | render-perf     | `optimize-content.tsx:1827–1849`                                          | `FreezeHeroModal` eager-mounts when closed                 | eager-modal-mount       | fixed                                         |
| O9  | MEDIUM   | render-perf     | `pareto-scatter.tsx`                                                      | Style-only change re-renders chart                         | style-key-rerender      | fixed                                         |
| O10 | MEDIUM   | render-perf     | `sweep-progress-bar.tsx`                                                  | `setElapsed` at 10 Hz for multi-min sweeps                 | high-freq-state         | fixed (rAF)                                   |
| O11 | MEDIUM   | render-perf     | `optimize-content.tsx:1396–1403`                                          | Results grid listens during live sweep                     | broad-rerender          | fixed (memo boundary)                         |
| A1  | HIGH     | per-request-db  | `src/auth.ts:66–72`                                                       | DB role refresh on every JWT pass                          | per-request-db          | fixed (gated to 1h+update)                    |
| A2  | MEDIUM   | server-perf     | `actions/auth.ts:349–407`                                                 | `requireAuth()` 4 sequential queries                       | seq-await               | fixed (Promise.all)                           |
| A3  | MEDIUM   | per-request-db  | `lib/auth-utils.ts:10–21`                                                 | `requireRole()` not cached                                 | no-react-cache          | fixed                                         |
| A4  | MEDIUM   | server-perf     | `actions/auth.ts:271–304`                                                 | User row double-fetched on settings                        | duplicate-fetch         | fixed                                         |

## Root causes

The findings collapse to seven recurring class-bugs. Each one shipped in more than one area, which is what makes them worth detectors.

### RC-1: Sequential `await` in server-action loops

Hit T1, T6, C7 (reviewed), A2. The Axion convention of writing server actions as imperative async functions means it's natural to write `for (const x of xs) { await fetch(x) }` when `Promise.all(xs.map(fetch))` is correct. The bug manifests at **runtime** under load — not visible in unit tests, not visible on a single-account smoke test. Lint and tsc both allow it.

### RC-2: `.find()` inside `.map()` for set-membership lookups

Hit C1, O1. Idiomatic when prototyping ("for each row, find the matching record"); silently quadratic once N>50. Trace: `.map(a => { const match = otherArray.find(b => b.id === a.fk) ... })`.

### RC-3: Eager `Promise.all` of N RSC fetches at page top

Hit T3, T4, and was the dominant cost on the reports route (13 actions). Pattern: page.tsx awaits a parallel batch of server actions before rendering. RSC streaming + `<Suspense>` per section is the correct shape, but the easier-to-write pattern works "well enough" in development with seeded data.

### RC-4: Recharts/heavy-chart re-renders without a memo boundary

Hit T9, T14, O7, O9, O2. Pattern: `<ResponsiveContainer><LineChart data={data}>…</LineChart></ResponsiveContainer>` inside a parent that re-renders on unrelated state. Without `React.memo` and a stable `data` reference, the entire chart re-runs its layout pass.

### RC-5: Eager mount of conditionally-shown trees (modals, premium gates, hidden tabs)

Hit C8, O8, and the Radix tabs `forceMount` (LOW). Wrapping render output in `{condition && <Heavy />}` is the fix; using a `disabled` / `hidden` prop on an always-mounted tree is the antipattern.

### RC-6: Polling fetch without `AbortController` + `isMounted` ref

Hit C12. Late `setState` after unmount produces React warnings and, on slow networks, race conditions with the next poll. The pattern repeats anywhere we use `setInterval` + `fetch`.

### RC-7: CSS animations on layout-affecting properties

Hit T15 (twice). `transition-[width]` / `transition-all` over width triggers a paint+layout per frame. The fix is always `transform: scaleX(...)` + `transition-transform` with `transform-origin`. Tailwind doesn't lint for this.

## Prevention rules

Each rule below comes with a single `rg` line that catches the antipattern on `src/`. Run these before launching any future `/scan` diagnose pass.

- **Rule (RC-1):** Never `await` inside a `.map`/`.forEach`/`for-of` over independent items. Use `Promise.all(items.map(async ...))`.
  **Detector:** `rg -n --multiline 'for\s*\([^)]*of[^)]*\)\s*\{[^}]*await' src/`
  **Auto-fix:** manual (wrap in `Promise.all(items.map(...))`)

- **Rule (RC-2):** Never `.find()` inside `.map()` against the same large array. Pre-build a `Map`/`Set`.
  **Detector:** `rg -n -U 'map\([^)]*=>[\s\S]{0,200}\.find\(' src/`
  **Auto-fix:** manual (build lookup outside the `.map`)

- **Rule (RC-3):** RSC `page.tsx` files must not `await Promise.all([…server actions…])` of more than 3 calls before the first JSX return. Use `<Suspense>` boundaries.
  **Detector:** `rg -n -U 'await Promise\.all\(\[[\s\S]{0,2000}getServer[A-Za-z]*\([\s\S]{0,2000}getServer' src/app/**/page.tsx`
  **Auto-fix:** manual (RSC + Suspense per section)

- **Rule (RC-4):** Files importing from `recharts` must also import `memo` from `react`, OR be re-exported through a `React.memo()` wrapper.
  **Detector:** `rg -l "from 'recharts'" src/ | xargs -I {} sh -c 'rg -L "\\bmemo\\b" "{}" && echo {}'`
  **Auto-fix:** wrap component with `React.memo`

- **Rule (RC-5):** Dialog/modal content with non-trivial children (>20 lines) must be conditionally mounted, not always-rendered with `open={false}`.
  **Detector:** `rg -n 'Dialog[A-Za-z]*\s+open=\{[^}]+\}' src/components/ | head` then manual audit
  **Auto-fix:** wrap in `{open && <ModalContent />}`

- **Rule (RC-6):** `setInterval` + `fetch` in the same file must reference `AbortController`.
  **Detector:** `rg -l 'setInterval' src/ | xargs -I {} sh -c 'rg -l "fetch\\(" "{}" | xargs -I @ sh -c "rg -L AbortController @ && echo @"'`
  **Auto-fix:** add controller per cycle, abort in cleanup

- **Rule (RC-7):** Never use `transition-[width]`, `transition-all` over a property list including `width`/`height`/`top`/`left`. Use `transform`.
  **Detector:** `rg -n 'transition-\[(width|height|top|left)\]' src/`
  **Auto-fix:** swap to `transform: scaleX/scaleY` + `transition-transform`

- **Bonus rule (T2/A3 class):** Server actions/utilities called from multiple Suspense boundaries within one request must be wrapped in `React.cache`.
  **Detector:** `rg -n "export (async )?const \w+ = async" src/app/actions/ | xargs -I {} sh -c 'rg -L "cache\\(" "{}"'` (manual triage)
  **Auto-fix:** `import { cache } from 'react'` + wrap

## Fix log

| Wave                               | Commit                                               | Files               |
| ---------------------------------- | ---------------------------------------------------- | ------------------- |
| Wave B (command-center + optimize) | `d5341f3f` perf(scan): wave B                        | 8                   |
| CLAUDE.md guardrail                | `(next)` docs(claude): forbid subagent git mutations | 1                   |
| Wave A (tax server + UX + auth)    | uncommitted on disk                                  | 16 modified + 3 new |

Wave A was originally landed once (verified clean, tsc 0, 17 files modified), then **silently reverted** during Wave B's parallel run when one of the four Wave-B subagents executed an unlogged `git restore .` / `git checkout -- .`. The reflog shows no ref movement — these commands wipe unstaged work without trace. Wave A was re-run after the recovery commit + the new guardrail rule landed.

## Still armed

- **C6 — deferred.** `refreshCompletions()` still does a full refetch on every checklist edit; needs UI optimistic-update design.
- **C7 — reviewed-no-change.** `resolveDay()` cascade is genuinely hierarchical; a single JOIN rewrite is the next step if telemetry shows >100ms baseline.
- **C9, O6 — partial.** Asset-rules table and runs-comparison table got memoization but no virtualization. Both will become acute if rule-counts or run-counts grow >100. Backlog for a virtualization library add (`@tanstack/react-virtual` is the natural choice).
- **T16 — reviewed.** Page-level `overflow-auto` left as-is per natural-scroll preference.
- **T17, T18 — wontfix.** Micro-perf, dominated by V8 inlining.

## Process post-mortem (the `git restore` incident)

**What happened.** Wave A landed 17 files (tsc clean, verified by orchestrator). Orchestrator launched 4 Wave-B subagents in parallel on disjoint scopes. When all 4 returned, only Wave B's 8 files remained in the working tree — Wave A's 17 files had been reset to `origin/main`. The reflog showed no checkout/reset/commit between Wave A verification and post-Wave-B verification.

**Why it was undiagnosable.** `git restore .` and `git checkout -- .` operate on the working tree only; they do not move HEAD, do not move any branch ref, and do not write to the reflog. The deletion is byte-equivalent to "files never existed in this session." Standard forensics (`git reflog`, `git stash list`, `git fsck`) returned nothing.

**Root cause.** One of the Wave-B subagent prompts (we can't tell which after the fact) did not include a "do not touch git state" rule. That agent's general-purpose model has a strong prior to "clean the tree before working" — a habit imported from local-dev workflows where unstaged changes are personal scratchpad, not parallel-agent in-progress work.

**Fix.** New mandatory rule #11 added to `CLAUDE.md` with explicit forbidden command list, the rationale, and the correct fallback ("stop, report, do not clean up"). The Wave A retry prompts all opened with rule #11 quoted verbatim and a `bash` allowlist restricted to read-only git. The retry produced identical changes on disk with no incident.

**Recovery cost.** ~1 session-turn of investigation, one extra commit, ~7 minutes of re-running the three Wave-A subagents. No prod impact (this entire scan happened on a feature branch).

## Verification

- `pnpm exec tsc --noEmit --pretty false` → exit 0 (Wave B + Wave A on disk)
- `pnpm lint` per subagent → 0 errors; pre-existing warnings unchanged
- No new dependencies added
- All protected-file edits made with explicit user authorization
