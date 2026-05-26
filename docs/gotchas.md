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

## Drizzle ORM / Database Drivers

### `pnpm db:generate` crashes on column rename without a TTY — and for backfill migrations you don't want the rename anyway

- **What**: `drizzle-kit generate` interactively asks "Is column `X` -> `Y` a rename?" any time it detects a column being removed and a new one added in the same diff. In a non-TTY context (Claude, CI) it crashes with `Error: Interactive prompts require a TTY terminal`. Piping `\n` or wrapping in `script -q /dev/null` doesn't help — the `process.stdin.isTTY` check fires before any input is read.
- **What to do**: For column-rename-with-backfill (the common case — you're renaming because the column's _semantics_ are changing, e.g. `default_asset varchar(20)` → `default_asset_id uuid`), you actually want the **drop + create** path, not the rename — that way the migration SQL has a moment to backfill from the old column before it's dropped. So hand-author the migration instead of fighting drizzle-kit:
  1. Edit `src/db/schema.ts` to the desired end state.
  2. `cp src/db/migrations/meta/{N-1,N}_snapshot.json` and edit only the changed column entry + `foreignKeys` block. Bump the snapshot's `id` (new uuid) and set `prevId` to the previous snapshot's id.
  3. Write `src/db/migrations/NNNN_<name>.sql` with the 3-step transition: `ALTER TABLE … ADD COLUMN new_col …;` → `UPDATE … SET new_col = … FROM old_source …;` → `ALTER TABLE … DROP COLUMN old_col;`.
  4. Append an entry to `src/db/migrations/meta/_journal.json` (next `idx`, `tag` = `NNNN_<name>`, `when` = ms timestamp, `breakpoints: true`).
  5. Re-run `pnpm db:generate` — it should print `No schema changes, nothing to migrate 😴`, which confirms the new snapshot is the canonical end state.
- **Don't**: Don't edit historical snapshot files (`0000_*`–`(N-1)_*`) or past SQL migrations — they document past schema states and a fresh DB replays them in order. They must stay frozen.
- **Source**: 2026-05-26 session executing the `defaultAsset → defaultAssetId` backlog item; resulting migration is `0014_lush_devos.sql`.

---

### Neon HTTP driver lacks transaction support; postgres-js fallback masks the limitation

- **What**: `drizzle-orm/neon-http` is the Neon driver for stateless HTTPS clients. It does NOT support `db.transaction(async (tx) => { /* multi-statement ops */ })`. Any call to `db.transaction()` throws `Error: No transactions support in neon-http driver`. The postgres-js driver (used for local worktrees) _does_ support transactions, so the bug never surfaces during development.
- **Symptom**: A feature works perfectly in local dev and CI (postgres-js), but breaks silently in production (neon-http). The error is caught and swallowed internally (e.g., in a try-catch that returns a structured error response), so users see no crash — just a dead feature. Example: strategy creation fails with no visible error.
- **Call sites**: Any server action or route handler that uses `await db.transaction(...)`. Audit these before deploying a `neon-http`-backed application.
- **What to do**: Swap to `drizzle-orm/neon-serverless` (WebSocket-backed, stateful, full transaction support). Both drivers point to the same Neon URL. See `src/db/drizzle.ts` for the pattern: configure `neonConfig.webSocketConstructor = ws` for Node runtime, then use `drizzle(..., { schema })` as usual.
- **Root issue**: Neon's HTTP client is designed for edge functions (low latency, no connection state). Transactions require a persistent connection; use the serverless driver instead.
- **Source**: `[BUG-2026-05-25-3]` in `docs/postMorten/backend.md`.

---

### Migrations run pre-deploy in CI — use expand-contract for non-additive changes

- **What**: `.github/workflows/deploy.yml` runs `pnpm db:migrate` **before** `vercel build` + `vercel deploy`. If the migration fails the workflow stops and the previous deploy stays live. `DATABASE_URL` is sourced from `.vercel/.env.production.local` (written by `vercel pull`) so it stays in one place — don't add a separate GH `DATABASE_URL` secret.
- **Expand-contract caveat**: Migrations that **drop or rename** columns (or change types incompatibly) create a brief window between "ALTER TABLE finishes" and "Vercel deploy goes live" where the _previous_ deployed code reads against the _new_ schema and 500s. For Axion-scale traffic this window is typically <60s, but the safe pattern for non-additive schema changes is two PRs:
  1. **Expand** — add the new column + backfill, leave the old column in place. Code tolerates both shapes (e.g. `a.id === defaultAssetId || a.symbol === defaultAssetId`). Ship.
  2. **Contract** — once the new code is fully deployed and read-traffic confirms the old column is unused, drop the old column in a second migration. Ship.
