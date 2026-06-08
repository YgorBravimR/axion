# Hawks Backtest — Improvement Plan

**Status:** SUPERSEDED 2026-06-08 &nbsp;·&nbsp; **Owner:** Ygor &nbsp;·&nbsp; **Last update:** 2026-05-26

> **Note (2026-06-08):** This 7-step plan was the original "verify the data layer one column at a time" approach. It has been superseded by the per-brick-size pipeline (`load-hawks-bricks-by-size.ts` → `materialize-hawks-timeframes.ts`) and the user-catalog backtest mode. The probe scripts referenced throughout (`check-*`, `diff-*`, `probe-*`, `scripts/load-hawks-candles.ts`) have been deleted. The narrative below is preserved as historical context; do not treat it as actionable. Fresh probes should be written against `@/lib/candle-store`.

This is the step-by-step plan for getting the Hawks (Tripla Tela Renko) backtest
to faithfully reproduce manual trades on ProfitChart. We stop trying to solve
everything in one engine pass and instead lock down one foundational layer at
a time, with explicit acceptance criteria per step.

---

## Why this plan exists

Iterating directly on the entry-module logic without verifying the underlying
data pipeline has been producing chase-the-symptom fixes:

- Trades fired on stale cross-day state because of where the day-boundary
  reset lived.
- The engine skipped pivots before `09:30` because `startTime` was gated.
- The 5m DB rows turned out to be Renko-brick events (not 5m time candles),
  which we only discovered after several iterations.
