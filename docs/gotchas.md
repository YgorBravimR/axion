# Gotchas — Mid-Session Discoveries Log

This file is the canonical home for **non-obvious project gotchas** discovered while working: API quirks, framework version traps, repo-specific conventions, recurring agent footguns, "we tried X and it bit us" learnings.

## Why this file exists

Gotchas get rediscovered every session unless they're written down somewhere agents read. Inline `// HACK`, `// WARNING`, or scattered comments rot — by the time the gotcha matters again, the comment is in a deleted file or buried in a stale branch. This file consolidates them so:

- Future sessions don't re-pay the cost of the same discovery.
- Subagents (bug-fixer, feature-dev, code-reviewer) start with the same prior knowledge as the human.
- We can see clusters of pain (e.g. "Drizzle keeps biting us in 3 different ways") and decide when to systematize via lint/codegen.

This is **distinct from**:

- **`docs/postMorten/`** — bug fixes after they break production. Gotchas live here _before_ they cause a bug, ideally.
- **`docs/backlog.md`** — work to do later. Gotchas are facts we learned, not work items.
- **`CLAUDE.md`** — mandatory rules. Gotchas inform rules but aren't rules themselves until they're promoted (see below).

## Conventions

- **Every entry has a date** (ISO `YYYY-MM-DD`) and a **Source** line linking back to the file/PR/issue/session where it surfaced.
- **Title is a one-liner the agent will recognize** — frame it as the wrong assumption ("`cookies()` is sync"), not the right answer.
- **Body explains _what bit us_ and _what to do instead_.** Two short paragraphs max. No essay.
- **Group by topic** (Next.js, Drizzle, Auth, Lint, etc.), not by date.
- **Mark items obsolete by deleting them** — the git log is the audit trail. If a gotcha is fixed upstream (e.g. lint rule added, library upgraded), delete the entry in the same PR.
- **Promote to a rule when it's load-bearing.** If a gotcha is causing repeat pain across multiple sessions/PRs, promote it: add a lint rule, add a check in `CLAUDE.md`'s mandatory section, or build it into a custom `axion/*` ESLint rule. Then delete from this file.

## Discovery protocol (for agents)

Every agent — including subagents — must follow this when they hit a gotcha mid-task:

1. **Recognize**: "I just learned something non-obvious that future me / another agent would also miss."
2. **Append, don't comment**: write the entry here. Do not leave a `// TODO: future agents beware…` comment in source.
3. **Be specific**: name the file, the version, the symptom, and the workaround.
4. **Surface it**: mention it in the session summary so the user sees it was logged.

When unsure whether something qualifies, log it. A one-liner here costs ~30 seconds and saves the next session 30 minutes.

---

## Next.js / App Router

### `cookies()` / `headers()` / `draftMode()` are banned in pages

- **What**: Calling these from `next/headers` inside `page.tsx`/`layout.tsx`/`template.tsx` forces full dynamic rendering implicitly and breaks static analysis.
- **What to do**: Move into a server action, or set `export const dynamic = "force-dynamic"` explicitly. `connection()` from `next/server` is the allowed explicit opt-in.
- **Enforced by**: `axion/no-dynamic-functions-in-pages` (error).
- **Source**: `eslint-rules/no-dynamic-functions-in-pages.mjs`.
- **Date logged**: 2026-05-07.

### Raw `<a>` breaks client routing

- **What**: `pages/`-style `<a href="…">` for internal links does a full reload, killing the SPA feel.
- **What to do**: `<Link>` from `next/link` for every internal URL. Lint catches it via `axion/enforce-ui-primitives`.
- **Source**: `eslint-rules/enforce-ui-primitives.mjs`.
- **Date logged**: 2026-05-07.

---

## React

### Hooks must run before any early return

