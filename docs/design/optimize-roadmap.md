# OPTIMIZE — Feature Roadmap

**Status**: Roadmap / design intent. Phases ship one at a time; each phase has 1–3 backlog entries.
**Date**: 2026-05-29
**Owner**: Ygor (product) + Claude (engineering brainstorm)
**Source**: Brainstorm during session post-PR #9. The OPTIMIZE tool exists today as a single-axis grid-search surface; this document captures where it should go.

---

## Strategic direction

Two decisions anchor everything else:

1. **Trustworthy first, feature-rich second.** The current tool can mislead — it runs grid search and reports best-on-known-data, with no concept of held-out validation. Before we add more knobs, we add the layer that prevents a user from fooling themselves.
2. **Tiered audience.** Default surface is opinionated and narrative-style ("best combo: X. Holds up out-of-sample ✓"). Advanced tab unlocks the raw mechanics (heatmap, Pareto, custom objectives, constraints). Same engine, two narratives over it.

These choices compound. Walk-forward enables the "robust ✓" badge in the narrative view; the narrative view forces us to pick defensible defaults for the optimizer; defensible defaults make the Advanced tab a power-user surface rather than a maze.

---

## Baseline: what OPTIMIZE is today

- Route: `/backtest/optimize`, gated `requireRole("premium")`.
- ~4,157 lines across `app/[locale]/(app)/backtest/optimize/page.tsx`, `components/optimize/*` (10 files), `lib/optimize/*` (5 files).
- 3-step wizard (`wizard-stepper.tsx`): pick recipe → configure sweep → run + review.
- Web-Worker-based runner (`backtest-worker.ts`, `sweep-runner.ts`). Cancellable. Results stream as `WorkerOutMessage`s.
- Parameter catalog (`parameter-grid.ts`, 746 lines). Two flavors: `ORB_PARAMS` and `DEZK_PARAMS`. Selector is binary: `recipe.entry.type === "orb_breakout" ? ORB_PARAMS : DEZK_PARAMS`. Cartesian grid generation with `MAX_COMBINATIONS` / `WARN_COMBINATIONS` ceilings.
- Output surfaces: heatmap (629L), comparison table (247L), equity-overlay chart (178L), summary cards (78L), run-detail panel (126L).
- Storage: `storage.ts` (42L) — short, likely localStorage only.

### Honest gaps

| Gap                           | Impact                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------- |
| No held-out validation        | Best-in-sample combos can be overfit; tool can mislead.                                                 |
| Single-metric framing         | Comparison table sorts by one metric at a time. Users can't see PF-vs-drawdown trade-off.               |
| Strategy-blind selector       | New strategies silently fall through to dezK params. Hawks is the first concrete victim.                |
| No run provenance             | Re-running later doesn't reproduce; can't tell which dataset / engine version a run came from.          |
| One surface for all audiences | The 4,157-line UI exposes everything by default — wrong for a retail-trader audience, fine for a quant. |

---

## Roadmap

### Phase 1 — Trust foundations

The smallest set of features that makes OPTIMIZE honest. None of the rest matters until this lands.

#### 1a. Walk-forward / out-of-sample split

- Date-split slider in the sweep config (default 70/30, last 30% held out).
- Worker runs each combo twice: in-sample to optimize, out-of-sample report-only.
- Each `OptimizationRun` carries both metric sets (`summaryIS`, `summaryOOS`).
- New derived flag `oosRobust: boolean` — derived as "OOS PF ≥ 0.7 × IS PF" (tunable in code, not surfaced to user).
- Comparison table gets OOS columns + a "robust only" filter.
- **K-fold option** (stretch within Phase 1a): for small datasets (< 30 days), single-split is noisy — one bad test day knocks the assessment. K-fold (e.g. 5-fold) averages across splits. Ship walk-forward first; add K-fold if usage demonstrates the need.

**Done when**: a Hawks sweep across 20 days runs as 14-train + 6-test, every result row shows both PFs, and the "robust ✓" filter works.

#### 1b. Run metadata + provenance

