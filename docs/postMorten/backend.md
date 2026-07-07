# Backend Post-Mortem Log

---

## [SHIP-2026-06-01] Hawks dual-mode quality gates refactor (Piece B)

**Date:** 2026-06-01
**Type:** Feature release (refactor + new capability)
**Severity:** N/A (feature, not a bug)
**Affected Area:** `src/lib/backtest/modules/entry/hawks-quality-rules.ts`, sweep catalog, test suite, i18n

### Overview

Successfully implemented Piece B of the Hawks dual-mode quality gates refactor. Each of the four indicator rules (keltner_inner, macd, volume, aggression) now independently control both scoring (tier labels) and blocking (hard stop on entry). Previously, each rule could only gate tier labels; blocking was not available.

### Architecture

**Dual-mode rule abstraction:**

- `DualModeRule`: rules with symmetric score/block paths (keltner_inner, macd, volume). Single `resolveMode()` method returns "off" | "score" | "block" | "both", and `evaluateSignal()` dispatches on that mode.
- `AggressionDualModeRule`: asymmetric score/block modes with different enum values (scoreMode: "off" | "original" | "reversed", blockMode: "off" | "blockOnAligned" | "blockOnAnti"). Separate `resolveScoreMode()` and `resolveBlockMode()` methods.

**Mode resolution pattern:**

- Nested shape takes priority: `qualityGates?.aggression?.scoreMode ?? qualityGates?.aggressionMode ?? "off"`
- Fallback to legacy flat boolean flag ensures backward compatibility for configs stored with old schema.

**Block thresholds reuse scoring thresholds:**

- No separate knob: block uses the same numeric threshold as score (e.g., keltnerNearBricks, macdSlopeWindow, volumeEmaPeriod, aggressionThreshold).
- Block trigger semantics differ by rule:
  - **Keltner inner**: block on any non-score event (penalty when mode was "score").
  - **MACD**: block when sign-opposed or sign-aligned with slope mismatch (complement of favor when score was "score").
  - **Volume**: block when vol < ema (complement of favor when score was "score").
  - **Aggression**: blockOnAligned blocks long/short-aligned entries; blockOnAnti blocks against-direction entries.

### Changes

1. **Refactored hawks-quality-rules.ts** (primary file):
   - Exported `DualModeRule` and `AggressionDualModeRule` type definitions.
   - Implemented and exported: `keltnerInnerDualRule`, `macdDualRule`, `volumeDualRule`, `aggressionSplitRule`.
   - Removed legacy rule implementations (keltnerInnerRule, macdRule, volumeRule, aggressionRule).
   - All four rules now available for use by the backtest engine.

2. **Message keys** (`messages/en.json`, `messages/pt-BR.json`):
   - Added 9 new keys: hawksAggressionScoreMode, hawksAggressionBlockMode, hawksAggressionBlockOnAligned, hawksAggressionBlockOnAnti, hawksKeltnerInnerMode, hawksMacdMode, hawksVolumeMode, hawksMode_off, hawksMode_score, hawksMode_block, hawksMode_both.
   - All keys present and translated in both locales.

3. **Test coverage** (new file: `src/__tests__/lib/backtest/hawks-quality-rules.test.ts`):
   - 18 tests covering export verification, method signatures, mode resolution fallback behavior, and mode resolution priority (nested over legacy).
   - Tests verify correct behavior of `resolveMode()` / `resolveScoreMode()` / `resolveBlockMode()` with both nested and legacy config paths.

4. **Backward compatibility:**
   - Legacy flat boolean flags (`keltnerInnerPenalty`, `macdAlignmentScore`, `volumeScore`, `aggressionMode`) remain sweepable in the catalog.
   - New nested shape takes precedence; fallback to legacy flag ensures old configs still work.

### Verification Gates

All gates passed:

1. **`pnpm lint`**: 0 new errors (3 pre-existing unused-vars in interface defs are intentional).
2. **`pnpm lint:strict`**: Passed (0 errors, ~900 no-unsafe-\* warnings are intentional phase-in).
3. **`pnpm exec tsc --noEmit`**: No type errors.
4. **`pnpm vitest src/__tests__/lib/backtest/hawks-quality-rules.test.ts`**: 18 tests pass.
5. **`pnpm check:dead-axes`**: All 19 quality-gate axes referenced by at least one rule. (Fixed by adding fallback to `aggressionMode` in `resolveScoreMode()`.)
6. **`pnpm tsx scripts/sweep-detective.ts`**: Axis role classification verified. Aggression mode correctly classified as LABEL-ONLY.
7. **`pnpm i18n:check`**: 0 missing key references, full locale parity (en.json and pt-BR.json both have 5207 keys).

### Prevention

1. **Dual-mode signature contracts:** When implementing a new DualModeRule, ensure the TypeScript interface enforces `resolveMode()` and `evaluateSignal()` methods. For asymmetric rules (like aggression), subtype with AggressionDualModeRule to enforce separate resolve/evaluate methods per side.

2. **Mode resolution fallback pattern:** Always thread the fallback chain in a single line — don't scatter fallback logic across multiple checks. This ensures missed fallbacks are obvious in code review.

3. **Test mode resolution early:** Export verification tests should spot method name mismatches and signature misalignments before integration tests. The test file serves as a contract verifier.

### Related Files

- `src/lib/backtest/modules/entry/hawks-quality-rules.ts`
- `src/__tests__/lib/backtest/hawks-quality-rules.test.ts` (new)
- `messages/en.json`
- `messages/pt-BR.json`
- `docs/postMorten/frontend.md` (see companion Piece A frontend refactor)

---

## [BUG-2026-06-01] 59 of 63 stored optimization runs had empty trades arrays while retaining full summary metrics

**Date:** 2026-06-01
**Severity:** Critical (data loss + silent corruption — backtest runs appeared complete but couldn't be inspected, equity curve couldn't render, UI counters were inflated by stripped runs)
**Affected Area:** `src/lib/optimize/backtest-worker.ts`, `src/lib/optimize/sweep-runner.ts`, `src/lib/optimize/storage.ts`

### Symptom

During investigation of a user's optimization runs stored in localStorage, 59 of 63 runs had `trades: []` despite having populated summary metrics (profitFactor, totalPnlCents, sharpeRatio, etc.). The equity overlay refused to render (no data to plot), and any attempt to inspect individual run details showed "no trades" despite the summary showing 400+ trades executed. Two runs had `undefined` trades arrays (schema mismatch), and only 4 retained the full trades array.

### Root Cause

**Triple failure in the trades propagation pipeline:**

1. **Worker emits trades, but message doesn't carry them** (`backtest-worker.ts`): The `runBacktest()` function computes a complete `trades` array (line 203 in the backtest engine). The worker's progress message emitted summary metrics, equity curve, and in-sample/OOS variants, but **never included the trades array** — it was discarded at the message boundary.

