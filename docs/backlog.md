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

The items that earn priority over everything else in this file. Promote a P2 entry here when it earns enough strategic weight to lead.

_Currently empty — last item (Encryption archive) shipped 2026-05-20 (commit `b8966f1`)._

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

The compliance scoring layer (the L-shaped slice the manifesto worried about) is **done**. The remaining work is surface-area personalization on top of that layer — M-effort now that the Mode-personalization widget contract (`<ModeVariant />`, see [component-architecture §10](component-architecture.md)) has shipped. Hawks-specific KPI cards plug into that contract rather than each becoming a one-off hardcode.

#### Methodology framework: available

Use `<ModeVariant />` for any per-methodology widget swap on this page (account-mode axis). Use inline `recipe.entry.type === "hawks_triple_screen"` checks when the gate is the strategy's intrinsic methodology rather than the active account mode. See `docs/component-architecture.md` §10 for the distinction.

- **Source**: `feature-manifesto-2026-05.md` §3.1, §6.4; verification pass 2026-05-20.
- **Files inspected**: `src/app/[locale]/(app)/playbook/[id]/page.tsx`, `src/components/playbook/conditions-scorecard.tsx`, `src/components/playbook/condition-tier-display.tsx`, `src/app/actions/strategy-conditions.ts` (lines 295-336).

---

## Backtest

### Backtest ORB & DezK methodology panels — **P2**

- **Priority:** P2 · **Effort:** M · **Status**: visual layer + Hawks panel **already shipped** (verified 2026-05-20); remaining work is the missing ORB and DezK result panels.
- **Already done** (not in the original entry — discovered on 2026-05-20 read):
  - **Visual replay**: `BacktestTradeChartModal` (`src/components/backtest/backtest-trade-chart-modal.tsx`) opens per-trade from `BacktestTradesTable`, loads candle window via `getCandlesForRange`, renders entry/exit markers via `lightweight-charts`.
  - **Hawks panel**: `BacktestHawksResultsPanel` (`backtest-hawks-results-panel.tsx`) gated by `recipe.entry.type === "hawks_triple_screen"` in `backtest-content.tsx:439`, covering session split (BR-local), 1/2/3+ trade-day buckets (the B3 daily cap signal), and best/worst day.
- **What remains**: build `BacktestOrbResultsPanel` and `BacktestDezkResultsPanel` and dispatch on `recipe.entry.type` alongside the Hawks gate. Per `component-architecture.md` §10, this is the strategy-methodology axis (intrinsic to the recipe), so use inline `recipe.entry.type` gates — **not** `<ModeVariant />`.
- **Why P2, not P1**: the high-blast-radius pieces are live; the remaining gap only bites ORB and DezK users, and neither methodology has a written spec for which metrics matter. Promote back to P1 once a CEO/manifesto note names the ORB or DezK metric set.
- **Open questions before building**: which metrics matter for ORB (opening-range hit rate? % continuation? gap-vs-no-gap split?) and DezK. Defer until specified.
- **Source**: CEO review session 2026-05-14; verification pass 2026-05-20. `src/components/backtest/`, `src/types/backtest.ts`.

### Hawks tick-level fidelity on stop reference

- **Priority:** P3 · **Effort:** S
- **What**: The current Hawks stop formula `2·open − close` gives one brick body below the entry brick's open — a 2-brick-body distance at points-level fidelity. The strict Profit Pro 9+1 geometry is `2·(R−1) + 1` ticks (two brick bodies + 1 closer tick). The `+1 tick` is omitted today; this is acceptable for points-level computation but should be revisited if/when the engine exposes tick-precise stops.
- **Why**: Cosmetic at current fidelity (one tick on a ~20-tick brick is ~5% of the brick body). Worth tracking so it's not silently rediscovered as a bug later.
- **Source**: `docs/postMorten/backend.md` [BUG-2026-05-15] open follow-ups; Ygor math note 2026-05-15.

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

## Monthly

### `month-comparison.tsx` ChangeIndicator paints non-P&L deltas as P&L

- **Priority:** P3 · **Effort:** S
- **What**: `src/components/monthly/month-comparison.tsx` lines 146-164 paint all 4 comparison-row deltas (profit, winRate, avgR, trades) with `bg-trade-buy/10 text-trade-buy` / `bg-trade-sell/10 text-trade-sell` based on improvement direction. Only the profit row is canonical signed-P&L; the other three are non-money deltas recoded as "made money / lost money."
- **Why**: Same family as the rank-as-P&L pattern retired in `comparison-stats-table.tsx`, milder here because the colors mark a directional delta rather than a category rank. The fix needs a per-row `isMoney` flag in `comparisonRows` (so profit keeps trade colors and the others demote to neutral with `ArrowUp`/`ArrowDown` carrying direction). Defer until a second "improvement-direction" comparison widget surfaces and the abstraction earns its weight.
- **Source**: `docs/scans/2026-05-12-impeccable-monthly.md` Phase 1a critique P2.

---

## Documentation drift watch

### Retire `zero-to-hero-e2e.md` §13 Phase 3

- **Priority:** P3 · **Effort:** XS
- **What**: `docs/design/zero-to-hero-e2e.md` §12-13 was the original rollout spec. Stages 0-8 ship, plus Hawks add-ons (`09-hawks-daily-loop`, `09b-seed-hawks-history`), and the multi-month seeder shipped as `04b-seed-history.spec.ts` + `helpers/seed-bravo-history.ts`. Only CI wiring remains — no `journey-ci` / `@journey` reference in `.github/workflows/`. When CI wiring lands, retire §13 Phase 3 in favour of a one-liner pointing back to this file.
- **Source**: verified 2026-05-21 against `e2e/journey/` (12 spec files + 8 helpers) and `.github/workflows/`.

---

## How to retire an item from this backlog

1. Implement the work.
2. Update any other doc that still has deferred prose ("Phase 2 will…", "future iteration may…") pointing at this entry — replace with a concrete reference to the shipped commit/PR, or delete the prose entirely.
3. **Delete the entry from this file in the same PR that ships the work.** Don't strikethrough; don't move it elsewhere; don't add a "Recently shipped" footnote. The shipping commit + git history are the audit trail.

Result: the active backlog is exactly what's still in front of us, priority-descending. No parallel DONE register lives in this file.
