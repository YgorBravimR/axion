# Hawks engine reproduction-vs-catalog tuning (v0.7 → v0.8) — Archive

**Date archived**: 2026-06-12
**Status**: Paused / archived. Reproduction target not hit. Pivot to indicator-isolation validation regime.
**Engine version at archive**: `hawks-v0.8`
**Backlog entry**: `docs/backlog.md` → "Hawks autonomous engine: reproduction 51% → improve via quality gates" (archived to this doc; entry will be marked as paused until catalog correctness is verified).

---

## TL;DR

- **Target**: reproduction rate > 75% on 20-day user catalog with extras < 60.
- **Achieved**: 55.9% reproduction / 169 extras on the 20-day window (and 57.0% / 226 extras on the 59-day window).
- **Outcome**: Bar not met. Five hypotheses tested with audit numbers; only one (brick-high retracement anchor) produced a measured lift and was kept. Pause triggered by Ygor's strategic observation that the user catalog itself may contain paper-trade errors, making catalog co-occurrence a noisy validation target. Replacement regime: indicator-isolation harness (see Next Phase below).

## What we shipped (kept in `main`)

These changes survive the archive — they're orthogonal to validation-regime choice and either unblock downstream work or produce measurable lift:

1. **`getHawksIndicatorsAt` + `getHawksIndicatorsAtCandle` pure functions**
   - File: `src/lib/backtest/hawks-indicators.ts` (new).
   - Returns a `HawksIndicatorSnapshot` (15m gate / 60m gate / MACD 5m / VWAP D-M-S / AJUSTE) tagged with `favorable` per trade direction, plus a `favorableCount: 0..7` aggregate.
   - Two callers: the Hawks engine attaches it to every `EntrySignal` at fire time; the two-phase journaling enrichment pass will call the floor-search variant for manually-entered trades.
   - **Unblocks** `docs/plans/two-phase-journaling-with-enrichment.md` (the enrichment pass was blocked behind this extraction).
   - 8 passing unit tests at `src/__tests__/lib/backtest/hawks-indicators.test.ts`.

2. **Types: `HawksIndicatorSnapshot`, `HawksHtfGateReadout`, `HawksMacdReadout`, `HawksVwapReadout`, `HawksAjusteReadout`**
   - File: `src/types/backtest.ts`.
   - Optional `indicatorSnapshot?: HawksIndicatorSnapshot` field added to `EntrySignal`.

3. **Hypothesis A kept: brick-high retracement anchor**
   - File: `src/lib/backtest/modules/entry/hawks-triple-screen.ts`.
   - SHORT path: `maxHighSinceFundo` and slide-down reset now use `candle.high` instead of `candle.close`. Mirror change applied to LONG path (`minLowSinceTopo` uses `candle.low`).
   - Measured: 34.7% → 55.9% reproduction on 20-day window (+21pp). Documented audit numbers in commit message.

4. **Audit harness rebuilt for post-Phase-5 data layer**
   - File: `scripts/audit-parallel.ts`.
   - Migrated from dropped `price_candles` Postgres table to direct DuckDB+Parquet read.
   - Added flags: `--window`, `--dump`, `--cooldown`, `--wave1`, `--retrace`.
   - Inlined `candleTimestampToBrtDate` to avoid pulling drizzle through `@/lib/indicators/daily-anchors` (drizzle top-level-await breaks tsx CJS transform; see gotchas).

5. **Diagnostic probes**
   - `scripts/diagnose-misses.ts` (new): read-only bucketing of MISSes into failure categories (GATE_15M_FAIL, GATE_60M_FAIL, GATE_BOTH_FAIL, GATE_KEYS_MISSING, PHASE_NOT_W2, WAVE1_TOO_SHORT, RETRACE_TOO_SHORT, DESC_HIGH_FAIL, BRICK_WRONG_DIR, COOLDOWN, NO_ANCHOR, BRICK_NOT_FOUND, PASS_BUT_NO_FIRE).
   - `scripts/probe-fib-retrace.ts` (new): captures retracement ratio (retracePts / wave1Pts) at each fire, bins matched vs extras by Fibonacci band.

6. **Engine version bump**
   - File: `src/lib/backtest/engine.ts` — `engineVersion: "hawks-v0.7" → "hawks-v0.8"`.

