# Hawks Chart — Hover-Focus, Trade Labels, BE Alignment, Per-Week Size

**Date:** 2026-07-14
**Status:** Shipped — all four items implemented + unit-tested (2026-07-14)
**Scope:** `src/components/hawks-chart/*`, `src/components/backtest/inspector/renko-pane.tsx`, `src/lib/chart/hawks-palette.ts` (already shipped separately)

## Problem

The Gráfico Hawks 5m pane paints every logged trade's position-box + exit stub
at once. With ~24 WIN trades in the loaded window they overlap into an
unreadable stack of `stop`/`entry`/`target` labels bleeding down the right
axis (user: "this is messing the chart"). Three secondary issues surfaced in
the same review:

- No way to tell WHICH trade a box belongs to without matching entry datetime
  by eye.
- The chart's breakeven coloring uses a hardcoded ±0.25R band that disagrees
  with the account's `breakevenTicks` rule (the rule that sets the stored
  `trades.outcome`).
- The `size R__ (___ pts)` label is fixed to the latest week's brick size and
  is wrong when scrolled to older weeks (which used different R-sizes).

Two already-shipped fixes in this session (out of scope here, listed for
context): MACD histogram recolored to buy-blue / sell-red
(`hawks-palette.ts`), and the journal custom-range timezone off-by-one
(`period-filter.tsx`).

## Goals

1. **#2 Hover-focus overlays** — show only the trade the user is hovering; a
   clean chart when nothing is hovered.
2. **#3 Trade identity badge** — on hover, show `#N · {dir} · {R} · {shortId}`
   (e.g. `#3 · short · -1.05R · 17143956`). Label only, no click-through.
3. **#4 BE alignment** — chart outcome coloring uses the account's
   `breakevenTicks` rule, matching the journal.
4. **#5 Per-week size label** — the `size R__` label reflects the hovered
   brick's actual R-size (fallback: last brick), not a single fixed value.

Non-goals: click-through from badge to journal (deferred), backfilling
`hawks_renko_sizes`, changing brick geometry or trade data.

## Key data facts (verified this session)

- `hoveredIdx5m` is already tracked in `HawksChartWorkspace` (state at ~line
  374; set from the 5m pane's `onCrosshairMove` at ~line 764/1157).
- `buildTradePositionsFor5m` (~line 166) computes each trade's
  `[startBrickIdx, endBrickIdx]` span; `buildTradeOverlaysFor5m` (~line 276)
  computes entry/exit brick indices. Both keyed by `trade.id`.
- The `brick` column (per-row R-size) is persisted in the parquet indicator
  set — verified distinct values per week (wk 2026-07-06 → R20, 06-29 → R21,
  etc.). So per-brick size is `candle.indicators.brick`; no
  `hawks_renko_sizes` lookup needed.
- Stored `trades.outcome` is already produced by `determineOutcome`
  (`src/lib/calculations.ts`) honoring account `breakevenTicks` +
  per-trade `breakeven_ticks_override`. The server action already maps
  `t.outcome` into the marker (`hawks-chart-data.ts:202`).

## Design

### #2 — Hover-focus (default: show nothing)

Add a derived "active trade id": the trade whose `[startBrickIdx, endBrickIdx]`
span contains `hoveredIdx5m`. When multiple spans overlap the hovered brick,
pick the one whose entry brick is nearest the hovered index (tie-break:
latest entry). When `hoveredIdx5m === null`, active id is `null`.

`tradePositions5m` and `tradeOverlays5m` (the memoized arrays passed to the
pane) are filtered to the single active trade (empty array when none).
Everything else about the pane's rendering stays the same — it already renders
whatever array it is handed. This is a pure filter at the workspace level; the
pane needs no change for #2.

Rationale for filtering in the workspace (not the pane): keeps the pane a dumb
renderer of "these are the trades to draw", and the hover state already lives
in the workspace.

### #3 — Trade identity badge

Build a stable per-trade display label at the workspace level, alongside the
overlay arrays:

```
label = `#${index} · ${direction} · ${rMultiple}R · ${id.slice(0, 8)}`
```

- `index` = 1-based chronological position within the loaded, entry-sorted
  trade set (stable regardless of hover).
- `rMultiple` formatted to 2 decimals with sign (e.g. `-1.05`); `—` when null.

The badge renders only for the active (hovered) trade. Rendering options
(decide in plan, low-risk either way): (a) an HTML overlay div positioned over
the pane via the pane's existing `onCrosshairMove` coordinate, or (b) a
lightweight-charts price-line/marker title. Preference: (a) — an absolutely
positioned badge in the workspace, driven by the same hover event, so no new
chart-primitive lifecycle. The pane already emits crosshair pixel coordinates.

### #4 — BE alignment (simplify, don't re-plumb)

The chart currently RE-derives outcome with a hardcoded ±0.25R band inside
`buildTradeOverlaysFor5m` (~lines 318–333). Since the stored `t.outcome`
already applies the account rule, **delete that re-derivation block** and use
`t.outcome` directly for the exit-stub color. This makes the chart agree with
the journal by construction and removes a second, conflicting BE rule. No new
data needs to cross the server/client boundary.

### #5 — Per-week size label

The pane's `subLabel` (`size ${formatRSize(sizes.size5m)}`) is computed once
from the latest-week `sizes`. Change it to reflect the hovered brick:

- Workspace resolves the active R-size from the hovered brick's
  `indicators.brick` (fallback: the last brick's `brick`, matching current
  "latest" behavior when nothing is hovered).
- Pass a resolved `sizeR` down to each pane's `subLabel` (5m from 5m hovered
  brick; 15m/60m likewise via their own hovered index from the crosshair sync
  map, or their last brick as fallback).
- `formatRSize` continues to render `R__ (___ pts)` using the
  `(N-1)×5`-points convention (per CLAUDE.md rule 0). Confirm `formatRSize`
  already does the points math; if it takes the R number it is unchanged.

## Components touched

- `src/components/hawks-chart/hawks-chart-workspace.tsx` — derive active trade
  id + label; filter overlay/position arrays to active; resolve per-brick
  size; render hover badge. (#2, #3, #4-deletion, #5)
- `src/components/backtest/inspector/renko-pane.tsx` — accept a dynamic
  `subLabel`/`sizeR` if not already prop-driven; no change for #2/#3 if badge
  is a workspace overlay. (#5)
- `src/lib/enrichment/format-rsize.ts` — read-only confirm points math (no
  change expected).

## Error / edge handling

- No trades in window → arrays empty, no badge, size label falls back to last
  brick (or FALLBACK_SIZES when no candles).
- Hovered brick outside any trade span → active id null → nothing drawn, badge
  hidden. This IS the default resting state (#2 decision).
- Brick with no `indicators.brick` value (legacy) → size label falls back to
  the pane's last-brick size, then to `sizes.size5m`.
- Overlapping trade spans on one brick → nearest-entry tie-break; deterministic.

## Testing

- Unit: active-trade resolver (`hoveredIdx → tradeId`) — inside span, outside
  span, overlapping spans tie-break, empty set.
- Unit: label builder — index/dir/R/shortId formatting, null R → `—`.
- Unit: per-brick size resolver — hovered brick size, fallback to last, legacy
  missing `brick`.
- Manual smoke: hover a trade → only that box + badge; move off → clean chart;
  scroll to an older week → size label changes to that week's R; a −0.02R
  scratch and a −1.05R loss color correctly from stored outcome.

## Rollout

Pure client/render changes on the Hawks page; no migration, no data write, no
API shape change. `main` auto-deploys. Rollback = revert the commit.
