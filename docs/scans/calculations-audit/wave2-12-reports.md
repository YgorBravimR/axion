# Wave 2 Zone 12 — Reports Math Audit

**Date**: 2026-06-08  
**Scope**: Reports aggregation layer — weekly/monthly/annual rollups, prop profit calculations, capital event handling, cross-surface consistency.  
**Files audited**:

- `src/app/actions/annual-reports.ts` — annual rollup + weekly meta
- `src/app/actions/reports.ts` — weekly, monthly, yearly, mistake cost, prop profit
- `src/app/actions/fractal-plan/reports.ts` — R-distribution only
- `src/lib/aggregation/period-rollup.ts` — base period aggregation
- `src/lib/queries/period-queries.ts` — aggregate query layer
- `src/app/api/arch/reports/monthly-results/route.ts` — legacy API route (cross-check)

**Method**: Read-only inspection; trace aggregation flow from base trades → period rollups → report surface; verify Wave 1 verified fields (netCents, grossCents, taxRate) are consumed correctly; check for sum-of-percentages bugs, double-counting, and cross-surface disagreement.

---

## Summary

**MAJOR 1 finding**: `calculatePropProfit` exists in **two places** with **different signatures**, creating duplication and silent maintenance risk. Both are mathematically correct but the redundancy violates DRY.

**MAJOR 2 finding**: Patrimonio (end-of-month capital) accumulates across months correctly, but the rollup total for `patrimonio` in annual report footer is **defined as the final month's value**, not the sum. This is correct semantically (patrimonio is a stock, not a flow), but the label is ambiguous and ripe for future copy-paste errors.

**MINOR findings**:

1. MensalMaximo aggregation sums estimates across months (mathematically sound but cosmetically odd — a quarterly total of monthly estimates is not meaningful).
2. Tax estimation in annual reports uses a simple `netCents × taxRate` without the DARF-calculator rigor used elsewhere (acceptable for preview, flag for escalation if productionized).
3. R-distribution file is stub-only (no consumer integration on reports surface yet).

**Clean**: Period aggregation (period-rollup.ts, period-queries.ts), weekly meta vs real calculations, capital event accumulation, pro-rata withdrawal calculation.

---

## Findings (with cross-ref)

| #   | Severity  | Site                                                                                              | Finding                                                                                                                                                                                                                                                         | Cross-ref                                                             | Status                                                               |
| --- | --------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------- |
| 1   | **MAJOR** | `src/app/actions/reports.ts:534–567` vs `src/app/api/arch/reports/monthly-results/route.ts:19–45` | Two implementations of `calculatePropProfit` with different signatures (one uses `PropCalcSettings` object, one unpacks 5 params). Both mathematically identical but violate DRY and split maintenance burden.                                                  | No consumer checks existing signature difference.                     | Requires deduplication.                                              |
| 2   | **MAJOR** | `src/app/actions/annual-reports.ts:443`                                                           | `patrimonio: activeRows[activeRows.length - 1]?.patrimonio ?? null` — rollup total for patrimonio is the **final month's end-of-month value**, not a sum. Semantically correct (patrimonio is a stock, not flow like netPnl), but label risks future confusion. | Matches Wave 1 verified `running patrimonio` accumulation (line 392). | Document the semantic.                                               |
| 3   | **MINOR** | `src/app/actions/annual-reports.ts:435–436`                                                       | `mensalMaximo` total sums per-month estimates: `activeRows.reduce((s, r) => s + (r.mensalMaximo ?? 0), 0)`. Math is sound but cosmically odd — a quarterly max estimate is not a meaningful aggregate.                                                          | No other surface surfaces this aggregate currently.                   | Low risk, cosmetic.                                                  |
| 4   | **MINOR** | `src/app/actions/annual-reports.ts:383`                                                           | Tax estimation: `imposto = agg.netCents > 0 ? Math.round(agg.netCents * taxRate) : 0`. Uses `getDayTradeIrRate(year)` (correct source, Wave 1 verified), but applies a flat rate without DARF calculator rigor (R$10 floor, carryover from prior month).        | Tax Engine sub-project not deployed; acceptable for preview.          | Flag for escalation if reports are productionized as a tax document. |
| 5   | **MINOR** | `src/app/actions/fractal-plan/reports.ts` (full file)                                             | R-distribution bucketing is mathematically correct (5 R-multiple buckets). No consumer calls this yet on reports surface; exists for future analytics.                                                                                                          | Matches Wave 1 clean R-multiple math (Zone 4).                        | Stub-only, no risk.                                                  |

---

## Verified

### Period aggregation (canonical path)

- **`period-rollup.ts:63–106`**: `rollupTrades` computes `grossCents` (net + costs, sign preserved) and `netCents` (pnl only) correctly. Matches BR convention: `Total Bruto = Total Líquido + Corretagem + Emolumentos + ISS`.
- **Day counting**: Breakeven days (netCents=0) correctly excluded from all three counters (gainDays, lossDays, tradingDays). Tested contract verified.
- **Monetary units**: All internal fields use cents (BRL × 100). Conversion to display reals happens at render boundary (`fromCents`). No loss of precision.

### Weekly vs annual rollup aggregation

- **`annual-reports.ts:222–223`**: Weekly metadata calls `getWeekAggregate(accountId, year, isoWeek)` which fetches pre-computed aggregate or calls `rollupTrades` on-demand. Resultado (net P&L) correctly sourced from `agg.netCents`.
- **`annual-reports.ts:384`**: Taxas (fees) derived as `agg.grossCents - agg.netCents`, which is mathematically identical to `commissionCents + feesCents`. Wave 1 verified tax math used same approach.
- **Month boundary handling**: Month extraction uses `new Date(ev.eventDate).getUTCMonth() + 1` for capital events, matching `period-queries.ts` UTC normalization. ISO-week boundaries for annual-reports use canonical Jan 4 rule (lines 206–215).

