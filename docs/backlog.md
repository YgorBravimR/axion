# Backlog — "For Later" Single Source of Truth

This file is the canonical home for ideas, follow-ups, deferred work, and open product/eng questions that surfaced during sweeps, scans, and feature work but were intentionally **not** shipped at the time.

## Why this file exists

Inline `// TODO`, "Phase 2 will…", and "future iteration may…" notes scatter knowledge across the codebase. By the time the work matters again, the context is lost and the note rots. This file consolidates them so we can:

- **Cherry-pick** the next thing to tackle without a codebase grep tour.
- **Avoid losing ideas** when the original spec/scan ages out.
- **See the shape of debt** at a glance (which clusters keep growing, which are dormant).

## Conventions

- Every entry has a **Source** line linking back to the doc/spec/file that surfaced it. Update the source when you cherry-pick — don't leave stale "for later" prose behind.
- Group by capability area, not by date. Within a group, ordered by "ROI per hour" descending where known.
- Mark items shipped by **deleting** them, not striking through. The git log is the audit trail.
- When in doubt, file new ideas here first — they cost nothing here, and a one-liner is enough.

---

## Journey suite (`e2e/journey/`)

### Fixed Bravo email + per-chain DB reset

- **What**: Replace `bravo-${Date.now()}@axion-demo.com` with a fixed email backed by a globalSetup that cascade-deletes + reinserts the Bravo row at chain start.
- **Why**: Recognizable identity in the showcase video (sales/marketing pickup). Today the timestamped email is the cheapest workaround for the DB-backed login rate-limit (`login:<email>` in `src/app/actions/auth.ts`).
- **Source**: `e2e/journey/fixtures/bravo-seed.ts` header; `e2e/journey/README.md` "Bravo persona".

### Tag-based filtering

- **What**: Wire `@journey` / `@stage:<name>` JSDoc tags to Playwright's `--grep` so contributors can run "all weekly+ stages" with one flag.
- **Why**: Today the suite uses `--project=journey-NN-...` selection, which is explicit but verbose for partial-chain runs.
- **Source**: `e2e/journey/README.md` "Tags".

### Edge-case separation pass

- **What**: Audit existing `e2e/tests/*.spec.ts` for overlap with the journey suite — keep edge cases, deprecate happy-path duplication. Add new `e2e/<feature>-edge/` specs as needs surface.
- **Why**: Two suites covering the same happy path is wasted CI minutes and split maintenance.
- **Source**: `docs/design/zero-to-hero-e2e.md` §13 Phase 4 (ongoing).

### Onboarding integration (Product-owned)

- **What**: Use the demo-mode video as the new-user walkthrough; embed stage gallery in `docs/zero-to-hero.md`; nightly-publish demo artifact to S3 / internal docs site.
- **Source**: `docs/design/zero-to-hero-e2e.md` §13 Phase 5.

---

## Test coverage (unit / integration)

Source for all four items: `docs/scans/2026-05-11-test-coverage.md` Phase 5b. Best ROI ordering noted in that scan.

### Cluster C — Stats module (best unsupervised candidate)

- **What**: Write tests for `monte-carlo`, `monte-carlo-v2`, `risk-simulation-advanced`.
- **Why**: Pure functions, deterministic seeding, no protected paths, no fixture coordination cost. High coverage ROI per hour.

### Cluster B — Tax module

- **What**: Fill in tests for `asset-defaults`, `mark-dirty`, `month-status`.
- **Why**: Extends the existing tax test pattern. Lower coordination cost.

### Cluster D — Parsers

- **What**: Fixture-driven tests for `sinacor-parser`, `matching-engine`, `csv-parsers`. Sample broker outputs live at `e2e/fixtures/notas/`.

### Cluster A — Security (coordination required)

- **What**: Tests for `crypto.ts`, `user-crypto.ts`, `auth-utils.ts`.
- **Coordination**: Protected paths per `CLAUDE.md`. Security review required on test fixtures + design. **Do not unilaterally tackle.**

### Backtest / equity-shield / fractal-plan suites

