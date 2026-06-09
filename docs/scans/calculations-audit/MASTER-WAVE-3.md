# Calculations Audit — Master Ledger (Wave 3)

**Date**: 2026-06-09
**Scope**: Math zones NOT touched in Waves 1 + 2 — unit conversion (cents↔reais↔ticks↔points↔R↔bps), date / timezone / EOD math (BRT vs UTC, ISO weeks, Hawks day boundary, session times), display formatters + locale (Intl.NumberFormat, percent semantics, sign convention, NaN/Infinity guards).
**Method**: Same orchestrator (Opus 4.7) + 3 parallel scan subagents (Sonnet 4.6) pattern as Waves 1 + 2. Per-zone reports at `docs/scans/calculations-audit/wave3-1{5..7}-*.md`.

---

## Executive summary

**Wave 3 found 1 BLOCKER**: profit factor of `Infinity` renders as the literal string `"Infinity"` on metric cards (13 production sites), because `.toFixed(2)` doesn't guard against IEEE 754 special values. Users see `"Infinity"` instead of a formatted number whenever a strategy has zero losses. Mechanical fix: wrap with `Number.isFinite()` guard.

**The orchestrator (me) calibrated severities downward from the raw agent reports.** The three Sonnet scan agents collectively claimed 6 BLOCKERs. After re-evaluating each against the rubric ("BLOCKER = wrong number a user sees today"), only the Infinity rendering bug qualifies. The other 5 agent-claimed BLOCKERs are MAJORs (latent / drift / protected-path) — real concerns, but not "wrong number on screen today". See "Severity corrections" section below for the specific calls.

**Significant MAJOR cluster — Brazilian timezone handling has two regimes.** The canonical `dates.ts` uses `Intl.DateTimeFormat` with `APP_TIMEZONE = "America/Sao_Paulo"` correctly. But three sites bypass it: `recompute-month.ts` (PROTECTED), `analytics.ts:getTimeHeatmap`, and the implicit divergence between `day-grouper.ts` and `analytics.ts` on what defines a "trading day". For Brazilian day-trading (09:00–18:00 BRT, entirely inside one UTC day), the bugs don't fire in practice today — but they're latent and would surface if Axion adds overnight markets (US futures, crypto, extended BR sessions).

**Second MAJOR cluster — display layer is locale-aware in theory, hardcoded in practice.** 31 sites call `.toLocaleString("pt-BR", …)` even when a `locale` prop is available. UI language switches don't propagate. Numbers stay Brazilian-formatted in the English UI. Not wrong numbers — wrong formatting, which is a different correctness lens.

**Wave 3 is the smallest math-honesty improvement of the three waves**: Wave 1 fixed the loud bugs (annualization gap, std dev convention). Wave 2 confirmed no quiet equivalents in surrounding layers. Wave 3 finds one user-visible BLOCKER plus a long tail of MAJOR latent / drift / locale issues. The system's math fidelity is now characterized end-to-end.

---

## Severity corrections from the raw reports

The Sonnet agents in this wave over-severitized findings. I corrected before writing this ledger. The corrections are recorded here for audit honesty and to keep the severity rubric calibrated for future waves.

| Raw finding                                         | Agent severity | Calibrated severity        | Reason                                                                                                                                          |
| --------------------------------------------------- | -------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Zone 15 — Missing JSDoc on `formatPercent`          | BLOCKER        | MINOR                      | Documentation gap; function is correct. Report itself self-corrected mid-document.                                                              |
| Zone 15 — Three `formatPercent` implementations     | BLOCKER        | MAJOR                      | All three produce identical output today; risk is drift if input semantics change.                                                              |
| Zone 16 — `recompute-month.ts` TZ extraction        | BLOCKER        | MAJOR (latent + PROTECTED) | Bovespa day-trade hours (09:00–18:00 BRT) fit inside one UTC day; bug only fires for after-hours trades, which Axion doesn't currently support. |
| Zone 16 — `analytics.ts:1323` `setHours`            | BLOCKER        | MAJOR (latent)             | Report itself calls it "accidentally correct on Vercel UTC".                                                                                    |
| Zone 16 — day-grouper vs analytics divergence       | BLOCKER        | MAJOR                      | Real, but requires a user-visible compare flow to surface.                                                                                      |
| Zone 17 — Infinity rendering as `"Infinity"` string | BLOCKER        | **BLOCKER**                | Confirmed. 13 production sites. User sees a wrong rendering today.                                                                              |

