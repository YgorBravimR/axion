# Hawks Sweep Tree — Design Doc

**Status**: Approved 2026-05-29. Implementation in stages.
**Scope**: Hawks (`hawks_triple_screen`) strategy ONLY. Other strategies will be redesigned per-strategy in follow-up docs.
**Companion backlog**: `docs/backlog.md` — "OPTIMIZE — broad-to-specific sweep tailoring" (P2) and "Hawks engine: fine-tune for better backtest outcomes" (P1).

## 1. Strategic anchor

The Hawks recipe is a **tree of leaves**, where every leaf is either fixed to one value or swept over a set/range. There is no separate "baseline vs. swept knobs" concept — every leaf is one of those two states.

This collapses the prior two-surface UX (Recipe Builder + Sweep Parameters) into **one surface**: the recipe builder IS the sweep config. Each input has a fix-vs-sweep affordance inline. The sweep summary panel survives as a read-only running total of "what's currently being swept" + cardinality preview.

## 2. The Hawks leaf tree (canonical, every sweepable thing)

```
Entry  (hawks_triple_screen)
├─ startTime              [time]      fix | sweep over set
├─ endTime                [time]      fix | sweep over set
├─ qualityBundle          [enum 5]    fix | sweep over subset
│  (off | lite | standard | strict | custom)
│  Owns the qualityGates subtree — see §5 for full bundle semantics.
├─ qualityGates           (subtree, owned by qualityBundle when set)
│  ├─ srLevelBlock        [bool]      fix | sweep
│  ├─ srLevelFavor        [bool]      fix | sweep
│  ├─ srBlockBufferBricks [num]       fix | sweep
│  ├─ srFavorRangeBricks  [num]       fix | sweep
│  ├─ keltnerOuterBlock   [bool]      fix | sweep
│  ├─ keltnerInnerPenalty [bool]      fix | sweep
│  ├─ keltnerNearBricks   [num]       fix | sweep
│  ├─ macdAlignmentScore  [bool]      fix | sweep
│  ├─ macdSlopeWindow     [num]       fix | sweep
│  ├─ aggressionMode      [enum 3]    fix | sweep over subset
│  │  (off | original | reversed)
│  ├─ aggressionThreshold [num]       fix | sweep   (conditional: parent aggressionMode ≠ off)
│  ├─ volumeScore         [bool]      fix | sweep
│  ├─ volumeEmaPeriod     [num]       fix | sweep   (conditional: parent volumeScore = true)
│  ├─ htfMaBlock          [bool]      fix | sweep
│  └─ tierThresholds
│     ├─ AAA              [num]       fix | sweep
│     ├─ AA               [num]       fix | sweep
│     └─ A                [num]       fix | sweep
├─ fireCooldownBricks     [num]       fix | sweep
├─ wave1MinBricks         [num]       fix | sweep
└─ retracementMinBricks   [num]       fix | sweep

Stop
├─ initial.type           [enum 3]    fix | sweep over subset
│  (pct_range | fixed_points | full_range)
│  ├─ initial.pct         [num]       fix | sweep   (conditional: initial.type = pct_range)
│  ├─ initial.points      [num]       fix | sweep   (conditional: initial.type = fixed_points)
│  └─ initial.ticksBuffer [num]       fix | sweep   (conditional: initial.type = full_range)
├─ breakeven.enabled      [bool]      fix | sweep
│  └─ breakeven subtree   (conditional: breakeven.enabled = true)
│     ├─ breakeven.type   [enum 2]    fix | sweep
│     │  (on_partial | on_pct_risk)
│     └─ breakeven.triggerPct  [num]  fix | sweep   (conditional: breakeven.type = on_pct_risk)
├─ trailing.enabled       [bool]      fix | sweep
│  └─ trailing.distance   [num]       fix | sweep   (conditional: trailing.enabled = true)
└─ reversal.enabled       [bool]      fix | sweep
   └─ reversal.maxReversals  [num]    fix | sweep   (conditional: reversal.enabled = true)

Target  (assume fixed_levels for Hawks)
├─ levels[N].mode         [enum 4]    fix | sweep over subset (per level)
│  (r_multiple | pct_range | pct_stop | fixed_points)
├─ levels[N].value        [num]       fix | sweep (per level)
├─ levels[N].exitPct      [num]       fix | sweep (per level)
└─ eodTime                [time]      fix | sweep over set

Execution
└─ slippagePoints         [num]       fix | sweep
```

~30 sweepable leaves.

## 3. Sweep semantics

Every leaf has exactly one of two states:

- **fix** — a single value. The recipe uses this value in every combination.
- **sweep** — a set/range. The grid generator iterates this leaf:
  - For `bool`: sweep set is always `{true, false}` (no need to pick).
  - For `enum`: a subset of the option list. `{lite, strict}` means iterate just those two values.
  - For `number`: min / max / step. Generates `floor((max - min) / step) + 1` values.
  - For `time`: a set of HH:MM values (e.g. `{09:10, 09:15, 09:20}`).