- Stamp every `OptimizationRun` with: dataset hash (candle set), candle count, date range hash, engine version, recipe-config hash, seed (for future random sampling), sweep-id (groups runs from one sweep).
- `storage.ts` schema bumps `schemaVersion`; future migrations are explicit.
- Cheap to add now, painful to retrofit. Land before walk-forward results start accumulating so OOS data carries provenance from day one.

**Done when**: every run in storage has all metadata fields populated. Old runs migrate or are flagged with `schemaVersion: 0` and treated as legacy-readonly.

#### 1c. Pareto frontier view

- New tab in results: `(PF, maxDrawdown)` scatter. Frontier points highlighted. Hover surfaces the param combo.
- Generic — works for every strategy.
- Lives alongside the heatmap, not replacing it. Users who want the heatmap still have it.

**Done when**: the scatter renders for any sweep with ≥10 runs, frontier is highlighted, hover/click jumps to run-detail.

---

### Phase 2 — Audience split

Phase 1 ships everything as Advanced-mode-only. Phase 2 adds the default narrative surface that retail traders actually want.

#### 2a. Default `Recommended` tab

- New top-level tab, default-selected after a sweep completes.
- Renders:
  - **Headline**: one line. "Best combo: BE=125, 3R, cooldown=5. PF 1.8 in-sample, 1.6 out-of-sample (✓ robust)."
  - **Rationale**: 3 bullets explaining _why_ this combo was picked (chosen objective, robustness check, trade count adequacy).
  - **CTAs**: "Use this combo" (pre-fills the Backtest recipe with the winning params), "Explore alternatives" (jumps to Advanced).
- Selection logic is **deterministic** — not ML. Default rule: "highest IS PF whose OOS PF passes robustness threshold AND tradeCount ≥ N." Document the rule in this file; surface it in a tooltip.

**Done when**: the tab loads after every sweep, picks a combo, and the CTAs work end-to-end (round-trip to Backtest preserves the param overrides).

#### 2b. `Advanced` tab

- Today's heatmap + table + equity overlay + Pareto (from 1c), gated behind this tab.
- No new surfaces in 2b; this is purely the UX home for everything else.

**Done when**: tab switch is smooth, no state lost when toggling between Recommended and Advanced.

---

### Phase 3 — Strategy generalization + power-user depth

#### 3a. Strategy registry refactor (kills the ORB-vs-else binary)

- Each preset module exports its own `sweepableParams` array alongside the recipe.
- `parameter-grid.ts` becomes a registry that looks up by `recipe.entry.type`, not a hardcoded switch.
- Adding a future strategy = adding `sweepableParams` to its preset module; no `parameter-grid.ts` edit needed.
- This unblocks Hawks integration (Phase 3b) and any future strategy.

**Done when**: `getSweepableParams` no longer has a hardcoded strategy check; ORB and dezK still work via the registry.

#### 3b. Hawks integration (downstream of 3a)

- Add `HAWKS_SWEEPABLE_PARAMS` in `hawks-presets.ts`:
  - **Tier-1 sweeps**: `breakeven.triggerPct`, `target.levels[*].rMultiple`, stop type / multiplier.
  - **Tier-2 sweeps**: quality gate level (off/lite/standard/strict), `retracementMin`, 5m cooldown, stay-armed-vs-anchored.
  - **Tier-3 deferred**: per-day volatility regime, Fibonacci retracement band.
