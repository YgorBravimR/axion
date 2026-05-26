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

### Replace remaining `ScrollArea` usages inside modals (React 19 crash risk)

- **Priority**: P2
- **Effort**: XS
- **Source**: 2026-05-22 — ScrollArea crash post-mortem (`docs/postMorten/frontend.md`). Sidebar and app-shell were fixed; two modal-hosted `ScrollArea` instances remain and will crash if their E2E tests ever exercise open/close cycles.
- **What + Why**: Replace `<ScrollArea>` with `<div className="overflow-y-auto">` in:
  - `src/components/dashboard/day-detail-modal.tsx:105`
  - `src/components/monte-carlo/stats-preview.tsx:118`
    Both live inside Radix dialogs/sheets — same crash path as the sidebar fix.
- **Date filed**: 2026-05-22.

### Add browser `console.error` listener to Playwright fixture to surface client-side errors

- **Priority**: P3
- **Effort**: S
- **Source**: 2026-05-21 test audit on `feat/hawks-mode-v0` — no `page.on('console', ...)` handlers exist anywhere in the e2e suite; browser-side `console.error` calls (uncaught promise rejections, React hydration errors, failed fetch calls logged silently) are completely invisible to the test runner.
- **What + Why**: Add a shared Playwright fixture (or `test.beforeEach` in `e2e/fixtures/`) that registers `page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()) })` and fails/warns after each test if unexpected errors were collected. This would have caught the `R$ → BRL` `Intl.NumberFormat` crash (which logged a `RangeError: Invalid currency code`) before it reached a smoke-test session. Avoid failing on known benign warnings (Next.js dev-mode verbose output) using an allowlist regex. Reference: Playwright docs on `ConsoleMessage`.
- **Date filed**: 2026-05-21.

### Implement yearly-plan UI: 52-week grid view

- **Priority**: P3
- **Effort**: M
- **Source**: 2026-05-22 — Stream A removed test coverage from `e2e/tests/yearly-plan.spec.ts` (commit `74f18f9d`) because the underlying feature never shipped. The deleted test stub asserted a grid presenting all 52 ISO weeks of the year with per-week progress markers.
- **What + Why**: Add a 52-week grid view to the yearly plan page (`src/app/[locale]/(app)/plan/[year]/page.tsx`). Each cell should reflect the week's planned vs. actual P&L, color-coded against the weekly_plan target. When shipping, re-add the deleted E2E test.
- **Date filed**: 2026-05-22.

### Implement yearly-plan UI: payoff matrix view

- **Priority**: P3
- **Effort**: M
- **Source**: 2026-05-22 — Stream A removed test coverage (commit `74f18f9d`). The deleted test asserted a tabular payoff matrix relating win-rate buckets to risk-reward ratios with cell-level annotations.
- **What + Why**: Add a payoff-matrix component to the yearly plan or playbook page. Rows = win-rate buckets (40% / 50% / 60% etc.), columns = R-multiples (1R / 2R / 3R), cells = projected annual return. Useful as a "what if my hit-rate improves" exploration tool. When shipping, re-add the deleted E2E test.
- **Date filed**: 2026-05-22.

### Implement yearly-plan UI: exit convention tabs (3 tabs)

- **Priority**: P3
- **Effort**: M
- **Source**: 2026-05-22 — Stream A removed 3 test stubs covering the exit-convention tab UI on yearly-plan (commit `74f18f9d`). Each tab represented a different exit-rule preset (likely Conservative / Balanced / Aggressive — confirm with PM).
- **What + Why**: Add a tabbed exit-convention selector to the yearly plan page. Each tab applies a different default exit rule (stop-loss multiple, trailing-stop trigger, profit-target ratio) to all child plans in the cascade. Currently the cascade uses a single hardcoded convention. When shipping, re-add the deleted E2E tests.
- **Date filed**: 2026-05-22.

### Triage 5 pre-existing flaky tests in `e2e/tests/settings.spec.ts` exposed by networkidle migration

- **Priority**: P2
- **Effort**: S
- **Source**: 2026-05-22 — Item 1 verification run after Stream B's networkidle migration. 5 tests fail with timeouts, all using fragile selectors that depended on the implicit timing buffer that `networkidle` provided.
- **What + Why**: Five tests fail when the dev server returns slightly slower than the assertion budget:
  - `settings.spec.ts:113 should display current account info` (mobile) — uses `:has-text("Name")` (matches anything)
  - `settings.spec.ts:121 should display account type selector` (mobile) — uses `:has-text("Type")` (matches anything)
  - `settings.spec.ts:190 should display assets list` (chromium) — falls back to `table` selector if no test-id; depends on seeder providing assets for the test user
  - `settings.spec.ts:362 should display timeframes list` (chromium) — `getByText(/1 minute|5 minutes|...)`; depends on seeded default timeframes
  - `settings.spec.ts:377 should open timeframe form when clicking Add` (chromium) — falls back to `form` selector
- Pre-existing fragility — not a regression from Stream B's migration; the migration just exposed it. Fix by (a) adding stable `data-testid`s in the UI components, (b) seeding default assets/timeframes for the test admin user, or (c) tightening selectors to specific text patterns rather than substring matches.
- **Date filed**: 2026-05-22.

### Move monte-carlo orchestration integration tests to a real DB harness

- **Priority**: P3
- **Effort**: M
- **Source**: 2026-05-22 — Item 3 extracted pure orchestration logic (commits `e0a5e790`, `e60d32e4`) into `src/lib/monte-carlo/` so the orchestration is unit-testable. The DB-touching path of `src/app/actions/monte-carlo.ts` still has no integration test.
- **What + Why**: Add integration tests for `runComparisonSimulation` and `runSimulationV2` end-to-end against the test DB. Verify the action correctly composes the auth check → DB query → orchestration → response wrapping. Skipped from the unit suite intentionally (per the same gotcha rationale documented in `docs/gotchas.md`). Suggested home: `e2e/tests/monte-carlo.spec.ts` (currently UI-focused) — add a server-action subgroup, or create `src/__tests__/integration/monte-carlo.test.ts` with a real test DB connection.
- **Date filed**: 2026-05-22.