## 4. Conditional dependencies (the "if parent enum = X" rules)

Some leaves are only meaningful when a parent leaf has a particular value. The grid generator MUST respect these:

- A leaf with `condition: parent_path ∈ allowedValues` is **active** in a combination only when the parent's value in that combination is in `allowedValues`.
- When inactive, the leaf is **skipped entirely** — its sweep doesn't multiply combinations; its fix value is irrelevant (but must still be present in the recipe shape for engine compatibility — we set it to a sentinel/default).
- When active, the leaf participates normally (fix or sweep).

### Example walkthrough

User configures:

- `stop.initial.type` = sweep over `{pct_range, fixed_points}`
- `stop.initial.pct` = sweep `[20..40 step 5]` (5 values)
- `stop.initial.points` = sweep `[150..250 step 50]` (3 values)

Each leaf has a parent-condition: `pct` only active when `type = pct_range`; `points` only active when `type = fixed_points`.

Combinations generated:

- `type=pct_range × pct ∈ {20, 25, 30, 35, 40}` → 5 combos (`points` is inactive, skipped)
- `type=fixed_points × points ∈ {150, 200, 250}` → 3 combos (`pct` is inactive, skipped)
- **Total: 8 combos.** Not `2 × 5 × 3 = 30`, because the irrelevant axis is dropped per branch.

This is the **conditional ranges** model. The grid is no longer a flat Cartesian product; it's a per-branch tree.

### Algorithmic shape

```
generateGrid(leaves):
  for each leaf in topological order (parents before children):
    if leaf is fix: lock its value
    if leaf is sweep:
      expand current grid by iterating leaf's swept values, filtering
      by parent conditions in each existing combination
  return all surviving combinations
```

A topological order is required because a child's filter depends on its parent's resolved value in each combination.

## 5. Bundle semantics (THE critical model)

`qualityBundle` is an enum leaf with values: `off | lite | standard | strict | custom`. It owns the `qualityGates` subtree.

### Bundle in fix mode

User picks ONE bundle value:

- **Picked a named bundle** (`off | lite | standard | strict`): every leaf in `qualityGates` is **locked** to the bundle's defined value. Those leaves cannot be fixed or swept by the user — the bundle owns them. The recipe-builder UI hides their fix-vs-sweep affordances and just shows the bundle-defined value (read-only) for transparency.
- **Picked `custom`**: bundle owns nothing. Every `qualityGates` leaf returns to user control — fix or sweep.

Leaves NOT in `qualityGates` (entry time window, fireCooldown, stop, target, etc.) are NEVER touched by bundle. They remain user-controlled regardless of bundle state.

### Bundle in sweep mode

User picks TWO OR MORE bundle values:

- Each value generates a **separate sub-tree** of combinations.
- For each value, the `qualityGates` leaves are locked to that bundle's values during that sub-tree's combinations.
- All other leaves (non-quality) sweep as normal across the sub-tree.
- **Total combinations = sum over bundle values of (sub-tree combinations).**

Special case: if `custom` is included in the sweep set, the `qualityGates` leaves' user-configured fix/sweep settings apply within the `custom` sub-tree only. Within the other (named) sub-trees they are locked.

### Example

User configures:

- `qualityBundle` = sweep over `{off, strict, custom}`
- `qualityGates.srBlockBufferBricks` = sweep `[1..4 step 1]` (user-configured but only meaningful under `custom`)
- `stop.initial.points` = sweep `[150..250 step 50]`

Combinations:

