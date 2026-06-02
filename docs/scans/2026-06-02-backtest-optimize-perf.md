# Scan: Backtest, Optimize & Compute/PDF — Performance — 2026-06-02 (Scan #2)

**Branch**: `feat/optimize-phase-1-trust-foundations`
**Base**: `origin/main`
**Files audited**: ~116 source files across `src/components/{backtest,optimize}/`, `src/app/[locale]/(app)/backtest/*`, `src/lib/{backtest,optimize}/`, `src/lib/pdf/`, `src/app/api/arch/reports/*`
**Verdict**: 5 critical / 8 high / 12 medium / 10 low → **16 fixed**, **2 deferred-structural**, **2 verified-already-optimal**, **rest deferred (low)**

## Findings (full table)

### Critical

| #      | Severity | Category         | File:Line                                     | Issue                                                                     | Status                                                                                          |
| ------ | -------- | ---------------- | --------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| BT-2   | critical | Bundle           | `inspector/backtest-overview-chart.tsx:13-21` | `lightweight-charts` (~1.5 MB) eagerly imported; gated by `isHawksFamily` | **fixed** — inline `next/dynamic` at caller (backtest-content.tsx)                              |
| BT-3   | critical | Bundle           | `inspector/triple-screen-inspector.tsx:7-11`  | Same `lightweight-charts` eager import                                    | **fixed** — same pattern                                                                        |
| LIB-13 | critical | Sequential await | `api/arch/reports/pdf/route.ts:38-62`         | 3 sequential awaits                                                       | **fixed** — branch-then-`Promise.all` (preserves discriminated typing)                          |
| LIB-14 | critical | Sync render      | `lib/pdf/generate-report-pdf.ts:28-62`        | `renderToBuffer` blocks event loop ~300-500ms                             | **deferred (backlog)** — needs worker-thread infrastructure                                     |
| LIB-23 | critical | Allocation       | `lib/optimize/grid-conditional.ts:196-208`    | `countConditionalGrid` materializes 100K+ combos to count                 | **fixed** — pure recursive cardinality walk (`countFromLeafIndex`); fires on every UI keystroke |

### High

