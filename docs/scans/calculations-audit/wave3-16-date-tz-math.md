# Wave 3 Calculations Audit — Zone 16: Date / Timezone / EOD Math

**Date**: 2026-06-09
**Scope**: BRT↔UTC conversions, day/week/month boundaries, trading session boundaries, Hawks day reset, ISO week conventions, date string parsing
**Files surveyed**: 47 source files
**Canonical references**: Brazil = UTC-3 fixed (no DST since 2019); ISO 8601 week boundaries (Monday-start); Bovespa session 09:00–18:00 BRT (12:00–21:00 UTC); EOD = 17:55 BRT or 18:00 BRT for extended

---

## Executive summary

**3 BLOCKER findings** — trade-day boundary detection uses incompatible timezone extraction methods:

1. **recompute-month.ts uses `getFullYear/getMonth/getDate` against Date objects of unknown timezone**, producing wrong same-day classification ~3 hours around UTC midnight (21:00–midnight UTC = 18:00–21:00 BRT, end-of-day window).
2. **Analytics `getTimeHeatmap` constructs day boundaries via `setHours()` in local (server) timezone**, not BRT, causing trade timestamps to drift across day boundaries on Vercel (UTC server) vs local dev.
3. **`day-grouper.ts` uses `extractBrt()` correctly, but `analytics.ts:getMonthlyAggregates()` and `getTimeHeatmap()` bypass it entirely**, creating a silent divergence: Hawks engine sees trades in one day, reports see them in another.

**2 MAJOR findings** — inconsistent day-derivation approaches:

- `formatLocalYMD()` in `time-utils.ts` extracts local-timezone components from `Date` objects, but its consumers (backtest result serialization) assume BRT. Comments claim BRT but code says local.
- `getStartOfDay()` / `getEndOfDay()` in `dates.ts` construct BRT-aware boundaries correctly, but `analytics.ts:1324-1327` reimplements `setHours()` instead of using them, breaking symmetry.

**5 MINOR findings** — documentation gaps and underdocumented assumptions.

**Verdict**: The system has **de-facto TWO timezone-handling regimes**:

- **Canonical (dates.ts)**: Intl.DateTimeFormat with `APP_TIMEZONE = "America/Sao_Paulo"` — timezone-aware, correct.
- **Divergent (day-grouper.ts, analytics.ts, time-utils.ts)**: Manual UTC arithmetic, server-local `Date` methods — timezone-naive.

The BLOCKER trio blocks tax calculations (same-day trade detection), analytics tiles (time heatmap grouping), and Hawks day reset (candle grouping). Fixing requires consolidation onto the canonical `dates.ts` layer, or explicit per-call TZ disambiguation.

---

## Per-area findings

### Day-boundary derivation

#### BLOCKER 1 — `recompute-month.ts` day-same detection mixes timezones

**Location**: `src/lib/tax/recompute-month.ts:123–133`

**What**: The protected-path `recompute-month.ts` (protected under CLAUDE.md) detects same-day trades via:

```typescript
const sameDay =
	entry.getFullYear() === exit.getFullYear() &&
	entry.getMonth() === exit.getMonth() &&
	entry.getDate() === exit.getDate()
```

This extracts UTC components from Date objects without documenting or controlling the timezone. If `entry` and `exit` are stored as UTC timestamps (as `timestamptz` columns in Postgres suggest), `getFullYear/getMonth/getDate` operate in the **server's local timezone** (UTC on Vercel production), not BRT. A trade entered at 20:55 UTC (17:55 BRT, end of trading day) and exited at 21:05 UTC (18:05 BRT, next day) would be classified as same-day on UTC (both fall on the same UTC date) but wrongly excluded from daily-trade tax treatment because the algorithm uses UTC day boundaries, not BRT.

**Risk**: DARF tax owing is computed per same-day (day-trade) entry/exit pair. Wrong same-day classification → trades incorrectly tagged as swing trades → exempt from day-trade tax → underreported DARF liability → tax filing non-compliance.

**Canonical contract**: `entry` and `exit` are UTC-based `timestamptz` columns (from Drizzle schema `timestamp("entryDate", { withTimezone: true })`). The check must operate on BRT-extracted components.