- **What**: An early `if (!user) return null` before a `useEffect`/`useMemo` violates rules-of-hooks. CI blocks merge.
- **What to do**: Move nullable narrowing **inside** the hook callback, not before the hook call. If the component genuinely can't render without the value, lift the guard to the parent.
- **Enforced by**: `react-hooks/rules-of-hooks` (error in `pnpm lint:strict`).
- **Date logged**: 2026-05-07.

### `import * as React` is banned

- **What**: `React.useState` / `React.forwardRef` clutters bundles and breaks tree-shaking in some setups.
- **What to do**: Always `import { useState, forwardRef } from "react"`. Same for types: `import type { ComponentProps, HTMLAttributes } from "react"`.
- **Date logged**: 2026-05-07.

---

## Server Actions

### `"use server"` files can only export async functions or values

- **What**: Re-exporting types from a `"use server"` file rewrites them as **runtime refs** at build time — the types vanish and you get cryptic build errors. Type aliases, interfaces, enums, classes, sync functions, barrel re-exports, and sync defaults are all forbidden.
- **What to do**: Move type re-exports to a sibling `*.types.ts` file. Server action files contain async functions only.
- **Enforced by**: `axion/enforce-server-action-async-only` (error).
- **Source**: `eslint-rules/enforce-server-action-async-only.mjs`.
- **Date logged**: 2026-05-07.

### Renko-native pipeline — multiple R per ISO week, hard reset at boundary

- **What**: The Hawks v0 Renko pipeline (`src/lib/renko/`, `src/app/actions/renko-pipeline.ts`) generates 5m/15m/60m Renko bricks from raw 1m OHLC bars. Each ISO week has its **own** R (from `hawks_renko_sizes`), and we **hard-reset** the brick chain at every Monday — the next week anchors at the first bar's open, ignoring the previous week's last brick close.
- **Why hard reset**: Carrying the anchor across weeks while changing R produces ambiguous bricks that don't match ProfitChart's per-week chart segments. Resetting costs a tiny number of bricks at boundaries and keeps each week's output independently reproducible.
- **Engine contract**: The Hawks triple-screen engine (`src/lib/backtest/modules/entry/hawks-triple-screen.ts`) reads exactly four keys off the 5m brick: `mme27_60m`, `mme55_60m`, `mme27_15m`, `macd`. These are **projected** from higher-TF bricks via two-pointer walk in `cross-tf-join.ts`. The MACD key is the **MACD line** (fast EMA − slow EMA) on 60m brick closes — not the histogram. If QA shows the histogram is the actual ProfitChart export semantic, swap `macd60.line` → `macd60.histogram` in `renko-pipeline.ts`.
- **Timeframes seeded on first run**: `renko-5m-cal`, `renko-15m-cal`, `renko-60m-cal` (`timeframe.type = 'renko'`, `unit = 'points'`). The action upserts them via `onConflictDoNothing` — no separate migration needed.
- **Date logged**: 2026-05-15.

---

## TypeScript / Lint

### Zod v4 renamed `errorMap` to `error`

- **What**: This repo runs zod v4. The v3 idiom `z.enum([...], { errorMap: () => ({ message: "validation.x.y" }) })` produces a TS error (`Object literal may only specify known properties, and 'errorMap' does not exist in type ...`). v4 uses `{ error: "validation.x.y" }` directly — no callback, just the i18n key as a string.
- **What to do**: When copying zod patterns from external docs (most still document v3), translate `errorMap: () => ({ message: X })` → `error: X`. Also note: `z.enum()` in v4 accepts a tuple as the first arg, but the _second-arg_ `error` field replaces the v3 `errorMap` for enum-mismatch errors.
- **Date logged**: 2026-05-15.

---

### `!= null` is the idiomatic null+undefined check

- **What**: `!== null` lets `undefined` slip through. The project lint is configured with `eqeqeq` rule `null: "ignore"`, so `!= null` is intentionally allowed and is the **preferred** form.
- **What to do**: Don't "fix" `!= null` to `!== null`. It's correct.
- **Date logged**: 2026-05-07.

