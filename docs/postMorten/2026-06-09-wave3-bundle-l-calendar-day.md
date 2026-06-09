# Post-Mortem: Wave 3 Bundle L — Unify on Calendar Day Trading-Day Definition

**Date**: 2026-06-09  
**Scope**: Wave 3 Bundle L (Z16-3 blocker fix)  
**Commit**: To be recorded after test verification  
**Severity**: MAJOR (architectural decision, silent metric divergence in prior state)

---

## Executive summary

**The system had two conflicting definitions of "trading day":**

- **Hawks engine** (`day-grouper.ts`): Filtered to 09:00–18:00 BRT session hours only
- **Reports/analytics** (`analytics.ts`): Included all trades on a calendar day (00:00–23:59 BRT)

This silent divergence caused **audit mismatches**: a trade at 18:15 BRT could be dropped by Hawks but included in reports, causing backtested results and journal PnL to disagree.

**The user's design choice: calendar day (00:00–23:59 BRT).**

Rationale: The journal is the source-of-truth record of every trade. Journal completeness (not "pure session-only") is the north star. Grouping by calendar day keeps all layers unified on the same bucket.

**The fix**: Removed the session-hour filter from `day-grouper.ts:51–52`, so the Hawks engine now processes every candle on a given BRT calendar day, matching what reports do.

---

## Why the system had two definitions

### Genesis: session-only optimism (v0–v1)

`day-grouper.ts` was written early in Axion development when:

1. The Hawks engine was considered the "canonical" backtest engine
2. Trading-session-only processing seemed reasonable for filtering "noise" (pre-market + after-hours illiquidity)
3. The codebase hadn't yet added extended-hours support

The hardcoded filter `if (brt.hhmm < 900 || brt.hhmm >= 1800) continue` was a default optimization.

### Divergence: reports added without coordinating

When `analytics.ts` and the journal reporting layer were added, they queried trades across the full calendar day (`gte(trades.entryDate, monthStart)`) without applying the session filter. This was correct for the journal (report everything) but created silent divergence with Hawks.

### The blocker: two parts of the system agreed to disagree

- `day-grouper.ts` said: "day = 09:00–18:00 BRT"
- `analytics.ts` said: "day = 00:00–23:59 BRT"
- **Result**: A trade at 18:15 BRT would not appear in Hawks backtests but WOULD appear in journal summaries and analytics tiles. Audit divergence.

---

## The user's design choice: calendar day

**Decision**: Axion's canonical definition of "trading day" is the **BRT calendar day (00:00–23:59)**, not the regular session (09:00–18:00).

**Rationale**:

1. **Journal completeness**: The journal is the user's single source of truth. Every trade must be recorded and reportable, regardless of time-of-day. Filtering after-hours trades out of backtest would contradict this.
2. **Audit unity**: All layers (Hawks engine, reports, analytics) group on the same key. No divergence.
3. **Extensibility**: If Axion ever adds overnight markets (US futures, crypto, extended BR sessions), the calendar-day convention scales. Session-only does not.

---

## The fix

### What changed

1. **Removed the session filter** from `src/lib/backtest/day-grouper.ts` (lines 50–52)
   - Old: `if (brt.hhmm < TRADING_START_HHMM || brt.hhmm >= TRADING_END_HHMM) continue`
   - New: Every candle on a BRT calendar day is included in that day's bucket

2. **Updated JSDoc** of `groupCandlesByDay()` to clarify it now groups by calendar day (00:00–23:59), not session hours

3. **Removed unused imports** (`SESSION_BOUNDARIES` constants were only used for the session filter)

4. **Updated `SESSION_BOUNDARIES` JSDoc** in `src/lib/dates.ts`
   - Added note: "Informational, not a filter. As of Bundle L, use only for UI labels (e.g., after-hours badges), not for filtering."

5. **Documented the convention** in `docs/code-conventions.md`
   - New section "Trading day = BRT calendar day (00:00–23:59)"
   - Explains the choice, rationale, and that code using `SESSION_BOUNDARIES` as a filter is a bug

6. **Added day-grouper unit tests** (`src/__tests__/lib/backtest/day-grouper.test.ts`)
   - Explicit test: "after-hours candles on 18:15 BRT are now included in the day bucket (not filtered)"
   - Tests for pre-market (00:00–09:00 BRT) inclusion as well
   - Verification that timestamp + candleIndex sorting still works

### Code locations touched

- `src/lib/backtest/day-grouper.ts` — removed session filter and imports
- `src/lib/dates.ts` — updated `SESSION_BOUNDARIES` JSDoc
- `docs/code-conventions.md` — added "Trading day" convention section
- `src/__tests__/lib/backtest/day-grouper.test.ts` — new test file, 6 tests

---

## Safety net: Hawks v0 parity baseline

**Test**: `src/__tests__/lib/backtest/parity-hawks-baseline.test.ts`

**Before fix**: Passed (5/5 tests)  
**After fix**: Passed (5/5 tests)

