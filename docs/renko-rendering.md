# Renko Brick Rendering — Canonical Recipe

Single source of truth for rendering Renko candles on Lightweight Charts in this repo. Every brick-chart consumer (the backtest inspector, the engine lab, the hawks-chart page, anything new) MUST follow this recipe. Deviating from it has cost us multiple debug sessions already (see "Why this exists" below).

If you're building a new surface that paints bricks, start by composing the existing `RenkoPane` component in `src/components/backtest/inspector/renko-pane.tsx`. Don't roll your own. If `RenkoPane` is missing a feature you need, extend it — don't fork.

---

## The non-negotiable invariants

These are the things that break in production when missed. Treat each one as a rule, not a suggestion.

### 1. The x-axis is the brick INDEX, not the brick close timestamp

Lightweight Charts expects strictly-ascending `time` per series. Renko bricks have non-uniform spacing in wall-clock time — multiple bricks can paint in the same second (fast tape, session open), and long stretches of seconds can pass with zero bricks. Plotting bricks against timestamps would either compress fast tape into invisible slivers or stretch slow periods into empty whitespace.

**Recipe**: every chart series uses `time: i as UTCTimestamp` where `i` is the brick's position in the array. Keep a parallel `times: number[]` array mapping `i` → `brick.closeTimestamp.getTime()` so consumers (crosshair-sync, marker placement, axis labels) can do brick-idx ↔ wall-clock conversions.