- **What**: `__tests__/lib/backtest/*` (entry, stop, target, sizing modules), `__tests__/lib/equity-shield/*` (smoothing + shield calc), `__tests__/lib/fractal-plan/*` (capital + week aggregation).
- **Source**: same scan, "test files missing" list.

---

## Server-action zod-hardening

### Cluster D — Write actions missing zod input validation

- **What**: Add zod input schemas to the 4 write actions flagged in the scan. Specifically must coordinate with the user because one of them touches `src/lib/tax/recompute-month.ts` (protected path — single source of truth for tax recomputation).
- **Why**: Known bug classes are config-enforced now; remaining gap is input validation at write boundaries. Bulk-fix is real refactor work — schema decisions (required vs optional defaults vs transforms) + ~6 client call-sites per action.
- **Out of scope**: Cluster C (7 read-only typed-only actions). Auth gates the data; misshapen filter params yield empty results, not state corruption.
- **Source**: `docs/scans/2026-05-11-server-actions.md` Phase 5b.

---

## Tax / yearly-reports pre-existing baseline (still armed)

Items below were known when `docs/scans/2026-05-05-tax-yearly-reports.md` shipped but were out of scope at the time. They live on `main` today.

- `src/components/tax/fee-rate-form.tsx:332` — `<Select>` missing `id` attribute.
- `src/lib/tax/tax-engine.ts:245,246,324` — type holes in `YearTaxSummary` return shape.
- `src/app/actions/*`, `src/lib/queries/*` — ~80 drizzle relational type errors (generator config issue, not in scope at the time of the scan).

**Source**: `docs/scans/2026-05-05-tax-yearly-reports.md` "Still Armed".

---

## Journal-list polish (deferred from sweep)

### Mobile-detect via container queries instead of `matchMedia` effect

- **What**: `period-filter.tsx:44-50` runs a `useEffect` on mount to read `window.matchMedia("(max-width: 419px)")` so it can pass `numberOfMonths={1|2}` to the `DateRangePicker`. Replace with a CSS-only approach (container query on the picker wrapper, or render one calendar and let CSS hide the second below the breakpoint).
- **Why**: SSR-first the first paint always renders `isMobile=false`, then re-renders after hydration. The hydration flash is small but real, and the effect is the only state-setting code in PeriodFilter.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-list.md` Phase 1a P2.

### Listbox-style arrow-nav within trade-day-group

- **What**: After the TradeRow Link migration, focus moves row-by-row on Tab. For dense days (30+ trades) consider a listbox roving-tabindex pattern so ↑↓ navigates between rows without leaving the day group, and Tab leaves the group entirely.
- **Why**: Power-user shortcut. Not blocking — Tab works fine — but the cockpit register favors keyboard density.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-list.md` Phase 1b P1.

### `h-50` Suspense-fallback height across page-level shells

