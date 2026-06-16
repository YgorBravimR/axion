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

## Journaling Workflow

### Two-phase journaling: thin daily entry + periodic enrichment

- **Priority**: P1
- **Effort**: M (~7.5 days, see plan doc for step-by-step breakdown — Steps 1-7 plus 5b)
- **Source**: 2026-06-12 — brainstorm session with Arch. Full session captured at [`docs/plans/two-phase-journaling-with-enrichment.md`](plans/two-phase-journaling-with-enrichment.md). The plan doc has the spec locked across 6 phase appendices (A–F: schema, parser, enrichment passes, review UI, build sequence, definition of done). All design decisions are locked; only execution remains.
- **Sequencing**: **Blocked behind** the "Hawks autonomous engine: reproduction 51% → improve via quality gates" P1 entry below. Do not start until Hawks reproduction > ~70%; the indicator-readout enrichment pass is reliable now, but the design bundles all enrichment passes into one shipped feature.
- **What + Why**: Hand-typing every trade's SL, target, BE moment, tier, gate state, indicator alignment, MFE/MAE every day is the friction that kills journaling discipline today. Two-phase design splits the work: a **thin daily form** captures only the execution facts the Zod schema marks mandatory (entry/exit times, side, qty, prices, asset — ~30 seconds per trade), and a **weekly enrichment ritual** auto-derives all methodology context from candles + the Profit Pro `orders.csv` (authoritative for executed numbers) + Hawks indicator readout + deterministic OCO SL/target rule. Trader reviews each enriched trade in a stepped, day-grouped UI, accepts/edits per field, commits. Re-runnable: every enrichment writes a snapshot so when Hawks engine improves the trader can re-enrich and diff.
- **Locked decisions** (read [`docs/plans/two-phase-journaling-with-enrichment.md`](plans/two-phase-journaling-with-enrichment.md) for full context, including the rationale for each):
  1. Daily mandatory set = whatever the Zod schema at [`src/lib/validations/trade.ts`](../src/lib/validations/trade.ts) marks non-optional. **One form**, no fork.
  2. Playbook is optional at entry-time, editable at enrichment-time, can stay empty. Trader's call.
  3. SL is **deterministic** per OCO rule (one global formula, e.g. Hawks = entry ± 2×brickSize favorable / 1×brickSize against). Trader **never** moves stop — this is locked.
  4. `orders.csv` is **source of truth** for execution numbers (entry/exit times, qty, prices, P&L, MFE, MAE, drawdown). Axion's candle-derived calculations are sanity checks; on disagreement, orders.csv wins and the diff is logged.
  5. Hawks engine in enrichment = **indicator readout only** (15m gate, 60m gate, MACD, VWAP, AJUSTE — each tagged favorable/contrary). State-machine tier classification deferred until reproduction > 70%; trader hand-tags tier in the meantime.
  6. Review UI: stepped, trade-by-trade, day-grouped headers, prev/next keyboard navigation. **No** approve-entire-day-at-once.
  7. Enrichment is re-runnable with a snapshot history table (`trade_enrichment_snapshots`). Three trigger modes: bulk by date range, single trade, all pending.
  8. **Out of scope** (decided, not deferred): boletas (`test.csv`) parsing, Profit DLL bridge (R$4k/mo paywall), audio capture, real-time enrichment, multi-tenant, "quick-add" simplified form variant.
- **Open at build kickoff** (🟡 in the plan doc's decision log):
  - Enrichment-snapshots table schema shape
  - Where the Enrich button lives in nav
  - Account scoping from `Conta:` header in `orders.csv`
  - Conflict resolution default (proposed: orders.csv overwrites, diff banner shown once)
- **Done when**: trader's average time-to-journal-a-trading-day drops from ~15-20 min daily to ~2 min daily + ~10 min weekly review; all enriched trades carry full methodology context with no hand-typed SL/target/MFE/MAE/indicator-quality fields; `orders.csv` numbers and Axion's stored numbers match for ≥95% of trades; re-enrichment after Hawks engine improvement produces a sensible diff view without data corruption.
- **Date filed**: 2026-06-12.

---

## Backtest / Inspector

### Hawks engine — per-booster outcome audit (booster tier ordering is U-shaped)

- **Priority**: P1 — directly affects the trustworthiness of every tier-based filter, optimization target, and UI label across the Hawks engine.
- **Effort**: M (~3h — instrument BoosterChecklist into `BacktestTrade.quality` or re-compute via secondary engine pass; tabulate per-booster WR/avgR; identify mis-signed booster(s))
- **Source**: 2026-06-16 tier sanity audit (`docs/scans/2026-06-16-tier-sanity.md`). After 15m plumbing made AAA reachable, the empirical ordering is **AAA(35% WR, +R$10/trade) > AA(29%, -R$8) > A(28%, -R$6) < B(37%, +R$18)**. B-tier outperforms AAA on every metric with the largest sample (n=91). The U-shape implies one or more boosters is firing inversely to outcomes — adding boosters makes the trade worse, not better, in the middle of the distribution.
- **Hypothesis**: on a Renko engine firing INTO extension, "ema5m aligned" or "vwap aligned" means price has already moved past those references, which is the classic "late entry" footprint. The booster reads as a confirmation when it's actually a warning.
- **Steps**:
  1. Decide instrumentation path: (a) thread `BoosterChecklist` into `BacktestTrade.quality.contributions[]` (cleanest, persists for UI/storage), or (b) re-compute the checklist at each fire's brick in a secondary engine pass (cheaper, doesn't change trade shape).
  2. For each of the 5 boosters (htf15mAligned, htfPivotAligned, macdAligned, ema5mAligned, vwapAligned) tabulate: count of trades where it fired=true, count where false, WR/avgR per cohort.
  3. Identify mis-signed booster(s): any where `fires=true` cohort has WORSE WR/avgR than `fires=false`.
  4. Decide: invert the polarity (rename "aligned" → "anti-aligned"), remove from the checklist, or leave wired but down-weight.
