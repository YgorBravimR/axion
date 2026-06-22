# Annual Reports & Tax Engine

> Yearly rollup for DARF filing, capital tracking, prop-firm annual grading. The canonical source of truth for Brazilian day-trade tax computation.

**Routes:** `/[locale]/reports/[year]`
**Server actions:** `annual-reports.ts`, `tax-engine.ts`, `src/lib/tax/recompute-month.ts` (protected — single source of truth)

## Purpose

Compile a year's worth of trades, fees, deposits, withdrawals, and IR (Imposto de Renda) due into a single filing-ready table. Track the loss-carryover chain across years.

## What lives there

### Annual rollup table

12 rows + totals. Per month:

- `resultadoBruto`, `resultadoLiquido` (net).
- `taxas` (fees), `imposto` (DARF due).
- `pontos` (B3 point count), `diasGain`/`diasLoss`.
- `mensalEsperado` (daily target × 20), `mensalMaximo` (×1.5 fallback).
- `novoAporte` (deposits), `retirada` (withdrawals).
- `capitalInvestido` (running equity), `patrimonioFinal` (end-of-month).
- `disabled` flag for months before account start.

### Weekly meta vs real

52 rows: `metaBruto`, `metaLiquido` (null until plan cascade ships), `resultado`, `autoRetirada` (auto-withdrawal if target met).

### Capital snapshot

Starting balance + every deposit/withdrawal with running balance.

### Fee rates table

Per-asset overrides: Corretagem, Registro, Emolumentos, ISS %, IRRF bps, IR bps.

### Tax ledger

Per-month: `grossGainCents`, `totalFeesCents`, `irrfCents`, `darfDueCents`, `darfStatus` (pending/paid/overdue), carryover balances.

## Inputs

- Account: `accountStartYear`, `accountStartMonth`, `startingBalanceCents`, `withdrawalTargetPercent`, `profitSharePercentage`.
- Trades grouped by month.
- Capital events.
- Fee rate overrides.

## Outputs

- Annual rollup JSON.
- DARF amounts + status per month.
- Carryover chain (used for next year's offsets).
- Effective tax rate per month (used by Plan EOY projection).

## Cross-feature integrations

- **Tax engine → annual rollup.** `recomputeAccountMonth()` is the single source. Fee changes mark all months dirty; rollup recomputes on demand.
- **Reports/monthly** — feeds the `resultadoLiquido` column.
- **Plan (yearly)** — `getEffectiveTaxRate` is consumed by EOY projection.
- **Settings** — fee rate UI writes to `accountFeeRates`.

## Where it fails

- **Tax rate stale baked in.** `getDayTradeIrRate(year)` is fixed at recompute time; if law changes, must manually call `recomputeLedger()`.
- **Carryover chain break.** If a month fails to recompute, next month's carryover-in is wrong. Mitigation: `recomputeFromMonth` re-chains forward — but it's a manual call.
- **`patrimonioFinal = null`** when starting balance or capital events are missing. Nulls propagate to UI.
- **B3 settlement mismatch.** Trades entered on Dec 31 settle Jan 2. Tax filing should reconcile to settlement date; Axion uses entry date. Year-end edge can shift gains across years.
- **`pontos` (point count) depends on aggregation freshness.** Stale aggregates → DARF mismatch with B3 statement. Mitigation: aggregation invalidated on trade insert/update — but verify.
- **No Receita Federal API integration.** `darfStatus` is user-tracked. No external "filed" signal.
- **R$20k day-trade exemption not modelled.** The engine computes full DARF; the law lets you exempt up to R$20k of monthly day-trade gains. If you're below the threshold, you're paying tax you don't owe.
- **Overdue DARF has no alert.** Status can be `"overdue"` but no notification surfaces it.
- **Withdrawal target naïve.** Changing `withdrawalTargetPercent` mid-month doesn't recompute past weeks.

## Power combos

1. **DARF filing loop.** Open year → review monthly imposto column → `markDarfPaid(month, amount)` after filing → year tax summary updates → export CSV for accountant.
2. **Carryover cascade across years.** Dec carryover-out = +R$5k → Jan starts with +R$5k to offset new gains → write the value into the next year's monthly intent so you don't forget to check it.
3. **Prop-firm renewal report.** Annual rollup totals (`diasGain`, `diasLoss`, `mensalMaximo`, `capitalInvestido`) + account metadata → contract renewal narrative.
4. **Capital + fee correction.** Upload nota fiscal in Journal → fees recomputed → tax ledger dirtied → annual rollup re-derived → DARF for that month updates same day.
