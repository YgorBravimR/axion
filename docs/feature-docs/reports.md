# Reports

> Snapshot summaries for self-review and prop-firm grading. Weekly / monthly / yearly.

**Routes:** `/[locale]/reports`, `/reports/[year]`
**Server actions:** `reports.ts` (30 KB), `annual-reports.ts`
**Files:** `src/app/[locale]/(app)/reports/**`

## Purpose

Hand a prop firm, an accountant, or your own Sunday-review self a structured snapshot of a period: P&L, mistakes, fee impact, comparison to plan, projection to month-end.

## What lives there

### Weekly

- Week boundaries (ISO).
- Summary: trades, P&L, win rate, fees, avg R.
- Daily breakdown (7 rows).
- Top 3 wins, top 3 losses.

### Monthly

- Month boundaries.
- Summary block.
- Weekly breakdown (4–5 rows).
- Asset breakdown (sorted by P&L).
- Mistake cost analysis (per-tag loss aggregation).
- Commission/fee impact (total fees, per-asset, 6-month trend).
- Monthly results with prop (trader share, taxes, net after firm cut).
- Monthly projection (linear from current pace).
- Month comparison (current vs prior).

### Yearly overview

- 12-month grid: net P&L + trade count per month.

## Inputs

- Date filters (range, period).
- Account scope.
- Tax flags (`showTaxEstimates`, `showPropCalculations`).
- Settings (`isPropAccount`, `profitSharePercentage`, `propFirmName`).

## Outputs

- JSON for each report.
- Prop breakdown: gross → fees → taxes → trader share → net.
- DARF-ready tax columns: `irGrossCents`, `taxableGainCents`, `deferredIr`.
- CSV/PDF export (UI layer).

## Cross-feature integrations

- **Plan** — monthly net vs daily profit target drives Plan compliance badge.
- **Analytics** — monthly breakdown row count matches yearly overview months (shared date utils).
- **Tax engine** — `getDayTradeIrRate(year)` is the single source between Reports cockpit and DARF filing.
- **Annual reports** — monthly-results-with-prop feeds the annual rollup `resultadoLiquido` column.

## Where it fails

- **Weekly meta is ornamental.** `metaBruto`/`metaLiquido` are `null` because the fractal-plan cascade doesn't yet emit weekly targets. The column is a placeholder.
- **Mistake tags are manual.** No auto-detection. If you never tag, mistake cost is zero. Survivorship bias guaranteed.
- **Linear projection.** Days remaining × daily average. Ignores volatility, market holidays, your calendar.
- **R$20k day-trade exemption not surfaced.** Brazilian traders get a monthly gain exemption on day-trades that the Reports don't break out — you'd never know you qualify.
- **TZ edge cases.** Week/month boundaries computed via date-fns in local TZ vs manual UTC math — drifts on DST.
- **No prop-firm payout reconciliation.** Math shows projected payout; doesn't compare to actual deposits from the firm.
- **No per-trade fee reconciliation.** Weekly/monthly sums fees but you can't audit which trade had what fee structure unless you go to Journal.
- **Showings rules are static.** `showTaxEstimates=false` hides tax columns globally; can't be per-period.

## Power combos

1. **Mistake + fee impact side-by-side.** "Most costly mistake = R$400; total fees that month = R$150." Sometimes the fees are bigger than the mistakes — Reports is the only place that exposes both.
2. **Prop-firm month grading.** Month comparison delta (win rate +5%, avg R −0.2) + Plan compliance trend → narrative for the firm: "discipline up, risk per trade down, system stable."
3. **Carryover forecast.** Monthly projection × effective tax rate from tax engine → "if pace holds, net after taxes = R$X." Used to drive deposit/withdrawal decisions at month-end.
4. **Weekly Sunday loop.** Open weekly report → write Sunday-review note in Plan month view → set next week's R target in monthly intent. Three surfaces, one loop.