- **What**: 5 page.tsx files (`journal/page.tsx`, `settings/page.tsx`, `risk-simulation/page.tsx`, `backtest/page.tsx`, `backtest/optimize/page.tsx`) and `journal-content.tsx:457` use `className="h-50"` on the LoadingSpinner. Tailwind v4 resolves it to `12.5rem` (200px) via the implicit `n * 0.25rem` scale, but the project's named spacing scale tops at `l-900` (64px). Either codify `h-50` in `globals.css` (`--height-l-1000` or similar) so it's intentional, or swap all 6 sites to `min-h-48` / `min-h-52` / a named token.
- **Why**: It works, but reads as a token escape hatch every time someone greps the spacing system.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-list.md` Phase 3 out-of-scope.

---

## Command Center polish (deferred from sweep)

### `useTransition` on refresh callbacks

- **What**: Wrap `refreshCompletions` / `refreshDailyPlan` / `refreshAssetSettings` in `command-center-content.tsx` with `useTransition` and surface an `aria-busy` dim on the affected panel during the fetch.
- **Why**: Today the save buttons inside each panel render their own `Loader2` spinner so the in-flight state is covered for sighted, mouse-driven users. AT users (and anyone whose focus has moved away from the save button) get no panel-level signal that data is being re-fetched. Dashboard sweep already adopted this pattern for its initial loads; command-center can match.
- **Source**: `docs/scans/2026-05-12-impeccable-command-center.md` Phase 3c.

### Mood/Bias primitive consolidation

- **What**: `MoodSelector` renders an inline `role="radiogroup"` of pill buttons; `BiasSelector` wraps the Radix `Select` dropdown. Both are 4-option 1-of-N controls used adjacently inside `PreMarketNotes`. Unify on a shared `SegmentedToggle` primitive (or extract one from the dashboard sweep) so the visual + a11y model matches.
- **Why**: Two controls with the same job and different keyboard models is a small but real friction every pre-market.
- **Source**: `docs/scans/2026-05-12-impeccable-command-center.md` Phase 1a P2.

---

## Currency formatting — account-aware compact formatters

- **What**: `formatCompactCurrency`, `formatCompactCurrencyWithSign`, `formatBrlWithSign`, `formatBrlCompactWithSign` in `src/lib/formatting.ts` take a raw `symbol` string (or hardwire `"R$"`). Wire them to read from the active account's `currency` (or fall back to `user.defaultCurrency`) so a USD account never renders `R$10K`. The full-form `formatCurrency`/`formatCurrencyWithSign` already accept an optional `currency` parameter — the compact siblings should match that shape, plus a hook (e.g. `useAccountCurrency`) that resolves the active account's symbol once.
- **Why**: The schema already stores per-account `currency` (`schema.ts:361`) and per-user `defaultCurrency` (`schema.ts:173`, `:1389`), but the dashboard hardcodes `"R$"` at every call site (`pnl-card.tsx:34`, `quick-stats.tsx:90/103`, all `equity-curve.tsx` axes/tooltips, every chart tick formatter). The moment a non-BRL account exists, every compact display lies.
- **Source**: `docs/scans/2026-05-12-impeccable-dashboard.md` Phase 2d.

---

## Playbook list — deferred follow-ups

### StrategyCard menu should adopt Radix `DropdownMenu`

- **What**: `src/components/playbook/strategy-card.tsx:109-181` rolls a custom dropdown with manual focus management (`menuRef`, `menuButtonRef`, arrow-key `onKeyDown`, escape close, overlay click-out). The project already ships `@/components/ui/dropdown-menu` (Radix-based). Migrate so focus trapping, portal rendering, outside-click handling, and proper `aria-controls` wiring come for free.
- **Why**: Hand-rolled focus machinery is a maintenance liability and tends to drift out of WAI-ARIA spec (e.g. roving tabindex vs single-tabbable composite, role="menu" focusability). Radix already solves this for every other dropdown in the app.
- **Source**: `docs/scans/2026-05-12-impeccable-playbook-list.md` Phase 1b audit P3.

---

### Distill pass — `/playbook` reads as nested cards

- **What**: The compliance overview and the strategy grid each live inside their own `border-bg-300 bg-bg-200 rounded-lg border` wrapper, and the strategy grid itself contains up to ~10 `StrategyCard` boxes — yielding a "cards inside a card" structure. Either drop the outer chrome on the strategy section (let the cards float on the page background and use a section heading instead), or remove the per-card border and let the section wrapper provide the boundary.
- **Why**: Shared design law: "nested cards are always wrong." Two layers of borders compete for attention and consume horizontal whitespace.
- **Source**: `docs/scans/2026-05-12-impeccable-playbook-list.md` Phase 1a P2.

---

## Playbook detail — deferred follow-ups

### `condition-picker` carries the same trade-color leaks

- **What**: `src/components/playbook/condition-picker.tsx:41,163` still paints `text-trade-buy` / `border-trade-buy/40` on what are category / tier visual cues, not P&L magnitudes. The playbook-detail sweep retired the equivalent leaks in `condition-tier-display.tsx`; the picker (used by the edit form at `/playbook/[id]/edit`) was left because it's outside the read-only detail surface.
- **Why**: Avoid creating a second drift moment. When the form-editor sweep (runbook row #20) lands, the same fix should be applied here — adopt the same category palette and tier-legend layout used by `condition-tier-display.tsx`.
- **Source**: `docs/scans/2026-05-12-impeccable-playbook-detail.md` Phase 1b audit; deferred to row #20.

---

## Journal detail — deferred follow-ups

### Detail-page delete uses `window.confirm()`

- **What**: The trade-detail action menu's delete handler still triggers native `window.confirm()` (`src/app/[locale]/(app)/journal/[id]/page.tsx` — delete affordance / client island). Swap to the project `AlertDialog` pattern the way `journal-content.tsx` already does for the list view (controlled `open` state, `AlertDialogAction variant="destructive"`).
- **Why**: CLAUDE.md explicitly bans `window.confirm()` ("ugly, unthemed, inaccessible, brand-breaking"). The list page already migrated; the detail page is the last hold-out for trade deletion.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-detail.md` Phase 1b audit P1.