- Box numbering between our DB and the user's ProfitChart spreadsheet is
  off (matched on T1 by exact price, but T2's box 35 in our data closes at
  182,000 while the user's catalog says 181,100 at box 35).

Each of these is a different layer of the stack. Fixing them all from inside
the entry state-machine is the wrong abstraction. The plan below lets us
**verify each layer independently** with a printable artifact (a SQL row, a
visual chart, an indicator value) before the next layer is allowed to depend
on it.

---

## The 7 steps

### 1. Make sure candles are plotted right

**Scope.** Verify that the 5m bricks loaded into `price_candles` faithfully
mirror what ProfitChart shows on the 5m Renko chart for WIN. This is the
ground truth that everything else depends on.

**Current state.**

- The 5m CSV contains irregularly spaced rows with body-size ≈ 100 points —
  consistent with Renko bricks, not time candles.
- DB row 16 (0-indexed) of 13/05/2026 closes at 182,000 with high 182,155.
  The user's "brick 16 @ 182k" matches this on price, so the _first_ brick of
  the day in DB aligns with the user's box 1.
- But box 35 disagrees: DB row 34 closes at 182,000; user says T2 box 35 is
  @ 181,100 (which is DB row 43). **9-brick drift somewhere between brick 1
  and brick 35.**

**Acceptance criteria.**

- [ ] Pull the user's CSV export for 13/05/2026 and diff it against the DB
      rows for that day. Row-by-row: same timestamp, same OHLC, same brick
      sequence.
- [ ] If rows differ, identify whether the loader filters/skips bricks (e.g.
      auction prints, pre-open) or whether the user's chart skips them.
      Decide the canonical brick set and reload.
- [ ] Re-run `scripts/check-row-spacing.ts` and confirm `row N (0-indexed) ==
user's box N+1 (1-indexed)` for at least three days.

**Files / scripts.**

- `scripts/load-hawks-candles.ts` (loader)
- `scripts/check-row-spacing.ts` (probe)
- `data/hawks/candles/5m.csv` (source CSV)
- `price_candles` table

---

### 2. Correctly identify TOPOS e FUNDOS

**Scope.** Verify that the `topos_fundos` JSONB field on each 5m brick
matches the ProfitChart indicator's painted pivots exactly.

**Current state.**

- The 5m CSV has a `TOPOS E FUNDOS` column that the loader writes into
  `indicators.topos_fundos`. We sample-checked: pivot #2 on 13/05 paints at
  09:10 BRT with value 182,380, matching the indicator.
- The user clarified the indicator paints a pivot only after **2 confirming
  bricks** in the new direction. The painted brick is the prior extreme — not
  the brick where the price reversed.

**Acceptance criteria.**

- [ ] For 13/05/2026, dump every brick with a non-null `topos_fundos` value
      and the corresponding price extreme (high for TOPO, low for FUNDO).
      Compare to the indicator markers visible in the user's CSV.
- [ ] Classification logic: confirm that `pivot[N].value > pivot[N-1].value
⇒ TOPO`, else `FUNDO`. The user's CSV column should agree.
- [ ] Document the indicator's 2-brick-confirmation rule in
      [`docs/gotchas.md`](gotchas.md) so future agents don't fight it.

**Files / scripts.**

- `scripts/check-pivots.ts` (existing pivot dump)
- `docs/gotchas.md` (where the confirmation-lag rule should live)

---

### 3. Correlate three chart bricks (5m / 15m / 60m)

**Scope.** For each 5m brick, identify which **15m brick** and which **60m
brick** were the _previously closed_ ones at that moment. The higher-TF gate
depends entirely on this projection being correct.

**Current state.**

- The loader currently does: `targetMs = fiveRow.timestamp.getTime() - 1`
  and finds the floor-index 15m / 60m brick.
- 15m bricks load from `15m.csv` (Renko, not time candles). Same for 60m.
- Coverage achieved: 15m projected onto 4,742 / 4,744 5m rows; 60m onto
  4,737 / 4,744.

**Acceptance criteria.**

- [ ] For 13/05/2026, dump the projected `prev_15m_open` / `prev_15m_close`
      and `prev_60m_open` / `prev_60m_close` for every 5m brick. Compare to
      the user's CSV (which has these same projections in ProfitChart).
- [ ] At brick 16 (09:10 BRT, T1 fire), the projected 15m brick must match
      the user's spreadsheet exactly. Same for 60m.
- [ ] Handle gaps: when no prior 15m brick exists (very first 5m brick of
      the loaded history), the projection should be null and the gate
      should fail-closed.

**Files / scripts.**

- `scripts/load-hawks-candles.ts` (projection logic)
- `scripts/verify-hawks-ingest.ts` (existing verification script)

---

### 4. Plot 5m indicators right

**Scope.** Verify the 5m-level indicators stored on each brick — primarily
the MACD histogram and any MME values that the entry rule references on
the 5m timeframe.

**Current state.**

- The 5m CSV exports include MACD and EMAs. The loader copies them into
  `indicators` JSONB.
- The current entry rule does **not** gate on 5m MACD/EMA directly — those
  are listed as quality multipliers in the user's spec.

**Acceptance criteria.**

- [ ] Spot-check 5 random 5m bricks against the user's CSV. MACD histogram
      and any EMA values must match within rounding tolerance.
- [ ] Document which 5m indicators are gates vs. quality multipliers in
      [`src/lib/backtest/presets/hawks-presets.ts`](../src/lib/backtest/presets/hawks-presets.ts)
      header.

**Files / scripts.**

- `scripts/load-hawks-candles.ts` (column map)
- `scripts/verify-hawks-ingest.ts`

---

### 5. Plot 15m and 60m TOPOS e FUNDOS right

**Scope.** The 15m and 60m charts have their own TOPOS E FUNDOS pivots.
These are NOT projected onto 5m bricks yet. The entry rule currently only
uses the 5m pivots — but the user's manual workflow uses 15m and 60m
pivots as additional structural context (e.g., "is the 15m chart in a
descending-tops pattern too?").

**Current state.**

- 15m and 60m CSVs include the `TOPOS E FUNDOS` column.
- The loader does NOT project the 15m/60m pivot values onto 5m rows. Only
  the prev-brick OHLC is projected.

**Acceptance criteria.**

- [ ] Decide whether 15m/60m pivots are _required_ gates or _quality_
      multipliers. (Likely the latter, but explicit in the preset.)
- [ ] If required: extend the loader to project `prev_15m_pivot` /
      `prev_60m_pivot` (the most-recent indicator-painted TOPO/FUNDO on the
      higher TF) onto each 5m brick. Add to required indicators.
- [ ] Verify projection matches the user's CSV.

**Files / scripts.**

- `scripts/load-hawks-candles.ts`
- `src/types/backtest.ts` (config interface)
- `src/lib/backtest/presets/hawks-presets.ts`

---

### 6. Plot 15m and 60m indicators right

**Scope.** Verify MME27, MME55, MACD, and any other 15m/60m indicators that
the gate depends on. Today the engine uses `mme27_15m`, `mme55_15m`,
`mme27_60m`, `mme55_60m`. These come from the higher-TF CSVs.

**Current state.**

- Loader copies these from the higher-TF CSV into the projected brick's
  associated 5m row.
- The gate at brick 16 (09:10 BRT) passes against these values, matching
  what we'd expect from the user's bearish 15m/60m context that morning.

**Acceptance criteria.**

- [ ] Spot-check 5 5m bricks: the projected `mme27_15m` / `mme55_15m` /
      `mme27_60m` / `mme55_60m` must match the user's CSV values for the
      corresponding higher-TF brick.
- [ ] Decide whether the gate should use a 1-box buffer ("open AND close
      ≥ 1 box below both EMAs") as the user originally described, or strict
      `< both EMAs` (current implementation). Document in the preset header.

**Files / scripts.**

- `scripts/load-hawks-candles.ts`
- `src/lib/backtest/modules/entry/hawks-triple-screen.ts` (`higherTfGateShort`,
  `higherTfGateLong`)

---

### 7. Combine everything and make correct execution

**Scope.** With steps 1–6 verified, lock down the entry state-machine and
re-run against the user's T1–T4 catalog for 13/05/2026 plus at least one
other catalogued day. Iterate the state machine _only_ against verified data.

**Current state (engine v0.5).**

- T1 fires at brick 16 (09:10 BRT) @ 182,100 — matches user's T1 by entry
  price exactly.
- Engine also fires at brick 35 (10:22 BRT) @ 182,000 — this is the
  engine's T2; user's T2 is at @ 181,100 (different brick). Open question
  whether the 10:22 fire is a legit setup the user missed in the catalog or
  a false positive.
- T3 (box 93) and T4 (box 109) not firing — likely because the 15m gate
  flips bullish after ~12:00 BRT and the engine refuses to short. User
  took these trades manually, so either the gate is too strict or the
  prev-15m projection in our data is wrong (step 3/6 will tell us).
- The wave-1 invalidator (no 2 consecutive against-trend bricks) is
  currently DISABLED — it was tripping in the post-fire waiting state.
  Re-introduce a scoped version once the engine is stable.

**Acceptance criteria.**

- [ ] For 13/05/2026, the engine produces exactly T1, T2, T3, T4 matching
      the user's catalog by entry brick and direction. Outcomes (TP/BE/stop)
      should also match within slippage tolerance.
- [ ] For at least one other catalogued day (TBD by Ygor), same agreement.
- [ ] Update [`docs/backlog.md`](backlog.md) with: re-introduce wave-1
      invalidator (scoped); add quality multipliers (MACD / EMA stack
      ordering / VWAP / AJUSTE); decide one-trade-per-day vs. multi-fire.

**Files / scripts.**

- `src/lib/backtest/modules/entry/hawks-triple-screen.ts`
- `src/lib/backtest/engine.ts` (state persistence across days)
- `src/lib/backtest/presets/hawks-presets.ts`
- `src/__tests__/lib/backtest/hawks-engine.test.ts` (currently `.skip`'d —
  unskip once the engine is stable)

---

## Status table

| Step | Topic                            | Status           | Blocker                              |
| ---- | -------------------------------- | ---------------- | ------------------------------------ |
| 1    | 5m bricks faithful               | partial          | 9-brick drift on T2 box              |
| 2    | TOPOS e FUNDOS classification    | passes for 13/05 | confirmation-lag rule not documented |
| 3    | 5m / 15m / 60m brick correlation | partial          | not diffed against user's CSV        |
| 4    | 5m indicators                    | unverified       | no diff yet                          |
| 5    | 15m / 60m pivots                 | not started      | depends on step 1/2                  |
| 6    | 15m / 60m indicators             | partial          | strict-vs-1-box-buffer undecided     |
| 7    | Engine execution                 | T1 matches       | T2/T3/T4 missing; depends on 1–6     |

---

## Working principles

1. **One step at a time.** Don't touch the next layer until the current one
   produces a diff-clean artifact against the user's CSV/chart.
2. **Verification is a script.** Every step has a reproducible probe (a
   `scripts/check-*.ts` file or a test fixture). The probe's output goes
   in the PR.
3. **The user's CSV is the oracle.** If our DB disagrees with the user's
   exported CSV, the DB is wrong. Don't paper over with engine logic.
4. **Engine changes only after data is verified.** Once steps 1–6 produce a
   clean data layer, step 7 is the last place to iterate.
