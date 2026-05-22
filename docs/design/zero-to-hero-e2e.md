# Design — Zero-to-Hero E2E (Journey Suite)

**Status**: Phases 1-3 substantially shipped (Stages 0-8 implemented; post-merge GitHub Actions workflow at `.github/workflows/journey.yml` runs the full chain against the staging Neon DB with pre/post cleanup). Open follow-ups (multi-month seeder, demo artifact policy) live in [`docs/backlog.md`](../backlog.md).
**Date**: 2026-05-11
**Owner**: TBD
**Related docs**: `docs/zero-to-hero.md` (the user journey spec this implements), `docs/features.md` (feature catalog), `docs/project-description.md` (dev-side catalog), `e2e/` (existing per-feature E2E suite), [`docs/backlog.md`](../backlog.md) (deferred work)

---

## 1. Context

### 1.1 What exists today

Axion already has a mature Playwright E2E suite at `e2e/`:

- **20 spec files**, ~8,500 LOC total, covering every major feature surface (auth, navigation, settings, playbook, journal, dashboard, analytics, reports, monthly plan, yearly plan, tax engine, monte-carlo, market monitor, risk simulation, etc.)
- **Phased execution** via Playwright project dependencies in `playwright.config.ts`: a sequential chain `auth → navigation → settings → playbook → journal` builds shared state, then parallel data-dependent specs read from that state.
- **Dedicated seeder** at `e2e/utils/seed-trading-data.ts` that bypasses Next.js modules and writes directly to PostgreSQL via raw SQL (because `next/cache` and `next/headers` crash in plain Node).
- **Fixtures + helpers**: `e2e/fixtures/test-data.ts` (TEST_USER, TEST_TRADE, ROUTES), `e2e/utils/helpers.ts` (navigateTo, login, logout, waitForToast).
- **Bravo trader persona** scaffolding hinted at in seed helpers (`ensureBravoRiskProfile`, `ensureBravoMonthlyPlan`, `BRAVO_DECISION_TREE`) — partial.

### 1.2 What's proposed

`docs/zero-to-hero.md` defines a linear 8-stage user adoption arc (Welcome → Foundation → Fractal Plan → Pressure-Test → Daily Loop → Weekly → Monthly+Tax → Quarter/Year → Improvement). The proposal is to **encode this arc as an executable test suite** that serves two purposes:

1. **Regression**: prove cross-stage integration holds — that Stage 1 settings flow into Stage 2 plan, Stage 2 plan reaches Stage 4 daily, Stage 4 trades feed Stage 6 monthly tax, etc.
2. **Showcase**: produce a watchable, narratable demonstration of the full Axion flow for onboarding, sales, and marketing.

### 1.3 Why this matters

The existing E2E suite proves **each feature works in isolation** (given seeded data, journal renders correctly). It does **not** prove that **a real user, starting from zero, can traverse the full intended adoption path without dead ends**. Those are different failure modes:

- _Per-feature_: "Does the journal page render trade rows correctly?" → covered.
- _Journey_: "If a user creates an account on Monday and follows the documented onboarding flow, can they reach the Stage 4 daily loop by Wednesday without getting stuck?" → not covered.

The journey failure mode is the one that silently kills onboarding retention.

---

## 2. Goals and non-goals

### 2.1 Goals

- **G1**: Catch cross-stage integration regressions before they reach production.
- **G2**: Make `docs/zero-to-hero.md` executable — when the journey doc says "click X then Y," CI verifies that path still exists.
- **G3**: Produce a demo-quality video walkthrough on demand for sales/onboarding/marketing use.
- **G4**: Avoid duplicating coverage with the existing per-feature E2E suite.
- **G5**: Keep maintenance cost bounded — adding a feature must not require updating 10 places.

### 2.2 Non-goals

- **N1**: Replace per-feature E2E specs. They cover edge cases, validation errors, empty states — the journey suite covers the happy path only.
- **N2**: Substitute for unit tests on critical paths (crypto, monte-carlo, parsers — flagged in `docs/scans/2026-05-11-test-coverage.md`). Journey E2E is too coarse for those.
- **N3**: Test every feature mentioned in `docs/features.md`. Only the features on the documented happy path.
- **N4**: Produce production-grade marketing video. Showcase mode produces an honest software demo, not a polished promo.