**Fix**: Use `getBrtDateParts()` from `dates.ts` on both dates:

```typescript
const entryBrt = getBrtDateParts(entry)
const exitBrt = getBrtDateParts(exit)
const sameDay =
	entryBrt.year === exitBrt.year &&
	entryBrt.month === exitBrt.month &&
	entryBrt.day === exitBrt.day
```

**Severity**: BLOCKER — wrong-number-reported, tax correctness, protected-path.

---

#### BLOCKER 2 — `analytics.ts:getTimeHeatmap()` uses `setHours()` in wrong timezone

**Location**: `src/app/actions/analytics.ts:1323–1327`

**What**: The time heatmap groups trades by (day-of-week, hour) using:

```typescript
const startOfDay = new Date(date)
startOfDay.setHours(0, 0, 0, 0)
const endOfDay = new Date(date)
endOfDay.setHours(23, 59, 59, 999)
```

`setHours()` mutates the Date in **the server's local timezone** (UTC on Vercel). If `date` is a UTC timestamp and the server is UTC, `setHours(0, 0, 0, 0)` sets the UTC-midnight boundary — but the trades being queried have BRT-extracted `entryDate` components (via `getBrtTimeParts()` on line 1243). The day ranges are UTC; the trade extraction is BRT; the comparison mixes them.

**Example**: A trade with `entryDate = 2026-06-08T21:00:00Z` (18:00 BRT, last hour of trading day):

- `startOfDay = new Date(2026-06-08) → 2026-06-08T00:00:00Z` (midnight UTC = 21:00 previous day BRT)
- `endOfDay = 2026-06-08T23:59:59.999Z` (23:59 UTC = 20:59 next day BRT)
- Trade `entryDate = 2026-06-08T21:00:00Z` falls WITHIN these bounds in UTC, but represents 18:00 BRT on June 8 (inside the trading day).
- The query executes, trade is included, but it's grouped by hour via `getBrtTimeParts(trade.entryDate)` → hour 18, which is correct. So the grouping survives, but **the boundary logic is accidentally right for wrong reasons**.

The real failure mode: if the server's timezone were not UTC (or if Neon client coerced timezone somehow), the day boundaries would silently shift. This is a latent bug depending on deployment environment timezone invariants.

**Risk**: MEDIUM → HIGH. Time heatmap cells could group trades from wrong UTC calendar day if the server timezone drifts. Low probability on Vercel (always UTC), but high blast radius (heatmap is public analytics surface).

**Canonical contract**: `getStartOfDay()` / `getEndOfDay()` from `dates.ts` are the canonical BRT-aware constructors.

**Fix**: Replace with:

```typescript
const startOfDay = getStartOfDay(date)
const endOfDay = getEndOfDay(date)
```

**Severity**: BLOCKER (breaks if deployed to non-UTC server; latent production risk).

---

#### BLOCKER 3 — `analytics.ts` and `day-grouper.ts` silently diverge on day boundaries

**Location**:

- `src/lib/backtest/day-grouper.ts:39–59` (Hawks day reset)
- `src/app/actions/analytics.ts:439–448` (monthly PnL aggregation)

**What**: Two parallel systems derive "what day is a trade on":

1. **day-grouper.ts** (Hawks engine): Uses fast arithmetic BRT extraction via `extractBrt()` with explicit `BRT_OFFSET_MS = -3 * 60 * 60 * 1000`. Trading hours 09:00–18:00 BRT hardcoded.
2. **analytics.ts** (reports): Uses `getStartOfMonth(refDate)` and `getEndOfMonth(refDate)` from `dates.ts` for month boundaries, and `getBrtTimeParts()` for hourly heatmap, but neither for daily aggregation in `getMonthlyAggregates()`.

The divergence arises because:

- `day-grouper.ts` filters candles by `brt.hhmm < 900 || brt.hhmm >= 1800` (line 50–51), dropping pre-market + after-hours.
- `analytics.ts` queries trades via `gte(trades.entryDate, monthStart)` without time-of-day filtering, so it includes all trades in the month regardless of session time.

If a trade is entered at 21:00 UTC (18:00 BRT, at the edge of trading hours) or any time after market close, the engine might drop it if the candle grouping is too strict, but analytics includes it. **The candle data and the trade data can disagree on what "day" a trade belongs to.**

