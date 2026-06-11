# DuckDB `libduckdb.so` Missing on Vercel — Cold-Start 500 on `journal/[id]`

**Date:** 2026-06-11
**Severity:** High — every cold-start of any route that imports `@/lib/candle-store` returned a 500. Most visibly: `POST /[locale]/(app)/journal/[id]/page` (the trade detail page).
**Sentry issue:** `PROFIT-JOURNAL-D`
**Production release at the time:** `c1ce17cb9d8f4074e4d93cccad142cfa09c4d679`

## Symptom

Sentry kept reporting:

```
Error: Failed to load external module @duckdb/node-api-313409c5356cb741:
  Error: libduckdb.so: cannot open shared object file: No such file or directory
```

Captured during `POST /[locale]/(app)/journal/[id]/page`. The in-app stack pointed at `src/lib/candle-store/duckdb-impl.ts:3`:

```
src/lib/candle-store/duckdb-impl.ts:3   <anonymous>
turbopack_runtime.js:281                Context.esmImport
turbopack_runtime.js:624                Context.externalRequire
```

i.e. the failure happened at **module-evaluation time** for any cold-start that touched the candle-store, not at query time.

## Root cause

Two independent regressions on top of each other.

### 1. The `linux-x64` binding was in `devDependencies`, not `dependencies`

`@duckdb/node-api` statically imports `@duckdb/node-bindings`. The umbrella `node-bindings` package contains a `switch (process.arch / process.platform)` that `require()`s one of seven platform-specific packages (one of: `…-darwin-arm64`, `…-darwin-x64`, `…-linux-x64`, `…-linux-x64-musl`, `…-linux-arm64`, `…-linux-arm64-musl`, `…-win32-x64`, `…-win32-arm64`).

On 2026-06-09 (`gotchas.md` entry), all seven cross-arch bindings were added as `devDependencies` to unblock Apple-Silicon dev (Turbopack walks every branch of the `switch` statically, regardless of host platform). That fix was correct for dev.

It silently broke production: **Vercel installs production dependencies only** (`pnpm install --prod`). The `@duckdb/node-bindings-linux-x64` package — the one Vercel's Linux x64 serverless runtime actually `require()`s — was therefore missing from `node_modules` on the deployed bundle. The module loader couldn't even find `duckdb.node`, let alone `libduckdb.so`. The error message ("`libduckdb.so` not found") was a downstream consequence — the real failure was "no `linux-x64` binding installed".

### 2. Next.js file-tracer doesn't ship sibling `.so` files

Even with the binding installed, `@duckdb/node-bindings-linux-x64` ships **two** runtime artifacts:

| File           | Size  | Role                                                                          |
| -------------- | ----- | ----------------------------------------------------------------------------- |
| `duckdb.node`  | 390KB | V8 native addon (the `require()` target)                                      |
| `libduckdb.so` | 67MB  | DuckDB engine — dlopened by `duckdb.node` at addon-init time (`dlopen`/RPATH) |

Next.js' file tracer follows the `.node` `require()`, but **does not** include sibling shared libraries. So Vercel's serverless bundler ships `duckdb.node` without `libduckdb.so`. The `.node` addon initializes fine, but its first `dlopen('libduckdb.so')` fails — the symptom Sentry sees.

This is exactly what `outputFileTracingIncludes` is designed to fix, but it wasn't configured.

### Why the journal/[id] page in particular

The detail page does:

```ts
// src/app/[locale]/(app)/journal/[id]/page.tsx:39
import { … } from "@/app/actions/candle-query"
```

…and `candle-query.ts` has a **top-level static** `import { getCandleStore } from "@/lib/candle-store"`, which transitively pulls in `src/lib/candle-store/duckdb-impl.ts:3`:

```ts
import { DuckDBInstance, type DuckDBConnection } from "@duckdb/node-api"
```

That import is evaluated on every cold-start of the route — before the page even renders, before any user action — so the bundle's missing `linux-x64` binding (and missing `libduckdb.so`) is fatal at module load. There is no way for the request to reach any guard or `try/catch`.

## Fix

Two coupled changes in one commit; either one alone leaves prod broken.

### A. Move Linux bindings into `dependencies` (`package.json`)

