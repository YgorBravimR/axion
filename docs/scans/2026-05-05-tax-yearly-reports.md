# Scan: tax-yearly-reports — 2026-05-05

**Branch**: `feat/yearly-tax-reporting`
**Base**: `origin/main`
**Files audited**: ~150 source files (217 total changed; excludes 60+ migration snapshots)
**Verdict**: 22 critical, 0 high, 0 medium, 0 low (scoped to critical only per user)

## Findings (full table)

| #  | Severity | Category | File:Line | Issue | Rule violated | Status |
|----|----------|----------|-----------|-------|---------------|--------|
| 1  | Critical | code-convention | `src/app/actions/command-center.ts:760` | `export const getTodayAssetSettings = getAccountAssetSettings` re-exports async fn under alias from `"use server"` file → Next 16 RSC bundler throws "found object" at runtime | `"use server"` files must export only async functions, no const aliases | fixed |
| 2  | Critical | code-convention | `src/app/actions/command-center.ts:761` | `export const getAssetSettings = getAccountAssetSettings` same class as #1 | same | fixed |
| 3  | Critical | tz-correctness | `src/lib/tax/recompute-month.ts:52-54` | `startOfMonth(new Date(year, month-1, 1))` builds local-tz bounds against `timestamptz` columns → drops trades in last hour on non-UTC servers | Always build UTC bounds via `Date.UTC` for `timestamptz` queries | fixed |
| 4  | Critical | tz-correctness | `src/app/actions/tax-engine.ts:358` | Same pattern: `startOfMonth(new Date(y, m-1, d))` for ledger upsert key | same | fixed |
| 5  | Critical | broken-token | `src/components/reports/weekly-meta-chart.tsx` (×11) | Recharts inline `style={{ stroke: "var(--bg-300)" }}` — Tailwind v4 only emits `--color-*`, not `--*` → silent dead style | Recharts inline CSS vars must use `--color-` prefix | fixed |
| 6  | Critical | broken-token | `src/components/reports/annual-rollup-table.tsx:133` | `border-bg-400` — bg ladder stops at `bg-300`; produces no CSS | Use only tokens defined in `globals.css @theme` | fixed |
| 7  | Critical | broken-token | `src/components/reports/reports-content.tsx:112,164,204` | `text-label uppercase` — `text-label` not in `@theme` text scale | same | fixed |
| 8  | Critical | broken-token | `src/components/fractal-plan/plan-section.tsx` (×3) | `gap-m-100`, `gap-m-200`, `gap-m-300` — spacing ladder skips m-100/200/300 (jumps s-300 → m-400) | Use s-100/200/300 for tight spacing | fixed |
| 9  | Critical | broken-token | `src/components/fractal-plan/today-strip.tsx` (×3) | same m-100/200/300 cluster | same | fixed |
| 10 | Critical | broken-token | `src/app/[locale]/(app)/plan/[year]/page.tsx` (×3) | same | same | fixed |
| 11 | Critical | broken-token | `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/page.tsx` (×3) | same | same | fixed |
| 12 | Critical | broken-token | `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/[week]/[date]/page.tsx` (×3) | same | same | fixed |
| 13 | Critical | broken-token | `src/components/tax/fee-rate-form.tsx` (×2) | same | same | fixed |
| 14 | Critical | broken-token | `src/components/reports/r-distribution-tab.tsx` (×2) | same | same | fixed |
| 15 | Critical | broken-token | `src/components/settings/annual-reporting-settings.tsx` (×2) | same | same | fixed |
| 16 | Critical | broken-token | `src/components/fractal-plan/plan-section.tsx` | `text-text-100/200/300` — color prefix is `txt-` not `text-` | Token prefix is `txt-*` | fixed |
| 17 | Critical | broken-token | `src/components/fractal-plan/today-strip.tsx` | same `text-text-*` cluster | same | fixed |
| 18 | Critical | broken-token | `src/components/fractal-plan/provenance-badge.tsx` | same | same | fixed |
| 19 | Critical | broken-token | `src/app/[locale]/(app)/plan/[year]/page.tsx` | same | same | fixed |
| 20 | Critical | broken-token | `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/page.tsx` | same | same | fixed |
| 21 | Critical | broken-token | `src/app/[locale]/(app)/plan/[year]/[quarter]/[month]/[week]/[date]/page.tsx` | same | same | fixed |
| 22 | Critical | a11y/primitives | `src/components/tax/fee-rate-form.tsx:226` | "Reverter ao padrão" Button missing required `id` prop (TS-enforced on Axion primitives) | All Axion Button/Label/Card/Select must have `id` | fixed |
| —  | Critical | a11y/primitives | `src/components/tax/fee-rate-form.tsx:332` | `<Select>` missing `id` (was line 330 pre-fix) | same | deferred (pre-existing baseline) |
| —  | Critical | type-safety | `src/app/actions/tax-engine.ts:245,246,324` | `number \| undefined` not assignable to `number`; missing properties on `YearTaxSummary` | Type returns properly | deferred (pre-existing baseline) |

## Root causes

### RC-1: `"use server"` const alias bomb
Class: re-exporting an async fn under a new `const` name from a `"use server"` module.
- **When manifests**: server-action bundler treats every `export` as RSC-callable; it serializes the value at module-eval time. Aliases serialize to objects, not callable refs → "found object" thrown on first call.
- **Why slipped past review**: looks like trivial backward-compat shim; types are correct; only fails at runtime in production-ish build.
- **Anti-pattern signature**: in any file starting with `"use server"`, an `export const X = Y` where Y is itself an async function (no `async () => ...` body).