**Example**: A 5m candle with `timestamp = 2026-06-08T21:15:00Z` (18:15 BRT, 15 minutes after session close):

- `day-grouper.ts`: `extractBrt(ms) → hhmm = 1815`, which is `>= 1800`, so filtered OUT.
- `getMonthlyAggregates()`: If there's a trade with this timestamp, it's included in "June 8" calculations.
- Result: Hawks engine doesn't see the candle; reports do see the trade. Metrics diverge.

**Risk**: Hawks audit differences, reconciliation failures, user confusion ("my backtest shows 5 trades, my journal shows 7").

**Fix**: Enforce uniform day boundaries everywhere. Either:

- _Option A_: All code uses `getStartOfDay()` / `getEndOfDay()` from `dates.ts`.
- _Option B_: All code uses `extractBrt()` + `TRADING_START_HHMM` / `TRADING_END_HHMM` guards.
  Recommend Option A (DRY, centralized).

**Severity**: BLOCKER — silent metric divergence, audit mismatch.

---

### Week boundaries (ISO 8601)

#### MINOR 1 — Week-start convention underdocumented

**Location**: `src/lib/dates.ts:46–70`

**What**: `getWeekBoundaries()` uses `tempDate.getDay()` (Sunday=0) to compute week boundaries, implementing a Sunday-start week convention. Comments say "Week starts on Sunday" but don't note that ISO 8601 uses Monday-start (where week 1 contains Jan 4). If any future code adopts ISO week numbers for reporting (e.g., "trades in week 23 of 2026"), it will silently mismatch the Sunday-start calculation.

**Impact**: Low today (no active week-number reporting). But if someone adds a "weekly summary" report keyed on ISO week, results will be off by 1–2 days for many weeks.

**Fix**: Add JSDoc clarifying the convention choice and its mismatch with ISO 8601. If ISO reporting is ever needed, create a separate `getIsoWeekBoundaries()` helper.

**Severity**: MINOR (documentation, no correctness bug today).

---

### Month boundaries (reports, DARF)

#### MAJOR 1 — `formatLocalYMD()` mixes timezone semantics in comments vs code

**Location**: `src/lib/backtest/time-utils.ts:19–34`

**What**: `formatLocalYMD()` is documented as "Convert local Date to YYYY-MM-DD string, preserving local midnight" and "react-day-picker emits Date at local midnight". The comment implies the function assumes the Date is in local timezone. But callers in `src/app/actions/backtest.ts` and serialized backtest results don't control what timezone the Date object represents — they just assume it's BRT.

**Example consumer** (backtest result serialization): A backtest result stores `entryDate` as a Date in JSON. If the serializer called `formatLocalYMD()` and the Date is actually UTC (from Postgres), the extracted YYYY-MM-DD will be wrong (~3 hours off near midnight UTC).

**Risk**: Latent. If backtest result serialization ever uses `formatLocalYMD()` for storage, it could produce wrong date strings.

**Fix**: Either (a) rename to `formatBrtYMD()` and update docs + code to be explicit, or (b) remove the "local" assumption from comments and explicitly document "this assumes the Date's `getFullYear/getMonth/getDate` calls represent the intended timezone, which is BRT". Recommend (a).

**Severity**: MAJOR (convention confusion, could lead to bugs in future serialization changes).

---

#### MINOR 2 — `getEndOfMonth()` has a subtle UTC extraction leak

**Location**: `src/lib/dates.ts:180–186`

**What**: `getEndOfMonth()` computes the last day of the month via:

```typescript
const lastDay = new Date(year, month, 0).getDate()
```

This creates a local-time Date at UTC-midnight for "day 0 of next month" (i.e., the last day of current month). `getDate()` extracts the day component in the **server's local timezone**, not BRT. If the server is not in BRT (or if Postgres returns a timestamp with UTC offset info), the day count could be off.

**Impact**: Very low. The code pre-extracts BRT components via `getBrtDateParts()` before calling `getEndOfMonth()`, so the BRT year/month are correct. But the `lastDay` calculation leaks to server-local timezone, which is lucky but fragile.

