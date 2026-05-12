# Subject Sweep — Theming Tokens

**Date**: 2026-05-11
**Subject**: #2 from `docs/scan-roi-plan-2026-05-07.md`
**Scope**: `src/components/**`, `src/app/**/*.tsx`, `eslint-rules/token-rules.mjs`, `scripts/token-fix.ts`

## Why this subject

The design system (`src/app/globals.css @theme`) defines ~592 tokens (color, spacing, radius, text, font, tracking, leading). Two enforcement layers exist:

1. **`better-tailwindcss/no-unknown-classes`** — bans unknown classes at lint-error severity. Catches typos and made-up tokens.
2. **`axion/enforce-token-usage`** + **`scripts/token-fix.ts`** — share a catalog (`eslint-rules/token-rules.mjs`) that rewrites _valid Tailwind_ classes that bypass the design system (e.g. `text-xs` → `text-tiny`).

The linter catches what it knows; this sweep finds what it doesn't.

## Phase 0 — detectors run

```bash
# Raw hex
rg -n '#[0-9a-fA-F]{3,8}' src/components -g '*.tsx' | wc -l   # 0

# Semantic Tailwind palette bypass
rg -n 'text-(yellow|amber|orange|red|green|...)-[0-9]' src/    # 2

# Font-bold inflation
rg -n 'font-bold' src/components -g '*.tsx' | wc -l            # ~50

# Raw Tailwind text scale
rg -n 'text-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b' src/components -g '*.tsx'
# text-xs: 70 hits, text-sm: 24 hits, text-base: 0

# Raw Tailwind spacing
rg -n '\bp[xytrbl]?-[0-9]\b' src/components -g '*.tsx' | wc -l # 138

# Arbitrary values
rg -n '\b(text|w|h|p|m|gap|rounded)-\[' src/components -g '*.tsx' | wc -l # ~90

# Opacity utilities
rg -n 'opacity-[0-9]' src/components -g '*.tsx'                # ~30 (mostly disabled / hover states — legit)
```

## Phase 1 — findings classified

| Cluster                                                      | Severity | Status                                               | Action                                                                         |
| ------------------------------------------------------------ | -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| **A** Raw hex codes                                          | n/a      | clean (0 hits)                                       | none                                                                           |
| **B** Semantic Tailwind palette (`text-red-*`)               | low      | 2 hits in `settings/`                                | manual fix → `text-fb-error`                                                   |
| **C** Raw text scale (`text-xs`, `text-sm`)                  | medium   | 94 hits across 16 files                              | extend `token-rules.mjs`; bulk rewrite                                         |
| **D** `text-base`                                            | n/a      | clean (0 hits)                                       | none                                                                           |
| **E** Raw text scale (`text-lg`/`xl`/`2xl`)                  | low      | judgment-required — sizes don't 1:1 map to `text-h*` | document, no mechanical rewrite                                                |
| **F** Raw Tailwind spacing (`px-3`, `py-2`, etc)             | low      | 138 hits                                             | **intentionally skipped** — compiles identically to `px-s-300`; stylistic only |
| **G** `gap-N` raw values                                     | low      | 19 hits                                              | **intentionally skipped** — same reasoning as F                                |
| **H** `font-bold` inflation                                  | medium   | ~50 hits                                             | **judgment-required** — surface as future `quieter`/`typeset` pass             |
| **I** Arbitrary widths/heights (`h-[180px]`, `min-w-[80px]`) | low      | ~90 hits                                             | **legitimate** — responsive chart sizing, rare cell widths                     |
| **J** Opacity utilities (`opacity-50`, etc)                  | low      | ~30 hits                                             | **legitimate** — disabled/hover/transition states                              |

## Phase 5a — design decisions

### Why we did NOT mechanically rewrite spacing

`px-3` and `px-s-300` compile to the same `padding-inline: 12px` because `--spacing-s-300: 12px;`. Rewriting 138 hits across the codebase would touch ~50+ files for **zero visual change** — purely a code-style preference. The ROI is negative under the user's "avoid over engineering, no unnecessary complexity" directive. Watch for new drift; don't churn what's already there.

### Why we did NOT mechanically rewrite `font-bold`

The CLAUDE.md design guideline says _"Bold reserved for major emphasis only"_ but most current usage is on numeric metrics (KPI cards, R-distribution, tag clouds). Removing bold from a metric cell without a designer's eye risks flattening hierarchy. This is **design-judgment work**, not mechanical. Surface in a future `quieter` or `typeset` pass with screenshot diffs.

