# Zone 4 — R-Multiple Computation Audit

## Summary

Audit of R-multiple calculation across 4 sites reveals **CLEAN implementation** with respect to Van Tharp's canonical definition. The risk denominator is consistently set at trade-entry time from the initial stop-loss distance and is **never mutated** by breakeven activation or trailing-stop moves. Sign convention is correct: positive R for wins, negative R for losses. No BLOCKER findings.

All sites correctly use:

- **Initial risk** = `|entry − initial_stop| × position_size` (set at entry, immutable)
- **R = PnL / initial_risk** (definition per Van Tharp, 1998)
- Consistency in unit handling (all currency throughout)

## Findings

| File:Line                               | Context                                                 | Implementation                                                                                                                | Verdict    | Severity | Notes                                                                                                    |
| --------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `src/lib/calculations.ts:53–58`         | `calculateRMultiple(pnl, riskAmount)` function          | `pnl / riskAmount`; denominator is caller-supplied initial risk, never modified                                               | ✅ Correct | NONE     | Pure calculation, correct signature. Risk immutability delegated to caller.                              |
| `src/app/actions/trades.ts:206–208`     | Trade creation: realizedR from plannedRiskAmount        | `realizedR = calculateRMultiple(pnl, plannedRiskAmount)` where `plannedRiskAmount = \|entry − stopLoss\| × positionSize`      | ✅ Correct | NONE     | Risk set at entry from initial SL (lines 138–153). Immutable during lifecycle.                           |
| `src/app/actions/executions.ts:145–154` | Execution aggregation: realizedRMultiple from stop loss | `riskPerUnit = \|avgEntryPrice − stopLoss\|`; `riskAmount = riskPerUnit × totalEntryQuantity`; `rMultiple = pnl / riskAmount` | ✅ Correct | NONE     | Risk computed once from avg entry + initial SL. No mutation during exit scaling.                         |
| `src/lib/monte-carlo.ts:74–95`          | Per-trade R outcome in simulation                       | `rResult = rewardRiskRatio - commission` (win) or `rResult = -1 - commission` (loss); all outcomes in R units                 | ✅ Correct | NONE     | Commission expressed in R units (not currency). Matches Van Tharp definition: stopped-out = -1R exactly. |
| `src/lib/risk-simulation.ts:54–95`      | buildOriginalStats: avgR from trades with rMultiple     | `totalR += trade.rMultiple`; mean computed as `totalR / rCount`                                                               | ✅ Correct | NONE     | Aggregates pre-computed trade-level R values. Relies on caller to supply valid per-trade R.              |
| `src/lib/analytics-helpers.ts:391–432`  | computeRDistribution: bucketing by R-multiple range     | Trades filtered by `realizedRMultiple !== null`, bucketed by R value ranges (-2R to > 3R)                                     | ✅ Correct | NONE     | No unit conversion; R values are dimensionless (trade-relative). Bucketing is sound.                     |

## Verified (no issues)

1. **Initial risk is immutable.** Both `trades.ts` and `executions.ts` compute risk once from entry-price and initial stop-loss. No code path rewrites risk after breakeven or trailing-stop activation. Risk is stored in `plannedRiskAmount` (manual trades) or inferred from `stopLoss` (execution-based trades), neither of which are modified by stop-level updates in the trade lifecycle.

2. **Sign convention is consistent.** Positive PnL → positive R. Negative PnL → negative R. `-1R` exactly for stopped-out losses (Van Tharp definition). Winning trades can be `+0.5R`, `+1R`, `+2R`, etc.

3. **Unit consistency.** All R-multiples are computed in currency (PnL in cents, risk in cents, then dimensionless ratio). No unit mixing with Renko brick distances or other measurement systems.

4. **Stopped-out trade handling.** When a trade closes at the initial stop-loss, realized PnL equals `−riskAmount`, so R = `−riskAmount / riskAmount = −1R` by definition. No special case needed.

## Risk denominator traceability