### `.forEach()` is banned

- **What**: `.forEach` makes flow analysis harder and offers no upside over `for...of`.
- **What to do**: `for...of` (side effects), `.map()` (transform), `.reduce()` (aggregate). Lint blocks `.forEach`.
- **Date logged**: 2026-05-07.

### Tailwind v4 tokens only — no arbitrary classes

- **What**: `text-[28px]`, `rounded-[12px]`, `s-400`, `m-200` are all invalid in this repo. Legacy spacing tokens were removed in the 2026-05-07 token sweep.
- **What to do**: Use the design tokens defined in `src/app/globals.css`. Run `pnpm scripts/token-fix.ts --dry` to detect drift; commit fixes from the same script.
- **Enforced by**: `axion/enforce-token-usage` (error). Catalog: `eslint-rules/token-rules.mjs`. Invalid-token reference: `docs/scans/2026-05-07-cockpit-tokens.md`.
- **Date logged**: 2026-05-07.

### `let x = null; switch { x = … }` trips `no-useless-assignment`

- **What**: ESLint's `no-useless-assignment` rule (error in Tier 1) flags the classic accumulator pattern `let next = null; switch (key) { case "A": next = 1; break; ... } if (next === null) return; use(next)`. Every case-branch overwrites the initial `null` before any read, so the initial assignment is "useless" by the rule's analysis — even though it's load-bearing for the post-switch `null`-check. Hit during the `SegmentedToggle` arrow-key navigation in `src/components/ui/segmented-toggle.tsx`.
- **What to do**: Extract the switch into a helper that returns the value: `const next = (() => { switch (key) { case "A": return 1; ... default: return null } })()`. The rule is happy because there's no reassignment, and the post-switch guard still works.
- **Date logged**: 2026-05-15.
- **Source**: `src/components/ui/segmented-toggle.tsx` — Command Center sweep follow-up.

### `pnpm exec tsc --noEmit` catches things `next dev` + `pnpm lint:strict` silently allow

- **What**: Next dev mode strips types with SWC (no type-check), and `pnpm lint:strict` uses ESLint with type-aware rules but does **not** run a full `tsc` pass. The husky pre-push hook _does_ run `pnpm exec tsc --noEmit`. Net effect: a branch can look green in dev + look green in `lint:strict` and still fail pre-push. Hit during the manifesto-filing push on 2026-05-20 — ten TS errors had been on `feat/hawks-mode-v0` for ~3 commits (wrong Drizzle column name `currency` instead of `defaultCurrency`, missing lucide-react icon imports, missing component props) because no one ran `tsc --noEmit` between landing and pushing.
- **What to do**: Treat "green lint:strict" as necessary but not sufficient. Run `pnpm exec tsc --noEmit` locally before assuming the branch is ready to push, especially after merging another branch in. If you're CI-only, the deploy workflow gate must include `tsc --noEmit` for parity with pre-push, or the failure mode is "push works for me but blocks the next contributor."
- **Date logged**: 2026-05-20.
- **Source**: feat/hawks-mode-v0 pre-push failure during manifesto §6 backlog filing.

---

## Accessibility

### Hover-only controls fail touch + keyboard

- **What**: `opacity-0 group-hover:opacity-100` patterns hide controls from touch users and keyboard users entirely.
- **What to do**: Add a focus-visible/focus-within escape, **or** make it a real `<button>` with `aria-label`, **or** add `aria-hidden` if the control is decorative.
- **Enforced by**: `axion/no-hover-only-controls` (error).
- **Date logged**: 2026-05-07.

### Banned raw primitives

- **What**: `<table>`, `<input type="checkbox">`, `<a href>`, `<img>` outside `src/components/ui/` lose the project's a11y + theming guarantees.
- **What to do**: `@/components/ui/table`, `@/components/ui/checkbox`, `next/link`, `next/image`.
- **Enforced by**: `axion/enforce-ui-primitives` (error) for table/checkbox/`<a>`; native lint for `<img>`.
- **Date logged**: 2026-05-07.