- **When to skip expand-contract**: Strictly-additive migrations (new tables, new nullable columns, new indexes) are safe single-shot. Drops/renames/type-narrowings are not.
- **Source**: 2026-05-26 session adding `pnpm db:migrate` to the deploy workflow alongside the `defaultAsset → defaultAssetId` rename. The rename itself shipped single-shot (acceptable given low traffic + handful-of-rows blast radius), but future renames should follow expand-contract.

---

## NextAuth / JWT Sessions

### Parallel `auth()` calls corrupt JWT cookie under `strategy: "jwt"`

- **What**: With NextAuth `strategy: "jwt"` and default `maxAge`, multiple concurrent server actions that each call `auth()` (e.g., via `requireAuth()`) can prepare overlapping `Set-Cookie` headers. The browser writes the last one, potentially corrupting the JWT (missing fields, bad signature). On the next request, the Edge middleware tries to decode the corrupted JWT, gets `auth.user = null`, and redirects to login.
- **Symptom**: User performs an action that triggers N concurrent server actions (e.g., a settings save with `Promise.allSettled`). Within 20–30 seconds (after page navigation), they're redirected to `/login?callbackUrl=...` even though the session cookie is still in DevTools.
- **Why it's late**: The browser doesn't validate JWT locally. The corruption isn't detected until the Edge middleware tries to decode the cookie on the next request.
- **What to do**: Serialize actions that call `auth()` — use a `for-of` loop instead of `Promise.allSettled`. The UX cost (slightly longer save) is negligible; the correctness cost (session corruption) is high. See `src/components/settings/settings-save-bar.tsx` for the pattern.
- **Root issue**: NextAuth does not make concurrent `Set-Cookie` writes idempotent. Overlapping headers can corrupt the payload.
- **Source**: `[BUG-2026-05-25-2]` in `docs/postMorten/backend.md`.
- **Date logged**: 2026-05-25.

### `requireAuth()` + `cache()` in parallel server actions: session state isolation

- **What**: `src/app/actions/auth.ts:349` defines `requireAuth = cache(async () => auth()...)`. React's `cache()` is request-scoped. If you call `requireAuth()` from two parallel server actions in the same request, both hits use the **same cached result**. If one action mutates session state (e.g., via `auth.user.accountId = X`), the mutation leaks to the other.
- **Symptom**: Rarely hit in practice (requires mutation of `auth` object, which is not expected), but the gotcha is: cached result !== race-safe result.
- **What to do**: Don't mutate the result of `requireAuth()`. If you need to mutate session state, use `updateSession()` from `next-auth/react` (client-only) or set a session cookie explicitly (server-only, complex). Safe parallel access to read-only `userId` / `accountId` is fine.
- **Source**: React `cache()` docs + NextAuth session architecture.
- **Date logged**: 2026-05-25.

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

### `getTranslations` (next-intl/server) inside a Client Component tree throws at render

- **What**: An `async` component that calls `getTranslations` from `next-intl/server` cannot be rendered from a `"use client"` parent. Symptom: `Error: getTranslations is not supported in Client Components` + `<X> is an async Client Component. Only Server Components can be async at the moment.` followed by the error boundary swallowing the tab. We hit this on `<DarfStrip>` rendered inside the client `<TaxTab>` on the plan year page.
- **What to do**: If the component is reachable from any client subtree, make it a Client Component (`"use client"`) and use the `useTranslations(...)` hook from `next-intl` (no `/server`). Server-Component callers can still render Client Components without changes. Reserve `getTranslations`/`async` components for components that are _only_ rendered from Server Components.
- **Date logged**: 2026-05-23.

### `useEffect` is too late to cover the first paint after a hard reload