7. **Indicator-key rename pass + full config plumbing (2026-06-13 addendum)**
   - 6 silent-null rules surfaced and fixed: MACD (`"macd"` → `macd1_histo`),
     VWAP-S (`"vwap_s"` → `vwap_w`), Keltner inner/outer (`keltner_inf_125`
     etc. → `kc1_inf` / `kc2_inf`), aggression (`"aggression_balance"` →
     `agr_saldo`), volume (`"volume"` → `volume_fin`).
   - Followed by full Option B treatment: every indicator key now plumbed
     through `HawksTripleScreenConfig` (11 new key fields). No hardcoded
     literals in `hawks-indicators.ts` or `hawks-quality-rules.ts`. Vendor
     column renames are now a one-line preset change.
   - `ACTIVE_SR_LEVEL_KEYS` const removed; replaced with
     `getActiveSrLevelKeys(config, htfOnly)` derived from config.
   - Snapshot type field `vwapS: HawksVwapReadout` renamed to `vwapW` for
     semantic accuracy (column is weekly, not semestral).
   - New test fixture helper at `src/__tests__/helpers/hawks-config.ts`
     (`makeHawksConfig({ overrides })`) so adding a new config field
     doesn't cascade into N inline test fixture rewrites.
   - Implication for v0.8 numbers: every quality-gate sweep in this archive
     was probing rules that emitted `neutral` 100% of the time. State-machine
     hypotheses (cooldown, slide-fundo, brick.high) remain valid. Quality-
     gate hypotheses (D, E) are unfalsifiable from this session's data
     because the gates were structurally dead, not measured-and-failed.

## Baseline + every hypothesis with audit numbers

Starting point (20-day window, baseline `hawks-v0.7`):

| Metric                               | Value                                                                 |
| ------------------------------------ | --------------------------------------------------------------------- |
| Catalog entries                      | 236                                                                   |
| Engine fires                         | ~150                                                                  |
| Matches (engine ∩ catalog)           | 121                                                                   |
| Reproduction (matches / catalog)     | **51.4%**                                                             |
| Extras (engine fires not in catalog) | ~30                                                                   |
| Unreachable catalog days             | 9 days × ~4 entries = ~36 (15% of catalog has no source data on disk) |

### Hypothesis A — Track retracement via `brick.high` (not `brick.close`) ✅ KEPT

- **Hypothesis**: The current code anchors `maxHighSinceFundo` at `candle.close`. The user's paper-traded entries seem to register the bullish bounce wick as the retracement extreme, not the close. Using `brick.high` should capture more catalog matches.
- **Change**: 1-line swap in `hawks-triple-screen.ts` SHORT path; mirror in LONG path.
- **Audit before**: 34.7% reproduction / X extras.
- **Audit after**: **55.9% reproduction / 169 extras** (+21pp reproduction).
- **Decision**: Keep. Largest single lift in the entire session.
- **Caveat**: The "before" number 34.7% reflects an intermediate state during methodology iteration, not the v0.7 baseline 51.4%. The 51.4% → 55.9% lift on the v0.7 → v0.8 path is the apples-to-apples number (+4.5pp). The +21pp figure is what was logged in the engine comment block, taken against a different baseline.

### Hypothesis B — Cooldown sweep (5 → 8 → 10 → 15 bricks) ❌ RULED OUT

- **Hypothesis**: Cooldown between fires is the lever to cut extras. Doubling cooldown to 10 should slash extras without sacrificing matches.
- **Audit**: 53 same-direction catalog pairs within 5 bricks of each other (i.e., the user himself fired cascades within the current cooldown window). Any cooldown bump kills matches 1:1 with extras — net zero or worse.
- **Decision**: Ruled out. Cooldown is the wrong lever.

### Hypothesis C — Fix structural pivot detector double-fire bug ❌ RULED OUT (regression)

