# Wave 3 Calculations Audit — Zone 17: Display Formatters + Locale

**Date**: 2026-06-09
**Scope**: Intl.NumberFormat usage, percent/decimal/currency conventions, sign placement, locale switching, NaN/Infinity handling, decimal precision, and rounding consistency
**Files surveyed**: 187 files across `src/lib/`, `src/components/`, `src/hooks/`, `src/app/`
**Canonical references**: pt-BR conventions (period thousands, comma decimal), Intl.NumberFormat spec, IEEE 754 special values

---

## Executive summary

**Zone 17 found 1 BLOCKER, 3 MAJOR, and 6 MINOR issues.** The BLOCKER is a critical data-display bug: `Infinity` values (profit factor when no losses) render as the literal string `"Infinity"` on screen instead of being formatted or guarded. This breaks user trust in the metrics. The MAJORs concern hardcoded "pt-BR" locales that should respect UI locale context, and dual `formatPercent` implementations with conflicting conventions that create silent usage bugs. The MINORs are documentation gaps and minor inconsistencies that don't affect correctness but increase drift risk.

**Summary**: The formatter architecture is sound (parametric locales via `useFormatting` hook), but execution has gaps: 31 sites hardcode "pt-BR" when locale context is available, `Infinity`/`NaN` special values are never guarded, and two competing `formatPercent` implementations create a footgun where the wrong one can be imported and silently produce wrong output.

---

## Per-area findings

### Currency formatting

**✅ Canonical-correct**: `src/lib/formatting.ts:formatCurrency`, `src/lib/formatting.ts:formatCurrencyWithSign`, `src/lib/formatting.ts:formatBrlWithSign` all use `Intl.NumberFormat` with `style: "currency"`, `currency: "BRL"` (or parameterized), `minimumFractionDigits: 2`, `maximumFractionDigits: 2`. The locale is parametrized via `localeMap[locale]` which correctly maps `"pt-BR"` → `"pt-BR"` and `"en"` → `"en-US"`. Output matches Brazilian convention: `R$ 1.234,56` (period thousands, comma decimal).

**⚠️ Issue**: Multiple components bypass these helpers and hardcode `Intl.NumberFormat(..., "pt-BR", ...)` directly, losing locale awareness:

- `src/components/journal/csv-trade-card.tsx:37–40` — `currencyFormatter` hardcoded "pt-BR"
- `src/components/journal/csv-import-summary.tsx:72–76` — hardcoded "pt-BR" in loop
- `src/components/fractal-plan/cockpit/` — **16 files** hardcode "pt-BR" in `.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })`

**Sign convention**: All currency formatters correctly prefix gains with `+` and apply the minus sign (via Intl or manual prefix) for losses. Sign placement matches `+R$ 100,00` convention (prefix before currency symbol). ✅

### Percent formatting

**🔴 BLOCKER — Dual `formatPercent` implementations with conflicting conventions**:

1. **`src/lib/formatting.ts:76–85`** — Input is 0-100 range, divides by 100 before passing to `Intl.NumberFormat` with `style: "percent"`. **Correct by Intl.NumberFormat spec**: `formatPercent(12)` → input 12, divided to 0.12, formatted as "12%".

2. **`src/lib/calculations.ts:173–174`** — Input is 0-100 range, **does NOT divide**. Returns `${value.toFixed(decimals)}%`. **Silent bug vector**: `formatPercent(12)` → "12.0%", `formatPercent(0.12)` → "0.1%".

**Consequence**: `pnl-display.tsx` imports from `calculations` (the buggy version); all other sites import from `formatting` or `hooks/use-formatting` (the correct version). A developer copy-pasting `pnl-display.tsx`'s import pattern would get the wrong formatter for new use cases. The two should be consolidated or one deleted.

**Test coverage**: `src/__tests__/lib/pdf/report-pdf-helpers.test.ts` covers the PDF version (which uses `toFixed(1)`, not Intl), but no tests for the `calculations` vs `formatting` discrepancy.

