# Hawks Renko Brick Sizes by Week

Source: `data/hawks/renko-sizes.csv` (maintained in `importHawksRenkoSizes` server action).

Brick size changes **between weeks** — the 5m, 15m, and 60m brick sizes are all
recalculated weekly. This means charts from different weeks are **not
continuously comparable** on raw price distance. The backtest engine reads the
applicable week's brick size from the DB for each candle via the renko-sizes
table. Step-1 of the improvement plan explicitly accepts week-boundary
discontinuities as expected.

## Loaded date range: March – May 2026

| Week # | Week starting | 5m brick (pts) | 15m brick (pts) | 60m brick (pts) |
| ------ | ------------- | -------------- | --------------- | --------------- |
| 13     | 23/03/2026    | 34             | 60              | 123             |
| 14     | 30/03/2026    | 32             | 58              | 119             |
| 15     | 06/04/2026    | 32             | 58              | 119             |
| 16     | 13/04/2026    | 28             | 51              | 111             |
| 17     | 20/04/2026    | 24             | 43              | 99              |
| 18     | 27/04/2026    | 22             | 40              | 91              |
| 19     | 04/05/2026    | 20             | 36              | 84              |
| 20     | 11/05/2026    | 21             | 39              | 84              |

## Key implications for verification

- The `brickSize5mPoints` in `hawksV0` preset is hardcoded to `100` (the
  13/05 reference day). For multi-week backtests, the engine should read
  the applicable week's brick size from the DB at runtime.
- Verification probes (`diff-5m-vs-csv.ts`, etc.) compare absolute OHLC
  values, so week-boundary effects don't affect their per-day pass/fail.
- Wave-1 gate (`≥ 4 × brickSize`) and retrace gate (`≥ 2 × brickSize`)
  will fire at different price distances depending on the week.