### Why text-xs/sm/base IS safe to mechanically rewrite

- `text-xs` → 12px → `text-tiny` (12px) — exact match
- `text-sm` → 14px → `text-small` (14px) — exact match
- `text-base` → 16px → `text-body` (16px) — exact match
- `text-lg`/`xl`/`2xl` — **NOT 1:1**; Tailwind's `text-lg` = 18px but `text-h3` is `clamp(1.125rem, 0.875rem + 0.75vw, 1.5rem)` — fluid, larger, intended for headings. Skipped.

## Phase 5b — fixes applied

### 1. Extended `eslint-rules/token-rules.mjs` with 3 new rules

```js
{ category: "typography", from: wordBound("text-xs"),   to: "text-tiny" },
{ category: "typography", from: wordBound("text-sm"),   to: "text-small" },
{ category: "typography", from: wordBound("text-base"), to: "text-body" },
```

Catalog is shared between CLI rewriter (`scripts/token-fix.ts`) and the `axion/enforce-token-usage` ESLint rule, so editors now also auto-fix.

### 2. Bulk rewrite via `pnpm exec tsx scripts/token-fix.ts`

94 fixes across 16 files. Heaviest offenders:

- `src/components/reports/annual-rollup-table.tsx` — 22× text-xs
- `src/components/fractal-plan/cockpit/setup-summary-card.tsx` — 10× text-xs
- `src/components/reports/capital-event-log.tsx` — 10× text-xs + 1× text-sm
- `src/components/reports/withdrawal-calculator.tsx` — 3× text-xs + 5× text-sm
- `src/components/tax/monthly-darf-card.tsx` — 7× text-xs + 3× text-sm
- `src/components/settings/annual-reporting-settings.tsx` — 5× text-xs + 4× text-sm

### 3. Manual fixes (2 hits)

- `src/components/settings/account-settings.tsx:950` — `text-red-400` → `text-fb-error`
- `src/components/settings/user-list.tsx:326` — `text-red-500 hover:bg-red-500/10 hover:text-red-600` → `text-fb-error hover:bg-fb-error/10 hover:text-fb-error` (collapses the 3 shades into the semantic token; visual difference negligible vs. design-system coherence gain)

## Phase 5c — prevention rules (memory seed)

### New anti-patterns to log

1. **Raw Tailwind text scale bypasses the design ladder.** `text-xs`, `text-sm`, `text-base` compile fine but skip the project's typography tokens (`text-tiny`, `text-small`, `text-body`). Now caught by `axion/enforce-token-usage`. Don't reintroduce.

2. **`text-lg`/`xl`/`2xl` ≠ `text-h*`.** Tailwind sizes are fixed; Axion headings are fluid `clamp()` values. When a heading is needed, use `text-h1`/`h2`/`h3`. When a size is needed mid-flow, the body ladder maxes at 16px (`text-body`) — anything larger is a heading and needs the fluid token.

3. **Mechanical spacing rewrites are negative ROI.** `px-3` compiles to the same CSS as `px-s-300`. Don't churn 100+ files for stylistic alignment when the design system isn't visually affected. Reserve token-fix rewrites for cases where the Tailwind class **bypasses** the design system (typography, color), not where it merely **aliases** it (spacing).

4. **`font-bold` audits need a designer's eye.** Don't mechanically strip `font-bold` from metric cells — hierarchy can collapse. Surface as judgment work for a `quieter`/`typeset` pass.

### Detectors to keep handy

```bash
# Token gaps the linter doesn't catch
rg -n 'text-(xs|sm|base)\b' src/components -g '*.tsx'
rg -n 'text-(red|green|blue|yellow|amber|orange|purple|pink|sky|emerald|violet|indigo|rose|teal|cyan|lime)-[0-9]' src/ -g '*.tsx'
rg -n '#[0-9a-fA-F]{3,8}' src/components -g '*.tsx'

# Judgment-required (review before mass-editing)
rg -n 'font-bold' src/components -g '*.tsx'
rg -n '\btext-(lg|xl|2xl|3xl)\b' src/components -g '*.tsx'
```

## Phase 6 — done criteria

- [x] `pnpm exec tsx scripts/token-fix.ts --dry` exits 0
- [ ] `pnpm lint` 0 errors
- [ ] `pnpm lint:strict` 0 errors
- [ ] `pnpm exec tsc --noEmit` clean
- [ ] No raw `text-red-*` in `src/components/**`
