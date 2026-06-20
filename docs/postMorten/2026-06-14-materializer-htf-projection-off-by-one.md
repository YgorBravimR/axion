# Post-Mortem: Materializer HTF projection off-by-one (`<=` vs `<` floor)

**Date**: 2026-06-14
**Issue**: `scripts/materialize-hawks-timeframes.ts` projected the wrong HTF brick's EMA onto every 5m brick that shared a timestamp with an HTF brick close, contaminating `mme27_15m` / `mme55_15m` / `mme27_60m` / `mme55_60m` for ~17% of 5m rows.
**Severity**: MAJOR — corrupted indicator surface read by Indicator Lab today and by the autonomous Hawks engine in the future.
**Status**: FIXED

---

## Root Cause

`project()` resolved the source brick via:

```ts
const idx = findFloorIndex(source, target.timestamp.getTime() - 1)
```

The `- 1` enforces a strict-less-than comparison: it picks the source brick whose timestamp is **strictly before** the target. ProfitChart Renko exports stamp each brick with its **close** timestamp, not its open. So when a 5m brick and an HTF brick share a timestamp T (a fast-print event that breached both Renko thresholds in the same instant — common during news bursts), the HTF brick at T **had already closed**, but `-1` excluded it and the projection picked an earlier HTF brick.

In burst regions (e.g. 2026-03-03 around 12:02), dozens of 5m bricks fire at the same exact timestamp while only one HTF brick closes there. The projection on all those 5m bricks reached back to an HTF brick from many minutes prior — a ~3000-point EMA gap on WIN.

## Impact

Pre-fix audit via `scripts/verify-htf-projection.ts` against the current parquet window:

| Channel   | Coincident bricks | Mismatched (\|Δ\| > 0.5pt) | Mean \|Δ\| | Max \|Δ\| |
| --------- | ----------------: | -------------------------: | ---------: | --------: |
| 15m ema27 |             2 360 |              2 315 (98.1%) |   58.92 pt |  3 237 pt |
| 15m ema55 |             2 360 |              2 311 (97.9%) |   39.63 pt |  2 012 pt |
| 60m ema27 |             1 082 |               1 082 (100%) |  113.72 pt |  1 326 pt |
| 60m ema55 |             1 082 |              1 075 (99.4%) |   91.46 pt |    811 pt |

Indicator Lab's S/R magnets, the Hawks 15m HTF gate, and the 60m HTF gate all read these columns. Every Renko burst day silently fed bad EMA levels into the trigger machine.

The backlog entry that flagged this (filed 2026-06-13) under-estimated the magnitude — it described a "~30–40 point" boundary effect from in-browser observation. The real defect ran an order of magnitude larger on burst days.

## Fix

`scripts/materialize-hawks-timeframes.ts`:

```diff
- const idx = findFloorIndex(source, target.timestamp.getTime() - 1)
+ const idx = findFloorIndex(source, target.timestamp.getTime())
```

When a source brick shares a timestamp with the target, it IS closed at that moment (ProfitChart Renko close-stamping) and is the correct projection source. No lookahead is introduced because both bricks resolved their close simultaneously — the source's EMA at T was computed from price action that preceded T, identical to the target.

Parquets regenerated via `pnpm tsx scripts/materialize-hawks-timeframes.ts`. Post-fix audit:

| Channel   | Mismatches |
| --------- | ---------: |
| 15m ema27 |  0 / 2 360 |
| 15m ema55 |  0 / 2 360 |
| 60m ema27 |  0 / 1 082 |
| 60m ema55 |  0 / 1 082 |

## Detection

A standing verifier lives at `scripts/verify-htf-projection.ts`. Add to CI alongside any future materializer change so regressions surface immediately.

## Why we missed it

The initial backlog entry came from comparing a single boundary brick in the browser, not a full-window audit. The 30–40pt "boundary lag" was the symptom on a normal-trading-day brick; the catastrophic 3 000pt burst-day case never surfaced visually because Indicator Lab clips the EMA line to the visible window and the user never zoomed into the burst region.

Lesson: when a projection bug is suspected, audit the full parquet not a sampled visual — the worst rows are exactly the rows you don't naturally zoom into.

## Follow-ups (none open)

- Verifier covers 15m and 60m projection across the full parquet window.
- No engine code referenced the bad column path — all consumers re-read after regeneration.
