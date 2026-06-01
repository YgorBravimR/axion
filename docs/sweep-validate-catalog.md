# Sweep Validation Catalog

This doc lists every variation `scripts/sweep-validate.ts` exercises and why each
combination matters. It exists so future runs are reproducible and so we know
exactly which engine code paths each variation hits.

The script's job is **numerical correctness**, not optimization quality. Every
recipe runs `runBacktest` end-to-end and the output rows are audited against six
invariants (see the script header). A green run does not mean the recipes are
profitable — it means the engine's metrics math is internally consistent.

## Axes available (Hawks Triple Screen)

Sourced from `HAWKS_SWEEPABLE_PARAMS` in
`src/lib/backtest/presets/hawks-presets.ts`. Each entry is `axis path —
range/options`.

### Tier 1 — outcome knobs

- `stop.breakeven.triggerPct` — numeric, 50…200 step 25 (7 values)
- `target.levels.0.value` — numeric R-multiple, 2…4 step 0.5 (5 values)
- `slippageTicks` — numeric, 0…3 step 1 (4 values)

### Tier 2A — quality bundle (4-way enum)

- `entry.config.qualityGates.__bundle__` — off / lite / standard / strict

### Tier 2B — within-bundle numerics

- `srBlockBufferBricks` 1…4 (4)
- `srFavorRangeBricks` 2…5 (4)
- `keltnerNearBricks` 1…3 (3)
- `macdSlopeWindow` 2…5 (4)
- `aggressionThreshold` 10 000…25 000 step 5 000 (4)
- `volumeEmaPeriod` 300…700 step 100 (5)

### Tier 2C — boolean gate toggles

`srLevelBlock`, `srLevelFavor`, `keltnerOuterBlock`, `keltnerInnerPenalty`,
`macdAlignmentScore`, `volumeScore`, `htfMaBlock`. Each is on/off (2).

### Tier 2C — 3-way enum

- `aggressionMode` — off / original / reversed

### Tier 3A — engine state-machine

- `fireCooldownBricks` 3…7 (5)
- `wave1MinBricks` 3…6 (4)
- `retracementMinBricks` 1…3 (3)

---

## Variations

| ID  | Description                                         | Combo count |
| --- | --------------------------------------------------- | ----------: |
| V1  | Breakeven trigger % sweep                           |           5 |
| V2  | Target R-multiple sweep                             |           5 |
| V3  | Slippage ticks sweep                                |           4 |
| V4  | BE × R combined grid (5×5)                          |          25 |
| V5  | Quality bundle 4-way                                |           4 |
| V6  | Fire cooldown sweep                                 |           5 |
| V7  | Wave-1 min bricks sweep                             |           4 |
| V8  | Retracement min bricks sweep                        |           3 |
| V9  | Aggression mode 3-way                               |           3 |
| V10 | All Tier 2C boolean toggles, isolated (7 × 2)       |          14 |
| V11 | All Tier 2B numerics, isolated per axis             |          24 |
| V12 | Tier-1 full grid: BE × R × slip (7×5×4)             |         140 |
| V13 | Dense BE × R: step-10 BE × step-0.25 R (16×9)       |         144 |
| V14 | BE × R × bundle (7×5×4)                             |         140 |
| V15 | Engine-state grid: cooldown × wave1 × retracement   |          60 |
| V16 | Tier-1 × cooldown (7×5×4×5)                         |         700 |
| V17 | Tier-1 × wave1 (7×5×4×4)                            |         560 |
| V18 | Tier-1 × bundle × cooldown (7×5×4×4×5)              |       2 800 |
| V19 | Latin-hypercube random sample over all axes (2 000) |       2 000 |
| V20 | Fine BE × slip × bundle (step-5 BE × slip × bundle) |         496 |
| V21 | BE × R × wave1 × retracement × bundle (7×5×4×3×4)   |       1 680 |
| V22 | BE × R × slip × wave1 (7×5×4×4)                     |         560 |
| V23 | Cooldown × wave1 × bundle × aggression (5×4×4×3)    |         240 |
| V24 | BE × cooldown × wave1 (7×5×4)                       |         140 |

**Total: ~9 756 unique recipe configurations.**

---

## Audit invariants (re-stated, in execution order per row)

