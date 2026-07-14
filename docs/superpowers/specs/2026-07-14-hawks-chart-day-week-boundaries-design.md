# Hawks Chart — Day & Week Boundary Markers

**Date:** 2026-07-14
**Status:** Shipped — implemented + unit-tested (2026-07-14)
**Scope:** `src/lib/renko/bricks-to-chart.ts`, `src/components/hawks-chart/*`, `src/components/backtest/inspector/renko-pane.tsx`, i18n

## Problem

On the Gráfico Hawks Renko panes there is no visual cue for where one trading
day ends and the next begins, nor for week boundaries. Renko bricks are
plotted on a synthetic index axis (not real time), so a day/week rollover is
invisible — the user can't quickly see "this cluster is Tuesday, that cluster
is Wednesday" without reading the axis tick labels.

## Goal

Draw a **thin vertical line** at each trading-day boundary and a **bolder /
distinctly-colored vertical line** at each week boundary, on all three panes
(5m / 15m / 60m), controlled by a new toggle in the Indicadores row (on by
default). Thin = day, bold = week — a clear visual hierarchy on the same time
axis.

Non-goals: horizontal price-level lines (weeks are time events, not price
levels); labeling each boundary with a date/week number (deferred — can add
later if wanted); persisting the toggle across reloads beyond existing toggle
behavior.

## Detection (verified primitives)

- **Day boundary** = reuse the existing `findSessionGaps(bricksTimes, gapHours=6)`
  in `src/lib/renko/bricks-to-chart.ts:184`. It returns a `Set<number>` of
  brick indices where a >6h gap STARTS (the brick right after the gap). B3
  closes ~18:00 BRT and reopens ~09:00, so every overnight gap ≥ 15h — each
  set member is the first brick of a new trading day. No new day-detection
  logic.
- **Week boundary** = the subset of day boundaries where the BRT ISO-week of
  the new brick differs from the BRT ISO-week of the previous brick. Compute
  the BRT ISO-week from `bricksTimes[i]` (epoch ms) using the app's
  `America/Sao_Paulo` timezone (same tz constant used in `@/lib/dates`). A
  boundary is classified `week` when the ISO-week (or ISO-year) increments,
  else `day`.

## Design

### New pure helper — `computeBoundaryMarkers`

Add to `src/lib/renko/bricks-to-chart.ts` (co-located with `findSessionGaps`,
which it wraps). Pure, unit-testable:

```
computeBoundaryMarkers(bricksTimes: readonly number[]):
  ReadonlyArray<{ brickIdx: number; kind: "day" | "week" }>
```

- Start from `findSessionGaps(bricksTimes)`.
- For each gap index `i`, derive the BRT ISO-week key of brick `i` and brick
  `i-1`. If the keys differ → `kind: "week"`, else `kind: "day"`.
- A `week` boundary is NOT also emitted as a `day` boundary (one marker per
  index; week supersedes day).
- BRT ISO-week key: format the epoch in `America/Sao_Paulo`, then compute
  ISO-week-year + ISO-week-number. Implement with a small tz-aware helper
  (Intl to get the BRT Y-M-D, then a pure ISO-week calc on those numbers) so
  it stays deterministic and testable — no reliance on the host timezone.

### RenkoPane — new `boundaryMarkers` prop

Add an optional prop:

```
readonly boundaryMarkers?: ReadonlyArray<{ brickIdx: number; kind: "day" | "week" }>
```

Render each marker as a near-vertical `LineSeries` streak from
`(brickIdx, priceMin)` to `(brickIdx+1, priceMax)` — the SAME technique the
existing user-vline renderer already uses (`renko-pane.tsx` ~line 519-548:
compute priceMin/priceMax over `series.data`, draw a 1-brick-wide line). Style
by kind:

- `day` → `lineWidth: 1`, `lineStyle: 3` (dotted), color = a low-emphasis
  neutral token.
- `week` → `lineWidth: 2`, `lineStyle: 0` (solid) OR a distinct accent color,
  clearly stronger than the day line.

Colors come from `HAWKS_PALETTE` — add a `boundary: { day, week }` group
(pick tokens already in the palette, e.g. a faint gray for day and a saturated
accent for week; do not invent hex). Markers are managed in their own
`Map`/ref lifecycle (like `vlineRefs`) so they add/remove cleanly on prop
change and never leak series when toggled off (empty array → remove all).

Boundary markers sit UNDER indicators/trades in draw order (they are
background context), and are non-interactive (`priceLineVisible: false`,
`crosshairMarkerVisible: false`, `lastValueVisible: false`).

### Workspace wiring

- Add toggle key `sessionBoundaries: boolean` to `IndicatorToggles`
  (`indicator-panel.tsx`), to `TOGGLE_KEYS`, and to
  `DEFAULT_INDICATOR_TOGGLES` = **true**. Add its i18n label
  (en + pt-BR) under the `hawksChart` indicator namespace (pt-BR e.g.
  "Dias/semanas").
- In `HawksChartWorkspace`, memoize `boundaryMarkers5m/15m/60m` =
  `toggles.sessionBoundaries ? computeBoundaryMarkers(seriesXm.times) : []`,
  keyed on `seriesXm.times` + the toggle.
- Pass each to the matching `RenkoPane` `boundaryMarkers` prop.

## Components touched

- `src/lib/renko/bricks-to-chart.ts` — `computeBoundaryMarkers` + a BRT
  ISO-week helper. Export both.
- `src/components/backtest/inspector/renko-pane.tsx` — `boundaryMarkers` prop
  - render effect + ref lifecycle.
- `src/components/hawks-chart/indicator-panel.tsx` — new toggle key, label,
  default.
- `src/components/hawks-chart/hawks-chart-workspace.tsx` — memoize + pass
  markers to all three panes.
- `src/lib/chart/hawks-palette.ts` — `boundary: { day, week }` color group.
- `messages/en.json`, `messages/pt-BR.json` — toggle label.

## Error / edge handling

- Empty series / single brick → `findSessionGaps` returns empty → no markers.
- A gap that lands exactly on brick 0 → clamp endIdx to stay in axis (same
  clamp the vline renderer already does for the last-brick case).
- Toggle off → markers array empty → render effect removes all boundary
  series (no leak).
- Missing/NaN brick time → skip that boundary (defensive; shouldn't happen
  post-load).

## Testing

- Unit (`bricks-to-chart` tests): `computeBoundaryMarkers`
  - no gaps → empty
  - one overnight gap same week → single `day` marker at the right index
  - gap crossing Sunday→Monday (ISO-week increment) → `week` marker
  - gap crossing Dec 31→Jan 1 with ISO-year change → `week` marker
  - multiple gaps, mixed day/week classification, correct indices
  - BRT ISO-week helper: known dates → known ISO week/year (timezone-stable).
- Manual smoke: toggle on → thin lines at each day open, bold lines at week
  starts on all 3 panes; toggle off → all gone; scroll across a Monday →
  bold line present.

## Rollout

Pure client/render additions on the Hawks page; no migration, no data write,
no API change. `main` auto-deploys. Rollback = revert the commit.
