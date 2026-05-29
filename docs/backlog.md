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

### OPTIMIZE Phase 1b — Run metadata + provenance stamping

- **Priority**: P1
- **Effort**: S
- **Source**: 2026-05-29 — `docs/design/optimize-roadmap.md` Phase 1b. Brainstorm session post-PR #9.
- **What + Why**: Every `OptimizationRun` should carry: dataset hash (candle subset), candle count, date range hash, engine version, recipe-config hash, seed, sweep-id. Today `storage.ts` (42 lines) writes runs to localStorage with no provenance — re-running later doesn't reproduce, and there's no way to tell which dataset/engine a run came from. Land this **before** Phase 1a so walk-forward results carry provenance from day one. Cheap now, painful to retrofit.
- **Fix shape**:
  1. Extend `OptimizationRun` (in `src/types/backtest.ts`) with the metadata fields above. All optional for back-compat.
  2. Bump `schemaVersion` in storage. Legacy runs (no version field) are read-only and flagged in UI.
  3. Stamp metadata in `sweep-runner.ts` `onmessage` handler (`runs become richer here`).
  4. Surface metadata in `run-detail-panel.tsx` — a "Provenance" collapsible section.
- **Out of scope**: Migration UI for legacy runs (just flag them). DB-backed storage (Phase 4).
- **Done when**: Every new run has all 7 metadata fields. Legacy runs render with a "legacy, no provenance" tag. Re-running the same recipe on the same candle subset produces identical hashes.
- **Date filed**: 2026-05-29.

### OPTIMIZE Phase 1a — Walk-forward / out-of-sample split

- **Priority**: P1
- **Effort**: M
- **Source**: 2026-05-29 — `docs/design/optimize-roadmap.md` Phase 1a. The single feature that turns OPTIMIZE from a curiosity into a trustworthy tool.
- **What + Why**: Today OPTIMIZE runs grid search and reports best-on-known-data. No held-out validation = users get overfit recommendations. Add a date-split slider (default 70/30) that runs each combo twice in the worker: in-sample to optimize, out-of-sample to report. Every result carries both metric sets and a derived `oosRobust` flag (default rule: "OOS PF ≥ 0.7 × IS PF"). Comparison table gets OOS columns + a "robust only" filter.
- **Fix shape**:
  1. Sweep config panel (`src/components/optimize/sweep-config-panel.tsx`): add a `<Slider>` for the IS/OOS split, default 70/30.
  2. `OptimizationRun` (in `src/types/backtest.ts`): extend with `summaryIS`, `summaryOOS`, `equityCurveIS`, `equityCurveOOS`, derived `oosRobust: boolean`.
  3. `backtest-worker.ts`: run each combo twice with different date slices. Stream both results in one `ProgressMessage`.
  4. `runs-comparison-table.tsx`: add OOS columns. Add a "Robust only" filter chip.
  5. Robustness rule: extract into `src/lib/optimize/robustness.ts` so it's tunable in one place. Document the 0.7 threshold there.
- **Out of scope**: K-fold (file as Phase 1a follow-up if single-split feels too noisy on 20-day catalogs). Custom robustness rules in the UI.
- **Done when**: A Hawks sweep across 20 days runs as 14-train + 6-test. Every result row shows both PFs. "Robust ✓" filter works. The robustness threshold is documented in code and surfaced in a tooltip.
- **Depends on**: Phase 1b shipped first.
- **Date filed**: 2026-05-29.

### OPTIMIZE Phase 1c — Pareto frontier view

- **Priority**: P1
- **Effort**: S
- **Source**: 2026-05-29 — `docs/design/optimize-roadmap.md` Phase 1c.
- **What + Why**: Today users sort by one metric at a time. Profit factor and max drawdown trade off — you can't read that trade-off in a sorted table. A `(PF, maxDrawdown)` scatter with the Pareto frontier highlighted lets users see the shape of the trade-off and pick a point on the curve that matches their risk preference. Generic (works for every strategy), small (~200 lines), high-value.
- **Fix shape**:
  1. New tab in `optimize-content.tsx` results panel: "Pareto".
  2. New component `src/components/optimize/pareto-scatter.tsx` (~200 lines). Use the existing chart primitive (TradingView lightweight-charts or whatever the equity-overlay already uses) for consistency.
  3. Frontier computation in `src/lib/optimize/pareto.ts`: classic O(n log n) scan. Highlight frontier points; dim dominated points.
  4. Hover / click on a point → opens run-detail-panel.
  5. When walk-forward is active (Phase 1a shipped), color points by OOS-robust status.
- **Out of scope**: 3D Pareto (PF × drawdown × trade count). Constraint mode (Phase 3d).
- **Done when**: Scatter renders for any sweep with ≥10 runs, frontier highlighted, hover/click round-trips to run detail. With Phase 1a active, robust points visually distinguished.
- **Depends on**: Phase 1a shipped (so OOS data exists to color by).
- **Date filed**: 2026-05-29.

### OPTIMIZE Phase 3a — Strategy registry refactor (kills the ORB-vs-else binary)

- **Priority**: P2
- **Effort**: S
- **Source**: 2026-05-29 — `docs/design/optimize-roadmap.md` Phase 3a. Surfaced when shipping PR #9 (Hawks user-catalog mode falls through to dezK params today).
- **What + Why**: `parameter-grid.ts:474,585,657` has `recipe.entry.type === "orb_breakout" ? ORB_PARAMS : DEZK_PARAMS`. Any new strategy (Hawks, future strategies) silently falls through to dezK and the sweep panel renders meaningless knobs. Refactor to a registry: each preset module exports its own `sweepableParams`; `getSweepableParams` looks up by `recipe.entry.type` from a `Map`.
- **Fix shape**:
  1. Define a `SweepableParam[]` export contract in `src/types/backtest.ts` (re-using the existing types from `parameter-grid.ts`).
  2. Move `ORB_PARAMS` and `DEZK_PARAMS` into their respective preset modules (`orb-presets.ts`, `dezk-presets.ts`).
  3. Replace the binary switch in `parameter-grid.ts` with a registry: `STRATEGY_PARAMS_REGISTRY: Map<EntryType, SweepableParam[]>`.
  4. `getSweepableParams` becomes a registry lookup with a fall-through "unsupported strategy" empty array (sweep panel shows "no params available for this strategy").