The parity test verifies Hawks v0 baseline config fields (`fireCooldownBricks`, `wave1MinBricks`, `retracementMinBricks`) are present and correct. It does NOT test trade counts directly, but it ensures the baseline recipe is unchanged.

**Full test suite**: 2129 tests pass (includes new day-grouper tests)

---

## Blast radius and behavior change

### New behavior: after-hours candles now processed

Any backtest run will now include after-hours candles (post-18:00 BRT) in the Hawks engine's daily processing. For most users, this means:

- **No change**: Most trading activity is 09:00–18:00 BRT
- **Marginal effect**: Some traders with after-hours scalping will see additional trades in backtest results
- **Positive**: Audit divergence eliminated; journal and backtest now agree on what trades are in a day

### Backwards-compat note

Existing backtest results / cached outputs will NOT change (they're snapshots). Future backtests on the same recipe will include more candles (if after-hours data exists), so PnL/metrics may shift slightly. This is the intended behavior change.

### Protection: no other code needs updates

The filter removal is **localized** to `day-grouper.ts`. Downstream code (Hawks engine, metrics, reports) does not care whether a candle is in session or after-hours — it only reads the `dayKey` the grouper assigned.

---

## Known side effects

### Session-boundary surfaces (labels, UI annotation)

Code that uses `SESSION_BOUNDARIES` to **label** or **annotate** (e.g., "This candle is after-hours") is still correct. Code that uses it to **filter** is now a bug (but the intent was only ever that one filter in `day-grouper.ts`, now removed).

Surfaces to check if they exist:

- After-hours badges / labels on candle charts
- VWAP anchor-to-session-only toggle
- Session-specific performance analytics

None of these were in scope for this fix; if they exist and use `SESSION_BOUNDARIES.endHhmm` as a filter, they remain unchanged (no `day-grouper.ts` to parallelize with them yet).

---

## Design review: why calendar day won, not session day

**The losing option: session-only (09:00–18:00)**

Pros:

- Reduces "noise" from extended-hours
- Hawks engine was architected around it

Cons:

- **Breaking change**: Every after-hours trade disappears from backtest results
- **Audit divergence**: Users see trades in the journal but not in backtests
- **Journal lie**: Reports would exclude after-hours activity, contradicting journal completeness
- **Doesn't scale**: Future overnight markets would need a parallel code path

**The winning option: calendar day (00:00–23:59)**

Pros:

- Audit agreement: journal, reports, and backtest all use the same grouping
- Journal truth: nothing is hidden from backtests
- Scales to future markets (overnight, crypto, extended BR)
- Single source of truth on what "day" means

Cons:

- Backtest results shift slightly for users with after-hours trades (marginal user impact)
- Requires `day-grouper.ts` change (done)

**Verdict**: Journal completeness > session purity. Calendar day wins.

---

## Deployment checklist

- [x] Code changes complete
- [x] Tests passing (2129/2129, including 6 new day-grouper tests)
- [x] Convention documented
- [x] Post-mortem written
- [ ] Commit to be created (awaiting verification)
- [ ] No breaking schema changes (filter is code-only)
- [ ] No new dependencies added
- [ ] Lint + tsc — pre-existing unrelated errors only

---

## Regression strategy

If a future user reports "my backtest changed!", the response is:

1. **Expected behavior**: We removed a session-hour filter. Your after-hours trades now appear in backtests.
2. **Journal check**: Run `SELECT entryDate FROM trades WHERE DATE(entryDate) = ? ORDER BY entryDate`. Do after-hours entries exist?
3. **If yes**: This is correct behavior. Your backtest now matches your journal.
4. **If no**: Bug — escalate with trade data.

---

## Next steps (not in this bundle)

1. **Bundle M**: Update 31 hardcoded `"pt-BR"` locale sites to use `useFormatting()` hook
2. **Bundle K** (PROTECTED): Fix `recompute-month.ts:128–130` to use `getBrtDateParts()` for day-same detection (latent, not current bug)
3. Future: If any after-hours-specific analytics are added, they can reference `SESSION_BOUNDARIES.endHhmm` for UI labels without needing a filter

---

## Decision log

| Decision                                  | Rationale                                                   | Owner             |
| ----------------------------------------- | ----------------------------------------------------------- | ----------------- |
| Calendar day (00:00–23:59)                | Journal completeness; audit agreement                       | User (2026-06-09) |
| Remove session filter in `day-grouper.ts` | Implement calendar-day decision                             | This PR           |
| Keep `SESSION_BOUNDARIES` constant        | Informational use (UI labels); don't remove useful metadata | This PR           |
| Add day-grouper tests                     | Explicitly codify new behavior (after-hours inclusion)      | This PR           |

---

## Audit trail

- **Wave 3 Master (2026-06-09)**: Identified Z16-3 blocker (day-grouper vs analytics divergence)
- **Wave 3 Zone 16 report (2026-06-09)**: Recommended calendar-day vs session-day decision
- **Bundle L spec (2026-06-09)**: User chose calendar day; this PR implements it
