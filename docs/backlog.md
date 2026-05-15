# Backlog — Commit-Ready Deferred Work

This file is the canonical home for **commit-ready deferred work**: ideas that have a concrete shape, a known source, a rough effort, and a priority. Half-formed thoughts and exploratory ideas live in [`docs/ideas.md`](ideas.md) and graduate here once they pass the promotion bar.

## Why this file exists

Inline `// TODO`, "Phase 2 will…", and "future iteration may…" notes scatter knowledge across the codebase. By the time the work matters again, the context is lost and the note rots. This file consolidates the next-action-ready slice so we can:

- **Cherry-pick** the next P1 without a codebase grep tour.
- **Avoid losing concrete plans** when the original spec/scan ages out.
- **See the shape of debt** at a glance — which clusters keep growing, which are dormant, what we're choosing not to do.

## Backlog vs. ideas

| File                          | What lives here                                                                                                                                                      | Promotion rule                                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/ideas.md`               | Half-formed ideas, "we should think about X", strategic seeds, anything missing a clear shape or effort estimate. Cheap to file, cheap to delete.                    | Once an idea has a **Source**, a rough **Effort**, a **Priority**, and a one-paragraph "what + why", promote it here.                                                        |
| `docs/backlog.md` (this file) | Concrete, commit-ready deferred work. Every entry has Priority, Effort, Source, and a `What + Why` clear enough that someone other than the author could pick it up. | When shipped, **move to the `## DONE` section at the bottom of this file** with a `completed_date` and the shipping commit hash. Do not delete — DONE is the shipped record. |

## Conventions

- **Priority**: `P0` blocker / safety / data-correctness · `P1` strategic shortlist (highest ROI, ship next) · `P2` valuable but not blocking · `P3` nice-to-have / polish.
- **Effort**: `XS` <1h · `S` half-day · `M` 1-2 days · `L` multi-day · `XL` multi-sprint.
- Every entry has a **Source** line linking back to the doc/spec/file that surfaced it. Update the source when you cherry-pick.
- **Ordering — higher priority sits on top** so a top-to-bottom scan always surfaces "what's next" first. Two layers:
  1. Capability sections themselves are ordered roughly by where the highest-priority work lives. The `## P1 strategic shortlist` always leads the file.
  2. Within each capability section, entries are sorted by priority descending: `P1` first, then `P2`, then `P3`. When adding a new entry, slot it by priority — do not append blindly.
- **When a feature lands, move it to the `## DONE` section at the bottom of this file** with a `completed_date` field. Do not strikethrough-and-leave-in-place. Do not delete the entry outright — the DONE log is the record of what shipped and why. The active backlog above DONE only contains work still in front of us.
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

### Strategy versioning v1 — methodology immutability

- **Priority:** P1 · **Effort:** L
- **Problem**: strategies + their `strategyConditions` are mutable today. If a user edits a strategy after trades reference it, those trades' `setupRank` rationale silently rewrites — the journal loses its "what did I believe at execution time" record. Soft-delete on conditions (landed alongside `trade_conditions` junction, 2026-05-15) bridges the gap, but the real fix is immutability with explicit forks.
- **Schema (proposed, design-review first)**:
  - `strategies.parentStrategyId uuid null` self-FK
  - `strategies.version int default 1`
  - `unique(userId, slug, version)`
  - `trades.strategyId` continues to point at a specific version row (no migration needed for existing trades — they pin to whichever version was current at write).
  - `strategyConditions` stays per-version, never mutated after the first trade lands on its parent.
- **Write rules (enforced in actions, not DB)**:
  - A strategy becomes "live" once at least one trade references it.
  - Live strategies are read-only. Edit attempts surface a "Create new version" CTA instead of saving in place.
  - "Create new version" copies the parent + opens the edit form on the copy. Conditions copy too, then become editable on the draft.
- **UX**:
  - Version dropdown on strategy detail (v1, v2, v3 — current bolded).
  - "Fork to v2" button on live strategies.
  - Dashboards: cohort-split by version so users can compare their refinements.
- **Depends on**: `trade_conditions` junction (landed 2026-05-15, see DONE) — versioning is the immutability story the junction makes meaningful.
- **Source**: surfaced 2026-05-15 during `/plan-eng-review` of the `trade_conditions` design. User insight: _"Conditions should not change after any trade is linked to the strategy. If condition changed it's not the same strategy anymore."_ Wants `/plan-design-review` before scoping the build.