### RC-2: TZ-naive `Date` against `timestamptz`
Class: using `new Date(y, m, d)` or `date-fns/startOfMonth(localDate)` to build bounds for `timestamptz` queries.
- **When manifests**: silently on non-UTC server timezones. Last hour of UTC day shifts into next/prev local day → trades drop from monthly tax aggregation.
- **Why slipped past review**: code looks idiomatic; date-fns is the project's standard; passes locally on UTC dev boxes.
- **Anti-pattern signature**: any `new Date(y, m, ...)` (no `Date.UTC` inside) or `startOfMonth/endOfMonth/...` from `date-fns` whose result feeds a Drizzle `gte/lte` on a `timestamptz` column.

### RC-3: Tailwind v4 broken token cluster
Class: class strings using non-existent tokens (`text-text-*`, `gap-m-100`, `border-bg-400`, `text-label`). Tailwind v4 silently no-ops unknown utilities.
- **When manifests**: build succeeds, types pass (className is `string`), CSS just contains nothing for that class. Layout subtly broken.
- **Why slipped past review**: no compile error, no runtime error, no console warning. Only catches the eye on visual review at the affected breakpoint.
- **Anti-pattern signature**: any utility referencing tokens not defined in `src/app/globals.css @theme`.

### RC-4: Recharts inline CSS var without `--color-` prefix
Class: `style={{ stroke: "var(--bg-300)" }}` instead of `var(--color-bg-300)`.
- **When manifests**: Recharts renders, but stroke/fill is empty → invisible chart elements.
- **Why slipped past review**: matches the natural Tailwind class spelling (`bg-300`); the `--color-` indirection is an internal Tailwind v4 detail.
- **Anti-pattern signature**: `var(--bg-…|--txt-…|--acc-…|--trade-…)` inside a JSX `style={…}` object (no `--color-` prefix).

### RC-5: Missing `id` on Axion primitives
Class: rendering `<Button>` / `<Label>` / `<Card>` / `<Select>` without the TS-required `id` prop.
- **When manifests**: TS error at build (`Property 'id' is missing`).
- **Why slipped past review**: catchable, but errors get lost in noisy `tsc` output if the file already has unrelated drizzle type-resolution errors.
- **Anti-pattern signature**: `<Button …>` / `<Select …>` JSX without `id=`.

## Prevention rules

- **Rule**: `"use server"` files export only `async function` declarations or `async () => ...` arrow consts; never alias another async fn via `export const X = Y`.
  **Detector**: `rg -nU --multiline-dotall '^"use server"[\s\S]*?^export const \w+ = \w+\s*$' src/app`
  **Auto-fix**: rewrite as `export const X = async (...args) => Y(...args)` (manual)

- **Rule**: For `timestamptz` Drizzle queries and ledger upsert keys, build bounds via `new Date(Date.UTC(...))`; never `startOfMonth/endOfMonth` from `date-fns` on a tz-naive `Date`.
  **Detector**: `rg -n 'startOfMonth\(new Date\(' src/`  and  `rg -n 'startOfMonth|endOfMonth' src/lib/tax src/app/actions/tax-engine.ts src/lib/reports`
  **Auto-fix**: manual — replace with `new Date(Date.UTC(y, m-1, 1, 0,0,0,0))` / `new Date(Date.UTC(y, m, 0, 23,59,59,999))`

- **Rule**: All Tailwind utility tokens must exist in `src/app/globals.css @theme`. No invented prefixes.
  **Detector** (catches the known three clusters):
  `rg -n 'text-text-(100|200|300)|(gap|p[xytrbl]?|m[xytrbl]?)-m-(100|200|300)\b|(border|bg|text)-bg-400|text-label\b' src/`
  **Auto-fix**: `/normalize` skill or sed mass-replace per cluster.

- **Rule**: Recharts inline CSS-var styles must use the `--color-` prefix (Tailwind v4 only emits `--color-*`).
  **Detector**: `rg -n 'style=\{\{[^}]*var\(--(?!color-)(bg|txt|acc|trade)-' src/`
  **Auto-fix**: `sed -i '' -E 's/var\(--(bg|txt|acc|trade)-/var(--color-\1-/g' <file>`

- **Rule**: Every Axion primitive (`Button`, `Label`, `Card`, `Select`, etc.) must include an `id` prop.
  **Detector**: `rg -nU --multiline-dotall '<(Button|Select|Label|Card)\b(?![^>]*\bid=)[^>]*>' src/`
  **Auto-fix**: manual — give a stable kebab-case id derived from the surrounding scope.

## Fix log

In Phase 3 fix-order:

1. **Code conventions** — `command-center.ts` aliases (#1, #2); `recompute-month.ts` + `tax-engine.ts` UTC bounds (#3, #4)
2. **Normalize / broken tokens** —
   - `weekly-meta-chart.tsx` Recharts `--color-` prefix (#5, sed)
   - `annual-rollup-table.tsx` border-bg-400 → border-bg-300 (#6)
   - `reports-content.tsx` text-label → text-xs ×3 (#7)
   - 8 files spacing m-100/200/300 → s-100/200/300 (#8–#15, sed)
   - 7 files color text-text-* → text-txt-* (#16–#21, sed)
3. **Accessibility / primitives** — `fee-rate-form.tsx` Button id (#22)

## Still armed (deferred)

- `src/components/tax/fee-rate-form.tsx:332` — `<Select>` missing `id` (pre-existing baseline before this branch; TS error already in main).
- `src/app/actions/tax-engine.ts:245,246,324` — type holes in `YearTaxSummary` return shape (pre-existing baseline).
- Project-wide drizzle relational types resolving to `T | T[]` unions (~80 errors across `src/app/actions/*`, `src/lib/queries/*`) — generator config issue, not in scope of this scan, but next scan should triage.
