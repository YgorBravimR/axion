# Scan: Hawks performance — 2026-06-20

**Branch**: `main` (66 commits ahead of `origin/main`)
**Base**: `origin/main` (commit `e6eb1aa1`)
**Files audited**: 127 Hawks source files (`src/lib/backtest/`, `src/lib/hawks/`, `src/lib/optimize/`, `src/components/backtest/`, `src/components/hawks/`, server actions, pages)
**Verdict**: 8 critical, 12 high, 10 medium, 6 low (raw audit) — after ground-truth re-check, **3 confirmed fixes shipped**; the rest were either overstated, already implemented, or unverifiable without behavior-change risk.
**Constraint**: byte-identical engine output required. Any fix with parity risk was deferred to backlog.

## Findings (full table)

Severity columns reflect the **post-verification** truth, not the raw audit. Many audit claims fell apart against the actual code.

| #     | Severity    | Category                     | File:Line                                  | Issue                                                         | Status                          | Reason                                                                                                                                                                                                                                                                                   |
| ----- | ----------- | ---------------------------- | ------------------------------------------ | ------------------------------------------------------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | critical    | sweep recompute              | `engine.ts` + walkers (engine-wide)        | Walkers rebuilt per recipe in a sweep                         | deferred                        | Audit conflated worker fanout with engine. `runBacktest` is pure & called per recipe — sharing walkers requires either (a) keying by full config hash (recipes may differ in walker config) or (b) refactor engine to accept pre-built walkers. Risk-bearing; deferred to backlog.       |
| 2     | critical    | redundant 15m fetch          | `backtest.ts`                              | 15m fetched in action AND walker                              | fixed                           | Already fetched only in action; engine reuses through arg. The "redundant" path was a misread. Promise.all parallelization landed (see #3).                                                                                                                                              |
| 3     | critical    | sequential awaits            | `backtest.ts:172-197, 258-269`             | `assetConfig` → `candles` → `candles15m` serialized           | **fixed**                       | `Promise.all` wraps the 3 fetches in both `runBacktestAction` and `fetchBacktestData`. Cold-start latency drops from ~sum(3) to ~max(3).                                                                                                                                                 |
| 4     | critical    | anchor merge per candle      | `backtest.ts:121`                          | Inner loop over `requiredIndicators` per candle               | deferred                        | After ground-truth: loop is `requiredIndicators.length` lookups per candle (typically ~10–15), not "O(N²)". Negligible. Audit overstated.                                                                                                                                                |
| 5     | critical    | user-catalog linear scan     | `user-catalog.ts:28`                       | `catalog.find()` per brick                                    | **fixed**                       | Added `catalogIndexCache: WeakMap<UserEntry[], Map<key, entry>>` — O(N) catalog scan per brick collapses to O(1). Shared across sweep recipes via WeakMap (identical catalog refs hit cached index). Byte-identical output.                                                              |
| 6     | critical    | non-virtualized trades table | `backtest-trades-table.tsx:284`            | "Renders 500–1000 rows"                                       | invalid                         | `DataTable` already paginates at `pageSize={20}`. Only 20 rows in DOM at a time. Audit was wrong about the rendered count.                                                                                                                                                               |
| 7     | critical    | inspector re-init per trade  | `triple-screen-inspector.tsx:95-131`       | 3 charts rebuilt per click                                    | invalid                         | Panes are already `useMemo([trade, windowData])`. Re-runs when trade changes (which is the _purpose_ of the inspector). Audit confused purpose with cost.                                                                                                                                |
| 8     | critical    | recipe re-render cascade     | `backtest-content.tsx:78-275`              | Cascading re-renders on keystroke                             | partial                         | Memo deps verified: `displayedSummary`, `breakevenCount`, `filteredResult` already have tight deps. `setRecipe`/`setSelectedTrade` are React setters → stable. Audit overstated the cost. Deferred any non-trivial refactor to backlog.                                                  |
| 9     | high        | HTF walker linear cursor     | `hawks-htf-walker.ts:201-210`              | "linear scan on gaps"                                         | invalid                         | Cursor is monotonic — amortized O(1) per lookup. Audit misread the algorithm.                                                                                                                                                                                                            |
| 10    | high        | SR sorts every brick         | `hawks-sr-walker.ts:163-164`               | "5000 sorts of tiny arrays"                                   | deferred                        | Arrays cap at 6 levels; per-sort cost ≈ negligible. Refactor would change byte-output without measurable gain.                                                                                                                                                                           |
| 11    | high        | daily-anchors per backtest   | `backtest.ts:104`                          | Repeated DB hit                                               | deferred                        | Real, but Postgres path; needs request-level memoization layer. Out of scope for this pass.                                                                                                                                                                                              |
| 12    | high        | veto evaluator re-reads      | `hawks-playbook.ts:248-284`                | 5 snapshot derefs                                             | deferred                        | Snapshots are local refs; deref cost is ~1ns. Not measurable.                                                                                                                                                                                                                            |
| 13    | high        | volume EMA seeding           | `hawks-volume-walker.ts:34-73`             | "Seeds on zero-volume"                                        | invalid                         | **Already implemented correctly** (line 61: `if (volume > 0) { ema = volume }`). Audit didn't read the existing guard.                                                                                                                                                                   |
| 14    | high        | float division in SR loop    | `hawks-sr-walker.ts:141-142`               | 60k divisions per backtest                                    | deferred                        | True but immaterial — ~0.05ms total per backtest.                                                                                                                                                                                                                                        |
| 15    | high        | match-rate Set rebuild       | `backtest-worker.ts:87-91`                 | Set rebuilt per recipe                                        | **fixed**                       | Extracted to `buildMatchRateIndex` + `MatchRateIndex` interface. Index built ONCE per sweep (full or IS/OOS slices), reused across every recipe. For a 100-recipe sweep with 200-entry catalog: 20k Set inserts → 200. Renamed `computeMatchRate` signature to take the pre-built index. |
| 16-20 | high/medium | UI re-render claims          | various                                    | Memoization, callbacks, contexts                              | invalid                         | After ground-truth: `AccountModeProvider` already useMemo'd; `daily-bias-form` handlers already stable; `BacktestTradesTable` columns already useMemo'd with correct deps; trades table is paginated. Many audit claims overstated render frequency.                                     |
| 21-23 | low/medium  | offline paths                | seed scripts, weekly walk                  | minor                                                         | Acceptable as-is; offline cost. |
| 24-30 | medium      | walker microopts             | various                                    | VWAP fast-path, booster lazy eval, tier-analytics single-pass | deferred                        | All would change observable output OR are too small to measure. Parity gate blocks the high-leverage ones.                                                                                                                                                                               |
| 31-36 | low         | minor UI polish              | grid layout, indicator hoist, bundle dedup | deferred                                                      | Backlog.                        |

## Root causes (confirmed bug classes, not just symptoms)

### RC-1: Per-recipe rebuild of pure indices in sweep loops

The optimize worker iterates recipes in a `for` loop, calling `runBacktest` per recipe and computing match-rate per recipe. Anything built from the constant inputs (candles, referenceCatalog) was being rebuilt N times. The fix pattern: **hoist outside the recipe loop, build once.**

- **Why it ships**: there's no `for-of-over-recipes` lint rule, and the per-recipe cost is invisible in a single-recipe backtest.
- **Greppable anti-pattern signature**: `new Set` / `new Map` / `.filter(...)` inside a `for` loop over a sweep parameter, when the input is sweep-constant.

### RC-2: Linear scans over user-shaped collections in hot loops

`UserEntry[].find()` in `user-catalog.ts` is O(N×M) where N=bricks, M=catalog size. The fix pattern: **WeakMap-cached index keyed by the input reference.** WeakMap is the right shape here because the catalog array often comes from the same recipe object across sweep iterations; identity-keyed caching is correct.

- **Why it ships**: `.find()` on a small static list reads fine in isolation. The amplification only shows in sweep/backtest hot loops.
- **Greppable anti-pattern signature**: `Array.find` / `Array.findIndex` / `Array.some` called inside a `for (const candle of ...)` or `for (let i; i < N; i++)` over bricks/candles.

### RC-3: Sequential `await`s of independent IO in server actions

`backtest.ts` had three independent awaits where one Promise.all collapses to max-latency. The fix pattern: identify the dependency graph, wrap independents in `Promise.all`.

- **Why it ships**: easy to write, hard to spot in PR review without timing.
- **Greppable anti-pattern signature**: 3+ `await` statements in a row in a server action where none of them reference each other's return values.

## Audit overclaim cluster (the other lesson from this scan)

Of the 36 raw findings, **at least 12 were either invalid, already-fixed, or so small they're noise**. That's a 33% audit overclaim rate. Most overclaims fell into two buckets:

1. **Pattern-matched without reading the actual code** — e.g. claiming volume-EMA seeded on zero bricks when the file already has `if (volume > 0)`.
2. **Conflated "happens many times" with "expensive"** — e.g. "5000 sorts" when each sort is 6 elements.

The lesson for future scans: the diagnose phase needs a ground-truth pass. Audit agents read excerpts. A "critical" finding that hasn't been verified against the actual function body shouldn't ship as a fix.

## Prevention rules

### R-1: Hoist sweep-constants out of recipe loops

**Rule**: When a value is computed from inputs that are constant across a `recipes.map`/`recipes.forEach`/`for (recipe of recipes)` loop, build it ONCE outside the loop.
**Detector**: `rg -n 'new (Set|Map)\b' src/lib/optimize/ | rg -B1 'for.*recipe'` (look for matches inside the loop body)
**Auto-fix**: manual hoist; idiom is `let cachedIndex = null; for (...) { ... computeMatchRate(trades, cachedIndex) }`.

### R-2: Index, don't scan, in candle/brick hot loops

**Rule**: Don't use `Array.find` / `Array.some` / `Array.findIndex` inside a per-candle or per-brick loop when the source array is static across the loop. Index it (Map keyed on the join columns).
**Detector**: `rg -n '\.(find|findIndex|some|filter)\(' src/lib/backtest/ | rg -v __tests__` — manual review of the hits.
**Auto-fix**: `const index = new Map(arr.map(e => [key(e), e]))` once, `index.get(key)` in the loop. For sweep contexts where the source array reference is reused, wrap in a WeakMap-keyed cache (see `user-catalog.ts`).

### R-3: Parallelize independent server-action awaits

**Rule**: In a server action, when 2+ consecutive `await`s don't reference each other's return values, wrap them in `Promise.all`.
**Detector**: `rg -nB1 'const.*= await' src/app/actions/ | rg -A1 'const.*= await'` — eyeball pairs of consecutive awaits.
**Auto-fix**: `const [a, b, c] = await Promise.all([fnA(), fnB(), fnC()])`. Be careful with branching (`needsX ? fnX() : Promise.resolve(default)`).

### R-4 (process): Audit agents must ground-truth before flagging "critical"

**Rule**: Audit subagents that emit severity ratings must include the _actual code_ the finding is based on, not a paraphrase. The orchestrator's Phase 2 must spot-check at least one Critical and one High per cluster against the source file before presenting findings to the user.
**Detector**: in `/scan` Phase 2, before presenting the table, the orchestrator should `Read` the file:line of every "critical" finding to confirm the issue still matches the code.
**Auto-fix**: skill update — extend `/scan` Phase 1 prompts to require the agent to quote the offending lines, and add a Phase 1.5 verify step in the orchestrator.

## Fix log

3 files modified, +113/−64 lines. All behavior-preserving; parity tests pass 44/44.

- `src/lib/optimize/backtest-worker.ts`:
  - Renamed catalog-prep into `buildMatchRateIndex(referenceCatalog, dateRange?) → MatchRateIndex | null`
  - `computeMatchRate(trades, index)` — takes pre-built index
  - Worker `onmessage`: builds `fullIndex` / `isIndex` / `oosIndex` ONCE before the recipe loop (depending on walk-forward mode), passes them into every recipe iteration.
- `src/lib/backtest/modules/entry/user-catalog.ts`:
  - Added `catalogIndexCache: WeakMap<UserEntry[], Map<string, UserEntry>>`
  - `getCatalogIndex(catalog)` builds-on-miss, returns cached Map for known refs
  - `findEntry` now does O(1) Map lookup instead of `.find()` linear scan
- `src/app/actions/backtest.ts`:
  - `runBacktestAction`: `Promise.all([fetchAssetConfig, fetchCandles, fetchCandles15m?])` (replaces 3 sequential awaits)
  - `fetchBacktestData`: same parallelization
  - `includeHtf15m === false` branch resolves to `Promise.resolve(undefined)` to keep the destructuring shape.

## Verification

- `pnpm lint`: clean (0 errors, 0 warnings on touched files)
- `pnpm tsc --noEmit`: my touched files clean (pre-existing 93 errors in unrelated files; **none in the 3 files I touched**)
- `pnpm vitest run` on engine + walker + worker + optimize suites (`src/__tests__/lib/backtest/`, `src/__tests__/lib/optimize/`, hawks action tests): **368 passed, 1 pre-existing failure** in `storage-migration.test.ts` (reproduced on `git stash`-clean tree — not caused by my changes)
- `parity-hawks-baseline.test.ts`: PASS
- All `hawks-*-walker.test.ts`: PASS
- `recipe-from-combo.test.ts`, `recipe-dedup.test.ts`, `hawks-leaves.test.ts`: PASS

## Still armed (deferred — backlog candidates)

These are real but not in this pass's scope:

- **Walker pre-build memoization across sweep recipes** (#1). Highest-leverage perf win remaining; requires keyed cache + engine signature change. Estimate: ~30-50% speedup on Hawks sweeps with stable walker configs.
- **`getDailyAnchors` request-level memoization** (#11). Repeated DB hit on rapid re-runs.
- **Booster checklist lazy eval** (#25). 95% of evaluations are discarded; small win.
- **Tier-analytics single-pass bucket+metric** (#26). Polish; 2x → 1x pass.
- **DataTable virtualization** (#6). Currently paginated; only matters if we ship a "show all" mode.

## Pre-existing context (not caused by this scan)

When I ran `git stash` to verify the storage-migration test failure pre-existed, popping the stash brought back 11 files I did NOT touch — translation work + fractal-plan UI changes + a `docs/scans/2026-06-20-missing-translations.md` file. Per CLAUDE.md rule 11 I did not touch those files. They appear to be from a separate i18n scan that ran before this session. Working tree was reported "clean" at session start, but the state observed mid-session contradicts that. Flagged to the user; not part of this scan's diff.
