# Full-System Audit — 2026-07-04

> **Fix status (wave 1, same day):** C1, C2, H1, H2, H3, H8, and the JSON.parse/catch-swallow mediums FIXED — commit `b1a5dd41`.
>
> **Fix status (wave 2, same day):** all 30+1 pre-existing test failures fixed (root causes: stale mocks after capital-events feature, MFE/MAE ownership moved from candle-math to operations pass, vitest mock-hoisting misuse, fixture typo in storage-migration); CI test gate added (`.github/workflows/test.yml`, `pnpm test:unit`); H4 fixed (enrich-day tracks candle-fetch failures, exit code 2 on degraded runs); heatmap perf fixed (split metric-independent/dependent memos + memoized cells); L1 defused (renko-pipeline now converts via `rNumberToPoints` even though still unwired). **Composite-index finding RETRACTED** — `idx_trades_account_archived_date` and partial `idx_trades_active_date (accountId, entryDate) WHERE is_archived = false` already exist in schema.ts; the data-layer agent missed them.
>
> Still open: H5 (analytics SQL-side aggregation — refactor, needs design), H6 (candle viewport pagination — design change), DuckDB connection lifecycle, `?? 0` null-coercion policy sweep in parsers beyond the fixed sites, drawings clock-skew conflict resolution.

Seven parallel read-only auditors swept: trading math, server-action security, data layer, client state/races, backtest engine, performance, error handling. Orchestrator adversarially re-verified all critical claims before inclusion. Severity reflects verified impact, not agent-reported severity.

---

## CRITICAL

### C1. `hawks-renko.ts` server actions have ZERO authentication — VERIFIED

`src/app/actions/hawks-renko.ts:110,194,238,292` — `importHawksRenkoSizes`, `listHawksRenkoSizes`, `upsertHawksRenkoSize`, `currentWeekAnchor` are `"use server"` exports with no `requireAuth()`/`requireRole()`. **There is no `middleware.ts` in the repo**, so nothing gates them upstream. Server-action IDs are discoverable from the client bundle → an unauthenticated remote caller can rewrite the weekly renko sizes that ALL R-math (stops, BE, 3R targets, trails, fibos) derives from. Silent corruption of every downstream risk figure. Fix: `requireRole("admin")` on all four; bound `parseRenkoSizeCsv` input size while there.

### C2. Silent date corruption on malformed CSV rows — trade history poisoning

`src/lib/csv-parsers/trade-grouping.ts:41-49` — `parseExecutionTime` returns `new Date()` (import-time NOW) when a row's date/time is malformed. A trade from 2026-01-15 imports as "today", silently. Journal, analytics, tax all inherit the wrong date with no warning. Fix: throw or reject the row, surface the skip count to the user.

## LATENT CRITICAL (dead code — will bite on revival)

### L1. `renko-pipeline.ts` passes R-number where points are expected