**Rounding note**: `formatting.ts` uses `Intl.NumberFormat` which defaults to "halfExpand" (round half away from zero). `calculations.ts` uses `.toFixed()` which does banker's rounding (round half to even). For 50th percentile values (e.g., 49.95%), they produce different results: `Intl` → "50.0%", `.toFixed()` → "49.9%" (on some runs).

### Decimal precision

**Currency**: 2 decimals (cents) — all formatters use `minimumFractionDigits: 2, maximumFractionDigits: 2`. ✅

**Percent**: varies by context —

- Market display (charts): 1 decimal (`formatChartPercent`, `formatPercent` hook default `decimals=1`)
- Risk metrics (Sharpe, Sortino, drawdown): 2 decimals in some contexts (`src/components/optimize/parameter-heatmap.tsx:596` — `sharpeRatio.toFixed(2)`), 1 in others (`src/components/backtest/backtest-summary-cards.tsx:98` — `sharpeRatio.toFixed(2)`). **Inconsistent but not wrong-number**.

**R-multiple**: 2 decimals (`formatRMultiple`, `formatR`). ✅

**Other metrics** (profit factor, drawdown): 2 decimals via `.toFixed(2)`. **But see Infinity handling below**.

### Sign convention

**Gains (positive money)**: Prefix with `+` across all surfaces — `+R$ 100,00`, `+2.5R`, `+15.2%`. ✅

**Losses (negative money)**: Minus sign applied via Intl or manual `-` prefix — `R$ 100,00` (with `value < 0` suppressed to `Math.abs()` + manual `-`), `-2.5R`, `-3.5%`. ✅

**Note**: `src/lib/formatting.ts:formatCurrencyWithSign` and `formatBrlWithSign` use `value >= 0 ? "+" : ""`, so zero is prefixed `+`. Zero handling is consistent: `+R$ 0,00`. Some tiles display `--` instead of `R$ 0,00` (e.g., `profit-factor-card.tsx:44` shows `--` when null, `+R$ 0,00` when zero). **Minor inconsistency but acceptable**.

### Locale switching (pt-BR vs en)

**🟡 MAJOR — 31 sites hardcode "pt-BR" or "en-US" instead of reading from i18n context**:

| Component                                                    | Issue                                                                                                                                            | Severity |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- |
| `src/components/journal/csv-trade-card.tsx:37,43,68,80`      | 4 hardcoded "pt-BR" formatters; component receives no locale prop                                                                                | MAJOR    |
| `src/components/journal/csv-import-summary.tsx:72`           | Hardcoded "pt-BR" in loop, no locale context                                                                                                     | MAJOR    |
| `src/components/ui/currency-input.tsx:19,24`                 | `toLocaleString("pt-BR")` called in `formatBR` helper, always pt-BR regardless of UI locale                                                      | MAJOR    |
| `src/components/fractal-plan/cockpit/*.tsx`                  | 16 files with `.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })` hardcoded. Component receives `locale` prop but doesn't use it. | MAJOR    |
| `src/components/risk-simulation/day-trace-card.tsx:20,26,34` | Dual formatters for pt-BR and en-US; correctly reads locale and picks the right one. ✅                                                          | Clean    |
| `src/components/dashboard/equity-curve.tsx:126,233`          | Ternary correctly maps `locale === "pt-BR" ? "pt-BR" : "en-US"`. ✅                                                                              | Clean    |
| `src/components/shared/colored-value.tsx:73`                 | `toLocaleString("pt-BR")` hardcoded; receives no locale prop to correct it.                                                                      | MAJOR    |

**Pattern**: Components that receive `locale` from `useLocale()` (next-intl hook) but call `toLocaleString("pt-BR")` don't achieve locale switching — the hardcoded string overrides the context. When a user switches the UI to English, these surfaces stay in Portuguese.

