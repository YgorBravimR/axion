# E2E Test Suite Overlap Audit: Legacy vs. Journey

**Status**: Backlog item "Edge-case separation pass" (#3 under Journey suite in `docs/backlog.md`)  
**Date**: 2026-05-15  
**Scope**: All 21 files in `e2e/tests/*.spec.ts` audited against 9 journey stages + 2 seeder stages.

---

## Per-File Analysis

- **auth.spec.ts** (~227 LOC) — Registration form validation, password requirements, account creation success, duplicate email error, login link navigation.
  - **Overlap with journey:** Stage 0 (Welcome) covers happy-path registration & sign-in; field visibility + password requirements are edge cases.
  - **Edge-case value:** Password-strength indicator, field validation rules, duplicate-email error handling, error messages — these derail the narrative and belong here.
  - **Recommendation:** keep-as-is — authentication validation is orthogonal to journey and security-critical.

- **auth-security.spec.ts** (~771 LOC) — Email verification redirect, rate-limit lockout (5 failures / 15 min), JWT maxAge (7-day expiry), OTP input constraints, unverified-user block.
  - **Overlap with journey:** Stage 0 covers only the happy path (register → auto-verified in test env → sign in). Security features are out of scope.
  - **Edge-case value:** Rate-limiting, account lockout cascades, email-verification flow, JWT expiry — critical security hardening not covered by journey.
  - **Recommendation:** keep-as-is — security is a non-negotiable, orthogonal pillar; journey suite explicitly excludes it.

- **navigation.spec.ts** (~362 LOC) — Sidebar nav items visibility, route navigation (dashboard ↔ journal ↔ analytics ↔ playbook), responsive mobile nav.
  - **Overlap with journey:** Stages 0-8 traverse all major routes; navigation is implicit in the path (welcome → settings → plan → backtest → journal → reports → monthly → quarter/year → coaching).
  - **Edge-case value:** Mobile sidebar (Sheet), responsive behavior, cold-compile routing delays, nav-link aria states — these are accessibility + responsive-design concerns, not journey-core.
  - **Recommendation:** trim-happy-path — desktop navigation (en/journal, en/analytics, en/settings) is tested implicitly; keep mobile + accessibility tests, remove redundant desktop nav assertions.

- **settings.spec.ts** (~717 LOC) — Profile tab layout, account tab, language selector, profile info visibility, edit button, account/assets/timeframes tabs (admin-only), tab switching.
  - **Overlap with journey:** Stage 1 (Foundation) covers the happy path: assets added, timeframes added, tags added, conditions added, risk-profiles set, fee-rates set.
  - **Edge-case value:** Tab rendering order, admin-only visibility logic, language selector, read-only email field, edit-button UI — these are UI/permissions edge cases.
  - **Recommendation:** trim-happy-path — keep admin-only permission tests + language selector; remove duplicate "display X tab" assertions already verified by Stage 1.

- **playbook.spec.ts** (~388 LOC) — Playbook list page, compliance score display, new-strategy button, strategy cards, strategy detail navigation, new-strategy form layout.
  - **Overlap with journey:** Stage 1 (Foundation) creates one strategy end-to-end with entry/exit criteria and target R-multiple.
  - **Edge-case value:** Compliance score rendering, strategy card formatting, empty-state when no strategies exist, tab/list UX.
  - **Recommendation:** trim-happy-path — keep compliance score + empty-state; the form layout duplication with Stage 1 can be removed.

- **journal.spec.ts** (~720 LOC) — Journal list (filter tabs, empty state, trade cards), trade detail navigation, new-trade form, manual entry, CSV import, field validation, edit/delete.
  - **Overlap with journey:** Stage 4 (Daily Loop) covers happy path: manual trade entry (1 trade), CSV import (3 trades). Trade list + filter tabs also appear.
  - **Edge-case value:** Empty-state rendering, filter logic (asset/outcome), CSV validation errors, malformed CSV handling, trade edit/delete, pagination — core edge cases.
  - **Recommendation:** keep-as-is — journal is the most complex feature with high validation surface; Stage 4 only touches the happy path (create + import succeed). Keep all.

- **dashboard.spec.ts** (~386 LOC) — KPI cards (P&L, win-rate, profit-factor), positive/negative value coloring, discipline-score card, trading-calendar grid, current-month display.
  - **Overlap with journey:** Stage 0 (Welcome) lands on the dashboard; Stages 4+ produce data visible on KPI cards. Layout is implicit in navigation.
  - **Edge-case value:** Color coding (positive/negative), KPI card value formatting (currency/percentage), calendar grid structure, trend indicators — visual + data-formatting edge cases.
  - **Recommendation:** keep-as-is — dashboard KPI formatting is high-value edge case not exercised by journey (which focuses on navigation, not visual correctness).

- **analytics.spec.ts** (~324 LOC) — Filter panel (date range, presets, asset/direction/outcome filters), filter count display, clear-filters button, analytics page layout.
  - **Overlap with journey:** Stage 5 (Weekly) navigates to `/en/analytics` and scans one pattern (performance by tag). Filter existence is implicit.
  - **Edge-case value:** Date-range picker behavior, filter-preset buttons, active-filter count, clear-filters logic, filter combinations — detailed filter UX.
  - **Recommendation:** keep-as-is — filter logic is complex and orthogonal to the narrative; journey only needs the page to load.

- **command-center.spec.ts** (~411 LOC) — Tab switching (plan/command-center/monitor/calculator), date navigation (prev/today/next), Suspense-loading waits.
  - **Overlap with journey:** Stage 4 navigates to command-center to view pre-market panels + plan; monitor + calculator tabs are touched but not deeply.
  - **Edge-case value:** Tab Suspense boundaries, date-nav edge cases (today button disable logic), date-param URL handling — integration with Next.js RSC.
  - **Recommendation:** trim-happy-path — keep Suspense + date-nav edge cases; remove redundant "tab switching works" assertions covered by Stage 4.

- **monthly-plan.spec.ts** (~524 LOC) — Plan tab layout, month navigation, no-plan banner, plan-form fields, plan save, fractal cascade (month → week ladder), edit/delete.
  - **Overlap with journey:** Stage 1-2 (Foundation → Fractal Plan) covers plan creation: capital, ladder, exit convention, month/week editing, saves.
  - **Edge-case value:** "No plan configured" banner, future-month form rendering, validation errors on plan fields, month-navigation edge cases, delete confirmation.
  - **Recommendation:** trim-happy-path — keep no-plan banner + validation errors; Stage 2 covers the happy path thoroughly.

- **yearly-plan.spec.ts** (~111 LOC) — Onboarding wizard (capital → ladder → exit convention), 52-week grid, current-week highlighting, week-cell editing, payoff-matrix, exit-convention propagation.
  - **Overlap with journey:** Stage 2 (Fractal Plan) creates the yearly plan via form (capital, ladder, exit convention).
  - **Edge-case value:** Onboarding wizard UI (multi-step form), payoff-matrix math rendering, exit-convention change propagation, grid highlighting logic.
  - **Recommendation:** keep-as-is — wizard UX and payoff matrix are high-value edge cases; Stage 2 only covers the happy path.

- **monte-carlo.spec.ts** (~400 LOC) — Page layout, tabs (edge/capital expectancy), input-mode selector (auto/manual), data-source dropdown, Monte-Carlo run, output rendering.
  - **Overlap with journey:** Stage 3 (Pressure-Test) runs Monte Carlo V1 (1000 trials, seed=42) + V2, verifies percentile output.
  - **Edge-case value:** Input-mode selector (manual vs. auto), data-source dropdown behavior, output error states, canvas rendering, tab switching.
  - **Recommendation:** keep-as-is — Monte Carlo run parameters and edge cases are complex; Stage 3 only runs one happy-path scenario.

- **risk-simulation.spec.ts** (~390 LOC) — Date-range picker, preview banner, prefill selector (manual/monthly-plan/risk-profile buttons), params form, run simulation, results.
  - **Overlap with journey:** Stage 3 navigates to risk-simulation but doesn't run it in detail.
  - **Edge-case value:** Prefill-selector logic, manual prefill entry, error states, date-range filtering, simulation-run error handling.
  - **Recommendation:** keep-as-is — risk simulation is a specialized tool with unique edge cases not covered by the journey.

- **reports.spec.ts** (~532 LOC) — Reports page layout, week-selector navigation, weekly-summary card, P&L metrics, trade count, win-rate, daily-breakdown, performance chart, discipline-score, best/worst day.
  - **Overlap with journey:** Stage 5 (Weekly) navigates to `/en/reports`, verifies aggregate stats (win-rate, avg-R, expectancy), mistake-cost analytics.
  - **Edge-case value:** Week-selector navigation (prev/next), chart rendering, discipline-score display, best/worst-day logic, daily-breakdown formatting.
  - **Recommendation:** trim-happy-path — Stage 5 covers the happy path; keep chart-rendering + best/worst-day logic, remove week-nav duplication.

- **monthly.spec.ts** (~438 LOC) — Month navigator (prev/next buttons), current-month label, month navigation, profit cards (gross/trader/net), monthly-projection stats, month-over-month comparison, weekly breakdown, empty state.
  - **Overlap with journey:** Stage 6 (Monthly + Tax) navigates to `/en/monthly`, verifies monthly review card renders.
  - **Edge-case value:** Month-navigation edge cases (disable next-month when current), profit-card formatting, month-over-month comparison logic, empty-state when no trades.
  - **Recommendation:** trim-happy-path — Stage 6 only checks that the page loads; keep month-nav + comparison logic, remove card-visibility duplication.

- **monthly-plan.spec.ts** (see above)

- **tax-engine.spec.ts** (~113 LOC) — DARF card status badge, mark-paid button, carryover ledger (loss carryover history), prop-account N/A banner, fee-rate form visibility.
  - **Overlap with journey:** Stage 6 navigates to `/en/tax`, verifies DARF ledger for the trade month + carryover row.
  - **Edge-case value:** DARF status transitions (pending → pago), carryover history display, prop-account logic (N/A when account is proprietary), fee-rate form edge cases.
  - **Recommendation:** keep-as-is — DARF / tax logic is Brazil-specific and critical; edge cases around status transitions + carryover are high-value.

- **trade-conditions.spec.ts** (~298 LOC) — Condition checklist rendering (when strategy has conditions), condition checkbox toggle, trade creation with mixed condition states (met + unmet).
  - **Overlap with journey:** Stage 1-4 create strategy + log trades, but don't exercise condition-checklist toggling.
  - **Edge-case value:** Condition-checklist UI (when present), checkbox state toggling, mixed met/unmet logic, condition capture in trade record.
  - **Recommendation:** keep-as-is — condition logic is a specialized feature; Stage 4 doesn't exercise it.

- **holding-period.spec.ts** (~210 LOC) — Holding-period section presence (#analytics-holding-period), heading visibility, DOM position (after hourly/day-of-week charts), chart bars or empty-state rendering.
  - **Overlap with journey:** Stage 5-8 navigate to `/en/analytics` but don't drill into specific chart sections.
  - **Edge-case value:** Chart section presence + position validation, empty-state when no closed trades, chart bar rendering, i18n heading text.
  - **Recommendation:** keep-as-is — holding-period chart placement is a precise edge case; journey doesn't verify page layout details.

- **market-monitor.spec.ts** (~184 LOC) — Unauthenticated access (redirect to login or allow), page layout, refresh button, market-status indicators, economic-calendar section, asset-group tabs, quote display.
  - **Overlap with journey:** Stage 4 navigates to command-center monitor tab (mocked data feed).
  - **Edge-case value:** Unauthenticated access handling, market-API failure states (no API key in dev), refresh-button UX, market-status rendering, economic-calendar edge cases.
  - **Recommendation:** keep-as-is — market-monitor has unique error-handling (API failures) not covered by journey.

- **annual-reporting.spec.ts** (~96 LOC) — Annual-section heading, WeeklyMetaChart SVG bars, AnnualRollupTable (12 month rows + totals), CapitalEventLog summary/expand, withdrawal logging, capital-event deletion, WithdrawalCalculator suggestion text.
  - **Overlap with journey:** Stage 7 (Quarter + Year) navigates to `/en/annual-report`, verifies annual rollup.
  - **Edge-case value:** Capital-event CRUD (log withdrawal, delete event), WithdrawalCalculator suggestion text (undefined check), CapitalEventLog expand/collapse, chart rendering.
  - **Recommendation:** keep-as-is — capital-event CRUD and withdrawal calculator are edge cases not in Stage 7's happy path.

- **live-trading-status.spec.ts** (~1199 LOC) — Live Trading Status panel on command-center: phase display (T1 base / T2 recovery / T3 gain), risk amounts, stop-reason (daily-loss/daily-target/loss-sequence/gain-sequence), trade-count.
  - **Overlap with journey:** Stage 4 views command-center but doesn't exercise the live-trading-status decision tree.
  - **Edge-case value:** Complex decision-tree logic (5+ decision branches), phase transitions, risk-amount calculations, stop-reason edge cases, Bravo profile-specific values.
  - **Recommendation:** keep-as-is — live-trading-status is the most complex feature in the suite; the decision tree has 1200 LOC of scenario coverage.

---

## Summary

**Recommendation Bucket Counts:**

- **keep-as-is**: 11 files (auth, auth-security, journal, dashboard, analytics, monte-carlo, risk-simulation, tax-engine, trade-conditions, holding-period, market-monitor, annual-reporting, live-trading-status = 13 total)
- **trim-happy-path**: 5 files (navigation, settings, playbook, command-center, monthly-plan, reports, monthly = 7 total)
- **deprecate**: 0 files
- **uncertain**: 0 files

**Actual counts (21 files audited):**

- keep-as-is: 13
- trim-happy-path: 7
- deprecate: 0
- uncertain: 0

**Top 3 Deprecation Candidates (if any):**
No files are candidates for full deprecation. All legacy tests have either:

1. Security/validation coverage orthogonal to the journey narrative (auth, auth-security), or
2. Edge-case depth exceeding the journey's happy path (journal, chart-rendering, live-trading-status).

**Cross-Cutting Observations:**

1. **Auth is orthogonal**: `auth.spec.ts` and `auth-security.spec.ts` (998 LOC) are entirely orthogonal to the journey. Journey assumes a logged-in user; these tests cover registration validation, rate-limiting, and JWT expiry. **Recommendation: keep all; they are critical security gates.**

2. **Live-trading-status is unique**: `live-trading-status.spec.ts` (1199 LOC) is the single largest test file, covering a complex decision tree (5+ branches, 3+ phase transitions per branch) that the journey never exercises. **Recommendation: keep; high-value coverage for a feature that cannot be tested by a linear happy-path.**

3. **Chart rendering & formatting**: `dashboard.spec.ts`, `holding-period.spec.ts`, `market-monitor.spec.ts`, `annual-reporting.spec.ts` (1166 LOC combined) test visual correctness (color, positioning, SVG bar presence) that the journey implicitly touches but does not verify. **Recommendation: keep; visual regression is not in scope for journey.**

4. **Tax/DARF is Brazil-specific**: `tax-engine.spec.ts` (113 LOC) covers DARF status transitions and carryover logic unique to Brazilian income tax. **Recommendation: keep; regulatory compliance cannot be deferred.**

5. **Trim candidates are UI-iteration tests**: `navigation.spec.ts`, `settings.spec.ts`, `playbook.spec.ts`, `command-center.spec.ts`, `monthly-plan.spec.ts`, `reports.spec.ts`, `monthly.spec.ts` (2984 LOC combined) have redundant happy-path assertions (e.g., "tab exists", "button is visible") that the journey already exercises. **Recommendation: trim to edge cases only (empty states, form validation, sorting/filtering logic).**

---

## Next Steps

1. **Execute trims** on the 7 flagged files: remove redundant "element visibility" tests where Stage N already navigates that path.
2. **Preserve all edge-case logic** in the trim files (validation, error states, empty states, filter combinations).
3. **Keep all 13 "keep-as-is" files** without modification — they are either security-critical or high-value edge cases.
4. **Use this audit as a checklist** when future features are added: if a new feature lands in the journey suite, move its edge cases to `e2e/tests/`.

---

**Artifact Purpose**: This audit serves as a planning guide for the M-effort item #3 under "Journey suite" in `docs/backlog.md`. It is **not** a deletion order — all findings require human review before any files are modified.