---

## 3. Options considered

| Option                                        | Description                                                                                                                                                                                                                 | Verdict                                                                                                                                        |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. One mega-spec**                          | Single `journey.spec.ts` runs Stage 0→8 in one test function.                                                                                                                                                               | ❌ One flake kills 20+ min run; trace debugging brutal; no stage isolation; loses parallelism on PR runs.                                      |
| **B. Two parallel suites**                    | One regression-flavored, one showcase-flavored, both implementing the same flow.                                                                                                                                            | ❌ Inevitable drift within months — features change, only one suite updates, showcase silently lies.                                           |
| **C. Stage-scoped specs + dual run profiles** | Nine `*.spec.ts` files (one per stage), tagged `@journey`, chained via Playwright project dependencies + `storageState`. Same specs run two ways: CI (headless, fast, assertions) and demo (headed, slow, video, narrated). | ✅ **Recommended.** Stage isolation, parallelism on PRs, full-chain sync on nightly, single source of truth, dual-purpose without duplication. |
| **D. Stage-scoped specs, regression-only**    | Same as C minus the demo mode.                                                                                                                                                                                              | ❌ Loses 50% of the value; showcase narrative dies. Cost of adding demo mode is small (~5-10%); skipping it is shortsighted.                   |

The decisive trade-off between B and C: **dual purpose works if we separate _what we cover_ (single source of truth) from _how we run it_ (config-level)**. Playwright supports this natively via `projects`, `use`, `grep`, and env-flag toggles.

---

## 4. Architecture

### 4.1 Layering

```
┌────────────────────────────────────────────────────────────┐
│  Journey suite (NEW)                                       │
│  e2e/journey/00-welcome.spec.ts → 08-improvement.spec.ts   │
│  Happy path only, dual-purpose, @journey tag               │
└──────────────────────────┬─────────────────────────────────┘
                           │ composes / reuses
                           ▼
┌────────────────────────────────────────────────────────────┐
│  Per-feature E2E suite (EXISTS)                            │
│  e2e/tests/auth.spec.ts, settings.spec.ts, ...             │
│  Edge cases, validation, empty states                      │
└──────────────────────────┬─────────────────────────────────┘
                           │ uses
                           ▼
┌────────────────────────────────────────────────────────────┐
│  Shared infrastructure (EXISTS, extend)                    │
│  e2e/utils/helpers.ts, seed-trading-data.ts                │
│  e2e/fixtures/test-data.ts                                 │
└────────────────────────────────────────────────────────────┘
```

The journey suite is a **new layer on top**, not a replacement.

### 4.2 State handoff between stages

Playwright `storageState` snapshots cookies + localStorage at the end of one test and loads them at the start of the next. Each journey stage saves its post-condition state; the next stage loads it as starting state.

```
Stage 0 (welcome)     → saves journey-stage-0.json (logged in, account selected)
Stage 1 (foundation)  → loads stage-0, saves journey-stage-1.json (settings seeded)
Stage 2 (fractal-plan)→ loads stage-1, saves journey-stage-2.json (plan built)
...
```

**Benefit**: any stage can be run standalone from its predecessor's snapshot — useful for debugging Stage 5 without re-running Stages 0-4. CI nightly chains them; PR runs them in parallel from pre-baked snapshots.

### 4.3 Database state

Each stage may write data the next stage reads. Three options for managing this:

| Strategy                                                | Pros                          | Cons                                                     | Verdict              |
| ------------------------------------------------------- | ----------------------------- | -------------------------------------------------------- | -------------------- |
| **Reset DB per stage, replay all upstream stages**      | Simple, deterministic         | Slow — Stage 8 replays 0-7                               | ❌                   |
| **Reset DB per stage, seed via `seed-trading-data.ts`** | Fast, deterministic, isolated | Requires seeder coverage for every stage's pre-condition | ✅ stage-scoped runs |
| **Single DB, chained writes, never reset**              | Fast end-to-end               | Order-coupled, contamination across runs                 | ✅ full-chain runs   |

