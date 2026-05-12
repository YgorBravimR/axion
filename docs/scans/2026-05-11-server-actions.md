# Subject Sweep — Server-action / data-fetch correctness

**Date**: 2026-05-11
**Subject**: #7 from `docs/scan-roi-plan-2026-05-07.md` (recommended execution order)
**Scope**: `src/app/actions/**`, `src/app/**/page.tsx` data fetches, `src/lib/tax/**`

## Why this subject

Server actions are the trust boundary between user input and the database. A misshapen payload here writes bad data persistently. The plan called out three classes: types exported from `"use server"` files (RSC render failure), missing input validation (data corruption), N+1 DB calls (perf).

## Phase 0 — detectors run

```bash
# Known footgun: types exported from "use server" files
rg -l '"use server"' src/ | xargs -I{} rg -n '^export (type|interface)' {}    # 0 hits

# Server-action surface
ls src/app/actions/ | wc -l                                                   # 50 files
rg -l '"use server"' src/ | wc -l                                             # 50 files

# Zod validation coverage
for f in $(rg -l '"use server"' src/app/actions/); do
  grep -q 'parse\|safeParse\|zod\|Schema' "$f" || echo "$f"
done                                                                          # 10 zod-less files

# N+1 patterns
rg -nU '(for \([^)]*\) \{[^}]*await db\.|\.map\([^)]*=>[^)]*await db\.)' src/app/actions/ src/lib/   # 2 hits, both with disable + reason
```

## Phase 1 — findings classified

| Cluster                                                                 | Severity   | Status                                                                                                                                                                                                                                                                                                                                   | Action                    |
| ----------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| **A** Types exported from `"use server"` files                          | n/a        | **0 hits**. `axion/enforce-server-action-async-only` custom ESLint rule blocks this at PR-time. Convention: types live in sibling `*.types.ts` (visible in file listing — every action has a `*.types.ts` partner).                                                                                                                      | n/a — enforced            |
| **B** N+1 / await-in-loop patterns                                      | n/a        | **2 hits**, both with `eslint-disable-next-line no-await-in-loop -- <bounded-N reason>` (`tags.ts:213` user-bounded <50 tags; `matching-engine.ts:213` per-asset trade query for nota matching). `no-await-in-loop` is enforced at error level.                                                                                          | n/a — enforced            |
| **C** Read-only actions without zod (typed-args only)                   | low        | 7 files: `analytics.ts`, `candle-query.ts`, `account-comparison.ts`, `fractal-plan/reports.ts`, `coaching.ts`, `tax-engine.ts` getters, `seed-risk-profiles.ts`. Params are typed; queries are auth-gated; worst case is empty result. No write paths.                                                                                   | skip — low risk           |
| **D** Write actions without zod (TypeScript types only at the boundary) | **medium** | 3 files contain mutations without runtime validation: `accounts.ts` (createAccount/updateAccount/deleteAccount), `strategy-conditions.ts` (syncStrategyConditions), `yearly-plan.ts` (syncCapitalBetweenPlans), `tax-engine.ts` (recomputeLedger — protected path). TS types are erased at runtime; client could send malformed payload. | **flagged** for follow-up |
| **E** `cookies()`/`headers()`/`draftMode()` in `page.tsx`/`layout.tsx`  | n/a        | **0 hits**. `axion/no-dynamic-functions-in-pages` custom rule blocks the entire class. Forces moves into server actions or explicit `dynamic = "force-dynamic"`.                                                                                                                                                                         | n/a — enforced            |

## Phase 5a — what enforcement is doing the work

Three custom ESLint rules + one stock rule do the heavy lifting:

- `axion/enforce-server-action-async-only` (custom, `eslint-rules/`): `"use server"` files may export only async functions or async values, or `export type { ... }` re-exports. The 2026-05-07 hardening pass cleared 58 violations to zero; this sweep confirms the count stays at zero.
- `axion/no-dynamic-functions-in-pages` (custom): `cookies`/`headers`/`draftMode`/`unstable_after` from `next/headers` banned in `page.tsx`/`layout.tsx`/`template.tsx`. Forces explicit dynamic opt-in.
- `no-await-in-loop` (stock): blocks accidental N+1 — any exception needs `eslint-disable` + a bounded-N reason.
- `drizzle/enforce-delete-with-where`, `drizzle/enforce-update-with-where`: block `db.delete()`/`db.update()` without a `where` clause — protects against accidental table-wipes.

The known bug classes from earlier sweeps are now config-enforced. The remaining gap is **input validation at write boundaries**.

## Phase 5b — fixes applied (0 direct, 1 flagged)

No direct fixes this sweep. The "Cluster D" gap (4 write actions lacking zod input validation) is real but bulk-fixing it would:

1. Touch a protected path (`tax-engine.ts recomputeLedger` — single source of truth for tax recomputation, per CLAUDE.md).
2. Require schema design decisions (which fields are required, which optional defaults, which transforms).
3. Affect ~6 client-side call sites per action.

That's dedicated refactor work, not a sweep-level fix. **Flagged for a follow-up "server-action zod-hardening" pass** with the protected-path coordination CLAUDE.md requires.

The 7 read-only zod-less actions (Cluster C) are intentionally typed-only. Auth gates the data; misshapen filter params yield empty results, not state corruption.

## Phase 5c — prevention rules (memory seed)

### Convention

**`"use server"` files export only async functions and async values.** Types, schemas, and synchronous helpers live in sibling files. Naming convention: `<action>.ts` (server) ↔ `<action>.types.ts` (types). Already enforced by `axion/enforce-server-action-async-only`.

**Server actions that mutate state should validate input with zod.** Read-only actions can rely on TS types because:

- Misshapen filter params produce empty results, not corruption
- Auth gates the data layer
- Worst case is a noisy chart, not a bad write

Write paths don't have that fallback — TS types are erased at runtime, so the client can post anything. Zod parse at the top of the handler converts "trust" into a runtime check.

### Detector convention

```bash
# Confirm server-action discipline (all should be 0 / justified)
rg -l '"use server"' src/ | xargs rg -l '^export (type|interface)' 2>/dev/null      # = 0
rg -n 'await db\.' src/app/actions/ | rg 'for \(|\.map\(' | rg -v 'eslint-disable'   # = 0

# Find write actions without zod (the real audit surface)
for f in $(rg -l '"use server"' src/app/actions/); do
  if grep -qE 'db\.(insert|update|delete)\b' "$f" && ! grep -qE 'parse\(|safeParse\(|Schema' "$f"; then
    echo "WRITE-WITHOUT-ZOD: $f"
  fi
done
```

## Phase 6 — done criteria

- [x] `pnpm lint` 0 errors
- [x] 0 types exported from `"use server"` files (lint-enforced)
- [x] 0 `cookies`/`headers` calls in `page.tsx`/`layout.tsx` (lint-enforced)
- [x] 2 await-in-loop sites carry justified disable comments
- [x] 4 write-without-zod actions catalogued and flagged for dedicated follow-up
- [x] 7 read-without-zod actions confirmed low-risk (typed args, no mutations)
- [x] Convention seeded: zod for writes, TS-types-only OK for reads