---

## UI Patterns

### Never use `window.confirm()` / `window.alert()`

- **What**: Native browser dialogs are unthemed, inaccessible, and break the cockpit aesthetic.
- **What to do**: Use `@/components/ui/alert-dialog` — controlled `open` state, `onOpenChange` for dismiss, `AlertDialogAction` for confirm, `AlertDialogCancel` for cancel.
- **Date logged**: 2026-05-07.

### `text-trade-buy` / `text-profit` are not "good", `text-trade-sell` / `text-loss` are not "bad"

- **What**: The trade colors signal **signed money polarity** (long vs short, profit vs loss). They are reserved for that. Painting any non-money signal with them is a category error: a boolean "is active" state, an operation outcome ("save succeeded"), a "this row is filled" indicator, a status badge — none of those are signed money. Wave 6 cleaned this hijack up across 4 settings widgets (toggle indicators) and 2 recalc-result messages; Wave 9 caught HAWKS reintroducing it in `HawksSettings` (`text-profit` for HAWKS-active boolean) and retired `text-trade-buy` from `required-indicator.tsx` (filled-`*` across every required form field).
- **What to do**: For verdict-good / verdict-bad signals (operation outcome, "this thing is in the right state"), use the verdict triad: `text-fb-success` for good, `text-fb-error` for bad. Both exist in `globals.css` with light + dark tones. For neutral category states ("this row is enabled"), use `text-txt-200` or a non-colored icon-state distinction (filled vs outline).
- **Recognise it**: when you reach for `text-trade-buy`, ask: "am I painting an amount of money the user could have made or lost?". If no, you want the verdict triad.
- **Source**: `docs/scans/2026-05-12-impeccable-settings-wave6.md` (Pattern A + B); `docs/scans/2026-05-13-impeccable-settings-hawks.md` (Phase 3d).
- **Date logged**: 2026-05-13.

---

## CSV Import / Hawks Candle Data

### ProfitChart 5m CSV uses `CANDLE` for candle index, not `Contador de Candles`

- **What**: The Hawks 5m candle CSV exported from ProfitChart names the candle-index column `CANDLE`, not `Contador de Candles`. The parser only recognized the long Portuguese form. As a result `candleIndex` was always `null`. Because the DB upsert conflict key includes `candle_index`, and `NULL != NULL` in PostgreSQL, every re-import created duplicate rows instead of updating existing ones — producing 18,772 ghost rows for 4,957 unique candles.
- **What to do**: The parser (`src/lib/csv-parsers/candle-parser.ts`) now recognizes `"candle"` (normalized lowercase) as a `candleIndex` synonym. If adding support for new ProfitChart CSV exports, always check the header names against the actual file — they vary by export template.
- **Source**: `src/lib/csv-parsers/candle-parser.ts` (`classifyOhlcHeader`), `src/lib/csv-parsers/candle-header-mappings.ts` (`OHLC_HEADERS`).
- **Date logged**: 2026-05-14.

### Large CSV → Server Action fails with "Maximum array nesting exceeded"

- **What**: Passing a large CSV string (>~200KB) directly as a Server Action argument triggers RSC binary encoding, which chunks the string into a deeply nested array structure that exceeds React's nesting limit. The error is `"Maximum array nesting exceeded"`.
- **What to do**: Pass the CSV as a `File` inside `FormData` instead. `FormData` is sent as raw multipart HTTP, bypassing RSC encoding entirely. The server action receives it as `formData.get("csv") as File` and calls `.text()` to read the content. Also requires `experimental.serverActions.bodySizeLimit: "5mb"` in `next.config.ts` for files over the default 1MB limit.
- **Source**: `src/app/actions/candle-import.ts`, `src/components/settings/hawks-import-section.tsx`.
- **Date logged**: 2026-05-14.