- **What**: Anything you decide inside `useEffect` runs _after_ the browser's first paint of the new page. If your goal is to cover the new page (e.g. after `window.location.reload()` during an account switch) so the user never sees the underlying UI, an `isVisible` boolean set inside `useEffect` will visibly snap in one frame late — the user sees the page, then the cover appears, then it fades out. We hit this on `ResumedOverlay` in the account-switch flow.
- **What to do**: Move the visibility signal _before_ first paint. The repo's pattern is an inline `next/script` with `strategy="beforeInteractive"` (see `src/components/providers/account-transition-script.tsx` and the orphaned `BrandScript`) that synchronously reads `sessionStorage`/`localStorage` and sets a `data-*` attribute on `<html>` _before_ body parses. Render the cover in the SSR tree with `opacity:0` Tailwind classes, and use a CSS rule keyed to the `<html>` attribute to flip it to `opacity:1`. The cover then exists on the very first frame, no hydration race.
- **Date logged**: 2026-05-23.

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

### `@radix-ui/react-scroll-area` crashes React 19 inside any mount/unmount boundary

- **What**: `ScrollArea` v1.2.10 uses `useComposedRefs` internally, which calls `setState` during React 19's `disappearLayoutEffects` phase (triggered on unmount and on Suspense "disappear"). React 19 rejects this as "Maximum update depth exceeded", caught by the app's `ErrorBoundaryHandler`. Affects any `ScrollArea` that lives inside a Radix `Sheet`/`Dialog`/`AlertDialog` (open/close cycles), a lazy-mounted tab panel, or a layout component that participates in RSC Suspense streaming (even fixed-position sidebars disappear temporarily during route transitions in Next.js App Router).
- **What to do**: Replace `<ScrollArea>` with `<div className="overflow-y-auto">` for any scrollable container that can mount or unmount. Reserve `ScrollArea` only for permanently-mounted, never-Suspense-wrapped surfaces — and even then, prefer the native `overflow-y-auto` div unless custom scrollbar styling is a hard requirement.
- **Known risky survivors**: `dashboard/day-detail-modal.tsx:105`, `monte-carlo/stats-preview.tsx:118` — both live inside modals and carry this risk if their E2E tests exercise open/close cycles.
- **Source**: `src/components/layout/sidebar.tsx`, `src/components/layout/app-shell.tsx`, `src/components/journal/new-trade-tabs.tsx` — all three removed or lazy-guarded their `ScrollArea` usages.
- **Date logged**: 2026-05-22.

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

### `.env`'s default `DATABASE_URL` points at Neon production — local dev writes hit prod data

- **What**: `.env` line 1 sets `DATABASE_URL` to the Neon production branch (`ep-quiet-glade-ahk8537u`); line 2 (the localhost Docker URL) is commented out. So unless you explicitly switch lines or run inside a worktree (which provisions its own DB via `scripts/worktree-db.sh`), every `pnpm dev`, `pnpm db:seed`, and one-off `tsx scripts/*` connects to the shared Neon DB. The "local" and "production" DB are the same Postgres branch for the primary checkout. Tasks like "update admin credentials in the local DB" are in fact production writes.
- **What to do**: Before running any mutation script outside a worktree, check which `DATABASE_URL` is active (`grep -n "^DATABASE_URL" .env`). For destructive or rewriting work, prefer (a) switching to a worktree (auto-isolated DB), (b) running against `DATABASE_URL_STAGING` explicitly via `DATABASE_URL=$DATABASE_URL_STAGING pnpm tsx …`, or (c) uncommenting the localhost line for a dockerized local Postgres. The Neon prod URL has no separate "dev write protection" — there's no safety net beyond reading `.env` first.
- **Source**: 2026-05-25 admin-credential rotation (`admin@axion.com` → `admin@bravo.com`) — UPDATE applied to Neon prod via `scripts/update-admin-credentials.ts` because the active `DATABASE_URL` is the prod branch.
- **Date logged**: 2026-05-25.

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

### After "drop + recreate database" via Neon console, `pnpm db:migrate` may silently no-op — `pnpm db:push --force` is the recovery