---

### Followed-plan yes/no should be a `radiogroup`, not two `aria-pressed` toggles

- **What**: `TradeInfoNotesTab` renders the followed-plan choice as two `<button aria-pressed>` controls inside `role="group"`. The semantics are 1-of-N with a third "unset" state — closer to a `radiogroup` with arrow-key navigation and a clear "clear selection" affordance. Mirror the rating radiogroup pattern (roving tabindex, `onKeyDown` Left/Right) so both single-select controls in the same tab share one model.
- **Why**: Two toggles with `aria-pressed` imply independent on/off state to assistive tech; a screen reader user can't tell that picking Yes implicitly unpicks No. The visual cue (one filled, one outlined) is misleading without the radio semantics.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-detail.md` Phase 1b audit P2.

---

### Card-rhythm distill pass on `/journal/[id]`

- **What**: The detail page stacks ~10 sibling cards (header, P&L block, R-multiples, prices, risk, SL/TP, MFE/MAE, classification, rating+plan, tags, notes). Several adjacent groupings (prices ↔ SL/TP, MFE ↔ MAE, rating ↔ plan) read as one logical unit but render with identical visual weight. Distill into 4-5 grouped sections with deliberate spacing variance, or move the secondary metrics into a collapsible "Details" disclosure so the primary outcome (P&L, R, executions, notes) leads.
- **Why**: Shared design law: "vary spacing for rhythm; same padding everywhere is monotony" + "cards are the lazy answer." The current page is a uniform card stack; nothing earns visual prominence over anything else.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-detail.md` Phase 1a critique P3 — distill deferred to keep this slice surgical.

---

## Account comparison — deferred follow-ups

### Chart-series palette overhaul (`comparison-colors.ts`)

- **What**: `src/components/account-comparison/comparison-colors.ts` mixes two anti-patterns in one constant: (a) hardcoded hex literals (`#f59e0b`, `#ef4444`, `#14b8a6`, `#f97316`) bypass the token system; (b) it hijacks `var(--color-trade-buy)` and `var(--color-trade-sell)` to colour the 3rd and 4th account in selection order — so "account #3's equity line is green" is encoded as "account #3 made money," which is false.
- **Why**: Series colors need their own semantic family (`--color-chart-1` … `--color-chart-N`) added to `src/app/globals.css`, decoupled from both trade colors and brand accents. Used by `comparison-equity-chart` line palette and the header-swatch dots in all three comparison tables (`comparison-stats-table`, `comparison-normalized-table`, `comparison-config-summary`). Scope this through `theme-designer` — the token spec needs OKLCH discipline (varied hue, tinted neutrals, no high-chroma at extremes) and dark/light variants.
- **Source**: `docs/scans/2026-05-12-impeccable-account-comparison.md` Phase 1a critique P2.

---

## Analytics — deferred follow-ups

### Delete `InsightCard` dead code

