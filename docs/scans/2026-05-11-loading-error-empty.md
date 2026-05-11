# Subject Sweep — Loading / error / empty states

**Date**: 2026-05-11
**Subject**: #8 from `docs/scan-roi-plan-2026-05-07.md` (recommended execution order)
**Scope**: `src/app/**`, `src/components/**`, `src/lib/**`

## Why this subject

The "professional-grade resilience" design principle (CLAUDE.md) demands graceful loading states, robust error handling, and accessible empty states. Most likely silently broken because nobody notices a missing skeleton until the network is slow.

## Phase 0 — detectors run

```bash
# App Router boundary files
find src/app -name 'loading.tsx'     # 1 file: src/app/loading.tsx
find src/app -name 'error.tsx'       # 2 files: src/app/error.tsx + src/app/[locale]/error.tsx
find src/app -name 'not-found.tsx'   # 1 file: src/app/[locale]/not-found.tsx

# Pages missing co-located loading.tsx
find src/app -name 'page.tsx' | while read p; do
  d=$(dirname "$p")
  test -f "$d/loading.tsx" || echo "$d"
done                                  # 30 routes (all cascade to root loading.tsx via Suspense)

# Pages missing co-located error.tsx
find src/app -name 'page.tsx' | while read p; do
  d=$(dirname "$p")
  test -f "$d/error.tsx" || echo "$d"
done                                  # 30 routes (all cascade to [locale]/error.tsx)

# Raw "undefined" string occurrences
rg -n '\?\? .undefined.|: .undefined.|"undefined"' src/ -g '*.ts' -g '*.tsx'  # 14 hits
```

## Phase 1 — findings classified

| Cluster                                                   | Severity   | Status                                                                                                                                                                                                                                                                                                                              | Action                              |
| --------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| **A** Routes without co-located `error.tsx`               | n/a        | 30 routes hit but **all covered by ancestors**: `src/app/error.tsx` (top-level) + `src/app/[locale]/error.tsx`. Next.js error boundaries cascade upward — a parent's `error.tsx` catches any descendant throw.                                                                                                                      | skip — cascade is correct           |
| **B** Routes without co-located `loading.tsx`             | low        | 30 routes hit. Single ancestor `src/app/loading.tsx` catches all via Suspense. **But it's dashboard-shaped** (4 stat cards + 1 wide column). Navigating to e.g. `/analytics` shows a dashboard skeleton before painting an analytics view — a polish gap, not a correctness bug.                                                    | **flagged** for per-route follow-up |
| **C** `typeof X === "undefined"` SSR safety guards        | n/a        | 13/14 detector hits are legitimate SSR guards (`typeof window === "undefined"`, `typeof navigator === "undefined"`, etc.) — the string literal, not a leaking value.                                                                                                                                                                | skip — correct usage                |
| **D** `return "undefined"` sentinel in `heatmap-utils.ts` | **medium** | `src/lib/optimize/heatmap-utils.ts:92` — `getNestedStringValue` returns the literal word `"undefined"` when a dot-path doesn't resolve. Flowed into 3 callers: a `Set<string>` for variation detection AND a dropdown's default selection in `parameter-heatmap.tsx`. The word could appear in the heatmap UI as a selected option. | **fixed**: returns `""` instead     |
| **E** `not-found.tsx` coverage                            | n/a        | Single file at `src/app/[locale]/not-found.tsx` cascades to all locale routes. Top-level public 404 (no locale) is the framework default — acceptable for an authenticated app where unrecognized URLs likely come from typos in `/en/...` or `/pt/...`.                                                                            | skip                                |

## Phase 5a — boundary cascade is doing the work

Next.js App Router routing primitives cascade upward by design:

- **`error.tsx`**: When a descendant throws, the framework walks up the tree to the nearest `error.tsx` boundary. So `src/app/[locale]/error.tsx` covers every `[locale]/(app)/*`, `[locale]/(public)/*`, `[locale]/(auth)/*` route. The 30 "missing" routes are all transitively covered. Co-located `error.tsx` is only needed when a route wants a _specific_ error message for its segment (e.g. "Backtest failed to load" vs the generic message).
- **`loading.tsx`**: Same cascade via `<Suspense>`. The root `loading.tsx` covers everything. Co-located variants are about _shape fidelity_ — a backtest page wants a table skeleton, not a dashboard skeleton.

The detector "30 missing" output is misleading without cascade analysis. The real gap is: which routes deserve a _shape-specific_ skeleton because the generic one is visually jarring?

## Phase 5b — fixes applied (1 total)

### `src/lib/optimize/heatmap-utils.ts:87-103`

The `getNestedStringValue` utility returned the literal string `"undefined"` when a dot-path didn't resolve. Three callers consumed this:

1. `heatmap-utils.ts:127` — `valuesSet.add(...)` for detecting param variation
2. `heatmap-utils.ts:188` — slice-matching filter
3. `parameter-heatmap.tsx:186` — populating `defaultSlices[param.path]` for a dropdown's default selected option

The dropdown case is the user-visible leak: when a recipe path doesn't resolve (e.g., a run from a different strategy mixed into the heatmap), the dropdown would render with the literal string "undefined" pre-selected.

**Fix**: return `""` (empty string) instead. Semantics are better in all three callers:

- Set: doesn't pollute the variation set with a sentinel that could collide with a real `"undefined"` value
- Filter: empty string compared to user-selected slice value yields `false` (run excluded — correct)
- Dropdown: blank default instead of the word "undefined" — clean UI fallback

Docstring updated to call out the convention.

### Per-route loading.tsx — flagged for follow-up

Per-feature `loading.tsx` skeletons for `analytics`, `backtest`, `journal`, `monte-carlo`, `reports` would dramatically improve perceived performance because the skeleton matches the destination shape. Estimated effort: ~30 minutes per route to copy structure from the page's first paint. Not a sweep-level fix — flagged as a dedicated polish pass.

## Phase 5c — prevention rules (memory seed)

### Convention

**App Router boundary cascade**: `error.tsx` and `loading.tsx` cascade upward. A single `[locale]/error.tsx` + root `loading.tsx` covers an entire route tree. Co-locate only when you want segment-specific shape or copy.

**Don't return string-sentinels that look like UI words.** `return "undefined"` from a util that feeds a UI consumer means the word "undefined" can appear as a selected dropdown option or a chart label. Prefer:

- `""` for "no string value" (callers can treat as no-op or render placeholder)
- `null` if the type allows it and callers handle nullability
- A reserved sentinel like `"__missing__"` only if you need to distinguish "no value" from "actual empty value" downstream
- Throw at the boundary if a missing value is unrecoverable

### Detectors that worked

```bash
# App Router boundary inventory
find src/app -name 'loading.tsx' -o -name 'error.tsx' -o -name 'not-found.tsx'

# "Missing" loading/error — read with cascade in mind, not a checklist
find src/app -name 'page.tsx' | while read p; do
  d=$(dirname "$p")
  test -f "$d/loading.tsx" || echo "$d"
done

# Real undefined leaks (filter out SSR guards)
rg -n '"undefined"' src/ -g '*.ts' -g '*.tsx' | rg -v 'typeof '
```

## Phase 6 — done criteria

- [x] `pnpm lint` 0 errors
- [x] `pnpm exec tsc --noEmit` clean
- [x] 1 real "undefined" leak fixed; 13 SSR-guard false positives skipped
- [x] App Router cascade documented — 30 "missing" routes confirmed covered by ancestors
- [x] Per-route shape-specific skeletons flagged for dedicated follow-up (Tier B polish)
- [x] Convention seeded: string-sentinels that look like UI words are bugs
