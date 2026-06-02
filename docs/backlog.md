# Backlog — Commit-Ready Deferred Work

This file is the canonical home for **commit-ready deferred work**: ideas that have a concrete shape, a known source, a rough effort, and a priority. Half-formed thoughts and exploratory ideas live in [`docs/ideas.md`](ideas.md) and graduate here once they pass the promotion bar.

## Why this file exists

Inline `// TODO`, "Phase 2 will…", and "future iteration may…" notes scatter knowledge across the codebase. By the time the work matters again, the context is lost and the note rots. This file consolidates the next-action-ready slice so we can:

- **Cherry-pick** the next P1 without a codebase grep tour.
- **Avoid losing concrete plans** when the original spec/scan ages out.
- **See the shape of debt** at a glance — which clusters keep growing, which are dormant, what we're choosing not to do.

## Backlog vs. ideas

| File                          | What lives here                                                                                                                                                      | Promotion rule                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ideas.md`               | Half-formed ideas, "we should think about X", strategic seeds, anything missing a clear shape or effort estimate. Cheap to file, cheap to delete.                    | Once an idea has a **Source**, a rough **Effort**, a **Priority**, and a one-paragraph "what + why", promote it here.                    |
| `docs/backlog.md` (this file) | Concrete, commit-ready deferred work. Every entry has Priority, Effort, Source, and a `What + Why` clear enough that someone other than the author could pick it up. | When shipped, **delete the entry in the same PR that ships it**. The shipping commit + git history is the record — no separate DONE log. |

## Conventions

- **Priority**: `P0` blocker / safety / data-correctness · `P1` strategic shortlist (highest ROI, ship next) · `P2` valuable but not blocking · `P3` nice-to-have / polish.
- **Effort**: `XS` <1h · `S` half-day · `M` 1-2 days · `L` multi-day · `XL` multi-sprint.
- Every entry has a **Source** line linking back to the doc/spec/file that surfaced it. Update the source when you cherry-pick.
- **Ordering — higher priority sits on top** so a top-to-bottom scan always surfaces "what's next" first. Two layers:
  1. Capability sections themselves are ordered roughly by where the highest-priority work lives. The `## P1 strategic shortlist` always leads the file.
  2. Within each capability section, entries are sorted by priority descending: `P1` first, then `P2`, then `P3`. When adding a new entry, slot it by priority — do not append blindly.
- **When a feature lands, delete its entry from this file in the same PR that ships it.** Git history + the shipping commit are the audit trail; no parallel DONE register is maintained. The active backlog is exactly what's still in front of us.
- Group by capability area, not by date. Within a group, follow the priority-sort rule above.
- When in doubt, file new entries in `ideas.md` first — cheap to write, cheap to discard.

---

## How to retire an item from this backlog

1. Implement the work.
2. Update any other doc that still has deferred prose ("Phase 2 will…", "future iteration may…") pointing at this entry — replace with a concrete reference to the shipped commit/PR, or delete the prose entirely.
3. **Delete the entry from this file in the same PR that ships the work.** Don't strikethrough; don't move it elsewhere; don't add a "Recently shipped" footnote. The shipping commit + git history are the audit trail.

Result: the active backlog is exactly what's still in front of us, priority-descending. No parallel DONE register lives in this file.

---

## Backtest / Inspector

### OPTIMIZE — post-fact result memoization for data-degenerate axes

- **Priority**: P3
- **Effort**: M
- **Source**: 2026-06-02 — CSV audit of `axion-optimize-runs-2026-06-02T08-33-09.csv` (8,352 rows) showed 97.8% refine redundancy collapsed to 84 unique result signatures (`pf|wr|pnl|dd|trades|sharpe|avgR|match`). Pre-execution recipe dedup landed (`src/lib/optimize/recipe-dedup.ts`) and collapses structurally identical recipes before dispatch. Remaining redundancy comes from **structurally distinct recipes that produce identical backtests** when one axis is data-degenerate (e.g., a stop-distance variation that never triggers in the date window).
- **What + Why**: Pre-execution dedup is necessary but not sufficient. A result-hash memo (`hash(trades) → metrics`) inside `runSweep` would catch the residual after pre-dedup. Trade-off: caching by output requires the backtest to run at least once per output signature, so the saving is per repeat — material only if the audit shows a meaningful residual after #2 (pre-dedup) ships.
- **Fix shape**:
  1. In `src/lib/optimize/backtest-worker.ts`, hash the trades array (or summary key fields) after each backtest.
  2. Keep an in-worker `Map<resultHash, Result>` for the sweep duration.
  3. On the next recipe, run the backtest, then if `resultHash` is a hit, emit the previously stored synthetic result with a `dedupSource` tag so the runs table can mark redundant runs.