**Recommendation**: support both. PR mode resets + seeds (stages parallel). Nightly chains writes (stages sequential, full integration story).

### 4.4 Run profiles

Two Playwright projects, same spec files:

```ts
// playwright.config.ts (additions)
projects: [
	// ... existing projects
	{
		name: "journey-ci",
		testMatch: /e2e\/journey\/.*\.spec\.ts/,
		use: {
			...devices["Desktop Chrome"],
			storageState: "e2e/.auth/user.json",
			// headless, default speed
		},
	},
	{
		name: "journey-demo",
		testMatch: /e2e\/journey\/.*\.spec\.ts/,
		use: {
			...devices["Desktop Chrome"],
			headless: false,
			launchOptions: { slowMo: 400 },
			video: "on",
			screenshot: "only-on-failure",
		},
		workers: 1, // serial for narrative coherence
	},
]
```

Invocation:

```bash
# CI regression — parallel, fast, headless
pnpm e2e --project=journey-ci --grep @journey

# Demo / showcase — serial, slow, video
DEMO=1 pnpm e2e --project=journey-demo --grep @journey
```

The `DEMO=1` env flag toggles narration helpers (see §6).

---

## 5. File layout

```
e2e/journey/
├── 00-welcome.spec.ts          @journey @stage:welcome
├── 01-foundation.spec.ts       @journey @stage:foundation
├── 02-fractal-plan.spec.ts     @journey @stage:plan
├── 03-pressure-test.spec.ts    @journey @stage:pressure-test
├── 04-daily-loop.spec.ts       @journey @stage:daily         ← CSV import + manual entry
├── 05-weekly.spec.ts           @journey @stage:weekly
├── 06-monthly.spec.ts          @journey @stage:monthly
├── 07-quarter-year.spec.ts     @journey @stage:quarterly
├── 08-improvement.spec.ts      @journey @stage:improvement
├── fixtures/
│   ├── bravo-seed.ts           extends existing ensureBravo* helpers
│   ├── bravo-trades.csv        deterministic CSV for Stage 4 import path
│   └── bravo-nota.pdf          symlink → e2e/fixtures/notas/sample.pdf
├── helpers/
│   ├── annotate.ts             narration overlay (demo mode only)
│   ├── screenshot-if-demo.ts   demo-mode screenshot helper
│   ├── storage-state.ts        snapshot/restore between stages
│   └── stage-seed.ts           seed pre-condition for any stage
└── README.md                   how to run, how to extend
```

Existing `e2e/tests/*.spec.ts` are untouched; the journey suite is additive.

---

## 6. Stage-by-stage spec outlines

Each stage is one `test()` block (not multiple). Each stage runs end-to-end on its own and produces a `storageState` snapshot.

### Stage 0 — Welcome (`00-welcome.spec.ts`)

**Pre-condition**: clean DB, no user.
**Steps**:

1. Navigate `/en/register`. Fill email, password, name as Bravo persona.
2. Submit. Verify redirect to email-verification stub.
3. Mark email verified via DB helper (skip real email send).
4. Navigate `/en/login`. Sign in.
5. Land on `/en/select-account`. Verify default account exists.
6. Click account. Land on `/en/painel`.
   **Assertions**: URL is `/en/painel`. User name visible in header.
   **Demo annotations**: "Bravo creates her Axion account", "Email verified", "Bravo selects her trading account".
   **Post-condition snapshot**: `journey-stage-0.json` (logged in, account selected, empty data).

### Stage 1 — Foundation (`01-foundation.spec.ts`)

**Pre-condition**: Stage 0 snapshot.
**Steps**:

1. Navigate `/en/settings/accounts`. Verify default account row.
2. Navigate `/en/settings/assets`. Add 2 assets (WIN, WDO) via UI.
3. Navigate `/en/settings/timeframes`. Add 2 timeframes (5M, 15M).
4. Navigate `/en/settings/tags`. Add 3 tags (breakout, reversal, fakeout).
5. Navigate `/en/settings/conditions`. Add 2 entry conditions.
6. Navigate `/en/settings/risk-profiles`. Set max R per trade, max R per day.
7. Navigate `/en/settings/fee-rates`. Add B3 fee rate.
8. Navigate `/en/playbook`. Create one strategy with code, name, entry/exit criteria, target R-multiple.
   **Assertions**: each settings page shows the rows added; playbook lists the strategy.
   **Demo annotations**: "Bravo configures her trading environment — assets, timeframes, tags, conditions, risk limits", "First playbook strategy: Breakout Reversal".
   **Post-condition snapshot**: `journey-stage-1.json` (settings + 1 playbook).

### Stage 2 — Fractal Plan (`02-fractal-plan.spec.ts`)

**Pre-condition**: Stage 1 snapshot.
**Steps**:

1. Navigate `/en/plan/year`. Set 2026 capital, target return, max drawdown.
2. Submit year plan. Verify quarter rows generated.
3. Navigate to current quarter. Verify month rows.
4. Click current month. Set monthly R-budget, target R, max drawdown.
5. Submit. Verify week ladder rendered.
6. Verify provenance badge ("derived from year plan").
   **Assertions**: year, quarter, month all persisted; week ladder visible.
   **Demo annotations**: "Top-down planning — year shapes quarter shapes month".
   **Post-condition snapshot**: `journey-stage-2.json`.

### Stage 3 — Pressure-Test (`03-pressure-test.spec.ts`)

**Pre-condition**: Stage 2 snapshot.
**Steps**:

1. Navigate `/en/backtest`. Configure backtest from Stage 1 playbook + Stage 2 plan params.
2. Run backtest. Wait for results panel.
3. Navigate `/en/monte-carlo`. Run V1 with 1000 trials, seed=42 (deterministic).
4. Verify percentile output renders.
5. Navigate `/en/monte-carlo-v2`. Run V2 with same seed.
6. Navigate `/en/risk-simulation`. Run advanced sim.
7. Navigate `/en/equity-shield`. Calibrate shield against backtest equity curve.
   **Assertions**: each pressure-test surface produces a numeric result; equity-shield band renders.
   **Demo annotations**: "Before risking real money — pressure-test the strategy. Backtest, monte carlo, equity shield."
   **Post-condition snapshot**: `journey-stage-3.json`.

### Stage 4 — Daily Loop (`04-daily-loop.spec.ts`)

**Pre-condition**: Stage 3 snapshot.
**Steps**:

1. Navigate `/en/painel` (Command Center). Verify pre-market panels render (plan summary, playbook reminder, calendar).
2. Navigate `/en/calculator`. Enter entry price, stop, R-budget. Verify position size output.
3. Navigate `/en/monitor` (Market Monitor). Verify live panel renders (mocked data feed).
4. Navigate `/en/journal/new`. Manually create one trade (asset=WIN, long, entry, exit, size, stop, target, tag, condition, strategy). Submit.
5. Verify trade appears in `/en/journal`.
6. Navigate `/en/journal/import`. Upload `bravo-trades.csv` (3 trades).
7. Map columns. Submit import. Verify 3 new trades.
8. (Optional) Upload `bravo-nota.pdf`. Run nota parser. Verify match.
   **Assertions**: journal lists 4 trades (1 manual + 3 CSV) with correct asset/direction/PnL.
   **Demo annotations**: per phase — "Pre-market: command center", "Mid-session: position calculator", "Post-market: manual entry + CSV import".
   **Post-condition snapshot**: `journey-stage-4.json` (4 trades in journal).

### Stage 5 — Weekly Reflection (`05-weekly.spec.ts`)

**Pre-condition**: Stage 4 snapshot.
**Steps**:

1. Navigate `/en/reports`. Open weekly card.
2. Verify aggregate stats (win rate, average R, expectancy).
3. Navigate `/en/analytics/mistake-cost`. Verify breakdown renders.
4. Navigate `/en/analytics/commission-impact`. Verify cost per trade.
5. Navigate `/en/analytics`. Scan one pattern (e.g., performance by tag).
   **Assertions**: weekly card shows trade count = 4; analytics pages render without empty-state.
   **Demo annotations**: "End of week — review the data. What worked? What cost most?"
   **Post-condition snapshot**: `journey-stage-5.json`.

### Stage 6 — Monthly + Tax (`06-monthly.spec.ts`)

**Pre-condition**: Stage 5 snapshot.
**Steps**:

1. Navigate `/en/monthly`. Verify monthly review card renders.
2. Navigate `/en/tax`. Verify DARF ledger for the trade month.
3. Verify carryover ledger row.
4. (Mock month-end) Trigger `recompute-month` for the trade month via test-only endpoint.
5. Verify DARF status transitions to `computed`.
6. Navigate back to `/en/plan/month`. Adjust next month's R-budget based on monthly review.
   **Assertions**: DARF row exists with correct status; carryover row persists; plan adjustment saved.
   **Demo annotations**: "Month closes — Axion computes DARF. Plan adjusts for next month."
   **Post-condition snapshot**: `journey-stage-6.json`.

### Stage 7 — Quarter + Year (`07-quarter-year.spec.ts`)

**Pre-condition**: Stage 6 snapshot, plus seeded extra months of trade data so quarterly/annual aggregates have substance.
**Steps**:

1. Navigate `/en/plan/quarter`. Verify rollup of months covered.
2. Navigate `/en/annual-report`. Verify annual rollup.
3. Navigate `/en/capital-events`. Add a deposit event. Verify capital ladder updates.
4. Navigate `/en/account-comparison`. (If multi-account) compare.
5. Re-run backtest with quarter data → re-run monte-carlo → re-calibrate equity shield.
   **Assertions**: rollups numerically consistent; capital event reflected in ladder.
   **Demo annotations**: "Quarter close — re-pressure-test against real performance."
   **Post-condition snapshot**: `journey-stage-7.json`.

### Stage 8 — Improvement Flywheel (`08-improvement.spec.ts`)

**Pre-condition**: Stage 7 snapshot.
**Steps**:

1. Navigate `/en/coaching` (Coaching Insights). Verify generated insights render.
2. Navigate `/en/bug-report`. File a test bug report (cleaned up after).
3. Navigate `/en/page-guide`. Verify guide renders for current page.
4. Navigate back to `/en/analytics`. Drill into one new pattern.
   **Assertions**: insights render with non-empty content; bug report persists; page guide renders.
   **Demo annotations**: "Continuous improvement — coaching insights, ongoing analytics mining."
   **Post-condition snapshot**: `journey-stage-8.json` (terminal state).

---

## 7. Fixtures + Bravo seed strategy

### 7.1 Persona

Reuse / extend the existing Bravo persona. Defined centrally in `e2e/journey/fixtures/bravo-seed.ts`:

```ts
export const BRAVO = {
	email: "bravo@axion-demo.com",
	password: "BravoTrader2026",
	name: "Bravo Trader",
	accountName: "Bravo's Main Account",
	initialCapital: 50_000_00, // cents
	riskProfile: { maxRPerTrade: 1, maxRPerDay: 3 },
	// ... assets, timeframes, tags, conditions, strategy
}
```

### 7.2 Realistic-looking data

For showcase value, data must look like a real trader's journey, not random fixtures. Three rules:

- **Names matter**: not "Test User 1234" but "Bravo Trader".
- **Trades reflect a story**: 1 winner setting tone, 1 small loss, 1 mistake-tagged loss (so Stage 5 mistake-cost has substance), 1 textbook setup. Not random PnL.
- **Calendar dates are recent**: trades dated in the last 30 days relative to test run time, so monthly aggregates aren't empty.

This data lives in `bravo-trades.csv` and is deterministic.

### 7.3 Stage-pre-condition seeders

For PR runs (parallel, stages run independently), each stage needs a seeder that produces its pre-condition without replaying upstream stages. These live in `e2e/journey/helpers/stage-seed.ts`:

```ts
export const seedStagePreCondition = async (
	stage: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
) => {
	// resets DB, then seeds the cumulative pre-condition for the requested stage
}
```

Built on top of `e2e/utils/seed-trading-data.ts` (which already writes via raw SQL bypassing Next.js modules).

---

## 8. Helpers

Three small helpers, each ~10-30 LOC.

### 8.1 `annotate(page, text)` — narration overlay

```ts
// e2e/journey/helpers/annotate.ts
import type { Page } from "@playwright/test"

export const annotate = async (page: Page, text: string) => {
	if (process.env.DEMO !== "1") return
	// inject a temporary overlay banner at top of viewport
	await page.evaluate((msg) => {
		const banner = document.createElement("div")
		banner.textContent = msg
		banner.style.cssText =
			"position:fixed;top:0;left:0;right:0;padding:16px;background:rgba(0,0,0,0.85);color:#d4af37;font-family:Public Sans,sans-serif;font-size:18px;font-weight:600;text-align:center;z-index:99999;"
		document.body.appendChild(banner)
		setTimeout(() => banner.remove(), 3500)
	}, text)
	await page.waitForTimeout(3500)
}
```

In CI mode: no-op (~0ms cost). In demo mode: 3.5s narration banner per call.

### 8.2 `screenshotIfDemo(page, name)` — demo-only capture

```ts
// e2e/journey/helpers/screenshot-if-demo.ts
import type { Page } from "@playwright/test"

export const screenshotIfDemo = async (page: Page, name: string) => {
	if (process.env.DEMO !== "1") return
	await page.screenshot({
		path: `test-results/journey-demo/${name}.png`,
		fullPage: true,
	})
}
```

Output: a screenshot gallery suitable for embedding in onboarding docs.

### 8.3 `saveStageState(page, stage)` / `loadStageState(page, stage)` — handoff

```ts
// e2e/journey/helpers/storage-state.ts
import type { Page } from "@playwright/test"

const path = (stage: number) => `e2e/.auth/journey-stage-${stage}.json`

export const saveStageState = (page: Page, stage: number) =>
	page.context().storageState({ path: path(stage) })

export const loadStageState = (stage: number) => ({ storageState: path(stage) })
```

---

## 9. Run profiles + CI integration

### 9.1 Local development

```bash
# Run one stage standalone (loads pre-condition snapshot)
pnpm e2e --project=journey-ci --grep "@stage:plan"

# Run full chain
pnpm e2e --project=journey-ci --grep @journey

# Demo recording
DEMO=1 pnpm e2e --project=journey-demo --grep @journey --reporter=html
open playwright-report/index.html
```

### 9.2 CI

> **Status (2026-05-21):** The `journey-ci` and `journey-demo` Playwright projects are defined in `playwright.config.ts` but are **not yet wired into `.github/workflows/`**. The table below is the intended integration — tracked in `docs/backlog.md`.

| Trigger               | Mode         | Tags       | Workers      | Estimate   |
| --------------------- | ------------ | ---------- | ------------ | ---------- |
| **PR (`lint.yml`)**   | journey-ci   | `@journey` | parallel (4) | ~3-4 min   |
| **Nightly cron**      | journey-ci   | `@journey` | serial (1)   | ~12-15 min |
| **Manual demo build** | journey-demo | `@journey` | serial (1)   | ~25-30 min |