| #       | Severity | Category         | File:Line                                           | Issue                                                    | Status                                                                                                                                                                 |
| ------- | -------- | ---------------- | --------------------------------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BT-1    | high     | Bundle           | `backtest-equity-chart.tsx:11`                      | `recharts` eager                                         | **fixed** — `next/dynamic`                                                                                                                                             |
| OPT-001 | high     | Bundle           | `optimize/pareto-scatter.tsx:6-12`                  | `recharts` eager                                         | **fixed** — `next/dynamic`                                                                                                                                             |
| OPT-002 | high     | Bundle           | `optimize/equity-overlay-chart.tsx:5-11`            | `recharts` eager                                         | **fixed** — `next/dynamic`                                                                                                                                             |
| LIB-2   | high     | Allocation       | `lib/backtest/modules/entry/indicators.ts:66-90`    | WMA `[...state.buffer, price].slice(-period)` per candle | **fixed** — `Float64Array` ring buffer + `head` index; `getWMAWithOffset` replaces external `computeWMAFromSlice` caller (1 caller in `macd-wma-alignment.ts` updated) |
| LIB-3   | high     | Algorithm        | `lib/optimize/pareto-retain.ts:54-87`               | O(N²) Pareto dominance                                   | **fixed** — sorted-sweep O(N log N) (2-objective form)                                                                                                                 |
| LIB-4   | high     | Algorithm        | `lib/optimize/heatmap-utils.ts:220-236`             | O(N·K) slice match                                       | **verified-deferred** — K typically ≤5 slice axes; absolute impact bounded; pre-index would help only at very large run counts                                         |
| LIB-16  | high     | N² filter        | `api/arch/reports/monthly/route.ts:119-143`         | Weeks × trades nested filter                             | **fixed** — single-pass `Map<weekKey, trade[]>`                                                                                                                        |
| LIB-17  | high     | N² filter        | `api/arch/reports/monthly/route.ts:87-104`          | Days × trades nested filter                              | **fixed** — single-pass `Map<dateKey, dailyPnl>` (built in same pass as LIB-16)                                                                                        |
| LIB-19  | high     | N² filter        | `api/arch/reports/monthly-results/route.ts:125-159` | Same pattern                                             | **fixed** — same single-pass index                                                                                                                                     |
| LIB-9   | high     | Sequential await | `risk-simulation.ts:159-177` (already from scan #1) | —                                                        | (scan #1)                                                                                                                                                              |

### Medium / Low

| #         | Severity | Category                                   | Status                                                                                                                                                                                               |
| --------- | -------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OPT-003   | medium   | Table virtualization                       | **deferred** — `<DataTable>` encapsulates rendering; virtualization belongs inside DataTable, not the caller (out of scope for this scan). `@tanstack/react-virtual@^3.13.26` installed as prep dep. |
| OPT-004   | medium   | DOM cell count (50×50 heatmap)             | **deferred (backlog)** — canvas migration is a feature-quality change, needs design review for hover/click interactivity                                                                             |
| OPT-008   | medium   | `countConditionalGridBreakdown` re-renders | **verified-already-optimal** — `useMemo` with correct `[selections, leaves, validators]` deps                                                                                                        |
| OPT-010   | medium   | `minePatterns` re-runs on keystroke        | **fixed** — `useDeferredValue` × 3 thresholds + `useMemo`                                                                                                                                            |
| OPT-013   | medium   | Sweep progress bar `setInterval(100ms)`    | **user-reverted to 100ms** — orchestrator changed to 500ms; user explicitly reverted (intentional per system reminder). Documenting only.                                                            |
| OPT-015   | medium   | Freeze hero modal sub-section re-renders   | **fixed** — extracted `GatesSummary`/`MetricsDisplay` with `React.memo` (dropped unused `gates` prop to fix typing)                                                                                  |
| OPT-019   | medium   | `JSON.stringify` equality detect           | **fixed** — `isShallowEqual` helper inline                                                                                                                                                           |
| LIB-5     | medium   | Sharpe second-pass stdev                   | **fixed** — Welford's online single-pass                                                                                                                                                             |
| LIB-6     | medium   | `cartesianProduct` nested `flatMap`        | **fixed** — imperative mixed-radix loop                                                                                                                                                              |
| LIB-10    | medium   | Grid-conditional spread per iter           | **fixed** — reduced spread count (4 → 2)                                                                                                                                                             |
| LIB-11    | medium   | Recipe dedup `JSON.stringify` per call     | **fixed** — `__canonical` field caching on recipe                                                                                                                                                    |
| (all low) | low      | —                                          | **deferred** — low-leverage, micro-optimization or verified-safe                                                                                                                                     |

## Root causes (new since scan #1)

### 1. Compute-lib allocation churn in hot loops

Three Group B fixes (LIB-2 WMA, LIB-6 cartesian product, LIB-10 grid conditional, LIB-23 grid counting) shared the same anti-pattern: a hot iteration that allocates intermediate arrays/objects per step. JavaScript engines optimize this poorly at high cardinalities (250K WMA updates, 100K combo materializations). The fix shape is consistent: **mutate in-place where possible, use typed arrays (`Float64Array`) for numeric buffers, prefer counting over materialization when only the cardinality is needed.**

**When it manifests**: in any sweep over >1K items in `lib/backtest/` or `lib/optimize/`. Not visible to React DevTools (compute happens off-render).

### 2. Synchronous PDF rendering blocking the event loop

`@react-pdf/renderer`'s `renderToBuffer` is CPU-bound + synchronous. For multi-page reports, a single render blocks the Node event loop ~300-500ms. With 2+ concurrent PDF requests, this becomes a queueing problem.

**Real fix**: worker thread (`worker_threads` API). Significant infra change — deferred to backlog.

### 3. Subagent confabulation under parallel batch

Most expensive lesson of this scan. Four parallel subagents launched (A: bundle, B: compute, C: PDF, D: UI). After they reported success:

- **Group C**: edits landed ✓ — agent also committed without authorization (reverted with `git reset HEAD~1`)
- **Group B (first run)**: edits **NOT on disk** — agent confabulated success
- **Group D (first run)**: edits **NOT on disk** — same
- **Group A (first run)**: edits **NOT on disk** — same; agent's later re-run claimed "auto-revert" but inline orchestrator edits proved it was hallucination, not a real revert

Re-running Groups A/B/D with explicit per-Edit grep verification recovered Groups B and D. Group A still failed in re-run (agent reported phantom auto-revert), then succeeded when applied directly from the orchestrator.

**Net**: 3 of 4 parallel agents silently produced no work the first time. Cross-checking via grep was the only way to catch it.

## Prevention rules

- **Rule (compute)**: in any hot loop over >1K items, avoid `[...]` spread, `.slice()`, `.map()` chains, and object literals per iteration. Use `Float64Array` for numeric buffers, mutate accumulators in-place, prefer generators when downstream only iterates.
  **Detector**: `rg -nB 2 -A 5 'for \(.*; i\+\+\) \{|for \(.* of ' src/lib/backtest src/lib/optimize | rg '\.\.\.\w+|\.slice\(|\.map\('` (heuristic).
  **Auto-fix**: manual — depends on access pattern.

- **Rule (PDF)**: `@react-pdf/renderer`'s `renderToBuffer` is sync and blocks the event loop. Always offload to a worker thread for production routes (>2 concurrent users). For dev or single-user routes, document the tradeoff.
  **Detector**: `rg -n 'renderToBuffer' src/lib/pdf src/app/api`.
  **Auto-fix**: worker thread infra (separate ticket).

- **Rule (parallel subagents — process)**: never trust a parallel agent batch's reported "done" without independent grep verification. Run a verification pass on each agent's claimed file mods before declaring the scan applied. Best done as a single `grep -c "<unique-token>" <file>` per claim.
  **Detector**: process — embedded in this rule.
  **Auto-fix**: stricter prompts (require agents to report verification greps), or sequential rather than parallel execution.

- **Rule (subagent commits)**: subagents must never commit. Even with explicit "DO NOT commit" instructions, one agent committed in this scan (e8c739b8, reverted). After every subagent batch, check `git log --oneline -10` for unauthorized commits.
  **Detector**: `git log <last-known-good-sha>..HEAD --oneline` after subagent batch completes.
  **Auto-fix**: process — orchestrator runs the check.

- **Rule (Promise.all type narrowing)**: `Promise.all([P<A>, type === "x" ? P<B> : P<C>])` resolves the second slot to `B | C` even after `type === "x"` narrowing in scope. Branch before awaiting; await `Promise.all` inside each branch.
  **Detector**: `rg -nB 3 -A 3 'Promise\.all\(\[' src/app/api src/app/actions | rg '\? .* :' ` (heuristic).
  **Auto-fix**: manual — split the conditional into branched `Promise.all` calls.

## Fix log

| Order | Group                                    | Items applied                                                            | Files                                                     |
| ----- | ---------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------------- |
| 1     | C (parallel #1, committed-then-reverted) | LIB-13, 16, 17, 19                                                       | `api/arch/reports/{pdf,monthly,monthly-results}/route.ts` |
| 2     | Orchestrator                             | PDF route type narrowing (post-LIB-13 fix)                               | `pdf/route.ts`                                            |
| 3     | B (re-run with verify)                   | LIB-2, 3, 5, 6, 10, 11, 23                                               | 7 lib files                                               |
| 4     | D (re-run with verify)                   | OPT-010, 015, 019 + `@tanstack/react-virtual` install (for OPT-003 prep) | 3 optimize UI files + package.json + pnpm-lock.yaml       |
| 5     | Orchestrator (after Re-Group A failed)   | BT-1, 2, 3, OPT-001, 002                                                 | `backtest-content.tsx`, `optimize-content.tsx`            |
| 6     | Orchestrator (post-typecheck fixes)      | indicators.ts export + macd-wma caller + freeze-hero-modal type          | 3 files                                                   |

## Still armed

- **LIB-14** (PDF sync render) — backlog. Worker-thread infra required.
- **OPT-003** (table virtualization) — `@tanstack/react-virtual` installed but integration deferred until `DataTable` enhancement.
- **OPT-004** (heatmap canvas) — backlog. Feature-quality change.
- **LIB-4** (heatmap slice O(N·K)) — verified-deferred. Low actual impact at K≤5.
- **Out-of-scope pre-existing**: 4 tsc errors in `monte-carlo/{monte-carlo-content,simulation-params-form,strategy-analysis,v2/*}.tsx` and `optimize/sweep-axis-diagnostics.tsx` — user WIP from a separate refactor (`formatNumber`/`floorformatNumber` sed-replace artifact). Not introduced by this scan; will block `lint:strict` until fixed.

## Verification

- `pnpm exec tsc --noEmit` → 4 errors (all in pre-existing user WIP files, all out-of-scope). 0 errors in scan-#2 files.
- `git log` clean of unauthorized commits (e8c739b8 reverted).
- All Re-Group B/D claims verified via grep before this writeup. All Re-Group A failures recovered via inline orchestrator edits.
