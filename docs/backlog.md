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

1. **Strategy versioning v1 — UX surface (Phase D)** — design plan landed 2026-05-15 (`/plan-design-review`, 4 surfaces, 4-phase build). Awaiting build authorization (Manifesto follow-ups).
2. **Backtest visual layer + methodology-specific UX redesign** — turn the backtest page from a calculator into a simulation tool, and split the generic result panels into per-methodology views (Backtest section).
3. **Encryption archive** — rip dormant field-level encryption stack threaded through ~50 files; touches PROTECTED paths so wants its own session (Test coverage section).

---

## Manifesto follow-ups (2026-05-15)

Filed from [`feature-manifesto-2026-05.md`](feature-manifesto-2026-05.md) after Q1/Q2/Q3 resolution. Retire as a batch when shipped.

### Strategy version diff viewer (v2 of versioning)

- **Priority:** P2 · **Effort:** M
- **What**: side-by-side condition diff between two versions of the same strategy. Entry point reserved as "Compare versions" link in scorecard header (currently hidden in v1).
- **Why deferred**: numeric comparison via dashboard cohort split covers 80% of the analytical need; diff is for the qualitative "what changed between v1 and v2" question, which is lower-frequency.

### Strategy version naming/labels (v2 of versioning)

- **Priority:** P3 · **Effort:** S
- **What**: free-text label per version (e.g. "v2 — after London session refinement"). v1 ships numeric-only.
- **Why deferred**: numeric versions are sufficient for first launch; labels add discoverability once the user has 3+ versions.

---

## Test coverage (unit / integration)

Source for all items below: `docs/scans/2026-05-11-test-coverage.md` Phase 5b. Best ROI ordering preserved.

### Encryption archive — XL refactor (its own session) — P1

- **Priority:** P1 · **Effort:** XL · **Owner**: needs its own dedicated session
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

## Analytics — deferred follow-ups

### Uniform card stack across `/analytics`

- **Priority:** P3 · **Effort:** M
- **What**: Eleven sibling cards (variable comparison, equity curve, EV, R-dist, tags, heatmap+session, session-asset table, hourly+day-of-week, holding period) all render with identical `border-bg-300 bg-bg-200 rounded-lg` chrome. Nothing earns visual prominence.
- **Why**: Same shared-law violation as `/journal/[id]` — "vary spacing for rhythm; cards are the lazy answer." Group into 3-4 logical bands with deliberate spacing variance, or promote one anchor metric (EV or cumulative equity) above the card grid.
- **Source**: `docs/scans/2026-05-12-impeccable-analytics.md` Phase 1a critique P2. Scope-extends the existing "Card-rhythm distill pass" item — handle as part of a unified analytics distill, not a separate slice.

---

## Monthly — deferred follow-ups

### `month-comparison.tsx` ChangeIndicator paints non-P&L deltas as P&L

- **Priority:** P3 · **Effort:** S
- **What**: `src/components/monthly/month-comparison.tsx` lines 146-164 paint all 4 comparison-row deltas (profit, winRate, avgR, trades) with `bg-trade-buy/10 text-trade-buy` / `bg-trade-sell/10 text-trade-sell` based on improvement direction. Only the profit row is canonical signed-P&L; the other three are non-money deltas recoded as "made money / lost money."
- **Why**: Same family as the rank-as-P&L pattern retired in row #8 (`comparison-stats-table.tsx`), milder here because the colors mark a directional delta rather than a category rank. The fix needs a per-row `isMoney` flag in `comparisonRows` (so profit keeps trade colors and the others demote to neutral with `ArrowUp`/`ArrowDown` carrying direction). Defer until a second "improvement-direction" comparison widget surfaces and the abstraction earns its weight.
- **Source**: `docs/scans/2026-05-12-impeccable-monthly.md` Phase 1a critique P2.

---

## Backtest — deferred follow-ups

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

### HAWKS settings tab copy voice gate

