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

## How to retire an item from this backlog

1. Implement the work.
2. Update any other doc that still has deferred prose ("Phase 2 will…", "future iteration may…") pointing at this entry — replace with a concrete reference to the shipped commit/PR, or delete the prose entirely.
3. **Delete the entry from this file in the same PR that ships the work.** Don't strikethrough; don't move it elsewhere; don't add a "Recently shipped" footnote. The shipping commit + git history are the audit trail.

Result: the active backlog is exactly what's still in front of us, priority-descending. No parallel DONE register lives in this file.

---

## E2E / Test Infrastructure

### Add browser `console.error` listener to Playwright fixture to surface client-side errors

- **Priority**: P3
- **Effort**: S
- **Source**: 2026-05-21 test audit on `feat/hawks-mode-v0` — no `page.on('console', ...)` handlers exist anywhere in the e2e suite; browser-side `console.error` calls (uncaught promise rejections, React hydration errors, failed fetch calls logged silently) are completely invisible to the test runner.
- **What + Why**: Add a shared Playwright fixture (or `test.beforeEach` in `e2e/fixtures/`) that registers `page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })` and fails/warns after each test if unexpected errors were collected. This would have caught the `R$ → BRL` `Intl.NumberFormat` crash (which logged a `RangeError: Invalid currency code`) before it reached a smoke-test session. Avoid failing on known benign warnings (Next.js dev-mode verbose output) using an allowlist regex. Reference: Playwright docs on `ConsoleMessage`.
- **Date filed**: 2026-05-21.
