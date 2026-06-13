# Indicator-Isolation Audit — Group A: Higher-TF Trend (15m + 60m)

**Status**: DRAFT — awaiting Ygor's right / wrong / partial verdict on each labeled paragraph below.
**Date filed**: 2026-06-13.
**Source code as of**: branch `main` post-rename pass.

---

## What this audit is and is not

This is a **wiring audit**, not a predictivity test. The question is: **does Axion's code read the 15m and 60m higher-timeframe trend the way Hawks methodology defines it?** Not "does the trend signal make money."

Per the indicator-isolation methodology (see `docs/postMorten/2026-06-12-hawks-engine-v0.8-archive.md` → "Next phase"), every indicator goes through 3 steps:

1. **Theory definition** (Ygor's words, locked in writing before any code change).
2. **Wiring audit** (this doc — code-fact paragraph vs methodology-intent paragraph + diff script).
3. **Visual smoke test** (chart with the indicator state colored beneath each brick, scrolled by hand).

Group A is **two independent indicators**: 15m and 60m. Each produces an independent BULL/BEAR signal. They are NOT combined into a single "gate" at the indicator-validation layer. Whether the engine downstream uses them as gates / confluence / multiplier is a separate composition decision after both pass their solo audit.

---

## Paragraph 1 — What Axion's code currently does

### `src/lib/backtest/hawks-indicators.ts:readHtfGate` (the snapshot reader)

Stateless, point-in-time read. For each timeframe (15m and 60m), it pulls four numbers from the brick's indicator map: `prev_<tf>_open`, `prev_<tf>_close`, `mme27_<tf>`, `mme55_<tf>`. If any of the four is missing, it returns `{ state: "unknown", favorable: false }`. Otherwise it returns one of three states:

- `"above_both"` — `open > ema27 AND open > ema55 AND close > ema27 AND close > ema55`
- `"below_both"` — the mirror with `<`
- `"mixed"` — anything else (the "neither strictly on" zone)

`favorable` per direction:

- SHORT favorable iff state === `"below_both"`
- LONG favorable iff state === `"above_both"`

There is **no memory** between bricks. Every brick is graded independently.

### `src/lib/backtest/modules/entry/hawks-triple-screen.ts:higherTfGate` (the engine hard gate)

Stateless boolean. Takes `(candle, config, direction)`, returns `true` ONLY when BOTH the 15m AND the 60m timeframe satisfy the all-4-strict-inequalities-on-the-direction-side condition simultaneously, on this single brick. Mixed-on-one-TF = gate OFF for that direction. If any indicator value is missing → returns `false` (gate OFF).

The engine uses this as a hard pre-check before every fire. If the gate returns `false` at fire time, the fire is suppressed.

### How this differs from methodology (per Ygor's Group A corrections, 2026-06-13)

| Aspect                          | Axion today                         | Methodology                                                        |
| ------------------------------- | ----------------------------------- | ------------------------------------------------------------------ |
| 15m and 60m treated as          | Combined into one gate boolean      | Two independent indicators, each emitting BULL/BEAR                |
| Memory                          | None — stateless point-in-time      | **Sticky**: state carries forward until ALL 4 inequalities reverse |
| Number of states                | 3 (above_both / below_both / mixed) | 2 (BULL / BEAR) — no "mixed", just the prior state persists        |
| Cross-session init              | N/A (stateless)                     | Carries from prior trading day's close state                       |
| When all 4 reverse              | Flips on this brick                 | Flips on this brick (same)                                         |
| When some-but-not-all 4 reverse | Engine sees "mixed", gate OFF       | Methodology stays in current state, indicator still BULL/BEAR      |

**Bottom line**: Axion's current code emits **no signal** on every transition brick (anywhere between fully-aligned states), which under the engine's hard-gate use means **trades are blocked in any zone where the 15m / 60m EMA stack is in transition**. Methodology would keep emitting the _prior_ signal until the new direction fully proves itself — which means trades remain allowed during transition zones as long as the higher TF is still in its previous regime.

---

## Paragraph 2 — What the methodology requires (per Ygor's corrections)

### State machine, per timeframe (15m and 60m, independent)

Each timeframe has a current state `S ∈ {BULL, BEAR}`. Per 5m brick (which has `prev_<tf>_open`, `prev_<tf>_close`, `mme27_<tf>`, `mme55_<tf>` projected onto it):

- Define `flip_to_BULL = (prev_open > mme27 AND prev_open > mme55 AND prev_close > mme27 AND prev_close > mme55)`
- Define `flip_to_BEAR = (prev_open < mme27 AND prev_open < mme55 AND prev_close < mme27 AND prev_close < mme55)`

State update rule:

- If `S = BEAR` and `flip_to_BULL` ⟹ new `S = BULL`. Otherwise stay `S = BEAR`.
- If `S = BULL` and `flip_to_BEAR` ⟹ new `S = BEAR`. Otherwise stay `S = BULL`.

The "mixed" middle zone produces no flip — the prior state persists. There is no third state.

### Initial state seeding

At the very start of the candle history (the first brick we have any data for), the state is **whichever direction first holds all 4 inequalities unambiguously**. The walker emits NO_SIGNAL until that happens (typically resolved within the first 1–3 bricks of any day). Once seeded, the state **carries across session boundaries** — closing day N as BULL means day N+1 opens as BULL (until the 4-inequality flip rule fires).

Per Ygor (2026-06-13): "Carries from prior day, we could do a one time pass marking it's value to database so we always have it. It will not change. Or not, if easy, compute at run time."

**Implementation choice**: compute at run time. Walk the full candle history from the first available brick at engine init. No DB persistence needed. The cost is one O(N) pass per backtest run; cheap compared to the engine itself.

### Stale / missing indicator handling

If any of the 4 source columns is missing/null on a brick → **carry the previous state forward**. Do NOT emit NO_SIGNAL mid-stream (that would mean the prior state was somehow erased, which contradicts "sticky").

If we're still in the pre-seed phase (no signal ever established yet) AND the current brick has missing data → emit NO_SIGNAL.

### Output per indicator

Two indicators (15m and 60m), each emits per brick: `BULL` | `BEAR` | `NO_SIGNAL` (pre-seed only).

---

## What the wiring audit script will check

The script `scripts/indicator-isolation/group-a-htf-gate.ts` will:

1. Load 5m bricks for the full available date range (or a user-specified window via `--from DATE --to DATE`).
2. For each brick, read `prev_15m_open`, `prev_15m_close`, `mme27_15m`, `mme55_15m` (and the 60m equivalents).
3. Run the methodology-correct stateful walker. Output: per brick, the methodology-derived BULL/BEAR state for 15m AND for 60m.
4. Run Axion's current `readHtfGate` on each brick. Output: per brick, the `above_both / below_both / mixed / unknown` state for 15m AND for 60m.
5. Diff per brick. Bin into:
   - `AGREE_BULL` — methodology=BULL AND axion=above_both (axion correctly identified)
   - `AGREE_BEAR` — methodology=BEAR AND axion=below_both
   - `DISAGREE_TRANSITION` — methodology=<prior state>, axion=mixed (the expected disagreement — axion has no memory, methodology does)
   - `DISAGREE_FLIP` — methodology=<state A>, axion=<state B opposite> (unexpected — would indicate a real wiring bug)
   - `AXION_UNKNOWN` — axion returns "unknown" due to missing data (methodology should carry over if pre-seeded)
6. Print a summary table: count per bucket, % of bricks in each, and a sample of timestamps for each DISAGREE class so we can spot-check on chart.

**Pre-registered hypothesis** (so we know what to look for):

- Most `DISAGREE_TRANSITION` bricks should cluster around EMA crossover zones — i.e. periods where price is chopping near the EMA stack and individual inequalities flip in and out without all 4 aligning. Methodology emits the prior steady-state direction; axion emits "mixed". This is the expected delta and confirms the wiring is correct _per Axion's design_ but wrong _per methodology_.
- `DISAGREE_FLIP` should be **rare (ideally zero)**. Any occurrence is either (a) a clean steady-state flip that both detectors caught (in which case it should AGREE on the new state immediately, not DISAGREE), or (b) a real bug.
- `AXION_UNKNOWN` count should match the count of missing-data bricks. Should be small and concentrated in early-day data gaps.

If the hypothesis holds, the audit confirms: **Axion's code wires the EMA inequalities correctly but lacks the stateful walker that methodology requires.** The fix is then to replace `readHtfGate` (or add a sibling stateful function) that does the BULL/BEAR sticky walk, and have the engine's `higherTfGate` consume that stateful output instead of the stateless one.

If `DISAGREE_FLIP` is nonzero — we have a real bug to investigate.

---

## Visual smoke test (Step 3, after script verdict)

I'll emit a single-day HTML page per sample day. The page renders:

- The 5m brick stream (candles).
- A colored ribbon below each brick: green = methodology says BULL, red = BEAR, gray = NO_SIGNAL.
- A second ribbon below that: green = axion above_both, red = below_both, yellow = mixed, gray = unknown.
- Eyeball test: does the methodology ribbon agree with what we visually see the higher-TF doing? Does the axion ribbon flicker through "mixed" zones the methodology ribbon walks through cleanly?

Sample days: pick 2 trending days + 2 chop days from the catalog to cover both regimes.

---

## After Group A is verified

1. Apply the fix (stateful walker replacing `readHtfGate`'s stateless read, or adding a stateful sibling).
2. Re-run all snapshot + engine tests.
3. Re-run the 20-day reproduction audit — note: this may shift reproduction because the engine's hard gate will now allow trades in transition zones that previously were blocked.
4. Move to Group B.1 (MACD sign — sticky, with similar shape).

---

## Open questions (parking lot, decide before coding the walker)

1. **Empty-data days**: if a whole day's `prev_15m_*` columns are missing (data gap), should the state carry across the gap, or re-seed on the first day with data? **Recommendation**: carry across the gap. The methodology says "carries from prior day" — it doesn't say "resets when data is missing." Resetting would create a spurious flip at the data-gap boundary.

2. **Engine integration**: when we replace the stateless gate with the stateful walker, do we want a single `higherTfGate(candle, state)` that takes the running state and returns `boolean + nextState`, or a precomputed `Map<timestamp, { gate15m: state, gate60m: state }>` populated once at engine init? **Recommendation**: precomputed map. The engine already runs O(N) over bricks; one extra O(N) walk at init is invisible. Avoids threading state through every engine call.

3. **Snapshot reader fate**: `readHtfGate` is also used by the journaling enrichment plan. If we make it stateful, the enrichment caller must also pass state. **Recommendation**: keep `readHtfGate` as the stateless point-in-time read (still useful for "what was the indicator value at this exact brick" analytics), and ADD a new `walkHtfGate(candles): HtfGateState[]` that produces the methodology-correct sticky series. Enrichment uses `walkHtfGate` indexed by timestamp.

These are pre-coding decisions, not audit-blocking. Confirm before we write the walker.
