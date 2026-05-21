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

## Backtest

### Hawks tick-level fidelity on stop reference

- **Priority:** P3 · **Effort:** S
- **What**: The current Hawks stop formula `2·open − close` gives one brick body below the entry brick's open — a 2-brick-body distance at points-level fidelity. The strict Profit Pro 9+1 geometry is `2·(R−1) + 1` ticks (two brick bodies + 1 closer tick). The `+1 tick` is omitted today; this is acceptable for points-level computation but should be revisited if/when the engine exposes tick-precise stops.
- **Why**: Cosmetic at current fidelity (one tick on a ~20-tick brick is ~5% of the brick body). Worth tracking so it's not silently rediscovered as a bug later.
- **Source**: `docs/postMorten/backend.md` [BUG-2026-05-15] open follow-ups; Ygor math note 2026-05-15.

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
