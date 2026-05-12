# Subject Sweep — Performance / Render Hygiene

**Date**: 2026-05-11
**Subject**: #3 from `docs/scan-roi-plan-2026-05-07.md`
**Scope**: `src/components/**`, `src/app/**/*.tsx`

## Why this subject

Trading tool used live during market hours. Jank = lost trust. The `react-best-practices` skill exists but debt has likely accrued in chart-heavy areas (`analytics`, `dashboard`), form-heavy areas (`journal`), and live-data panels (`command-center`).

## Methodology — different from previous sweeps

Theming and i18n have **single-pass autofix**: detectors find the offenders, a script rewrites them, lint enforces going forward. Performance does **not**:

- A `useMemo` added without measurable benefit just adds closure-creation overhead and a memo bookkeeping cost — React docs explicitly say _"don't memo by default."_
- An "inline object prop" only matters if the parent re-renders frequently AND the child is wrapped in `memo()`. Most of ours are passed to Recharts components which manage their own internal memoization.
- A `"use client"` directive may be necessary for reasons not visible in the file (Context Provider parent, dynamic import, `memo()` wrapping).

So this sweep's deliverable is **(a)** a small set of high-confidence fixes, **(b)** a triaged catalog of candidates for future work, **(c)** prevention rules that don't add ceremony.

## Phase 0 — detectors run

```bash
# Index-as-key
rg -n 'key=\{(idx|i|index)\}' src/components -g '*.tsx'        # 8 explicit
rg -n '\.map\(\([^)]+,\s*(i|idx|index)\)' src/components -g '*.tsx' | wc -l  # 57 candidates

# useEffect for data fetching (client-side fetch antipattern)
rg -l 'useEffect' src/components -g '*.tsx' | xargs rg -l 'fetch\(' | wc -l   # 0

# Oversized client components (>500 lines, code-split candidates)
for f in $(rg -l '^"use client"' src/components -g '*.tsx'); do
  l=$(wc -l < "$f"); [ "$l" -gt 500 ] && echo "$l $f"
done | sort -rn | wc -l                                         # 20

# "use client" without any client-only API
# (no useState/useEffect/useRef/useContext/useReducer/useMemo/useCallback/
#  useTransition/useFormState/useOptimistic/useFormStatus/usePathname/
#  useSearchParams/useRouter/useParams + no event handlers)
                                                                # 20 candidates

# Inline object/array props
rg -n '=\{\{' src/components -g '*.tsx' | wc -l                 # 107
rg -n '=\{\[' src/components -g '*.tsx' | wc -l                 # 29
```

## Phase 1 — findings classified

| Cluster                                                                | Severity | Status                                                                                                                         | Action                                                                                        |
| ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **A** `key={index}` on static placeholder arrays                       | n/a      | 3 false positives (`annual-rollup-table` cell array, `darf-strip` month chips, `kbd` keystrokes) — array index IS the identity | skip                                                                                          |
| **B** `key={index}` on read-only display lists                         | low      | `strategy-analysis`, `stats-preview`, `ocr-import` (errors+warnings)                                                           | 2 cleanest fixed                                                                              |
| **C** `key={index}` on editable list (`backtest/targets-exit-section`) | medium   | **real bug** — input focus glitches on level removal                                                                           | documented (needs schema change: add stable id to `TargetLevel`)                              |
| **D** Client fetch via `useEffect`                                     | n/a      | 0 hits                                                                                                                         | none — codebase strength                                                                      |
| **E** `"use client"` over-marking                                      | medium   | 20 candidates with no client-only API                                                                                          | 3 demoted (high-confidence); 17 deferred for individual review                                |
| **F** Oversized client components (>500 lines)                         | low      | 20 files (`trade-form` 1786, `scaled-trade-form` 1242, etc.)                                                                   | documented as code-split candidates; not in scope                                             |
| **G** Inline object/array props                                        | low      | 107 + 29 hits, almost entirely Recharts config or computed `style` values                                                      | **leave alone** — extracting would require `useMemo` overhead; Recharts internally reconciles |

## Phase 5a — key insight on `useTranslations` and the App Router

The major contributor to **cluster E** is that **next-intl 4.x's `useTranslations` works in BOTH server and client components**. The hook auto-detects context and uses the appropriate runtime. Most `"use client"` directives in these files were added out of habit when devs imported `useTranslations`, not because the file actually needs client APIs.

A file qualifies for demotion when it has all of:

- No `useState`/`useReducer`/`useContext`/`useEffect`/`useRef`/`useTransition`
- No `useMemo`/`useCallback` (these are technically RSC-permitted but signal client intent)
- No `React.memo()` or `forwardRef()` wrapping
- No event handler props (`onClick`, `onChange`, etc.)
- No imports from client-only libs (`next-auth/react`'s `SessionProvider`, etc.)

Triaged candidates:

| File                                                        | Decision            | Reason                                                                                                            |
| ----------------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `shared/loading-spinner.tsx`                                | **demoted**         | only `useTranslations` + `cn` + Loader2 icon                                                                      |
| `fractal-plan/target-actual-gauge.tsx`                      | **demoted**         | only `useTranslations` + JSX                                                                                      |
| `risk-simulation/preview-banner.tsx`                        | **demoted**         | only `useTranslations` + 2 lucide icons                                                                           |
| `risk-simulation/summary-cards.tsx`                         | deferred            | imports `ColoredValue` which uses `memo` without its own `"use client"` (pre-existing latent issue, separate fix) |
| `shared/direction-badge.tsx`                                | keep `"use client"` | wraps in `memo()`                                                                                                 |
| `auth/auth-provider.tsx`                                    | keep `"use client"` | `SessionProvider` is a client-only Context                                                                        |
| `dashboard/kpi/avg-r-card.tsx`                              | deferred            | imports `StatCard`, needs verification                                                                            |
| `fractal-plan/breadcrumb.tsx`                               | deferred            | imports UI breadcrumb primitives, needs verification                                                              |
| `monte-carlo/kelly-criterion-card.tsx`, `metrics-cards.tsx` | deferred            | needs individual read                                                                                             |
| `reports/annual-rollup-table.tsx`, `weekly-meta-chart.tsx`  | deferred            | Recharts components may require client; needs verification                                                        |
| (10 more)                                                   | deferred            | listed in detector output; not in scope                                                                           |

## Phase 5b — fixes applied

### 1. Index-as-key cleanups (2 files)

- `src/components/monte-carlo/strategy-analysis.tsx:256` — suggestions are unique strings, keyed by value
- `src/components/monte-carlo/stats-preview.tsx:121` — strategy breakdown rows now keyed by `s.name`

### 2. `"use client"` demotions (3 files)

- `src/components/shared/loading-spinner.tsx`
- `src/components/fractal-plan/target-actual-gauge.tsx`
- `src/components/risk-simulation/preview-banner.tsx`

These now render server-side and ship zero JS for the component itself.

## Phase 5c — prevention rules (memory seed)

### New anti-patterns to log

1. **`"use client"` is not a free decoration.** Every directive creates a client boundary and a JS payload. With next-intl 4.x, `useTranslations` works in RSC — adding `"use client"` solely because you imported it is a habit-driven mistake. Audit checklist: state/refs/effects/event-handlers/memo/forwardRef/context. None of those? Try removing the directive.

2. **`key={index}` is fine on static arrays, dangerous on editable lists.** The bug surface is reorderable or removable items where React reuses DOM/state for the wrong logical row. Detector: `rg -n 'key=\{(i|idx|index)\}' src/components -g '*.tsx'` — then triage by "can items be added/removed/reordered?".

3. **Don't add `useMemo` "just in case."** It adds a closure + bookkeeping. Add only when (a) a referentially-stable value is passed to a `memo()`'d child, OR (b) the computation is provably expensive in a profiler trace. React docs: _"don't memo by default."_

4. **Inline Recharts config (`margin={{...}}`, `tick={{...}}`) is acceptable.** Recharts internally manages re-render scheduling. Extracting these to `useMemo` adds the memo overhead without benefit. Same logic for inline computed `style={{ width: \`${pct}%\` }}` — the value depends on a prop, so memoizing wouldn't reduce work anyway.

5. **Oversized client components (>500 lines) are technical debt, not bugs.** Code-splitting via dynamic import or extracting subtrees to RSC is a refactor, not a quick win. Top 5 in repo: `trade-form.tsx` (1786), `scaled-trade-form.tsx` (1242), `ocr-import.tsx` (1107), `account-settings.tsx` (1033), `optimize-content.tsx` (929). Surface in future architectural work.

### Detectors to keep handy

```bash
# Demote-candidates (no client-only API)
for f in $(rg -l '^"use client"' src/components -g '*.tsx'); do
  if ! rg -q 'useState|useEffect|useRef|useContext|useReducer|useMemo|useCallback|useTransition|useFormState|useOptimistic|useFormStatus|usePathname|useSearchParams|useRouter|useParams|onClick|onChange|onSubmit|onFocus|onBlur|onKeyDown|onKeyUp|onMouseEnter|onMouseLeave|memo\(|forwardRef' "$f"; then
    echo "$f"
  fi
done

# Key=index on potentially-mutable lists
rg -n 'key=\{(i|idx|index)\}' src/components -g '*.tsx'

# useEffect data-fetch antipattern
rg -l 'useEffect' src/components -g '*.tsx' | xargs rg -l 'fetch\(' 2>/dev/null
```

## Phase 6 — done criteria

- [x] `pnpm lint` 0 errors
- [x] `pnpm exec tsc --noEmit` clean
- [x] Demoted components verified RSC-compatible (no client-only imports)
- [x] No `useEffect`-based fetch regressions introduced
