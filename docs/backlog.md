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

### Multi-month trade-history seeder

- **What**: A seeder that inserts ≥3 months of varied trade history for the Bravo persona before Stage 5 runs.
- **Why**: Today Stages 5/6/7 assert on a single Stage 4 trade. That's enough to prove mount, but not enough to exercise:
  - DARF carryover correctness across months (Stage 6).
  - Quarter narrative gating on a real `quarterlyPlan` row (Stage 7).
  - Meaningful annual rollup numbers (Stage 7).
- **Where**: Likely extend `e2e/journey/fixtures/` with a `bravo-history.ts` + matching SQL or `e2e/utils/seed-trading-data.ts` reuse.
- **Source**: `docs/design/zero-to-hero-e2e.md` §12 Q6, §13 Phase 3 ("Add multi-month history seeder for Stage 7"); `e2e/journey/06-monthly.spec.ts` header; `e2e/journey/README.md` "Known data gaps".

### Fixed Bravo email + per-chain DB reset

- **What**: Replace `bravo-${Date.now()}@axion-demo.com` with a fixed email backed by a globalSetup that cascade-deletes + reinserts the Bravo row at chain start.
- **Why**: Recognizable identity in the showcase video (sales/marketing pickup). Today the timestamped email is the cheapest workaround for the DB-backed login rate-limit (`login:<email>` in `src/app/actions/auth.ts`).
- **Source**: `e2e/journey/fixtures/bravo-seed.ts` header; `e2e/journey/README.md` "Bravo persona".

### Tag-based filtering

- **What**: Wire `@journey` / `@stage:<name>` JSDoc tags to Playwright's `--grep` so contributors can run "all weekly+ stages" with one flag.
- **Why**: Today the suite uses `--project=journey-NN-...` selection, which is explicit but verbose for partial-chain runs.
- **Source**: `e2e/journey/README.md` "Tags".

### Journey CI workflow

- **What**: `.github/workflows/journey.yml` that runs the 9-stage chain against a Postgres service container, gated on the auth-reset preflight.
- **Why**: Today the chain only runs locally. Without CI, regressions land silently.
- **Pre-decisions** (carry over from `docs/design/zero-to-hero-e2e.md` §12):
  - **Q3** — Dedicated test DB or shared with existing E2E suite? (Doc recommends dedicated.)
  - **Q4** — Demo-mode video: checked into a known artifact location, or generated on demand only?
  - **Q5** — SLA on a failing journey test in CI: block PR merge, or warn-only? (Doc recommends block-chain, warn-per-stage.)
- **Source**: `docs/design/zero-to-hero-e2e.md` §12 Q3-Q5, §13 Phase 3.

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

## Documentation drift watch

- **Design doc Phase 3 / §12 Open Questions**: `docs/design/zero-to-hero-e2e.md` §12-13 was the original rollout spec. Stages 0-8 ship; Phase 3 is functionally done except for the multi-month seeder + CI wiring (both captured above). When those land, retire §13 Phase 3 in favour of a one-liner pointing here.
- **`docs/zero-to-hero.md:284`** — "Bias and mood are recorded for later correlation analysis." That's a _product_ statement (what the data is for), not a backlog item; left in place.

---

## How to retire an item from this backlog

1. Implement the work.
2. Update the original `Source` if it still has the deferred prose ("Phase 2 will…", "future iteration may…") — replace with a concrete reference to the shipped commit/PR, or delete the prose entirely.
3. Delete the item from this file in the same PR.

Result: the backlog only ever lists work that's still in front of us.