The rubric (codified at Wave 1 start): **BLOCKER = wrong number a user can see TODAY.** Latent risk, drift risk, missing JSDoc, accidentally-correct-on-current-deployment all fall short of that bar. They're MAJOR, MINOR, or "convention drift candidate" depending on shape.

---

## Per-zone status table

| #   | Zone                        | Status       | Blocker | Major | Minor | Report                           |
| --- | --------------------------- | ------------ | ------- | ----- | ----- | -------------------------------- |
| 15  | Unit conversion             | ⚠️ Hygiene   | 0       | 3     | 3     | `wave3-15-unit-conversion.md`    |
| 16  | Date / timezone / EOD math  | ⚠️ Latent TZ | 0       | 5     | 5     | `wave3-16-date-tz-math.md`       |
| 17  | Display formatters + locale | ❌ 1 BLOCKER | 1       | 3     | 6     | `wave3-17-display-formatters.md` |

---

## Severity-ranked findings (calibrated)

### BLOCKER 1 — Profit factor `Infinity` renders as literal `"Infinity"` string (Zone 17)

**Pattern**: 13 component sites call `profitFactor.toFixed(2)` directly with no `Number.isFinite()` guard. When `calculateProfitFactor(profit, loss)` returns `Infinity` (loss = 0), the string `"Infinity"` appears on the user's metric card.

**Sites**:

- `src/components/dashboard/kpi/profit-factor-card.tsx:44`
- `src/components/optimize/freeze-hero-modal.tsx:68,129,134` (3 instances)
- `src/components/optimize/parameter-heatmap.tsx:586`
- `src/components/backtest/backtest-summary-cards.tsx:55`
- `src/components/monte-carlo/stats-preview.tsx:84`
- `src/components/monte-carlo/v2/monte-carlo-v2-content.tsx:131`
- `src/components/analytics/holding-period-chart.tsx:95`
- `src/components/analytics/session-performance-chart.tsx:110`
- `src/components/reports/weekly-report-card.tsx:199`
- `src/lib/pdf/report-template.tsx:271,512` (2 instances)
- `src/lib/coaching/prompt-builder.ts:121`

**Fix shape**: replace `value.toFixed(2)` with `Number.isFinite(value) ? value.toFixed(2) : "—"` at each site, or extract a `formatFinite()` helper in `formatting.ts`.

**Adjacent risk** (4 sites with same pattern, not yet firing):

- `src/components/optimize/parameter-heatmap.tsx:596` — `sharpeRatio.toFixed(2)`
- `src/components/backtest/backtest-summary-cards.tsx:98` — `sharpeRatio.toFixed(2)`
- `src/components/monte-carlo/strategy-analysis.tsx:213,218` — Sharpe / Sortino

A zero-variance daily-return series produces NaN Sharpe; same `.toFixed(2)` pattern would render `"NaN"`. Fix the BLOCKER and the adjacent risk in one pass.

---

### MAJOR findings

