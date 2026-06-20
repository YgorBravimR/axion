# Scan: multi-fetch + SQL performance — 2026-06-20 (2nd pass)

**Branch**: `main` (66 commits ahead of `origin/main`)
**Base**: `origin/main` (commit `e6eb1aa1`)
**Files audited**: 30+ pages, 80 server actions, plus `auth.ts` / `fee-resolver.ts` / Drizzle schema
**Verdict**: 10 raw findings → **8 confirmed, 2 retracted**. **6 fixes shipped**.
**Constraint**: behavior-preserving. All changes are pure refactors of fetch shape; outputs are byte-identical.

This is the second scan in a session that already shipped one perf pass on Hawks. The lesson from that pass — audit agents overclaim ~30% — was applied here: every Critical/High was ground-truthed against the actual code before showing it to the user. Two findings retracted at that step.

## Findings (full table)

| #   | Severity  | Category                           | File:Line                                             | Issue                                                                                                                                           | Status                                       |
| --- | --------- | ---------------------------------- | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| 1   | critical  | count-via-fetch + N+1 + sequential | `src/app/actions/monte-carlo.ts:46-113`               | `getDataSourceOptions` had THREE `SELECT *` patterns just to take `.length`, an N+1 loop per strategy, and three sequential independent queries | **fixed**                                    |
| 2   | critical  | uncached session helper            | `src/app/actions/auth.ts:432-451`                     | `getCurrentAccount` not wrapped in `cache()` while `getCachedCurrentUser` and `requireAuth` are                                                 | **fixed**                                    |
| 3   | high      | sequential independent IO          | `src/app/actions/command-center.ts:744-852`           | `getCircuitBreakerStatus`: 4 mutually-independent IO calls in series                                                                            | **fixed**                                    |
| 4   | high      | sequential independent IO          | `src/app/actions/command-center.ts:530-547`           | `getAccountAssetSettings`: 2 independent queries in series                                                                                      | **fixed**                                    |
| 5   | high      | N+1 fee lookup                     | `src/app/actions/csv-import.ts:91-97`                 | `for (const asset of foundAssets) await getAssetFees(...)` — and each `getAssetFees` re-runs `auth()` + a DB query                              | **fixed** (added `resolveFeeSnapshotsBatch`) |
| 6   | medium    | sequential page awaits             | `src/app/[locale]/(app)/page.tsx:22-33`               | Dashboard: `getDashboardBatch` then `getHawksCoachingInsights` in series                                                                        | **fixed**                                    |
| R1  | retracted | sequential page-level              | `src/app/[locale]/(app)/plan/[year]/page.tsx:205-232` | Audit claimed two sequential `Promise.all` calls — actually already a single `Promise.all`.                                                     | dropped                                      |
| R2  | retracted | unbounded Promise.all              | `src/app/actions/annual-reports.ts:246`               | Bounded to 52 weeks/year. Not a real risk.                                                                                                      | dropped                                      |

## Root causes (confirmed bug classes)

### RC-1: Count-by-fetching-all-rows

`.then((rows) => rows.length)` looks innocent — it's even shorter than `count()` — but in Postgres it transfers EVERY matched row over the wire, then takes a JS array length. With a 100k-row `trades` table the per-call cost is enormous. `getDataSourceOptions` did it 3× (once in an N+1 loop) on a hot Monte Carlo page.

- **Greppable signature**: `\.then\(\(\w+\) => \w+\.length\)` after a `db.select(...)` or `db.query.X.findMany(...)` call.
- **Greppable in this repo today**: `rg -n '\.then\(\(\w+\) => \w+\.length\)' src/` — clean after this scan.
- **Auto-fix**: `db.select({ c: count() }).from(table).where(...)`. For grouped counts: `.select({ key, c: count() }).from(t).where(...).groupBy(t.key)`.

### RC-2: Session helpers that aren't cached

React's `cache()` deduplicates calls within a single request. Axion's `auth.ts` correctly caches `getCachedCurrentUser` and `requireAuth`, but `getCurrentAccount` was missed — and it's called from the root `(app)/layout.tsx` which wraps **every authenticated page**, then duplicated by several pages and server actions in the same request. Without cache, each call is a fresh PK lookup against `tradingAccounts`.

- **Greppable signature**: in `src/app/actions/auth.ts`, exported `getX = async (...) => ...` that hits the DB but isn't wrapped in `cache()`.
- **Auto-fix**: `const getCachedX = cache(async () => ...); export const getX = async () => getCachedX()`.

### RC-3: Sequential independent IO

Same root cause as the previous (Hawks) scan: `await fnA(); await fnB(); await fnC();` where C doesn't depend on A or B. `command-center.ts` had it twice — the circuit-breaker had 4 such calls (including a separately-flagged "loop then aggregate" antipattern where the SQL aggregate was awaited AFTER an in-memory loop that doesn't depend on it).

The new variant this scan flagged: **the aggregate-after-loop antipattern**. When you have `const X = await loadX(); for (const x of X) computeStuff(); const Y = await db.aggregate(...);`, the aggregate query CAN be hoisted into the same Promise.all as `loadX()` — the in-memory loop runs after both return.