- **Out of scope**: Adding Hawks params (Phase 3b is the entry that does that).
- **Done when**: ORB and dezK still work, registry is the single source of truth, adding a strategy requires only exporting `sweepableParams` from its preset module.
- **Date filed**: 2026-05-29.

### Hawks engine: fine-tune for better backtest outcomes (via OPTIMIZE)

- **Priority**: P1
- **Effort**: M (down from L now that OPTIMIZE absorbs the harness work)
- **Source**: 2026-05-29 — original ask was a one-off `scripts/sweep-hawks.ts`; re-shaped to depend on OPTIMIZE Phases 1 + 3a + 3b after the OPTIMIZE roadmap brainstorm (`docs/design/optimize-roadmap.md`).
- **What + Why**: The user-catalog mode validates engine _outcomes_ (BE/ST/GA/EOD) match the catalog on trades the engine fires. Headline metrics (PF, win rate, max drawdown, Risk:Return) are still sub-optimal because we've been tuning the entry detector against a fixed parameter set, not the whole engine against outcome metrics. Once OPTIMIZE Phase 1 (walk-forward + provenance + Pareto) and Phase 3a/3b (strategy registry + Hawks params) ship, this entry becomes: run OPTIMIZE on `hawks_v0`, pick the winning combo from the Pareto frontier that passes OOS robustness, freeze it as `hawks_v0_tuned`.
- **Fix shape**:
  1. **Use OPTIMIZE** (no separate script). Sweep these params via the Hawks registry (Phase 3b):
     - `retracementMin` (1, 2, 3 bricks)
     - `cooldown` (3, 5, 7 bricks)
     - BE `triggerPct` (75, 100, 150, 200 % of risk)
     - Stop distance multiplier (1×, 2×, dynamic-by-favorability — connects to the 14-label-mismatches entry)
     - Target multiplier (2R, 3R, trailing)
     - Quality gates level (off/lite/standard/strict)
  2. **Walk-forward** comes from Phase 1a (14-train / 6-test default).
  3. **Pareto reading** comes from Phase 1c (PF vs maxDrawdown scatter).
  4. **Per-tier breakdown**: re-use `tier-analytics.ts` (shipped in PR #9) — sweep params within AAA / AA / A buckets separately. Cross-coordinate with the "quality multiplier tier-tagging" P2 entry.
  5. **Freeze the winner**: add a preset variant `hawks_v0_tuned` once OPTIMIZE surfaces a robust combo. Provenance comment records sweep date, objective, IS/OOS numbers. Presets are immutable once shipped; future tunes spawn `hawks_v1_tuned`.
- **Out of scope**: Live / online optimization. Cross-asset generalization (WINFUT-only). Bayesian / genetic search.
- **Done when**:
  - A Hawks sweep runs via OPTIMIZE with walk-forward and Pareto enabled.
  - A robust combo (OOS PF ≥ 0.7 × IS PF) is picked from the Pareto frontier.
  - `hawks_v0_tuned` preset shipped with provenance comment.
  - One-page summary in `docs/` of the Pareto frontier + chosen point.
- **Depends on**: OPTIMIZE Phase 1a + 1b + 1c + 3a + 3b shipped.
- **Date filed**: 2026-05-29.

### Hawks autonomous engine: reproduction stuck at 51% — quality gates next

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

### Resolve 13 pre-existing TS errors on `feat/optimize-phase-1-trust-foundations`

- **Priority**: P0
- **Effort**: S
- **Source**: `docs/scans/2026-05-29-layout-drift-from-core.md` — Phase 4 verification confirmed 13 baseline TS errors exist on this branch independent of the scan's edits.
- **What + Why**: Branch cannot ship until these resolve. Errors: `<Label>` missing required `id` prop (9 sites — `backtest-content.tsx:602`, `hawks-quality-controls.tsx` lines 39/71/318/335/352, `user-catalog-entry-section.tsx` lines 141/152/168); `Scatter` removed from lucide-react (`optimize-content.tsx:29`); `ChartContainer` `config` prop mismatch (`pareto-scatter.tsx:84`); `r.stop.breakeven` possibly undefined (`hawks-presets.ts:157`); `toISOString` called on string (`provenance.ts:24`).
- **Date filed**: 2026-05-29.

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

### Propagate "feature component owns width" rule to remaining `mx-auto max-w-*` callers

- **Priority**: P3
- **Effort**: M
- **Source**: `docs/scans/2026-05-29-layout-drift-from-core.md` — still-armed #5.
- **What + Why**: The scan moved width constraints from 5 page routes to their feature components. Several other pages still have `mx-auto max-w-*` at the page level: `journal/[id]/page.tsx:155`, `journal/new/page.tsx:57`, `journal/[id]/edit/page.tsx:37`, `playbook/[id]/page.tsx:152`, `playbook/new/page.tsx:129`, `plan/layout.tsx:15`, `edit-strategy-form.tsx:199`, `command-center-content.tsx:145`. The scan deliberately did not touch them because their respective Wave 1/4/5 sweep logs documented the page-level wrapper as canonical at the time. Worth a pass to either propagate the new rule, or formally exempt these pages with a docs note.
- **Date filed**: 2026-05-29.