- **Pointers**: audit script `scripts/audit-tier-sanity.ts`, booster checklist `src/lib/backtest/modules/entry/hawks-boosters.ts`, computation `src/lib/backtest/modules/entry/hawks-playbook.ts:computeBoosterChecklist`.

### Hawks engine — `keltnerOuterBlock` veto window (needs methodology spec from Ygor)

- **Priority**: P2 — blocked on a methodology clarification from Ygor
- **Effort**: S once the spec answer is in (~30 min — change the lookback constant, update tests, ship)
- **Source**: 2026-06-15 A/B audit (`docs/scans/2026-06-15-keltner-outer-block-ab.md`) found N=1 produces 0 vetoes. Window-sweep audit (`docs/scans/2026-06-15-keltner-window-sweep.md`) tested N=1..20 and found vetoes start firing at N=4, accumulate to 5 vetoes / R$ +346 by N=20. **Every vetoed trade across all window sizes is a stop-out or BE — zero winners removed.**
- **The result is tantalising but statistically insignificant**: only 5 trades caught across 8,280 bricks, cluster into 2 trading days. 100%-precision shape is what you'd expect if the methodology is real, but n=5 won't pass any honest stats bar.
- **Blocking question for Ygor**: Does the methodology's "outer-band exhaustion" signal imply a 1-brick veto (same brick only) or a wider "no entries for ~5-10 bricks after the exhaustion" zone? The book/Pedro's teaching is the source of truth — if the book says wider, ship wider even at low sample. If the book says same-brick only, remove the wiring (the audit shows the narrow interpretation is dead in practice).
- **Open questions** beyond the window-size answer:
  1. Should the veto also block on plain `TOUCH_KC2_*` (no confirmed reject)? Currently only confirmed rejects veto.
  2. If we ship the wider-window variant, is `keltnerNearBricks` (already in config, default 2) the natural place to store the lookback, or do we add `keltnerOuterBlockLookback`?
  3. Once spec is resolved and code lands, do we need a forward-test or more historical data before promoting the flag default-on?
- **Pointers**: `src/lib/backtest/modules/entry/hawks-playbook.ts:79-105` (`isKeltnerOuterVeto` — extend to take a brick history slice for the wider-window variant), `scripts/audit-keltner-outer-block-ab.ts` (the 1-brick A/B harness), `scripts/audit-keltner-outer-block-window-sweep.ts` (the lookback sweep).

### Hawks engine — fibo retracement anchor logic (deferred)

- **Priority**: P2
- **Effort**: M (1-2 days — needs another day-scrubbing pass with Ygor to pin down what "the right impulse" actually is across enough days to formalize the rule)
- **Source**: 2026-06-15 engine v0.10 fibo-lab session. We iterated through several `findDominantImpulse` heuristics — global deepest-low, most-recent local pivot pair with post-reversal confirmation, etc. — and ended at "most recent local FUNDO with `LOCAL_WINDOW=2` neighbors + impulse-start TOPO with `≥ minSwing` post-drop + retracement-peak strictly AFTER impulse-end + `≥ 2 × renkoSize` minimum retracement". The geometry is now usually right, but it's still wrong often enough on real days that we don't trust the T1/T2/T3 measured-move projections for production yet. The lab page (`/dev/fibo-lab`) renders all 10 days continuously with a global trade picker so the work is resumable.
- **What + Why**: the fibo measured-move target (Mode 3a/3b exit modes per spec §5) needs reliable `impulseStart → impulseEnd → retracementPeak` anchors at fire-time. Open questions:
  1. Should the impulse leg always be picked on **15m bricks**, or on a higher TF (60m) when the 60m leg is visible? Today's code uses 15m only.
  2. Is "most recent local pivot pair" the right semantic, or should we use the engine's **confirmed structural pivots** (the period-2 detector in `hawks-structural-pivots.ts`) and just pick the latest topo→fundo pair?
  3. The `requirePostReversal` toggle is currently asymmetric (impulse-end skips it, impulse-start requires it). On the rightmost edge of the data this is necessary, but it produces some odd anchors mid-day. May want a unified rule.
  4. The "last high fallback" (when no rally has formed yet) currently uses the brick AT/AFTER the fundo. When the fire IS the fundo brick the setup is rejected entirely — but should it use the fire brick's high instead?