- **Done when**: A 1,000-run sweep with a known data-degenerate axis (e.g., stop-distance variation outside the daily price range) produces ≤200 unique result signatures **AND** the redundant rows show a `dedup` provenance tag in the UI.
- **Date filed**: 2026-06-02.

### OPTIMIZE — cache `fetchBacktestData` results across runs in the same session

- **Priority**: P3
- **Effort**: S
- **Source**: 2026-05-29 — observed `fetchBacktestData(...)` taking 2.9 s on optimize page load (dev log). Every sweep config tweak re-fetches the candle history when the user hits Run, even though range + asset + indicators are unchanged.
- **What + Why**: Optimize sweeps execute N backtests against the same candle history. The candle pull happens once per _sweep_ today (good), but every time the user changes a sweep param and re-runs they pay 2.9 s again. For iterative refinement, this is the dominant interactive latency. A simple session-scoped cache keyed on `(assetId, dateRange, indicatorSet)` would make the second-and-onward sweep feel instant.
- **Fix shape**:
  1. Add a `Map<string, CandleHistory>` in `src/lib/optimize/sweep-runner.ts` (or wherever the runner orchestrates the fetch), keyed on a hash of `(assetId, from, to, indicators)`.
  2. Invalidate when any of those inputs changes.
  3. Stay in-memory — no IndexedDB / localStorage; user reload pays the cost again, which is fine.
- **Done when**: Two consecutive sweep runs against the same range/asset/indicators show the second one starting backtest execution within 50 ms of clicking Run.
- **Date filed**: 2026-05-29.

### Hawks autonomous engine: reproduction 51% → improve via quality gates

- **Priority**: P1
- **Effort**: L (multi-session)
- **Source**: 2026-05-28 — Step 8 parallel-audit harness (`scripts/audit-parallel.ts`) and state-machine tracer (`scripts/trace-hawks.ts`) landed in commit `6390656e`. Subsequent session pushed engine to v0.6 (stay-armed + slide-down FUNDO/TOPO + 5-brick cooldown). Audit moved 47.6% → 51.4% with extras 38 → 57.
- **What + Why**: State-machine tuning has hit diminishing returns. Empirical cooldown sweep (3/5/7 bricks) and stay-armed-vs-anchored variants explored; best matches-to-extras ratio is the anchored + cd=5 configuration currently shipped. Remaining ~50% miss rate likely requires structural changes outside the wave detector:
  1. **Quality multipliers → hard gates.** MACD histogram, VWAP, AJUSTE are computed and logged but never gate fire. Catalog T2/T3/T4 misses likely correlate with one of these being off.
  2. **15m/60m gate transition windows.** `gateS` / `gateL` flip binary on EMA crossovers. Trades catalogged in transition zones (e.g., 2026-03-19 16:00 area, 2026-03-25 11:00 area) miss because the gate isn't on at the catalog brick.
  3. **Per-day volatility calibration.** Tight days (NR4/NR7) may need a different retracement threshold than expansion days.
  4. **Synthetic test fixtures need rebuild.** `src/__tests__/lib/backtest/hawks-engine.test.ts` has 3 `describe.skip` tests (re-arm pair + LONG smoke) that were written against pre-stay-armed semantics. Rebuild with brick close + cooldown awareness.
  5. **Fibonacci-based retracement & extension layer.** Current wave detector uses a single `retracementMin` brick threshold for wave-2. Try replacing the binary threshold with a Fibonacci band: accept wave-2 entries whose retracement falls within `[0.382, 0.618]` of wave-1's range, and tag projected targets at `1.272 / 1.618 / 2.618` extensions. Hypothesis: per-day volatility calibration (#3 above) may collapse into "the right Fib ratio for this day's brick size" rather than a per-day-tuned constant. Plumb the Fib levels through the engine + the inspector overlay so audit traces can show where the catalog entry lands on the Fib grid.
- **Done when**: Reproduction rate >75% with extras <60 across the 20-day catalog. Skipped test fixtures rebuilt. Fib-band experiment has been tried and either kept (with measured lift) or recorded as ruled-out with the audit numbers.

### Hawks engine: 10-day verification and multi-trade open questions