- **What**: When you drop + recreate a Neon database via the web console and then run `pnpm db:migrate`, the migrator (Drizzle's Neon HTTP `migrate()` in `scripts/run-migrations.ts`) prints `migrations applied` with zero per-migration log lines and exits 0 — but **no tables get created**. The next step (`pnpm db:seed`) then fails with `relation "trade_tags" does not exist` (PG `42P01`) at the cleanup phase. Suspected cause: the Neon HTTP migrator is silent by design (no per-file logging), and some interaction with the Neon console's drop+recreate path leaves it convinced there's nothing to apply — possibly the recreated DB's catalog state or a cached connection. Either way, the symptom is "migrate looks successful, schema is empty."
- **What to do**: Recover with `pnpm db:push --force` — `drizzle-kit push` introspects the live DB and reconciles it against `src/db/schema.ts` directly, ignoring the migrations journal. On a truly-empty DB it just `CREATE`s everything in one pass. Then `ADMIN_PASSWORD=… pnpm db:seed` works normally. **Important**: `db:push` is only safe here because the DB is empty — running it on a populated DB can drop columns the live schema declares but the file doesn't. After the recovery, the DB schema matches `schema.ts` but the migrations journal stays empty; subsequent `pnpm db:migrate` runs will still no-op (now correctly, because everything's already there per the push). For multi-step migrations going forward, prefer "drop schemas via `psql` (`DROP SCHEMA public CASCADE; DROP SCHEMA drizzle CASCADE; CREATE SCHEMA public;`) + `pnpm db:migrate`" over "drop database via console" — the SQL path keeps both schema state and journal state consistently empty, so migrate sees zero records and applies all 14 files.
- **Source**: 2026-05-23 session resetting prod (`ep-quiet-glade-ahk8537u`) for W1 Axion usability audit. User dropped + recreated DB via Neon console; `pnpm db:migrate` reported "applied" with empty schema; `pnpm db:push --force` recovered; `ADMIN_PASSWORD=… pnpm db:seed` completed (1,123 trades, 7 accounts).
- **Date logged**: 2026-05-23.

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

### Re-running the E2E suite back-to-back trips the login rate limiter

- **What**: Running the full Playwright suite twice in rapid succession causes the `setup` project to fail with "Login timed out" — but the real error (hidden in the page snapshot) is `"Too many login attempts. Please try again in N minute(s)."`. The auth spec (`auth.spec.ts`) fires many login/register calls against `admin@bravo.com`, exhausting the per-email rate limit bucket. Subsequent `setup` runs try to log in as the same user and silently hit the rate-limit UI instead of an error the test catches — the `Promise.race` in `global.setup.ts` only matches `text=/Invalid|Error/i`, not the rate-limit banner, so it falls through to `timeout` after 30 s.
- **What to do**: Wait 7–10 minutes between full suite runs. If you need to run only the data phases (settings/playbook/journal) after a clean auth run, they reuse the stored `e2e/.auth/user.json` and do not need to re-authenticate — but they still run `globalSetup` (= `global.teardown.ts`) which is fine. The fastest workaround for rapid iteration is to skip auth: `pnpm exec playwright test --project=chromium-settings --project=chromium-playbook --project=chromium-journal` will reuse the existing `.auth/user.json` without re-running the `setup` project (just make sure the JSON exists from a prior run).
- **Source**: `e2e/global.setup.ts:26`, `src/app/actions/auth.ts` (rate-limit logic); 2026-05-21 test session.
- **Date logged**: 2026-05-21.

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

### Passing explicit `NULL` in a Drizzle/postgres-js template insert defeats `DEFAULT` clauses

- **What**: In `INSERT INTO trading_accounts (..., profit_share_percentage, ...) VALUES (..., ${spec.profitSharePercentage ?? null}, ...)`, the `?? null` falls back to `NULL` when the spec doesn't set the field. PostgreSQL treats this explicit NULL as **the value you want to insert**, NOT as "use the column default" — so the schema's `.default("100.00").notNull()` never fires and the insert blows up with `23502 not_null_violation`. This came up reseeding the dev DB after the 7-account expansion: Personal/Greenline/Beginner all triggered it because only Atom Funded (prop) sets `profitSharePercentage`.
- **What to do**: When a column has a NOT NULL + DEFAULT in the schema, either (a) omit the column entirely from the INSERT column list (cleanest — lets the default apply), or (b) substitute the literal default in JS instead of `null` (e.g. `?? 100`). Don't rely on `?? null` as a "safe" pass-through; it actively overrides defaults.
- **Source**: `scripts/seed/accounts.ts:123`; reseed session 2026-05-23.
- **Date logged**: 2026-05-23.

---

## React

### React 19: `startTransition(() => { void asyncFn() })` inside `useEffect` causes infinite re-renders

