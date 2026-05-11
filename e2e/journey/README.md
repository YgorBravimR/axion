# Journey Suite — Zero-to-Hero E2E

Stage-scoped Playwright suite that encodes [`docs/zero-to-hero.md`](../../docs/zero-to-hero.md) as an executable user journey. Serves two purposes from a single source of truth: **regression** (CI mode) and **showcase** (demo mode).

Design rationale, options considered, and the full rollout plan live in [`docs/design/zero-to-hero-e2e.md`](../../docs/design/zero-to-hero-e2e.md).

## Current scope (Phase 1 — proof of concept)

| Stage | File                    | Status              |
| ----- | ----------------------- | ------------------- |
| 0     | `00-welcome.spec.ts`    | implemented         |
| 1     | `01-foundation.spec.ts` | implemented (POC)\* |
| 2–8   | —                       | Phase 2–3           |

\* Stage 1 currently only verifies storageState handoff + the Profile/Account tabs. The full Foundation flow (assets, timeframes, tags, conditions, risk profiles, fee rates, first playbook strategy) lands in Phase 2 once we resolve admin-only tab gating for the Bravo persona.

## Running

### CI mode (regression, headless, fast)

Run a single stage:

```bash
pnpm exec playwright test --project=journey-00-welcome-ci
```

Run the full available chain:

```bash
pnpm exec playwright test \
  --project=journey-00-welcome-ci \
  --project=journey-01-foundation-ci
```

Project dependencies guarantee Stage 0 runs before Stage 1, and Stage 1 picks up the storageState snapshot Stage 0 wrote.

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
├── 00-welcome.spec.ts        Bravo registers, signs in, lands on dashboard
├── 01-foundation.spec.ts     Bravo opens Settings (POC: tabs only)
├── fixtures/
│   └── bravo-seed.ts         Bravo persona constants (timestamped email)
├── helpers/
│   ├── annotate.ts           Demo-mode narration banner (no-op in CI)
│   ├── screenshot-if-demo.ts Demo-mode capture (no-op in CI)
│   └── storage-state.ts      Save / load between stages
└── README.md                 (this file)
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

Each test run gets a fresh timestamped email (`bravo-${Date.now()}@axion-demo.com`) so journey runs don't collide with each other or with the admin user used by the rest of the E2E suite. Password and display name are stable for narrative coherence.

Phase 2 will move to a fixed Bravo email backed by a per-run seeder reset, so the showcase video has a recognizable identity.

## Tags

Spec files include `@journey` and `@stage:<name>` tags in their JSDoc headers. Filtering by tag is **not** wired yet — Phase 1 uses Playwright project selection (`--project=journey-XX-...`) which is more explicit. Tag-based filtering may be added in Phase 2 if it proves useful.

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

## Adding a new stage (Phase 2+)

1. Update [`docs/zero-to-hero.md`](../../docs/zero-to-hero.md) if the user-visible flow changes.
2. Write `NN-name.spec.ts` following the shape above.
3. Append the stage to `journeyStages` in [`playwright.config.ts`](../../playwright.config.ts).
4. Run locally: `pnpm exec playwright test --project=journey-NN-name-ci`.
5. Run the demo variant to verify narration coherence: `DEMO=1 pnpm exec playwright test --project=journey-NN-name-demo`.
6. Open a PR. CI runs all journey stages in dependency order.
