# Backtest Engine — Roadmap & Extension Points

> This document preserves architectural context for future development sessions.
> The engine uses composable modules. Each section describes a planned extension
> with enough detail to implement without re-deriving the design.

## Architecture Reference

```
StrategyRecipe = {
  entry:    EntryModule      // WHEN to enter
  stop:     StopModule       // HOW stop evolves (initial → breakeven → trailing)
  target:   TargetModule     // WHERE to take profit
  sizing:   SizingModule     // HOW MANY contracts
  reversal: ReversalModule   // WHAT HAPPENS on stop hit
  scaleOut: ScaleOutModule   // HOW to exit (partial fractions)
}
```

Engine orchestrates modules per-candle. Modules are pure functions — no DB, no React.
Server action `runBacktestAction` is the Python migration boundary.

### Module interfaces live in:
- `src/lib/backtest/modules/{entry,stop,target,sizing,reversal,scale-out}/types.ts`

### Profit (Nelogica) reference strategies:
- `/Users/ygorbravim/personal/projects/nelogica/working/BRAVO_E_BREAKOUT_1C.pas` — ORB with reversal
- `/Users/ygorbravim/personal/projects/nelogica/working/BRAVO_E_10k_v4.pas` — MACD+WMA with indicator trailing
- `/Users/ygorbravim/personal/projects/nelogica/working/BRAVO_E_Trava_Ind_v1.pas` — Trava strategies
- `/Users/ygorbravim/personal/projects/nelogica/working/BRAVO_E_Vtc_breakout_indice.pas` — VTC breakout

---

## v1 (Current Implementation)

### Entry Modules
- [x] `orb_breakout` — Opening Range Breakout

### Stop Modules
- [x] Initial: `pct_range`, `fixed_points`, `full_range`
- [x] Breakeven: `on_partial`, `on_pct_risk`
- [x] Trailing: `price_distance`

### Target Modules
- [x] `fixed_levels` — pct-of-range or R-multiple targets with EOD exit

### Sizing Modules
- [x] `monetary_risk` — contracts from R$ risk amount
- [x] `fixed_lots` — fixed N contracts

### Reversal Modules
- [x] `none`, `reverse_on_stop`

### Scale-Out Modules
- [x] `half_half`, `all_or_nothing`

### UI
- [x] Pre-built presets (ORB Test 1-4)
- [x] Results: summary cards, equity curve, trade table

---

## v2 — Indicator-Based Trailing Stop

### What
Add `trailing_indicator` to the stop module. The stop follows a named indicator value
from the candle's JSONB `indicators` field (e.g., follow VWAP or WMA).

### Why
The 10K strategy (`BRAVO_E_10k_v4.pas`) uses WMA trailing after partial exit:
```pascal
// Line 492: trailing stop follows WMA
Se trailingAtivado e (Fechamento < wmaTrail) entao
  ClosePosition;
```

### How
File: `src/lib/backtest/modules/stop/trailing.ts`

Add a `trailing_indicator` type alongside existing `price_distance`:

```typescript
interface TrailingIndicatorConfig {
  type: "indicator"
  indicatorKey: string    // e.g., "vwap_d", "wma_9"
  offset: number          // points offset from indicator value (positive = give more room)
  activationPct?: number  // optional: only start trailing after X% of risk recovered
}
```