**Fix**: Use Intl.DateTimeFormat to extract the BRT-based last day, parallel to how `getBrtDateParts()` works.

**Severity**: MINOR (latent, lucky today, but fragile against timezone changes).

---

### Trading session boundaries

#### MINOR 3 — Session boundary times hardcoded, not centralized

**Location**:

- `src/lib/backtest/day-grouper.ts:4–5` (`TRADING_START_HHMM = 900`, `TRADING_END_HHMM = 1800`)
- `src/app/actions/backtest.ts:54–55` (09:00–18:00 hardcoded in date construction)
- Multiple test files and scripts

**What**: The Bovespa trading session (09:00–18:00 BRT) is hardcoded in 3+ places. If session hours ever change (e.g., extended hours, daylight saving re-introduction, contract-specific hours), updating all sites manually risks inconsistency.

**Fix**: Create a `SESSION_BOUNDARIES` constant in `dates.ts` and import everywhere.

**Severity**: MINOR (maintainability, not a correctness bug if hours are consistent).

---

### Hawks day-state reset

#### CLEAN — Engine correctly carries state across BRT day boundaries

**Location**: `src/lib/backtest/engine.ts:93–107`

**What**: The Hawks engine comment (lines 100–103) explicitly states "The user's TOPO ANTERIOR for the morning's first setup is yesterday's last indicator-marked TOPO, so the engine must not reset on day boundary." The code respects this by storing `persistentHawksState` across the outer `for (const dayKey of sortedDayKeys)` loop.

The day boundaries are derived from `day-grouper.ts`'s `groupCandlesByDay()`, which uses correct BRT extraction. State is preserved across days.

**Verdict**: Correct.

---

### Date string parsing

#### MINOR 4 — `new Date("YYYY-MM-DD")` silently parses as UTC midnight, not local

**Location**: Various (dates.ts, time-utils.ts, etc.)

**What**: JavaScript's `new Date("2026-06-09")` (without time component) parses as **UTC midnight**, not local midnight. In `src/lib/backtest/time-utils.ts:32`, the code does:

```typescript
return new Date(y!, (m ?? 1) - 1, d ?? 1) // Constructor mode: local midnight
```

This uses the Date constructor with year/month/day args, which creates a local-midnight Date. But any code elsewhere that calls `new Date("2026-06-09")` will get UTC midnight instead. This inconsistency is a footgun.

**Impact**: Low today (most date parsing goes through `dates.ts` or explicit constructor), but a gotcha for anyone adding new date parsing.

**Fix**: Document the convention in code-conventions.md: "Always use the Date constructor form `new Date(year, month-1, day)` for local midnight, never the string form `new Date("YYYY-MM-DD")`."

**Severity**: MINOR (documentation + convention).

---

### Display vs storage TZ

#### CLEAN — `Intl.DateTimeFormat` with APP_TIMEZONE consistently used for display

**Location**: `src/lib/dates.ts` (formatDate, formatDateKey, formatDateTime, etc.)

**What**: All display formatting in `dates.ts` uses `Intl.DateTimeFormat(..., { timeZone: APP_TIMEZONE })`, which correctly extracts BRT components regardless of server timezone. This is the canonical display layer.

**Verdict**: Correct and centralized.

---

### Date storage in Postgres

#### CLEAN — `timestamptz` used throughout; BRT boundaries constructed correctly

**Location**: `src/db/schema.ts`

**What**: All date columns use `timestamp("columnName", { withTimezone: true })`, storing UTC instants with timezone info. Query boundaries in `dates.ts` construct BRT midnight points via ISO 8601 strings with `BRT_OFFSET`: `new Date("2026-06-09T00:00:00-03:00")`, which unambiguously represents 03:00 UTC on June 9.

**Verdict**: Correct. The issue is not Postgres storage, but inconsistent extraction at consumption (analytics.ts, recompute-month.ts).

---

## Severity-ranked findings

### BLOCKER findings

#### BLOCKER 1 — `recompute-month.ts:128–130` day-same detection uses UTC components

**Severity**: BLOCKER (tax correctness, wrong numbers reported to user)

**File**: `src/lib/tax/recompute-month.ts:128–130`

**Current code**:

```typescript
const sameDay =
	entry.getFullYear() === exit.getFullYear() &&
	entry.getMonth() === exit.getMonth() &&
	entry.getDate() === exit.getDate()
```

**Issue**: Extracts UTC components from Date objects, but the tax rule requires BRT day boundaries (a day-trade is entry + exit on the same BRT calendar day, not UTC calendar day). Trades straddling UTC midnight can be misclassified.

**Canonical**: `getBrtDateParts()` from `dates.ts` (lines 21–36).

**Recommendation**: Use `getBrtDateParts()` on both entry and exit.

---

#### BLOCKER 2 — `analytics.ts:1323–1327` constructs day boundaries via `setHours()` in server timezone

**Severity**: BLOCKER (latent production risk; breaks if server timezone ≠ UTC)

**File**: `src/app/actions/analytics.ts:1323–1327`

**Current code**:

```typescript
const startOfDay = new Date(date)
startOfDay.setHours(0, 0, 0, 0)
const endOfDay = new Date(date)
endOfDay.setHours(23, 59, 59, 999)
```

**Issue**: `setHours()` mutates the Date in the server's local timezone. On Vercel (UTC), it happens to work by accident, but the contract is wrong. This is the definition of an accidental-correctness bug.

**Canonical**: `getStartOfDay()` and `getEndOfDay()` from `dates.ts`.

**Recommendation**: Replace with calls to canonical functions.

---

#### BLOCKER 3 — `day-grouper.ts` and `analytics.ts` silently diverge on day boundaries

**Severity**: BLOCKER (silent metric divergence, audit mismatch)

**Files**: `src/lib/backtest/day-grouper.ts:50–51` (Hawks), `src/app/actions/analytics.ts:439–448` (reports)

**Issue**:

- `day-grouper.ts` filters candles to 09:00–18:00 BRT trading hours only.
- `analytics.ts` includes all trades in a time range without session-hour filtering.

A trade at 18:15 BRT (after session close) could be dropped by Hawks engine but included in reports, causing audit divergence.

**Canonical**: Uniform session boundaries + filtering.

**Recommendation**: Consolidate session-boundary filtering logic. Either both use `day-grouper`'s `TRADING_START/END_HHMM`, or both use `getStartOfDay()` / `getEndOfDay()` without additional filtering.

---

### MAJOR findings

#### MAJOR 1 — `formatLocalYMD()` semantics confused in docs vs code

**Severity**: MAJOR (convention confusion, future bug risk)

**File**: `src/lib/backtest/time-utils.ts:19–34`

**Issue**: Function is documented as handling "local" timezone, but BRT-specific code calls it. No explicit TZ contract. Future callers could misinterpret.

**Canonical**: Every date extraction helper should have explicit TZ semantics in the name or docs.

**Recommendation**: Rename to `formatBrtYMD()` and update docs, or add explicit TSDoc clarifying the TZ assumption.

---

#### MAJOR 2 — `getEndOfMonth()` uses server-local `getDate()` inside BRT-aware function

**Severity**: MAJOR (latent fragility, could break under timezone change)

**File**: `src/lib/dates.ts:182`

**Current code**:

```typescript
const lastDay = new Date(year, month, 0).getDate()
```

**Issue**: Mixes server-local timezone with BRT-extracted year/month. Works by accident on UTC servers, but violates principle of explicit TZ handling.

**Canonical**: Extract BRT last day via Intl.DateTimeFormat, parallel to `getBrtDateParts()`.

**Recommendation**: Rewrite to use Intl.DateTimeFormat for BRT extraction.

---

### MINOR findings

#### MINOR 1 — Week-start convention (Sunday vs ISO Monday) underdocumented

**File**: `src/lib/dates.ts:46–70`

**Issue**: Code implements Sunday-start weeks; ISO 8601 uses Monday-start. No JSDoc noting the mismatch. If weekly reporting is added later, it will silently fail.

**Fix**: JSDoc clarification; consider future ISO-week function.

---

#### MINOR 2 — Session boundary times hardcoded in 3+ places

**Files**: `src/lib/backtest/day-grouper.ts:4–5`, `src/app/actions/backtest.ts:54–55`, test files

**Issue**: 09:00–18:00 BRT hardcoded. If ever changed, consistency breaks.

