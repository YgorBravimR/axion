# Backlog — Commit-Ready Deferred Work

This file is the canonical home for **commit-ready deferred work**: ideas that have a concrete shape, a known source, a rough effort, and a priority. Half-formed thoughts and exploratory ideas live in [`docs/ideas.md`](ideas.md) and graduate here once they pass the promotion bar.

## Why this file exists

Inline `// TODO`, "Phase 2 will…", and "future iteration may…" notes scatter knowledge across the codebase. By the time the work matters again, the context is lost and the note rots. This file consolidates the next-action-ready slice so we can:

- **Cherry-pick** the next P1 without a codebase grep tour.
- **Avoid losing concrete plans** when the original spec/scan ages out.
- **See the shape of debt** at a glance — which clusters keep growing, which are dormant, what we're choosing not to do.

## Backlog vs. ideas

| File                          | What lives here                                                                                                                                                      | Promotion rule                                                                                                                           |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ideas.md`               | Half-formed ideas, "we should think about X", strategic seeds, anything missing a clear shape or effort estimate. Cheap to file, cheap to delete.                    | Once an idea has a **Source**, a rough **Effort**, a **Priority**, and a one-paragraph "what + why", promote it here.                    |
| `docs/backlog.md` (this file) | Concrete, commit-ready deferred work. Every entry has Priority, Effort, Source, and a `What + Why` clear enough that someone other than the author could pick it up. | When shipped, **delete the entry in the same PR that ships it**. The shipping commit + git history is the record — no separate DONE log. |

## Conventions

- **Priority**: `P0` blocker / safety / data-correctness · `P1` strategic shortlist (highest ROI, ship next) · `P2` valuable but not blocking · `P3` nice-to-have / polish.
- **Effort**: `XS` <1h · `S` half-day · `M` 1-2 days · `L` multi-day · `XL` multi-sprint.
- Every entry has a **Source** line linking back to the doc/spec/file that surfaced it. Update the source when you cherry-pick.
- **Ordering — higher priority sits on top** so a top-to-bottom scan always surfaces "what's next" first. Two layers:
  1. Capability sections themselves are ordered roughly by where the highest-priority work lives. The `## P1 strategic shortlist` always leads the file.
  2. Within each capability section, entries are sorted by priority descending: `P1` first, then `P2`, then `P3`. When adding a new entry, slot it by priority — do not append blindly.
- **When a feature lands, delete its entry from this file in the same PR that ships it.** Git history + the shipping commit are the audit trail; no parallel DONE register is maintained. The active backlog is exactly what's still in front of us.
- Group by capability area, not by date. Within a group, follow the priority-sort rule above.
- When in doubt, file new entries in `ideas.md` first — cheap to write, cheap to discard.

---

## P1 strategic shortlist (ship next)

> **Strategic context**: see [`feature-manifesto-2026-05.md`](feature-manifesto-2026-05.md) for the invest/merge/deprecate framing this shortlist sits inside.

The items that earn priority over everything else in this file. Each is linked to its full entry below.

1. **Strategy versioning v1** — make strategies immutable once a trade references them; fork-to-v2 UX preserves "what did I believe at execution time" (Manifesto follow-ups). Depends on the now-landed `trade_conditions` junction.
2. **Renko-native data pipeline** — own the brick + indicator generation; remove ProfitChart as a hard dependency for backtesting (Backtest section).
3. **Backtest visual layer + methodology-specific UX redesign** — turn the backtest page from a calculator into a simulation tool, and split the generic result panels into per-methodology views (Backtest section).
4. **Encryption archive** — rip dormant field-level encryption stack threaded through ~50 files; touches PROTECTED paths so wants its own session (Test coverage section).

---

## Manifesto follow-ups (2026-05-15)

Filed from [`feature-manifesto-2026-05.md`](feature-manifesto-2026-05.md) after Q1/Q2/Q3 resolution. Retire as a batch when shipped.

### Strategy versioning v1 — UX surface (Phase D)

- **Priority:** P1 · **Effort:** M
- **Problem**: data layer for strategy versioning is live (`createStrategyVersion`, `getStrategyVersion`, version-aware `getStrategyConditionsRollup`, STRATEGY_LIVE guards on edit paths), but the UI doesn't expose any of it — users can't see version history, can't fork live strategies, and the scorecard always reads the current version.
- **Build**:
  - Version dropdown on strategy detail (v1, v2, v3 — current bolded). Wire to `getStrategyVersion(versionId)` for snapshot read.
  - "Fork to v2" button on live strategies wired to `createStrategyVersion`. Surface the edit-attempt CTA when `updateStrategy` / `syncStrategyConditions` return `STRATEGY_LIVE`.
  - Per-version scorecard: pass `versionId` to `getStrategyConditionsRollup` so users compare met-rate across forks.
  - Dashboards: cohort-split by `strategyVersionId` so users can compare refinements.
- **Needs**: `/plan-design-review` before scoping the surface. User insight (2026-05-15): _"Conditions should not change after any trade is linked to the strategy. If condition changed it's not the same strategy anymore."_

---

## Test coverage (unit / integration)

Source for all items below: `docs/scans/2026-05-11-test-coverage.md` Phase 5b. Best ROI ordering preserved.

### Encryption archive — XL refactor (its own session) — P1

- **Priority:** P1 · **Effort:** XL · **Owner**: needs its own dedicated session (like the Renko-native data pipeline P1)
- **What**: Rip out the dormant field-level encryption stack. `getUserDek` always returns `null`; ~50 files thread `dek` through actions/routes/library queries with `dek ? encryptFields(...) : raw` ternaries that never take the wrapped branch. Schema columns marked `// encrypted` (pnl, entry_price, prop_firm_name, name, etc.) actually store plaintext.
- **Scope:**
  - Delete `src/lib/crypto.ts`, `src/lib/user-crypto.ts`, `src/app/api/arch/_lib/decrypt.ts`.
  - Delete `scripts/migrate-encrypt-existing-data.ts`, `scripts/migrate-decrypt-existing-data.ts`.
  - Strip `getUserDek` + `encryptTradeFields` / `decryptTradeFields` / `encryptAccountFields` / `decryptAccountFields` / etc. from all ~50 call sites. Remove the `dek ? wrapped : raw` ternaries.
  - Drop `users.encrypted_dek` column via new Drizzle migration.
  - Scrub 18 `// encrypted` comments from `src/db/schema.ts`.
  - Trim `SafeUser` in `src/app/actions/auth.types.ts` (drop the `encryptedDek` from `Omit<>`).
  - Clean dead commented block in `src/app/actions/auth.ts:77-89`.
  - Update affected tests (`auth-actions.test.ts`, `commission-fee-impact.test.ts`, `period-queries.test.ts`, `recompute-month.test.ts`).