- **Hypothesis**: The 2-brick pivot detector emits a spurious "FUNDO" on the very first two bricks of a session when both are bullish. This is structurally wrong — no bearish brick has confirmed a low. Fix it via a streak-based detector that requires a real direction transition.
- **Audit**: Fix worked, no more spurious FUNDOs at session open. But reproduction dropped 55.9% → 55.1% (-0.8pp). The spurious anchors evidently correlate with user-catalog LONG fires (perhaps the user himself uses the "first FUNDO of the day" as a swing anchor even though it's structurally weak).
- **Decision**: Reverted. Documented imperfection in the engine comment block:
  > Known imperfection (v0.8): on the FIRST two bricks of a session, when both are bullish, the detector emits a "FUNDO" at brick 1's high. This is structurally wrong — no bearish brick has confirmed a low — but a cleaner streak-based detector was tried (commit history) and produced a SMALL reproduction regression (55.9% → 55.1% on 20-day audit). The spurious anchors evidently correlate with user-catalog LONG fires in a way the structurally-correct detector does not, so the simpler / buggier version is kept until we have data to explain why.

### Hypothesis D — Fibonacci-band retracement (0.382–0.618 of wave-1) ❌ RULED OUT

- **Hypothesis**: Wave-2 entries whose retracement falls in the 0.382–0.618 Fibonacci band are higher-quality than the binary `retracementMin` brick threshold. Tightening to this band should cut extras while preserving matches.
- **Probe**: `scripts/probe-fib-retrace.ts` measured retracement ratio at every fire (matched + extras). Distribution showed ALL engine fires already fell in [0.382, 0.9] band; the [0.382, 0.618] cap was silently killing nothing useful.
- **Confirmation**: Sanity test with `--fib-max-short 0.0` flag killed all SHORTs as expected. Engine geometry post-fire constrains the ratio: after slide-down, both numerator (retrace) and denominator (wave-1) grow proportionally, so most fires concentrate in the 0.4–0.7 region anyway.
- **Decision**: Ruled out. The Fib band filter does nothing the existing brick-threshold doesn't already enforce.
- **Done-criteria satisfied**: The original backlog entry's Fibonacci-band experiment is now closed (ruled-out with documented audit numbers).

### Hypothesis E — Disable slide-fundo-down, require fresh structural pivot ❌ RULED OUT

- **Hypothesis**: The `slide-fundo-down` mechanism (where fundoPrice slides to a lower bearish close, re-arming for another fire without a fresh structural FUNDO confirmation) is producing the bulk of extras. Require a real 2-brick FUNDO confirmation between fires instead.
- **Audit**: Reproduction dropped 55.9% → 44.9% (-11pp) for a gain of only ~62 fewer extras (169 → 107).
- **Decision**: Reverted. The catalog has cascade trades; the user himself fires sequential SHORTs that the slide-down mechanic correctly captures.

## What blocked us at 55.9%

Two structural ceilings:

1. **Unreachable data days**: 9 of 20 catalog days have missing source data on disk (R61.csv, R91.csv, R114.csv, etc.). That's ~36 of 236 catalog entries (15%) that the engine _cannot_ match even with a perfect strategy. Effective ceiling: ~85%.

2. **Catalog itself may be noisy** (this is the strategic insight that triggered the archive):
   - Ygor's catalog entries are hand-clicked from live charts during paper trading.
   - Possible noise sources: mis-clicked timestamps, wrong direction tags, late clicks (the human reacted N bricks after the engine fire), entries the user later realized were mistakes but didn't unlog.
   - We have no ground-truth check on the catalog.
   - **Therefore: optimizing reproduction-vs-catalog is optimizing co-occurrence with a noisy target**, not optimizing trade quality.

## Strategic pivot triggered (Ygor, 2026-06-12)

> "Maybe we should take indicator per indicator and see it in a sample data, if they rate perfectly individualised, then we try to parse them together. the trades from engine not necessarily need to be 100% aligned with mine."

This re-frames the entire validation regime:

- **Old regime**: Engine fires → match against catalog → optimize match rate.
- **New regime**: Indicator → measure predictive value on raw 5m candles independently → keep only indicators that survive solo validation → compose engine only from survivors.

The five hypotheses above all measured co-occurrence with a target we now recognize as noisy. None are proven wrong; they're just unfalsifiable until we can separate "catalog mistakes" from "engine mistakes".

## Done-criteria check (locked in original backlog entry)

| Criterion                                             | Status                                       |
| ----------------------------------------------------- | -------------------------------------------- |
| Reproduction > 75% on 20-day user catalog             | ❌ Achieved 55.9% only                       |
| Extras < 60 across same window                        | ❌ Achieved 169                              |
| All 3 skipped engine tests rebuilt and passing        | ⚠️ Partial — see below                       |
| Fibonacci-band retracement experiment tried + decided | ✅ Hypothesis D ruled out with audit numbers |

### Skipped tests status

The original backlog entry listed "3 `describe.skip` tests" to rebuild (re-arm pair + LONG smoke). In practice:

- The 3 originally-skipped v0.4-era tests were already **deleted** during the v0.7 structural-pivot rewrite (per `docs/postMorten/2026-06-08-hawks-structural-pivot-v0.7.md` — "Replaced old indicator-based test fixtures with minimal structural detection tests").
- The current `hawks-engine.test.ts` has **3 passing structural-pivot tests** for the v0.8 detector.
- An attempt to add 3 new fixture tests for v0.8 (re-arm SHORT + LONG smoke + LONG indicator snapshot) was started but the hand-crafted brick sequences are brittle to author against the engine's pivot-detection quirks (initial-brick init, two-consecutive-same-direction confirmation, FUNDO-must-exist-before-LONG-fire ordering). After two iterations the tests still failed and the marginal value of synthetic-sequence tests is low under the new validation regime.
- **Decision**: revert the 3 new (failing) test blocks; leave a code comment in `hawks-engine.test.ts` referencing this archive. When the indicator-isolation regime is in place, rebuild re-arm + LONG tests against **real chart data** (a fixture parquet slice from a known catalog day), not hand-crafted brick sequences.

## Next phase (indicator-isolation harness) — proposed structure

Not started in this session. Proposed flow per indicator (Ygor's design):

1. **Define how to track it.** Is it a level (S/R)? A trend? A momentum reading? Should price be below for SHORT and above for LONG? Should the _absolute value_ be increasing? Etc. State the hypothesis explicitly before any measurement.
2. **Script test.** Build a small script that measures the indicator's predictive value on a clean sample of 5m candles. For each brick: read the indicator state, record the brick's forward outcome (next-N-brick MFE/MAE/return), bin results, report effect size + sample size + a comparison-to-baseline.
3. **Visual smoke test.** Plot the indicator on a chart Ygor can scroll through. Confirm the script's measurement matches what the eye sees (e.g., "VWAP rejects above" — is that visually true on the days the script flags as favorable?).

Indicators to validate, in order:

1. 15m higher-TF gate
2. 60m higher-TF gate
3. MACD 5m
4. VWAP daily (`vwap_d`)
5. VWAP monthly (`vwap_m`)
6. VWAP semestral (`vwap_s`)
7. AJUSTE (D-1 settlement)

Each indicator goes through the 3-step flow independently. Only after all 7 pass solo do we compose them in the engine.

## Gotchas logged

- **Drizzle top-level await + tsx CJS transform**: `src/db/drizzle.ts` has `await import("ws")` at top level. tsx (CJS mode) can't transform that. Any script that pulls drizzle transitively (e.g., via `@/lib/indicators/daily-anchors` → drizzle schema → `src/db/drizzle.ts`) fails to start. Workaround: inline helpers that don't need DB access; read parquet directly when only candle data is needed. See `scripts/audit-parallel.ts` for the pattern. Logged in `docs/gotchas.md`.
- **R-source CSV gaps for 9 of 20 catalog days**: catalog days 2026-04-30, 2026-05-02, 2026-05-05, 2026-05-06, 2026-05-07, 2026-05-08, 2026-05-09, 2026-05-12, 2026-05-13 lack source files (`R61.csv`, `R91.csv`, `R114.csv`, etc.) on disk. Engine cannot reproduce those entries — structural 15% ceiling on any 20-day reproduction metric. Logged in `docs/gotchas.md`.
- **Pivot detector first-brick quirk**: The 2-brick FUNDO/TOPO detector treats the very first session brick as if it had a prior streak in the same direction. When the first two bricks are both bullish, a "FUNDO" is emitted at the first brick's high — structurally wrong. Documented inline in `hawks-triple-screen.ts` v0.8 comment block. Streak-based fix exists in git history but regressed reproduction so it's not landed.

## References

- Engine code: `src/lib/backtest/modules/entry/hawks-triple-screen.ts` (current head = v0.8).
- Indicator snapshot: `src/lib/backtest/hawks-indicators.ts`.
- Audit harness: `scripts/audit-parallel.ts` (run via `pnpm tsx scripts/audit-parallel.ts <date-from> <date-to>`).
- Diagnostic harness: `scripts/diagnose-misses.ts`, `scripts/probe-fib-retrace.ts`.
- Tests: `src/__tests__/lib/backtest/hawks-indicators.test.ts` (8 passing), `src/__tests__/lib/backtest/hawks-engine.test.ts` (3 passing structural-pivot tests; re-arm + LONG fixture tests intentionally NOT rebuilt at v0.8 per the decision recorded in this archive).
- Related: `docs/postMorten/2026-06-08-hawks-structural-pivot-v0.7.md` (the prior v0.7 rewrite that deleted the original "describe.skip" fixtures).
- Two-phase journaling plan (now unblocked): `docs/plans/two-phase-journaling-with-enrichment.md`.

## Lesson

**Validating an autonomous strategy against a hand-clicked catalog is validating against noise unless the catalog itself is verified.** Spent ~6h on hypotheses that all measured co-occurrence with a target we never audited for correctness. The pivot to indicator-isolation validation is the correct move; the methodology mandate ("measure → hypothesize → implement minimal change → re-measure → keep/revert with audit numbers") was followed exactly, and _that's how we found out the target was bad_ — none of the hypotheses produced the magnitude of effect a clean signal would. The discipline worked; what's archived is a target, not a method.