- **Greppable signature**: 2+ consecutive `const x = await` where the next await's argument list doesn't reference `x`.
- **Auto-fix**: `const [a, b, c] = await Promise.all([fnA(), fnB(), fnC()])`. For aggregate-after-loop: hoist the aggregate into the initial Promise.all.

### RC-4: Loop calls a helper that itself does N IO

`csv-import.ts` did `for (const asset of foundAssets) await getAssetFees(asset.symbol, accountId)`. Each `getAssetFees` call internally re-ran `auth()` (session lookup) AND `resolveFeeSnapshot` (DB query). 20 assets = 40 sequential round-trips for what should be one batch query. The lint-disable comment said "small N (typically <20)" — but small × 2 IO is still 40 sequential awaits.

- **Greppable signature**: `for.*of.*await get[A-Z]\w+\(` patterns inside server actions.
- **Auto-fix**: introduce a `resolveXBatch` helper that takes `string[]` and returns `Map<string, X>`. Often 1-2 queries instead of N×K.

## Fix log

6 files, +220/−101 lines. Lint clean. TSC clean for touched files. Tests 75/75 PASS.

- **`src/app/actions/monte-carlo.ts`** — `getDataSourceOptions`:
  - Added `count` to drizzle imports
  - Replaced 3× `.then(rows => rows.length)` with `count(trades.id)` aggregates
  - Replaced per-strategy N+1 loop with one `GROUP BY trades.strategyId` aggregate
  - Wrapped strategies-fetch + per-strategy-counts + all-account-count + universal-count in `Promise.all`
  - Pre-indexed grouped counts into a `Map<strategyId, count>` for O(1) lookup
- **`src/app/actions/auth.ts`** — `getCurrentAccount`: wrapped in `cache()` following the existing `getCachedCurrentUser` pattern
- **`src/app/actions/command-center.ts`**:
  - `getCircuitBreakerStatus`: Promise.all of `getTodayTrades`, `resolveDay`, `resolveBehavior`, and the monthly P&L aggregate. The aggregate was previously awaited AFTER the in-memory sortedTrades loop — hoisted up front since the loop only reads `todaysTrades`/`day`/`behavior`.
  - `getAccountAssetSettings`: Promise.all of `enabledAccountAssets` + `existingSettings`.
- **`src/app/actions/csv-import.ts`** — replaced N+1 `getAssetFees` loop with one call to `resolveFeeSnapshotsBatch`
- **`src/lib/tax/fee-resolver.ts`** — added `resolveFeeSnapshotsBatch({ accountId, assetSymbols })` returning `Map<symbol, FeeSnapshot>`. Single query loads per-asset rows (via `inArray`) AND the account-default row (via `IS NULL`) using one Postgres index scan. Three-tier fallback (per-asset → account-default → hardcoded) preserved byte-identically vs the single-symbol variant.
- **`src/app/[locale]/(app)/page.tsx`** (dashboard) — `getDashboardBatch` + `getHawksCoachingInsights` Promise.all'd

## Verification

- `pnpm lint`: clean (0 errors)
- `pnpm tsc --noEmit`: clean on all 6 touched files (the 93 pre-existing errors are in unrelated files, untouched)
- `pnpm vitest run`:
  - `src/__tests__/lib/tax/fee-resolver.test.ts`: PASS
  - `src/__tests__/actions/accounts.test.ts`: PASS
  - `src/__tests__/actions/command-center.test.ts`: PASS
  - **75/75 tests PASS** across the directly-touched code

## Expected impact (qualitative)

- Monte Carlo data-source page: was loading ALL trade rows N+2 times just to take `.length`; now 3 aggregate queries in parallel. For an account with 100k trades and 20 strategies, the wire transfer drops from ~millions of rows to ~24 result rows total. Likely 10-50× improvement on this endpoint.
- Command-center page: previously 4 sequential IO calls inside `getCircuitBreakerStatus`. Now max(4) instead of sum(4). For ~50ms DB query baseline that's ~150ms saved per page load.
- `getCurrentAccount` cache: every authenticated page load previously did 2-4 redundant `tradingAccounts` PK lookups. Now 1. Small per-call cost but ubiquitous.
- CSV import: per-asset fee loop collapses to 1 query for up to 20 assets, reducing 40 sequential round-trips to 1. Visible on bulk imports.
- Dashboard: max(2) instead of sum(2).

No engine numerics touched. No schema changes. No deletions.

## Still armed (deferred)

- **`(app)/layout.tsx` shape**: the layout runs `getCurrentAccount` + `getActiveAccountModeForUser` in Promise.all (good), but `getActiveAccountModeForUser` isn't audited here. Worth a follow-up.
- **`requireAuth` cache vs `getCurrentAccount` cache**: both are cached now, but each hits the `tradingAccounts` table separately (one via `findFirst` with full row, one via `findFirst` columns: `{ id: true }`). A future pass could merge these.
- **`getDailySummary` / `getCircuitBreakerStatus` share `getTodayTrades`** (already cached). Good. But they also share most of the metric calculation — a single rollup helper would deduplicate the per-trade loop work.
- **Trade list endpoints**: not audited yet. The `trades` table is the largest. A future scan should focus on the journal list page and analytics queries specifically.
