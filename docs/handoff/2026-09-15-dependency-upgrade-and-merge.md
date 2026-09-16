# How to continue the 2026-09-15 dependency upgrade work

Read this if you are picking up Axion after the 48-package dependency upgrade and the `fix-hawks-macd-colors-and-journal-filter-tz` merge. The upgrade and the merge are done and pushed. Two things are still open, and neither was caused by that work.

Prerequisites: [`CLAUDE.md`](../../CLAUDE.md) for the operating rules, [`docs/gotchas.md`](../gotchas.md) for the traps this session logged.

---

## State as of 2026-09-15 18:20 CEST

Branch `main`, working tree clean, local and `origin/main` in sync at `9328a757`.

The six commits this session added, oldest first:

| Commit     | What                                                |
| ---------- | --------------------------------------------------- |
| `9fd92c66` | Upgrade 48 non-major dependencies                   |
| `582fc914` | Merge `fix-hawks-macd-colors-and-journal-filter-tz` |
| `0911ce19` | Repoint apple touch icon at a surviving asset       |
| `4e539e56` | Classify breakeven outcome in the mfe/mae backfill  |
| `ff0c89bc` | Make the commit quality gate explicit               |
| `9328a757` | Log the Next 16.3 traps in `docs/gotchas.md`        |

### What the upgrade changed

48 packages moved to their latest non-major version. The notable ones are `next` 16.2.9 to 16.3.5, `react` and `react-dom` 19.2.7 to 19.3.0, `zod` 4.4.3 to 4.6.5, `lucide-react` 1.22.0 to 1.46.0, plus the full Radix UI set, Sentry, Playwright and ESLint. Exact pins are preserved, because `package.json` uses no version ranges.

Six majors were held back on purpose, because `main` auto-deploys and each is a breaking-change surface:

- `typescript` 6 to 7
- `vitest` and `@vitest/coverage-v8` 4 to 5
- `openai` 6 to 7
- `@tanstack/react-table` 8 to 9
- `@google-cloud/vision` 5 to 6

Taking these is the obvious next piece of work. Do them one at a time, not as a batch.

### Verification that was run

All of the following passed on the merged tree:

- `pnpm test:unit`: 2557 tests, 162 files
- `pnpm lint`: 0 errors
- `pnpm lint:strict`: 0 errors, 7 warnings (the project tolerates warnings by design)
- `pnpm i18n:check`: 0 parity gaps, 0 missing keys
- `pnpm build`: succeeds, partial prerendering intact on all 37 routes
- Browser smoke over 7 routes: no failed requests

CI on `9328a757`: `Unit Tests` green, `Lint & Typecheck` green, `Journey E2E` red, `Personal Vercel Deploy` red. The two red jobs are covered below.

---

## Open item 1: production has not deployed since 2026-07-14

This is the one that matters. `main` auto-deploys through `.github/workflows/deploy.yml`, but the deploy has failed on every run since 2026-08-18. The last green deploy was `43d2d9de` on 2026-07-14.

Do not assume "merged to `main`" means "live" on this repo. The merge is on `main` and is not in production.

### The failure

```
Error: ENOENT: no such file or directory,
lstat '/vercel/path0/data/hawks/user-entries/2026-03-02.json'
```

### Why it happens

Two individually-correct commits built a collision:

- `e783e1ee` added `data/` to `.vercelignore`, so the 60 files under `data/hawks/` never upload.
- `7254a9d3` added server code that reads `data/hawks/user-entries` at runtime through `process.cwd()`.

Next traces those runtime reads into the output file manifest. Vercel then calls `lstat` on a file that was never uploaded, and the deploy exits 1. Vercel's own build log names both exits: remove the colliding rule from `.vercelignore`, or exclude the path through `outputFileTracingExcludes`.

The four files that read the directory:

- `src/app/[locale]/(app)/indicator-lab/page.tsx`
- `src/app/actions/user-catalog-bundles.ts`
- `src/app/actions/hawks-audit-debug.ts`
- `src/app/actions/hawks-isolation-data.ts`

### The two exits, and why this is not an agent's call

The options are not equivalent, so do not pick one without Ygor.

**Narrow `.vercelignore`** so `data/hawks/user-entries/` ships. Indicator-lab and the two Hawks audit routes keep working in production. Cost: 60 JSON files enter every serverless function bundle, and `next.config.ts` already documents a per-function size concern for the DuckDB bindings.

**Exclude the data path from tracing** by adding a `data/` glob to `outputFileTracingExcludes` in `next.config.ts`. The deploy goes green immediately. Cost: the three lab routes throw ENOENT and return 500 when visited in production.