### postgres-js + `jsonb`: never pre-stringify the value, pass the object

- **What**: With `postgres-js`, binding `${JSON.stringify(obj)}` to a `jsonb` column does **not** insert a JSON object — it inserts a JSON **string scalar** (the literal `"{...}"` with the braces escaped). `->`/`->>`/`jsonb_typeof` then return `null` / `'string'` and every downstream consumer that expects keys breaks silently. Adding `::jsonb` does not help because the param is already a JSON-encoded string and the cast just parses it as a string scalar. The ingest script for Hawks indicators hit this and stored 300 candles' worth of indicators as opaque strings before we noticed.
- **What to do**: Pass the JS object directly: `${obj as never}`. postgres-js encodes it as `jsonb` on the wire in one pass. The `as never` cast silences TS — the driver's tagged-template types don't model `jsonb` parameters. If a Neon `neon()` client is also in play, the same rule applies (the HTTP driver also auto-encodes objects). To verify after an insert: `SELECT jsonb_typeof(col) FROM …` should return `'object'`, not `'string'`.
- **Source**: `scripts/load-hawks-candles.ts` (the `${r.indicators as never}` parameter).
- **Date logged**: 2026-05-20.

---

## Backtest / Hawks methodology

### Hawks 1R = 2 Renko boxes — don't conflate risk-units with brick-counts

- **What**: In Hawks methodology, `1R` (one risk unit = the stop distance) equals **2 Renko brick bodies**, not 1. The stop fires when one Renko brick closes against entry; the price distance from entry (= entry brick close) to that level is `2·(R−1) + 1` ticks ≈ two brick bodies. The Hawks v0 engine originally set `stopReference = candle.open` (= 1 brick body), which silently halved the stop and inflated reported R-multiples 2×. Fixed 2026-05-15 to `2 * candle.open - candle.close`.
- **What to do**: If you touch any Hawks engine module, target module, R-multiple display, or scorecard analytics, remember R is methodology-defined. The shared backtest engine's `r_multiple` target mode scales with whatever `stopReference` the entry module produces — keep methodology-specific stop logic inside the entry module, never in shared engine code. If a future methodology revises the R definition again, bump `BacktestResult.engineVersion` (currently `"hawks-v0.2"`) and let the UI surface the version on cached results.
- **Source**: `src/lib/backtest/modules/entry/hawks-triple-screen.ts`; post-mortem `docs/postMorten/backend.md` [BUG-2026-05-15].
- **Date logged**: 2026-05-15.

---

## UI Components / react-day-picker

### react-day-picker v9: first click in range mode sets `to = from`, not `to = undefined`

- **What**: In v8, clicking the first date in `mode="range"` called `onSelect({ from: date, to: undefined })`. In v9.x it calls `onSelect({ from: date, to: date })` — same date for both. Any guard like `if (range?.from && range?.to) { close() }` fires immediately on first click, making it impossible to pick a range.
- **What to do**: Check for a _completed_ range by comparing timestamps: `range.from.getTime() !== range.to.getTime()`. Equal timestamps = first click / in-progress. Different timestamps = genuine range selected. Also combine with Radix `e.preventDefault()` in `onInteractOutside` to block outside-click dismissal during mid-selection.
- **Source**: `src/components/ui/date-range-picker.tsx` (`handleSelect`). Post-mortem: `docs/postMorten/frontend.md` [BUG-2026-05-14].
- **Date logged**: 2026-05-14.

---

## Worktrees / Local Postgres

### Worktrees each get an isolated Postgres db — never edit `DATABASE_URL` by hand