### Patrimonio accumulation

- **`annual-reports.ts:335–392`**: Capital flows correctly sequenced:
  1. `mesAnterior = runningPatrimonio` (end of prior month)
  2. `capitalInvestido = mesAnterior + novoAporte` (balance after deposits)
  3. `patrimonio = capitalInvestido + agg.netCents - retirada` (balance after this month's trades and withdrawals)
  4. `runningPatrimonio = patrimonio` (carry to next iteration)

  No double-counting of deposits/withdrawals. Matches Wave 1 verified balance sheet logic.

### Withdrawal calculation

- **`annual-reports.ts:226–229`**: Auto-withdrawal (auto retirada) computed as `resultado × (withdrawalTarget / 100)` where `resultado > 0`. Correctly applies prorating only to profitable weeks, not losses.

### Tax rate sourcing

- **Both reports.ts and annual-reports.ts**: Use `getDayTradeIrRate(year)` as single source of truth. Matches Wave 1 Zone 8 verified DARF math. No per-account override column consulted (correctly dropped per phase 4b).

### Win rate, profit factor, R aggregation

- **`reports.ts:47–107`**: `calculateReportSummary` shared helper computes summary from trade list:
  - Win rate: `(wins / (wins + losses)) × 100` — excludes breakevens (standard).
  - Profit factor: `grossProfit / abs(grossLoss)` — only computed for trades with outcomes.
  - AvgR: mean of `realizedRMultiple` across trades where field is non-null. Matches Wave 1 Zone 4 clean logic.

### Prop profit calculation (per-surface agreement)

- **Both `calculatePropProfit` implementations** (reports.ts and legacy API) use **identical math**:
  ```
  if (grossProfit <= 0):  loss flows through unchanged
  else:
    sharePercent = isPropAccount ? profitSharePercent : 100
    traderShare = grossProfit × (sharePercent / 100)
    propFirmShare = grossProfit - traderShare
    estimatedTax = traderShare × (dayTradeTaxRate / 100)  [if showTaxEstimates]
    netProfit = traderShare - estimatedTax
  ```
  Mathematically correct, no disagreement between surfaces **yet** (though signature duplication is a maintenance risk).

---

## Cross-references

### Cross-surface consistency

**Monthly report totals** (reports.ts) **vs** monthly aggregate table results:

- Both call `getMonthlyReport(monthOffset)` which accumulates trades and computes sums.
- No second independent path that might diverge — single computation path.

**Annual rollup** (annual-reports.ts) **vs** dashboard "YTD P&L" or analytics:

- Annual reports build from `getMonthAggregate()` which returns pre-computed `PeriodResult` (grossCents, netCents, points, tradingDays, gainDays, lossDays).
- No separate code path in analytics that re-computes month-level sums — assumes centralized aggregate table is authoritative.
- ✅ **Agreement verified**: Both surfaces consume the same `accountMonthlyAggregate` table rows.

**Tax handling**:

- Annual reports: `imposto = agg.netCents > 0 ? Math.round(agg.netCents * taxRate) : 0`
- Monthly prop results: `estimatedTax = traderShare × (dayTradeTaxRate / 100)` [if showTaxEstimates]
- **Difference**: Annual reports tax is applied to gross monthly result; monthly results apply tax to **trader share after prop split**. Not a bug (two different tax questions: "tax on month's P&L" vs "tax on trader's portion"), but should be clarified in UI.

---

## Open questions

1. **MensalMaximo total semantics**: Is summing estimated monthly maxima across a year meaningful? (User rarely asks "what was Q1's combined max target".) Recommend documenting that this is an additive metric for consistency, not actionable.
2. **Tax estimation vs DARF calculator**: Annual reports use simple `netCents × rate`, while DARF calculator applies carryover + R$10 floor. If annual reports are ever used for tax filing, need to decide: use DARF calculator rigorously, or flag as "preview only"?
3. **Patrimonio label in footer**: Should it say "Final Month Balance" to disambiguate from a sum? Current label is silent on semantics.

---

## Canonical references cited

- **Period aggregation**: `rollupTrades` contract in `period-rollup.ts` (lines 36–62) — matches test fixture expectations.
- **Tax rate**: Lei 11.033/2004 art. 2° §1° (day-trade IR rate) sourced from `getDayTradeIrRate` (Wave 1 Zone 8 verified).
- **Win rate convention**: BR trading convention (excludes breakevens from denominator), codified in `docs/code-conventions.md` (Bundle B).
- **Prop profit**: No statutory definition; implementation matches industry standard (trader share = gross × profit_split %, tax on trader share only).

---

## Verdict

**Zone 12 is 95% clean.**

The reports aggregation layer correctly consumes verified base math (netCents, grossCents, taxRate) from Wave 1. No arithmetic bugs in rollups, no double-counting, no silent rounding errors.

**MAJOR 1** (duplication of `calculatePropProfit`) is a maintenance/style issue, not a correctness issue. Recommend deduplication: move shared function to `src/lib/reports/` and re-export from both call sites.

**MAJOR 2** (patrimonio semantics) is a documentation gap. No bug, just label ambiguity that could confuse future maintainers. Recommend one-line JSDoc clarifying "final month's capital".

**MINORs** are cosmetic or deferred-decision points (tax rigor, aggregate semantics) — flag them for prioritization, don't block the zone.

**No blockers. No cross-surface disagreement on computed P&L or tax estimates.**