- `bundle=off`: 1 bundle config × 3 stop values × (gates locked, srBlockBuffer's user sweep is suppressed) = 3 combos
- `bundle=strict`: same shape = 3 combos
- `bundle=custom`: 4 srBlockBuffer values × 3 stop values = 12 combos
- **Total: 18 combos.**

### Why this is precedence-deterministic

Bundles own the gates they touch. **Inside a non-custom bundle sub-tree, individual gate sweeps don't even run.** No ordering ambiguity, no "Frankenstein" overrides, no "last-toggled wins". The bundle has dominion; that dominion is explicit and visible in the UI.

## 6. UI shape (inline-in-recipe sweep controls)

Each leaf in the recipe builder renders with one of three primitive controls, each in two modes:

### Number leaf (e.g. `stop.initial.points`)

- **Fix mode**: existing single-value `<Input type="number">`.
- **Sweep mode**: three inputs in-place — `min` / `max` / `step` — plus a small "values: N" counter.
- **Toggle affordance**: a "Sweep" pill / icon on the right of the label that switches modes. Tapping it once: enter sweep mode with sensible defaults (derived from the current fixed value if any). Tapping it again: collapse back to fix mode with the current `min` value preserved.

### Boolean leaf (e.g. `srLevelBlock`)

- **Fix mode**: existing `<Switch>` (on/off).
- **Sweep mode**: a 2-card chip selector with both `off` and `on` ticked (sweeping is always over `{off, on}` for booleans — no need to pick).
- **Toggle affordance**: same "Sweep" pill on the label.

### Enum leaf (e.g. `stop.initial.type`, `qualityBundle`, `aggressionMode`)

- **Fix mode**: existing single-select picker (PluginPicker or SegmentedToggle).
- **Sweep mode**: multi-select chip group — tick each option to include in the sweep set. Min 2 ticks to be a valid sweep; 1 tick collapses back to fix.
- **Toggle affordance**: same "Sweep" pill.

### Inactive leaves

When a leaf's parent condition is not satisfied in the current recipe state, the leaf is **hidden entirely** from the UI. Example: when `breakeven.enabled` is fixed to `false`, the entire breakeven subtree (type, triggerPct) is hidden. When `breakeven.enabled` is being swept (i.e., set includes both `true` and `false`), the subtree IS visible because some combinations need it.

### Bundle-managed leaves

When `qualityBundle` is fixed to a named bundle, every `qualityGates` leaf:

- Hides its fix-vs-sweep toggle.
- Shows a read-only value pill: "Locked by bundle: <value>".

When `qualityBundle` is fixed to `custom` OR being swept and includes `custom`, the gates render normally (fix-or-sweep affordances active).

### Summary panel

A small read-only panel (sidebar or sticky footer) shows:

- **Active sweep axes**: count, list (label + values count for each).
- **Total combinations**: running total computed via the conditional-ranges grid algorithm. Live-updates on every leaf change.
- **Cap status**: green if under WARN (500), yellow if WARN ≤ x < MAX (2000), red + Run button disabled if over MAX.

## 7. Cardinality (decisions)

- **Hard cap stays at 2000 for MVP.** Re-evaluated by the existing P3 backlog entry "OPTIMIZE — benchmark MAX_COMBINATIONS cap".
- **Live preview is load-bearing.** Every leaf state change recomputes the total in the summary panel. Generator math must be the _real_ conditional-ranges count, not naive Cartesian product.
- **Stage-aware caps deferred** until the broad-to-specific funnel work (P2 backlog) ships.
- **Defensive guard in worker**: if grid generation produces > MAX, return error before queuing runs (belt + suspenders).

## 8. Data model — `SweepableLeaf`

To support the above, the existing `SweepableParam` type evolves to:

```ts
type SweepableLeaf =
	| {
			kind: "bool"
			path: string
			labelKey: string
			condition?: LeafCondition
			managedBy?: string // owner leaf path (e.g. qualityBundle path)
	  }
	| {
			kind: "enum"
			path: string
			labelKey: string
			options: { value: string; labelKey: string }[]
			condition?: LeafCondition
			managedBy?: string
			// For bundle-shaped enums: how to apply each option to the recipe.
			applyOption?: (recipe: StrategyRecipe, value: string) => StrategyRecipe
			// For bundle-shaped enums: what leaf paths it "owns" (locks).
			ownsPaths?: string[]
	  }
	| {
			kind: "number"
			path: string
			labelKey: string
			defaultMin: number
			defaultMax: number
			defaultStep: number
			condition?: LeafCondition
			managedBy?: string
	  }

type LeafCondition = {
	parentPath: string
	allowedValues: (string | number | boolean)[]
}

type LeafSelection =
	| { kind: "fixed"; value: PrimitiveValue }
	| { kind: "sweep_set"; values: PrimitiveValue[] } // enum/bool
	| { kind: "sweep_range"; min: number; max: number; step: number } // number
```

The strategy registry exports `HAWKS_LEAVES: SweepableLeaf[]` in topological order (parents before children).

## 9. Grid generation algorithm

```
input: leaves[], selections: Map<path, LeafSelection>

generateGrid():
  combinations = [{}]  // start with one empty combination

  for leaf in leaves (topological order):
    selection = selections[leaf.path] or default (fixed at recipe baseline)

    new_combinations = []
    for combo in combinations:
      if leaf is managed by an owner that's resolved to a named bundle in combo:
        # leaf is locked; force its value from the bundle
        new_combinations.append({...combo, [leaf.path]: bundle_value_for_leaf})
        continue

      if leaf.condition exists and not satisfied by combo:
        # leaf is inactive in this combo; skip it (don't multiply)
        new_combinations.append(combo)
        continue

      if selection.kind == "fixed":
        new_combinations.append({...combo, [leaf.path]: selection.value})

      elif selection.kind == "sweep_set":
        for v in selection.values:
          new_combinations.append({...combo, [leaf.path]: v})

      elif selection.kind == "sweep_range":
        for v in expand_range(min, max, step):
          new_combinations.append({...combo, [leaf.path]: v})

    combinations = new_combinations

  return combinations
```

Each combination is a complete `Map<path, value>`. The runner reconstructs a full recipe from this map by writing values at their nested paths.

## 10. Migration plan (current → new)

### Phase A — Model & generator (no UI change)

1. Define `SweepableLeaf` + `LeafCondition` + `LeafSelection` in `src/lib/optimize/sweep-leaf.ts`.
2. Export `HAWKS_LEAVES` from `src/lib/backtest/presets/hawks-presets.ts` in topological order. Includes every leaf in §2.
3. Implement the conditional-ranges grid generator in `src/lib/optimize/grid-conditional.ts` per §9.
4. Add unit tests covering: (a) bundle-fix locks gates, (b) bundle-sweep generates sub-trees, (c) conditional ranges deduplicate properly (stop type example in §4), (d) cardinality counter matches generator output.
5. Existing `HAWKS_SWEEPABLE_PARAMS` flat list is kept temporarily for backward compat with the current Sweep Parameters panel.

**Done when**: tests green, cardinality counter exposed as a helper, no UI change shipped yet.

### Phase B — Recipe-builder inline sweep controls

1. Build three reusable controls: `<NumberOrSweep>`, `<BoolOrSweep>`, `<EnumOrSweep>` in `src/components/optimize/leaf-controls/`.
2. Each control wraps the existing primitive (Input / Switch / PluginPicker / SegmentedToggle) and adds the fix-vs-sweep mode toggle.
3. Wire one section at a time, behind a feature flag (`OPTIMIZE_INLINE_SWEEP_HAWKS_ENABLED`):
   - First section: `stop-protection-section.tsx` — relatively self-contained, exercises all three primitive types.
   - Second: `hawks-quality-controls.tsx` — exercises bundle ownership and conditional sub-trees.
   - Third: `targets-exit-section.tsx` — exercises per-level repetition.
   - Fourth: `hawks-entry-section.tsx` (time leaves + cadence numerics) — covers the remaining top-level Hawks fields.
4. Sweep summary panel replaces the existing Sweep Parameters tab — read-only running total + cap status.

**Done when**: flag enabled in dev, all Hawks-tier leaves are sweepable inline, summary panel matches generator math, no regressions in backtest mode (recipe panels still work as fixed-only when no `SweptPathsProvider` is mounted).

### Phase C — Cutover

1. Flip the feature flag on by default for Hawks. Remove the old Sweep Parameters tab UI.
2. Keep `HAWKS_SWEEPABLE_PARAMS` as the legacy export for other strategies (ORB, dezK, user-catalog) until they're redesigned per-strategy.
3. Drop the SweptPathsProvider hide-logic (it becomes obsolete — leaves are inline-controlled).

**Done when**: feature flag removed, old code paths deleted, Hawks runs through the new pipeline end-to-end.

## 11. Open questions (to resolve before Phase B)

1. **Per-level enum sweep for targets**: when sweeping `levels[0].mode`, does each mode value carry its own conditional range for `value` (e.g. R-multiple values for `r_multiple`, point values for `fixed_points`)? Answer: yes per §4 — each mode is a parent for its own value range. UI shape needs care because the target levels are a dynamic-length array.
2. **Default sweep ranges**: when the user clicks the Sweep pill on a numeric leaf, what min/max/step does it default to? Proposal: derive from the leaf definition's `defaultMin/defaultMax/defaultStep`, with the current fix value as the midpoint if specified.
3. **Time leaves** (`startTime`, `endTime`, `eodTime`): sweep over a set of HH:MM values. Need a small chip-picker for time sets. Defer to Phase B execution.
4. **Persistence**: should sweep configurations be saveable as named presets? Probably yes per backlog "broad-to-specific funnel", but defer to that work.

## 12. Out of scope

- Non-Hawks strategies (ORB, dezK, user-catalog) — each gets its own design doc.
- Per-day regime sweeping (Tier 3C deferred).
- Walk-forward sweep semantics (already shipped; integrates orthogonally with this model).
- Pareto frontier tooling (already shipped; reads `OptimizationRun.summary` and is independent of sweep config shape).

## 13. Provenance

- Decisions captured 2026-05-29 via conversation with Ygor on PR #10.
- Bundle semantics ("bundle owns its leaves; multi-bundle is outer loop") authored by Ygor.
- Conditional ranges ("powerful" path) chosen by Ygor over independent-and-filter.
- UI inline-in-recipe pattern proposed by assistant and confirmed by Ygor.
- Cardinality stays at 2000 hard cap pending the P3 backlog benchmark.