- **Build sequence**:
  1. Use `/dev/fibo-lab` to scrub another 10 days, marking each trade's anchors as "correct" or "wrong" (and labeling WHY they're wrong — wrong leg, wrong peak, etc.).
  2. From the catalog, choose between (a) keep the current geometric local-pivot finder with tweaked thresholds, or (b) switch to the structural-pivot detector's output and forward-fill the latest topo→fundo pair.
  3. Promote the chosen logic from the lab action (`src/app/actions/hawks-engine-lab-data.ts:findDominantImpulse`) into the engine proper (`src/lib/backtest/hawks-htf-walker.ts` or a new module) so Mode 3a/3b lifecycle can consume it.
  4. Wire production fibo target into `simulateLifecycle` (currently the lifecycle simulator accepts a `targetPrice` parameter but no caller supplies a fibo-derived value yet).
- **What's already shipped on this work**:
  - `/dev/fibo-lab` page with global trade picker, focus-zoom around the selected trade, side-by-side 5m + 15m charts, crosshair sync, gate-trace diagnostic, demo-fire suppression when `findDominantImpulse` returns null. Keep this wired — it's the day-scrubbing tool.
  - Wick-based structural pivot direction classifier (engine-wide, see [`docs/gotchas.md`](gotchas.md) "Hawks structural pivots: direction is WICK-BASED").
  - R<N> brick-size convention codified ([`CLAUDE.md`](../CLAUDE.md) rule #0) — anchors and targets correctly convert `(size_5m − 1) × 5` to points.
  - Lab gates for the fibo-lab loosened from production thresholds: 5m/15m structure guards disabled, `legShapeOk` kept at production `≥4/≥2`. Production engine path retains all gates.
- **Done when**: real `mean_reversion` / `retracement` / `vwap_rejection` fires get reliable fibo target prices; Mode 3a/3b exit modes consume them in `simulateLifecycle`; the lab page shows the SAME anchors the engine uses (no lab-only finder); Ygor signs off after a fresh 10-day scrub.
- **Date filed**: 2026-06-15.

---

### Hawks engine — noise / chop discriminator per playbook (refine phase)

- **Priority**: P2
- **Effort**: M (1-2 days — exploratory: discriminator badge in lab, day-scrubbing pass with Ygor to mark "noise vs trade" bricks, then formalize the winning rule)
- **Source**: 2026-06-14 — engine lab review (Image #12). Demo path fires SHORT B twice inside a clearly choppy box; both fires pass every coded rule (60m gate, leg-shape ≥4/≥2, VB, 5m HH/LL running-extreme) but Ygor would not take either trade. Engine isn't wrong against stated rules — humans see "chop" as a Gestalt the rules don't yet encode.
- **What + Why**: build a noise/chop classifier the engine can read at fire-decision time. Three candidate rules — none obviously right, all need scrubbing against catalogued days:
  1. **Brick-ATR ratio**: average brick range / net price displacement over last N bricks. High ratio = chop.
  2. **Color-flip count**: number of color flips in last N bricks. ≥X flips in last 10 = chop.
  3. **Range-bound test**: rolling high − rolling low over last 20 bricks ≤ K renko-sizes = chop.
- **Build sequence**:
  1. Add a "noise score" badge row to the engine lab (`/dev/hawks-engine-lab`) — three cursor-reactive badges for the three candidates above.
  2. Day-scrub a catalog (~10 days) with Ygor marking each fire as "noise" or "OK".
  3. Pick the rule (or combination) that minimises false-positive noise fires without killing real-signal fires.
  4. Promote the chosen discriminator into each playbook's `evaluate()` (per the v0.9 spec, the noise rule lives INSIDE the playbook, not in the orchestrator). Each playbook gets its own threshold — `mean_reversion` may TREAT chop as signal (fires at the edges), `retracement` rejects chop entirely, `vwap_rejection` is orthogonal.
- **Locked design call (2026-06-14, Ygor)**: only canonical universal rule is 60m gate direction. All other rules live inside individual playbooks — discriminator IS a per-playbook concern.
- **Done when**: each playbook's `evaluate()` rejects fires that score "chop" by the chosen rule; Image #12-class fires no longer appear in the engine lab; a follow-up Ygor-led scrub of 10 days confirms no real-signal trades are killed.
- **Date filed**: 2026-06-14.

---

### Hawks engine — per-playbook engine variant (today's orchestrator is shared)

- **Priority**: P2
- **Effort**: L (2-3 days — refactor orchestrator into composable per-playbook engines + per-playbook config blocks; migrate the lab UI to a playbook-switcher view; preserve current Hawks orchestrator as the "all playbooks" mode)
- **Source**: 2026-06-14 — engine v0.9 review with Ygor. Today's `hawks-playbook` orchestrator (`src/lib/backtest/modules/entry/hawks-playbook.ts`) is a single state machine that dispatches to all 3 playbooks per brick. Ygor's manual-optimization workflow needs each playbook to be runnable in isolation (its own backtest, its own quality metrics, its own optimization knobs) without the others firing or contaminating the result.
- **What + Why**: today `processHawksPlaybookCandle` evaluates ALL playbooks per brick and picks the highest-priority hit. For per-playbook optimization Ygor needs:
  - **Per-playbook backtest preset** (`hawksV0_mean_reversion`, `hawksV0_retracement`, `hawksV0_vwap_rejection`) so each can be benchmarked alone.
  - **Per-playbook entry-module config block** so quality thresholds, leg sizes, etc. can be tuned without affecting siblings.
  - **Per-playbook engine state slot** — the shared orchestrator's `lastFireBrickIndex` cooldown is a single counter; running a single playbook should not be cooldown-coupled to fires from the others.
  - **Lab UI playbook switcher** — `/dev/hawks-engine-lab` should toggle between "all playbooks" view (today's behavior) and a "just this playbook" view.
- **Locked design call (2026-06-14, Ygor)**: 60m gate stays the universal rule across all variants. Each per-playbook engine still consumes the same `HtfWalker` snapshot.
- **Build sequence**:
  1. Extract each playbook's logic into its own `processSinglePlaybookCandle` entry function so it can run without the orchestrator.
  2. Add `EntryModuleConfig` variants `hawks_mean_reversion`, `hawks_retracement`, `hawks_vwap_rejection`.
  3. Add three presets to `hawks-presets.ts`.
  4. Engine-lab page picks one preset; the page-level config becomes a dropdown.
  5. The current `hawks_playbook` ("all playbooks" mode) stays as-is for the integrated view.
- **Done when**: each playbook can be backtested alone with its own preset; `/dev/hawks-engine-lab` has a playbook switcher; per-playbook fire metrics are reportable in isolation; the "all playbooks" view still works as today.
- **Date filed**: 2026-06-14.

---

### Indicator Lab: BRT offset hardcoded, ignores DST

- **Priority**: P3
- **Effort**: XS
- **Source**: 2026-06-13 — flagged during the `/finish-it` Codex pass on the Indicator Lab promotion (commit `9b404dd2`). `src/app/actions/hawks-isolation-data.ts` declares `BRT_OFFSET_MS = -3 * 60 * 60 * 1000` and uses it in `dateToBrt(ts)` to slice candles into BRT trading days.
- **What + Why**: Brazil dropped permanent DST in 2019, so for every date in the current parquet window the offset is correct and this is **purely a future-proofing concern**. But the constant is wrong-by-construction: if DST is ever reinstated (proposals surface every few years) or the asset definition shifts to a market that observes DST, every BRT-day boundary in the Indicator Lab will skew by one hour for half the year — Indicator Lab's catalog cross-references, day-so-far averages (rolling 200 / day-so-far), and 60m HTF gate slicing all silently drift. The bug is in the tool itself (admin-only `/indicator-lab` route), so blast radius is low, which is why it's P3 rather than P1.
- **Fix shape**: replace the hardcoded ms-offset with `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(ts)` to derive the BRT calendar date, then group candles by that string. Drops the constant entirely and is DST-correct for any future zone change.
- **Done when**: `BRT_OFFSET_MS` is removed; `dateToBrt(ts)` returns a `YYYY-MM-DD` string via `Intl.DateTimeFormat`; Indicator Lab renders identically for every existing date in the parquet window (regression check against a sample of 2026-03/04/05/06 days).
- **2026-06-14 review (Ygor + Claude)**: deliberately deferred — the project guideline against "error handling, fallbacks, or validation for scenarios that can't happen" applies. Brazil has no DST since 2019 with no reinstatement on the horizon, the asset definition (WIN/WDO) is BRT-only, and the code path is admin-only. Promote to P1 the day either (a) Brazil announces DST reinstatement or (b) a DST-observing asset is added to the Indicator Lab.
- **Date filed**: 2026-06-13.

---

### Precomputed structural pivots — engine swap + display wiring (Phase 2/3 of `asset_pivots`)

- **Priority**: P1
- **Effort**: M (engine swap = S, display + Fib UI = M)
- **Source**: 2026-06-16 — Phase 1 (schema + detection lib + tests + backfill) landed this session. `asset_pivots` table exists, populated for all 3 Hawks Renko TFs (5m: N=2 → 2672 pivots / 15m: 3479 / 60m: 3663 — full counts N=1..6 in backfill output). Detector at `src/lib/pivots/detect-renko.ts`, `ALGORITHM_VERSION="pivots-v1"`. Backfill at `scripts/backfill-pivots.ts` (idempotent, asserts price-match + count-monotonicity).
- **What + Why**: The persisted table is now the canonical source for any pivot consumer beyond the legacy v0.7 engine path. Two pieces remain before this work fully retires:
  1. **Engine swap (Phase 2)** — Hawks engine currently re-derives pivots at runtime via `src/lib/backtest/hawks-structural-pivots.ts`. Wire `fetchCandles` (`src/app/actions/backtest.ts`) to JOIN `asset_pivots` for the recipe's requested N and attach as `candle.pivots[N] = { type, price } | undefined`, mirroring the daily-anchors merge pattern. Hawks engine then reads `candle.pivots[recipe.entry.config.pivotConfirmationN ?? 2]`. **Hard regression bar**: trade counts must match the locked baseline from commit `1022fdc4` (325 on the original window; or the post-15m-wiring 332 baseline on the current 20-day window — measure and lock before swapping).
  2. **Display + Fib wiring (Phase 3)** — `/api/pivots?asset=…&tf=…&n=2&from=…&to=…` returns the pivot stream; chart overlay component renders topo/fundo markers; on-demand Fib retracement / extension box between any user-selected pair (math in `src/lib/fibonacci/levels.ts` — derive on read, do not persist).
- **Phase 4 deferred — time-based candle detection**: separate algorithm, same table; deferred until Phase 2 + 3 land and the persisted table proves itself on Renko in production.
- **CLEAN-SWING semantic note (CRITICAL for engine swap)**: the new detector emits ONE TOPO per actual peak (single canonical answer for Fib / chart). The legacy `walkStructuralPivots` in `src/lib/backtest/hawks-structural-pivots.ts` emits an EVENT stream (multiple pivots per swing, every directional brick after a flip emits something) — the engine consumes the legacy stream because it conditions on the event sequence for cooldown / re-arm timing. Phase 2 must either (a) verify trade-count parity empirically BEFORE fully cutting over (likely fails), or (b) introduce a thin adapter that fans the clean-swing stream back into legacy events at engine-read time, OR (c) keep the legacy detector as the engine's pivot source and use `asset_pivots` only for UI/Fib/cross-tool surfaces. Path (c) is the safest and probably what we want — the persisted table is for fidelity across consumers, not necessarily a replacement for the engine's internal event stream. **Pick this empirically during Phase 2, do NOT commit to a path in advance.**
- **What's already shipped** (Phase 1, 2026-06-16):
  - Detector library `src/lib/pivots/detect-renko.ts` — N=1..6 in a single sweep via `detectRenkoPivotsAllN`, wick-based direction with ambiguity-guard for outside bricks (see `docs/gotchas.md` 2026-06-16 "Hawks pivots: ambiguous-wick").
  - Schema + migration `src/db/migrations/0021_messy_namor.sql` — `asset_pivots` table (PK `(asset_id, timeframe_id, confirmation_n, brick_index)`), enum `pivot_type`, check constraint `1 ≤ N ≤ 6`.
  - Tests `src/__tests__/lib/pivots/detect-renko.test.ts` — 27 passing: clean-swing fixture × N=1..6 + price-match + count-monotonicity + bounds + edge cases on 6 random seeds.
  - Backfill script `scripts/backfill-pivots.ts` — usage: `pnpm tsx scripts/backfill-pivots.ts [tf_code] [asset_symbol]`. Idempotent via `ON CONFLICT DO NOTHING`. Asserts price-match + count-monotonicity at end. Reports DB count summary by N.
  - Gotchas logged: clean-swing subset invariant doesn't hold (only count-monotonicity does); ambiguous-wick bricks need body tiebreaker (`docs/gotchas.md` 2026-06-16).
- **Done when** (Phase 2 + 3): Hawks v0 baseline trade count reproduces 1:1 on /backtest and /optimize after the engine swap (or path (c) above is chosen and documented); one chart in the app displays an N=2 pivot overlay; Fib retracement/extension levels render between any two user-selected pivots.
- **Date filed**: 2026-06-08. Phase 1 shipped 2026-06-16.

### Hawks catalog import: replace formulaic exit math with brick-walk simulation

- **Priority**: P2
- **Effort**: S
- **Source**: 2026-06-05 — `scripts/import-hawks-catalog-as-trades.ts` ships v1 with formulaic exit prices (ST = entry ± 200pt, GA = entry ∓ 600pt, BE = entry) and `exit_date = entry_date + 30min`. This trusts the catalog's BE/GA/ST labels and computes outcome-implied prices. It does NOT simulate what actually happened in the brick sequence.
- **What + Why**: A brick-walk simulator that reads forward from each entry brick in `hawk_5m_win` and finds the first brick that breached the stop, target, or BE-then-reversal would (a) yield real exit timestamps for analytics, (b) surface catalog rows where the labeled outcome disagrees with the price action (useful audit signal), and (c) capture the slippage between formulaic and realized prices. The current v1 is fine for "show me the catalog as trades" but limits any per-day execution-quality study.
- **Fix shape**: For each trade, iterate hawk_5m_win bricks ordered by timestamp for the same BRT day starting at the entry brick + 1. For SHORT: ST if brick.high >= stop, GA if brick.low <= target, BE if MFE crossed +1R then price returned to entry. Mirror for LONG. Use that brick's close + timestamp.
- **Done when**: A `--mode=walk` flag on the importer toggles between formulaic and walk-simulated exits. A separate audit script flags catalog rows whose labeled outcome disagrees with the simulated outcome.
- **Date filed**: 2026-06-05.

### Hawks catalog tags: replace uninformative topos_fundos dimension

- **Priority**: P3
- **Effort**: XS
- **Source**: 2026-06-05 — After importing 291 catalog trades, the topos_fundos dimension tagged 289/291 trades as "marked" (effectively no discriminative value). The CSV's `tbd1/tbd2/tbd3` columns aren't sparse-painted pivots — they're continuously-valued and never identically zero in practice.
- **What + Why**: One of the 8 curated tag dimensions is wasted. Worth replacing with a discriminative tag. Candidates: "near session open" (entry brick within first N bricks of the day), "near recent high/low" (entry within K bricks' worth of the day's extreme), or proper pivot recency (look back N bricks and check if any tbd value crossed a threshold).
- **Fix shape**: Decide on the replacement dimension in `scripts/import-hawks-catalog-as-trades.ts:TAG_DIMS`. Drop or remap `topos_fundos`. Re-run the importer — idempotent, so wipes + re-tags cleanly.
- **Done when**: All 8 dimensions show <80% concentration on either side (a sign each is actually carrying information).
- **Date filed**: 2026-06-05.

### Hawks 90-day backtest window: treat March as WINM-anchored only

- **Priority**: P1
- **Effort**: XS (decision + doc only) or M (re-export March source CSVs at WINJ)
- **Source**: 2026-06-05 — Brick-close audit (`scripts/verify-csv-brick-closes.ts`) after rebuilding the candle pipeline (`load-hawks-bricks-by-size` + `materialize-hawks-timeframes`) shows **118/120 March 2026 catalog entries** off by **+3800 to +4000 points** from the materialized `hawk_5m_win` close. April + May are clean (5 and 3 minor drifts respectively, all <300 pts).
- **What + Why**: The source CSVs under `/Users/ygorbravim/Downloads/axion/WIN/<N>R.csv` contain **WINM (June-26)** contract data continuously across the 2026 window. The catalog (`/Users/ygorbravim/Downloads/Bravp - HK - Março.csv`) captured March BOX values at **WINJ (April-26)** contract levels — which is what the desk was actually trading at the time, since J→M rollover typically lands mid-March. The +3900pt delta is the J/M spread.
- **Decision (user, 2026-06-05)**: Don't re-export. Document the spread, mark March as "WINM-anchored backtest only" in the catalog, and treat **April + May 2026 as the trustworthy 90-day window** for proving the Hawks strategy. March can still be used for sequencing / brick-by-brick logic checks, but absolute P&L numbers must reference WINM prices, not the catalog's WINJ prices.
- **Done when**: A note in `data/hawks/user-entries/README.md` (create if missing) flags March 2026 as WINM-priced. The verifier's pass-rate report subtracts March mismatches as "expected" and surfaces only April + May divergences as actionable. Update if/when the user provides WINJ-period source CSVs for March.

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

### Hawks autonomous engine: indicator-isolation validation (replaces "reproduction 51% → 75%")

- **Priority**: P1 (paused — see below)
- **Effort**: L (multi-session)
- **Source**: 2026-06-12 — full archive of the reproduction-vs-catalog tuning pass at [`docs/postMorten/2026-06-12-hawks-engine-v0.8-archive.md`](postMorten/2026-06-12-hawks-engine-v0.8-archive.md). Final state: v0.8 engine reaches **55.9% reproduction / 169 extras** on the 20-day catalog. Five hypotheses tested with audit numbers; only one kept (brick-high retracement anchor — Hypothesis A). Bar of 75% / <60 NOT met.
- **Pause trigger**: Ygor's strategic observation that the paper-traded user catalog itself may contain input errors (mis-clicked timestamps, wrong direction tags, late clicks), making "reproduction-vs-catalog" a noisy validation target. Five hours of hypothesis testing optimized engine co-occurrence with a target we never audited for correctness.
- **What + Why** (new direction): Replace reproduction-vs-catalog with **indicator-isolation validation**. For each Hawks indicator independently:
  1. **Define how to track it.** State explicitly whether it's a level (S/R), trend, momentum reading, etc. Should price be below for SHORT / above for LONG? Should the absolute value be increasing? Pre-register the predictive hypothesis before measurement (no cherry-pick).
  2. **Script test.** For each indicator state, measure forward outcome distribution on raw 5m candles (next-N-brick MFE/MAE/return). Compare conditional vs baseline distributions. Report effect size + sample size + comparison-to-null.
  3. **Visual smoke test.** Plot the indicator on chart; Ygor + Arch scroll through and confirm the script's measurement matches what the eye sees.
     Indicators to validate, in order: 15m gate, 60m gate, MACD 5m, VWAP D, VWAP M, VWAP S, AJUSTE. Only after all 7 pass solo do we compose them in the engine.
- **Pre-work check before resuming**: Ygor will recheck a sample of paper-traded catalog entries against the live chart to estimate the catalog's error rate. If the catalog is verifiably clean we may reconsider reproduction-vs-catalog as a co-validation regime; otherwise it stays archived.
- **What's already shipped and kept** (orthogonal to validation regime, see archive doc for full list):
  1. `getHawksIndicatorsAt` + `getHawksIndicatorsAtCandle` at `src/lib/backtest/hawks-indicators.ts` — pure functions returning `HawksIndicatorSnapshot` (15m/60m/MACD/VWAP D-M-S/AJUSTE tagged favorable per direction). 8 passing tests. Unblocks the two-phase journaling enrichment plan above.
  2. `EntrySignal.indicatorSnapshot` attached at fire time so audit harness can grade fires by indicator alignment.
  3. v0.8 brick-high retracement anchor in `hawks-triple-screen.ts` (only hypothesis with measurable lift, +21pp from intermediate baseline).
  4. Audit harness rebuilt for post-Phase-5 data layer (direct DuckDB+Parquet read, no `price_candles` table dependency).
  5. Diagnostic probes: `scripts/diagnose-misses.ts`, `scripts/probe-fib-retrace.ts`.
- **Done when** (new bar): Each of the 7 Hawks indicators has a recorded solo-validation result (kept / rejected / inconclusive with sample size); the engine retains only kept indicators as hard gates; final engine reproduction rate is reported as a _consequence_ of indicator quality, not as the optimization target.

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

## Layout & Theming (from 2026-06-09 scan)

### Server-action unreachable i18n fallback class — 41 caller sites (continues 2026-06-02 sweep)

- **What**: The `result.message ?? t("fallback")` / `result.message || t(...)` pattern in client components is dead code — server actions return truthy English strings, so the `??`/`||` never fire. The 2026-06-02 i18n deep-sweep enumerated ~41 caller sites; the 2026-06-09 scan found 9 still-live instances in Cluster F (settings, reports) alone. The fix is server-side: wrap action error messages with `getTranslations()` and return translated strings; the client-side `??` then becomes correct defense-in-depth.
- **Why it's deferred from 2026-06-09 scan**: requires coordinated server-action audit across many `src/app/actions/*.ts` files; cleanly out of scope for a responsive-drift pass; risks colliding with the 2026-06-02 sweep's tracked work if done piecemeal.
- **Fix shape**:
  1. Read `docs/scans/2026-06-02-i18n-action-errors.md` for the full caller catalog.
  2. For each affected server action: import `getTranslations` from `next-intl/server`, wrap each English error-return message with `t("namespace.errors.<key>")`, add the key to both `messages/en.json` and `messages/pt-BR.json` in lockstep.
  3. After all actions are migrated, audit client components for now-dead `??`/`||` fallbacks — keep or remove based on aesthetic preference.
  4. Validate with `pnpm i18n:check`.
- **Known live caller sites (post 2026-06-09 scan)**: `recalculate-button.tsx:28-34`, `recalculate-pnl-button.tsx:28-34`, `capital-event-log.tsx:67`, `withdrawal-calculator.tsx:55`, `general-settings.tsx:70`, `trading-account-settings.tsx:95`, `user-profile-settings.tsx:107`, `hawks-settings.tsx:~170-180`, `tag-list.tsx:~300+`, `user-list.tsx:~400+`, plus the broader 41 sites enumerated 2026-06-02.
- **Done when**: `rg 'result\.(message|error)\s*(\?\?|\|\|)' src/components/` returns empty (or only intentional defense-in-depth where server is already translated).
- **Date filed**: 2026-06-09.
- **Source**: `docs/scans/2026-06-09-responsive-layout-drift.md` § RC4, § Still armed.

### Backtest trades table — mobile card-layout alternative

- **What**: `src/components/backtest/backtest-trades-table.tsx` uses `hidden md:table-cell` to drop columns on mobile, plus `overflow-x-auto` was added in the 2026-06-09 pass. There is still no mobile-optimized card layout — on a 375px viewport users either scroll horizontally or see a heavily-reduced column set. A vertical card mode (one row → one card with stacked fields) would be the canonical fix.
- **Done when**: at `<sm:` breakpoint, the table renders as vertical cards; at `>=sm:` it renders as the existing table.
- **Date filed**: 2026-06-09.
- **Source**: `docs/scans/2026-06-09-responsive-layout-drift.md` § E8.

### Trading-calendar mobile alt view

- **What**: `src/components/dashboard/trading-calendar.tsx` renders 7-column or 5-column day grids. The 2026-06-09 pass added `overflow-x-auto md:overflow-visible` to the wrapper so it scrolls instead of squashing — but at 375px each cell is still ~53px and day-number text remains tight. A numeric-list alternative mobile view (list of days with P&L badges, no grid) may serve mobile users better.
- **Done when**: gather feedback after shipping the overflow-fix; if mobile users report calendar discomfort, build the list-view alt.
- **Date filed**: 2026-06-09.
- **Source**: `docs/scans/2026-06-09-responsive-layout-drift.md` § B10.

## A11y & I18n (from 2026-06-09 follow-up sub-scans)

### Custom form-component `aria-labelledby` forwarding gap

- **Priority**: P2.
- **Effort**: S (per component, ~30 min each).
- **What**: `DateRangePicker` (in `equity-shield/equity-shield-params.tsx:153`) and likely `AssetCombobox` / `RatingInput` (in `journal/*`) do not forward `aria-labelledby` from props to their inner form control. This blocks the 2026-06-09 a11y carryover pass from wiring screen-reader labels for ~2-3 form fields that use these custom components.
- **Done when**: each custom component accepts and forwards `aria-labelledby` (and ideally `aria-describedby`) to the actual `<input>`, `<select>`, or `<button>` it renders. Then re-run the label-linkage detector and the count should drop.
- **Date filed**: 2026-06-09.
- **Source**: `docs/scans/2026-06-09-a11y.md` § Skipped + Open follow-ups.

### Translate `aria-label` strings that surface in screen readers

- **Priority**: P2.
- **Effort**: S (mechanical wrap with `t(...)` once a catalog is built).
- **What**: Several `aria-label` attributes are hardcoded English copy (e.g. `aria-label="Dashboard"` on `src/app/[locale]/(app)/page.tsx`, page-breadcrumb's `aria-label="Breadcrumb"` recommendation, `account-switcher.tsx` aria-labels). These bypass i18n because the visible text was translated but the screen-reader text was not. Brazilian Portuguese users will hear English landmark labels.
- **Done when**: `rg 'aria-label="[A-Z]' src/` returns no untranslated literals; all aria-labels go through `t(...)` or `useTranslations()`.
- **Date filed**: 2026-06-09.
- **Source**: `docs/scans/2026-06-09-responsive-layout-drift.md` § Open follow-ups; `docs/scans/2026-06-09-a11y.md` § Phase 3a fix log.

### Readonly key-value displays: `<span>` → `<dl>/<dt>/<dd>` upgrade

- **Priority**: P3.
- **Effort**: M (per file, requires per-pattern JSX restructuring).
- **What**: The 2026-06-09 a11y phase 3b converted 18 `<Label>` instances on readonly value displays (CSV import review, trade detail view) to `<span>` — defensible because it removes the WCAG violation (a Label without a control), but soft because it gives up semantic intent. The richer fix is `<dl>` (definition list) with `<dt>` (term) → `<dd>` (description). Screen readers will then announce these as key-value pairs, which is what they semantically are.
- **Done when**: csv-trade-card, scaled-trade-form, trade-form display sections wrap their readonly fields in `<dl>` blocks; visual layout preserved.
- **Date filed**: 2026-06-09.
- **Source**: `docs/scans/2026-06-09-a11y.md` § Phase 3b notes.

### Re-investigate the 4 unconverted RSC candidates from 2026-06-09 perf scan

- **Priority**: P3.
- **Effort**: S.
- **What**: The 2026-06-09 perf-fix agent substituted 7 alternative files for the 4 explicitly-named candidates (`daily-summary-card.tsx`, `pnl-display.tsx`, `position-summary.tsx`, `trade-detail-guide.tsx`). The substitutes are safe (production build clean) but the original 4 were never validated. They were flagged with high confidence in the diagnose pass; re-investigate whether they truly need `"use client"` or if removing it yields real bundle savings.
- **Done when**: each of the 4 named files is either confirmed-needs-client (with a one-line reason inline), or has `"use client"` removed with tsc + build clean.
- **Date filed**: 2026-06-09.
- **Source**: `docs/scans/2026-06-09-responsive-layout-drift.md` § Open follow-ups; `docs/scans/2026-06-09-performance.md` § RSC cluster.

## Tax & Compliance