Helpers (single source of truth — use these, don't recompute): `src/lib/renko/bricks-to-chart.ts`

- `candlesToBrickSeriesNative(rows)` — convert DB rows to `{ data: CandlestickData[], times: number[] }`. Wicks preserved.
- `bricksToCandleSeries(bricks)` — same shape from synthesized bricks (collapses wicks to body). Only use when you don't have real OHLC.
- `findBrickIndexForTime(times, ms)` — nearest brick index for a wall-clock instant. Used for marker placement.
- `buildCrosshairSyncMap(times5m, times15m, times60m)` — pre-computed brick-idx-to-brick-idx mapping for triple-screen crosshair sync.
- `indicatorValuesByBrickIndex(times, candles, key)` — pulls a JSONB-stored indicator per brick.

### 2. Tick-mark formatter AND crosshair-hover formatter BOTH need overriding

Because `time: i` is a small integer, Lightweight Charts' default formatter treats it as a Unix epoch and prints `01 Jan '70 00:00:00.014`. Two formatters live in two different config slots:

- `timeScale.tickMarkFormatter` — labels under the x-axis ticks.
- `localization.timeFormatter` — the floating crosshair-hover bubble.

Override **both** with the same translator that looks up `seriesTimesRef.current[idx]` and formats from the real epoch. Missing the second one was the "01 Jan '70 persists in hover" bug fixed 2026-06-30. `RenkoPane` already does this — use it.

### 3. Order parquet rows by `(timestamp ASC, candle_index ASC)` — NOT just timestamp

The Profitchart CSV ingest stamps every brick painted during a single session-open tick burst with the platform's first-tick timestamp. The 5m WIN parquet had 74 duplicate-timestamp clusters; the worst one had **80 bricks sharing one second**. With `ORDER BY timestamp ASC` alone, DuckDB returns the cluster in arbitrary order — observed scrambled like `idx=93, 32, 91, 90, ...`.

When a cluster comes back scrambled, the bricks render in the wrong sequence: a session that gapped UP can look like a downward staircase, indicators painted on top wander in the wrong direction, and the crosshair hits land on phantom bricks.

**Recipe**: `src/lib/candle-store/duckdb-impl.ts` already orders by `(timestamp ASC, candle_index ASC)`. If you ever read parquet directly (probes, audits, exports), use the same compound order. `candle_index` resets per-day but is monotone within a same-timestamp cluster, so the tie-break is correct.

Do NOT try to dedupe or backfill synthetic timestamps. The bricks are real; the platform just lacks sub-second resolution on session opens.

### 4. WhitespaceData breaks lines at session gaps — emit ONE point per gap, not two

When projecting indicators across overnight gaps, the indicator value steps from "last value before close" to "first value after open" — a 1000-4000 point jump. Without a break, Lightweight Charts draws a long diagonal across the gap that visually dominates the chart ("monster" lines).

Lightweight Charts cuts a `LineSeries` at any point of shape `{time}` (no `value`) — WhitespaceData. Insert one at each session boundary.

**Bear-trap**: at the boundary brick `i`, do not push BOTH the whitespace marker AND the real value. Two points at `time: i` triggers `Assertion failed: data must be asc ordered by time, index=N, time=T, prev time=T` and the error boundary catches it → chart never mounts. **Emit only the whitespace marker** and `continue` past the real-value lookup. You lose one indicator point per gap — acceptable trade.

The threshold for "this is a gap" is 6 hours, not 60. Brazilian B3 close-to-open is ~15h; 6h sits comfortably between in-session and overnight. The longer 60h I tried first only catches weekends and misses every overnight gap.

Helper: `findSessionGaps(bricksTimes, gapHours=6)` in `src/lib/renko/bricks-to-chart.ts`. Already wired into `indicatorValuesByBrickIndex`.

### 5. `R<N>` brick size means `(N − 1)` ticks, in POINTS

Stored in `hawks_renko_sizes.size_5m / size_15m / size_60m` as the **R number `N`**. 1 WIN tick = 5 points. So `R<N>` in points = `(N − 1) × 5`. R20 → 95 pts, R21 → 100 pts, R34 → 165 pts.

Every R-math conversion MUST do this translation. Misreading the column as "tick count" or "points" has bitten the engine repeatedly. See `CLAUDE.md` rule 0 for the canonical spec.

### 6. Pivot direction is by WICK, not by close-vs-open

Structural-pivot direction for the TOPO/FUNDO detector classifies brick direction by **wick extremes** vs the prior brick: bullish = `high > priorHigh`, bearish = `low < priorLow`. Pivot prices live at `brick.high` (TOPO) and `brick.low` (FUNDO). Single source: `src/lib/backtest/hawks-structural-pivots.ts`.

The visible chart swing sits at the wick — the engine must see the same swing the user reads.

---

## Trade overlays (entry/exit markers + price stubs)

For surfaces that paint many trades on one pane (hawks-chart, multi-trade backtest views), use `RenkoPane`'s `tradeOverlays` prop. Each overlay paints:

- **Entry marker**: colored by DIRECTION (long = blue/buy, short = red/sell).
- **Entry price stub**: short dashed horizontal line at the entry price, anchored ±2 bricks around the entry brick.
- **Exit marker**: colored by OUTCOME (win = light green, loss = light red, breakeven = yellow).
- **Exit price stub**: short dashed line at the exit price, anchored ±2 bricks around the exit brick.

**The breakeven band is chart-side, not DB-side.** The `trades.outcome` column reflects accounting truth (uses per-account `breakevenTicks`, which is often 0). The chart paints `breakeven` (yellow) whenever `|rMultiple| ≤ 0.25R` regardless of stored outcome. This keeps marginally-positive and marginally-negative outcomes from polluting the eye when scanning for real edges. See `effectiveOutcomeFor` in `src/components/hawks-chart/hawks-chart-workspace.tsx`.

If you ever need to override the breakeven band per-route, lift `BREAKEVEN_R_BAND` to a prop on `RenkoPane`. Don't fork the helper.

---

## Indicator color palette (Nelogica reference)

The Axion product chart uses the OKLCH chart-token system (`globals.css`). The hawks-chart surface uses the **Nelogica palette** instead (steel-blue × light-gray candles, Tom-3 saturated blues/reds for trades). Single source for the Nelogica mapping: `src/lib/chart/hawks-palette.ts`. The doc reference is `/Users/ygorbravim/personal/projects/nelogica/PALETA_CORES.md` — but note the doc is authoritative for naming, not always for hex (the 60m EMA was user-corrected from oliva to laranja on 2026-06-30 from live Profitchart reference).

When introducing a new indicator on hawks-chart, pick its color from the palette doc's "Indicadores e cores em uso" table; do not invent hues. If the indicator isn't in the table, ask before adding.

Apply the palette to RenkoPane via the `paletteOverride` prop. Don't mutate `HAWKS_PALETTE` at runtime — the override is per-pane so other surfaces stay on the Axion theme.

---

## Why this exists

Each item below cost real time. They keep coming back because the "obvious" approach trips the same wire.

| Date       | What bit us                                                                                                                        | Where it's logged                              |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 2026-05-26 | Same-time markers crashing the inspector                                                                                           | `docs/postMorten/frontend.md` BUG-2026-05-26-2 |
| 2026-06-30 | WhitespaceData + real value at same brick index → setData asserts                                                                  | `docs/gotchas.md` Lightweight Charts           |
| 2026-06-30 | `findSessionGaps` 60h threshold missed overnight gaps → "monster" diagonals                                                        | `docs/gotchas.md` Lightweight Charts           |
| 2026-06-30 | `ORDER BY timestamp ASC` alone scrambled 80-brick session-open clusters → "downward staircase that should have been an upward gap" | `docs/gotchas.md` Candle-store reader          |
| 2026-06-30 | `01 Jan '70` in crosshair hover — missed `localization.timeFormatter` even though `tickMarkFormatter` was set                      | This doc, §2                                   |
| recurring  | Misreading `hawks_renko_sizes.size_*` as tick count instead of R-number                                                            | `CLAUDE.md` rule 0                             |

If you trip one that isn't here, append it to the table AND extend the relevant invariant above so the next session doesn't relearn.

---

## TL;DR for a new brick-chart consumer

1. Don't write your own chart wiring. Use `RenkoPane`.
2. Read candle data through `getCandleStore().fetchRange(...)` — the reader already does the `(timestamp, candle_index)` tie-break.
3. Convert to series via `candlesToBrickSeriesNative`.
4. If you project indicators, use `indicatorValuesByBrickIndex` — it already inserts WhitespaceData at session gaps.
5. If you paint trades, use the `tradeOverlays` prop with `effectiveOutcomeFor()` to honor the 0.25R breakeven band.
6. If you need a palette other than the Axion default, pass it via `paletteOverride`. Don't mutate `HAWKS_PALETTE`.
7. Pass `localization.timeFormatter` AND `timeScale.tickMarkFormatter` (RenkoPane already does — verify if you fork).