- **Priority:** P3 · **Effort:** XS
- **What**: `t("statusActive") / t("statusInactive")` + `t("description")` not yet voice-checked in en + pt-BR. Reject cheerful filler ("You're on!", "Switched off") if present.
- **Source**: `src/messages/{en,pt-BR}.json` under `hawks.settings.*`.

### Trade-form draft-after-deactivation edge

- **Priority:** P2 · **Effort:** S
- **What**: If a draft trade is saved with HAWKS mode active and reloaded after the trader deactivates HAWKS, the persisted `hawks.*` payload is silently dropped (the `<HawksTradeFields>` block is not rendered, so its values never reach the submit). Either preserve the values invisibly or warn the user at draft-restore.
- **Source**: `src/components/journal/trade-form.tsx` + `src/components/hawks/hawks-trade-fields.tsx`.

---

## How to retire an item from this backlog

1. Implement the work.
2. Update any other doc that still has deferred prose ("Phase 2 will…", "future iteration may…") pointing at this entry — replace with a concrete reference to the shipped commit/PR, or delete the prose entirely.
3. **Delete the entry from this file in the same PR that ships the work.** Don't strikethrough; don't move it elsewhere; don't add a "Recently shipped" footnote. The shipping commit + git history are the audit trail.

Result: the active backlog above DONE only contains work still in front of us, priority-descending. DONE is the shipped record.

---

Result: the active backlog above DONE only contains work still in front of us, priority-descending. DONE is the shipped record.

---

## DONE

Shipped items, newest first. Each entry: title · `completed_date` · one-line "what shipped" · commit hash.

### 2026-05-15