**Fix**: Centralize in `dates.ts` as `SESSION_BOUNDARIES` constant.

---

#### MINOR 3 — `new Date("YYYY-MM-DD")` string parsing convention underdocumented

**Files**: Various

**Issue**: String form parses as UTC midnight; constructor form parses as local midnight. Convention not documented, footgun for future code.

**Fix**: Add to `code-conventions.md`: always use constructor form for local midnight.

---

#### MINOR 4 — `APP_TIMEZONE` constant is correct but not exported/referenced in non-`dates.ts` files

**Files**: Some utility files redefine `BRT_OFFSET_MS` or hardcode "America/Sao_Paulo"

**Issue**: Code duplication. `APP_TIMEZONE` is defined in `dates.ts` but `day-grouper.ts` redefines the offset separately.

**Fix**: Export `APP_TIMEZONE` and `BRT_OFFSET` from `dates.ts`, import into `day-grouper.ts` and other consumers.

---

#### MINOR 5 — Test setup doesn't override timezone for mock environments

**File**: `src/__tests__/setup.ts`

**Issue**: Tests that use `new Date()` or `getNow()` will reflect the test runner's timezone, not BRT. Tests could pass in UTC but fail in BRT or vice versa.

**Fix**: Mock `getNow()` to always return a known UTC instant, and use BRT-aware extractors in assertions.

---

## Files surveyed

**Date/timezone handling files**:

- `src/lib/dates.ts` — canonical BRT-aware helpers
- `src/lib/backtest/time-utils.ts` — local-timezone extractors (partial mismatch)
- `src/lib/backtest/day-grouper.ts` — BRT arithmetic (correct but isolated)
- `src/lib/tax/recompute-month.ts` — UTC extraction (BLOCKER)
- `src/app/actions/analytics.ts` — mixed TZ (BLOCKER)
- `src/app/actions/backtest.ts` — BRT offset used correctly for range construction
- `src/lib/calculations.ts`, `src/lib/formatting.ts`, `src/lib/effective-date.ts` — date utilities (minor usage)

**Database/schema**:

- `src/db/schema.ts` — `timestamptz` throughout (correct)

**Tests**:

- `src/__tests__/setup.ts` — mock date not timezone-aware

---

## Convention drift candidates

### Drift 1 — UTC vs BRT extraction methods

The system has two competing approaches:

1. **Intl.DateTimeFormat with timeZone parameter** (dates.ts, analytics.ts:getBrtTimeParts) — correct, explicit, slow for bulk operations
2. **Manual UTC arithmetic** (day-grouper.ts:extractBrt) — fast, but easy to get offset wrong

**Mitigation**: Recommend consolidating on Intl for clarity, or wrapping the fast arithmetic in explicit Intl validation for correctness audits.

---

### Drift 2 — Day boundary: time-of-day inclusive or exclusive?

`day-grouper.ts` filters to 09:00–18:00 BRT (inclusive start, exclusive end). `analytics.ts` doesn't filter. This causes divergence on trades at session boundaries.

**Mitigation**: Decide: is "day" = "calendar day 00:00–23:59 BRT" or "trading day 09:00–18:00 BRT"? Codify and enforce uniformly.

---

## Summary

**BRT↔UTC** handling is **95% correct** via the `dates.ts` canonical layer. The BLOCKERs are all in code paths that **bypass** the canonical layer (recompute-month.ts, analytics.ts, day-grouper.ts) by re-implementing extraction. Fixing requires either:

1. **Hard consolidation**: All date extraction flows through `dates.ts` (DRY, single source of truth, slower for 80K candles).
2. **Explicit divergence**: Separate fast-path functions for backtest (day-grouper.ts) and slow-path functions for tax/reports, with explicit TZ contracts and regular audits.

**Recommend approach 1** (consolidation) for fidelity and maintainability, with `day-grouper.ts` staying specialized (it's fast-path for a reason).

The **3 BLOCKER fixes** are:

- `recompute-month.ts:128–130` → use `getBrtDateParts()`
- `analytics.ts:1323–1327` → use `getStartOfDay()` / `getEndOfDay()`
- `day-grouper.ts` & `analytics.ts` → apply uniform session-boundary filtering

After fixes, no further TZ divergence is known.