- **Touches PROTECTED**: `src/lib/tax/recompute-month.ts`, `src/db/schema.ts`, `src/db/migrations/` (new migration).
- **User authorization (recorded 2026-05-15)**: "we're rebuilding if need to touch protected files, do it" + "There's no problem if a database reset is needed." → archive may break shape of existing rows; DB reset on staging/prod acceptable for this cutover.
- **Why deferred**: full archive in a non-dedicated session has high risk on financial-recompute paths (`recompute-month.ts`, `period-queries.ts`). Better as one focused session with a clean lint + test pass between each commit. See discovery in current session for full file inventory.

### Cluster D — Parsers

- **Priority:** P2 · **Effort:** M
- **What**: Fixture-driven tests for `sinacor-parser`, `matching-engine`, `csv-parsers`. Sample broker outputs live at `e2e/fixtures/notas/`.

### Backtest / equity-shield / fractal-plan suites

- **Priority:** P2 · **Effort:** L
- **What**: `__tests__/lib/backtest/*` (entry, stop, target, sizing modules), `__tests__/lib/equity-shield/*` (smoothing + shield calc), `__tests__/lib/fractal-plan/*` (capital + week aggregation).
- **Source**: same scan, "test files missing" list.

---

## Tax / yearly-reports pre-existing baseline (still armed)

Items below were known when `docs/scans/2026-05-05-tax-yearly-reports.md` shipped but were out of scope at the time. They live on `main` today.

- **Priority:** P2 · **Effort:** S each
- `src/components/tax/fee-rate-form.tsx:332` — `<Select>` missing `id` attribute.
- `src/lib/tax/tax-engine.ts:245,246,324` — type holes in `YearTaxSummary` return shape.
- `src/app/actions/*`, `src/lib/queries/*` — ~80 drizzle relational type errors (generator config issue, not in scope at the time of the scan). Bundle into one pass.

**Source**: `docs/scans/2026-05-05-tax-yearly-reports.md` "Still Armed".

---

## Command Center polish (deferred from sweep)

### `useTransition` on refresh callbacks

- **Priority:** P2 · **Effort:** S
- **What**: Wrap `refreshCompletions` / `refreshDailyPlan` / `refreshAssetSettings` in `command-center-content.tsx` with `useTransition` and surface an `aria-busy` dim on the affected panel during the fetch.
- **Why**: Today the save buttons inside each panel render their own `Loader2` spinner so the in-flight state is covered for sighted, mouse-driven users. AT users (and anyone whose focus has moved away from the save button) get no panel-level signal that data is being re-fetched. Dashboard sweep already adopted this pattern for its initial loads; command-center can match.
- **Source**: `docs/scans/2026-05-12-impeccable-command-center.md` Phase 3c.

### Mood/Bias primitive consolidation

- **Priority:** P3 · **Effort:** M
- **What**: `MoodSelector` renders an inline `role="radiogroup"` of pill buttons; `BiasSelector` wraps the Radix `Select` dropdown. Both are 4-option 1-of-N controls used adjacently inside `PreMarketNotes`. Unify on a shared `SegmentedToggle` primitive (or extract one from the dashboard sweep) so the visual + a11y model matches.
- **Why**: Two controls with the same job and different keyboard models is a small but real friction every pre-market.
- **Source**: `docs/scans/2026-05-12-impeccable-command-center.md` Phase 1a P2.

---

## Currency formatting — account-aware compact formatters

- **Priority:** P2 · **Effort:** M
- **What**: `formatCompactCurrency`, `formatCompactCurrencyWithSign`, `formatBrlWithSign`, `formatBrlCompactWithSign` in `src/lib/formatting.ts` take a raw `symbol` string (or hardwire `"R$"`). Wire them to read from the active account's `currency` (or fall back to `user.defaultCurrency`) so a USD account never renders `R$10K`. The full-form `formatCurrency`/`formatCurrencyWithSign` already accept an optional `currency` parameter — the compact siblings should match that shape, plus a hook (e.g. `useAccountCurrency`) that resolves the active account's symbol once.
- **Why**: The schema already stores per-account `currency` (`schema.ts:361`) and per-user `defaultCurrency` (`schema.ts:173`, `:1389`), but the dashboard hardcodes `"R$"` at every call site (`pnl-card.tsx:34`, `quick-stats.tsx:90/103`, all `equity-curve.tsx` axes/tooltips, every chart tick formatter). The moment a non-BRL account exists, every compact display lies.
- **Source**: `docs/scans/2026-05-12-impeccable-dashboard.md` Phase 2d.

---

## Playbook list — deferred follow-ups

### StrategyCard menu should adopt Radix `DropdownMenu`

- **Priority:** P2 · **Effort:** S
- **What**: `src/components/playbook/strategy-card.tsx:109-181` rolls a custom dropdown with manual focus management (`menuRef`, `menuButtonRef`, arrow-key `onKeyDown`, escape close, overlay click-out). The project already ships `@/components/ui/dropdown-menu` (Radix-based). Migrate so focus trapping, portal rendering, outside-click handling, and proper `aria-controls` wiring come for free.
- **Why**: Hand-rolled focus machinery is a maintenance liability and tends to drift out of WAI-ARIA spec (e.g. roving tabindex vs single-tabbable composite, role="menu" focusability). Radix already solves this for every other dropdown in the app.
- **Source**: `docs/scans/2026-05-12-impeccable-playbook-list.md` Phase 1b audit P3.

### Distill pass — `/playbook` reads as nested cards

- **Priority:** P3 · **Effort:** M
- **What**: The compliance overview and the strategy grid each live inside their own `border-bg-300 bg-bg-200 rounded-lg border` wrapper, and the strategy grid itself contains up to ~10 `StrategyCard` boxes — yielding a "cards inside a card" structure. Either drop the outer chrome on the strategy section (let the cards float on the page background and use a section heading instead), or remove the per-card border and let the section wrapper provide the boundary.
- **Why**: Shared design law: "nested cards are always wrong." Two layers of borders compete for attention and consume horizontal whitespace.
- **Source**: `docs/scans/2026-05-12-impeccable-playbook-list.md` Phase 1a P2.

---

## Playbook detail — deferred follow-ups

### `condition-picker` carries the same trade-color leaks