Asking is correct here. Choosing wrong breaks routes silently.

### Verify a fix

Push to `main`, then confirm `Personal Vercel Deploy` reaches `success` for that SHA:

```bash
gh run list --workflow="Personal Vercel Deploy" --branch main --limit 3 \
  --json conclusion,headSha --jq '.[]|"\(.headSha[0:8]) \(.conclusion)"'
```

---

## Open item 2: migration 0028 is not applied to production

The merge carried `src/db/migrations/0028_many_black_panther.sql`:

```sql
CREATE TYPE "public"."be_outcome" AS ENUM('be_killed_runner', 'be_saved_stop', 'be_neutral', 'not_be');
ALTER TABLE "trades" ADD COLUMN "be_outcome" "be_outcome";
```

The change is additive. It creates one enum type and adds one nullable column, so old code keeps working against the new schema and the ordering against a deploy does not matter.

Apply it with `pnpm db:migrate`. Never use `pnpm db:push`, which is blocked in this repo because it breaks the `__drizzle_migrations` ledger. If the ledger is out of sync, run `pnpm db:reconcile-ledger && pnpm db:migrate`.

This is a production write. It needs Ygor's explicit yes before you run it.

---

## Open item 3: Journey E2E has given no signal since 2026-07-07

Every `Journey E2E` run on `main` back to 2026-07-07 is red. The teardown fails on every table it touches, including `assets`, `account_assets`, `account_timeframes`, `trading_accounts`, `users` and `rate_limit_attempts`. Each failure prints `Failed query:` with an empty error body and empty `params:`.

That signature is a dead connection or bad credentials, not a real test failure. Treat a red `Journey E2E` on Axion as no signal rather than as evidence that a change broke something. The jobs that actually guard a merge are `Unit Tests` and `Lint & Typecheck`.

Fixing the connection is worth its own ticket, because until then the suite catches nothing.

---

## Known local state that is not a bug

### The Hawks chart shows a load error locally

`/hawks-chart` renders "Não foi possível carregar os dados do gráfico" because `hawk_5m_win`, `hawk_15m_win` and `hawk_60m_win` are missing from the local database. This is a data gap from the DB reset on the merged branch, not a code fault.

The A/B test that proved it: the same failure appears on the pre-upgrade dependency tree. Three occurrences on `next` 16.2.9, three on 16.3.5.

The fix is `scripts/materialize-hawks-timeframes.ts`. It writes to the database, so it was not run.

### The dev server logs a prerender insight on every route

`next dev` now prints this once per route:

```
Route "/[locale]/...": Next.js encountered uncached data during prerendering or a navigation.
```

It traces to `requireAuth()` calling `auth()` in `src/app/actions/auth.ts:484`, outside a `<Suspense>` boundary. The insight is new in 16.3: zero occurrences on 16.2.9, one per route on 16.3.5.

It does not change the production build. Routes still partial-prerender. Fixing it properly means wrapping the auth-dependent subtree in `<Suspense>` or opting a route out with `export const instant = false`. See `docs/gotchas.md` for the full entry.

---

## One unresolved review finding

The Opus reviewer flagged the branch ordering in `classify_be_outcome`, in `scripts/sensei/backfill-mfe-mae.py`. `be_saved_stop` (`mae_r >= 1.8`) is checked before `be_killed_runner` (`mfe_r >= 1.5`), so a trade that runs to +3R and then pulls back hard classifies as saved rather than as a killed runner.

The finding was not applied. The reasoning: breakeven arms at +1R and moves the stop to entry, so a -1.9R excursion on a trade that exits near zero would have hit the original -1R stop before breakeven ever armed. Either `be_saved_stop` is close to unreachable as written, or MAE here means something other than max adverse excursion from entry.

This is trading doctrine, not a defect an agent should rewrite. Ask Ygor before changing the ordering or the thresholds.

---

## Working agreements this session followed

- Attribute a red CI job to history before blaming the current diff. Use `gh run list --workflow="<name>" --branch main --limit 8 --json conclusion,headSha,createdAt`. Both red jobs here predate the upgrade.
- A/B a suspected dependency regression instead of reasoning about it. Back up `package.json` and `pnpm-lock.yaml`, reinstall the old tree, re-run, compare. This settled two questions in minutes.
- Count markers rather than diffing route rows when comparing Next build output across versions. See the `docs/gotchas.md` entry on the 16.3 marker move, which looked exactly like partial prerendering being disabled and was not.

See also: [`docs/gotchas.md`](../gotchas.md), [`docs/postMorten/`](../postMorten/), [`docs/backlog.md`](../backlog.md).