---

## Journey suite (`e2e/journey/`)

### Fixed Bravo email + per-chain DB reset

- **Priority:** P3 · **Effort:** S
- **What**: Replace `bravo-${Date.now()}@axion-demo.com` with a fixed email backed by a globalSetup that cascade-deletes + reinserts the Bravo row at chain start.
- **Why**: Recognizable identity in the showcase video (sales/marketing pickup). Today the timestamped email is the cheapest workaround for the DB-backed login rate-limit (`login:<email>` in `src/app/actions/auth.ts`).
- **Source**: `e2e/journey/fixtures/bravo-seed.ts` header; `e2e/journey/README.md` "Bravo persona".

### Tag-based filtering

- **Priority:** P3 · **Effort:** XS
- **What**: Wire `@journey` / `@stage:<name>` JSDoc tags to Playwright's `--grep` so contributors can run "all weekly+ stages" with one flag.
- **Why**: Today the suite uses `--project=journey-NN-...` selection, which is explicit but verbose for partial-chain runs.
- **Source**: `e2e/journey/README.md` "Tags".

### Edge-case separation pass

- **Priority:** P2 · **Effort:** M
- **What**: Audit existing `e2e/tests/*.spec.ts` for overlap with the journey suite — keep edge cases, deprecate happy-path duplication. Add new `e2e/<feature>-edge/` specs as needs surface.
- **Why**: Two suites covering the same happy path is wasted CI minutes and split maintenance.
- **Source**: `docs/design/zero-to-hero-e2e.md` §13 Phase 4 (ongoing).

> Onboarding integration (Product-owned) → moved to [`docs/ideas.md`](ideas.md) — still needs product decisioning before it has a concrete shape.

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

## Journal-list polish (deferred from sweep)

### Listbox-style arrow-nav within trade-day-group