- **Priority:** P2 · **Effort:** S
- **What**: `src/components/playbook/condition-picker.tsx:41,163` still paints `text-trade-buy` / `border-trade-buy/40` on what are category / tier visual cues, not P&L magnitudes. The playbook-detail sweep retired the equivalent leaks in `condition-tier-display.tsx`; the picker (used by the edit form at `/playbook/[id]/edit`) was left because it's outside the read-only detail surface.
- **Why**: Avoid creating a second drift moment. When the form-editor sweep (runbook row #20) lands, the same fix should be applied here — adopt the same category palette and tier-legend layout used by `condition-tier-display.tsx`.
- **Source**: `docs/scans/2026-05-12-impeccable-playbook-detail.md` Phase 1b audit; deferred to row #20.

---

## Journal detail — deferred follow-ups

### Followed-plan yes/no should be a `radiogroup`, not two `aria-pressed` toggles

- **Priority:** P2 · **Effort:** S
- **What**: `TradeInfoNotesTab` renders the followed-plan choice as two `<button aria-pressed>` controls inside `role="group"`. The semantics are 1-of-N with a third "unset" state — closer to a `radiogroup` with arrow-key navigation and a clear "clear selection" affordance. Mirror the rating radiogroup pattern (roving tabindex, `onKeyDown` Left/Right) so both single-select controls in the same tab share one model.
- **Why**: Two toggles with `aria-pressed` imply independent on/off state to assistive tech; a screen reader user can't tell that picking Yes implicitly unpicks No. The visual cue (one filled, one outlined) is misleading without the radio semantics.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-detail.md` Phase 1b audit P2.

### Card-rhythm distill pass on `/journal/[id]`

- **Priority:** P3 · **Effort:** M
- **What**: The detail page stacks ~10 sibling cards (header, P&L block, R-multiples, prices, risk, SL/TP, MFE/MAE, classification, rating+plan, tags, notes). Several adjacent groupings (prices ↔ SL/TP, MFE ↔ MAE, rating ↔ plan) read as one logical unit but render with identical visual weight. Distill into 4-5 grouped sections with deliberate spacing variance, or move the secondary metrics into a collapsible "Details" disclosure so the primary outcome (P&L, R, executions, notes) leads.
- **Why**: Shared design law: "vary spacing for rhythm; same padding everywhere is monotony" + "cards are the lazy answer." The current page is a uniform card stack; nothing earns visual prominence over anything else.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-detail.md` Phase 1a critique P3 — distill deferred to keep this slice surgical.

---

## Account comparison — deferred follow-ups

### Chart-series palette overhaul (`comparison-colors.ts`)

- **Priority:** P2 · **Effort:** M
- **What**: `src/components/account-comparison/comparison-colors.ts` mixes two anti-patterns in one constant: (a) hardcoded hex literals (`#f59e0b`, `#ef4444`, `#14b8a6`, `#f97316`) bypass the token system; (b) it hijacks `var(--color-trade-buy)` and `var(--color-trade-sell)` to colour the 3rd and 4th account in selection order — so "account #3's equity line is green" is encoded as "account #3 made money," which is false.
- **Why**: Series colors need their own semantic family (`--color-chart-1` … `--color-chart-N`) added to `src/app/globals.css`, decoupled from both trade colors and brand accents. Used by `comparison-equity-chart` line palette and the header-swatch dots in all three comparison tables (`comparison-stats-table`, `comparison-normalized-table`, `comparison-config-summary`). Scope this through `theme-designer` — the token spec needs OKLCH discipline (varied hue, tinted neutrals, no high-chroma at extremes) and dark/light variants. Combines with the `--chart-1…N` palette entry in the Backtest section — ship as one token-spec pass.
- **Source**: `docs/scans/2026-05-12-impeccable-account-comparison.md` Phase 1a critique P2.

---

## Analytics — deferred follow-ups

### Delete `InsightCard` dead code

- **Priority:** P3 · **Effort:** XS
- **What**: `src/components/analytics/insight-card.tsx` is not exported via `src/components/analytics/index.ts` and grep finds no consumers across the repo. Best/worst summaries are inlined per chart (`day-of-week-chart`, `hourly-performance-chart`, `holding-period-chart`, `session-performance-chart`). Delete the file in a tidy-up PR.
- **Why**: Dead code drifts and confuses future agents. Surgical delete; no behaviour change.
- **Source**: `docs/scans/2026-05-12-impeccable-analytics.md` Phase 1a critique P2.

### `expectancy-mode-toggle.tsx` redundant `onKeyDown` handlers

- **Priority:** P3 · **Effort:** XS
- **What**: The three `<button>` elements re-implement Enter/Space → click in `onKeyDown` handlers. Native `<button>` already does this via the user agent; the handlers are noise.
- **Why**: Distill pass — code that duplicates browser behaviour rots when the underlying handler signature drifts. Drop the `onKeyDown` props; rely on `onClick`.
- **Source**: `docs/scans/2026-05-12-impeccable-analytics.md` Phase 1b audit P1 footnote.

### Uniform card stack across `/analytics`

- **Priority:** P3 · **Effort:** M
- **What**: Eleven sibling cards (variable comparison, equity curve, EV, R-dist, tags, heatmap+session, session-asset table, hourly+day-of-week, holding period) all render with identical `border-bg-300 bg-bg-200 rounded-lg` chrome. Nothing earns visual prominence.
- **Why**: Same shared-law violation as `/journal/[id]` — "vary spacing for rhythm; cards are the lazy answer." Group into 3-4 logical bands with deliberate spacing variance, or promote one anchor metric (EV or cumulative equity) above the card grid.
- **Source**: `docs/scans/2026-05-12-impeccable-analytics.md` Phase 1a critique P2. Scope-extends the existing "Card-rhythm distill pass" item — handle as part of a unified analytics distill, not a separate slice.

---

## Reports — deferred follow-ups

### `capital-event-log.tsx` raw `<input>` migration

- **Priority:** P2 · **Effort:** S
- **What**: `src/components/reports/capital-event-log.tsx` uses raw `<input type="text">` and `<input type="date">` for the amount + date fields. The codebase has `@/components/ui/input` (the same primitive enforced by `axion/enforce-ui-primitives` for checkboxes). Migrate to the primitive for consistent border / focus-ring / placeholder treatment.
- **Why**: This card predates the UI-primitive lock-in. The raw inputs work, but they bypass the design system's focus ring and density tokens, so they look subtly off next to the rest of the form chrome on `/reports`.
- **Source**: `docs/scans/2026-05-12-impeccable-reports.md` Phase 1a critique P2.

### `withdrawal-calculator.tsx` hardcoded English copy

- **Priority:** P2 · **Effort:** XS
- **What**: `src/components/reports/withdrawal-calculator.tsx` has ~10 hardcoded English strings (form labels, button copy, success/error messages). Wrap with `useTranslations("reports.withdrawalCalculator")` and add the keys to `messages/{en,pt-BR}.json`. The component is consumed by `reports-content.tsx` which is already fully translated, so the gap is jarring for `pt-BR` users.
- **Why**: i18n parity gap. No structural change; pure copy migration.
- **Source**: `docs/scans/2026-05-12-impeccable-reports.md` Phase 1a critique P2.

### Inline currency formatters → `useFormatting()`

- **Priority:** P2 · **Effort:** S
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

- **Priority:** P3 · **Effort:** S
- **What**: `src/components/monthly/month-comparison.tsx` lines 146-164 paint all 4 comparison-row deltas (profit, winRate, avgR, trades) with `bg-trade-buy/10 text-trade-buy` / `bg-trade-sell/10 text-trade-sell` based on improvement direction. Only the profit row is canonical signed-P&L; the other three are non-money deltas recoded as "made money / lost money."
- **Why**: Same family as the rank-as-P&L pattern retired in row #8 (`comparison-stats-table.tsx`), milder here because the colors mark a directional delta rather than a category rank. The fix needs a per-row `isMoney` flag in `comparisonRows` (so profit keeps trade colors and the others demote to neutral with `ArrowUp`/`ArrowDown` carrying direction). Defer until a second "improvement-direction" comparison widget surfaces and the abstraction earns its weight.
- **Source**: `docs/scans/2026-05-12-impeccable-monthly.md` Phase 1a critique P2.

---

## Backtest — deferred follow-ups

### Renko-native data pipeline — **P1**

- **Priority:** P1 · **Effort:** XL
- **What**: Replace ProfitChart-dependency for indicator computation with a self-contained pipeline: (1) import raw 1m OHLC bars from ProfitChart CSV (new import format, different from current Renko CSV), (2) generate three brick sets per week using `hawksRenkoSizes.size5m/size15m/size60m`, (3) compute indicators on generated bricks, (4) cross-TF join by opening timestamp.
- **Why**: Currently the backtest reads pre-computed Renko bricks + indicators from ProfitChart's CSV export. The `hawksRenkoSizes` table stores weekly R calibration but is not connected to the backtest engine. Full Renko-native unlocks any historical period, any R configuration, and removes ProfitChart as a hard dependency for backtesting.
- **Architecture** (full spec — confirmed with Ygor 2026-05-14):
  ```
  ProfitChart 1m OHLC export (new import format)
    → rawBars table (asset, timestamp, OHLC)
    → RenkoBrickGenerator (reads hawksRenkoSizes.size5m/15m/60m for the ISO week)
      → three brick sets: size=size5m, size=size15m, size=size60m
      → each brick stores open_timestamp (when it began forming) and close_timestamp
    → IndicatorComputer
      → MACD(21/89/42) on 5m bricks
      → EMA27/55 on 60m bricks; MACD(27/117/55) on 60m bricks
      → EMA27/55 on 15m bricks; MACD(27/117/55) on 15m bricks
    → CrossTimeframeJoin (by opening timestamp)
      → for each 5m brick with open_timestamp T:
          find 15m brick where open_timestamp ≤ T < next_15m.open_timestamp → inject mme27_15m
          find 60m brick where open_timestamp ≤ T < next_60m.open_timestamp → inject mme27_60m, mme55_60m
      → DB index: (asset_id, brick_size_r, open_timestamp DESC), single seek per join
    → assembled 5m bricks with all indicators → backtest engine
  ```
- **Key insights** (confirmed 2026-05-14):
  - The "three timeframes" (5m/15m/60m) are three R values applied to the same price stream, not time windows. `hawksRenkoSizes` is the calibration source.
  - Cross-TF join is by **opening timestamp** of each brick, not by "last completed brick". Every brick has an `open_timestamp`; at any moment T, exactly one brick of each size is active (the one whose open_timestamp ≤ T < next brick's open_timestamp). Clean range lookup, single index.
  - MACD 5m parameters: **21/89/42** (confirmed correct). Vault Part 3's `21/49/82` line is incorrect; Section 13.3's `21/89/42` is authoritative.
- **R-multiple terminology** (clarified 2026-05-14, hardened 2026-05-15):
  - 1R = 1 risk unit = the stop distance (universal, methodology-agnostic).
  - 1 Renko = 1 box (the brick size).
  - **In Hawks: 1R = 2 Renko boxes** (Hawks stop is 2 boxes from entry, not 1).
  - So a "2R target" in Hawks = 4 Renko boxes; "3R target" = 6 boxes. R count is decoupled from Renko count.
- **Complexity**: the brick generator must handle variable R per week (weekly calibration), and the indicator computer must run three independent EMA/MACD chains (one per brick size). The cross-TF join is straightforward once `open_timestamp` is indexed.
- **Sequence**: build visual chart layer first (works with current pre-computed bricks), then: raw 1m import → brick generator → indicator computer → cross-TF join.
- **Source**: CEO review + vault investigation session 2026-05-14; `src/lib/backtest/presets/hawks-presets.ts`, `src/lib/backtest/modules/entry/hawks-triple-screen.ts`, `src/db/schema.ts` (`hawksRenkoSizes`), `src/app/actions/hawks-renko.ts`.

### Backtest visual layer + methodology-specific UX redesign — **P1**

- **Priority:** P1 · **Effort:** L (visual replay) + M (per-methodology panels)
- **What**: The current backtest page is form-based only — results show equity curve, summary cards, and a trades table but no candle chart replay. The redesign has two parts: (1) a visual layer showing trades overlaid on a price chart for each selected trade/day, and (2) methodology-specific result views — ORB, DEZK/Hawks each have distinct metrics and UX that shouldn't share the same generic sections. Hawks specifically needs scenario-level breakdown, B3 daily cap tracking, and session-aware reporting that ORB never will.
- **Why**: Surfaced during CEO strategic review (2026-05-14). The visual layer is the delta between "a calculator" and "a simulation tool." The methodology-specific UX is the delta between "a generic platform" and Axion's core niche value proposition. Promoted to P1 (from P2) because the methodology-personalization framework is now committed strategic direction; this is the most-visible expression of it.
- **Building blocks already exist**: `getTradeWithCandles` in `candle-query.ts` fetches candle data with trade overlay (already powers journal chart); `BacktestTrade[]` has entry/exit timestamps + prices + R-multiples; `DayBreakdown[]` captures range data per day (currently unused in UI); methodology entry sections are already split per strategy.
- **Source**: CEO review session 2026-05-14; `src/components/backtest/`, `src/app/actions/candle-query.ts`, `src/types/backtest.ts`.

### Hardcoded English aria-label on exit-level removal

- **Priority:** P3 · **Effort:** XS
- **What**: `src/components/backtest/sections/targets-exit-section.tsx` line ~226 uses `aria-label={`Remove exit level ${index + 1}`}`. No `backtest.builder.removeLevel` translation key exists yet.
- **Why**: Visible-text controls render fine in Portuguese; only the screen-reader-only aria-label leaks English. Fix is one key + one substitution but requires touching every `messages/*.json` locale file, which is a separate concern from the visual sweep.
- **Source**: `docs/scans/2026-05-12-impeccable-backtest.md` Phase 1b audit P2.

### Hardcoded BRL in `formatCentsAsCurrency` call sites

- **Priority:** P3 · **Effort:** S
- **What**: `backtest-summary-cards.tsx` and `backtest-trades-table.tsx` pass `"BRL"` as a literal to `formatCentsAsCurrency(..., "BRL")` rather than reading the active account's currency. Backtests today are BRL-only because the data sources are BRL-denominated, but the formatter call site is wrong even so.
- **Why**: When multi-currency backtest data sources land (e.g. ES futures in USD), the renderer will mis-label the totals.
- **Source**: `docs/scans/2026-05-12-impeccable-backtest.md` Phase 1b audit P2.

### `engineVersion` UI badge on backtest results

- **Priority:** P2 · **Effort:** XS
- **What**: After the 2026-05-15 Hawks stop-reference fix, the backtest engine now stamps `engineVersion: "hawks-v0.2"` on every Hawks result. The result page does not yet read `result.engineVersion`. Add a small badge or footer line so cached screenshots/exports are traceable to v0.2 (and any future engine revision).
- **Why**: Without the badge, a teammate looking at a stale screenshot can't tell which engine math produced it. The stamp exists; just surface it.
- **Source**: `docs/postMorten/backend.md` [BUG-2026-05-15] open follow-ups; `src/types/backtest.ts` (`BacktestResult.engineVersion`); `src/lib/backtest/engine.ts`.

### Hawks tick-level fidelity on stop reference

- **Priority:** P3 · **Effort:** S
- **What**: The current Hawks stop formula `2·open − close` gives one brick body below the entry brick's open — a 2-brick-body distance at points-level fidelity. The strict Profit Pro 9+1 geometry is `2·(R−1) + 1` ticks (two brick bodies + 1 closer tick). The `+1 tick` is omitted today; this is acceptable for points-level computation but should be revisited if/when the engine exposes tick-precise stops.
- **Why**: Cosmetic at current fidelity (one tick on a ~20-tick brick is ~5% of the brick body). Worth tracking so it's not silently rediscovered as a bug later.
- **Source**: `docs/postMorten/backend.md` [BUG-2026-05-15] open follow-ups; Ygor math note 2026-05-15.

### Categorical chart palette: `--chart-1` … `--chart-N` tokens (3 callers waiting)

- **Priority:** P2 · **Effort:** S
- **What**: Three Wave 3 surfaces need a real categorical chart palette and currently each route through a different workaround:
  - `src/components/optimize/equity-overlay-chart.tsx` ships literal hex (`["#2196F3", "#26a69a", "#FF9800", ...]`) bypassing the token system.
  - `src/components/monte-carlo/v2/daily-pnl-chart.tsx` + `mode-distribution-chart.tsx` shoehorn engine modes through `trade-buy`/`trade-sell`/`acc-100`/`bg-300`.
  - `src/components/equity-shield/equity-shield-chart.tsx` `strokeColor` map differentiates original/method1/method2 — post-sweep, method1 + original now both render at `acc-100` (no cross-chart hue differentiation) because we re-tokened off `trade-buy`.
    Promote `--chart-1` … `--chart-7` in `globals.css` (dark + light values) and a `getChartColor(index)` helper. Wire all three surfaces. Combines with the `comparison-colors.ts` overhaul under Account comparison.
- **Why**: Token-discipline drift compounds across surfaces. With three callers waiting, the ROI per hour is now best-in-backlog for the whole "design surface tokens" cluster.
- **Source**: `docs/scans/2026-05-12-impeccable-backtest-optimize.md` Phase 1b audit P2; `docs/scans/2026-05-12-impeccable-monte-carlo.md` Phase 1a P3; `docs/scans/2026-05-12-impeccable-equity-shield.md` Phase 4 enhancement.

### Portuguese literal "(atual)" in sweep-config

- **Priority:** P3 · **Effort:** XS
- **What**: `src/components/optimize/sweep-config-panel.tsx` line ~275 hardcodes `(atual)` as a JSX child. Rest of the surface goes through `useTranslations("optimize")`. Add `currentValueSuffix` key (or similar) to `messages/{en,pt}.json` and substitute.
- **Why**: Locale-bleed; the EN build still ships "(atual)".
- **Source**: `docs/scans/2026-05-12-impeccable-backtest-optimize.md` Phase 1b audit P2.

### `StatCard` variant API: split signed-money vs verdict (equity-shield-stats)

- **Priority:** P3 · **Effort:** XS
- **What**: `src/components/equity-shield/equity-shield-stats.tsx` `StatCard.variant: "default" | "positive" | "negative" | "pass" | "fail"` mixes two semantic families on one prop. `positive`/`negative` paint `trade-buy`/`trade-sell` (signed-money — correct). `pass`/`fail` paint `fb-success`/`fb-error` (verdict — correct after row #15 sweep). Two distinct semantics on a single discriminated union is a foot-gun: the next person who adds a "passing" StatCard might pick `positive` instead of `pass`. Split into `signedVariant: "positive" | "negative" | null` + `verdictVariant: "pass" | "fail" | null`, or extract a separate `VerdictBadge` component.
- **Why**: Token vocabulary is correct now; the API still tempts future drift. Costs 15 minutes; removes a permanent foot-gun.
- **Source**: `docs/scans/2026-05-12-impeccable-equity-shield.md` Phase 4 enhancement.

### Monte Carlo v1 distribution-histogram tooltip count is sign-colored

- **Priority:** P3 · **Effort:** XS
- **What**: `src/components/monte-carlo/distribution-histogram.tsx` `CustomTooltip` paints the simulation-count line with `text-trade-buy` / `text-trade-sell` based on `midPoint >= 0`. The number is a _count_ (e.g. "84 simulations (12.1%)"), not signed money. v2's tooltip is already fixed in row #13; v1 was kept hold-pattern to avoid touching shared bar-fill logic until the categorical palette decision lands.
- **Why**: Same threshold-as-P&L vocabulary hijack that's been swept everywhere else in Wave 3 — last sliver.
- **Source**: `docs/scans/2026-05-12-impeccable-monte-carlo.md` Phase 4 enhancement.

### `ComparisonRow` delta branch — retire or commit (risk-simulation summary-cards)

- **Priority:** P3 · **Effort:** XS
- **What**: `src/components/risk-simulation/summary-cards.tsx` `ComparisonRow` carries an unused `delta`/`deltaPositive` prop branch. All four current callsites pass only `originalValue`/`simulatedValue`. The branch paints `text-trade-buy` / `text-trade-sell` — which is the wrong vocabulary for any of the comparison metrics shown (win-rate, profit-factor, avg-R, max-drawdown are not signed P&L). When the delta UI ships, rename the prop semantics to `signed`/`positive` and re-token the palette to fit the metric, OR delete the prop today since it's unreachable.
- **Why**: Dead-code drift on a colorized branch is a pre-loaded foot-gun — the next person who hooks up delta will silently inherit the wrong vocabulary.
- **Source**: `docs/scans/2026-05-12-impeccable-risk-simulation.md` Phase 1a P2 + Phase 4 enhancement.

### Verdict-triad palette consolidation (`--color-rule-{blocked,paused,executed}`)

- **Priority:** P3 · **Effort:** S
- **What**: Wave 3 produced a consistent rule-engine verdict vocabulary: `fb-error` (blocked by loss/limit rule), `warning` (paused on purpose — target, gain-stop), `fb-success` (engine ran trade / recovery completed), `txt-300` (data N/A — no SL, max trades). Now used in three places: monte-carlo `kelly-criterion-card.conservative` + `strategy-analysis.Insight`, risk-simulation `trade-comparison-table.statusDotColors` + `day-trace-card` footer + `preview-banner` success twin. If a fourth surface needs it, promote to dedicated tokens (`--color-rule-blocked`, `--color-rule-paused`, `--color-rule-executed`, `--color-rule-na`) so the vocabulary is grep-able and themeable independently from `fb-*`/`warning`.
- **Why**: Today the aliasing works because `fb-error` semantically maps to "rule blocked" — but the moment design changes warning color (e.g. amber for non-critical-pause), the rule-paused state would silently drift. Decouple before the divergence.
- **Source**: `docs/scans/2026-05-12-impeccable-risk-simulation.md` Phase 4 enhancement.

### Gauge verdict palette — document canonical 4-zone mapping in DESIGN.md

- **Priority:** P3 · **Effort:** XS
- **What**: `src/components/fractal-plan/target-actual-gauge.tsx` now applies a 4-zone verdict palette: `negative → fb-error`, `behind (≥0, <50% of target) → bg-bg-300/text-txt-100`, `onTrack (≥50%, <100% of target) → warning`, `ahead (≥100%) → fb-success`. Same shape will apply to any future target-vs-actual gauge (e.g. weekly cap consumption, daily R cap progress). Add the named "gauge verdict palette" to `DESIGN.md` so the next gauge widget inherits the vocabulary instead of re-inventing.
- **Why**: Wave 4 picked the palette by analogy from Wave 3's rule-engine triad. Documenting it as the canonical gauge vocabulary keeps future gauges from reaching for `acc-100` again.
- **Source**: `docs/scans/2026-05-12-impeccable-plan-wave4.md` Phase 4 reflection.

### `STATUS_DOT` triad duplication across DARF widgets

- **Priority:** P3 · **Effort:** S
- **What**: The same DARF-status → color-token map (`paid → fb-success`, `pending → warning`, `overdue → fb-error`, `exempt/unknown → txt-300/bg-300`, `in_progress → action-buy`, `future → bg-400`) is duplicated in `src/components/fractal-plan/cockpit/quarter-month-card.tsx` and `src/components/fractal-plan/cockpit/month-darf-row.tsx`, and a sibling `STATUS_DOT` exists in `darf-strip.tsx`. Extract a shared `<DarfStatusDot status={…} />` (or just a colocated map) so the next DARF surface inherits the triad without copy-paste drift.
- **Why**: Three callers with hand-aligned maps is the threshold where the next contributor will copy the closest one and silently fork the vocabulary. Cheap to consolidate while the maps still match.
- **Source**: `docs/scans/2026-05-12-impeccable-plan-wave4.md` Phase 4 reflection.

### Tab-panel `aria-controls` wiring in `new-trade-tabs.tsx`

- **Priority:** P2 · **Effort:** S
- **What**: `src/components/journal/new-trade-tabs.tsx` has four tab buttons (`single`, `csv`, `nota`, `screenshot`) with `role="tab"` and `aria-selected`, but no `aria-controls` mapping to a panel id. The four panels currently share one wrapper `<div role="tabpanel">` so the mapping isn't possible without a refactor: give each panel a stable id and toggle the rendered panel by id. WCAG ARIA-1.0 tab/tabpanel pattern requires the controls/labelledby pair.
- **Why**: Screen reader users today land on a "tabpanel" with no announced relationship to the selected tab. Low-effort fix once the panels are split. Bundle with the admin a11y pass below.
- **Source**: `docs/scans/2026-05-12-impeccable-form-editors-wave5.md` Phase 1b deferred.

### Document verdict-triad mapping for 5-point rating scales in DESIGN.md

- **Priority:** P3 · **Effort:** XS
- **What**: Wave 5 fixed `trade-form.tsx GRADE_COLORS` from a trade-buy/sell hijack to the canonical verdict triad: `A → fb-success`, `B → fb-success/70`, `C → warning`, `D → fb-error/70`, `F → fb-error`. Same shape will recur in future 5-point rating UIs (discipline rating, setup-confidence rating, post-trade journal grade). Document the named "rating verdict palette" in DESIGN.md so the next 5-point scale inherits it.
- **Why**: Rating scales are the highest-risk surface for verdict-as-P&L hijacks because A=good naturally invites green. Codifying the mapping in DESIGN.md keeps the next contributor from reaching for trade-buy on reflex.
- **Source**: `docs/scans/2026-05-12-impeccable-form-editors-wave5.md` Phase 4 deferred.

### Document tab-active treatment in DESIGN.md

- **Priority:** P3 · **Effort:** XS
- **What**: `border-acc-100 text-acc-100` is the conventional active-tab indicator across the app (`new-trade-tabs.tsx`, AnimatedTabs, journal tabs). It is **not** a bronze hijack — only one tab is active at a time and the pattern mirrors Linear/Raycast active-tab convention. Document this in DESIGN.md as the canonical tab-active treatment so the next tab UI doesn't reach for `fb-success` ("active = good") or other off-brand alternatives.
- **Why**: Without canonicalization, the question "should this be acc-100 or fb-success?" will recur on every new tab UI. Codify once.
- **Source**: `docs/scans/2026-05-12-impeccable-form-editors-wave5.md` Phase 4 deferred.

### Extract shared `<ToggleStateIcon isActive />` primitive

- **Priority:** P2 · **Effort:** S
- **What**: Four settings widgets now duplicate the same `isActive ? <ToggleRight className="text-fb-success" aria-hidden /> : <ToggleLeft className="text-txt-300" aria-hidden />` map: `src/components/settings/asset-list.tsx`, `src/components/settings/timeframe-list.tsx`, `src/components/settings/indicator-definition-table.tsx`, `src/components/settings/indicator-group-cards.tsx`. Pull into `@/components/ui/toggle-state-icon` so future "enabled / disabled" rows inherit the verdict-triad mapping by default.
- **Why**: Four hand-aligned maps is the threshold where the next contributor copies the closest one and silently forks the vocabulary back to trade colors. The Wave 6 sweep just retoned all four; preventing the drift recurring is cheap now.
- **Source**: `docs/scans/2026-05-12-impeccable-settings-wave6.md` Phase 4 deferred.

### Admin-widget decorative-icon a11y pass + `<TabsTrigger>` `aria-controls`

- **Priority:** P2 · **Effort:** M
- **What**: ~25 decorative lucide icons inside text-bearing `<Button>` triggers across `bug-reports-list.tsx`, `tag-list.tsx`, `condition-list.tsx`, `indicator-list.tsx`, `user-list.tsx`, `tag-form.tsx`, `condition-form.tsx`, `account-settings.tsx`, `trading-account-settings.tsx` lack `aria-hidden="true"`. Bundle with wiring explicit `aria-controls` from each `<TabsTrigger>` in `settings-content.tsx` (and the wider `<Tabs>` users: `new-trade-tabs.tsx`, profile tabs) to their `<TabsContent>` panels so screen-reader tab/tabpanel semantics are complete.
- **Why**: Touching the tab strip and its widgets twice would be wasteful. One coordinated admin-a11y pass fixes both layers, and the Wave 6 sweep already canonicalized the icon usage so the next pass is purely additive.
- **Source**: `docs/scans/2026-05-12-impeccable-settings-wave6.md` Phase 4 deferred.

### Document operation-outcome verdict mapping in DESIGN.md

- **Priority:** P3 · **Effort:** XS
- **What**: Wave 6 fixed `recalculate-button.tsx` and `recalculate-pnl-button.tsx` from a `text-trade-buy / text-trade-sell` outcome banner to the verdict triad (`text-fb-success / text-fb-error`). The same shape will recur in every future async-action result banner (export job complete, recompute month complete, bulk import done, etc.). Document the "operation-outcome verdict palette" in DESIGN.md.
- **Why**: Operation outcomes are the second-most-common verdict-as-P&L hijack site after rating scales. Codifying the mapping in DESIGN.md prevents the next async banner reaching for trade-buy on reflex.
- **Source**: `docs/scans/2026-05-12-impeccable-settings-wave6.md` Phase 4 deferred.

### Extract shared `<Spinner aria-hidden />` and `<BackLink>` primitives

- **Priority:** P2 · **Effort:** S
- **What**: Wave 7 normalized 9 `<Loader2 className="animate-spin motion-reduce:animate-none" />` sites and 4 `<ArrowLeft />`+text "back" patterns across auth components. The same shapes recur in many product surfaces (dashboard, journal, plan). Pull into `@/components/ui/spinner` (encapsulates `animate-spin`, `motion-reduce:animate-none`, `aria-hidden="true"`) and `@/components/ui/back-link` (encapsulates the ArrowLeft+text pattern with proper a11y) so future callers inherit the defaults rather than drifting.
- **Why**: Both patterns are universal enough that not having a primitive is the source of every "should I add aria-hidden?" question. Adding the primitive closes the question.
- **Source**: `docs/scans/2026-05-12-impeccable-auth-wave7.md` Phase 4 deferred.

### Delete or merge `src/components/auth/account-picker.tsx`

- **Priority:** P3 · **Effort:** S
- **What**: The standalone `<AccountPicker />` component (134L) is unused — `login-form.tsx` inlines its own account-selection step (L149-265) rather than importing it. Either replace the inline step with `<AccountPicker />` to consolidate the implementations, or delete the orphaned file.
- **Why**: Two implementations of the same UX silently drift. The inline copy already differs slightly from the standalone (`p-m-400` vs `p-m-400 min-h-11`, different selected-state ring chrome). Pick one.
- **Source**: `docs/scans/2026-05-12-impeccable-auth-wave7.md` Phase 4 deferred.

### Document auth surface as canonical verdict-triad example in DESIGN.md

- **Priority:** P3 · **Effort:** XS
- **What**: Wave 7's scan confirmed the auth surface has zero trade-color hijacks — every status state uses the verdict triad (`fb-success` for confirmed/verified, `fb-error` for invalid input, `warning` slot unused). This makes auth the canonical reference example for "how status colors should work" across the codebase. Document it in DESIGN.md with cross-links to the relevant files.
- **Why**: The settings/dashboard surfaces still drift toward `trade-buy/sell` for non-monetary verdict states. Pointing at a known-good reference shortens future arguments.
- **Source**: `docs/scans/2026-05-12-impeccable-auth-wave7.md` Phase 4 deferred.

### Catalogue temporal-state-as-P&L hijack in DESIGN.md

- **Priority:** P3 · **Effort:** XS
- **What**: Wave 8 surfaced a third hijack flavor: market session state ("open") painted as trade-color green. Waves 1-7 documented verdict-as-P&L and category-as-P&L; this completes the trio. Add a short DESIGN.md paragraph: _"Any status indicator whose semantic domain is not signed monetary magnitude reaches for the verdict triad (`fb-success` / `fb-error` / `warning` / `txt-300`). `trade-buy` / `trade-sell` are reserved for the magnitude itself."_
- **Why**: Pre-empts the next variant. Broker-connection status, data-feed health, session timers, and similar future surfaces will all face the same temptation.
- **Source**: `docs/scans/2026-05-12-impeccable-public-wave8.md` Phase 4 deferred.

### Add "no side-stripe borders" rule to DESIGN.md with worked example

- **Priority:** P3 · **Effort:** XS
- **What**: Side-stripe borders are now the highest-recidivism absolute ban — caught at Wave 4 (plan cards) and again at Wave 8 (`hero-quote-card.tsx`). Add a DESIGN.md note with the hero-card before/after showing how the colored `changePercent` already conveys direction, making the stripe redundant chrome.
- **Why**: The pattern keeps recurring because it borrows from Linear/Raycast vocabulary — but those products use stripes for **selection**, not direction. Without an explicit anti-example in DESIGN.md, the next contributor will reach for it again.
- **Source**: `docs/scans/2026-05-12-impeccable-public-wave8.md` Phase 4 deferred.

### Delete or wire `src/components/market/auto-refresh-indicator.tsx`

- **Priority:** P3 · **Effort:** S
- **What**: 128-line component, zero imports. `MarketMonitorContent` inlines its own refresh indicator in the header rather than mounting this one. Either restore it as the canonical refresh-indicator (replace the inline header version) or delete the file outright.
- **Why**: Same drift risk as the `account-picker.tsx` orphan flagged in Wave 7. Two implementations of the same indicator UX will silently diverge. Wave 8 fixed the trade-color hijack here defensively; the next maintainer should not have to wonder which one to update.
- **Source**: `docs/scans/2026-05-12-impeccable-public-wave8.md` Phase 4 deferred.

### Consolidate `/monitor` and `/painel` via locale routing

- **Priority:** P3 · **Effort:** S
- **What**: Two route files (`src/app/[locale]/(public)/{monitor,painel}/page.tsx`) mount the identical `<MarketMonitorContent />` widget. `/painel` is the PT-BR alias for `/monitor`. Replace the duplicate page file with a `next-intl` URL alias or pathname-routing config so the alias is a redirect/rewrite, not a copy.
- **Why**: Today both files must be kept in sync by hand. With ~10 lines each it is cheap today; with localized routes growing, the pattern will scale poorly.
- **Source**: `docs/scans/2026-05-12-impeccable-public-wave8.md` Phase 4 deferred.

---

## Design system docs

### Consolidate axion-design-brief.md + design-context.md into DESIGN.md

- **Priority:** P2 · **Effort:** XS
- **What**: Merge `docs/axion-design-brief.md` (visual identity / brand brief) and `docs/design-context.md` (user context + design principles) into a single `docs/DESIGN.md`. Update CLAUDE.md routing table to point to the new file.
- **Why**: Any design review agent currently reads two files to calibrate. A single `DESIGN.md` reduces per-session overhead and is the expected convention for design system routing in gstack skills.
- **Depends on**: none — can be done independently.
- **Source**: `/plan-design-review` on `feat/hawks-mode-v0` (2026-05-13).

---

## Documentation drift watch

- **Priority:** P3 · **Effort:** XS
- **Design doc Phase 3 / §12 Open Questions**: `docs/design/zero-to-hero-e2e.md` §12-13 was the original rollout spec. Stages 0-8 ship; Phase 3 is functionally done except for the multi-month seeder + CI wiring (both captured above). When those land, retire §13 Phase 3 in favour of a one-liner pointing here.

---

## Wave 9 HAWKS deferred items

Surfaced during the 2026-05-13 Wave 9 HAWKS sweep ([runbook](impeccable-page-runbook.md), logs at `docs/scans/2026-05-13-impeccable-*-hawks.md`). Logged here because each requires either product/copy review, a wider primitive change, or another team's input — none are local code edits.

### HAWKS pre-flight switch copy review (en + pt-BR)

- **Priority:** P2 · **Effort:** S
- **What**: Each switch in `HawksTradeFields` ships with a `*Label` + `*Hint` pair where the hint repeats the label (e.g. "Triple screen confirmed?" + "Did your 5-screen checklist hold at entry?"). The hint adds no information.
- **Why now**: Phase 1a P1 finding in `docs/scans/2026-05-13-impeccable-trade-form-hawks.md`. Voice-gate review needed before edit; one of: drop hints, or rewrite as one-clause clarifiers.
- **Source**: `src/messages/en.json` + `src/messages/pt-BR.json` under `hawks.tradeFields.*`. Component: `src/components/hawks/hawks-trade-fields.tsx`.

### HAWKS daily bias "Save" vs "Confirm" verb tidy

- **Priority:** P3 · **Effort:** XS
- **What**: `DailyBiasForm` save button switches between `common.save` (when a row exists) and `hawks.bias.confirmAction` (when fresh). Two verbs for the same action class. Settle on one — recommend "Save" everywhere, with a sub-line "Bias confirmed at HH:MM" after first write.
- **Source**: `src/components/hawks/daily-bias-form.tsx:200`.

### HAWKS settings tab copy voice gate

- **Priority:** P3 · **Effort:** XS
- **What**: `t("statusActive") / t("statusInactive")` + `t("description")` not yet voice-checked in en + pt-BR. Reject cheerful filler ("You're on!", "Switched off") if present.
- **Source**: `src/messages/{en,pt-BR}.json` under `hawks.settings.*`.

### Trade-form draft-after-deactivation edge

- **Priority:** P2 · **Effort:** S
- **What**: If a draft trade is saved with HAWKS mode active and reloaded after the trader deactivates HAWKS, the persisted `hawks.*` payload is silently dropped (the `<HawksTradeFields>` block is not rendered, so its values never reach the submit). Either preserve the values invisibly or warn the user at draft-restore.
- **Source**: `src/components/journal/trade-form.tsx` + `src/components/hawks/hawks-trade-fields.tsx`.

### Coaching `tradeCount` pluralisation

- **Priority:** P3 · **Effort:** XS
- **What**: `coaching.tradeCount` renders "1 trades analyzed". Needs ICU plural form or `t("tradeCount", { count })` with plural-aware messages.
- **Why now**: P2 finding in dashboard-hawks Phase 1a. Same shape as any other plural string — backlog because the project may want a generalised plural-aware helper rather than per-string fixes.
- **Source**: `src/components/hawks/hawks-coaching-insights-card.tsx:177`.

### Coaching card title size on mobile

- **Priority:** P3 · **Effort:** XS
- **What**: `text-small sm:text-body` makes the HAWKS coaching card title visibly smaller than sibling dashboard card titles at mobile widths. Either bump to `text-body` unconditionally or introduce a `<CardTitle>` primitive that enforces a consistent size across all dashboard cards.
- **Source**: `src/components/hawks/hawks-coaching-insights-card.tsx:171`.

### Coaching insight `useEffect` brittleness

- **Priority:** P2 · **Effort:** S
- **What**: `useEffect(() => { ... }, [])` with `hasLoadedRef` gating is a workaround for the absence of an initial server-side load. Cleaner: pass `initialContext` from a Server Component prop and drop the effect entirely.
- **Source**: `src/components/hawks/hawks-coaching-insights-card.tsx:150`.

---

## How to retire an item from this backlog

1. Implement the work.
2. Update any other doc that still has deferred prose ("Phase 2 will…", "future iteration may…") pointing at this entry — replace with a concrete reference to the shipped commit/PR, or delete the prose entirely.
3. **Delete the entry from this file in the same PR that ships the work.** Don't strikethrough; don't move it elsewhere; don't add a "Recently shipped" footnote. The shipping commit + git history are the audit trail.

Result: the active backlog is exactly what's still in front of us, priority-descending. No separate "what shipped" register lives in this file.