- **What**: Both Superset workspaces (`.superset/config.json`) and Claude Code worktrees (`.claude/hooks/worktree-setup.sh`) call `scripts/worktree-db.sh setup` after copying `.env`. That helper creates `axion_wt_<workspace-basename>`, rewrites the worktree's `DATABASE_URL` to point at it, and runs `pnpm db:migrate && pnpm db:seed`. Teardown (`.superset/config.json` teardown array + `.claude/hooks/worktree-teardown.sh`) drops the db. If you hand-edit `DATABASE_URL` in a worktree's `.env` you'll silently desync it from the actual provisioned db, and teardown will fail to drop the right one.
- **What to do**: Treat the worktree `.env` as derived state. If you need a different db, rerun `bash scripts/worktree-db.sh setup` — it's idempotent. Local Postgres is expected at `localhost:5438` (the user runs this via Docker; there is no committed compose file in the repo). If it's down, setup logs a warning but doesn't block the worktree from being usable for non-db work. `DROP DATABASE ... WITH (FORCE)` requires Postgres ≥ 13 — fine for the local PG 17.7 image, but watch out if you switch to an older one.
- **Source**: `scripts/worktree-db.sh`, `.superset/config.json`, `.claude/hooks/worktree-setup.sh`, `.claude/hooks/worktree-teardown.sh`.
- **Date logged**: 2026-05-15.

### Drizzle data layer is driver-aware — Neon over HTTPS, local PG over wire protocol