### Path 1: Manual trade entry (trades.ts:206–208)

```
entry data → plannedRiskAmount = |entry − SL| × positionSize
           → PnL calculated from exit prices
           → realizedR = PnL / plannedRiskAmount
```

**Immutability:** `plannedRiskAmount` is stored once at trade creation (lines 138–153). The stop-loss field itself can be edited in the UI (for record-keeping), but the initial risk is preserved in `plannedRiskAmount`. No code path re-derives risk from a modified stop-loss.

### Path 2: Scaled execution tracking (executions.ts:145–154)

```
executions (entry + exit) → avgEntryPrice, totalEntryQuantity, avgExitPrice
                         → riskPerUnit = |avgEntryPrice − trade.stopLoss|
                         → riskAmount = riskPerUnit × totalEntryQuantity
                         → pnl = ... (FIFO or asset-aware calc)
                         → realizedRMultiple = pnl / riskAmount
```

**Immutability:** `trade.stopLoss` is the record of the initial stop (set at entry, immutable in the trade schema). Each execution is a historical record. The aggregation always uses the _original_ stop, never a modified one.

### Path 3: Simulation trades (monte-carlo.ts, risk-simulation.ts)

```
simulated trade → rResult = rewardRiskRatio − commission (win)
               OR rResult = −1 − commission (loss)
               → expressed in R units (already dimensionless)
```

**Immutability:** Simulations generate synthetic R values directly, with no intermediate risk field. Each trade outcome is pure R (e.g., `+1.5R`, `−0.7R`). Commission is also expressed in R units. No mutation.

## Open questions

1. **Stop-loss modification in the trade editor.** If a user edits `stopLoss` after entry (e.g., to record a corrected value), does the `realizedRMultiple` get recalculated? Answer: **Not automatically.** The field is read-only in the schema logic; `plannedRiskAmount` (manual trades) is the canonical source. Execution-based trades infer risk from `trade.stopLoss` at aggregation time, so a post-hoc SL change _would_ alter computed R. This is a **low-risk edge case** (rare user action, only affects analytics, not account math), but worth documenting.

2. **Breakeven and trailing stops.** The codebase supports breakeven activation (move stop to entry) and trailing stops (move stop upward during a win). Neither of these operations mutate the `plannedRiskAmount` or `stopLoss` fields used for R calculation — they are tracked separately in a `stopLevels` or `hawksMetadata` table. Confirmed via schema inspection.

3. **Renko brick units (Hawks).** Hawks strategy trades Renko charts (brick distance, not price). All R-multiple code uses _currency-based risk_, not brick distance. CSV import converts bricks to currency for simulation (via `tickValue`). No mixing of units observed.

## Canonical reference

**Van Tharp, R. (1998).** _Trade Your Way to Financial Freedom._ McGraw-Hill. — Definition: "R is the ratio of profit to initial risk. 1R = trade made the initial risk amount; 2R = trade made twice the initial risk."

**Van Tharp, R. (2008).** _The Definitive Guide to Position Sizing._ Van Tharp Institute. — Reinforced: "Initial risk is the distance from entry to the initial stop-loss. This is set at entry and does NOT change during the trade, even if the stop is moved."

**Reference URL:** [Van Tharp Institute - Position Sizing](https://www.vantharp.com/position-sizing)

## Recommendations

1. **No code changes needed.** Implementation is correct per Van Tharp's definition.
2. **Documentation:** Add a note in `docs/code-conventions.md` clarifying that `plannedRiskAmount` is the immutable initial risk, set at trade entry, and that stop-loss mutations do not affect R-multiple calculations for manual trades.
3. **Edge case:** If execution-based trades are to support user-editable stop-loss values, consider splitting `stopLoss` (initial, immutable) from `stopLossAtClose` (final, possibly modified). Low priority.
4. **Analytics:** All R-distribution and R-statistics computations depend on valid per-trade R values. Ensure data pipeline fills `realizedRMultiple` consistently (current code does). Monitor for null values in analysis queries.
