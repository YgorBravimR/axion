# `.vercelignore` vs Next file tracing — production stopped deploying for a month

**Date:** 2026-09-16
**Severity:** Critical — `main` auto-deploys and nothing else gates it, so production froze at `43d2d9de` (2026-07-14) while six later commits merged and looked shipped.
**Last green deploy:** `43d2d9de`, 2026-07-14
**First red deploy:** `a44a6d15`, 2026-08-18
**Fix:** narrowed the `data/` rule in `.vercelignore`

## Symptom

Every `Personal Vercel Deploy` run since 2026-08-18 failed on the last step, `Deploy Project Artifacts to Vercel`:

```
Downloading 4141 deployment files...
Error: ENOENT: no such file or directory, lstat '/vercel/path0/data/hawks/user-entries/2026-03-02.json'
```

Vercel's own log named both exits before the error:

```
Remove the colliding rules from `.vercelignore`, or exclude those paths from tracing with `outputFileTracingExcludes`.
```

`pnpm build` was green. `vercel build` was green. `pnpm db:migrate` ran and reported `migrations applied` on every one of these runs, so the production schema kept moving forward while the code did not.

## Root cause

Two individually-correct commits built a collision.

- `e783e1ee` added `data/` to `.vercelignore`, under the comment "Local-only data — never needed at runtime". True for the CSV and Parquet fixtures. Not true for everything under `data/`.
- `7254a9d3` added server code reading `data/hawks/user-entries` through `process.cwd()`.

Four call sites read that directory:

- `src/app/[locale]/(app)/indicator-lab/page.tsx`
- `src/app/actions/user-catalog-bundles.ts`
- `src/app/actions/hawks-audit-debug.ts`
- `src/app/actions/hawks-isolation-data.ts`

Next traces runtime `fs` reads into each route's `.nft.json` output manifest. Five route manifests listed the 59 JSON files. `.vercelignore` then kept those files out of the upload. Vercel `lstat`s every path in the manifest against the uploaded tree, finds nothing, and exits 1.

The build steps pass because the files exist in the CI checkout. Only the upload sees the mismatch.

## Why it went unnoticed for a month

`main` auto-deploys through `.github/workflows/deploy.yml`, and that workflow is the only path to production. `Unit Tests` and `Lint & Typecheck` stayed green the whole time, so the branch read as healthy. `Journey E2E` was already red for unrelated reasons (dead DB connection since 2026-07-07), which trained everyone to ignore red jobs on this repo.

`Personal Vercel Deploy` is named like a deploy step, and it failed inside a step named "Deploy Project Artifacts", after "Build Project Artifacts" succeeded. Reading the job list alone gives no hint that the _cause_ is a build-config collision.

## Fix

```diff
-# Local-only data — never needed at runtime
-data/
+# Local-only data. `data/hawks/user-entries/` is NOT listed on purpose:
+# four server routes read it through `process.cwd()`, so Next traces those
+# 59 files (236K) into the function manifest and the upload fails without them.
+data/hawks/candles/
+data/parquet/
```

Both remaining rules cover gitignored paths (`.gitignore` lines 59-63), so neither is in the CI checkout anyway. The rules stay to keep a locally-run `vercel deploy` from uploading a developer's Parquet fixtures.

## Why ship the files rather than exclude the path from tracing

Adding a `data/` glob to `outputFileTracingExcludes` in `next.config.ts` also turns the deploy green, and it was the wrong choice.

`indicator-lab/page.tsx` and `hawks-audit-debug.ts` call `readdirSync` with no guard, so a missing directory throws and the route returns 500. `user-catalog-bundles.ts` and `hawks-isolation-data.ts` catch and return `[]`, which is worse — the page renders empty and reports no fault. Excluding the path trades a loud deploy failure for three quietly broken routes.

The cost of shipping is 236K across 59 files. `next.config.ts` already traces `libduckdb.so`, 67MB, into the same bundles on purpose. The size argument does not survive the comparison.

## Verification

- `pnpm build`: succeeds, 112 `◐` markers (111 route-locale rows plus the legend line), unchanged from before the fix
- `.next/server/**/*.nft.json`: five route manifests reference `data/hawks/user-entries`, confirming the trace is real and the files must ship
- `gh run list --workflow="Personal Vercel Deploy" --branch main`: the deploy for the fix SHA reaches `success`

## What to carry forward

- Before adding a directory to `.vercelignore`, run `grep -rn "process.cwd()" src/` and confirm no runtime code reads under it.
- A merge to `main` on this repo is not a deploy. Check the workflow conclusion for the SHA.
- A green `Build Project Artifacts` step says nothing about whether the artifacts can be uploaded.

Logged as a gotcha in [`docs/gotchas.md`](../gotchas.md).