`src/app/actions/renko-pipeline.ts:224-226` — passes raw `size5m` (R-number, e.g. 20) to `generateRenkoBricks` which expects points (95). Would produce ~5x too many bricks. **Verified NOT wired into any route** (header comment confirms; zero imports repo-wide; `@ts-nocheck`'d). The live path (`brick-size-resolver.ts` → `rNumberToPoints`) is correct. Action: fix the conversion (or add a loud TODO) before rewiring this file; it is exactly gotcha #0.

---

## HIGH

### H1. Drawings sync: non-atomic, race-prone, resurrection bug

- `src/app/actions/hawks-chart-drawings.ts:295-353` — `syncDrawings` runs parallel deletes then parallel check-then-insert/update with no transaction. Mid-failure leaves DB/localStorage divergent; concurrent tabs hit duplicate-key on the select-then-insert window. Fix: single `db.transaction` + `onConflictDoUpdate`.
- `hawks-chart-drawings.ts:339` — the update WHERE uses `id` only (ownership was checked earlier, but defense-in-depth wants `and(id, userId)`).
- `src/components/hawks-chart/use-drawings-cache.ts:358-367` — delete issued while a flush is in flight: server response re-merges the deleted drawing into state (no tombstone check on response merge) → deleted drawing visually resurrects.
- `use-drawings-cache.ts:413-420` — `visibilitychange` listener never removed on unmount → accumulates across remounts.
- `use-drawings-cache.ts:66-70` — localStorage key lacks userId → cross-user cache contamination on shared machines (server guards prevent DB breach, UX still poisoned).
- `use-drawings-cache.ts:227-237` — `lastSyncedRef` seeded once from `initialDrawings` with empty deps; if the parent ever refetches, stale diff base can clobber server-side edits.
- `use-drawings-cache.ts` — `lastSyncError` is set in state but nothing guarantees the UI renders it → user can draw for 30 min with sync dead and never know.

### H2. Trade creation is non-transactional

`src/app/actions/trades.ts:384-467` — insert trade → tags → hawks sidecar → conditions as separate awaits with manual delete-cleanup in catch. If cleanup itself fails: orphaned half-trade. Fix: wrap in `db.transaction`. Also: the hawks-ordinal retry loop (434-444) has no backoff.

### H3. Import confirm claims success unconditionally

`src/app/api/imports/detailed-trades/confirm/route.ts:78-117` — batch insert result isn't verified before returning `{success:true, importedTradesCount}`. Combined with parsers that catch-and-continue on malformed rows (`genial-parser.ts:258-282`, only stdout logging), users get "imported successfully" over silently dropped rows.

### H4. Enrichment marks trades enriched when candle checks never ran

`scripts/enrich-day.ts:399-410` — candle fetch failure → `candles = null` → candle-math pass returns "skipped", indistinguishable from "passed". Trade shows as enriched; validation never happened.

### H5. Analytics fetch-everything + JS aggregation

`src/app/actions/analytics.ts:117-139` — equity curve / overall stats / discipline pull ALL matching trade rows (no limit) and aggregate in JS. At 10k trades ≈ 5–10 MB per query, several MB through the server-action JSON boundary, per dashboard load. (Perf agent's "500–800 MB" estimate was off by ~100x — corrected here, still a real scaling wall.) Fix: SQL aggregation (SUM/COUNT/AVG/window) or hard limits.

### H6. Hawks chart ships the entire candle history

`src/app/actions/hawks-chart-data.ts:84-137` — full window 2020→2099 for 3 timeframes ≈ 80k candles ≈ ~4.5 MB JSON on page load. Fix: viewport pagination with buffers.

### H7. RenkoPane not memoized; triple-screen re-render cascade

`src/components/hawks-chart/hawks-chart-workspace.tsx:408-420` + `renko-pane.tsx` — inputs are memoized but the three `RenkoPane`s aren't; parent state changes (toggles, hover) re-run setData/reconciliation effects across 3 charts. Fix: `memo(RenkoPane)` + stable prop refs; longer-term split the 1253-line pane's reconciliation into per-concern hooks.

### H8. `JSON.parse` on jsonb columns without try/catch

`src/app/actions/risk-profiles.ts:35`, `src/app/actions/live-trading-status.ts:69` — one corrupt `decisionTree` row crashes the whole page/action. Fix: safe-parse with per-row fallback + error surface.

---

## MEDIUM

- `saveDrawing` single-row check-then-write race (`hawks-chart-drawings.ts:175-215`) — same `onConflictDoUpdate` fix as H1.
- `?? 0` / null-coercion on financial quantities (`parse-utils.ts:33-41` and callers) — empty CSV price cell becomes cost basis 0 → fake 100% profit → wrong tax. Propagate nulls; render "—", never a confident 0.
- `.catch(() => [])` on page-level fetches (`command-center/page.tsx:76`, trade edit page) — DB outage renders as "you have no assets" instead of an error.
- API routes leak `String(error)` internals (`api/arch/trades/create/route.ts:44`) — sanitize 5xx bodies.
- Time-heatmap recomputes aggregates per metric toggle with repeated O(n) filters (`time-heatmap.tsx:192-297`); cells unmemoized so hover re-renders all 45.
- `buildTradePositionsFor5m` O(trades × candles) on every `series.times` change (`hawks-chart-workspace.tsx:456`).
- DuckDB singleton connection: setup promise can hang unrejected on non-writable extension dir; no cleanup/TTL (`duckdb-impl.ts:126-166`).
- No React error boundaries on chart-heavy routes (no `error.tsx` found for the app segment) — one chart crash blanks the page.
- Missing composite index `(accountId, entryDate)` on trades — hottest predicate in journal/analytics/tax.
- `load-hawks-by-timeframe.ts:238-268` — duplicate (timestamp, idx) rows dropped with count-only log; which brick got dropped is unrecoverable.
- Client-clock timestamp conflict resolution in drawings cache — no skew handling; a fast client clock always wins merges.

## LOW / OBSERVATIONS

- Reversal re-entries apply no slippage while primary entries do (`engine.ts:671` vs 515) — decide intent.
- CAGR uses fixed 1M baseline (`metrics.ts:158`) — fine for ranking, label it in UI.
- Renko bricks trigger on close, not wicks (`brick-generator.ts:76`) — intentional ProfitChart semantics, documented.
- Partial index opportunity on `monthly_tax_ledger.isDirty`.
- Sentry sourcemap upload adds build time — confirm it's consumed.

---

## VERIFIED CLEAN (worth knowing)

- **Backtest engine: no critical flaws found.** R-math convention (`(N−1)×5`) correct everywhere live; wick-based pivots single-sourced and correct; short-side P&L/trailing/BE sign-correct; stop-vs-target same-brick priority conservative and deterministic; no look-ahead bias detected; Wilson CI / sample stddev / Sharpe annualization correct with tests.
- Auth coverage elsewhere: ~125/129 endpoints properly gated (`requireAuth`/`requireRole`/arch bearer+allowlist); consistent userId scoping on trades/accounts/drawings reads; zod validation on mutation payloads; no raw SQL interpolation found.
- Migration ledger 0000–0027 consistent with on-disk files.

## SYSTEMIC PATTERNS (root causes to fix as policy, not per-site)

1. **Silent-failure default**: catch-and-continue, `?? 0`, `.catch(() => default)` — wrong numbers shown confidently. Policy: financial values never coerce null→0; skipped rows are always counted and surfaced.
2. **Missing transaction discipline**: multi-step writes (trades, drawings sync) rely on manual cleanup. Policy: any multi-write server action wraps `db.transaction`.
3. **Check-then-write instead of atomic upsert**: use `onConflictDoUpdate`.
4. **No global auth gate**: with no middleware, every forgotten `requireAuth()` is a public endpoint. Consider a lint rule or a wrapper factory for server actions.
5. **Fetch-everything data movement**: aggregate in SQL, paginate series.