- **What**: `src/components/analytics/insight-card.tsx` is not exported via `src/components/analytics/index.ts` and grep finds no consumers across the repo. Best/worst summaries are inlined per chart (`day-of-week-chart`, `hourly-performance-chart`, `holding-period-chart`, `session-performance-chart`). Delete the file in a tidy-up PR.
- **Why**: Dead code drifts and confuses future agents. Surgical delete; no behaviour change.
- **Source**: `docs/scans/2026-05-12-impeccable-analytics.md` Phase 1a critique P2.

---

### `expectancy-mode-toggle.tsx` redundant `onKeyDown` handlers

- **What**: The three `<button>` elements re-implement Enter/Space → click in `onKeyDown` handlers. Native `<button>` already does this via the user agent; the handlers are noise.
- **Why**: Distill pass — code that duplicates browser behaviour rots when the underlying handler signature drifts. Drop the `onKeyDown` props; rely on `onClick`.
- **Source**: `docs/scans/2026-05-12-impeccable-analytics.md` Phase 1b audit P1 footnote.

---

### Uniform card stack across `/analytics`

- **What**: Eleven sibling cards (variable comparison, equity curve, EV, R-dist, tags, heatmap+session, session-asset table, hourly+day-of-week, holding period) all render with identical `border-bg-300 bg-bg-200 rounded-lg` chrome. Nothing earns visual prominence.
- **Why**: Same shared-law violation as `/journal/[id]` — "vary spacing for rhythm; cards are the lazy answer." Group into 3-4 logical bands with deliberate spacing variance, or promote one anchor metric (EV or cumulative equity) above the card grid.
- **Source**: `docs/scans/2026-05-12-impeccable-analytics.md` Phase 1a critique P2. Scope-extends the existing "Card-rhythm distill pass" item — handle as part of a unified analytics distill, not a separate slice.

---

## Reports — deferred follow-ups

### `capital-event-log.tsx` raw `<input>` migration

- **What**: `src/components/reports/capital-event-log.tsx` uses raw `<input type="text">` and `<input type="date">` for the amount + date fields. The codebase has `@/components/ui/input` (the same primitive enforced by `axion/enforce-ui-primitives` for checkboxes). Migrate to the primitive for consistent border / focus-ring / placeholder treatment.
- **Why**: This card predates the UI-primitive lock-in. The raw inputs work, but they bypass the design system's focus ring and density tokens, so they look subtly off next to the rest of the form chrome on `/reports`.
- **Source**: `docs/scans/2026-05-12-impeccable-reports.md` Phase 1a critique P2.

---

### `withdrawal-calculator.tsx` hardcoded English copy

- **What**: `src/components/reports/withdrawal-calculator.tsx` has ~10 hardcoded English strings (form labels, button copy, success/error messages). Wrap with `useTranslations("reports.withdrawalCalculator")` and add the keys to `messages/{en,pt-BR}.json`. The component is consumed by `reports-content.tsx` which is already fully translated, so the gap is jarring for `pt-BR` users.
- **Why**: i18n parity gap. No structural change; pure copy migration.
- **Source**: `docs/scans/2026-05-12-impeccable-reports.md` Phase 1a critique P2.

---

### Inline currency formatters → `useFormatting()`

- **What**: Four spots redefine BRL formatting locally:
  - `src/components/reports/weekly-meta-chart.tsx:36-42` (`formatBRL`)
  - `src/components/reports/annual-rollup-table.tsx:24-34` (`formatBRL`)
  - `src/components/reports/capital-event-log.tsx:174` (inline `Intl.NumberFormat("pt-BR", …)`)
  - `src/components/reports/withdrawal-calculator.tsx:74` (inline `Intl.NumberFormat("pt-BR", …)`)

  All hardcode `pt-BR` + R$, defeating the `useFormatting()` hook that's already used in 4 of the 9 widgets on this page.

- **Why**: Locale-switching breaks for English users on `/reports`. Consolidate behind `useFormatting()`; the hook already exposes `formatCurrency` / `formatCurrencyWithSign` and respects the user's account currency preference.
- **Source**: `docs/scans/2026-05-12-impeccable-reports.md` Phase 1a critique P2.

---

## Monthly — deferred follow-ups

### `month-comparison.tsx` ChangeIndicator paints non-P&L deltas as P&L

