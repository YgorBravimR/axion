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

1. **Mode-personalization widget contract** — the chassis Hawks (and ORB / DezK after it) all consume; prerequisite for the methodology-axis investments below. See [Methodology framework](#methodology-framework) below.
2. **Backtest visual layer + methodology-specific UX redesign** — turn the backtest page from a calculator into a simulation tool (candle replay), and split the generic result panels into per-methodology views (ORB vs Hawks). The most-visible expression of the methodology-personalization framework. See [Backtest](#backtest) below.
3. **Encryption archive** — rip the dormant field-level encryption stack threaded through ~50 files. Touches PROTECTED paths; needs its own dedicated session. See [Test coverage](#test-coverage-unit--integration) below.
4. **BiasSelector auto-save toast** — silent auto-save fails AT users + anyone whose focus moved by the time the spinner finishes. Add toast confirmation. See [Command Center](#command-center) below.

---

## Methodology framework

> Strategic context: [manifesto §6.5](feature-manifesto-2026-05.md) — the per-component opt-in framework that lets each widget say "I have a Hawks variant; render that when `mode=Hawks`, else canonical." Lower blast radius than a layout-level mode prop. First consumer = Hawks-flavored dashboard card.

### Mode-personalization widget contract — **P1**

- **Priority:** P1 · **Effort:** M
- **What**: Build a per-component opt-in pattern (registry/context) that lets any widget declare a methodology variant and render it when the active mode matches. Default behavior is the canonical render — methodologies opt in widget-by-widget. Escape hatch reserved for route-level layout swaps if a methodology fundamentally reshapes a screen (rare; manifesto names none in the current 18-surface inventory).
- **Why**: The methodology axis is the product's wedge (manifesto §2). Every new methodology after Hawks (ORB, DezK, …) re-implements widget swaps ad hoc without this contract. With it, the per-methodology delta is "register variant, write component" — no layout-level branching. Prerequisite for the Backtest visual-layer redesign (P1 below) since that work is the most-visible expression of the framework.
- **Source**: `feature-manifesto-2026-05.md` §6.5 + Q2 resolution.

---

## Playbook

> Strategic context: [manifesto §6.4](feature-manifesto-2026-05.md) — Playbook detail page is the canonical home for methodology rules + scorecard. Hawks badge + `ConditionsScorecard` are already wired; the remaining depth is what this entry verifies.

### Playbook detail methodology-aware redesign — **P2** (verification done 2026-05-20)

- **Priority:** P2 · **Effort:** M (Hawks-first surface specialization) — _not L as originally budgeted_
- **Status**: Verification pass complete. The redesign is **partially shipped** — the compliance/scoring half is solid; the surface-area-personalization half hasn't started.

#### What's already in place

- **`trade_conditions` junction** (P1 #2) — shipped.
- **Tier model** — `mandatory` / `tier_2` / `tier_3` mapped to A / AA / AAA ranks via `ConditionTierDisplay` and `ScorecardRow`.
- **Compliance scorecard** — `ConditionsScorecard` reads `getStrategyConditionsRollup`, renders per-condition met-rate progress bars with traffic-light tones (≥75% buy / ≥40% warning / <40% sell). Empty-state copy is distinct.
- **Version-aware rollup** — current vs historical version label, dedicated i18n keys (`basedOnVersion`, `basedOnVersionHistorical`).
- **Hawks badge** — `isHawksStrategy` is computed from `accountModes.mode === "hawks"` join; surfaces a single pill on the Conditions section header.

#### What's still missing (the M-effort gap)

1. **Methodology-axis page sections.** The page renders identically for Hawks / ORB / DezK / unstructured strategies — only the badge changes. There's no Hawks-specific surface: no session/boundary KPIs, no morning-bias adherence card, no B3 daily-cap chip, no scenario-by-methodology grouping.
2. **Per-methodology KPI grid.** Performance grid (line 161) shows the same six metrics for every strategy. Hawks-shaped strategies should expose extra cells (e.g. "boundaries used", "morning-bias respected %", "session-end exits").
3. **`isHawksStrategy` is binary and coarse.** Derived from "any account using this strategy is in Hawks mode" — fine for the badge but won't scale to ORB/DezK. Needs a proper `methodology` enum on strategies (or a tag), with widget-level dispatch matching the §6.5 Mode-personalization widget contract.
4. **Scorecard depth is shallow per condition.** No drill-down on a condition row → trades where it was met vs missed. The data exists; the UI doesn't expose it.
5. **No "playbook health" trend.** Compliance is a single point-in-time number; the dashboard has a sparkline for it elsewhere — playbook detail should too.

#### Why the budget dropped from L to M

The compliance scoring layer (the L-shaped slice the manifesto worried about) is **done**. The remaining work is surface-area personalization on top of that layer, which is M-effort once the Mode-personalization widget contract (Methodology framework P1 entry) lands. Without that framework, this entry is blocked — the Hawks-specific KPI cards would each be a one-off hardcode otherwise.

#### Dependency: Methodology framework

This entry should ship **after** the Mode-personalization widget contract; otherwise we'd re-implement that dispatch ad-hoc in the playbook page and end up rewriting it.

- **Source**: `feature-manifesto-2026-05.md` §3.1, §6.4; verification pass 2026-05-20.
- **Files inspected**: `src/app/[locale]/(app)/playbook/[id]/page.tsx`, `src/components/playbook/conditions-scorecard.tsx`, `src/components/playbook/condition-tier-display.tsx`, `src/app/actions/strategy-conditions.ts` (lines 295-336).

---

## Backtest

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

---

## Test coverage (unit / integration)

Source for all items below: `docs/scans/2026-05-11-test-coverage.md` Phase 5b. Best ROI ordering preserved.

### Encryption archive — XL refactor (its own session) — **P1**

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
- **Why deferred**: full archive in a non-dedicated session has high risk on financial-recompute paths (`recompute-month.ts`, `period-queries.ts`). Better as one focused session with a clean lint + test pass between each commit.

### Cluster D — Parsers

- **Priority:** P2 · **Effort:** M
- **What**: Fixture-driven tests for `sinacor-parser`, `matching-engine`, `csv-parsers`. Sample broker outputs live at `e2e/fixtures/notas/`.

### Backtest / equity-shield / fractal-plan suites

- **Priority:** P2 · **Effort:** L
- **What**: `__tests__/lib/backtest/*` (entry, stop, target, sizing modules), `__tests__/lib/equity-shield/*` (smoothing + shield calc), `__tests__/lib/fractal-plan/*` (capital + week aggregation).
- **Source**: same scan, "test files missing" list.

---

## Command Center

### BiasSelector auto-save toast — **P1**

- **Priority:** P1 · **Effort:** S
- **What**: The non-edit row's BiasSelector auto-saves silently (spinner only). Add toast confirmation so AT users + anyone whose focus moved get a status signal.
- **Source**: `docs/scans/2026-05-12-impeccable-command-center.md` Phase 1a P1.

---

## Strategy versioning v2 follow-ups

Both items below are deferred-out-of-v1 entries. v1 (read-only awareness + fork flow + dashboard cohort filter + scorecard polish) shipped at commits `99dabfa` + `7abe9b7`.

### Strategy version diff viewer

- **Priority:** P2 · **Effort:** M
- **What**: Side-by-side condition diff between two versions of the same strategy. Entry point reserved as "Compare versions" link in scorecard header (currently hidden in v1).
- **Why deferred**: Numeric comparison via dashboard cohort split covers 80% of the analytical need; diff is for the qualitative "what changed between v1 and v2" question, which is lower-frequency.

### Strategy version naming/labels

- **Priority:** P3 · **Effort:** S
- **What**: Free-text label per version (e.g. "v2 — after London session refinement"). v1 ships numeric-only.
- **Why deferred**: Numeric versions are sufficient for first launch; labels add discoverability once the user has 3+ versions.

---

## HAWKS deferred items

Surfaced during the 2026-05-13 Wave 9 HAWKS sweep ([runbook](impeccable-page-runbook.md), logs at `docs/scans/2026-05-13-impeccable-*-hawks.md`). Logged here because each requires either product/copy review, a wider primitive change, or another team's input — none are local code edits.

### HAWKS pre-flight switch copy review (en + pt-BR)

- **Priority:** P2 · **Effort:** S
- **What**: Each switch in `HawksTradeFields` ships with a `*Label` + `*Hint` pair where the hint repeats the label (e.g. "Triple screen confirmed?" + "Did your 5-screen checklist hold at entry?"). The hint adds no information.
- **Why now**: Phase 1a P1 finding in `docs/scans/2026-05-13-impeccable-trade-form-hawks.md`. Voice-gate review needed before edit; one of: drop hints, or rewrite as one-clause clarifiers.
- **Source**: `src/messages/en.json` + `src/messages/pt-BR.json` under `hawks.tradeFields.*`. Component: `src/components/hawks/hawks-trade-fields.tsx`.

### Trade-form draft-after-deactivation edge

- **Priority:** P2 · **Effort:** S
- **What**: If a draft trade is saved with HAWKS mode active and reloaded after the trader deactivates HAWKS, the persisted `hawks.*` payload is silently dropped (the `<HawksTradeFields>` block is not rendered, so its values never reach the submit). Either preserve the values invisibly or warn the user at draft-restore.
- **Source**: `src/components/journal/trade-form.tsx` + `src/components/hawks/hawks-trade-fields.tsx`.

### HAWKS settings tab copy voice gate

- **Priority:** P3 · **Effort:** XS
- **What**: `t("statusActive") / t("statusInactive")` + `t("description")` not yet voice-checked in en + pt-BR. Reject cheerful filler ("You're on!", "Switched off") if present.
- **Source**: `src/messages/{en,pt-BR}.json` under `hawks.settings.*`.

---

## Page polish — deferred from sweep

All four items below are P3 distill passes flagged by the 2026-05-12 "impeccable page" sweep. They share a root cause: monotonous card stacks where nothing earns visual prominence. Consider handling as a unified distill pass rather than four separate slices.

### Journal-list — listbox arrow-nav within trade-day-group

- **Priority:** P3 · **Effort:** M
- **What**: After the TradeRow Link migration, focus moves row-by-row on Tab. For dense days (30+ trades) consider a listbox roving-tabindex pattern so ↑↓ navigates between rows without leaving the day group, and Tab leaves the group entirely.
- **Why**: Power-user shortcut. Not blocking — Tab works fine — but the cockpit register favors keyboard density.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-list.md` Phase 1b P1.

### Playbook list — `/playbook` reads as nested cards

- **Priority:** P3 · **Effort:** M
- **What**: The compliance overview and the strategy grid each live inside their own `border-bg-300 bg-bg-200 rounded-lg border` wrapper, and the strategy grid itself contains up to ~10 `StrategyCard` boxes — yielding a "cards inside a card" structure. Either drop the outer chrome on the strategy section (let the cards float on the page background and use a section heading instead), or remove the per-card border and let the section wrapper provide the boundary.
- **Why**: Shared design law: "nested cards are always wrong." Two layers of borders compete for attention and consume horizontal whitespace.
- **Source**: `docs/scans/2026-05-12-impeccable-playbook-list.md` Phase 1a P2.

### Journal detail — card-rhythm distill on `/journal/[id]`

- **Priority:** P3 · **Effort:** M
- **What**: The detail page stacks ~10 sibling cards (header, P&L block, R-multiples, prices, risk, SL/TP, MFE/MAE, classification, rating+plan, tags, notes). Several adjacent groupings (prices ↔ SL/TP, MFE ↔ MAE, rating ↔ plan) read as one logical unit but render with identical visual weight. Distill into 4-5 grouped sections with deliberate spacing variance, or move the secondary metrics into a collapsible "Details" disclosure so the primary outcome (P&L, R, executions, notes) leads.
- **Why**: Shared design law: "vary spacing for rhythm; same padding everywhere is monotony" + "cards are the lazy answer." The current page is a uniform card stack; nothing earns visual prominence over anything else.
- **Source**: `docs/scans/2026-05-12-impeccable-journal-detail.md` Phase 1a critique P3 — distill deferred to keep this slice surgical.

### Analytics — uniform card stack across `/analytics`

- **Priority:** P3 · **Effort:** M
- **What**: Eleven sibling cards (variable comparison, equity curve, EV, R-dist, tags, heatmap+session, session-asset table, hourly+day-of-week, holding period) all render with identical `border-bg-300 bg-bg-200 rounded-lg` chrome. Nothing earns visual prominence.
- **Why**: Same shared-law violation as `/journal/[id]` — "vary spacing for rhythm; cards are the lazy answer." Group into 3-4 logical bands with deliberate spacing variance, or promote one anchor metric (EV or cumulative equity) above the card grid.
- **Source**: `docs/scans/2026-05-12-impeccable-analytics.md` Phase 1a critique P2. Scope-extends the existing journal-detail distill — handle together.

---

## Monthly

### `month-comparison.tsx` ChangeIndicator paints non-P&L deltas as P&L

- **Priority:** P3 · **Effort:** S
- **What**: `src/components/monthly/month-comparison.tsx` lines 146-164 paint all 4 comparison-row deltas (profit, winRate, avgR, trades) with `bg-trade-buy/10 text-trade-buy` / `bg-trade-sell/10 text-trade-sell` based on improvement direction. Only the profit row is canonical signed-P&L; the other three are non-money deltas recoded as "made money / lost money."
- **Why**: Same family as the rank-as-P&L pattern retired in `comparison-stats-table.tsx`, milder here because the colors mark a directional delta rather than a category rank. The fix needs a per-row `isMoney` flag in `comparisonRows` (so profit keeps trade colors and the others demote to neutral with `ArrowUp`/`ArrowDown` carrying direction). Defer until a second "improvement-direction" comparison widget surfaces and the abstraction earns its weight.
- **Source**: `docs/scans/2026-05-12-impeccable-monthly.md` Phase 1a critique P2.

---

## Deprecations

> Strategic context: [manifesto §3.5 + §3.8](feature-manifesto-2026-05.md) — sunset / rename work surfaced by the strategic audit. Cleanup tax that compounds with every adjacent edit; lower-risk to ship before piling more on top.

### ~~Replay account mode deprecation sweep~~ — **DONE 2026-05-20**

- **Priority:** P2 · **Effort:** M
- **What**: Removed the `replay` account variant end-to-end across three phases: (3a) ripped the `replay` branch out of every `.tsx`/`.ts` consumer — `accounts.ts` server action, `command-center/page.tsx`, `command-center-tabs.tsx`, `command-center-content.tsx`, `date-navigator.tsx`, `(app)/layout.tsx`, `app-shell.tsx`, `sidebar.tsx`, `account-switcher.tsx`, `account-settings.tsx`, `account-selector.tsx`, `account-transition-overlay.tsx`, `tax-tab.tsx`, `month-closing-section.tsx`, `profitchart-validate.ts`, `imports/profitchart/route.ts`, `brand-synchronizer.tsx`; (3b) Drizzle enum migration removing `"replay"` from `accountTypeEnum` via the 6-step text-cast → drop → recreate → recast pattern; (3c) CSV import policy decision — kept `[R]`-prefix alert (ProfitChart-level concept, distinct from account-mode replay) but removed the `accountType !== "replay"` bypass, so the alert now always surfaces and user retains accept/reject agency.
- **Why**: Demo-mode + the E2E journey suite now cover the use case better than a runtime replay branch ever did. Every conditional in Command Center was paying a maintenance tax. Removing it _before_ the mode-personalization framework lands keeps that framework's blast radius smaller — it doesn't have to specialize over a branch we just deleted.
- **Validation**: `pnpm lint` (0 errors), `pnpm lint:strict` (0 errors, 479 phase-in warnings), `pnpm exec tsc --noEmit` (clean). i18n keys (`auth.accountSwitcher.replay*`, `settings.account.replay*`, `settings.errors.onlyReplayAccounts`, `replayNoStartDate`, `commandCenter.dateNavigator.{nextReplayDay,replayMode}`) removed from both `messages/en.json` and `messages/pt-BR.json`.
- **Source**: `feature-manifesto-2026-05.md` §3.8 + §4 INVEST list #73.

### ~~Monte Carlo v1/v2 → Edge Expectancy / Capital Expectancy rename~~ — **DONE 2026-05-20**

- **Priority:** P3 · **Effort:** XS
- **What**: Renamed "Monte Carlo v1" to "Edge Expectancy" and "Monte Carlo v2" to "Capital Expectancy" across i18n (`messages/{en,pt-BR}.json`). Audit at filing time showed the user-visible rename was already in flight from prior incremental work — tabs, tooltips, section titles, ARIA labels, event toasts, and calibration headings already used the new names. Only loose end was a pt-BR aria-label drift (`Expectância` → `Expectativa`) for consistency with the rest of the surface. Umbrella technique references ("Monte Carlo simulation", route slug, settings copy) intentionally kept — those describe the algorithm, not the modes.
- **Why**: "v1/v2" is internal jargon that hides distinct cognitive purposes. The new names map to the question each answers: v1 → "is my edge real?" → **Edge Expectancy**; v2 → "will I survive a bad month?" → **Capital Expectancy**.
- **Source**: `feature-manifesto-2026-05.md` §3.5 + §4 INVEST list #75.

---

## Documentation drift watch

### Retire `zero-to-hero-e2e.md` §13 Phase 3

- **Priority:** P3 · **Effort:** XS
- **What**: `docs/design/zero-to-hero-e2e.md` §12-13 was the original rollout spec. Stages 0-8 ship; Phase 3 is functionally done except for the multi-month seeder + CI wiring. When those land, retire §13 Phase 3 in favour of a one-liner pointing back to this file.

---

## How to retire an item from this backlog

1. Implement the work.
2. Update any other doc that still has deferred prose ("Phase 2 will…", "future iteration may…") pointing at this entry — replace with a concrete reference to the shipped commit/PR, or delete the prose entirely.
3. **Delete the entry from this file in the same PR that ships the work.** Don't strikethrough; don't move it elsewhere; don't add a "Recently shipped" footnote. The shipping commit + git history are the audit trail.

Result: the active backlog is exactly what's still in front of us, priority-descending. No parallel DONE register lives in this file.
