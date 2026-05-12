# Scan: tax-yearly-reports — 2026-05-05

**Branch**: `feat/yearly-tax-reporting` | **Base**: `origin/main`
**Files audited**: ~150 source files | **Verdict**: 22 critical, 0 high, 0 medium, 0 low

## Findings

| #     | Sev  | Category        | File:Line                                                | Issue                                                                                                                                            | Rule                                        | Status                  |
| ----- | ---- | --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------- |
| 1     | CRIT | code-convention | `src/app/actions/command-center.ts:760`                  | `export const getTodayAssetSettings = getAccountAssetSettings` — const alias of async fn from `"use server"` → Next 16 "found object" at runtime | No const aliases in `"use server"`          | fixed                   |
| 2     | CRIT | code-convention | `src/app/actions/command-center.ts:761`                  | Same: `export const getAssetSettings = getAccountAssetSettings`                                                                                  | same                                        | fixed                   |
| 3     | CRIT | tz              | `src/lib/tax/recompute-month.ts:52-54`                   | `startOfMonth(new Date(year, month-1, 1))` → local-tz bounds against `timestamptz` → drops last-hour trades on non-UTC servers                   | Use `Date.UTC` for `timestamptz` queries    | fixed                   |
| 4     | CRIT | tz              | `src/app/actions/tax-engine.ts:358`                      | Same: `startOfMonth(new Date(...))` for ledger upsert key                                                                                        | same                                        | fixed                   |
| 5     | CRIT | broken-token    | `src/components/reports/weekly-meta-chart.tsx` (×11)     | Recharts `style={{ stroke: "var(--bg-300)" }}` — v4 emits `--color-*` not `--*` → silent dead style                                              | Use `--color-` prefix                       | fixed                   |
| 6     | CRIT | broken-token    | `src/components/reports/annual-rollup-table.tsx:133`     | `border-bg-400` — bg ladder stops at `bg-300`                                                                                                    | Tokens defined in `globals.css @theme` only | fixed                   |
| 7     | CRIT | broken-token    | `src/components/reports/reports-content.tsx:112,164,204` | `text-label` — not in `@theme` text scale                                                                                                        | same                                        | fixed                   |
| 8–15  | CRIT | broken-token    | 8 files                                                  | `gap-m-100/200/300` — spacing ladder skips m-100/200/300 (s-300 → m-400)                                                                         | Use s-100/200/300 for tight spacing         | fixed                   |
| 16–21 | CRIT | broken-token    | 6 files                                                  | `text-text-100/200/300` — color prefix is `txt-` not `text-`                                                                                     | Token prefix is `txt-*`                     | fixed                   |
| 22    | CRIT | a11y            | `src/components/tax/fee-rate-form.tsx:226`               | Button missing required `id` prop                                                                                                                | All Axion primitives need `id`              | fixed                   |
| —     | CRIT | a11y            | `src/components/tax/fee-rate-form.tsx:332`               | `<Select>` missing `id`                                                                                                                          | same                                        | deferred (pre-existing) |
| —     | CRIT | type-safety     | `src/app/actions/tax-engine.ts:245,246,324`              | `number \| undefined` not assignable to `number`                                                                                                 | Type return shape                           | deferred (pre-existing) |

## Root Causes

**RC-1: `"use server"` const-alias bomb.** `export const X = Y` where Y is async fn → bundler serializes alias as object at module-eval → "found object" at runtime. Looks like trivial compat shim; types correct; only fails at runtime. Detector: `rg -nU --multiline-dotall '^"use server"[\s\S]*?^export const \w+ = \w+\s*$' src/app`

**RC-2: TZ-naive Date against `timestamptz`.** `new Date(y, m, d)` or `date-fns/startOfMonth(localDate)` builds local-tz bounds → silently drops last-hour trades on non-UTC servers. Passes on UTC dev boxes. Detector: `rg -n 'startOfMonth\(new Date\(' src/` + `rg -n 'startOfMonth|endOfMonth' src/lib/tax src/app/actions/tax-engine.ts src/lib/reports`

**RC-3: Tailwind v4 broken token cluster.** `text-text-*`, `gap-m-100`, `border-bg-400`, `text-label` — not in `@theme`. No compile error, no runtime error, no warning. Visually broken only. Detector: `rg -n 'text-text-(100|200|300)|(gap|p[xytrbl]?|m[xytrbl]?)-m-(100|200|300)\b|(border|bg|text)-bg-400|text-label\b' src/`

**RC-4: Recharts inline CSS-var without `--color-` prefix.** `var(--bg-300)` instead of `var(--color-bg-300)`. Chart renders but stroke/fill empty. Detector: `rg -n 'style=\{\{[^}]*var\(--(?!color-)(bg|txt|acc|trade)-' src/`

**RC-5: Missing `id` on Axion primitives.** `<Button>/<Label>/<Card>/<Select>` without TS-required `id`. Gets lost in noisy `tsc` output. Detector: `rg -nU --multiline-dotall '<(Button|Select|Label|Card)\b(?![^>]*\bid=)[^>]*>' src/`

## Prevention Rules

- `"use server"` exports: only `async function` decls or `async () => ...` arrows. Never `export const X = Y`. Fix: `export const X = async (...args) => Y(...args)`
- `timestamptz` bounds: `new Date(Date.UTC(y, m-1, 1, 0,0,0,0))` for start; `new Date(Date.UTC(y, m, 0, 23,59,59,999))` for end. Never `startOfMonth/endOfMonth` from date-fns.
- All Tailwind tokens must exist in `src/app/globals.css @theme`. Run `/normalize` or sed for mass fixes.
- Recharts inline styles: `var(--color-bg-300)` not `var(--bg-300)`.
- Every Axion primitive needs `id` prop. Fix: stable kebab-case id from surrounding scope.

## Fix Order (Phase 3)

1. Code conventions: `command-center.ts` aliases (#1,#2); `recompute-month.ts` + `tax-engine.ts` UTC bounds (#3,#4)
2. Normalize broken tokens: `weekly-meta-chart.tsx` Recharts prefix (#5); `annual-rollup-table.tsx` (#6); `reports-content.tsx` (#7); 8 files spacing (#8–15); 7 files color prefix (#16–21)
3. a11y: `fee-rate-form.tsx` Button id (#22)

## Still Armed

- `tax/fee-rate-form.tsx:332` — `<Select>` missing `id` (pre-existing baseline in main)
- `tax-engine.ts:245,246,324` — type holes in `YearTaxSummary` return shape (pre-existing)
- ~80 drizzle relational type errors across `src/app/actions/*`, `src/lib/queries/*` — generator config issue, not in scope