- **What**: `src/components/monthly/month-comparison.tsx` lines 146-164 paint all 4 comparison-row deltas (profit, winRate, avgR, trades) with `bg-trade-buy/10 text-trade-buy` / `bg-trade-sell/10 text-trade-sell` based on improvement direction. Only the profit row is canonical signed-P&L; the other three are non-money deltas recoded as "made money / lost money."
- **Why**: Same family as the rank-as-P&L pattern retired in row #8 (`comparison-stats-table.tsx`), milder here because the colors mark a directional delta rather than a category rank. The fix needs a per-row `isMoney` flag in `comparisonRows` (so profit keeps trade colors and the others demote to neutral with `ArrowUp`/`ArrowDown` carrying direction). Defer until a second "improvement-direction" comparison widget surfaces and the abstraction earns its weight.
- **Source**: `docs/scans/2026-05-12-impeccable-monthly.md` Phase 1a critique P2.

---

## Backtest — deferred follow-ups

### Hardcoded English aria-label on exit-level removal

- **What**: `src/components/backtest/sections/targets-exit-section.tsx` line ~226 uses `aria-label={`Remove exit level ${index + 1}`}`. No `backtest.builder.removeLevel` translation key exists yet.
- **Why**: Visible-text controls render fine in Portuguese; only the screen-reader-only aria-label leaks English. Fix is one key + one substitution but requires touching every `messages/*.json` locale file, which is a separate concern from the visual sweep.
- **Source**: `docs/scans/2026-05-12-impeccable-backtest.md` Phase 1b audit P2.

### Hardcoded BRL in `formatCentsAsCurrency` call sites

- **What**: `backtest-summary-cards.tsx` and `backtest-trades-table.tsx` pass `"BRL"` as a literal to `formatCentsAsCurrency(..., "BRL")` rather than reading the active account's currency. Backtests today are BRL-only because the data sources are BRL-denominated, but the formatter call site is wrong even so.
- **Why**: When multi-currency backtest data sources land (e.g. ES futures in USD), the renderer will mis-label the totals.
- **Source**: `docs/scans/2026-05-12-impeccable-backtest.md` Phase 1b audit P2.

### Categorical chart palette: extract literal hex array to tokens

- **What**: `src/components/optimize/equity-overlay-chart.tsx` defines `LINE_COLORS = ["#2196F3", "#26a69a", "#FF9800", "#AB47BC", "#EC407A", "#66BB6A", "#78909C"]` — literal hex chain bypassing the token system. Promote to `--chart-1` … `--chart-7` in `globals.css` (dark + light values) so multi-line charts theme correctly.
- **Why**: Token-discipline drift is the wedge — any future categorical chart will copy this pattern. One token rollout fixes the family.
- **Source**: `docs/scans/2026-05-12-impeccable-backtest-optimize.md` Phase 1b audit P2.

### Portuguese literal "(atual)" in sweep-config

- **What**: `src/components/optimize/sweep-config-panel.tsx` line ~275 hardcodes `(atual)` as a JSX child. Rest of the surface goes through `useTranslations("optimize")`. Add `currentValueSuffix` key (or similar) to `messages/{en,pt}.json` and substitute.
- **Why**: Locale-bleed; the EN build still ships "(atual)".
- **Source**: `docs/scans/2026-05-12-impeccable-backtest-optimize.md` Phase 1b audit P2.

### Categorical mode palette for Monte Carlo v2 engine charts

- **What**: `src/components/monte-carlo/v2/daily-pnl-chart.tsx` and `mode-distribution-chart.tsx` paint engine modes (`lossRecovery`, `gainCompounding`, `mixed`, `skipped`) using `--color-trade-sell` / `--color-trade-buy` / `--color-acc-100` / `--color-bg-300`. In `daily-pnl-chart` the bar height already encodes P&L sign; the mode-color overlay double-encodes. Promote dedicated tokens (`--color-mode-recovery`, `--color-mode-compounding`, `--color-mode-mixed`, `--color-mode-skipped` — or reuse a categorical `--chart-N` family once that lands) so engine state ≠ P&L vocabulary.
- **Why**: Trade colors leak into a categorical channel, which conflicts with the height encoding on the same chart and hijacks vocabulary that should remain reserved for signed money.
- **Source**: `docs/scans/2026-05-12-impeccable-monte-carlo.md` Phase 1a P3 (deferred).

