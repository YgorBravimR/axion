# Fix: Hawks v0.7 — Replace Indicator-Painted Pivots with Structural Detection

**Date:** 2026-06-08
**Severity:** Critical
**Affected Area:** Hawks triple-screen entry module (`src/lib/backtest/modules/entry/hawks-triple-screen.ts`), v0 preset configuration, v0 validation schema

## Cause

Hawks v0 (engine v0.6) read pivot anchors (TOPO MAIOR, FUNDO) from a CSV-sourced `topos_fundos` indicator column. The Phase-5 data migration (completed 2026-06-05) stopped writing this column post-migration; only per-brick-size raw Parquet files (`R15.csv`, `R17.csv`, etc.) are loaded, and the `topos_fundos` column is absent.

As a result, the column read at line 201 of `hawks-triple-screen.ts` always returned `null`:

```ts
const pivotRaw = ind[config.topos_fundos_key]
const pivot = typeof pivotRaw === "number" ? pivotRaw : null
```

The entire pivot-processing block (lines 409–450) only executed `if (pivot !== null)`, which never happened. Engine state remained stuck in `WAITING_TOPO_MAIOR` forever — `topoMaiorPrice` and `fundoPrice` anchors were never set — and all fire conditions failed silently (gate checks require both anchors non-null at lines 235–237 for SHORT).

Result: **every backtest on current data produced zero trades**.

## Effect

- Live backtest on `hawk_5m_win` Parquet (17,517 bricks, 2026-01-02 to 2026-06-05) produced 0 trades.
- Optimize sweeps over the same data produced 0 trades.
- No error message or warning — the engine failed silently.

## Solution

Replaced indicator-painted pivot detection with **structural pivot detection** based on brick direction sequences (the canonical rule documented in `docs/gotchas.md` entry "Hawks: TOPOS E FUNDOS indicator confirmation lag (5m vs. higher-TF differ)").

### Algorithm

**2-brick confirmation on 5m:**

- Track the last brick's direction (`isBullish` vs `isBearish`) and its extreme price (`high` for bullish, `low` for bearish).
- A **TOPO** is confirmed when 2 consecutive bearish bricks close after a bullish sequence. The TOPO's value is the `high` of the **last bullish brick** (stored in `priorExtremePrice` before transition).
- A **FUNDO** is confirmed when 2 consecutive bullish bricks close after a bearish sequence. The FUNDO's value is the `low` of the **last bearish brick**.
- Classification of consecutive pivots: `pivot[N] > pivot[N-1]` ⇒ TOPO, else FUNDO (the existing rule downstream unchanged).

### Files Changed

1. **`src/types/backtest.ts`** — Removed `topos_fundos_key: string` field from `HawksTripleScreenConfig` interface.

2. **`src/lib/validations/backtest.ts`** — Removed `topos_fundos_key` validation from `hawksTripleScreenConfigSchema`.

3. **`src/lib/backtest/presets/hawks-presets.ts`** — Removed `topos_fundos_key: "topos_fundos"` from `hawksV0` config and removed `"topos_fundos"` from `requiredIndicators` array.

4. **`src/lib/backtest/modules/entry/hawks-triple-screen.ts`** (major refactor):
   - Added `lastBrickWasBullish: boolean | null` and `priorExtremePrice: number | null` to `HawksState` interface to track structural detection state across bricks.
   - Removed indicator read: `const pivotRaw = ind[config.topos_fundos_key]` and related read.
   - Replaced entire pivot-processing block (old lines 409–450) with structural detection logic:
     - On each brick, detect direction transition and accumulate 2-brick confirmation.
     - When 2 consecutive bricks of opposite direction confirm, emit a structural pivot.
     - Classification via comparison to `lastPivotPrice` (same downstream rule as before).
   - Updated comment blocks to reflect v0.7 and structural detection.
   - Bumped engine version constant in `src/lib/backtest/engine.ts` from `hawks-v0.6` to `hawks-v0.7`.

5. **`src/__tests__/lib/backtest/hawks-engine.test.ts`** — Replaced old indicator-based test fixtures with minimal structural detection tests:
   - Test 1: Confirms TOPO detected after 2 consecutive bearish bricks from bullish setup.
   - Test 2: Confirms FUNDO detected after 2 consecutive bullish bricks from bearish setup.
   - Test 3: Confirms first pivot has no direction classification (can't compare to null prior pivot).

6. **Test files fixed** — Removed `topos_fundos_key` from test config objects in `hawks-quality-rules.test.ts` and `storage-migration.test.ts`.

## Verification

**Unit tests**: 84 tests pass (3 new structural tests + 81 hawks-quality-rules existing tests).

**Type checking**: `pnpm exec tsc --noEmit` — 0 errors.

**Linting**: `pnpm lint` — 0 errors in affected files.

**Live backtest smoke test** (manual follow-up required):

- Engine version stamp: `hawks-v0.7` visible in backtest results.
- Trade count on `hawk_5m_win` (2026-01-02 to 2026-06-05): Expected **>0 trades** (was 0 before).
- Cross-TF join (`prev_15m_open`, `prev_60m_open`, etc.) and HTF gate still functional.

## Prevention

1. **Data pipeline contract**: Whenever a CSV-sourced indicator column is added/removed, update `requiredIndicators` in the preset AND `hawksTripleScreenConfigSchema` in validations. Remove the key read from engine config.

2. **Structural detection is now the source of truth** for TOPOS and FUNDOS. Any future migration of candle data should preserve the algorithm's contract: each brick has `open`, `high`, `low`, `close` — everything else is derived.

3. **Silent-failure risk mitigation**: The old engine design (pivot read → null → no fire) masked the data pipeline failure. Future strategies should assert preconditions: if an anchor is required but null after N bricks, log a warning. The Hawks case was invisible because the state machine just silently stayed in `WAITING_TOPO_MAIOR`.

## Related Files

- `/Users/ygorbravim/personal/projects/bravo/axion/docs/gotchas.md` — Canonical TOPOS E FUNDOS algorithm (2-brick confirmation rule).
- `/Users/ygorbravim/personal/projects/bravo/axion/docs/backlog.md` — Tasks #154 ("Drop topos_fundos from preset, types, validations") and #155 ("Remove topos_fundos pivot logic from engine") — both completed in this fix.

## Commit Message

```
fix(hawks): replace indicator-painted pivots with structural detection (v0.7)

The Phase-5 data migration (2026-06-05) stopped writing the topos_fundos
CSV column. Hawks v0 relied on this column to paint TOPO MAIOR and FUNDO
anchors. Without the column, pivot detection returned null forever, and
the engine never fired (silently producing zero trades).

Replaced indicator-painted pivot detection with structural 2-brick
confirmation on 5m: TOPO confirmed after 2 consecutive bearish bricks
(value = high of last bullish brick); FUNDO confirmed after 2 consecutive
bullish bricks (value = low of last bearish brick). The rule is the
canonical algorithm documented in gotchas.md.

- Remove topos_fundos_key from HawksTripleScreenConfig type and validation
- Remove topos_fundos from hawksV0 preset requiredIndicators
- Refactor pivot detection: structural (2-brick confirmation) replaces indicator read
- Add lastBrickWasBullish and priorExtremePrice to HawksState for stateful detection
- Bump engine version: hawks-v0.6 → hawks-v0.7
- Update unit tests: replace indicator-based fixtures with structural detection tests

Backlog tasks #154 and #155 completed. Live backtest on hawk_5m_win
expected to produce non-zero trade count (was 0 before fix).
```