**Z15-1 — Three `formatPercent` implementations.** `src/lib/formatting.ts:76` (Intl), `src/lib/calculations.ts:173` (toFixed), and inline in `src/components/risk-simulation/summary-cards.tsx:8`. Produce identical output today on 0–100 input, but two different rounding algorithms (Intl halfExpand vs toFixed banker's) can diverge at half-step values. Drift risk if input semantics change. **Fix**: delete the `calculations.ts` version, update the one consumer (`src/components/journal/pnl-display.tsx:2,49`) to import from `formatting`.

**Z15-2 — Basis-points convention not type-enforced.** `irRateBps`, `irrfRateBps` use 0–10000 scale (`2000 = 20%`); convention enforced only by developer discipline. A future caller forgetting `/ 10000` would silently 100x-under-tax. **Fix**: add `BasisPoints` branded type or `fromBasisPoints(bps)` helper. Lower priority than BLOCKER — current callers are correct.

**Z15-3 — `issRatePercent` stored as string `"5.00"`.** `src/lib/tax/fee-allocator.ts:5`. Parsed via `parseFloat` at every site. Works today but adding a path that reads it as number would silently concat strings. **Fix**: schema change to number + migration. Lower priority — schema change touches DB.

**Z16-1 — `recompute-month.ts:128-130` extracts day components in local TZ (PROTECTED).** On Vercel (UTC server), `getFullYear/getMonth/getDate` returns UTC components. Bovespa day-trade hours sit inside one UTC day, so the bug doesn't fire for current BR day-trading. Becomes a real bug for any future overnight / extended-hours / non-BR market. **Fix gate**: explicit user go-ahead required — file is on the protected paths list.

**Z16-2 — `analytics.ts:1323-1327` `setHours()` in server TZ.** Accidentally correct on Vercel UTC. Would shift day boundaries if the server moved. **Fix**: replace `setHours(0,0,0,0)` / `setHours(23,59,59,999)` with `getStartOfDay(date)` / `getEndOfDay(date)` from `dates.ts`. Low-risk inline fix.

**Z16-3 — `day-grouper.ts` and `analytics.ts` silently diverge on "day".** Hawks engine filters candles to 09:00–18:00 BRT trading hours; analytics doesn't filter. Trades at 18:15 BRT can appear in reports but not in backtest. **Fix gate**: design decision — calendar day vs trading day. Punt to user.

**Z16-4 — `formatLocalYMD()` (`src/lib/backtest/time-utils.ts:19-34`) semantics confused.** Documented as "local timezone"; consumers assume BRT. **Fix**: rename to `formatBrtYMD()` or add explicit TSDoc.

**Z16-5 — `getEndOfMonth()` uses server-local `getDate()` inside a BRT-aware function.** Works on UTC server by accident. **Fix**: use Intl.DateTimeFormat for the last-day extraction, parallel to `getBrtDateParts()`.

**Z17-1 — Dual `formatPercent` implementations** — same finding as Z15-1, surfaces in Zone 17 from the display side.

**Z17-2 — 31 sites hardcode `"pt-BR"` locale.** Bulk: 16 of them are in `src/components/fractal-plan/cockpit/*.tsx`; the rest scattered across journal, ui/currency-input, shared/colored-value. UI language switching doesn't reach these surfaces. **Fix**: replace `toLocaleString("pt-BR", …)` with `useFormatting()` hook or `toLocaleString(locale === "pt-BR" ? "pt-BR" : "en-US", …)`. Higher LOC count; could be its own bundle.

**Z17-3 — NaN Sharpe/Sortino risk.** 4 sites with the same `.toFixed(2)` pattern as the BLOCKER but on Sharpe/Sortino, which can be NaN under zero-variance conditions. Not yet firing; fix in the same pass as the BLOCKER.

---

### MINOR findings (calibrated)

**Documentation / hygiene** (no current bug, fix when convenient):

- **Z15-M1**: `formatPercent` missing input-scale JSDoc (0–100 vs 0–1). Single line of TSDoc.
- **Z15-M2**: `tickValue` field name ambiguous (value-per-point, not per-tick). JSDoc clarification.
- **Z15-M3**: No DB constraint on IR rate fields (any integer accepted). Add Zod `min/max` or DB check.
- **Z16-M1**: Week-start convention (Sunday vs ISO Monday) underdocumented in `dates.ts:46-70`.
- **Z16-M2**: Session boundary times (09:00–18:00 BRT) hardcoded in 3+ places. Extract to `SESSION_BOUNDARIES` constant.
- **Z16-M3**: `new Date("YYYY-MM-DD")` UTC-midnight parsing convention not documented in `code-conventions.md`.
- **Z16-M4**: `APP_TIMEZONE` not exported, redefined in `day-grouper.ts`. Export + import.
- **Z16-M5**: Test setup doesn't pin a timezone; tests pass under runner TZ.
- **Z17-M1** through **Z17-M6**: rounding consistency variants, zero-display formatting, PDF formatter locale, compact-currency hardcoded `en-US`. All cosmetic.

---

## Cross-zone themes

### Theme 1 — Brazilian-only assumptions are baked in

Five different findings circle around the same pattern: Axion was built Portuguese-only, BR-market-only. Locale support and TZ infrastructure were added later via `dates.ts` and `useFormatting`. The hardcoded `"pt-BR"` literals + the `recompute-month` UTC extraction + the `day-grouper` BRT-arithmetic + the lack of session-boundary constants are all symptoms of a system that worked because BR-only made all these "wrong" choices look right.

For BR day-trade users today, nothing is broken. For a future where Axion adds overnight markets or English-UI customers, this is the work queue.

### Theme 2 — `.toFixed` is the wrong tool at every site that uses it

The single BLOCKER is `.toFixed` on Infinity. The MAJOR NaN risk is `.toFixed` on Sharpe. The MINOR rounding inconsistency is `.toFixed` (banker's) vs Intl (halfExpand). A blanket rule — "no raw `.toFixed` in user-facing display code; use a `formatFinite(value, decimals)` helper or `Intl.NumberFormat`" — would eliminate all three at once and prevent the next one.

### Theme 3 — Architecture is right; consumers don't always use it

`dates.ts` is correct. `formatting.ts` is correct. `useFormatting` is correct. The bugs are in code that bypasses these layers — sometimes from before they existed, sometimes because the canonical helpers are slower for hot paths (Hawks engine over 80k candles). Wave 3's fix work is mostly "route consumers back through the canonical layer", not "fix the canonical layer".

---

## Recommended fix bundles

### Bundle G — Infinity / NaN guards (BLOCKER + Z17-3) — HIGH PRIORITY

**Files**: 17 display sites (13 Infinity + 4 NaN) listed under BLOCKER 1 and Z17-3.
**Fix**: extract `formatFinite(value, decimals = 2, fallback = "—")` helper in `src/lib/formatting.ts`; replace `.toFixed(decimals)` calls at each site.
**Tests**: unit test for `formatFinite` with Infinity / -Infinity / NaN / regular numbers. Add to existing `formatting.test.ts`.
**Risk**: very low. Pure display-layer change, no math change.

### Bundle H — `formatPercent` consolidation (Z15-1 / Z17-1) — MEDIUM PRIORITY

**Files**:

- Delete `src/lib/calculations.ts:formatPercent` (the `.toFixed`-based version)
- Update `src/components/journal/pnl-display.tsx:2,49` to import from `@/lib/formatting`
- Replace the inline `formatPercent` in `src/components/risk-simulation/summary-cards.tsx:8` with the canonical helper
- Add JSDoc to `src/lib/formatting.ts:formatPercent` documenting input-scale convention (0–100)
  **Risk**: low. All three implementations produce identical output today on the call sites being changed.

### Bundle I — Latent TZ fixes (Z16-2, Z16-4, Z16-5) — MEDIUM PRIORITY

**Files**:

- `src/app/actions/analytics.ts:1323-1327` — replace `setHours()` with `getStartOfDay()` / `getEndOfDay()`
- `src/lib/backtest/time-utils.ts:19-34` — add explicit TSDoc OR rename `formatLocalYMD` → `formatBrtYMD` (whichever is honest about the function's actual contract)
- `src/lib/dates.ts:182` — `getEndOfMonth` last-day extraction via Intl, not `getDate()`
  **Risk**: low. All three are accidentally-correct-on-UTC-server today; fixes make them explicitly correct.

### Bundle J — Documentation MINORs

**Files**: only `docs/code-conventions.md` + JSDoc additions in `src/lib/formatting.ts`, `src/lib/dates.ts`. No behavior changes.
**Scope**: input-scale JSDoc for `formatPercent`, `tickValue` semantic clarification, week-start convention note, `new Date("YYYY-MM-DD")` parsing footgun, `SESSION_BOUNDARIES` constant extraction.
**Risk**: zero.

### Bundle K (PROTECTED — requires explicit go-ahead) — Z16-1

**Files**: `src/lib/tax/recompute-month.ts:128-130` — replace `getFullYear/getMonth/getDate` with `getBrtDateParts()`.
**Gate**: PROTECTED path. Even though the bug is latent (doesn't fire for current BR day-trade hours), fixing it inside the protected file requires your explicit nod. Same gate type as Bundle D in Wave 1.

### Bundle L (architectural — needs design call) — Z16-3

**Files**: `src/lib/backtest/day-grouper.ts` + `src/app/actions/analytics.ts`
**Decision needed**: do we define "day" as "calendar day 00:00–23:59 BRT" or "trading session 09:00–18:00 BRT"? Both have merit. Hawks engine wants the latter (skip illiquid noise); reports want the former (don't drop after-hours trades from a user's journal). Once decided, propagate uniformly.

### Bundle M — Locale hardcoding cleanup (Z17-2) — LOWER PRIORITY / LARGER SCOPE

**Files**: 31 sites across `src/components/fractal-plan/cockpit/*.tsx` (16), `src/components/journal/*`, `src/components/ui/currency-input.tsx`, `src/components/shared/colored-value.tsx`. Pattern: replace `toLocaleString("pt-BR", …)` with `useFormatting()` hook calls.
**Risk**: medium — touches many components. Bulk refactor; good candidate to dispatch to `i18n-translator` agent.

### Bundle N — Basis-points branded type (Z15-2) — LOWER PRIORITY

**Files**: `src/lib/tax/darf-calculator.ts`, `src/lib/tax/irrf-accumulator.ts`, callers, plus DB-adjacent schema field types in `src/db/schema.ts` (PROTECTED).
**Risk**: medium — touches schema. Could be done as a TypeScript-only branded type without schema migration if the DB stays at `integer`.

---

## What Wave 3 ruled OUT

Honest read: the loud bugs (annualization, std dev, missing CAGR) were already caught in Wave 1. Wave 2 confirmed no equally-bad bugs hide in surrounding aggregation. Wave 3 confirms no equally-bad bugs hide in the unit / TZ / display layers either — apart from the single Infinity rendering BLOCKER.

After Bundle G ships, the system has no known user-visible wrong-number bugs in any of the three waves' scan zones.

---

## Decision points for the user

1. **Bundle G (Infinity/NaN guards)** — high priority, low risk. Should ship now.
2. **Bundles H + I + J** (consolidation + latent TZ + docs) — low risk; ship alongside G or queue.
3. **Bundle K** (PROTECTED tax TZ) — needs explicit go-ahead; latent today, fix is a hedge against future overnight-markets expansion.
4. **Bundle L** (calendar day vs trading day) — needs design call. The "right" answer depends on product intent (is the journal a faithful log of every trade, or a curated record of trading-session activity?).
5. **Bundle M** (31 locale-hardcoded sites) — larger scope, good `i18n-translator` agent target. Defer or schedule as its own PR.
6. **Bundle N** (BasisPoints branded type) — type-safety improvement, no current bug. Could be skipped.

---

## Files surveyed across Wave 3

47 + 47 + 187 = **281 files** across the three zones (some overlap on shared `formatting.ts`, `dates.ts`, `calculations.ts`). Detailed file lists in each zone's report.