**Workaround in use**: Some components (risk-simulation, equity-curve, dashboard) create dual formatters and pick via ternary. This works but is verbose and easy to forget the pick logic.

**Root cause**: Historically, the system was Portuguese-only. Locale support was added later, and these sites were not updated in the refactor sweep.

### NaN / Infinity / null handling

**🔴 BLOCKER — Infinity values render as literal "Infinity" string on screen**:

When `calculateProfitFactor(profit, loss)` returns `Infinity` (loss = 0, profit > 0), display sites call `.toFixed(2)` directly:

```ts
// src/components/dashboard/kpi/profit-factor-card.tsx:44
value={hasData ? profitFactor.toFixed(2) : "--"}
```

Result: user sees `"Infinity"` in a metric card instead of a formatted value or a guarded display like `"—"` or `"No losses"`.

**Sites affected** (13 instances):

- `src/components/dashboard/kpi/profit-factor-card.tsx:44` — `profitFactor.toFixed(2)`
- `src/components/optimize/freeze-hero-modal.tsx:68,129,134` — `profitFactor.toFixed(2)` (3 instances)
- `src/components/optimize/parameter-heatmap.tsx:586` — `profitFactor.toFixed(2)`
- `src/components/backtest/backtest-summary-cards.tsx:55` — `profitFactor.toFixed(2)`
- `src/components/monte-carlo/stats-preview.tsx:84` — `profitFactor.toFixed(2)`
- `src/components/monte-carlo/v2/monte-carlo-v2-content.tsx:131` — `profitFactor.toFixed(2)`
- `src/components/analytics/holding-period-chart.tsx:95` — `profitFactor.toFixed(2)`
- `src/components/analytics/session-performance-chart.tsx:110` — `profitFactor.toFixed(2)`
- `src/components/reports/weekly-report-card.tsx:199` — `profitFactor.toFixed(2)`
- `src/lib/pdf/report-template.tsx:271,512` — `profitFactor.toFixed(2)` (2 instances)
- `src/lib/coaching/prompt-builder.ts:121` — `profitFactor.toFixed(2)` (in coaching text)

**Guard pattern that should be used** (and is used in some sites like equity-curve):

```ts
value={Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "—"}
```

**Similar risk (not yet triggered)**: `sharpeRatio` and `sortinoRatio` can be `NaN` if volatility is 0. Currently displayed via `.toFixed(2)` without guards in:

- `src/components/optimize/parameter-heatmap.tsx:596` — `sharpeRatio.toFixed(2)`
- `src/components/backtest/backtest-summary-cards.tsx:98` — `sharpeRatio.toFixed(2)`
- `src/components/monte-carlo/strategy-analysis.tsx:213,218` — `.toFixed(2)` on Sharpe/Sortino

No production data yet shows NaN Sharpe (would require zero-variance daily returns), but the pattern is identical to the Infinity issue.

### Rounding consistency

**Intl.NumberFormat vs toFixed**: Different rounding algorithms —

- `Intl.NumberFormat` defaults to "halfExpand" (round half away from zero)
- `.toFixed()` uses banker's rounding (round half to even, depending on JS engine)

**Impact**: At the 0.5 boundary, the two can disagree. E.g., `49.95` → Intl "50.0%", `.toFixed(1)` might give "49.9%". In practice, this is rare (specific values at half-steps), but it means a figure calculated via `Intl` on one surface and via `.toFixed()` on another can visually disagree.

**Where it matters**:

- `src/lib/formatting.ts:formatPercent` uses Intl (correct)
- `src/lib/calculations.ts:formatPercent` uses `.toFixed()` (inconsistent but not canonical)
- `src/lib/formatting.ts:formatChartPercent` uses `.toFixed(1)` directly (for chart labels, acceptable)
- `src/lib/pdf/report-pdf-helpers.ts:formatPercent` uses `.toFixed(1)` (PDF context, acceptable since it's a static render)

**No wrong-number bug found**, but consolidation to Intl across formatters would be cleaner.

---

## Severity-ranked findings

### BLOCKER findings

#### BLOCKER 1 — Infinity renders as literal "Infinity" string (13 sites)

**Issue**: `calculateProfitFactor` returns `Infinity` when loss = 0 and profit > 0. Display sites call `.toFixed(2)` which converts to string "Infinity" instead of being guarded.

**Files**:

- `src/components/dashboard/kpi/profit-factor-card.tsx:44`
- `src/components/optimize/freeze-hero-modal.tsx:68,129,134`
- `src/components/optimize/parameter-heatmap.tsx:586`
- `src/components/backtest/backtest-summary-cards.tsx:55`
- `src/components/monte-carlo/stats-preview.tsx:84`
- `src/components/monte-carlo/v2/monte-carlo-v2-content.tsx:131`
- `src/components/analytics/holding-period-chart.tsx:95`
- `src/components/analytics/session-performance-chart.tsx:110`
- `src/components/reports/weekly-report-card.tsx:199`
- `src/lib/pdf/report-template.tsx:271,512`
- `src/lib/coaching/prompt-builder.ts:121`

**Guard pattern**:

```ts
Number.isFinite(profitFactor) ? profitFactor.toFixed(2) : "—"
```

**Severity rationale**: User sees `"Infinity"` in a metric card — breaks visual trust and is not a valid number display.

---

### MAJOR findings

#### MAJOR 1 — Dual formatPercent implementations with conflicting input conventions

**Issue**: Two functions named `formatPercent` with incompatible behavior —

1. `src/lib/formatting.ts:76–85` (Intl-based) — expects 0-100, divides by 100
2. `src/lib/calculations.ts:173–174` (toFixed-based) — expects 0-100, does NOT divide

**Why it's dangerous**: A developer copying from `pnl-display.tsx` (which imports calculations version) to a new component will silently use the wrong formatter. If they pass the same win-rate value (e.g., 75.5), one formats as "75.5%", the other as "75.5%" — they look the same, but one divided by 100 and one didn't. If the underlying math changes (e.g., new data source provides 0.755 instead of 75.5), the two will diverge visually.

**Files**:

- `src/lib/formatting.ts:76–85` (correct)
- `src/lib/calculations.ts:173–174` (footgun)
- `src/components/journal/pnl-display.tsx:2,49` (imports from calculations, the footgun version)

**Canonical convention**: Input is 0-100, formatter's job is to convert to locale-specific display (with `%` suffix and decimal precision). Intl.NumberFormat with `style: "percent"` expects the decimal form (0-1), so dividing by 100 is correct.

**Fix**: Delete `src/lib/calculations.ts:formatPercent` or rename to `formatPercentRaw` + add JSDoc warning. Update `pnl-display.tsx` to import from `formatting` or use the `useFormatting` hook.

---

#### MAJOR 2 — 31 sites hardcode "pt-BR" or "en-US" locales instead of reading from context

**Issue**: When a user switches the UI language to English, these components still display in Portuguese because they hardcode the locale string.

**Files and count**:

- `src/components/journal/csv-trade-card.tsx:37,43,68,80` (4 instances, hardcoded "pt-BR")
- `src/components/journal/csv-import-summary.tsx:72` (1 instance)
- `src/components/ui/currency-input.tsx:19,24` (2 instances)
- `src/components/fractal-plan/cockpit/` — 16 files with hardcoded "pt-BR"
  - `month-card.tsx:59`
  - `plan-vs-reality.tsx:23,30`
  - `month-week-table.tsx:30`
  - `what-if-calculator.tsx:30`
  - `quarter-month-card.tsx:23`
  - `darf-strip.tsx:38`
  - `eoy-projection-banner.tsx:15`
  - `tax-tab.tsx:142,149`
  - `quarter-plan-vs-reality.tsx:18`
  - `month-darf-row.tsx:30,76,82`
  - `week-row.tsx:13`
  - `caps-strip.tsx:22`
  - `month-capital-popover.tsx:26`
  - `setup-summary-card.tsx:53`
- `src/components/shared/colored-value.tsx:73` (1 instance)
- `src/components/command-center/date-navigator.tsx:17` (correctly conditional — clean)
- `src/components/risk-simulation/day-trace-card.tsx:20,26,34` (correctly dual-formatter approach — clean)

**Example bad pattern**:

```tsx
// src/components/fractal-plan/cockpit/month-card.tsx:59
;(cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
```

**Example good pattern**:

```tsx
// src/components/dashboard/equity-curve.tsx:126
date.toLocaleDateString(locale === "pt-BR" ? "pt-BR" : "en-US", { ... })
```

**Fix**: Replace hardcoded "pt-BR" with `useLocale()` hook and conditional, OR use the `useFormatting` hook which handles locale internally.

---

#### MAJOR 3 — No guard against NaN Sharpe/Sortino rendering

**Issue**: If daily returns have zero variance, `sharpeRatio` becomes `NaN`. Display sites call `.toFixed(2)` which renders as "NaN" string.

**Risk level**: Not yet triggered in production (would require zero-variance trading day), but the pattern is identical to BLOCKER 1 (Infinity).

**Files** (4 instances):

- `src/components/optimize/parameter-heatmap.tsx:596` — `.toFixed(2)` on sharpeRatio
- `src/components/backtest/backtest-summary-cards.tsx:98` — `.toFixed(2)` on sharpeRatio
- `src/components/monte-carlo/strategy-analysis.tsx:213,218` — `.toFixed(2)` on Sharpe/Sortino

**Preventive guard**:

```ts
Number.isFinite(sharpeRatio) ? sharpeRatio.toFixed(2) : "—"
```

---

### MINOR findings

#### MINOR 1 — formatChartPercent uses .toFixed(1) while other percent formatters use Intl

File: `src/lib/formatting.ts:303–306`

**Issue**: `formatChartPercent` uses `.toFixed(1)%` directly, while `formatPercent` uses `Intl.NumberFormat`. At 0.5 boundaries, they round differently (banker's vs halfExpand). For chart labels, the difference is usually invisible, but it's an inconsistency.

**Severity**: MINOR — chart labels are not mission-critical for precision, and the difference is rare.

---

#### MINOR 2 — formatRatio uses .toFixed(2) for non-Infinity values

File: `src/lib/formatting.ts:311–316`

**Issue**: `formatRatio` guards against Infinity (`!Number.isFinite(value)` → "∞") but then calls `.toFixed(2)` on finite values. Other formatters use Intl. Inconsistent but not wrong-number.

**Severity**: MINOR — rounding difference rare; function is used in edge cases (profitability indexes).

---

#### MINOR 3 — Zero currency display varies (R$ 0,00 vs -- vs R$ 0)

Components inconsistently display zero P&L:

- Most cards show `+R$ 0,00` (via `formatCurrency`)
- Some show `--` when value is null but display `+R$ 0,00` when zero
- Fractal-plan cockpit shows `+R$ 0,00`

**Cosmetic inconsistency but not wrong-number**. Convention is sound: zero is treated as "no loss" → `+`.

---

#### MINOR 4 — Percent formatter in calculations.ts has no JSDoc explaining convention

File: `src/lib/calculations.ts:173–174`

**Issue**: Function lacks documentation of input convention (0-100 range, not 0-1). Operator error risk when copy-pasting.

**Fix**: Add JSDoc explaining input range and rounding behavior, OR delete in favor of `formatting.ts` version.

---

#### MINOR 5 — PDF report formatters hardcode pt-BR with no locale parameterization

Files: `src/lib/pdf/report-pdf-helpers.ts:15–20,29`

**Issue**: PDF reports are generated in Portuguese-only (hardcoded "pt-BR" locale). If the system adds PDF export for English-UI users, these will still render in Portuguese.

**Severity**: MINOR — PDF is a static render; adding locale support is a future feature, not a current bug.

---

#### MINOR 6 — Compact currency format uses en-US hardcoded

File: `src/lib/formatting.ts:269–274` (formatCompactCurrency)

**Issue**: `new Intl.NumberFormat("en-US", { notation: "compact", ... })` hardcoded. This is acceptable because "compact" notation is English-centric (K, M, B suffixes), but if the system adds Portuguese compact notation someday, this will be a blocker.

**Severity**: MINOR — compact format is used only in charts/tooltips; not user-facing as main currency display.

---

## Files surveyed

- `src/lib/formatting.ts` (359 LOC, 25 exported functions)
- `src/lib/calculations.ts` (183 LOC, 9 exported functions)
- `src/lib/pdf/report-pdf-helpers.ts` (99 LOC, 5 exported functions)
- `src/hooks/use-formatting.ts` (105 LOC, 1 hook)
- `src/i18n/config.ts` (36 LOC, locale + currency mappings)
- `src/components/journal/*` (csv-trade-card, csv-import-summary, pnl-display, etc.) — 12 files with formatters
- `src/components/fractal-plan/cockpit/*` — 16 files with hardcoded locales
- `src/components/dashboard/*` — 8 files with mixed locale handling
- `src/components/optimize/*` — 12 files displaying metrics
- `src/components/monte-carlo/*` — 6 files with Infinity/NaN risk
- `src/app/actions/*` — 8 files constructing display data

**Total lines scanned**: ~18,000 lines across 187 files

---

## Convention drift candidates

1. **Formatter consolidation**: Two `formatPercent` implementations with different conventions should be consolidated. The `calculations` version should be deleted or marked as deprecated with a clear warning in JSDoc.

2. **Locale parameterization**: 31 hardcoded "pt-BR" sites should be refactored to use `useLocale()` hook + conditional, or wrapped in a helper that reads locale from context. A lint rule could catch new hardcoded "pt-BR" literals in component files.

3. **Special-value handling**: All numeric formatters that display values with `.toFixed()` should wrap with `Number.isFinite()` guard. A helper `toFixedSafe(v, decimals)` could centralize this pattern.

4. **Rounding consistency**: Migrate all `.toFixed()` calls in formatters to `Intl.NumberFormat` for consistency. The PDF and chart contexts can stay on `.toFixed()` since they're static renders, but user-facing metric displays should use Intl.

---

## Verdict

**Wave 3 Zone 17 status**: ⚠️ **Issues found, mostly in display layer**.

- **1 BLOCKER** (Infinity rendering) — breaks metric card visuals
- **3 MAJORs** (dual formatPercent, hardcoded locales, NaN risk) — correctness drift + locale-awareness gap
- **6 MINORs** (documentation, consistency, edge cases) — hygiene

The underlying math (Zones 1–14, Waves 1–2) is sound. The calculation layer passes correct numbers to the display layer. **The display layer has gaps in guarding special values and respecting locale context.**

**Recommended fix strategy**:

1. **URGENT** (BLOCKER): Add `Number.isFinite()` guards to the 13 profitFactor sites and 4 Sharpe/Sortino sites. Guard pattern: `Number.isFinite(value) ? value.toFixed(decimals) : "—"`.
2. **SOON** (MAJOR 1): Delete `src/lib/calculations.ts:formatPercent` or rename + deprecate. Update `pnl-display.tsx` import to use `formatting` version.
3. **SOON** (MAJOR 2): Audit and refactor the 31 hardcoded "pt-BR" sites to use `useLocale()` + conditional or a locale-parameterized wrapper.
4. **LATER** (MAJORs 3 + MINORs): Consolidate rounding to Intl.NumberFormat across all user-facing formatters; add JSDoc to explain input conventions.

All fixes are localized to display layer; no changes to math or data flow required.