1. **A1 — identity ledger.** `wins + losses + breakevens === totalTrades`
2. **A2 — PF≠1 with non-zero PnL.** `not (PF == 1.0 && totalPnlCents != 0)` — the headline bug this entire validation pass exists to catch.
3. **A3 — finiteness.** Every numeric metric is `Number.isFinite` (no NaN, no Infinity unless explicitly expected).
4. **A4 — PF recomputation.** PF recomputed from `trades[]` matches stored PF within 1e-6.
5. **A5 — Sharpe collapse heuristic.** Warn if Sharpe=0 with `|avgR| > 0.01` on more than 5 trades — that pattern usually means precision loss.
6. **A6 — winRate identity.** `winRate === wins / (wins + losses) * 100` (engine uses _decisive_ denominator, excluding breakevens).

---

## Running

```bash
# All variations (~9.8k combos, ~30 s on local hardware)
pnpm tsx scripts/sweep-validate.ts

# Single variation
pnpm tsx scripts/sweep-validate.ts --only V18

# Custom date range
pnpm tsx scripts/sweep-validate.ts --from 2026-03-01 --to 2026-05-30

# Skip writing CSVs (huge variations would otherwise produce huge files)
pnpm tsx scripts/sweep-validate.ts --no-csv
```

Output goes to `tmp/sweep-validate/sweep-V{ID}-{timestamp}.csv` plus a console
audit summary. Exit code is 0 iff zero FAIL findings.

## What "aligned" means

- **Per row:** all six invariants pass.
- **Across the dataset:** PF distribution shows continuous gradient (no
  artificial pile at 1.00 from rounding collisions). When two recipes differ in
  exactly one axis, the metric should move in a consistent direction (e.g.,
  higher slippage strictly degrades PF when everything else is held).
- **No engine crashes:** all variations complete; recipes that produce zero
  trades still emit a zero-shaped summary (no NaN propagation).

---

## Last full run — 2026-05-31

Dataset: WIN 5m, 2026-04-01 → 2026-05-30, 4 866 candles.

| Metric                                                  | Value |
| ------------------------------------------------------- | ----: |
| Total runs                                              | 9 756 |
| FAIL findings                                           |     0 |
| WARN findings                                           |     0 |
| Wall-clock (script end-to-end)                          | ~40 s |
| Rows with PF exactly = 1.0 and non-zero PnL (A2)        |     0 |
| Rows with PF ∈ (0.999, 1.001) and non-zero PnL (near-1) |    23 |

The 23 near-1 PFs are recipes legitimately at the breakeven boundary. Each
row's sign-of-`(PF − 1)` matches the sign of `totalPnlCents` exactly — that's
the mathematical invariant the rounding bug was hiding. Pre-fix, these 23 rows
would all have collapsed to PF=1.00 storage and looked indistinguishable.

PF distribution (rounded to one decimal, summed across all variations):

```
  0.5 ×    9
  0.6 ×  225
  0.7 ×  388
  0.8 ×  390
  0.9 ×  658
  1.0 ×  832
  1.1 ×1 396
  1.2 ×1 700
  1.3 ×1 967
  1.4 ×1 091
  1.5 ×  649
  1.6 ×  260
  1.7 ×  163
  1.8 ×   25
  1.9 ×    3
```

Smooth, continuous, no anomalous spikes — the shape the optimizer needs to
rank correctly.

## Companion harnesses

Three scripts live next to this catalog. Use them together to catch the three
classes of sweep-axis problem:

```bash
# 1. Numerical correctness (every row passes the 6 audit invariants).
pnpm tsx scripts/sweep-validate.ts

# 2. Per-axis role classification (GATES / LABEL-ONLY / DEAD).
pnpm tsx scripts/sweep-detective.ts

# 3. Physical monotonicity sanity checks (e.g. slippage↑ ⇒ PnL↓).
pnpm tsx scripts/sweep-monotonicity.ts
```

`sweep-detective.ts` is what surfaced two dead axes during this validation
pass. See `docs/postMorten/backend.md` `[BUG-2026-05-31-3]` for the full
detective findings table.

## Axis-role legend

- **GATES** — sweeping the axis changes trade count and/or PnL. Optimizer
  benefits from including it in the auto-grid.
- **LABEL-ONLY** — sweeping changes the tier label only (AAA/AA/A/B);
  no effect on PnL/PF/Sharpe. Useful for filtering, _not_ useful for outcome
  optimization. Sweep-detective flags these.
- **DEAD** — no observable effect on PnL or tier label. Sweep-detective flags
  these as a regression — they're almost always a planned-rule placeholder
  that never landed. Two such axes were removed from
  `HAWKS_SWEEPABLE_PARAMS` on 2026-05-31 (`macdSlopeWindow`,
  `macdAlignmentScore`).