- Pin dataset to the user-catalog all-days bundle by default; Free-range override available.
- Result table integrates per-tier breakdown (re-uses the `tier-analytics` module shipped in PR #9).

**Done when**: a user can select `hawks_v0` or `hawks_user_catalog` in OPTIMIZE and run a meaningful sweep without falling through to dezK params.

#### 3c. Custom objective builder (Advanced-only)

- Pre-set objectives: Sharpe, Sortino, Calmar, raw PF, "minimize MaxDD subject to PF > 1".
- Custom expression input: `0.7 * PF - 0.3 * drawdownPct`. Parsed safely.
- The narrative view (Phase 2a) silently uses the default objective; Advanced lets the user override.

**Done when**: objective dropdown works, custom expressions parse, every result re-sorts by chosen objective.

#### 3d. Constraint mode (Advanced-only)

- "Maximize PF subject to drawdown < 5% AND tradeCount > 20."
- UI: a few `field op value` rows + an objective.
- Solver: trivial — filter the result set, then pick the best of what remains.

**Done when**: constraint UI works, filtered result set is reflected in the heatmap + table.

---

### Phase 4 — Stretch (not committed to)

Worth knowing about. Defer until the earlier phases prove the demand.

- **Random sampling mode** — useful when the search space grows beyond grid budgets. Cheap to add when needed; not now.
- **DB-backed runs + share / export** — survive across devices; align with the deferred user-saved-catalogs P3 entry. Premium-feature lever.
- **Bayesian search** — premature for our data sizes.
- **Per-segment slicing** — per-tier (Hawks), per-day-regime (NR4/expansion), per-time-of-day. Strategy-dependent, defer until a regime classifier exists or per-tier proves valuable.
- **Narrative annotations** — natural-language summary of the result ("BE=125 dominates because it cuts losers without giving up winners"). Optional polish.

---

## Sequencing rules

- **Phase 1 must ship before Phase 2.** Narrative claims robustness; without walk-forward there's no robustness to claim.
- **Phase 1 should ship before Phase 3b.** The existing Hawks engine-tuning P1 backlog entry was originally going to roll its own `scripts/sweep-hawks.ts`; with this roadmap, it should depend on OPTIMIZE Phase 1 + 3a + 3b instead.
- **Phase 3a should ship before any new strategy is added.** Don't grow the binary-selector tech debt.
- Within Phase 1, the order is **1b → 1a → 1c**. Metadata is cheapest and unblocks the rest with provenance from day one.

---

## Open design questions

1. **Robustness threshold**: 0.7 × IS PF is a guess. Validate empirically on Hawks data once Phase 1a is live. Could be 0.6 or 0.8.
2. **K-fold vs single split** for small datasets — file as a follow-up once we see how noisy 14-train / 6-test feels.
3. **Default objective for the narrative view**: profit factor? Sharpe? A custom score? Pick one, document it, ship it; iterate based on user feedback.
4. **What "Use this combo" actually does** for the recipe round-trip — does it create a new preset variant (`hawks_v0_user_tuned`), patch the in-memory recipe, or pre-fill the backtest form? Probably the third for v1.
5. **Cross-asset generalization** — the chosen winner might not transfer from WINFUT to DOLFUT. Worth flagging in the narrative when the asset is new.

---

## How the existing backlog entries connect to this roadmap

- **`Hawks engine: fine-tune for better backtest outcomes (parameter sweep + walk-forward)` (P1, 2026-05-29)** — should be re-shaped to depend on OPTIMIZE Phase 1 + 3a + 3b rather than ship a one-off script. The "Fix shape" #1 becomes "use OPTIMIZE once Phase 1 + 3b are live" instead of "new `scripts/sweep-hawks.ts`".
- **`User-created saved catalogs for hawks_user_catalog (DB-backed)` (P3, 2026-05-29)** — Phase 4 DB-backed runs aligns with this. Both build on the same persistence story; ship them together when premium-feature persistence lands.
- **`Hawks engine: quality multiplier tier-tagging (AAA/AA/A)` (P2, 2026-05-27)** — Phase 3b consumes this. Per-tier breakdown in OPTIMIZE assumes tier-tagging is on every trade.

---

## How to retire pieces of this roadmap

This document is a **design intent**, not a feature register. Backlog entries are the canonical execution units; this doc is the connective tissue. When a Phase ships:

1. Mark it in this doc with a status block (`Phase 1a — shipped 2026-XX-XX, commit / PR #__`).
2. Delete the corresponding backlog entry per the usual backlog-retirement rule.
3. If a design decision was wrong, edit this doc to record what we changed and why.

When all four phases ship: archive this doc to `docs/design/archive/` or delete it. The shipped code + git history are the source of truth from then on.