The serial nightly run validates the full integration chain (Stage 7 actually reads Stage 6's writes from a chained DB, not from a re-seeded snapshot). PR run trades that for speed and parallelism.

### 9.3 Failure reporting

- **CI mode**: trace on failure (`trace: "retain-on-failure"`). Playwright trace viewer surfaces selectors, network calls, console errors.
- **Demo mode**: video + screenshot per stage. HTML report renders as a gallery.

---

## 10. Edge case separation

The journey suite is **happy path only**. Edge cases live elsewhere:

```
e2e/journey/04-daily-loop.spec.ts                 ← happy path: 1 manual + 3 CSV trades succeed
e2e/tests/journal.spec.ts                         ← existing: empty state, validation, edit, delete
e2e/journal-edge/csv-import-malformed.spec.ts     ← new: malformed CSV → friendly error
e2e/journal-edge/manual-entry-validation.spec.ts  ← new: missing required fields
```

Rule: **if a scenario would derail the showcase narrative, it doesn't belong in the journey suite**. Edge-case specs use the same selectors and seed helpers; only the scenario differs.

---

## 11. Maintenance, ownership, and conventions

### 11.1 Update protocol

When a feature on the happy path changes:

1. Update `docs/zero-to-hero.md` (the doc spec).
2. Update the corresponding stage's `.spec.ts` (selectors, assertions).
3. Run `pnpm e2e --project=journey-ci --grep @journey` locally before PR.

If `docs/zero-to-hero.md` changes but the stage spec doesn't compile/pass, CI catches drift.

### 11.2 Adding a new stage

Rare — only when the canonical user journey gains a new step. Adding a stage requires:

- New `e2e/journey/NN-name.spec.ts`.
- Updates to `docs/zero-to-hero.md` and `docs/features.md`.
- Updates to `stage-seed.ts` if new pre-conditions are needed.

### 11.3 Test data hygiene

Bravo persona email + password are fixed. The seeder must idempotently re-create Bravo's state — never assume previous state survived. Each test run starts from a known DB baseline.

### 11.4 Owner

TBD. Suggest: whoever owns onboarding metrics owns the journey suite (skin in the game for the showcase mode).

---

## 12. Open questions

| #   | Question                                                                                                                                     | Owner         | Resolve before         |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ---------------------- |
| Q1  | Can the existing `e2e/utils/seed-trading-data.ts` seed all 9 stage pre-conditions, or do we need new SQL?                                    | Eng           | Phase 1 scaffold       |
| Q2  | How do we mock the Market Monitor live feed in CI without breaking visual fidelity in demo mode?                                             | Eng           | Stage 4 implementation |
| Q3  | Do we run the journey suite against a dedicated test database, or share with existing E2E suite? Suggest dedicated to avoid contention.      | Eng           | Phase 1 scaffold       |
| Q4  | Should demo-mode video be checked into a known artifact location for sales/marketing pickup, or generated on demand only?                    | Product       | Phase 3                |
| Q5  | What's the SLA on a failing journey test in CI? Block PR merge, or warn-only? Suggest block for the chain, warn for individual stages on PR. | Eng + Product | Phase 2                |
| Q6  | Does Stage 7 (Quarter + Year) need seeded multi-month history, and how much?                                                                 | Eng           | Stage 7 implementation |

---

## 13. Phase plan

### Phase 1 — Proof of concept (target: 3-4 hrs, 1 PR)

- Scaffold `e2e/journey/` directory + `README.md`.
- Implement helpers (`annotate`, `screenshotIfDemo`, `saveStageState` / `loadStageState`).
- Implement `playwright.config.ts` journey-ci + journey-demo projects.
- Implement Stage 0 (`00-welcome.spec.ts`) and Stage 1 (`01-foundation.spec.ts`).
- Prove storageState handoff works between them.
- Document how to run both modes in README.
- **Done criteria**: `pnpm e2e --project=journey-ci --grep @journey` green for Stages 0+1. `DEMO=1 pnpm e2e --project=journey-demo --grep @journey` produces watchable video for Stages 0+1.

### Phase 2 — Core happy path (target: 2-3 days, 1 PR)

- Implement Stages 2 (Fractal Plan), 3 (Pressure-Test), 4 (Daily Loop).
- Add `bravo-trades.csv`, link `bravo-nota.pdf` fixture.
- Extend stage-seed helpers for pre-conditions of Stages 2-4.
- Run full PR-mode chain.
- **Done criteria**: Stages 0-4 green in CI; demo mode video covers account-to-daily-loop story.

### Phase 3 — Full chain ✓ (stages shipped; CI wiring deferred)

Stages 5-8 (Weekly, Monthly+Tax, Quarter+Year, Improvement) plus Hawks add-ons (`09-hawks-daily-loop.spec.ts`, `09b-seed-hawks-history.spec.ts`) and the multi-month seeder (`04b-seed-history.spec.ts` + `helpers/seed-bravo-history.ts`) are all shipped — 12 spec files + 8 helpers exist in `e2e/journey/`. The remaining gap is CI wiring (§9.2) — no `journey-ci` / `@journey` reference in `.github/workflows/` as of 2026-05-21. Tracked in `docs/backlog.md`.

### Phase 4 — Edge case separation (ongoing)

- Audit existing `e2e/tests/*.spec.ts` for overlap with journey suite — keep edge cases, deprecate happy-path duplication.
- Add new `e2e/<feature>-edge/` specs as needs surface.

### Phase 5 — Integration into onboarding (Product-owned)

- Use demo-mode video as new-user walkthrough.
- Use stage gallery in `docs/zero-to-hero.md` as embedded illustrations.
- Set up nightly publishing of demo artifact to a known location (S3, internal docs site, etc.).

### Effort estimate

| Phase                    | Engineer-hours (no AI) | With CC assistance | Calendar         |
| ------------------------ | ---------------------- | ------------------ | ---------------- |
| Phase 1                  | 6-8                    | 2-3                | 1 day            |
| Phase 2                  | 16-20                  | 6-8                | 2-3 days         |
| Phase 3                  | 16-20                  | 6-8                | 2-3 days         |
| Phase 4                  | ongoing                | ongoing            | —                |
| Phase 5                  | 4-6                    | 2-3                | 1 day            |
| **Total Phases 1-3 + 5** | **42-54 hrs**          | **16-22 hrs**      | **~1 work-week** |

---

## 14. Risks and mitigations

| Risk                                                    | Likelihood | Impact | Mitigation                                                                               |
| ------------------------------------------------------- | ---------- | ------ | ---------------------------------------------------------------------------------------- |
| Stages drift from `docs/zero-to-hero.md`                | high       | medium | Doc + spec live in same PRs; CI fails on stale selector                                  |
| Market Monitor live feed unstable                       | medium     | medium | Mock feed via injected fixture in CI; record real feed in demo (one-shot)                |
| Showcase video too long for marketing use               | medium     | low    | Provide per-stage videos (~3 min each) in addition to full ~25 min run                   |
| DB contention between journey suite + per-feature suite | medium     | low    | Dedicated test DB; or DB-per-worker via Playwright project isolation                     |
| Bravo persona data feels fake on close inspection       | low        | medium | Realistic trade narrative in `bravo-trades.csv`; review by a trader before Phase 3 ships |
| Flake rate exceeds 2% per stage                         | medium     | high   | Strict selectors via test-ids; networkidle waits; retry once on CI; trace on failure     |

---

## 15. Done criteria (overall)

- [ ] All 9 stages green in CI (`pnpm e2e --project=journey-ci --grep @journey`)
- [ ] Nightly serial run green (chain mode)
- [ ] Demo mode produces a watchable end-to-end video (full chain ≈ 25 min)
- [ ] `docs/zero-to-hero.md` and journey spec files cross-link (each stage doc section names its spec file; each spec header names its doc section)
- [ ] Per-stage videos archived for product/marketing pickup
- [ ] Per-feature E2E suite audited for happy-path overlap; duplication removed or explicitly justified
- [ ] README at `e2e/journey/README.md` documents run modes, adding stages, debugging
- [ ] Open questions Q1-Q6 resolved

---

## 16. Appendix — Why not just keep per-feature E2Es?

Three failure modes the per-feature suite cannot catch:

1. **Cross-stage data plumbing**: settings → playbook → plan → journal → analytics → tax. Per-feature specs assume seeded inputs. They don't prove the _upstream UI_ produces those inputs correctly.
2. **Navigation dead-ends**: a missing "next" CTA, a button that links to a 404, a redirect loop. Per-feature specs land on a page directly; they don't traverse.
3. **Onboarding cognitive load**: does the documented path actually exist top-to-bottom without the user needing to know secret URLs? The journey spec is the only proof.

The journey suite **adds** these three categories of coverage. It does not subtract from the existing suite.