- **What**: `src/db/drizzle.ts` and `src/db/drizzle-ws.ts` pick their driver by URL via `isNeonUrl()` in `src/db/url.ts`. Neon URLs (anything matching `@…neon.tech`) use `drizzle-orm/neon-http` (and `neon-serverless` for the transactional `dbWs`). Anything else uses `drizzle-orm/postgres-js` over `postgres` (postgres-js). `scripts/run-migrations.ts` and `scripts/seed.ts` do the same. The exposed type is always `NeonHttpDatabase<typeof schema>` / `NeonDatabase<typeof schema>` (cast through `unknown`) so call sites don't need to be driver-aware — both implementations satisfy the Drizzle query-builder API structurally.
- **What to do**: Don't add a new top-level db client that imports `drizzle-orm/neon-http` directly — use the existing `db` / `dbWs` exports so worktree dev keeps working. If you write a new `scripts/*.ts` that talks to Postgres, branch on `isNeonUrl(process.env.DATABASE_URL!)` like `run-migrations.ts` does. Two runtime divergences to know: (a) postgres-js results don't have `result.rowCount` (it's `undefined` — current uses fall back to `?? 0`); (b) postgres-js opens a persistent connection, so long-running scripts must call `await sql.end()` before exiting or the process hangs (see the tail of `scripts/seed.ts`).
- **Source**: `src/db/url.ts`, `src/db/drizzle.ts`, `src/db/drizzle-ws.ts`, `scripts/run-migrations.ts`, `scripts/seed.ts`.
- **Date logged**: 2026-05-15.

## Drizzle Migrations

### After a migration squash, `pnpm db:migrate` won't reconcile your local DB — you must drop and re-migrate

- **What**: Drizzle's `__drizzle_migrations` bookkeeping table stores a SHA-256 hash of each migration's SQL body alongside the filename. When the team squashes (collapses N old migrations into one consolidated file), the bookkeeping rows on any local/dev DB still reference the pre-squash hashes and filenames. Pulling the squashed branch and running `pnpm db:migrate` does **not** rewrite history — Drizzle compares the new migration set against the recorded hashes, finds drift (or fails to find expected entries), and either errors mid-run or tries to re-apply migrations whose objects already exist (e.g. "type `account_type` already exists"). The schema state on disk is fine; the bookkeeping is what's broken.
- **What to do**: After pulling a squash, the only safe local recovery is destructive: drop the database, recreate it, run `pnpm db:migrate` from scratch, then `pnpm db:seed`. For worktrees, rerun `bash scripts/worktree-db.sh setup` (it drops + recreates idempotently). **Production / Neon is unaffected** because the squash is designed to be hash-compatible with the prior live state — only dev environments that ran the pre-squash migrations carry stale bookkeeping. Never hand-edit `__drizzle_migrations` to "fix" hashes; that hides drift instead of resolving it. If you can't drop (e.g. shared dev data you need), restore from a dump after the reset.
- **Source**: 2026-05-15 session implementing strategy versioning v1 — `pnpm db:migrate` failed against a worktree DB with 27 pre-squash entries vs 6 post-squash files; resolved by drop + recreate.
- **Date logged**: 2026-05-15.

---

## Agent Orchestration

### Parallel background agents share the working tree — any agent that runs `git commit` over-sweeps siblings

- **What**: When the orchestrator launches multiple background agents (`Agent` tool, `run_in_background: true`) without `isolation: "worktree"`, every agent edits the _same_ repo directory. A "stay in your lane" instruction in the prompt is a soft guard, not a hard one. If any agent decides to `git add -A && git commit` to wrap up its own work, the commit snapshots all uncommitted sibling progress under its own commit title. Observed in the 2026-05-15 parallel-wave: the "Monitor/painel locale routing" agent (whose actual work was a 1-line backlog deletion) committed under a routing-themed title that included StatCard split, verdict-triad palette tokens, and partial coaching/reports work from four sibling agents.
- **What to do**: Pick one of:
  - **Hard isolation**: pass `isolation: "worktree"` on the `Agent` call. The agent works on a temporary git worktree; nothing it touches reaches the parent tree until the orchestrator merges. Use this for any wave where two+ agents are running concurrently and might both commit.
  - **Soft fence**: keep prompts explicit — `"Do NOT run git add / git commit. Leave changes in the working tree for the orchestrator to consolidate."` This is necessary but insufficient (a Sonnet agent will sometimes commit anyway if it judges the task "obviously done").
  - **Belt and braces**: for routing/cleanup-only agents whose `git status` should be near-empty, restrict their prompt to a single file scope ("only touch `docs/backlog.md`"). If the agent then auto-commits, the blast radius is one file.
- **Source**: 2026-05-15 parallel-wave (commit `6a7e986` over-swept; recovered via `560310e` follow-up).
- **Date logged**: 2026-05-15.

---

## E2E / Playwright config

### `globalSetup` and `globalTeardown` point at the same file — by design

- **What**: `playwright.config.ts` wires both `globalSetup` and `globalTeardown` to `./e2e/global.teardown.ts`. The filename is misleading: the script runs at _both_ boundaries of a test session, so any cleanup it does also happens _before_ tests start. The journey suite relies on this: a fixed-email Bravo persona (`bravo@axion-demo.com`) gets its DB row and `rate_limit_attempts` slot wiped on chain start, so the login rate-limit (`login:<email>` in `src/app/actions/auth.ts`) never trips on Stage 0. There is also a separate `e2e/global.setup.ts`, but it is registered as a **named project** ("setup") via `test.setMatch`, not as a top-level globalSetup — it handles admin login + storageState for the legacy `e2e/tests/*` suites.
- **What to do**: If you need a new "run before every Playwright session" hook, extend `e2e/global.teardown.ts` rather than wiring a second globalSetup. If you need to seed/auth a specific user, do it in a Playwright project named `setup` (see how `chromium-auth` and the journey stages depend on it). Renaming the file to `global.cleanup.ts` would be more honest, but the rename touches CI workflows — leave it unless you are already touching that area.
- **Source**: `playwright.config.ts:213-214`, `e2e/global.teardown.ts`, `e2e/global.setup.ts`.

### `pnpm test` runs Playwright E2E, **not** Vitest — unit tests live under `pnpm test:unit`

- **What**: `package.json` has `"test": "playwright test"` and `"test:unit": "vitest run"`. Reaching for `pnpm test src/__tests__/lib/foo.test.ts` will launch the full E2E suite (and ignore the path because Playwright doesn't take a vitest-style positional). The visible symptom is a wall of `[E2E Teardown]` cleanup logs followed by an `ELIFECYCLE Test failed`, with no actual test summary in the tail — the real unit test results never ran.
- **What to do**: Use `pnpm test:unit <path>` for vitest. The path-positional works (and `--run` is implicit when not using `:watch`). E2E is `pnpm test`, unit is `pnpm test:unit`, lint-rule meta-tests are `pnpm test:lint-rules`. There is no aggregator that runs both.
- **Source**: 2026-05-20 Hawks branch ship verification — initial run mistakenly used `pnpm test --run …`, which silently launched Playwright and produced an ELIFECYCLE buried under teardown noise.
- **Date logged**: 2026-05-20.

### `drizzle-ws.ts` throws at module load if `DATABASE_URL` is unset — Vitest mocks must intercept it explicitly

- **What**: After the 2026-05-15 driver-aware DB refactor (`src/db/drizzle.ts` and `src/db/drizzle-ws.ts`), both modules now `throw new Error("DATABASE_URL missing")` at top-level if the env var is absent. This is intentional fail-fast behaviour for production paths. The side effect is that any Vitest file which imports a `"use server"` action that transitively imports `@/db/drizzle-ws` will crash at **import time** (not test time) when DATABASE*URL is unset — \_even if* the test file already mocks `@/db/drizzle`. The vitest error reads `Error: DATABASE_URL missing ❯ src/db/drizzle-ws.ts:22:8`, and the failing suite shows `(0 test)`.
- **What to do**: When mocking the data layer for a unit test, always check whether the module-under-test (and its transitive imports) reach `@/db/drizzle-ws` as well. If yes, add a parallel `vi.mock("@/db/drizzle-ws", () => ({ dbWs: { transaction: vi.fn(...) } }))`. Standard targets that need both mocks: anything under `src/app/actions/fractal-plan/`, anything that touches `src/lib/fractal-plan/auto-seed.ts`, anything Hawks-mode (server actions in `src/app/actions/hawks-renko.ts` and friends). The `drizzle-ws` client surface used in production is mostly `dbWs.transaction(...)` — a 1-line mock that invokes the callback with `{}` is sufficient for most tests.
- **Source**: 2026-05-20 Hawks branch ship verification — three fractal-plan unit tests (`actions-fractals`, `actions-yearly`, `auto-seed`) failed at import after the driver-aware refactor made `drizzle-ws.ts` eager-throw.
- **Date logged**: 2026-05-20.

---

## Seed Scripts / Dev Data

### `pnpm db:seed` sets `strategies.current_version = 1` but inserts zero `strategy_versions` rows

- **What**: Auto-seeded strategies (created by `scripts/seed.ts` or any equivalent fixture) have `strategies.current_version = 1` set at insert time, but no corresponding row is inserted into `strategy_versions`. Any code path that calls `getCurrentVersionId(strategyId, currentVersion)` returns `null` for these strategies — which causes `getStrategyConditionsRollup` (and any future action that resolves a specific version) to return `NOT_FOUND`. The symptom in the Playbook page is a blank render with no error: `rollup=null` falls through every conditional silently. Hit during Hawks-mode QA (2026-05-21) — the Hawks gate fired correctly but the panel didn't render because the rollup was null.
- **What to do**: After seeding strategies in dev, manually insert a seed version row: `INSERT INTO strategy_versions (id, strategy_id, version_number, created_at) VALUES (gen_random_uuid(), '<strategy_id>', 1, now())` (adjust columns to match current schema). The long-term fix is to update `scripts/seed.ts` to insert the version row alongside each strategy insert. For production, new strategies created via the UI go through the `createStrategy` server action which already inserts the version row correctly.
- **Source**: `src/app/actions/strategy-conditions.ts` (`getCurrentVersionId`); QA session 2026-05-21 on `feat/hawks-mode-v0`.
- **Date logged**: 2026-05-21.