The trailing function reads `candle.indicators[indicatorKey]` each bar.
If the indicator value is missing (null/undefined), keep previous stop (don't crash).

For long: `newStop = max(currentStop, indicatorValue - offset)`
For short: `newStop = min(currentStop, indicatorValue + offset)`

### Prerequisite
The indicator must exist in the candle JSONB data. Currently available indicators:
- `vwap_d`, `vwap_s`, `vwap_m` (VWAPs)
- `ema_200` (200 EMA)
- `trava_0` through `trava_5`, `trava_neg1` through `trava_neg5`

WMA is NOT currently stored. To use WMA trailing, either:
1. Pre-compute WMA during CSV import and store in JSONB
2. Compute WMA on-the-fly in the engine from close prices (simpler, ~10 lines)

Option 2 is recommended: add a `computeWMA(candles, period, currentIndex)` utility in `candle-utils.ts`.

---

## v3 — Percent of Capital Sizing

### What
Add `pct_capital` sizing module. Risk X% of current equity per trade.

### Why
As account grows, position sizes should scale. Professional systems (MT5, WealthLab) all
support equity-based sizing.

### How
File: `src/lib/backtest/modules/sizing/pct-capital.ts`

```typescript
interface PctCapitalConfig {
  type: "pct_capital"
  pctRisk: number              // e.g., 1.0 = risk 1% of equity
  valuePerPointCents: number
  initialCapitalCents: number  // starting equity (new field in BacktestConfig)
}
```

The sizing module receives current equity (tracked by the engine across trades):
```typescript
const riskCents = equityCents * (config.pctRisk / 100)
const contracts = Math.floor(riskCents / (stopDistance * config.valuePerPointCents))
```

### Engine change required
The engine currently doesn't track running equity. Add:
```typescript
let equityCents = config.initialCapitalCents ?? 0
// After each trade:
equityCents += trade.netPnlCents
```

Pass `equityCents` to `sizingModule.calculate()`.

Also requires adding `initialCapitalCents` to `BacktestConfig` type and the UI form.

---

## v4 — New Entry Modules

### `indicator_cross` — EMA/WMA Cross Entry
Based on `BRAVO_E_10k_v4.pas` (10K strategy):
- MACD histogram color classification (4 colors: strong green, weak green, strong red, weak red)
- 3 consecutive strong bars in same direction = "virada"
- WMA 9/21 cross alignment
- Entry on 2nd Renko candle after alignment

Config: `{ macdFast, macdSlow, macdSignal, wmaFast, wmaSlow, candlesAfterAlignment }`

### `vwap_reversion` — VWAP Mean Reversion
Enter when price touches/bounces from VWAP level.

Config: `{ vwapKey, distanceThreshold, direction: "mean_revert" | "breakout" }`

### `trava_breakout` — Trava Level Breakout
Based on `BRAVO_E_Trava_Ind_v1.pas`.

Config: `{ travaLevel, ticksBuffer, direction: "breakout" | "rejection" }`

### Implementation pattern
Each entry module lives in `src/lib/backtest/modules/entry/{name}.ts` and implements
the `EntryModule` interface. Register in `src/lib/backtest/modules/entry/index.ts`.
Create matching presets in `src/lib/backtest/presets/`.

---

## v5 — Advanced Scale-Out

### `custom_fractions`
User defines exit percentages: e.g., `[0.33, 0.33, 0.34]` for 3-target scaling.

### `trail_remainder`
After first partial, trail the remaining position instead of targeting a fixed level.
Combines scale-out with trailing stop: partial exit at T1, then trailing on remainder.

This requires the engine to support "mixed mode": some contracts on target, some on trailing.

---

## v6 — Optimization Grid

### What
Run the same strategy recipe across a grid of parameter combinations.
Example: 1,200 combos from the ORB backtest guide (Phase 1A).

### Why
Manual iteration is slow. Grid search finds optimal parameter regions.

### How — TypeScript (simple)
```typescript
const runOptimization = (candles, baseRecipe, paramGrid) => {
  const results = []
  for (const combo of generateCombinations(paramGrid)) {
    const recipe = applyParamsToRecipe(baseRecipe, combo)
    results.push({ params: combo, result: runBacktest(candles, recipe, assetConfig) })
  }
  return results.sort((a, b) => b.result.summary.profitFactor - a.result.summary.profitFactor)
}
```

For 1,200 combos × 220 days × ~50 candles/day = ~13M iterations. At ~1μs per candle check,
this is ~13 seconds. Acceptable for a server action with timeout.

### How — Python (fast)
Migrate to Python service. Use numpy for vectorized parameter sweeps.
The `StrategyRecipe` and `BacktestResult` types become the JSON API contract.

Server action swaps from:
```typescript
const result = runBacktest(candles, recipe, assetConfig)
```
to:
```typescript
const result = await fetch("http://python-service/backtest", {
  method: "POST",
  body: JSON.stringify({ candles, recipe, assetConfig })
}).then(r => r.json())
```

### UI
Add `/backtest/optimize` page with:
- Parameter range inputs (min, max, step)
- Results heatmap/table sorted by metric
- Click a row to see full backtest details

---

## v7 — Statistical Validation

### Walk-Forward Analysis
Split data into in-sample (optimize) and out-of-sample (validate) windows.
Slide the window forward. Only trust parameters that work out-of-sample.

### Monte Carlo Simulation
Randomize trade order 10,000 times. Build confidence intervals for drawdown and return.
Axion already has Monte Carlo infrastructure (`src/app/actions/monte-carlo.ts`) — reuse the simulation pattern.

### Statistical Significance
Use bootstrap or permutation tests to determine if strategy performance is distinguishable from random.

These are best implemented in Python (scipy, statsmodels).

---

## Reference: Engine Design Influences

### MetaTrader 5
- Layered stop management: breakeven activates before trailing starts
- CTrade class: `breakEvenTriggerPoints` + `breakEvenLockPoints` + `trailingStartPoints`
- Event lifecycle: `OnInit() → OnBar() → OnDeinit()`

### WealthLab
- PosSizer is separate from exit logic (never conflated)
- Building Blocks as composable drag-and-drop units
- `BacktestBegin() → Initialize() → Execute()` temporal separation

### Nelogica Profit
- Bar-by-bar execution (NTSL scripting)
- `BuyAtMarket`, `SellToCoverStop`, `SellToCoverLimit`, `ClosePosition`
- The buy/sell management duplication (see BREAKOUT_1C.pas lines 357-455) is exactly
  what our module abstraction eliminates
- Two reversal modes: immediate (pctStop=0) vs range-breakout (pctStop>0)
- Indicator trailing: `Se trailingAtivado e (Fechamento < wmaTrail) entao ClosePosition`
