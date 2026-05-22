# Journey Suite — Zero-to-Hero E2E

Stage-scoped Playwright suite that encodes [`docs/zero-to-hero.md`](../../docs/zero-to-hero.md) as an executable user journey. Serves two purposes from a single source of truth: **regression** (CI mode) and **showcase** (demo mode).

Design rationale, options considered, and the full rollout plan live in [`docs/design/zero-to-hero-e2e.md`](../../docs/design/zero-to-hero-e2e.md).

## Current scope

All 9 stages (0–8) are implemented and chain end-to-end via Playwright project dependencies. Full chain runtime: ~2–3 min locally on a warm cache.

| Stage | File                       | Surfaces covered                                                      |
| ----- | -------------------------- | --------------------------------------------------------------------- |
| 0     | `00-welcome.spec.ts`       | Register, sign in, dashboard mount                                    |
| 1     | `01-foundation.spec.ts`    | Settings — profile, account, assets, timeframes, tags, fees, playbook |
| 2     | `02-fractal-plan.spec.ts`  | Yearly plan seeded; fractal tree mount proof                          |
| 3     | `03-pressure-test.spec.ts` | Backtest + Monte Carlo + equity shield surfaces                       |
| 4     | `04-daily-loop.spec.ts`    | Log one trade end-to-end; trade appears in journal                    |
| 4b    | `04b-seed-history.spec.ts` | Seeds ~25 prior-month trades for DARF / annual / quarterly assertions |
| 5     | `05-weekly.spec.ts`        | `/en/reports` weekly card + mistake-cost + fee-impact; analytics dash |
| 6     | `06-monthly.spec.ts`       | Monthly perf; `/en/reports` DARF/tax section; month plan cockpit      |
| 7     | `07-quarter-year.spec.ts`  | Quarter + year cockpits; annual rollup; account comparison            |
| 8     | `08-improvement.spec.ts`   | Bug-report panel open/close; analytics drill on the equity curve      |

Known data gaps and follow-ups live in [`docs/backlog.md`](../../docs/backlog.md) under "Journey suite" — including the multi-month trade-history seeder that would tighten Stage 6 DARF + Stage 7 quarter/annual assertions.

## Running

### GitHub Actions (post-merge regression)

The full 9-stage chain runs on every push to `main` via [`.github/workflows/journey.yml`](../../.github/workflows/journey.yml). Required GitHub secrets: `JOURNEY_DATABASE_URL` (staging Postgres), `JOURNEY_AUTH_SECRET` (NextAuth JWT signing), `JOURNEY_ENCRYPTION_KEY` (64-char hex). Pre/post cleanup is handled by `e2e/global.teardown.ts` — it wipes all rows owned by `bravo-%@axion-demo.com` before and after the run, so the shared staging DB stays clean across runs.

### Local CI mode (regression, headless, fast)

Run a single stage:

```bash
pnpm exec playwright test --project=journey-00-welcome-ci
```

Run the full available chain:

```bash
pnpm exec playwright test \
  --project=journey-00-welcome-ci \
  --project=journey-01-foundation-ci \
  --project=journey-02-fractal-plan-ci \
  --project=journey-03-pressure-test-ci \
  --project=journey-04-daily-loop-ci \
  --project=journey-04b-seed-history-ci \
  --project=journey-05-weekly-ci \
  --project=journey-06-monthly-ci \
  --project=journey-07-quarter-year-ci \
  --project=journey-08-improvement-ci
```

Project dependencies guarantee Stage N runs before Stage N+1, and each stage picks up the storageState snapshot the previous stage wrote.

Before re-running the full chain, clear the stage storageState snapshots so Stage 0 starts fresh:

```bash
rm -f e2e/.auth/journey-stage-*.json
```

The Bravo persona itself is a fixed constant (`bravo@axion-demo.com`) — the global setup wipes its DB row and clears the login rate-limit slot (`login:<email>`) on every chain start, so no manual reset is needed for the user record.

### Demo mode (showcase, headed, slow, narrated, video)

```bash
DEMO=1 pnpm exec playwright test \
  --project=journey-00-welcome-demo \
  --project=journey-01-foundation-demo \
  --reporter=html
open playwright-report/index.html
```

Demo mode:

- `headless: false` — visible browser window
- `slowMo: 400` — each action paced for human watchers
- `video: "on"` — full video recording per spec
- `screenshot: "on"` — captured at every checkpoint
- `DEMO=1` enables `annotate()` overlays + `screenshotIfDemo()` captures

The HTML reporter renders video + screenshots inline per test.

## Architecture