```diff
 "dependencies": {
   "@duckdb/node-api": "1.5.3-r.3",
+  "@duckdb/node-bindings-linux-arm64": "1.5.3-r.3",
+  "@duckdb/node-bindings-linux-arm64-musl": "1.5.3-r.3",
+  "@duckdb/node-bindings-linux-x64": "1.5.3-r.3",
+  "@duckdb/node-bindings-linux-x64-musl": "1.5.3-r.3",
   ...
 },
 "devDependencies": {
-  "@duckdb/node-bindings-darwin-x64": "1.5.3-r.3",
-  "@duckdb/node-bindings-linux-arm64": "1.5.3-r.3",
-  "@duckdb/node-bindings-linux-arm64-musl": "1.5.3-r.3",
-  "@duckdb/node-bindings-linux-x64": "1.5.3-r.3",
-  "@duckdb/node-bindings-linux-x64-musl": "1.5.3-r.3",
-  "@duckdb/node-bindings-win32-arm64": "1.5.3-r.3",
-  "@duckdb/node-bindings-win32-x64": "1.5.3-r.3",
+  "@duckdb/node-bindings-darwin-x64": "1.5.3-r.3",
+  "@duckdb/node-bindings-win32-arm64": "1.5.3-r.3",
+  "@duckdb/node-bindings-win32-x64": "1.5.3-r.3",
 },
```

Linux variants must be `dependencies` so Vercel's prod-only install includes them. Darwin/Win32 stay in `devDependencies` — Vercel never runs those.

### B. Force-include `libduckdb.so` in the file trace (`next.config.ts`)

```diff
 serverExternalPackages: [
   "bcryptjs",
   "@duckdb/node-api",
   "@duckdb/node-bindings",
 ],
+outputFileTracingIncludes: {
+  "/**/*": [
+    "./node_modules/@duckdb/node-bindings-linux-x64/**",
+    "./node_modules/@duckdb/node-bindings-linux-arm64/**",
+    "./node_modules/@duckdb/node-bindings-linux-x64-musl/**",
+    "./node_modules/@duckdb/node-bindings-linux-arm64-musl/**",
+  ],
+},
```

Both glibc and musl variants are listed because Vercel's runtime image can vary; the cost of including all four is bounded (one of them per actual function), and not listing one is a latent landmine.

## Verification

- `pnpm install --prefer-offline` — lockfile updated, no integrity errors.
- `pnpm tsc --noEmit` — clean.
- `pnpm lint` — 0 errors (1 pre-existing warning in an unrelated file).
- Local dev server still loads `/en/journal` (HTTP 307, auth redirect — no module-load crash).
- Production verification is post-deploy: a cold-start request to `/<locale>/journal/<id>` should succeed, and Sentry should see no further `PROFIT-JOURNAL-D` events on the new release.

## What we'd add if we had time

1. **A static smoke probe in CI** that boots the candle-store on a Linux runner before deploy gates can pass — this would have caught both regressions before they shipped.
2. **Defer the `@duckdb/node-api` import in `duckdb-impl.ts` behind a `() => import("@duckdb/node-api")` factory** so a misconfigured native runtime fails at first query, not at module init. That would make routes that don't actually query candles immune to the next variant of this bug.
3. **Audit `serverExternalPackages` + `outputFileTracingIncludes` together** — they are two halves of the same contract, and a static-analysis rule could refuse to let a package be in `serverExternalPackages` without a matching trace include if the package ships a `.node` file.

## Lessons

- **`devDependencies` vs `dependencies` is a deploy concern, not a dev convenience.** Anything that needs to be resolvable from a production runtime — even transitively — belongs in `dependencies`, period. The 2026-06-09 dev fix was right to install the bindings; it was wrong to put them all in `devDependencies`.
- **Static native imports are runtime landmines on serverless.** A library that `require()`s a 67MB `.so` at module-load time, on a top-level path of a route, is one missing config line away from a production cold-start outage. Lazy `await import()` (or a constructor-time `require()` inside `setupConnection`) would have contained the blast.
- **A Sentry error pointing at a missing `.so` is almost never a missing `.so` problem alone.** The trace says "library not found", but the deeper question is always "which dependency-tree / bundling / trace step decided that library wasn't needed?" — here, two different steps both got it wrong.