- **Priority:** P3 · **Effort:** M
- **What**: After the TradeRow Link migration, focus moves row-by-row on Tab. For dense days (30+ trades) consider a listbox roving-tabindex pattern so ↑↓ navigates between rows without leaving the day group, and Tab leaves the group entirely.
- **Why**: Power-user shortcut. Not blocking — Tab works fine — but the cockpit register favors keyboard density.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-list.md` Phase 1b P1.

---

## Command Center polish (deferred from sweep)

- **BiasSelector auto-save toast** — P1. The non-edit row's BiasSelector auto-saves silently (spinner only). Add toast confirmation so AT users + anyone whose focus moved get a status signal. Flagged in `docs/scans/2026-05-12-impeccable-command-center.md` Phase 1a P1.

---

## Currency formatting — account-aware compact formatters

- **Priority:** P2 · **Effort:** M
- **What**: `formatCompactCurrency`, `formatCompactCurrencyWithSign`, `formatBrlWithSign`, `formatBrlCompactWithSign` in `src/lib/formatting.ts` take a raw `symbol` string (or hardwire `"R$"`). Wire them to read from the active account's `currency` (or fall back to `user.defaultCurrency`) so a USD account never renders `R$10K`. The full-form `formatCurrency`/`formatCurrencyWithSign` already accept an optional `currency` parameter — the compact siblings should match that shape, plus a hook (e.g. `useAccountCurrency`) that resolves the active account's symbol once.
- **Why**: The schema already stores per-account `currency` (`schema.ts:361`) and per-user `defaultCurrency` (`schema.ts:173`, `:1389`), but the dashboard hardcodes `"R$"` at every call site (`pnl-card.tsx:34`, `quick-stats.tsx:90/103`, all `equity-curve.tsx` axes/tooltips, every chart tick formatter). The moment a non-BRL account exists, every compact display lies.
- **Source**: `docs/scans/2026-05-12-impeccable-dashboard.md` Phase 2d.

---

## Playbook list — deferred follow-ups

### Distill pass — `/playbook` reads as nested cards

- **Priority:** P3 · **Effort:** M
- **What**: The compliance overview and the strategy grid each live inside their own `border-bg-300 bg-bg-200 rounded-lg border` wrapper, and the strategy grid itself contains up to ~10 `StrategyCard` boxes — yielding a "cards inside a card" structure. Either drop the outer chrome on the strategy section (let the cards float on the page background and use a section heading instead), or remove the per-card border and let the section wrapper provide the boundary.
- **Why**: Shared design law: "nested cards are always wrong." Two layers of borders compete for attention and consume horizontal whitespace.
- **Source**: `docs/scans/2026-05-12-impeccable-playbook-list.md` Phase 1a P2.

---

## Journal detail — deferred follow-ups

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

### Uniform card stack across `/analytics`

- **Priority:** P3 · **Effort:** M
- **What**: Eleven sibling cards (variable comparison, equity curve, EV, R-dist, tags, heatmap+session, session-asset table, hourly+day-of-week, holding period) all render with identical `border-bg-300 bg-bg-200 rounded-lg` chrome. Nothing earns visual prominence.
- **Why**: Same shared-law violation as `/journal/[id]` — "vary spacing for rhythm; cards are the lazy answer." Group into 3-4 logical bands with deliberate spacing variance, or promote one anchor metric (EV or cumulative equity) above the card grid.
- **Source**: `docs/scans/2026-05-12-impeccable-analytics.md` Phase 1a critique P2. Scope-extends the existing "Card-rhythm distill pass" item — handle as part of a unified analytics distill, not a separate slice.

---

## Reports — deferred follow-ups

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

### `StatCard` variant API: split signed-money vs verdict (equity-shield-stats)

- **Priority:** P3 · **Effort:** XS
- **What**: `src/components/equity-shield/equity-shield-stats.tsx` `StatCard.variant: "default" | "positive" | "negative" | "pass" | "fail"` mixes two semantic families on one prop. `positive`/`negative` paint `trade-buy`/`trade-sell` (signed-money — correct). `pass`/`fail` paint `fb-success`/`fb-error` (verdict — correct after row #15 sweep). Two distinct semantics on a single discriminated union is a foot-gun: the next person who adds a "passing" StatCard might pick `positive` instead of `pass`. Split into `signedVariant: "positive" | "negative" | null` + `verdictVariant: "pass" | "fail" | null`, or extract a separate `VerdictBadge` component.
- **Why**: Token vocabulary is correct now; the API still tempts future drift. Costs 15 minutes; removes a permanent foot-gun.
- **Source**: `docs/scans/2026-05-12-impeccable-equity-shield.md` Phase 4 enhancement.

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
2. Update the original `Source` if it still has the deferred prose ("Phase 2 will…", "future iteration may…") — replace with a concrete reference to the shipped commit/PR, or delete the prose entirely.
3. Move the entry to the `## DONE` section below in the same PR. Strip the prose body, keep the title + the new `completed_date` line + a one-sentence "what shipped" + the shipping commit hash.
4. Do not strikethrough-and-leave-in-place. Do not delete the entry outright — the DONE log is how we remember what shipped and why.

Result: the active backlog above DONE only contains work still in front of us, priority-descending. DONE is the shipped record.

---

## DONE

Shipped items, newest first. Each entry: title · `completed_date` · one-line "what shipped" · commit hash.

### 2026-05-15