```
e2e/journey/
├── 00-welcome.spec.ts         Bravo registers, signs in, lands on dashboard
├── 01-foundation.spec.ts      Bravo seeds her foundation in Settings
├── 02-fractal-plan.spec.ts    Yearly plan seeded; fractal tree mounts
├── 03-pressure-test.spec.ts   Backtest + Monte Carlo + equity shield
├── 04-daily-loop.spec.ts      Log one trade end-to-end
├── 04b-seed-history.spec.ts   Multi-month history seed (DARF / annual scaffolding)
├── 05-weekly.spec.ts          Weekly reports + analytics dashboard
├── 06-monthly.spec.ts         Monthly perf + DARF/tax + month cockpit
├── 07-quarter-year.spec.ts    Quarter + year cockpits + annual rollup
├── 08-improvement.spec.ts     Bug-report panel + analytics drill
├── fixtures/
│   └── bravo-seed.ts          Bravo persona constants (fixed email; wiped + reseeded each chain)
├── helpers/
│   ├── annotate.ts            Demo-mode narration banner (no-op in CI)
│   ├── screenshot-if-demo.ts  Demo-mode capture (no-op in CI)
│   ├── seed-bravo-history.ts  Multi-month trade-history seeder (Stage 4b)
│   └── storage-state.ts       Save / load between stages
└── README.md                  (this file)
```

State flows through `e2e/.auth/journey-stage-N.json` snapshots. Stage N saves at the end of its test body; Stage N+1 declares `test.use(loadStageState(N))` at the top of the spec.

## How a stage is structured

Every stage spec follows the same shape:

```ts
import { test, expect } from "@playwright/test"
import { annotate } from "./helpers/annotate"
import { screenshotIfDemo } from "./helpers/screenshot-if-demo"
import { loadStageState, saveStageState } from "./helpers/storage-state"

test.describe("Journey Stage N — <Name>", () => {
	test.use(loadStageState(N - 1)) // load previous stage snapshot

	test("<one-line story sentence>", async ({ page }) => {
		await annotate(page, "Narration for showcase mode")

		// 1. Navigate
		// 2. Interact (fill, click, etc.)
		// 3. Assert (expect(...))
		// 4. screenshotIfDemo(page, "NN-XX-checkpoint")

		await saveStageState(page, N)
	})
})
```

Hard assertions (`expect(...)`) run in **both** modes — demo mode must still fail loud if the flow breaks. Demo-only behaviors (narration, screenshots) are gated by `DEMO=1` and become no-ops in CI.

## Bravo persona

The persona is a fixed constant defined in `fixtures/bravo-seed.ts`:

- email `bravo@axion-demo.com`
- name `Bravo Trader`
- account `Bravo's Main Account`

A clean slot for each chain run is guaranteed by `e2e/global.teardown.ts`, which is wired as **both** `globalSetup` and `globalTeardown` in `playwright.config.ts`. On start _and_ end it cascade-deletes the Bravo user (all child rows drop via FK `onDelete: "cascade"`) and purges the login rate-limit row (`identifier = 'login:bravo@axion-demo.com'`) from `rate_limit_attempts`. A recognizable, stable email also gives the showcase video a clean identity for sales / marketing pickup.

## Tags

Spec files declare `@journey` plus a per-stage tag (e.g. `@stage:welcome`, `@stage:daily-loop`) via Playwright's `test.describe(..., { tag: [...] }, ...)` option. Both `--grep` and `--grep-invert` work:

```bash
# Run every journey stage
pnpm exec playwright test --grep "@journey"

# Run only the weekly + monthly stages
pnpm exec playwright test --grep "@stage:weekly|@stage:monthly"

# Run the chain except history seeders
pnpm exec playwright test --grep "@journey" --grep-invert "@stage:seed-"

# Run a single stage
pnpm exec playwright test --grep "@stage:welcome"
```

The full tag set: `@journey` + one of `@stage:welcome`, `@stage:foundation`, `@stage:fractal-plan`, `@stage:pressure-test`, `@stage:daily-loop`, `@stage:seed-history`, `@stage:weekly`, `@stage:monthly`, `@stage:quarter-year`, `@stage:improvement`, `@stage:hawks-daily-loop`, `@stage:seed-hawks-history`.

For an explicit single-stage run, `--project=journey-NN-name-ci` still works and is the form used by `.github/workflows/journey.yml`.

## What's NOT covered

The journey suite is **happy path only**. These belong elsewhere:

- **Edge cases** (empty states, validation errors, malformed CSV imports) → `e2e/tests/*.spec.ts` and future `e2e/<feature>-edge/*.spec.ts`
- **Unit-level correctness** (crypto, monte-carlo math, parser correctness) → `src/__tests__/lib/**/*.test.ts`
- **Visual regression** → not in scope; use a dedicated tool if needed later

## Debugging a failed stage

CI mode produces a Playwright trace on failure. Open it with:

```bash
pnpm exec playwright show-trace test-results/<...>/trace.zip
```

The trace viewer shows DOM snapshots, network calls, console errors, and the exact selector that failed.

In demo mode, look at the per-step screenshots in `test-results/journey-demo/` and the video in the HTML report.

## Adding a new stage

1. Update [`docs/zero-to-hero.md`](../../docs/zero-to-hero.md) if the user-visible flow changes.
2. Write `NN-name.spec.ts` following the shape above.
3. Append the stage to `journeyStages` in [`playwright.config.ts`](../../playwright.config.ts). Both `-ci` and `-demo` projects are generated automatically.
4. Run locally: `pnpm exec playwright test --project=journey-NN-name-ci`.
5. Run the demo variant to verify narration coherence: `DEMO=1 pnpm exec playwright test --project=journey-NN-name-demo`.
6. Open a PR (when a journey CI workflow exists). The chain runs in dependency order.
