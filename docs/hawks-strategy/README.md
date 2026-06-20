# Hawks strategy — Renko & Breakeven mechanics

Source of truth for how the Hawks user-catalog backtest engine interprets
Renko bricks, stop-loss placement, and the breakeven (BE) exit. Derived from
the user's explanation and the reference image
[`renko-and-be-explanation-1.png`](./renko-and-be-explanation-1.png).

## Other docs in this folder

- [`engine-v0.9-playbook-spec.md`](./engine-v0.9-playbook-spec.md) — **current** engine spec (playbook architecture, 60m-only gate, 3 initial playbooks)
- [`engine-and-quality.md`](./engine-and-quality.md) — v0.6 engine (legacy, superseded by v0.9 spec above)
- [`indicator-inventory.md`](./indicator-inventory.md) — `price_candles.indicators` JSONB keys, what each means
- [`improvement-plan.md`](./improvement-plan.md) — 8-step roadmap to engine v1
- [`zero-to-hero-seed.md`](./zero-to-hero-seed.md) — manual seed (tags/conditions/playbooks) for a Hawks user
- [`chart-palette.md`](./chart-palette.md) — chart colour decisions for Renko panes
- [`indicator-isolation/`](./indicator-isolation/) — per-group probe write-ups (Groups A, B, …)

---

## Renko brick rules (ProfitChart "21 Renko" convention)

| Rule                                                | Detail                                                                                                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brick size                                          | Fixed in points per week (e.g., 100 pts in the reference image, 155 pts during 2026-03-23 week). 1 tick = 5 pts on WINFUT.                                                       |
| **Direction**                                       | A brick is **BULL** if `close > open`, **BEAR** if `close < open`. **Wicks (high/low) do NOT determine brick direction or trigger any rule** — only the open/close pair matters. |
| **Continuation** (same direction as previous brick) | Price must move **1× brickSize** in the trend direction to close the next brick.                                                                                                 |
| **Reversal** (opposite direction)                   | Price must move **2× brickSize** against the previous brick to close 1 reversal brick. So a reversal brick's close is 2 brick-sizes away from the previous brick's close.        |

Implication: the "first against-brick close" after a trade is always exactly
**2× brickSize** from the entry brick's close — because the first against-brick
is a reversal that requires 2× to close.

---

## Hawks position lifecycle

Reference image example (SHORT on WINFUT, brickSize = 100 pts):

```
            BOX        DIRECTION    CLOSE     EVENT
            10  (entry) BEAR         185200    Position opens SHORT at 185200
            11         BEAR         185100    +1 brick in favor
            12         BEAR         185000    +2 bricks in favor → BE ACTIVATES
                                              SL moves from 185400 down to 185200 (entry)
            13         BEAR         184900    Still in trade (favorable continuation)
            14         BULL         185000    Against, but close < entry → still in trade
            15         BULL         185200    Against, close = entry → BE EXIT at 185200
```

### Entry

- **Entry fill = exact close of the entry brick** (no tick offset in the backtest).
- Live trading may have a ±1 tick slippage; that's deferred for now.

### Initial stop-loss

- **SL = entry ± 2× brickSize** uniformly (no trend/counter asymmetry).
  - SHORT: SL = `entry_brick.close + 2×brickSize`
  - LONG: SL = `entry_brick.close − 2×brickSize`
- This equals the close of the first against-direction reversal brick.
- The SL is triggered only when an against-brick **CLOSES** at or beyond the SL
  level — wicks alone do **not** trigger the stop.

### Breakeven (BE) activation

- BE activates when **2 bricks close in favor** of the trade.
- Trigger price (absolute):
  - SHORT: `entry − 2×brickSize`
  - LONG: `entry + 2×brickSize`
- Triggered only on a **favorable brick close** (BEAR close for SHORT, BULL
  close for LONG) — not on wicks.
- When BE activates, SL moves from the initial level to the entry price.

### BE exit

- After BE activates, the trade exits when the **first against-brick CLOSES
  at or past entry**.
  - SHORT: first BULL brick that closes at or above entry → exit.
  - LONG: first BEAR brick that closes at or below entry → exit.
- **Exit fill = entry price** (the BE-stop level). Renko bricks are uniform in
  size per week, so the against-brick's close lands exactly at the BE level;
  the fill is therefore at entry exactly.

### Post-BE behavior

- SL stays at entry forever — there is **no trailing**.
- A 3R target (`entry ± 6×brickSize`) still exists and can fire if a favorable
  brick closes at/past that level.

---

## Other indicator semantics (from Nelogica source)

### `topos_fundos` (Topos e Fundos — tops/bottoms)

Source: `examples/indicators/ScApp_TopoFundoLinha.src`:

```nelogica
Parametro Periodo(5);            // default in the source; user overrides per chart
var tf, v: Real;
Inicio
  tf := TopBottomDetector(Periodo);
  Se (tf <> 0) entao v := tf
  Senao v := v[1];
  Plot(v);
Fim;
```

- `TopBottomDetector(Periodo)` confirms a pivot after **`Periodo`
  against-direction brick closes**, then back-paints the pivot price onto the
  brick where the extreme actually occurred. The `Periodo` parameter is per
  chart instance, **not the literal `5` in the source default**.
- Hawks chart conventions (2026-05-28 CSV exports):
  - **5m Renko**: `TOPOS E FUNDOS [2]` — 2-brick confirmation.
  - **15m / 60m Renko**: both `[1]` (1-brick confirmation, more sensitive) and
    `[2]` are tracked.
- When the detector finds a pivot, `v` = the pivot's price level. Otherwise
  `v` carries the previous value forward (step-function).
- The plotted line is therefore the **most-recent pivot price**, held as a
  horizontal line until the next pivot is detected.

### Other indicators in the 2026-05-28 exports

- **MME 27 / MME 55** — Exponential moving averages over the timeframe's own
  Renko bricks. On the 5m file, two pairs are projected from higher TFs
  (`MME27 15m`, `MME55 15m`, `MME27 60m`, `MME55 60m`).
- **VWAP D / S / M** — Daily / Weekly (Semanal) / Monthly (Mensal) VWAP.
  Only present on the 5m file.
- **AJUSTE** — Previous-day settlement price (sparse — typically constant
  through the day). 5m only.
- **KELTNER SUPERIOR / INFERIOR [12.50] / [16.50]** — Keltner channel
  upper/lower bands at multipliers 12.50 and 16.50.
- **MACD** — MACD line value.
- **VOLUME** — Per-brick total volume (5m only).
- **Agressão saldo** — Per-brick aggression delta (aggressive buys − sells).
  5m only.
- **INDEX DO CANDLE** — Per-day brick counter, used as `candle_index` in the DB.

### Renko projection lines

Source: `examples/indicators/ScApp_ProjecaoRenko.src`:

```nelogica
amp := Round(Abs(Abertura[1] - Fechamento[1]))   // brickSize from previous brick
Se Abertura[1] > Fechamento[1] entao        // previous = BEAR
  inicio
    t := Abertura[1] + amp                  // next BULL close (reversal, 2× from BEAR)
    f := Fechamento[1] - amp                // next BEAR close (continuation, 1×)
  fim
Senao                                       // previous = BULL
  inicio
    f := Abertura[1] - amp                  // next BEAR close (reversal, 2× from BULL)
    t := Fechamento[1] + amp                // next BULL close (continuation, 1×)
  fim
```

- `t` (green) = where the next BULL brick would close
- `f` (red) = where the next BEAR brick would close
- Used as a visualization aid, not directly as the SL formula (per the user's
  uniform "entry ± 2× brickSize" rule).

---

## Engine implementation map

| Concept                | File                                             | Mechanism                                                                                                                                                          |
| ---------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Brick-close trigger    | `src/lib/backtest/modules/stop/stop-manager.ts`  | `config.triggerMode === "brick_close"` enables close-based checks. SL fires only when `close < open` (for LONG) and `close ≤ stop`.                                |
| Brick-close BE         | `src/lib/backtest/modules/stop/breakeven.ts`     | Same mode — BE activates only on a favorable close ≥ `breakevenReference`.                                                                                         |
| Entry / SL / BE levels | `src/lib/backtest/modules/entry/user-catalog.ts` | `entry = candle.close`; `stopReference = close ± 2×brickSize`; `breakevenReference = close ∓ 2×brickSize` (favorable side).                                        |
| Preset wiring          | `src/lib/backtest/presets/hawks-presets.ts`      | `hawksUserCatalog` sets `stop.triggerMode = "brick_close"` and `stop.initial = { type: "fixed_points", points: 0 }` so the entry-supplied `stopReference` is used. |
| Audit script           | `scripts/audit-catalog-results.ts`               | Loads `data/hawks/user-entries/*.json`, runs the engine, compares computed exit reason against the catalog's `expectedResult`.                                     |

---

## Audit status (2026-03-23 → 2026-03-31)

14 / 24 trades match (58%). Remaining 10 mismatches are likely caused by:

1. **Single-position serialization** — the engine processes one position at a
   time; some catalog entries get "NOT FIRED" while a prior trade is open
   (5 such entries in the window).
2. **Data discrepancies** — for trades like T3/23, our DB shows bricks 63-65
   closing BULL with no BEAR close ≤ stop level before BE activates; the
   user's ProfitChart apparently showed an earlier against-brick close.
3. **Catalog data not yet entered for March 30-31** — `closingBrickPrice`
   missing for those days makes the visual cross-check harder.