### Monte Carlo v1 distribution-histogram tooltip count is sign-colored

- **What**: `src/components/monte-carlo/distribution-histogram.tsx` `CustomTooltip` paints the simulation-count line with `text-trade-buy` / `text-trade-sell` based on `midPoint >= 0`. The number is a _count_ (e.g. "84 simulations (12.1%)"), not signed money. v2's tooltip is already fixed in row #13; v1 was kept hold-pattern to avoid touching shared bar-fill logic until the categorical palette decision lands.
- **Why**: Same threshold-as-P&L vocabulary hijack that's been swept everywhere else in Wave 3 — last sliver.
- **Source**: `docs/scans/2026-05-12-impeccable-monte-carlo.md` Phase 4 enhancement.

### `ComparisonRow` delta branch — retire or commit (risk-simulation summary-cards)

- **What**: `src/components/risk-simulation/summary-cards.tsx` `ComparisonRow` carries an unused `delta`/`deltaPositive` prop branch. All four current callsites pass only `originalValue`/`simulatedValue`. The branch paints `text-trade-buy` / `text-trade-sell` — which is the wrong vocabulary for any of the comparison metrics shown (win-rate, profit-factor, avg-R, max-drawdown are not signed P&L). When the delta UI ships, rename the prop semantics to `signed`/`positive` and re-token the palette to fit the metric, OR delete the prop today since it's unreachable.
- **Why**: Dead-code drift on a colorized branch is a pre-loaded foot-gun — the next person who hooks up delta will silently inherit the wrong vocabulary.
- **Source**: `docs/scans/2026-05-12-impeccable-risk-simulation.md` Phase 1a P2 + Phase 4 enhancement.

### Verdict-triad palette consolidation (`--color-rule-{blocked,paused,executed}`)

- **What**: Wave 3 produced a consistent rule-engine verdict vocabulary: `fb-error` (blocked by loss/limit rule), `warning` (paused on purpose — target, gain-stop), `fb-success` (engine ran trade / recovery completed), `txt-300` (data N/A — no SL, max trades). Now used in three places: monte-carlo `kelly-criterion-card.conservative` + `strategy-analysis.Insight`, risk-simulation `trade-comparison-table.statusDotColors` + `day-trace-card` footer + `preview-banner` success twin. If a fourth surface needs it, promote to dedicated tokens (`--color-rule-blocked`, `--color-rule-paused`, `--color-rule-executed`, `--color-rule-na`) so the vocabulary is grep-able and themeable independently from `fb-*`/`warning`.
- **Why**: Today the aliasing works because `fb-error` semantically maps to "rule blocked" — but the moment design changes warning color (e.g. amber for non-critical-pause), the rule-paused state would silently drift. Decouple before the divergence.
- **Source**: `docs/scans/2026-05-12-impeccable-risk-simulation.md` Phase 4 enhancement.

---

## Documentation drift watch

- **Design doc Phase 3 / §12 Open Questions**: `docs/design/zero-to-hero-e2e.md` §12-13 was the original rollout spec. Stages 0-8 ship; Phase 3 is functionally done except for the multi-month seeder + CI wiring (both captured above). When those land, retire §13 Phase 3 in favour of a one-liner pointing here.
- **`docs/zero-to-hero.md:284`** — "Bias and mood are recorded for later correlation analysis." That's a _product_ statement (what the data is for), not a backlog item; left in place.

---

## How to retire an item from this backlog

1. Implement the work.
2. Update the original `Source` if it still has the deferred prose ("Phase 2 will…", "future iteration may…") — replace with a concrete reference to the shipped commit/PR, or delete the prose entirely.
3. Delete the item from this file in the same PR.

Result: the backlog only ever lists work that's still in front of us.