- **Mobile-detect via container query in `period-filter.tsx`** — P3. `useEffect` + `window.matchMedia("(max-width: 419px)")` replaced with Tailwind v4 container queries (`@container` on root + `@max-[419px]:block hidden` / `@max-[419px]:hidden`). Renders two `DateRangePicker` instances (1-month + 2-month) and CSS-toggles visibility — eliminates SSR hydration flash. Pending commit.
- **`h-50` Suspense-fallback height rationalization** — P3. All 10 `className="h-50"` sites (7 page.tsx Suspense fallbacks + 2 analytics empty-state divs + journal-content.tsx loading state) swapped to `min-h-48` — 200px → 192px is imperceptible, no new tokens needed, spacing scale stays clean at `l-900` boundary. Scan listed 6 sites; rg pass found 10. Pending commit.
- **Hardcoded BRL in `formatCentsAsCurrency` call sites** — P3. `backtest-summary-cards.tsx` and `backtest-trades-table.tsx` now accept optional `currency?: string` prop (defaults to `"BRL"`); all 4 + 1 formatter calls read from the prop. Surgical fix — wiring through a `useAccountCurrency` hook would have rippled into every parent; the prop is the seam multi-currency callers will use. Pending commit.
- **Monte Carlo v1 distribution-histogram tooltip count retoned** — P3. `src/components/monte-carlo/distribution-histogram.tsx` `CustomTooltip` count line moved from sign-based `text-trade-buy` / `text-trade-sell` to neutral `text-txt-100`. Bar fill untouched (separate concern). Last sliver of Wave 3 threshold-as-P&L hijack. Pending commit.
- **`ComparisonRow` delta branch retired** — P3. `src/components/risk-simulation/summary-cards.tsx` `delta` / `deltaPositive` prop branch + JSX deleted; all 4 callsites already passed only `originalValue`/`simulatedValue`. Foot-gun removed; cleaner to re-add when delta UI actually ships. Pending commit.
- **`<DarfStatusDot>` primitive extracted** — P3. Unified DARF-status → color-token map (`paid → fb-success`, `pending → warning`, `overdue → fb-error`, `exempt/unknown → txt-300/bg-300`, `in_progress → action-buy`, `future → bg-400`) into `src/components/ui/darf-status-dot.tsx`. Three callers migrated (`quarter-month-card.tsx`, `month-darf-row.tsx`, `darf-strip.tsx`). All three maps were byte-identical — extraction was overdue. Pending commit.
- **`<ToggleStateIcon isActive />` primitive extracted** — P2. New `src/components/ui/toggle-state-icon.tsx` (props `{ isActive: boolean; className?: string }`, `aria-hidden="true"`, verdict-triad tokens `text-fb-success` / `text-txt-300`). Four settings widgets migrated (`asset-list.tsx`, `timeframe-list.tsx`, `indicator-definition-table.tsx`, `indicator-group-cards.tsx`). All four had identical `h-4 w-4` sizing — no variance to preserve. Pending commit.
- **`<Spinner />` + `<BackLink />` primitives extracted** — P2. New `src/components/ui/spinner.tsx` (props `{ className?: string; size?: "sm" | "md" | "lg" }`, encapsulates `Loader2` + `animate-spin motion-reduce:animate-none` + `aria-hidden="true"`) and `src/components/ui/back-link.tsx` (props `{ href: string; children: ReactNode; className?: string }`, encapsulates `next/link` Link + `ArrowLeft` + `text-txt-300 hover:text-txt-200`). 8 spinner sites + 2 Link-based back-link sites migrated across `forgot-password-form.tsx`, `login-form.tsx`, `register-form.tsx`, `verify-email-form.tsx`. 2 Button-based "back" sites correctly left alone (different semantic — navigation vs onClick action). Pending commit.
- **Orphan `account-picker.tsx` deleted** — P3. `src/components/auth/account-picker.tsx` (134 lines) removed; export stripped from `src/components/auth/index.ts`. Verified zero consumers via rg. Live version is the inlined step in `login-form.tsx` (L149-265) which had already diverged in details. Pending commit.
- **Orphan `auto-refresh-indicator.tsx` deleted** — P3. `src/components/market/auto-refresh-indicator.tsx` (128 lines) removed. Verified zero consumers via rg. Live version is the inlined header refresh-indicator in `MarketMonitorContent`. Pending commit.
- **`useTransition` on Command Center refresh callbacks** — P2. `refreshCompletions` / `refreshDailyPlan` / `refreshAssetSettings` in `command-center-content.tsx` wrapped in `useTransition`; child panels (`daily-checklist`, `pre-market-notes`, `post-market-notes`, `asset-rules-panel`) receive `isRefreshing` prop and surface `aria-busy` + `opacity-60` dim during in-flight fetches. Pending commit.
- **Mood/Bias primitive resolution — complementary, not overlapping** — P2. `MoodSelector` now wraps `SegmentedToggle` (tone dot moved into `label` ReactNode slot) so form-context controls share one a11y model with Hawks daily-bias. `SegmentedToggle` gained Left/Right/Up/Down/Home/End arrow-key navigation (completes the WAI-ARIA radiogroup pattern) and accepts `null | undefined` for the unset state with the first option staying tabbable. `BiasSelector` stays as Radix `Select` per table-cell density budget (`h-8 w-28` — a 4-pill toggle would widen the column ~2-3×); comment in source documents the call. Pending commit.
- **StrategyCard menu → Radix `DropdownMenu`** — P2. `src/components/playbook/strategy-card.tsx` ~60 lines of hand-rolled focus management (`menuRef`, `menuButtonRef`, arrow-key `onKeyDown`, escape close, overlay click-out) replaced by Radix `DropdownMenu` (portal rendering, focus trap, outside-click, proper `aria-controls`). Pending commit.
- **`condition-picker` trade-color leaks** — P2. `src/components/playbook/condition-picker.tsx:102` retoned from `text-trade-buy border-trade-buy/40` to `text-txt-200 border-bg-300` — P&L colors no longer hijacked for category/tier visual cues. Pending commit.
- **Followed-plan yes/no → `radiogroup`** — P2. `TradeInfoNotesTab` converted from two `aria-pressed` toggles to `SegmentedToggle` with `boolean | null` ↔ `"yes" | "no" | null` mapping. Single-select semantics now correct for AT. Rating control intentionally left hand-rolled (different control shape). Pending commit.
- **Delete `InsightCard` dead code** — P3. `src/components/analytics/insight-card.tsx` deleted; not exported via index, no consumers across the repo. Pending commit.
- **`expectancy-mode-toggle.tsx` redundant `onKeyDown` handlers removed** — P3. Three `<button>` elements no longer re-implement Enter/Space → click; native button behaviour relied on. Pending commit.
- **`capital-event-log.tsx` raw `<input>` migration** — P2. Two raw `<input>` (text + date) migrated to `@/components/ui/input` primitive; `axion/enforce-ui-primitives` now satisfied for this surface. Pending commit.
- **`withdrawal-calculator.tsx` i18n migration** — P2. ~10 hardcoded English strings replaced with `useTranslations("reports.withdrawalCalculator")` keys; `messages/{en,pt-BR}.json` updated. pt-BR locale parity restored. Pending commit.
- **Hardcoded English aria-label on exit-level removal** — P3. `src/components/backtest/sections/targets-exit-section.tsx` aria-label moved to `backtest.builder.removeLevel` i18n key; en + pt-BR added. Pending commit.
- **`engineVersion` UI badge on backtest results** — P2. `backtest-summary-cards.tsx` reads `result.engineVersion` and renders a small badge; `backtest-content.tsx` passes the value through. New `engineVersion` i18n key added. Surfaces engine math provenance on cached screenshots/exports per [BUG-2026-05-15] open follow-ups. Pending commit.
- **Portuguese literal "(atual)" in sweep-config** — P3. `src/components/optimize/sweep-config-panel.tsx` `(atual)` JSX child replaced with `useTranslations("optimize")` lookup; en + pt-BR keys added. Pending commit.
- **HAWKS `dailyTradeOrdinal` race condition** — P2. Two concurrent HAWKS trade inserts could both compute `ordinal=1` (read-then-write race on `COUNT(*)`). Added `accountId` + `tradingDay` columns to `trade_hawks_metadata` and a unique index `thm_account_day_ordinal_idx` on `(accountId, tradingDay, dailyTradeOrdinal)`; action wraps the sidecar insert in a max-3 retry loop catching Postgres `23505` and recomputing the ordinal. Migration `0005_boring_wasp` backfills + drops orphans + enforces NOT NULL before the index. Race-condition test + post-mortem `[BUG-2026-05-15-1]`. Commit `48dacd5`.
- **Cluster C — Stats module tests** — P2. 103 deterministic unit tests added for `monte-carlo` (Edge Expectancy, 36 tests), `monte-carlo-v2` (Capital Expectancy, 39 tests), and `risk-simulation-advanced` (28 tests). Covers seed-determinism, EV convergence, ruin probability vs expectancy sign, homogeneity under risk scaling, no NaN/Infinity safety. No production code touched. Commit `7225a9a`.
- **Cluster B — Tax module tests** — P2. 58 unit tests added for `asset-defaults` (16), `mark-dirty` (12), `month-status` (30). Follows existing `__tests__/lib/tax/` vitest pattern; mocks DB layer like `fee-resolver.test.ts`. Protected `recompute-month.ts` untouched. 92 total tax-suite tests pass. Commit `3e90d31`.
- **Monte Carlo v1/v2 → Edge/Capital Expectancy rename** — P3. User-facing labels renamed: "Monte Carlo v1" → "Edge Expectancy" / "Expectativa de Edge", "Monte Carlo v2" → "Capital Expectancy" / "Expectativa de Capital". Touches `messages/en.json`, `messages/pt-BR.json`, and `src/app/actions/monte-carlo.ts` (t-key references only). Internal identifiers, route paths, and file names preserved per manifesto §3.5. Commit `210fb5a`.
- **Playbook detail page — methodology-aware redesign (v1)** — P1. Per-condition usage scorecard on `/playbook/[id]` powered by new `getStrategyConditionsRollup` action (two-query expected/stats merge + active-account-mode Hawks inference). New `<ConditionsScorecard />`, inline Hawks-methodology chip, `playbook.scorecard.*` i18n keys, 5 new tests. Commit `3563204`. _v2 follow-ups deferred under "Playbook detail — deferred follow-ups"._
- **Cluster A — Security tests (split)** — P2. `auth-utils.ts` covered by `src/__tests__/lib/auth-utils.test.ts` (7 tests: Unauthorized/Forbidden gates, role hierarchy, `?? "trader"` fallback). `crypto.ts` + `user-crypto.ts` test work intentionally deferred — those modules are dormant; the work is the Encryption archive task (still active P1, see Test coverage section). Commit `787ba6f`.
- **Cluster D — write actions zod-hardening** — P1. Zod schemas wired into all 4 write actions (`accounts.ts` create/update/delete, `strategy-conditions.ts` sync, `tax-engine.ts:recomputeLedger`); deprecated `syncCapitalBetweenPlans` no-op stub deleted. New `src/lib/validations/{account,tax-engine}.ts` + extended `trading-condition.ts`. `recompute-month.ts` (protected) untouched — zod sits at the action wrapper only. Commit `d34e9cf`.
- **Detail-page delete `window.confirm()` migration** — P1. Trade-detail action menu now uses canonical `AlertDialog` (`AlertDialogAction variant="destructive"`) matching the list view. Closes the last `window.confirm()` hold-out on trade deletion per CLAUDE.md ban. Commit `64c34ec`.
- **`trade_conditions` junction table** — P1. Schema + migration + soft-delete on `deleteCondition`, `setTradeConditions`/`getTradeConditions` actions, `conditionsMet` validation extension, 3 trade-insert sites wired, extracted `ConditionList` primitive, new `TradeConditionsChecklist` component, count badge on trade-detail, `journal.tradeConditions.*` i18n keys, full test lake (unit + integration + 3 E2E + 2 regression). Unlocks per-condition analytics that decompose `setupRank` into its signal components. Commits `a138aa6`, `12c6483`, `636c8dc`, `b7371a8`.
- **Consolidate `brand-*` and `acc-*` into single bronze scale** — P1. `--color-brand-500` retired in favour of `--color-acc-100` (15 call sites migrated across auth surface + 2 leaked journal sites). Two-name foot-gun closed; single bronze scale documented as canonical. Commit `7e1fa38`.
- **`/replay` route deprecation sweep** — P1 (#4 on the prior P1 shortlist). Replay surface retired per manifesto §6. Commit `78760fc`.
- **Monthly Review → Month Closing affordance inside Reports** — P2. `/monthly` route deleted; `MonthClosingSection` in Reports branches by account type (personal → `MonthlyDarfCard`, prop → `PropProfitSummary`, replay → null). Weekly/projection/comparison content preserved in collapsible "Month Detail" `<details>`. `/monthly` → `/reports` 308 redirect in `src/proxy.ts`. Commit `cc102fb`.
- **Account Comparison → Analytics filter mode** — P2. `src/app/[locale]/(app)/analytics/account-comparison/page.tsx` deleted; multi-account view merged into Analytics' existing filter panel (multi-select on account, side-by-side equity overlay). Multi-account stays first-class; only the dedicated route disappears. Commit `ea06321`.
- **Delete orphan `/monitor` and `/painel` public routes** — P2. Two public route files removed; Monitor tab inside Command Center fully covers the surface. Zero internal `href`/`router.push` references existed. Commit `16e79a3`.
- **Mode-personalization widget contract (framework spike)** — P1. `AccountModeProvider` + `useAccountMode()` hook + `<ModeVariant />` declarative swap landed on `feat/hawks-mode-v0`. First consumer: dashboard Coaching Insights slot. Promote to stable once a second mode validates the shape without structural changes. See [`docs/mode-personalization-contract.md`](mode-personalization-contract.md). Commit `8e9d39f`.
- **Page Guide System — per-feature PR-template checklist line** — P3. Added "Page guide entry added/updated for new or significantly changed surfaces?" to `docs/pr-template.md` so the existing page-guide foundations get a social nudge per PR. Commit `661c7a3`.