- **Priority**: P1
- **Effort**: M
- **Source**: 2026-05-27 — Hawks 7-step plan Step 8; steps 1–7 (data layer + user-catalog mode) complete.
- **What + Why**: Data layer is verified clean across all loaded days (steps 1–6 each pass 35 days). User-catalog mode fires T1 correctly on 2026-05-13. The autonomous engine needs verification across 10 catalogued days, which requires Ygor to first seed `data/hawks/user-entries/*.json` with T2/T3/T4 entries for 2026-05-13 and entries for the remaining 9 days. Open questions that will surface during the 10-day run:
  1. **10:22 BRT fire on 2026-05-13** — the engine fires a second SHORT at ~10:22. Is this a valid setup Ygor missed, or a false positive (accept or exclude with a "one-trade-per-completed-wave-1" rule)?
  2. **T3/T4 on 2026-05-13** — the 15m gate flips bullish after ~12:00 BRT. Engine does not fire T3/T4. Need to confirm whether this is a legitimate gate block or a mis-classification of the 15m trend.
  3. **Multi-fire vs. one-trade-per-day** — current architecture allows multiple entries per day (T1→T2→T3→T4). Confirm this is the intended behavior.
  4. **Wave-1 invalidator** — `consecutiveAgainstInWave1` exists in `HawksState` but is never incremented or checked. The plan called for re-introducing it scoped to "no FUNDO yet in current wave". Defer until the 10-day run confirms whether it's needed.
- **Date filed**: 2026-05-27.

### Hawks user-catalog: investigate 14 label mismatches across 20 catalogued days