- **What**: In React 18, wrapping `void asyncFn()` in `startTransition` inside a `useEffect` worked harmlessly — only the synchronous portion before the first `await` was treated as a transition. In **React 19**, the async transition semantics changed: ALL state updates inside an async function passed to `startTransition` are deferred transition updates, including every `setState` call in the async function body (even after `await`). When this pattern runs inside a `useEffect`, the deferred updates trigger the effect again, which queues more transition updates, cascading into "Maximum update depth exceeded" (React's 25-re-render guard). Next.js App Router catches the render error, rolls back the URL via `pushState`, and shows the `[locale]/error.tsx` boundary — making it look like a navigation error, not a data-fetch error.
- **What to do**: Never use `startTransition` inside `useEffect`. `startTransition` is for **user-initiated actions** (button clicks, input events) where you want to deprioritize the update. For effect-driven data fetching, use `void asyncFn()` directly — no `startTransition` wrapper. The fix in `src/components/journal/journal-content.tsx`: replaced `startTransition(() => { void fetchTrades() })` with `void fetchTrades()` and removed the `useTransition` import.
- **Symptoms**: "Maximum update depth exceeded" in the browser console + `[locale]/error.tsx` boundary triggered on page navigation + Next.js rolls back the URL.
- **Source**: `src/components/journal/journal-content.tsx`; E2E session 2026-05-21 — `chromium-navigation` 90 s timeout + `mobile-journal` empty state never resolved.
- **Date logged**: 2026-05-21.

---

## E2E / Playwright config

### Journal list renders `role="option"` rows (TradeDayGroup → TradeRow), not `id^="trade-card-"` cards

- **What**: `TradeCard` (`id="trade-card-{id}"`) is a separate component used for card-grid contexts (e.g. trade detail). The journal **list** page renders `TradeDayGroup` → `TradeRow` — each trade row is a `<Link role="option">` inside a `<div role="listbox">` day-group accordion. E2E tests that used `[id^="trade-card-"]` to assert "a trade is visible in the journal list" never matched anything.
- **What to do**: Use `[role="listbox"] [role="option"]` (or `page.getByRole("option")`) when asserting trades in the journal list. Updated in `e2e/journey/04-daily-loop.spec.ts:129` and `e2e/tests/journal.spec.ts:54`.
- **Source**: `src/components/journal/trade-day-group.tsx`, `src/components/journal/trade-row.tsx`; E2E session 2026-05-21.
- **Date logged**: 2026-05-21.

### `page.waitForLoadState("networkidle")` reliably times out in React 19 / Next.js 16 (mobile especially)

- **What**: `networkidle` requires 500ms of zero network activity. React 19 streaming RSC, server actions, and Next.js telemetry/DevTools keep dripping small fetches indefinitely. On iPhone 14 emulation the 30s test timeout is routinely exceeded for pages with active server data fetching (command center, analytics, reports, monthly-plan).
- **What to do**: Replace with `await page.waitForLoadState("load"); await page.waitForTimeout(1000)`. BUT: (a) settings page is safe with `networkidle` because it has no continuous background fetches; (b) the `waitForSuspenseLoad()` helper in `e2e/utils/helpers.ts` also used `networkidle` internally and needed the same fix; (c) journey-00's `saveStageState` call MUST use `networkidle` to ensure the JWT Set-Cookie from account selection has arrived before the state is persisted — using `load+1s` there saves sessions missing `accountId`, causing all downstream journey stages to hit the proxy's login redirect.
- **Source**: Bulk E2E session 2026-05-22 — 59 mobile tests fixed then 18 regressions found. Final pattern: `networkidle` is correct for login/session boundaries and static pages; `load` for live-data pages on mobile.
- **Date logged**: 2026-05-22.

### Phase 4b Fractal Cascade Required for resolveDay()

- **What**: After Phase 4b schema migration, the trading system's `resolveDay()` and `resolveBehavior()` functions require a **full hierarchy** of `yearly_plans` → `quarterly_plan` → `monthly_plan` rows. E2E seed functions that try to create only a `monthly_plans` row (or create the new `monthly_plan` without parent rows) will fail silently in the DB but cause hidden query failures downstream. Tests pass initial mount but fail when the trading logic tries to `resolveDay()`, manifesting as "element not found" or "timeout waiting for visible" errors after user interactions.
- **What to do**: When seeding for E2E tests, always call the full cascade builder: create/link `yearly_plans` (with ladder_rules, default_daily_loss_r, etc.), then `quarterly_plan`, then `monthly_plan` with override columns. See `ensureBravoFractalCascade()` in `e2e/utils/seed-trading-data.ts` as the canonical pattern.
- **Risk**: The error manifests as a Playwright timeout or missing DOM element, not as a DB error. If you see "expected element not found" in a test that used to pass, check if seed data is creating the full cascade.
- **Date logged**: 2026-05-22.

### Fractal cascade seed UPDATE must re-seed snapshot fields — otherwise resolveDay() returns oneRCents=0

- **What**: `ensureBravoFractalCascade()` has two paths: INSERT (new row) and UPDATE (existing row). The original UPDATE only set `override_risk_profile_id` and `updated_at`. When an existing `monthly_plan` row had `snapshot_one_r_cents = NULL`, `resolveDay()` returned `monthRow?.snapshotOneRCents ?? 0` → 0. This made all "Next Risk" displays show `$0.00` in live-trading-status tests.
- **What to do**: The UPDATE path MUST also re-seed `snapshot_capital_cents`, `snapshot_one_r_cents = 50000`, `snapshot_tier_index = 0`, `snapshot_computed_at`, `snapshot_reason`. Fixed in `e2e/utils/seed-trading-data.ts:408–418` (2026-05-22).
- **Date logged**: 2026-05-22.

### `snapshot_reason` is a PostgreSQL enum — only 3 valid values

- **What**: `snapshotReasonEnum` at `src/db/schema.ts:115` allows only `"month_start"`, `"drawdown_trigger"`, `"manual"`. Using `"e2e_test_setup"` in a raw SQL INSERT/UPDATE causes a runtime Postgres enum constraint error.
- **What to do**: Always use `'manual'` when seeding `snapshot_reason` in E2E utilities.
- **Date logged**: 2026-05-22.

### Playwright `toBeVisible()` on SVG `<rect>` inside Recharts always fails

- **What**: Recharts `<Bar>` elements render `<rect>` SVG children inside a `ResponsiveContainer`. Playwright treats SVG elements without a meaningful viewport box (positioned/clipped inside the SVG viewBox) as "hidden" even when the chart container itself is fully visible. `scrollIntoViewIfNeeded()` on a `<rect>` is a no-op (SVG elements don't scroll).
- **What to do**: Use `toBeAttached()` to verify the rect is in the DOM, or check the chart container visibility (`[role="img"]`) instead of individual bar rects. Avoid `toBeVisible()` on SVG child elements inside Recharts.
- **Source**: `e2e/tests/annual-reporting.spec.ts`; session 2026-05-22.
- **Date logged**: 2026-05-22.

### Trade form `getByRole("combobox", { name: /strategy/i })` fails due to broken label association

- **What**: `FormLabel` in shadcn/ui sets `htmlFor` to an internal FormField context ID, NOT the `SelectTrigger` element's `id`. So `getByRole("combobox", { name: /strategy/i })` can't find the combobox by its label — Playwright times out at 30s.
- **What to do**: Use stable IDs directly: `#trade-strategy`, `#trade-asset`, `#trade-entry-price`, `#trade-exit-price`, `#trade-position-size`, `#trade-form-submit`. Direction buttons use `aria-pressed` (not `role="radio"`) — use `getByRole("button", { name: /^long$/i })`.
- **Source**: `src/components/journal/trade-form.tsx`; `e2e/tests/trade-conditions.spec.ts`; session 2026-05-22.
- **Date logged**: 2026-05-22.

### Phase 4b Plan Architecture: monthly plan page no longer has `#plan-*` IDs

- **What**: The `#plan-previous-month`, `#plan-next-month`, `#plan-create`, `#plan-edit`, `#plan-save`, `#plan-account-balance` IDs were all dropped in Phase 4b. Monthly plan is now at `/en/plan/[year]/[quarter]/[month]` via `MonthReport` + `MonthHeader`. Navigation is via `<Link>` elements (clicking them changes the URL). The edit button opens a slideover with `#month-goal`, `#month-intent`, `#month-postmortem`, `#month-risk-profile`, `#btn-month-save`.
- **What to do**: For prev/next navigation: `getByRole("link", { name: /previous month/i })`. For edit: `getByRole("button", { name: /edit plan/i })`. For save: `#btn-month-save`.
- **Source**: `src/components/fractal-plan/cockpit/month-header.tsx`, `monthly-plan-editor.tsx`; session 2026-05-22.
- **Date logged**: 2026-05-22.

### `CumulativePnlChart` renders different IDs depending on data state

- **What**: `src/components/analytics/cumulative-pnl-chart.tsx` renders `id="analytics-equity-curve"` only for the empty-state div (no data). When data exists, it renders `id="chart-analytics-cumulative-pnl"`. E2E tests that hardcode `#analytics-equity-curve` fail at journey stage 8 because trades exist.
- **What to do**: Locate with a combined selector: `#analytics-equity-curve, #chart-analytics-cumulative-pnl`.
- **Source**: `src/components/analytics/cumulative-pnl-chart.tsx:89,105`; `e2e/journey/08-improvement.spec.ts`; session 2026-05-22.
- **Date logged**: 2026-05-22.

### MoodSelector only renders when a `daily_plan` row exists for today

- **What**: `PreMarketNotes` returns early without rendering `MoodSelector` when no `daily_plan` exists for the current date. E2E tests that use `getByRole("radiogroup", { name: /mood/i })` will find 0 elements — not because the selector is wrong but because the component is never mounted.
- **What to do**: Seed a `daily_plan` row (linked to the fractal cascade) before testing mood selector, OR make the test conditional: check `isVisible()` first and skip if false.
- **Source**: `src/components/command-center/pre-market-notes.tsx`; session 2026-05-22.
- **Date logged**: 2026-05-22.

### E2E seeder `BRAVO_DECISION_TREE` must use R-multiples — `adaptDecisionTree` reads `riskR`, not `riskCents`

- **What**: `adaptDecisionTree(tree, oneRCents)` in `src/lib/risk-profiles/cents-shape.ts` reads `tree.baseTrade.riskR`, `tree.cascadingLimits.weeklyLossR`, `tree.gainMode.dailyTargetR`, etc. The E2E seeder's `BRAVO_DECISION_TREE` constant was written in the old cents format (`riskCents: 50000`, `weeklyLossCents: 200000`). Because `adaptDecisionTree` reads R-multiple fields that were `undefined`, every multiplication produced `NaN`, and `fromCents(NaN) = 0` (explicit guard in `src/lib/money.ts`). All "Next Risk" values displayed as `$0.00`.
- **What to do**: The decision tree constant in `e2e/utils/seed-trading-data.ts` must use R-multiples (`riskR: 1`, `dailyTargetR: 3`, `weeklyLossR: 4`, `monthlyLossR: 15`). The canonical reference is `bravoTree` in `src/db/seed-risk-profiles.ts`. The UPDATE path in `ensureBravoRiskProfile` always overwrites the DB profile with the seeder constant — so fixing the constant self-heals stale DB rows.
- **Date logged**: 2026-05-22.

### `createDb` in E2E must be a singleton — calling it per-query exhausts `max_connections`

- **What**: `createDb(url)` in `e2e/utils/create-db.ts` creates a new `postgres(url, {prepare:false})` connection pool on every call. `buildDb()` in `seed-trading-data.ts` calls `createDb` per helper function (8 call sites). Over a 25+ describe-block test suite, this creates 175–200 connection pools, hitting PostgreSQL's `max_connections` (default 100 locally). Symptom: `PostgresError: sorry, too many clients already` in the middle of the test run, manifesting as a `seedScenario` failure → `seedResult` left undefined → `teardownScenario(undefined)` throws `TypeError` in `afterAll`.
- **What to do**: `createDb` must cache its result by URL (module-level `Map<string, E2eDb>`). Also set `max: 1` on the `postgres()` pool — the seeder is serial, so 1 wire connection per process is enough and guarantees the pool never grows. Fixed in `e2e/utils/create-db.ts` (2026-05-22).
- **Source**: `e2e/utils/create-db.ts`, `e2e/utils/seed-trading-data.ts`; session 2026-05-22.
- **Date logged**: 2026-05-22.

### E2E seeder yearly plan: `default_daily_loss_r` and `default_daily_win_r` must both be `3.00`

- **What**: `default_daily_loss_r = 3.0` gives `dailyLossCents = 3 × 50000 = 150000`. `Math.floor(150000/50000) = 3` → `maxTrades = 3`, allowing the full 3-step Bravo recovery sequence (T1 + 3 recovery trades) before hitting the maxTrades stop. Using `2.0` gives `maxTrades = 2`, which stops trading after the 2nd non-breakeven trade — breaking all recovery-in-progress and "breakeven didn't change phase" tests. `default_daily_win_r = 3.0` gives `dailyTargetCents = 150000`, matching the Bravo gain sequence's cumulative target (3 wins × $500). Previously the INSERT had the two values swapped AND neither was re-seeded in the UPDATE path for existing rows.
- **What to do**: The UPDATE path in `ensureBravoFractalCascade` must explicitly set `default_daily_loss_r = 3.00` and `default_daily_win_r = 3.00` so existing yearly plan rows get corrected. Fixed in `e2e/utils/seed-trading-data.ts` (2026-05-22). The "daily loss limit hit" test scenario must use total losses > 150000 (currently −90000 + −70000 = −160000).
- **Date logged**: 2026-05-22.

### Vitest unit tests for server actions: mock upstream actions, not just shared deps

- **What**: `src/app/actions/<X>.ts` typically imports both `@/app/actions/auth` (for `requireAuth`) and **other server actions** (e.g., `executions.ts` imports `getBreakevenTicks` from `@/app/actions/accounts`). Mocking only `@/app/actions/auth` is not enough — importing the upstream action triggers its top-level `@/auth` import, which loads `next-auth`, which fails to resolve `next/server` under Vitest. The whole file then fails to load with: `Cannot find module '.../next-auth/.../node_modules/next/server'`.
- **What to do**: In the test file, mock every server-action module the action-under-test imports from. Pattern: `vi.mock("@/app/actions/accounts", () => ({ getBreakevenTicks: vi.fn().mockResolvedValue(2) }))`. Also mock `@/auth` defensively (`vi.mock("@/auth", () => ({ auth: vi.fn() }))`). See `src/__tests__/actions/executions.test.ts` for the canonical pattern after the 2026-05-22 fix.
- **Source**: `src/__tests__/actions/executions.test.ts`; session 2026-05-22.
- **Date logged**: 2026-05-22.

### Server-action test Zod validation: all UUID fields must be valid v4 UUIDs in mock data

- **What**: Server actions use Zod schemas that include `z.string().uuid()`. Mock data with placeholder IDs like `"trade-123"`, `"account-456"`, or `"nonexistent"` fails Zod validation before any DB code runs — the action returns `{ status: "error", code: "VALIDATION_ERROR" }`, and the test sees `expected 'success' but received 'error'` with no clue why.
- **What to do**: Use real v4 UUIDs in all mock data. The canonical pattern (per `src/__tests__/actions/accounts.test.ts` and `executions.test.ts`): declare module-level constants like `const mockUserId = "550e8400-e29b-41d4-a716-446655440000"` and reuse them.
- **Date logged**: 2026-05-22.

### Drizzle `db.update().set().where().returning()` mocks: `.where()` must return a chainable, not a resolved value

- **What**: When mocking `db.update(table).set(...).where(...).returning()`, a common mistake is `.where: vi.fn().mockResolvedValue({ returning: ... })`. This breaks because `.where()` is called synchronously by Drizzle and must return a chainable object — not a Promise. The mock evaluates to `undefined.returning is not a function`.
- **What to do**: `where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([row]) })`. `mockReturnValue` (sync), not `mockResolvedValue` (async). See `src/__tests__/actions/executions.test.ts:161-165` for the canonical chain.
- **Date logged**: 2026-05-22.

### Agent isolation: `isolation: "worktree"` does not always isolate commits to the worktree branch

- **What**: Spawning parallel agents with `isolation: "worktree"` is supposed to give each agent its own git worktree on a dedicated `worktree-agent-*` branch. In practice (session 2026-05-22, six parallel agents on `feat/hawks-mode-v0`), all six agents' commits landed directly on the parent branch (`feat/hawks-mode-v0`), and the worktree branches stayed at the baseline. The commits ended up linearized cleanly because file ownership was strictly disjoint, but if two agents had touched the same file, the second commit would have failed or surprised the orchestrator with an unexpected merge.
- **What to do**: When dispatching multiple agents in parallel with `isolation: "worktree"`, treat the parent branch as the actual write target — assume isolation may not hold. Always assign **strictly disjoint file ownership** per agent in the brief. After agents complete, verify with `git worktree list` AND `git log --oneline <parent-branch>` to see what actually landed where.
- **Date logged**: 2026-05-22.