2. **Runner hardcodes empty array** (`sweep-runner.ts`, line 80): When the worker message arrived, the runner constructed each OptimizationRun with `trades: []`, a hardcoded sentinel that overwrote any incoming trade data (which didn't exist because of #1).

3. **No retention policy enforced** (`storage.ts`): Before this fix, there was no logic to apply Pareto retention to decide which runs should keep full trades. All runs went into localStorage with empty arrays, and there was no flag to distinguish "we intentionally stripped this" from "the pipeline lost the data."

**Secondary issue:** When localStorage quota was exhausted, failures silently caught with no console warning. Users had no way to diagnose quota issues.

### Effect

- Equity overlay couldn't plot individual run curves (no trades → no equity curve).
- Variation counters inflated: profitable/losing included stripped runs (skewed the headcount).
- Pareto/heatmap visualization relied on curve data, so visual ranking diverged from CSV export (CSV still had summary stats, but curves were missing).
- User experience: "I ran a sweep, the CSV looks good, but I can't inspect the runs or replay them. Did something go wrong?"

### Solution

**Complete pipeline restoration + localStorage quota management:**

1. **Worker now emits trades** (`backtest-worker.ts`): Updated the ProgressMessage interface to include `trades` array. For walk-forward mode, also emit `tradesIS` and `tradesOOS` (though not currently stored — reserved for future tracking).

2. **Runner passes trades through** (`sweep-runner.ts`): Changed line 80 from `trades: []` to `trades: msg.trades`, so the trades data flows into the OptimizationRun object.

3. **Storage layer enforces Pareto retention** (`storage.ts`):
   - Implemented `paretoRetain()` helper function (new file) that identifies the 3-axis Pareto front (profitFactor × totalPnlCents × sharpeRatio) plus single-metric extremes.
   - Only runs on the Pareto front or a metric extreme retain their full trades array.
   - All other runs have trades stripped to `[]` and marked with `tradesRetained: false`.
   - Applied at the persistence choke point (saveRuns), not during sweep execution, so the UI and replay logic always see the unmangled runs.

4. **Added tradesRetained flag** (`src/types/backtest.ts`): New optional boolean field on OptimizationRun to explicitly distinguish "trades were stripped by policy" from "pipeline lost the data."

5. **Surface quota errors** (`storage.ts`): Replaced silent `catch {}` with `console.warn()` so users can see quota failures in DevTools.

6. **Updated equity overlay** (`src/components/optimize/equity-overlay-chart.tsx`): Filter out runs where `tradesRetained === false` before rendering.

7. **Updated counters** (`src/components/optimize/summary-cards.tsx`): Count profitable/losing only among runs with trades (`tradesRetained !== false`), not the full list.

8. **Storage schema v4 → v5** (`src/lib/optimize/provenance.ts`, `src/lib/optimize/storage.ts`):
   - Bumped schema version.
   - Migration ensures legacy v4 runs inherit `tradesRetained: true` (safe assumption: if trades exist in localStorage, we kept them).

9. **Added i18n copy** (`messages/en.json`, `messages/pt-BR.json`):
   - New optimize.runs section with "tradesNotRetained" label and tooltip.
   - New summary.withDetail for the "Profitable variations (with full detail)" affordance.

### Verification

- `pnpm run test:unit src/__tests__/lib/optimize/pareto-retain.test.ts` — 7 tests pass (Pareto front logic, single-metric extremes, trade stripping, summary preservation, edge cases).
- `pnpm lint` — 0 errors in pareto-retain.ts, pareto-retain.test.ts, storage.ts, sweep-runner.ts, equity-overlay-chart.tsx, summary-cards.tsx.
- `pnpm exec tsc --noEmit` — no type errors.
- Manual smoke: 100-run sweep, check localStorage schema version incremented, verify 3 runs on Pareto front retain full trades, 97 others have empty trades arrays, equity overlay renders only the 3, counters show only 3 in profitable/losing base.

### Prevention

1. **Worker/runner contract:** Every data structure emitted by the worker must be explicitly threaded through the message boundary and swept into the OptimizationRun. Use a checklist: summary✓, equityCurve✓, trades✓, OOS variants✓.
2. **Storage policy enforcement:** Retention policies (Pareto, quota, etc.) should live at the persistence layer, not scattered across UI. This ensures the in-memory state and stored state don't diverge.
3. **Explicit data flags:** When data is intentionally modified (trades stripped, fields omitted, etc.), add a flag to the data structure so the UI can render an affordance ("Trade detail not retained — re-run to inspect").
4. **Surface quota errors:** Never silently catch quota failures. At minimum, console.warn so users can debug.

### Related Files

- `src/lib/optimize/pareto-retain.ts` (new)
- `src/__tests__/lib/optimize/pareto-retain.test.ts` (new)
- `src/lib/optimize/backtest-worker.ts`
- `src/lib/optimize/sweep-runner.ts`
- `src/lib/optimize/storage.ts`
- `src/types/backtest.ts`
- `src/components/optimize/equity-overlay-chart.tsx`
- `src/components/optimize/summary-cards.tsx`
- `src/lib/optimize/provenance.ts`
- `messages/en.json`
- `messages/pt-BR.json`

---

## [BUG-2026-05-31-3] Two Hawks sweep axes exposed in the optimization catalog had zero observable effect

**Date:** 2026-05-31
**Severity:** Medium (no incorrect numbers produced — every "swept" cell was identical — but the optimizer wasted refine budget on knobs that physically cannot affect outcomes, and users tweaking them in the UI saw no response and reasonably wondered if the engine was broken)
**Affected Area:** `src/lib/backtest/presets/hawks-presets.ts` (HAWKS_SWEEPABLE_PARAMS catalog)

### Symptom

Running a per-axis isolated sweep (`scripts/sweep-detective.ts`) under both `bundle=off` AND `bundle=strict` baselines, two axes produced **identical fingerprints** across every value: identical PnL, identical PF, identical trade count, identical tier histogram, identical per-rule contribution counts, identical totalScore.

- `entry.config.qualityGates.macdSlopeWindow` (numeric, 2–5 step 1)
- `entry.config.qualityGates.macdAlignmentScore` (boolean toggle)

A third axis `qualityGates.keltnerInnerPenalty` was initially classified DEAD but is actually LABEL-ONLY — the rule fires and emits penalty contributions but the tier still bucketed to "B" because the score lands below the A threshold with no offsetting favor contributions in this dataset. Not a bug — confirmed via richer fingerprint that includes per-rule contribution counts.

### Root Cause

The Hawks quality-rule registry (`src/lib/backtest/modules/entry/hawks-quality-rules.ts`) defines two categories of rules: `blockRules` (gate entry, drive PnL) and `scoreRules` (compute tier label, no PnL effect). For each of the two confirmed DEAD axes:

- **`macdSlopeWindow`** — `updateQualityContext` writes the MACD value to a `recentMacd` ring buffer sized by this parameter. But there is no rule (block or score) anywhere in the registry that reads `recentMacd`. The buffer is updated, sliced to the right length, then never inspected. Dead state.
- **`macdAlignmentScore`** — boolean toggle exposed in `HAWKS_SWEEPABLE_PARAMS`, present in the strict/standard bundle defaults, and rendered in the manual leaf UI. Zero rules reference it: no `configFlag` checks it, no evaluator reads it. Dead gate.

Both relate to a "Group C — MACD sign + slope" rule that is documented in the registry header as "planned" but never implemented. The sweepable-axis entries were added in anticipation of the rule landing — and then forgotten about when the rule didn't ship.

### Fix

Surgically removed both entries from `HAWKS_SWEEPABLE_PARAMS` only:

- `entry.config.qualityGates.macdSlopeWindow` numeric SweepableParam — removed.
- `macdAlignmentScore` boolean toggle pair — removed from the `TOGGLE_GATES` array.

Replaced with a JSDoc block explaining why and pointing to `scripts/sweep-detective.ts` for empirical reproduction.

**Intentionally NOT touched:**

- `src/types/backtest.ts` (`QualityGatesConfig` schema) — keeps shape.
- `src/lib/backtest/presets/hawks-quality-presets.ts` (bundle defaults, equality) — bundles still set these values for future rule consumption.
- `src/lib/validations/backtest.ts` (Zod) — recipes carrying these fields still validate.
- `src/lib/backtest/presets/hawks-leaves.ts` — the leaf registry, used by the manual sweep builder, keeps these entries so the bundle-ownership invariant test continues to pass.
- `src/components/backtest/sections/hawks-quality-controls.tsx` — UI controls stay (users can still set values manually toward the planned future rule).

The blast radius of the fix is exactly: **the optimizer's auto-grid generator no longer wastes broad-sweep slots on these two axes.** Everything else continues to work as before.

### Verification

- `scripts/sweep-detective.ts` — DEAD set reduced from 3 axes to 2 (the remaining 2 are intentional placeholders flagged in catalog comments).
- `scripts/sweep-validate.ts` (9 756 runs, 24 variations) — 0 FAIL, 0 WARN.
- `scripts/sweep-monotonicity.ts` (6 physical-expectation checks across 5 gating axes) — 0 violations.
- `pnpm exec tsc --noEmit` — clean.
- `pnpm exec vitest run src/__tests__/lib/optimize/ src/__tests__/lib/backtest/` — 213 pass, 3 intentional skips, 0 fail.
- `pnpm lint` — 0 errors.

### Lessons

1. **Every sweepable axis must trace to at least one rule that reads it.** When adding a sweep axis, write a single-day differential test that asserts at least _one_ value of the axis produces a different fingerprint than another. Catch this at PR time.
2. **"Planned" placeholders rot.** Exposing config in the schema before the consuming code lands is a common pattern — but every such placeholder needs a TODO + dead-code detector. The `sweep-detective.ts` harness should be reused as a CI gate against this regression.
3. **DEAD vs LABEL-ONLY vs GATES is a useful taxonomy.** The optimizer UI should surface it: if an axis is LABEL-ONLY, mark it "tier label only — won't change PnL." Power users may still want it; default users will skip.

### Detective findings table (all axes)

| Axis path                           | Role         | Effect on PnL |
| ----------------------------------- | ------------ | ------------- |
| `stop.breakeven.triggerPct`         | GATES        | ✓             |
| `target.levels.0.value`             | GATES        | ✓             |
| `slippageTicks`                     | GATES        | ✓             |
| `qualityGates.__bundle__`           | GATES        | ✓             |
| `qualityGates.srBlockBufferBricks`  | GATES        | ✓             |
| `qualityGates.srLevelBlock`         | GATES        | ✓             |
| `qualityGates.keltnerOuterBlock`    | GATES        | ✓             |
| `qualityGates.htfMaBlock`           | GATES        | ✓             |
| `entry.config.fireCooldownBricks`   | GATES        | ✓             |
| `entry.config.wave1MinBricks`       | GATES        | ✓             |
| `entry.config.retracementMinBricks` | GATES        | ✓             |
| `qualityGates.srFavorRangeBricks`   | LABEL-ONLY   | ✗ (tier only) |
| `qualityGates.keltnerNearBricks`    | LABEL-ONLY\* | ✗ (tier only) |
| `qualityGates.aggressionThreshold`  | LABEL-ONLY   | ✗ (tier only) |
| `qualityGates.volumeEmaPeriod`      | LABEL-ONLY   | ✗ (tier only) |
| `qualityGates.srLevelFavor`         | LABEL-ONLY   | ✗ (tier only) |
| `qualityGates.keltnerInnerPenalty`  | LABEL-ONLY   | ✗ (tier only) |
| `qualityGates.volumeScore`          | LABEL-ONLY   | ✗ (tier only) |
| `qualityGates.aggressionMode`       | LABEL-ONLY   | ✗ (tier only) |
| `qualityGates.macdSlopeWindow`      | DEAD — fixed | ✗ (never)     |
| `qualityGates.macdAlignmentScore`   | DEAD — fixed | ✗ (never)     |

\*`keltnerNearBricks` is structurally GATES (used inside the keltner outer block rule) but in the 2-month dataset the block decision never flipped on band-near distance variation 1→3 bricks. Wider sweeps or different datasets will likely see PnL change.

---

## [BUG-2026-05-31-1] Backtest metrics rounded at compute time destroyed Pareto/heatmap ranking precision

**Date:** 2026-05-31
**Severity:** High (silently collapsed distinct sweep results into ties; affected every backtest summary written since the metrics module shipped — Pareto frontier, quality shading, heatmap legend, runs-comparison table all read the lossy values)
**Affected Area:** `src/lib/backtest/metrics.ts:118-129`

### Symptom

User exported `axion-optimize-runs-*.csv` from a Hawks sweep (2763 runs) and noticed **14 consecutive Broad runs (#1061–#1074) with identical headline metrics — 413 trades, 64.41% WR, PF=1.00, AvgR=0.00, Sharpe=0.00 — but visibly different `totalPnlCents` (915, 2365, 1765×11)**. PF=1.00 with non-zero PnL is mathematically impossible. One legacy "Sweep #2" row had PF=1.00 with `totalPnlCents=-1422`.

### Root Cause

`computeMetrics` was applying `Math.round(x * 100) / 100` to five fields **at the source of truth**: `winRate`, `profitFactor`, `avgRMultiple`, `sharpeRatio`, `expectancy`. Any real value in `(0.995, 1.005)` collapsed to `1.00` in storage. Pareto frontier comparisons, quality gradient shading, and heatmap z-axis sorting then saw ties where the real distribution had a gradient — so the GA could not rank close-but-distinct sweeps. The CSV export reflected the lossy storage, not the underlying numbers.

The intent of the original rounding was display formatting, but **every render site already calls `.toFixed(2)` on read** (`runs-comparison-table.tsx`, `pareto-scatter.tsx` tooltip, `parameter-heatmap.tsx` legend, etc.), making the source-side rounding redundant _and_ destructive.

### Fix

Removed the `Math.round(... * 100) / 100` wrappers from the five offending fields in the `computeMetrics` return shape (`src/lib/backtest/metrics.ts:118-129`). Raw float precision is now preserved through to the persisted run; display sites continue to format with `.toFixed(2)` as before.

### Verification

- `pnpm exec tsc --noEmit` clean
- `pnpm exec vitest run src/__tests__/lib/backtest/` — 37 pass, 0 fail
- `pnpm exec vitest run src/__tests__/lib/optimize/` — 176 pass, 0 fail
- `pnpm lint` clean (3 pre-existing unrelated warnings)

### Lessons

1. **Round at the display boundary, never at the source of truth.** If a metric is used both for ranking and for display, only the display layer should lose precision. Otherwise ranking degrades to whatever the display rounding chose.
2. **PF=1.00 with non-zero PnL is a smoke signal.** Any future export-validation pass should flag this combination as a precision bug rather than treating PF=1.00 as a real value.
3. **Look for `Math.round(... * 100) / 100` in any compute path.** That idiom is a code smell — almost always a misplaced display concern.

### Affected (historical) data

Runs persisted in `localStorage` (key: `axion:optimization-runs:v4`) before this fix retain lossy values. Re-running the sweep regenerates clean metrics. No DB-side persistence was affected (these runs live in browser storage only).

---

## [BUG-2026-05-31-4] Hawks MACD score rule implemented + CI gate against dead-axis regressions

**Date:** 2026-05-31
**Severity:** Follow-up to `[BUG-2026-05-31-3]`. Completes the catalog cleanup by giving the two reserved MACD axes (`macdAlignmentScore`, `macdSlopeWindow`) an actual rule consumer and adding a static CI check so the dead-axis class of bug can never silently reappear.

### What landed

1. **`macdSignSlopeRule`** in `src/lib/backtest/modules/entry/hawks-quality-rules.ts`. New `ScoreRule` gated by `qualityGates.macdAlignmentScore`. Reads the current MACD value (sign vs trade direction) and the slope across the `recentMacd` ring buffer (sized by `qualityGates.macdSlopeWindow`). Emits `favor` when sign + slope both align with the trade, `penalty` when sign opposes, `neutral` for mixed signals. The buffer was already being maintained by `updateQualityContext` — now there's a consumer.

2. **Re-added the two MACD axes to `HAWKS_SWEEPABLE_PARAMS`** in `src/lib/backtest/presets/hawks-presets.ts`. Detective verifies both as LABEL-ONLY (they fire the new rule, change tier contributions, don't gate entry — same architectural role as the other 7 score rules).

3. **`scripts/check-dead-axes.ts`** — static CI gate. Reads `HAWKS_SWEEPABLE_PARAMS`, extracts every `qualityGates.*` path, and asserts each gate key is referenced by at least one qualified config access (`qualityGates?.X` or `qualityGates.X`) in `hawks-quality-rules.ts`. Pure source scan, no DB, runs in <1 s. Exits non-zero if any axis is dead.

4. **Wired into `.github/workflows/lint.yml`** as a new step `Hawks sweep-catalog dead-axis check`, alongside existing `pnpm lint` and `pnpm exec tsc --noEmit`. Runs on every PR to `main`.

5. **UI badge for LABEL-ONLY axes.** New module `src/lib/backtest/presets/hawks-axis-roles.ts` lists the 9 paths that are score-only. `<LeafControl>` in the strategy sweep builder reads from this set and renders a tiny "tier label only" badge + tooltip next to the leaf label. Future agents and users can see at a glance which knobs change PnL vs only the tier label. i18n strings in en + pt-BR.

### Detective fingerprint, post-rule

Under strict quality bundle:

- `macdAlignmentScore: off` → tier `[AAA=0, AA=0, A=0, B=150]`
- `macdAlignmentScore: on` → tier `[AAA=0, AA=0, A=24, B=126]`

24 of 150 trades elevated to tier A. The rule fires. Same PnL because score rules are by design tier-only.

`macdSlopeWindow: 2 → 5` shifts the AAA bucket from 13 → 17 trades — the slope window's size has a real, monotonic-ish effect on tier distribution.

### Verification

- `pnpm tsx scripts/sweep-detective.ts` — 0 DEAD findings in the live catalog (previously 2).
- `pnpm tsx scripts/sweep-validate.ts` (9 756 runs × 24 variations) — 0 FAIL, 0 WARN.
- `pnpm tsx scripts/sweep-monotonicity.ts` — 0 violations.
- `pnpm check:dead-axes` — passes locally and is now part of CI.
- **Negative control:** temporarily removed `macdAlignmentScore === true` line from the rule file; `pnpm check:dead-axes` correctly flagged the axis as DEAD and exited non-zero. Restored the rule; check returned to clean.
- `pnpm exec tsc --noEmit` — clean.
- `pnpm exec vitest run src/__tests__/lib/{optimize,backtest}` — 213 pass, 3 intentional skip, 0 fail.
- `pnpm lint` — 0 errors.

### Lessons

1. **Static checks complement runtime gates.** `sweep-detective.ts` needs DB credentials and ~30 s wall-clock — too heavy for every PR. `check-dead-axes.ts` is a pure source scan and runs alongside lint. Use both: static for fast PR feedback, runtime for thorough validation when touching engine math.
2. **Score rules versus block rules need a UI surface.** Even now, a user wandering into the strategy sweep builder can sweep e.g. `aggressionMode` and wonder why PnL never changes. The new badge gives them the answer at a glance.
3. **Reserved-but-unimplemented gates are a recurring smell.** "Group C — MACD sign + slope" was a documented plan that drifted for months. The dead-axis CI gate makes the next such drift impossible to ignore.

---

## [BUG-2026-05-26-3] Hawks engine crashed on first sparse-indicator candle instead of skipping

**Date:** 2026-05-26
**Severity:** High (any backtest run on a 5m source that had even a single empty `mme27_60m` cell crashed the engine before producing trades)
**Affected Area:** `src/lib/backtest/modules/entry/hawks-triple-screen.ts:41-58,77-78`

### What happened

Running a Hawks backtest on the 5m source threw `HawksTripleScreen: indicator "mme27_60m" not found in candle data. Check requiredIndicators config and CSV import mappings.` and aborted with zero trades emitted.

### Root cause

The Hawks 5m CSV maps `mme27_60m` at column index 5 in the loader, so most rows have it. But the BR CSV has sparse cells (empty leading rows before the EMA stabilizes, end-of-week gaps), and `parseBrNumber` returns `null` for empty cells — the loader's `stripNulls` drops them from the row's `indicators` JSONB, so those rows arrive at the engine with the key absent.

`guardIndicatorKeys` then ran on every "first in-window candle of the day", treated `undefined` as a misconfigured import, and threw. A single empty cell anywhere in the run was enough to bomb the whole backtest.

### Why this is the wrong semantics

A misconfigured import produces ZERO candles with the key. A genuinely-imported but sparse column produces SOME candles with the key. These two states need different handling: the first is a hard error, the second is "no signal on that bar" — which is also what the original entry conditions imply (you can't fire a long when you don't know the 60m EMA value).

### Fix

Replaced the throw-on-undefined guard with a per-candle tolerance check. Each indicator read uses `typeof x !== "number"` to detect both `undefined` (missing key) and `null` (sparse cell). When any of the four required indicators is non-numeric, the function returns `{ state, signal: null }` — same effect as "entry conditions failed", no error.

The guard function was removed entirely; misconfigured imports surface as "zero signals across the run", which is more honest than a hard crash on candle #1 and lets the user see partial output (where indicators existed) instead of nothing.

### Verification

Driven by Playwright through the full flow on a real dev server:

- Selected Hawks Triple Screen strategy + WIN 5m source + date range 2026-05-04 → 2026-05-13.
- "Executar Backtest" produced **7 trades** instead of a crash.
- Triple-screen inspector mounted with all three Renko panes (5m=20pts, 15m=36pts, 60m=84pts).
- Overview chart rendered with all 7 trade markers.
- Console: 0 errors related to the inspector, the engine, or charts. The only console error was a pre-existing React DOM warning about a `<script>` tag inside `next/dist`.

### Lessons / guardrails

- **Hard-throw on a per-candle data-shape check is almost always wrong.** Treat sparse cells as "no signal" and let the absence of signals downstream tell the story. Reserve throws for "this config is impossible" (zero candles have the key in the entire dataset).
- This also makes the engine work uniformly across data sources of different completeness (pipeline-generated Renko bricks with 100% indicator coverage, CSV-loaded candles with sparse columns, partial backfills).
- The runtime-tolerance pattern + the zero-signal observability give the same protection as the guard without the brittleness.

---

## [BUG-2026-05-26-1] `ReferenceError: InspectorWindow is not defined` — `"use server"` files cannot export types

**Date:** 2026-05-26
**Severity:** High (broke the entire `/backtest` page with a 500 error after introducing the Hawks inspector)
**Affected Area:** `src/app/actions/inspector-data.ts`, `src/components/backtest/inspector/triple-screen-inspector.tsx`

### What happened

Loading `/backtest` blew up with:

```
ReferenceError: InspectorWindow is not defined
  at .next/dev/server/.../actions.js (server actions loader):37:1
  > 37 | export {getInspectorWindow as '40…'} from 'ACTIONS_MODULE8'
       | ^
```

The new `src/app/actions/inspector-data.ts` had `"use server"` at the top and a trailing `export type { InspectorWindow, InspectorCandleRow, InspectorBrickSizes }` block at the bottom. tsc was happy; lint was happy. Next.js's server-actions loader was not.

### Root cause

A `"use server"` module is treated as a **server-action manifest**: Next.js's compiler scans every top-level `export` and tries to register it as an RPC-callable async function. Type-only exports (`export type { ... }`) survive TS strip but get re-emitted as plain `export {Name}` in the runtime bundle. The actions loader then evaluates that re-export and looks up `InspectorWindow` as a runtime value — which doesn't exist, since it was an interface. → `ReferenceError` at the manifest's first module evaluation, crashing the whole page (not just the action).

The build-time check that catches `export const foo = "bar"` from a `"use server"` file does **not** catch `export type { ... }`, so it slipped past lint + tsc + Next's own server-action validator. The runtime is where it surfaced.

### Why we didn't catch it earlier

- `tsc --noEmit` only validates the TS layer, where `export type` is legal.
- `pnpm lint` has no rule that forbids non-action exports from `"use server"`.
- Local dev server compiled the route fine; the crash only fires on **first POST** to the page (i.e., when the server-actions manifest is actually loaded). The page renders briefly, then the boundary catches the manifest error.

### Fix

1. Extracted the four interfaces (`InspectorCandleRow`, `InspectorBrickSizes`, `InspectorWindow`, `OverviewWindow`) into a new `src/types/inspector.ts`.
2. `inspector-data.ts` now `import type`s them — no value-or-type export survives at the bottom.
3. Consumer (`triple-screen-inspector.tsx`) imports types from `@/types/inspector` instead of `@/app/actions/inspector-data`.

### Lessons / guardrails

- **`"use server"` files can ONLY export async functions.** Not types, not interfaces, not constants, not enums, not re-exports. If you wrote one and TS won't infer `Promise<…>` for it, it doesn't belong in that file. Co-locate types in a sibling `*.types.ts` or in `src/types/`.
- The failure mode is brutal: not "this action doesn't work" — the whole route crashes at module evaluation. So this needs to be a habit, not a "I'll catch it in review" rule.
- Gotcha logged in `docs/gotchas.md` under "Next.js / Server Actions" with the exact symptom so the next person who pattern-matches "`ReferenceError: X is not defined` from `actions.js (server actions loader)`" finds the diagnosis in seconds.

---

## [BUG-2026-05-25-3] Strategy creation fails silently — Neon HTTP driver lacks transaction support

**Date:** 2026-05-25
**Severity:** Critical (breaks core feature in production, works in dev)
**Affected Area:** `src/db/drizzle.ts`, `src/app/actions/strategies.ts:91`, `src/app/actions/strategies.ts:450`, `src/app/actions/renko-pipeline.ts:325`, `src/app/api/arch/strategies/create/route.ts:29`

### Cause

The Neon HTTP driver (`drizzle-orm/neon-http`) does not support `db.transaction()`. The HTTP protocol has no notion of multi-statement transactional semantics; each query is independent. The codebase relied on four transaction call sites to atomically insert related records (strategy + version + conditions in a single hit) and read intermediate results to construct subsequent inserts.

In production, the driver is `neon-http` (chosen for low latency / stateless HTTPS). In local worktrees and CI, the driver falls back to `postgres-js` (which supports transactions), so the bug never surfaced during development or testing.

All four call sites caught the error internally and returned a structured error response (status 200 with `{ status: "error" }`), so the API didn't crash — but the records were never inserted, and the user saw no visible error (the action returned a success toast that didn't trigger).

### Effect

- User navigates to `/en/playbook/new`, fills in strategy details, submits the form
- `createStrategy` server action runs, calls `db.transaction()`, which throws `Error: No transactions support in neon-http driver`
- The error is caught and logged internally; the action returns `{ status: "error" }`
- Browser receives HTTP 200 with a structured error, but the form doesn't display the error (it was swallowed by the action's error handler)
- Strategy is never created
- User sees no feedback and clicks submit again, repeating the cycle

Three other endpoints are affected:

- `/en/playbook/:id/edit` — `updateStrategy` with versioning
- Bulk Renko candle import — `renko-pipeline.ts`
- Admin/automation API — `POST /api/arch/strategies/create`

### Solution

Swapped the Neon driver from `neon-http` (HTTPS-based, stateless, no transactions) to `neon-serverless` (WebSocket-based, stateful, full transaction support).

**Changes:**

1. `pnpm add @neondatabase/serverless ws && pnpm add -D @types/ws`
2. Updated `src/db/drizzle.ts`:
   - Replaced `import { drizzle as drizzleNeon, type NeonHttpDatabase } from "drizzle-orm/neon-http"` with `import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless"`
   - Added `import { neonConfig } from "@neondatabase/serverless"` and configured `neonConfig.webSocketConstructor = ws` for Node runtime (production uses Node; Edge runtime has built-in WebSocket)
   - Updated exported type from `NeonHttpDatabase<typeof schema>` to `NeonDatabase<typeof schema>` (maintains compatibility with all ~13 call sites)
   - Updated comment block to document transaction support now available
3. No changes to the four transaction call sites — they just work now

**Rationale:** Both drivers point to the same Neon URL (via `DATABASE_URL`). The serverless driver uses a long-lived WebSocket instead of per-query HTTP, enabling transactional semantics. Performance impact is negligible (WebSocket connection is established once per server lifecycle, not per query).

### Prevention

- **Driver choice cascades to feature availability.** The `neon-http` driver is marketed as "low latency" but silently lacks transactions. Always check the driver's capability matrix before committing to one in production.
- **Test transaction call sites in CI.** The local fallback (`postgres-js`) masks driver-specific limitations. Spin up a Neon test database in CI and test with the production driver profile, or at minimum add a unit test that exercises `db.transaction()` with mocked delay.
- **Audit error handlers.** All four transaction sites were silently catching errors instead of propagating them. In hindsight, a test that intentionally breaks `db.transaction()` would have caught this before production.

### Related Files

- `src/db/drizzle.ts` — driver initialization and configuration
- `src/app/actions/strategies.ts:91, 450` — `createStrategy`, `updateStrategy`
- `src/app/actions/renko-pipeline.ts:325` — bulk Renko insert
- `src/app/api/arch/strategies/create/route.ts:29` — admin API
- `package.json` — added `@neondatabase/serverless`, `ws`, `@types/ws`

---

## [BUG-2026-05-25-2] Settings save redirects to login — JWT cookie corrupted by concurrent auth() calls

**Date:** 2026-05-25
**Severity:** High (randomly blocks settings save + forces re-login, breaks user workflow)
**Affected Area:** `src/components/settings/settings-save-bar.tsx`, session/cookie handling (NextAuth + proxy.ts)

### Cause

The master save bar runs `Promise.allSettled(dirty.map((s) => s.save()))` — multiple concurrent server actions fire in parallel. Each server action calls `requireAuth()` at its start, which calls `auth()` (from NextAuth). With `strategy: "jwt"` and `maxAge: 7 days`, NextAuth may refresh the session cookie on every `auth()` call. When two or more server actions execute concurrently:

1. Both read the current JWT cookie from the request
2. Both decode and validate the JWT (via `auth()`)
3. Both prepare `Set-Cookie` response headers with the refreshed JWT
4. Browser receives overlapping headers; the last one wins, potentially writing a corrupted/partial JWT

The corrupted JWT payload may be missing `userId` or have a bad signature. On the next request to the Edge runtime (middleware in `proxy.ts`), the `authorized()` callback tries to decode the JWT, gets an empty/falsy `auth.user`, and redirects to `/login?callbackUrl=...`.

This manifests 20-30 seconds after the settings save (after page navigation), because the browser doesn't send the cookie to the Edge on every request — only the next navigation triggers the decode, and by then the cookie is stale.

### Effect

User saves account settings via the master Save bar. Immediately after (or within seconds of navigating to a new route like `/plan/2026/2`), they are redirected to login with the original path as callbackUrl. The session cookie is still present in DevTools (browser hasn't cleared it), but the JWT inside is corrupted. User must log in again.

### Solution

Serialize the saves in the save bar using a sequential `for-of` loop instead of `Promise.allSettled`. Each server action now runs to completion before the next one starts, ensuring:

- Only one `auth()` call is in flight at a time
- Only one `Set-Cookie` header is written per save cycle
- No overlapping cookie writes

Error collection and reporting remain the same: all errors are gathered and surfaced in a single toast at the end.

**File changed:** `src/components/settings/settings-save-bar.tsx`

- Replaced `Promise.allSettled(dirty.map((s) => s.save()))` with a `for-of` loop that awaits each section's save sequentially
- Maintained error aggregation: results array collects `{ status, value/reason }` for each section
- Added ESLint disable comment on the `await` inside the loop with explanation

### Prevention

- **Avoid concurrent server actions that call `auth()`.** Refreshing a JWT is not idempotent in the presence of overlapping `Set-Cookie` headers. If multiple sections save in parallel and each calls `requireAuth()`, you risk cookie corruption.
- **Batch mutations by scope.** If a UI pattern allows multiple independent saves, serialize them rather than parallelizing. The UX cost (slightly slower save) is negligible; the correctness cost is high.
- **Document JWT refresh timing.** The 20-30 second delay before the redirect happens because the browser doesn't validate cookies locally; it only fails when the Edge tries to decode a corrupted JWT on the next request. This lag made the bug hard to trace back to the save.

### Related Files

- `src/components/settings/settings-save-bar.tsx` — the fix
- `src/components/settings/account-settings.tsx`, `src/components/settings/user-profile-settings.tsx`, `src/components/settings/annual-reporting-settings.tsx` — registered sections that save via this bar
- `src/app/actions/settings.ts`, `src/app/actions/accounts.ts` — server actions that call `requireAuth()`
- `src/auth.ts`, `src/auth.config.ts` — NextAuth JWT refresh logic
- `src/proxy.ts` — Edge runtime auth check where the redirect fires

---

## [BUG-2026-05-25-1] Account default asset save fails with `validation.account.invalidAssetId`

**Date:** 2026-05-25
**Severity:** High (blocks any save in Settings → Conta whenever a default asset is selected)
**Affected Area:** `src/lib/validations/account.ts`, `messages/en.json`, `messages/pt-BR.json`

### Cause

Schema mismatch between the storage layer and the input validator.

- DB column `tradingAccounts.defaultAsset` is `varchar("default_asset", { length: 20 })` (`src/db/schema.ts:243`) — designed to store the asset **symbol** (e.g. `"WIN"`).
- All read paths treat it as a symbol: `command-center-tabs.tsx:61` reads `account.defaultAsset` into a variable literally named `defaultAssetSymbol`, and `scaled-trade-form.tsx:115` does `assets.find((a) => a.id === defaultAssetId || a.symbol === defaultAssetId)`.
- The Settings form (`account-settings.tsx:471`) populates `<SelectItem value={asset.symbol}>`, so the form submits the symbol on save.
- But `createAccountSchema.defaultAsset` in `src/lib/validations/account.ts` required `.uuid("validation.account.invalidAssetId")`. Any symbol-shaped value (3–6 chars, not a UUID) failed validation, surfacing the toast "validation.account.invalidAssetId".

The bug was latent: it only fired when the user actually picked an asset. Saving with "Nenhum" (which sends `""` / `null`) bypassed the UUID check via `.optional()`/`.nullable()`.

### Effect

Account settings could not be saved whenever the user selected a default asset. The error toast displayed the raw i18n key (`validation.account.invalidAssetId`) because the server action returns the Zod issue message verbatim and no client formatter resolves nested validation keys here. Users hit a dead end on a core preference.

### Solution

1. Replaced the `.uuid()` validator with `.max(20)` to match the DB column width and the actual data shape (symbol string).
2. Removed the now-unused `invalidAssetId` key from the `validation.account` block in both locales and added `defaultAssetMax` for the new constraint.

No DB migration needed — storage was already correct; only the validator was wrong.

### Prevention

- When the Zod error key contains "Id" but the column is a `varchar`, that's a smell: the validator name has drifted from the schema. Audit other `*.uuid(...)` calls against actual column types.
- Long-term: store the asset by FK (`asset_id uuid references assets(id)`) instead of by symbol — symbols can collide across markets and are mutable. Logged in `docs/backlog.md` as a follow-up rather than retrofitted here, to keep the bug fix surgical.

### Related Files

- `src/lib/validations/account.ts`
- `src/db/schema.ts` (reference)
- `src/components/settings/account-settings.tsx` (reference)
- `messages/en.json`, `messages/pt-BR.json`

---

## [BUG-2026-05-15-1] Hawks `dailyTradeOrdinal` race condition — concurrent inserts collide on unique index

**Severity:** Medium (low probability, high correctness impact) | **Affected:** `src/app/actions/trades.ts`, `src/db/schema.ts`, `src/db/migrations/0005_boring_wasp.sql`

**Cause:** The Hawks v0 sidecar computes `dailyTradeOrdinal = COUNT(*) + 1` on the trades table before insert. Two concurrent requests (e.g., from two browser tabs) both observe `count=0`, compute `ordinal=1`, and attempt to insert. The second insert violates a unique constraint (once added) with error code `23505` (Postgres). No unique constraint existed until this fix, so the collision silently created two trades with `ordinal=1` on the same `(accountId, tradingDay)`.

The race window is narrow (requires submissions within milliseconds) but achievable. While rare in practice, the ordinal is an analytics signal expected to be monotonic per day; duplicates confuse the Hawks scoring detector.

**Effect:**

- Two trades logged concurrently on the same day could both receive `ordinal=1`
- Detector queries expecting `dailyTradeOrdinal` to uniquely order trades within a day would encounter ambiguity
- No user-facing crash; silent data inconsistency that breaks downstream analytics

**Solution:**

1. **Schema change**: Added `accountId` (uuid FK) and `tradingDay` (date) columns to `trade_hawks_metadata`. Previously these were "derived from parent trade by detector pipeline"; now they're explicit, denormalized columns populated by the action.
   - Added unique index `thm_account_day_ordinal_idx` on `(accountId, tradingDay, dailyTradeOrdinal)` to enforce ordinal monotonicity per day per account.
   - Migration backfills columns from parent `trades` table, then makes columns NOT NULL.

2. **Action change**: Wrapped Hawks sidecar insert in a retry loop (max 3 attempts) that:
   - Catches Postgres error code `23505` (unique constraint violation)
   - Recomputes `dailyTradeOrdinal` with a fresh `COUNT(*)` query
   - Retries the insert with the new ordinal
   - Throws with cause chain after max retries exhausted

3. **Test**: Added unit test `hawks-ordinal-race-condition.test.ts` validating the schema constraint and retry logic.

**Prevention:**

- **Read-then-write race: add constraints, not just sequences.** Sequences (`nextval()`) prevent collisions only if the sequence is central. When you compute a value client-side from a read (`count()`), the window between read and write is vulnerable. Add a unique constraint on the computed value to catch and recover from collisions.
- **Retry transactional writes on constraint violations.** PostgreSQL error code `23505` is retriable: recompute the conflicting value and retry. This is cheaper than a two-phase lock or a distributed sequence.
- **Denormalize for enforcement.** If an attribute like `tradingDay` is "derived from parent," and you need to enforce uniqueness on it, make it an explicit column. Computed columns in constraints are not portable; explicit columns + FK to parent are.
- **Test concurrency separately from unit tests.** Manual testing with two browser tabs hitting the same endpoint within milliseconds is the easiest way to verify a retry loop works; unit mocks can only simulate the failure path.

**Related Files:** `src/app/actions/trades.ts`, `src/db/schema.ts`, `src/db/migrations/0005_boring_wasp.sql`, `src/__tests__/actions/hawks-ordinal-race-condition.test.ts`

---

## [BUG-2026-05-15] Hawks backtest stop reference was 1 brick back instead of 2 — R-multiples silently inflated 2×

**Severity:** High (silent correctness) | **Affected:** `src/lib/backtest/modules/entry/hawks-triple-screen.ts`, `src/lib/backtest/engine.ts`, `src/lib/backtest/presets/hawks-presets.ts`, `src/types/backtest.ts`, `src/__tests__/lib/backtest/hawks-engine.test.ts`

**Cause:** The Hawks v0 entry module set `signal.stopReference = candle.open` for both long and short signals. The author's mental model was "Renko geometry: open = previous brick's close = 1 brick back, no lookup needed." But the Hawks methodology defines 1R as **2 Renko boxes against** — geometrically the price distance to "one reversal Renko closing against" is two brick bodies (1 body to retrace the entry brick + 1 body to print the reversal brick). The implementation captured half the intended risk.

**Effect:** Every Hawks backtest run since v0 shipped:

- Reported R-multiples that were **2× inflated** (e.g. a "1.7R win" was actually 0.85R of true Hawks risk).
- Sized positions **2× too large** under monetary-risk sizing — stop distance flows into `monetary-risk.ts:16` as `floor(riskAmountCents / (stopDistance × valuePerPointCents))`; doubling the stop halves the lots.
- Hit-rate for `r_multiple` targets was unaffected (the multiplier scales with whatever stop we feed in), but the _interpretation_ was wrong: "2R target" was effectively 4 brick bodies, not the methodology's true 2R.

Real-trade journal data was NOT corrupted: `tradeHawksMetadata` stores only categorical conditions (vwapRespected, ajusteRespected, scenarioId, biasAtEntry, etc.), and trade R-multiples on real trades come from user-entered entry/stop/exit on the `trades` table — methodology code never wrote there.

**Solution:**

1. Changed `signal.stopReference` in `hawks-triple-screen.ts` from `candle.open` to `2 * candle.open - candle.close` for both long and short (symmetric: long → bullish brick → formula yields stop below entry; short → bearish brick → formula yields stop above entry). One brick body below (or above) the entry brick's open = the 2-brick distance from the entry close.
2. Added `engineVersion?: string` to `BacktestResult`. Engine stamps `"hawks-v0.2"` on every Hawks backtest result so cached screenshots/exports remain traceable to the math that produced them. No DB migration needed because backtest results are ephemeral (no `backtestResults` table).
3. Updated all narrative comments: entry-module docstring, preset docstring + inline `points=0` comment, `HawksTripleScreenConfig` JSDoc in `types/backtest.ts`. All now describe "Stop = 2 bricks back, Hawks 1R = 2 Renko".
4. Re-baselined the two `stopReference` assertions in `hawks-engine.test.ts` (long: `129950 = 2·130000 − 130050`; short: `130100 = 2·130050 − 130000`). _(These were subsequently updated again — see open follow-up below.)_

**Open follow-up (shipped 2026-05-21):** The strict Profit Pro 9+1 geometry adds `+1 tick` inward vs. the 2-brick-body formula — i.e. `2·open − close + tickSize` (long) and `2·open − close − tickSize` (short). Applied in the same entry module; `_tickSize` parameter (previously unused placeholder) renamed to `tickSize` and consumed. Assertions re-baselined: long `129955`, short `130095` (tickSize=5 in tests). Effect is cosmetic at points fidelity (~5% of brick body) but matches methodology spec exactly.

**Prevention:**

- **Methodology constants in entry modules, not in engine.** The bug lived in one place — the entry module's signal construction — exactly because we put Hawks-specific stop logic there. Resist the temptation to push it into shared engine code; the engine's `r_multiple` math correctly scales with whatever stop the entry module names.
- **Doc the geometric derivation alongside the formula.** The original comment said "open = prev brick close = 1 brick back" — technically true but answered a different question. The corrected comment names the Hawks 1R = 2 Renko convention so a future reader sees what the formula is enforcing, not just what it computes.
- **R vs Renko terminology is a footgun**: 1R = 1 risk unit (= the stop distance, methodology-dependent); 1 Renko = 1 brick (the chart primitive). In Hawks specifically, 1R = 2 Renko. Other methodologies may pick other ratios. The engine and shared types stay R-agnostic; only the methodology entry module knows the conversion.
- **Engine version stamping is now available** for any future methodology revision: bump the stamped string and the UI can warn on stale exports without us needing a migration each time.

**Related Files:** `src/lib/backtest/modules/entry/hawks-triple-screen.ts`, `src/lib/backtest/engine.ts`, `src/lib/backtest/presets/hawks-presets.ts`, `src/types/backtest.ts`, `src/__tests__/lib/backtest/hawks-engine.test.ts`

---

## [BUG-2026-05-13] New accounts cannot create annual plans — capital not initialized

**Severity:** High | **Affected:** `src/components/fractal-plan/yearly-plan-editor.tsx`, `src/components/fractal-plan/cockpit/yearly-plan-slideover.tsx`, `src/components/fractal-plan/cockpit/setup-summary-card.tsx`, `src/app/actions/accounts.ts`

**Cause:** The `trading_accounts` table has `startingBalanceCents` and `accountStartYear` columns, but these were never exposed in the yearly plan creation UI. The `YearlyPlanEditor.handleSubmit()` guard checked `accountCapitalAvailable` (derived from `defaultInitialCapitalCents`), which would be `null` for new accounts. The form then blocked plan creation with an off-screen toast: "Initial capital is required but not available."

The account setup flow never gave users a chance to input their starting balance before attempting plan creation.

**Effect:** New accounts hit an invisible blocker: create plan → guard fails → nothing happens except an unseen error toast. User cannot proceed without contacting support to manually set the starting balance.

**Fix:**

1. Created new server action `setAccountStartingBalance(accountId, startingBalanceCents, accountStartYear)` in `src/app/actions/accounts.ts` — persists the starting balance and account start year.
2. Extended `YearlyPlanEditor` props to accept `accountId: string`.
3. Added `initialCapitalReais` to form state, initialized to `""` (empty).
4. Added conditional input in the capital section: `{!existing && !accountCapitalAvailable && (<Input ...>)}` — shown only when creating a NEW plan AND account has no capital set.
5. Modified `handleSubmit()` to:
   - Validate both withdrawal amount (if existing) AND initial capital (if new account)
   - Call `setAccountStartingBalance()` before creating the plan
   - Set `accountStartYear` to current year
6. Threaded `accountId` through `SetupSummaryCard` → `YearlyPlanSlideover` → `YearlyPlanEditor`.

**Prevention:** When a feature has a persistence layer (DB column), ensure there's a UI path to input that data. Don't assume initialization happens elsewhere. For new entity workflows, review the full initialization checklist.

**Related Files:**

- `src/app/actions/accounts.ts`
- `src/components/fractal-plan/yearly-plan-editor.tsx`
- `src/components/fractal-plan/cockpit/yearly-plan-slideover.tsx`
- `src/components/fractal-plan/cockpit/setup-summary-card.tsx`
- `src/app/[locale]/(app)/plan/[year]/page.tsx`

---

## [BUG-2026-02-25] Encryption works in dev but returns null/zero in production

**Severity:** Critical | **Affected:** `src/lib/crypto.ts`, `src/lib/user-crypto.ts`, `next.config.ts`, all server actions using encryption

**Cause:** Two compounding issues:

1. `import { ... } from "crypto"` (bare specifier) — Turbopack in prod potentially shims instead of resolving Node.js built-in. Dev mode has different resolution behavior.
2. `decrypt()` had bare `catch { return null }` — when `createDecipheriv` failed, error swallowed silently.

**Cascade:** `getUserDek` returns null → server actions skip decryption → ciphertext passes to `fromCents()` → `parseInt("FqIGpq...")` → `NaN` → falls back to `0`.

**Effect:** All monetary values show R$0 | User name shows ciphertext | App appears functional but displays wrong data.

**Fix:**

1. `import { ... } from "crypto"` → `from "node:crypto"` in `src/lib/crypto.ts`
2. `console.error` in `catch` block of `decrypt()`
3. Diagnostic logging in `getUserDek()` on null return
4. `serverExternalPackages: ["bcryptjs"]` in `next.config.ts`

**Prevention:** Always use `node:` prefix for Node built-in imports. Never bare `catch { return null }` in security-critical paths. Add build-time encrypt/decrypt round-trip smoke test.

**Related:** `src/lib/crypto.ts`, `src/lib/user-crypto.ts`, `next.config.ts`, `src/app/actions/*`

---

## [BUG-2026-02-25] Non-admin users blocked on Settings page

**Severity:** High | **Affected:** `src/app/[locale]/(app)/settings/page.tsx`, `src/app/actions/seed-risk-profiles.ts`

**Cause:** `seedBuiltInRiskProfiles()` threw `new Error("Unauthorized: admin access required")` for non-admin users (line 52). `settings/page.tsx` called it unconditionally on every render despite having `isAdmin` available from `getCurrentUser()` in same `Promise.all`.

**Effect:** Non-admin users saw unhandled server error on Settings page — entire page failed to render.

**Fix (defense in depth):**

1. `seed-risk-profiles.ts`: changed throw → `return []` for non-admin (safe to call from any context, per its own JSDoc).
2. `settings/page.tsx`: added `if (user?.isAdmin)` guard before calling.

**Prevention:** Server actions callable from shared pages → early return on auth, never throw. Use available user role info as gatekeeper before calling role-restricted fns.

**Related:** `src/app/[locale]/(app)/settings/page.tsx`, `src/app/actions/seed-risk-profiles.ts`

---

## [BUG-2026-03-07] Zod discriminated union missing `gainSequence` variant

**Severity:** High | **Affected:** `src/lib/validations/risk-profile.ts`, `src/app/actions/risk-simulation.ts:110`

**Cause:** TypeScript `GainMode` type has 3 variants (`compounding`, `singleTarget`, `gainSequence`). Zod `gainModeSchema` only included 2 (`compounding`, `singleTarget`). Risk simulation with `gainMode.type = "gainSequence"` → `riskSimulationParamsSchema.parse()` → discriminated union no match → `"No matching discriminator"`.

**Effect:** Any simulation using "Gain Sequence" gain mode failed at validation layer. Other modes unaffected.

**Fix:** Added `gainSequence` variant to `gainModeSchema`:

```typescript
z.object({
	type: z.literal("gainSequence"),
	sequence: z.array(lossRecoveryStepSchema).max(10, "Maximum 10 gain steps"),
	repeatLastStep: z.boolean(),
	stopOnFirstLoss: z.boolean(),
	dailyTargetCents: z.number().int().positive().nullable(),
})
```

Also fixed `scaleDecisionTree` in `risk-params-form.tsx` — missing `gainSequence` branch left steps unscaled on balance adjustment.

**Prevention:** Adding new TypeScript discriminated union variant → update Zod schema in same PR. Consider co-locating or generating one from the other. Test each variant against schema.

**Related:** `src/types/risk-profile.ts`, `src/lib/validations/risk-profile.ts`, `src/app/actions/risk-simulation.ts:110`, `src/components/risk-simulation/risk-params-form.tsx`

---

> **[FIX-2026-04-21]** `Severity: Medium` — **Affected:** `src/__tests__/setup.ts`, `src/__tests__/lib/email-verification.test.ts`, `src/__tests__/lib/auth-actions.test.ts`, `src/__tests__/lib/auth-config.test.ts`
> **Report:** 44 unit test failures (20+15+9) — `getTranslations is not supported in Client Components` from `next-intl/server` in Vitest node env. Compounded by stale mocks after `auth.ts` refactor.
> **Fix:** (1) Global `vi.mock("next-intl/server", ...)` in `src/__tests__/setup.ts` with `TRANSLATION_MAP` aligned to `messages/en.json`. (2) `email-verification.test.ts`: `maxAttempts === 3` → `maxAttempts === 2`. (3) `auth-actions.test.ts`: `loginUser` no longer gates on `emailVerified`; `registerUser` uses direct `db.insert()` (not transaction); `needsVerification` always `false`.

## [BUG-2026-07-07] real-carry-forward.test.ts broke CI Unit Tests on main — transitive @/db/drizzle import (3rd occurrence of known class)

**Severity:** Medium (CI red on auto-deploying main; no runtime impact) | **Affected:** `src/__tests__/lib/fractal-plan/real-carry-forward.test.ts`

**Cause:** The test imports pure math (`capitalAtMonthStart`, `computeNetPnlChain`, `resolveMonthStartCapital`) from `@/lib/fractal-plan/real-carry-forward`, which also imports `@/db/drizzle` for `computeRealizedPnlByMonth`'s trades query. `src/db/drizzle.ts` throws `DATABASE_URL missing` at module-init when the env var is unset — true on CI (hermetic unit tests, no `.env`), false locally. The suite failed during collection with 0 tests run. Deploy had already succeeded (deploy workflow doesn't gate on unit tests), so main was live with red CI.

**Why it recurred:** This is the exact class documented in `docs/gotchas.md` "Unit tests must never transitively import `@/db/drizzle` at module load" (logged 2026-07-06, previously bit via setup.ts loadEnvFile and via the brick-size-resolver barrel). Third occurrence, same root: passes 100% locally because `.env` exists, and the DB coupling is invisible from the test file — it's one hop away in the imported module. The test was agent-written the same day the gotcha was logged; the gotcha wasn't in the agent's context.

**Fix:** `vi.mock("@/db/drizzle", () => ({ db: {} }))` at the top of the test (precedent: `start-dry-run-impl.test.ts`). Verified with the gotcha's own recipe: `env -u DATABASE_URL pnpm exec vitest run src/__tests__/lib/fractal-plan/real-carry-forward.test.ts` → 19/19.

**Prevention:** (a) Any agent prompt that asks for tests against a module with DB imports must include the vi.mock recipe — added to the gotcha entry. (b) Structural option for next time this file grows: split pure math into a DB-free sibling module so tests never touch the drizzle import. (c) Real detector candidate: a vitest globalSetup that unsets DATABASE_URL locally (making local runs behave like CI) — filed in the gotcha as the durable fix; three occurrences means recipe-level prevention isn't working.

**Note:** The Journey E2E failure in the same push is UNRELATED and pre-existing — failing on main since at least `352836ba` (6+ commits before): journey chain setup can't load `src/db/drizzle.ts` as an ES module (`SyntaxError: await is only valid in async functions` after a module-type warning). Separate infra fix needed.