- **Priority**: P1
- **Effort**: M (data analysis, not code)
- **Source**: 2026-05-28 — full-range audit `pnpm tsx scripts/audit-catalog-results.ts 2026-03-02 2026-05-13` shows 89/103 (86%) match. Every mismatch is **same-exit-price-different-label** — engine and catalog agree on where the trade exits, only on what to call it. Three patterns:
  1. **`BE → ST` (engine BE, user ST)** — 4 cases: 2026-03-04 T1, 2026-03-19 T4, 2026-03-27 T1 & T2. Engine activates BE on a favorable close that user did not count as BE-eligible. T1 on 2026-03-27 specifically: LONG entry on a BEAR brick (against-direction entry); engine activates BE after the next BEAR continuation, user expected the same brick to be a stop because — under a 1×brickSize stop interpretation for against-direction entries — brick 19's close (182.985) lands exactly at `entry − 1×brickSize`. Hypothesis: the canonical stop distance should depend on whether the entry brick is favorable or against the trade direction (favorable → 2× reversal; against → 1× continuation).
  2. **`BE → GA` (engine BE, user GA)** — 6 cases: 2026-03-05 T7, 2026-03-09 T5, 2026-03-10 T2, 2026-03-13 T1, 2026-03-19 T2, 2026-03-20 T3. Engine activates BE early and stops out at entry; user mentally let it run and counted the 3R target. Hypothesis: user's BE rule may be stricter (more favorable closes required, or a tighter "no reactive against-brick after BE" guard).
  3. **`ST → BE` (engine ST, user BE)** — 2 cases: 2026-03-03 T9, 2026-03-09 T4. Engine stops at the 2×brickSize level; user treats it as BE. Hypothesis: user may have moved SL earlier than the engine.
  4. **One-offs**: `GA → BE` (2026-03-12 T5) and `EOD → ST` (2026-03-04 T3 — engine doesn't stop or hit BE, just runs out the day).
- **What to do**: Bring this list to Ygor. For each pattern decide whether to (a) tighten the engine rule to match the catalog, (b) accept the catalog as authoritative and add a label-override mechanism, or (c) treat catalog labels as user-discretion overlay (no engine change). Do not touch `src/lib/backtest/modules/entry/user-catalog.ts` until the rule decision is made — at 86% match the engine is calibrated well; the wrong rule change could regress the 89 trades that currently match.
- **Date filed**: 2026-05-28.

### Hawks dev sandbox: vertical-line + rectangle drawing tools + persistence

- **Priority**: P2
- **Effort**: M
- **Source**: 2026-05-28 — Phase 1 of chart drawings shipped (horizontal lines + trendlines) at `/dev/hawks-audit`. The remaining two primitives require custom `ISeriesPrimitive` work; localStorage persistence requires a small storage layer.
- **What + Why**: Add the two drawing tools that Phase 1 deferred:
  1. **Vertical time markers** — click a 5m brick to drop a full-height vertical line at that timestamp; syncs to corresponding brick on 15m / 60m via the existing `floorBrickIdx` helper in `src/components/dev/hawks-drawings.ts`. Requires a custom `ISeriesPrimitive` (lightweight-charts v5) that renders a `ctx.strokeLine` from top to bottom of the pane at the brick's x-coordinate. Pattern: ~80-line class with `paneViews()` returning an `IPrimitivePaneView` whose `renderer()` resolves the brick-index → pixel-x via `chart.timeScale().timeToCoordinate(brickIdx)`.
  2. **Rectangles / zones** — click-drag to define a `[startTime, endTime] × [lowPrice, highPrice]` rectangle on the 5m chart; renders as a filled translucent box, syncs to the higher TFs. Same primitive pattern but renders a filled `ctx.fillRect`. Drag interaction needs `chart.subscribeMouseDown` / `subscribeMouseMove` / `subscribeMouseUp` capture + a "currently drawing" preview state in the inspector.
  3. **localStorage persistence** — extend `useState<Drawing[]>` in `hawks-audit-inspector.tsx` to a custom hook `usePersistedDrawings(tradeId)` that reads/writes `localStorage` keyed by `hawks-audit-drawings:{tradeId}`. Skip if no `window` (SSR safety). Reset-on-trade-change behavior already works.
- **Fix shape**:
  1. Extend `Drawing` union in `src/components/dev/hawks-drawings.ts` with `VLineDrawing` and `RectDrawing` variants. Update `projectDrawingsForPane` to handle them.
  2. Add `vlines` and `rects` arrays to `ProjectedDrawings`. Add new ref maps to `RenkoPane`.
  3. Create `src/lib/chart/primitives/vline-primitive.ts` and `rect-primitive.ts` — each a class implementing `ISeriesPrimitive<UTCTimestamp>` with `paneViews()` returning a `IPrimitivePaneView` whose `renderer()` produces an `IPrimitivePaneRenderer` that calls into the v5 `BitmapCoordinatesRenderingScope`.
  4. Attach primitives to the candle series via `series.attachPrimitive(instance)`; detach on cleanup.
  5. Extend `DrawingToolbar` with two new tool buttons. Extend `handle5mClick` and add `handle5mMouseDown` / `MouseUp` for rect drag.
- **Files to touch**: `src/components/dev/hawks-drawings.ts`, `src/components/dev/hawks-audit-inspector.tsx`, `src/components/backtest/inspector/renko-pane.tsx`, plus 2 new primitive class files.
- **Date filed**: 2026-05-28.

### Hawks engine: quality multiplier tier-tagging (AAA/AA/A)

- **Priority**: P2
- **Effort**: M
- **Source**: 2026-05-27 — Hawks 7-step plan Steps 4 & 5 decision: MACD, VWAP, HTF pivots are quality multipliers, not gates.
- **What + Why**: Three indicator layers are verified correct in DB but not yet used by the engine: (a) 5m MACD (col 17); (b) VWAP D/M/S (cols 9/10/11); (c) 15m/60m TOPOS E FUNDOS pivots (not loaded into DB). When all three align with entry direction the trade is AAA. Two: AA. One: A. This classification should be stored on `BacktestTrade` and surfaced in the trade-chart modal and day breakdown. Loader also needs to project 15m/60m pivot values onto 5m bricks (currently TOPOS E FUNDOS columns in 15m/60m CSVs are read by the pivot probe but not ingested).
- **Date filed**: 2026-05-27.

### User-created saved catalogs for `hawks_user_catalog` (DB-backed)

- **Priority**: P3
- **Effort**: M
- **Source**: 2026-05-29 — Ygor request after shipping the bundled-catalog dropdown (`src/app/actions/user-catalog-bundles.ts`). "User can create catalogs and they keep saved."
- **What + Why**: The user-catalog backtest mode now lets traders pick from the 20 dev/test fixtures in `data/hawks/user-entries/*.json`. Next step: let the user **save their own catalogs** so they survive across sessions and aren't lost the moment they refresh the page. Each catalog = `{ name, description?, entries: UserEntry[] }` keyed to the logged-in user.
- **Fix shape**:
  1. New table `user_catalogs` (id, userId, name, description, entries jsonb, createdAt, updatedAt). Drizzle migration via `pnpm db:generate`.
  2. Server actions in `src/app/actions/user-catalog-bundles.ts`: `listUserCatalogs()`, `saveUserCatalog(name, entries)`, `deleteUserCatalog(id)`. Merge user catalogs into the same `CatalogBundle[]` response so the UI dropdown picks them up automatically — current shape was designed for this extension.
  3. In `user-catalog-entry-section.tsx`: add a "Save current catalog as…" button (input + save). Group bundled vs. user-saved in the dropdown via `SelectGroup`.
  4. Optional: import/export — let traders dump a saved catalog back to JSON and re-import on another machine.
- **Out of scope**: Catalog sharing across users; per-catalog versioning; conflict resolution for concurrent edits.
- **Date filed**: 2026-05-29.

### Emit `entryBrickIndex` / `exitBrickIndex` from the backtest engine — drop lossy time→brick reconstruction in the inspector

- **Priority**: P2
- **Effort**: M
- **Source**: 2026-05-26 — `BUG-2026-05-26-2` post-mortem (`docs/postMorten/frontend.md`) + Hawks inspector live debugging. Ygor's spec: in Hawks methodology entry brick ≠ exit brick always; the same-brick collapse we hit was a mapping artifact, not a real trade.
- **What + Why**: Today the engine emits `BacktestTrade.entryTime`/`exitTime` as **candle timestamps** (`src/lib/backtest/engine.ts:445,659`). The inspector then reconstructs brick indices via `findBrickIndexForTime` — a nearest-time search on `bricks.closeTimestamp[]`. This is lossy: many 5m candles produce **zero** bricks, so two distinct trade-candle timestamps can nearest-collapse to the same intermediate brick. The defensive `b > a` guard (added 2026-05-26 in `backtest-overview-chart.tsx` and `renko-pane.tsx`) prevents the Lightweight-Charts assertion crash, but the segment is silently omitted — visual fidelity suffers and the underlying mapping bug is hidden.
- **Fix shape**:
  1. Renko-pipeline run already produces `bricks[]` with stable indices; have the engine record `entryBrickIndex` and `exitBrickIndex` on each trade alongside `entryTime`/`exitTime` (`src/lib/backtest/engine.ts:408–445,654–660`).
  2. Extend `BacktestTrade` in `src/types/backtest.ts` with two optional `number | null` fields (optional to keep cached non-Hawks results valid).
  3. Inspector + overview prefer `entryBrickIndex` when present, fall back to `findBrickIndexForTime` only for legacy trades.
  4. Bump `BacktestResult.engineVersion` to `"hawks-v0.3"` so the UI can flag old cached runs that lack the field.
- **Out of scope**: Re-running every cached backtest. Old `hawks-v0.2` results stay readable via the timestamp fallback.
- **Date filed**: 2026-05-26.

---

## E2E / Test Infrastructure

### Add browser `console.error` listener to Playwright fixture to surface client-side errors

- **Priority**: P3
- **Effort**: S
- **Source**: 2026-05-21 test audit on `feat/hawks-mode-v0` — no `page.on('console', ...)` handlers exist anywhere in the e2e suite; browser-side `console.error` calls (uncaught promise rejections, React hydration errors, failed fetch calls logged silently) are completely invisible to the test runner.
- **What + Why**: Add a shared Playwright fixture (or `test.beforeEach` in `e2e/fixtures/`) that registers `page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })` and fails/warns after each test if unexpected errors were collected. This would have caught the `R$ → BRL` `Intl.NumberFormat` crash (which logged a `RangeError: Invalid currency code`) before it reached a smoke-test session. Avoid failing on known benign warnings (Next.js dev-mode verbose output) using an allowlist regex. Reference: Playwright docs on `ConsoleMessage`.
- **Date filed**: 2026-05-21.

### Triage 5 pre-existing flaky tests in `e2e/tests/settings.spec.ts` exposed by networkidle migration

- **Priority**: P2
- **Effort**: S
- **Source**: 2026-05-22 — Item 1 verification run after Stream B's networkidle migration. 5 tests fail with timeouts, all using fragile selectors that depended on the implicit timing buffer that `networkidle` provided.
- **What + Why**: Five tests fail when the dev server returns slightly slower than the assertion budget:
  - `settings.spec.ts:113 should display current account info` (mobile) — uses `:has-text("Name")` (matches anything)
  - `settings.spec.ts:121 should display account type selector` (mobile) — uses `:has-text("Type")` (matches anything)
  - `settings.spec.ts:190 should display assets list` (chromium) — falls back to `table` selector if no test-id; depends on seeder providing assets for the test user
  - `settings.spec.ts:362 should display timeframes list` (chromium) — `getByText(/1 minute|5 minutes|...)`; depends on seeded default timeframes
  - `settings.spec.ts:377 should open timeframe form when clicking Add` (chromium) — falls back to `form` selector
- Pre-existing fragility — not a regression from Stream B's migration; the migration just exposed it. Fix by (a) adding stable `data-testid`s in the UI components, (b) seeding default assets/timeframes for the test admin user, or (c) tightening selectors to specific text patterns rather than substring matches.
- **Date filed**: 2026-05-22.

### Move monte-carlo orchestration integration tests to a real DB harness

- **Priority**: P3
- **Effort**: M
- **Source**: 2026-05-22 — Item 3 extracted pure orchestration logic (commits `e0a5e790`, `e60d32e4`) into `src/lib/monte-carlo/` so the orchestration is unit-testable. The DB-touching path of `src/app/actions/monte-carlo.ts` still has no integration test.
- **What + Why**: Add integration tests for `runComparisonSimulation` and `runSimulationV2` end-to-end against the test DB. Verify the action correctly composes the auth check → DB query → orchestration → response wrapping. Skipped from the unit suite intentionally (per the same gotcha rationale documented in `docs/gotchas.md`). Suggested home: `e2e/tests/monte-carlo.spec.ts` (currently UI-focused) — add a server-action subgroup, or create `src/__tests__/integration/monte-carlo.test.ts` with a real test DB connection.
- **Date filed**: 2026-05-22.

---

## Layout & Theming (from 2026-05-29 scan)

### Verify HAWKS `DailyBiasPanel` uses `FeatureStamp` for band header (Wave 9 convention)

- **Priority**: P2
- **Effort**: XS
- **Source**: `docs/scans/2026-05-29-layout-drift-from-core.md` — finding #14.
- **What + Why**: The 2026-05-29 scan flagged that `src/app/[locale]/(app)/journal/page.tsx:19` renders `<DailyBiasPanel />` but the scan didn't read the panel internals to verify `FeatureStamp` is wired at the band title row per Wave 9 convention. 5-minute read; either confirm it's already correct, or wire `FeatureStamp` in if missing.
- **Date filed**: 2026-05-29.

### Refine light-theme Axion Score tier-tone hexes

- **Priority**: P3
- **Effort**: XS
- **Source**: `docs/scans/2026-05-29-layout-drift-from-core.md` — RC-4 follow-up.
- **What + Why**: The 2026-05-29 scan added 5 tier-tone tokens (`--color-tier-{elite,forte,solido,building,attention}`) plus `--color-bronze-highlight` and `--color-bronze-deep` to both theme blocks. The dark-theme values match the original designed bronzes; the light-theme values were approximated as progressively darker shades without a designer pass. Worth a designer review for legibility on the stone-white paper background and contrast against the cool-neutral bg-100/200/300 stack.
- **Date filed**: 2026-05-29.

### Pull `fractal-plan/plan-section.tsx` card chrome through `<Panel>`

- **Priority**: P3
- **Effort**: XS
- **Source**: `docs/scans/2026-05-29-layout-drift-from-core.md` — still-armed #4.
- **What + Why**: `src/components/fractal-plan/plan-section.tsx:24` still has hand-rolled chrome (`rounded-lg border border-bg-300 bg-bg-200 p-m-400`). Same RC-1 pattern but in a section primitive. Migrate to `<Panel padding="md">` (matches the `p-m-400` exactly per panelVariants.md).
- **Date filed**: 2026-05-29.

### Migrate chart empty-state placeholder heights

- **Priority**: P3
- **Effort**: S
- **Source**: `docs/scans/2026-05-29-layout-drift-from-core.md` — still-armed #3.
- **What + Why**: Empty-state divs in chart components use `flex h-[180px]` / `flex h-[120px]` / `flex h-[200px]` for the "no data" placeholder. Different pattern from `ChartContainer` heights (which were migrated), but same drift class. Either reuse `h-chart-*` tokens or add a dedicated `--height-empty-state-*` family. Files: `dashboard/{cumulative-pnl-chart,daily-pnl-bar-chart,day-equity-curve,day-detail-modal,day-trades-list,performance-radar-chart}.tsx` and `analytics/{day-of-week-chart,holding-period-chart,hourly-performance-chart,session-asset-table}.tsx`. Detector: `rg -n 'flex h-\[[0-9]+px\] items-center' src/components/{dashboard,analytics}/`.
- **Date filed**: 2026-05-29.

### QA pass: review calculations across features (feature-by-feature audit)

- **Priority**: P3
- **Effort**: L (multi-session — one feature per slot)
- **Source**: 2026-05-29 — Ygor request after seeing OPTIMIZE deliver useful insights on PR #10. Quote: "I'm just trusting the calculations, but they show very important insights." Flagging for an explicit verification pass since the tool's value depends on the numbers being right and they've grown organically without a unified audit.
- **What + Why**: Across the app, several features compute non-trivial financial / statistical metrics where a math bug silently distorts every downstream decision. No central audit exists today. Worth a deliberate feature-by-feature pass to verify each calculation against a paper-traced expected value. Suspects in order of consequence:
  1. **Backtest engine** (`src/lib/backtest/engine.ts`, `computeMetrics`) — profit factor, win rate, max drawdown, Sharpe, avg R, equity curve, day breakdown. Verify against a 5–10 hand-computed trade fixture.
  2. **Hawks user-catalog outcome math** (`src/lib/backtest/modules/entry/user-catalog.ts` + stop/target modules) — BE activation, 1R/3R brick math, EOD force-close. Already partially verified by the 86% catalog match (per the existing P1 backlog entry) but the 14 mismatches are still open.
  3. **Tier analytics** (`src/lib/backtest/tier-analytics.ts`) — per-tier PF, drawdown, win rate. Re-uses engine math but slices by tier; verify the slicing.
  4. **Breakeven filter** (`src/lib/backtest/breakeven-filter.ts`) — re-uses `computeMetrics` / `buildEquityCurve` after removing BE trades; verify the "drop and recompute" produces the same numbers as "compute then subtract."
  5. **OPTIMIZE Pareto frontier** (`src/lib/optimize/pareto.ts`) — O(n log n) sweep is correct in theory; verify edge cases (ties, single point, all-equal PF).
  6. **OPTIMIZE robustness rule** (`src/lib/optimize/robustness.ts`) — the `OOS PF ≥ 0.7 × IS PF` thresholding; verify Infinity / NaN handling.
  7. **Monte Carlo orchestration** (`src/lib/monte-carlo/`) — geometric vs arithmetic Sharpe, percentile estimators, equity-curve overlays. High-consequence numbers.
  8. **Tax recompute** (`src/lib/tax/recompute-month.ts` — PROTECTED PATH, do not modify) — already documented as single source of truth; verify against a known monthly fixture before any future change.
  9. **Risk simulation + equity-shield** — drawdown projections, ruin probability. Verify against analytical bounds (Kelly, half-Kelly).
  10. **Journal P&L aggregation** — date-bucketed pnl, week/month rollups; verify against a hand-traced 30-day fixture.
- **Fix shape per feature**:
  1. Pick a small known-good fixture (10 trades, hand-traced).
  2. Run the feature's calc on the fixture.
  3. Diff field-by-field against the paper-traced expected values.
  4. Document discrepancies in `docs/scans/calculations-audit/{feature}.md`.
  5. Fix or open a bug entry; tag with `BUG-{date}-{slug}` and write a post-mortem.
- **Out of scope**: Performance / numerical-stability audits (these are about CORRECTNESS only — "is the formula right" not "is it fast"). Cross-feature consistency (separate concern: "do two features show the same number for the same trade").
- **Done when**: Each of the 10 features above has a written audit + green-light or a filed bug. Audit docs sit in `docs/scans/calculations-audit/`.
- **Why P3**: Nothing is currently known to be broken. This is preventive due diligence, not a fix. Move up to P1 the moment any specific calculation is suspected of being wrong.
- **Date filed**: 2026-05-29.

### Remove legacy `SweepConfigPanel` — user_catalog migration to StrategySweepBuilder

- **Priority**: P3
- **Effort**: M
- **Source**: 2026-05-29 — Phase C.6 of the OPTIMIZE sweep-tree refactor. `HawksSweepBuilder` and `OrbSweepBuilder` both route through the generalized `StrategySweepBuilder` (committed d856fd73). The legacy panel is dead code for Hawks (flag-gated) and ORB routes through inline sweep (shipped). Only `user_catalog` still routes through `SweepConfigPanel`.
- **What + Why**: Once `user_catalog` entry type routes through `StrategySweepBuilder` instead of the legacy panel, the legacy surface can be deleted. This unblocks deletion of `SweepConfigPanel`, `HAWKS_SWEEPABLE_PARAMS`, `ORB_SWEEPABLE_PARAMS`, `DEZK_SWEEPABLE_PARAMS`, `generateRecipeGrid`, `countCombinations`, and the `activeRanges` state from `optimize-content.tsx`.
- **Fix shape**:
  1. Decide user_catalog: either share `HAWKS_LEAVES` or define `USER_CATALOG_LEAVES`. Recommendation: share Hawks leaves — user_catalog's sweepable surface is the post-entry recipe (stop / target / sizing), identical shape.
  2. Extend `inlineSweepBundle` in `optimize-content.tsx` to handle `recipe.entry.type === "user_catalog"` and render `UserCatalogSweepBuilder` (or reuse `HawksSweepBuilder` with aliased labels).
  3. Delete `SweepConfigPanel`, legacy sweepable params exports, `STRATEGY_PARAMS_REGISTRY`, and `activeRanges` state.
  4. Delete the `OPTIMIZE_INLINE_SWEEP_HAWKS_ENABLED` feature flag.
- **Done when**: `user_catalog` sweep selects through `StrategySweepBuilder`; `SweepConfigPanel` deleted; `pnpm lint`, `tsc`, tests, e2e green.
- **Date filed**: 2026-05-29.

### Propagate "feature component owns width" rule to remaining `mx-auto max-w-*` callers

- **Priority**: P3
- **Effort**: M
- **Source**: `docs/scans/2026-05-29-layout-drift-from-core.md` — still-armed #5.
- **What + Why**: The scan moved width constraints from 5 page routes to their feature components. Several other pages still have `mx-auto max-w-*` at the page level: `journal/[id]/page.tsx:155`, `journal/new/page.tsx:57`, `journal/[id]/edit/page.tsx:37`, `playbook/[id]/page.tsx:152`, `playbook/new/page.tsx:129`, `plan/layout.tsx:15`, `edit-strategy-form.tsx:199`, `command-center-content.tsx:145`. The scan deliberately did not touch them because their respective Wave 1/4/5 sweep logs documented the page-level wrapper as canonical at the time. Worth a pass to either propagate the new rule, or formally exempt these pages with a docs note.
- **Date filed**: 2026-05-29.

---

## Performance (from 2026-06-02 perf scan #2 — backtest/optimize/PDF)

### LIB-14 — Offload `@react-pdf/renderer` `renderToBuffer` to a worker thread

- **Priority**: P2
- **Effort**: M
- **Source**: `docs/scans/2026-06-02-backtest-optimize-perf.md` — LIB-14 (critical, deferred).
- **What + Why**: `src/lib/pdf/generate-report-pdf.ts:28-62` calls `renderToBuffer` synchronously. Each PDF render blocks the Node event loop ~300-500ms for a multi-page report. With 2+ concurrent users, the second request queues behind the first. Real fix requires Node `worker_threads`: ship the React tree + data to a worker, render there, return the buffer. Significant infra (worker spawn, message serialization, error propagation) — out of scope for a /scan pass.
- **Fix shape**:
  1. New `src/lib/pdf/render-worker.ts` — receives `{templateName, props}`, calls `renderToBuffer`, returns buffer.
  2. New helper `renderInWorker(template, props)` that pools workers.
  3. Update `generate-report-pdf.ts` callers to use the helper.
  4. Add worker pool size config (`PDF_RENDER_CONCURRENCY` env var) defaulting to `os.cpus().length / 2`.
- **Done when**: PDF render no longer blocks the event loop; concurrent users don't queue.
- **Date filed**: 2026-06-02.

### OPT-003 — Row virtualization for `runs-comparison-table.tsx`

- **Priority**: P3
- **Effort**: M
- **Source**: `docs/scans/2026-06-02-backtest-optimize-perf.md` — OPT-003 (medium, deferred).
- **What + Why**: For 1000+ sweep runs, pagination at 20 rows/page produces 50+ pages of UX friction. Virtualization keeps DOM small and enables seamless scroll. `@tanstack/react-virtual@^3.13.26` is **already installed** (added during scan #2 prep) but not yet integrated — the table uses the generic `@/components/ui/data-table` wrapper, and integrating virtualization there would touch all 13+ other `DataTable` callers.
- **Fix shape**:
  1. Add a `virtual?: boolean` prop to `DataTable` that switches the body to `useVirtualizer`.
  2. Existing pagination behavior preserved when `virtual` is false (default).
  3. Pass `virtual` from `runs-comparison-table.tsx`.
- **Done when**: 5K-run sweep table scrolls at 60fps without pagination; other DataTable callers unaffected.
- **Date filed**: 2026-06-02.

### OPT-004 — Canvas-based heatmap for large parameter grids

- **Priority**: P3
- **Effort**: L
- **Source**: `docs/scans/2026-06-02-backtest-optimize-perf.md` — OPT-004 (medium, deferred).
- **What + Why**: `parameter-heatmap.tsx:457` renders a 50×50 grid as 2500 DOM nodes. Canvas would render 100× faster and use a fraction of the memory. The blocker is interactivity: current cells have hover tooltips, click handlers, accessibility hooks. Canvas-equivalent of these is achievable but a significant feature-quality change (hit-testing, tooltip portal, focus management) — needs design review, not just a perf pass.
- **Fix shape**:
  1. Audit interactivity surface — list every cell interaction.
  2. Decide which interactions stay (hover tooltip likely yes, full click-context-menu maybe no).
  3. Render cells to canvas; reuse a single overlay div for tooltip on hover.
  4. Implement keyboard navigation via grid coords (not focusable DOM).
  5. DOM fallback for <500 cells.
- **Done when**: heatmaps with 1000+ cells render in <16ms; existing interactivity preserved or explicitly migrated.
- **Date filed**: 2026-06-02.