- **Strategy versioning v1 — UX surface (Phase D)** — P1. Full UI for the strategy-versioning data layer that landed earlier. D.1 read-only awareness: version chip in `/playbook/[id]` header + Live/Historical badge, version-aware scorecard. D.2 fork flow: "Fork to v2" button gated on `!isHistorical && liveTradeCount > 0` (`strategy-detail-header.tsx:60`); `<ForkVersionDialog>` collects the new condition set and calls `createStrategyVersion` server action. D.3 dashboard cohort filter: new `<DashboardStrategyFilter>` (Select + conditional `SegmentedToggle` per-version) in `dashboard-content.tsx`; `listStrategyFilterOptions()` action joins strategies → versions → trades; analytics actions extended with `extraFilters?: TradeFilters` (`strategyIds` + `strategyVersionIds` → `inArray()` against the denormalized `trades.strategyId` / `trades.strategyVersionId` columns). D.4 polish: empty-state for `<ConditionsScorecard>` when version has no trades; full E2E walked through fresh strategy creation → fork → cohort filter via Playwright MCP. Touches `src/types/index.ts`, `src/app/actions/{analytics,strategies}.ts`, `src/app/actions/strategies.types.ts`, `src/components/dashboard/{dashboard-content,dashboard-strategy-filter}.tsx`, `src/components/playbook/{strategy-detail-header,version-chip,fork-version-dialog,conditions-scorecard}.tsx`, `messages/{en,pt-BR}.json` (new `dashboard.strategyFilter` namespace). Commits `99dabfa`, `7abe9b7`.
- **`docs/DESIGN.md` consolidation + 7 canonical pattern sections** — P2/P3. New 304-line `docs/DESIGN.md` (17KB) merges `axion-design-brief.md` (visual identity) + `design-context.md` (audience, principles) into one design-system reference. Source files deleted. CLAUDE.md routing table consolidates the two design-context rows into one pointing at DESIGN.md. Canonical patterns subsection populated with 7 entries (each rooted in a Wave 1-8 sweep finding): gauge verdict palette (4-zone target/actual mapping), rating verdict palette (5-point A-F scales), tab-active treatment (`border-acc-100 text-acc-100`), operation-outcome verdict mapping (async-action banners), auth surface as canonical verdict-triad example with cross-links, "status colors vs. magnitude colors" rule covering verdict-as-P&L + category-as-P&L + temporal-state-as-P&L hijack flavors, and the absolute "no side-stripe borders" ban with hero-card anti-example. Pending commit.
- **Journey: Playwright tag-based filtering** — P3. All 12 specs under `e2e/journey/*.spec.ts` now carry `{ tag: ["@journey", "@stage:<name>"] }` on their `test.describe()` blocks (Playwright 1.59.1 supports the parameter natively). `e2e/journey/README.md` "Tags" section rewritten with CLI examples: `--grep "@journey"` for the full suite, `--grep "@stage:weekly"` for one stage, `--grep "@stage:(weekly|monthly)"` for multi-stage, `--grep-invert "@stage:daily-loop"` for exclusion. `--project=...` selection still works for users who prefer it. Pending commit.
- **HAWKS daily bias "Save"/"Confirm" verb tidy** — P3. `src/components/hawks/daily-bias-form.tsx` save button now reads `common.save` ("Save"/"Salvar") in all states — removed the ternary that toggled to `hawks.bias.confirmAction` when fresh. After first write, a `text-tiny text-txt-300` sub-line renders below the button: "Bias confirmed at HH:MM" / "Bias confirmada às HH:MM", timestamp from `initialBias.confirmedAt` formatted via `useFormatting().formatTime`. Layout: button container changed from `justify-end` flex to `flex-col items-end` to stack action above status. `hawks.bias.confirmAction` removed from `messages/{en,pt-BR}.json` (no other consumers); new `hawks.bias.confirmedAt` key with `{time}` interpolation. Pending commit.
- **Categorical chart palette `--chart-1..7` + `getChartColor()` helper** — P2. 7 OKLCH tokens added to `src/app/globals.css` (light + dark, hue ladder at 242/30/165/315/95/45/260, dark L ≈ 0.56-0.64 / C ≈ 0.09-0.14, light L ≈ 0.48-0.56 / C ≈ 0.12-0.18). New `src/lib/chart-colors.ts` exposes `getChartColor(index)` with wraparound. 4 chart surfaces migrated off workarounds: `optimize/equity-overlay-chart.tsx` (was hardcoded hex), `monte-carlo/v2/daily-pnl-chart.tsx` + `mode-distribution-chart.tsx` (were hijacking `trade-buy`/`trade-sell`/`acc-100`), `equity-shield/equity-shield-chart.tsx` (fixed silent `acc-100` collision between `original` + `method1`). Pending commit.
- **`comparison-colors.ts` palette overhaul** — P2. `src/components/account-comparison/comparison-colors.ts` rewritten as pure `chart-1..7` list. Removed 4 hardcoded hex literals and the trade-color hijack that was encoding "account #3 made money" through selection-order positioning. Pending commit.
- **Account-aware compact currency formatters** — P2. 4 compact formatters in `src/lib/formatting.ts` (`formatCompactCurrency`, `formatCompactCurrencyWithSign`, `formatBrlWithSign`, `formatBrlCompactWithSign`) accept optional `currency?: string` param matching their full-form siblings; default BRL preserves backwards compat. New `getAccountCurrency()` server action with React `cache()` for request-level memoization; `useFormatting()` hook extended to pre-bind compact formatters to active account currency. 10 dashboard files migrated off hardcoded `"R$"` (`cumulative-pnl-chart`, `daily-pnl-bar-chart`, `day-equity-curve`, `day-summary-stats`, `day-trades-list`, `equity-curve`, `kpi/pnl-card`, `kpi/profit-factor-card`, `quick-stats`, `trading-calendar`). A USD account now renders `$10K` instead of `R$10K`. Pending commit.
- **`new-trade-tabs.tsx` aria-controls + admin-widget decorative-icon a11y pass** — P2. WAI-ARIA tab/tabpanel pattern completed in `src/components/journal/new-trade-tabs.tsx`: stable tab/panel id pairs (`new-trade-tab-{single,csv,nota,screenshot}` ↔ `…-panel-…`), `aria-controls` + `aria-labelledby` wired on both sides. Confirmed Radix `<TabsTrigger>` + `<TabsContent>` in `settings-content.tsx` (and profile tabs) already manage these aria attrs internally — no manual wiring needed. 36 decorative lucide icons across 8 admin/settings widgets received `aria-hidden="true"` (scan estimate was ~25; actual surface bigger): `bug-reports-list.tsx` (6), `tag-list.tsx` (4), `condition-list.tsx` (3), `indicator-list.tsx` (3), `user-list.tsx` (3), `tag-form.tsx` (1), `account-settings.tsx` (2), `trading-account-settings.tsx` (2), plus 12 already-marked in `settings-content.tsx`. Pending commit.
- **Tax / yearly-reports pre-existing baseline (verified resolved)** — P2. Investigation found all three armed items already shipped: `<Select>` id on `fee-rate-form.tsx:398` (now `id="fee-rate-add-override"` paired with aria-label); `YearTaxSummary` return type fully annotated in `tax-engine.ts:327` with no unsafe casts; `pnpm lint:strict` shows 0 errors (drizzle relational types healthy — 12 tables without `relations()` declarations remain but produce no current errors, future-proofing rather than active blocker). No code changes; entry retired as confirmed-shipped. Pending commit.
- **`StatCard` variant API split** — P3. `src/components/equity-shield/equity-shield-stats.tsx` `variant: "default" | "positive" | "negative" | "pass" | "fail"` split into two type-discriminated props: `signedVariant?: "positive" | "negative"` (paints `trade-buy`/`trade-sell` — signed-money) and `verdictVariant?: "pass" | "fail"` (paints `fb-success`/`fb-error` — verdict). Both undefined = neutral default. One internal callsite migrated. Eliminates the foot-gun where a contributor might pick `positive` for a success verdict. Pending commit.
- **Verdict-triad rule palette tokens** — P3. Added `--color-rule-{blocked,paused,executed,na}` to `src/app/globals.css` (light + dark), mirroring `fb-error`/`warning`/`fb-success`/`txt-300` initial values but decoupled for future themeing. 22 classNames across 5 callers migrated: `kelly-criterion-card.tsx`, `trade-comparison-table.tsx`, `day-trace-card.tsx`, `preview-banner.tsx`. Rule-engine vocabulary is now grep-able and themeable independently from the generic feedback aliases. Pending commit.
- **Inline currency formatters → `useFormatting()`** — P2. 4 reports widgets migrated off hardcoded `pt-BR` BRL formatters: `weekly-meta-chart.tsx`, `annual-rollup-table.tsx`, `capital-event-log.tsx`, `withdrawal-calculator.tsx`. Local `formatBRL` helpers and inline `Intl.NumberFormat("pt-BR", …)` calls replaced with `useFormatting()` hook, which respects the user's account currency preference. `annual-rollup-table.tsx` now also displays 2 decimal places (alignment with hook default). Pending commit.
- **Coaching insights trio (i18n plural + title + Server Component prop)** — P2+P3. `src/components/hawks/hawks-coaching-insights-card.tsx` cleaned up: (a) `coaching.tradeCount` switched to ICU plural form (`{count, plural, =0 {…} one {…} other {…}}`) in both `messages/en.json` and `messages/pt-BR.json` — "1 trades analyzed" bug fixed; (b) title size `text-small sm:text-body` → `text-body` unconditional, matching sibling dashboard card titles; (c) `useEffect` + `hasLoadedRef` initial-load workaround replaced by `initialContext` prop passed from `src/app/[locale]/(app)/page.tsx` (Server Component) through `dashboard-content.tsx`. Removed unused `useTransition`, `useRef`, `useEffect`, `getHawksCoachingInsights`, `Loader2` imports. Pending commit.
- **Consolidated `/monitor` + `/painel` routes** — P3. Verified routes already deleted (commit `16e79a3`) per 2026-05 Feature Manifesto §3.2/§6 decision to merge the Monitor widget into the Command Center tab. Backlog entry retired; routing implementation strategy superseded by product strategy. Commit `6a7e986`.
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
