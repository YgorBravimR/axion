# Scan: fractal-plan cockpit — layout + token usage — 2026-05-07

**Branch**: `feat/yearly-tax-reporting` | **Base**: `origin/main`
**Files audited**: 10 (cockpit + plan route + tax + yearly-plan-editor + provenance/snapshot)
**Verdict**: 8 critical, 7 high, 5 medium, 3 low

## Findings

| #   | Sev  | Category    | File:Line                                | Issue                                                           | Rule                    | Status                      |
| --- | ---- | ----------- | ---------------------------------------- | --------------------------------------------------------------- | ----------------------- | --------------------------- |
| 1   | CRIT | tokens      | setup-summary-card.tsx (multi)           | `rounded-m-300`/`p-s-500`/`mt-s-400`/`gap-s-400`/`text-h4`      | invalid v4 token        | fixed                       |
| 2   | CRIT | tokens      | month-card.tsx:53,81,93                  | `rounded-m-200` + `p-s-400`                                     | invalid radius/spacing  | fixed                       |
| 3   | CRIT | tokens      | month-card.tsx:58,106                    | `text-h4`                                                       | undefined text scale    | fixed                       |
| 4   | CRIT | tokens      | month-card.tsx:113,140                   | `text-[10px]`/`text-[11px]`                                     | use text-micro/tiny     | fixed                       |
| 5   | CRIT | tokens      | annual-cockpit-grid.tsx:116              | `gap-s-400`                                                     | invalid spacing         | fixed                       |
| 6   | CRIT | tokens      | what-if-calculator.tsx:60,69,109,116,119 | `rounded-m-200`+`p-s-400`+`text-h4`+`rounded-s-200`             | invalid tokens          | fixed                       |
| 7   | CRIT | tokens      | tax-tab.tsx:91,105,128                   | `gap-s-400`+`rounded-m-200`                                     | invalid tokens          | fixed                       |
| 8   | CRIT | tokens      | darf-strip.tsx:55,62,76,85               | `text-[10px]`+`rounded-s-200`                                   | invalid tokens          | fixed                       |
| 9   | HIGH | a11y        | month-capital-popover.tsx:77             | 22px target `opacity-0 group-hover` (touch invisible)           | WCAG 2.5.5              | fixed (size-7 + opacity-40) |
| 10  | HIGH | tokens      | yearly-plan-editor.tsx:257,259,400       | `rounded-m-200`+`text-h4`+`hover:text-err-100`                  | invalid tokens          | fixed                       |
| 11  | HIGH | design      | page.tsx (no-plan branch)                | `YearlyPlanEditor` AND `SetupSummaryCard.slideover` both render | duplicate UX surface    | fixed                       |
| 12  | HIGH | tokens      | snapshot-hero.tsx:27                     | `gap-s-400`                                                     | invalid                 | fixed                       |
| 13  | HIGH | tokens      | provenance-badge.tsx:23                  | `text-[10px]`                                                   | use `text-micro`        | fixed                       |
| 14  | HIGH | tokens      | week-row.tsx:32                          | `rounded-s-100`                                                 | invalid                 | fixed                       |
| 15  | HIGH | tokens      | month-capital-popover.tsx:77,88          | `rounded-s-200`+`p-s-400`                                       | invalid                 | fixed                       |
| 16  | MED  | a11y        | tax-tab.tsx accordion                    | missing `aria-controls` + region semantics                      | ARIA disclosure pattern | fixed                       |
| 17  | MED  | conventions | month-capital-popover.tsx:39             | `usePrevMonth` looks like hook                                  | use `handle*` prefix    | fixed                       |
| 18  | MED  | conventions | month-card.tsx:67                        | dead alias `const oneRCentsLocal = oneRCents`                   | DRY                     | fixed                       |
| 19  | MED  | i18n        | yearly-plan-editor.tsx (whole)           | English + PT mixed                                              | i18n consistency        | deferred                    |
| 20  | MED  | DRY         | 6 files                                  | duplicate `formatBRL`                                           | extract to lib          | deferred                    |
| 21  | LOW  | tokens      | DEFAULT_LADDER literal                   | flagged as typo — actually correct (R$999,999.99)               | n/a                     | wontfix                     |
| 22  | LOW  | data        | page.tsx `today.getMonth()`              | server-local TZ vs São Paulo at month boundary                  | low blast               | deferred                    |
| 23  | LOW  | conventions | yearly-plan-editor.tsx toasts            | hardcoded EN error strings                                      | i18n                    | deferred                    |

## Root Causes

**RC-1: Tailwind v4 silent token loss.** `rounded-m-200` → `--radius-m-200` (undefined). `gap-s-400` → `--spacing-s-400` (undefined). Class compiles to nothing. No build error, no runtime warning — only visible on render. Single biggest layout regression source in codebase.

**RC-2: Touch a11y forgotten.** `opacity-0 group-hover:opacity-100` = invisible on touch (no hover state). Combined with 22px target → unusable on tablet/mobile.

## Prevention Rules

- **No `rounded-(m|s|l)-*`** — radius scale doesn't exist; use `rounded-sm/md/lg/xl`. Detector: `rg -n 'rounded-(m|s|l)-[0-9]' src/`
- **Spacing ladder:** `s-100/200/300`, `m-400/500/600`, `l-700/800/900` only. No `s-400/500`, `m-100/200/300`. Detector: `rg -n '(gap|p[xytrbl]?|m[xytrbl]?|space-[xy])-(s-(400|500)|m-([1-3]00))' src/`
- **Text scale:** `text-h1/h2/h3/body/small/tiny/micro` only. No `text-h4`, no `text-[Npx]`. Detector: `rg -n 'text-h4|text-\[[0-9]+px\]' src/` | Fix: `text-h4` → `text-h3`; `text-[10px]` → `text-micro`; `text-[11px]` → `text-tiny`
- **Error tokens:** `fb-error/warning/success`, never `err-*`. Detector: `rg -n 'text-err-|bg-err-|border-err-' src/`
- **Hover-only controls:** baseline opacity ≥ 30%, size ≥ 24×24px. Detector: `rg -n 'opacity-0\s+(group-hover|hover):opacity-100' src/`
- **Event handlers:** `handle*` prefix; `use*` reserved for hooks.

## Fix Log

**Phase A tokens:** `setup-summary-card.tsx`, `month-card.tsx`, `annual-cockpit-grid.tsx`, `what-if-calculator.tsx`, `tax-tab.tsx`, `darf-strip.tsx`, `month-capital-popover.tsx`, `yearly-plan-editor.tsx`, `snapshot-hero.tsx`, `provenance-badge.tsx`, `week-row.tsx`, `yearly-plan-slideover.tsx` — all token swaps applied.

**Phase B a11y:** popover touch reachability (size-7 + opacity-40).

**Phase D:** Removed double editor in `/plan/[year]` no-plan branch; renamed `usePrevMonth` → `handleUsePrevMonth`; added `aria-controls`/`role=region`/`aria-labelledby` to tax-tab accordion.

## Follow-up: Native HTML vs UI Primitives

| #   | Sev  | File:Line                                 | Issue                                                | Status                      |
| --- | ---- | ----------------------------------------- | ---------------------------------------------------- | --------------------------- |
| 24  | HIGH | `tax/fee-rate-form.tsx:204`               | `<input type="checkbox">` → `<Checkbox>`             | fixed                       |
| 25  | HIGH | `fractal-plan/yearly-plan-editor.tsx:344` | raw `<table>` → shadcn Table                         | fixed                       |
| 26  | HIGH | `fractal-plan/yearly-plan-editor.tsx:395` | raw `<button>` → `<Button variant="ghost">`          | fixed                       |
| 27  | HIGH | `fractal-plan/breadcrumb.tsx`             | hand-rolled → `ui/breadcrumb`                        | fixed                       |
| 28  | HIGH | `tax/carryover-ledger.tsx`                | raw `<table>` → shadcn Table                         | fixed                       |
| 29  | HIGH | `tax/annual-tax-summary.tsx`              | raw `<table>` → shadcn Table                         | fixed                       |
| 30  | HIGH | `tax/monthly-darf-card.tsx`               | raw `<table>` → shadcn Table                         | fixed                       |
| 31  | HIGH | `tax/fee-breakdown-table.tsx`             | raw `<table>` + `<tfoot>` → shadcn Table/TableFooter | fixed                       |
| 32  | MED  | `cockpit/setup-summary-card.tsx:150`      | `<details>/<summary>` — no shadcn Collapsible exists | wontfix (native acceptable) |
| 33  | LOW  | `cockpit/tax-tab.tsx:102`                 | accordion `<button>` — no Accordion primitive        | wontfix                     |
| 34  | LOW  | `<dl>/<dt>/<dd>`, `<output>`              | pure semantic, no shadcn equivalent                  | wontfix                     |

**Prevention rule:** Prefer `@/components/ui/*` over raw HTML. `<input type="checkbox">` → `Checkbox`; raw `<table>` → `Table/TableHeader/TableRow/TableCell`; styled `<button>` → `Button`; hand-rolled breadcrumb → `Breadcrumb`. Detector: `rg -n '<input\s+type="checkbox"|<table\s+className=' src/components`.

**Kept native (justified):** `<details>/<summary>` (no Collapsible primitive, keyboard-correct) | `<dl>/<dt>/<dd>` (no replacement) | `<output>` (semantic only).

## Auto-fix Script

```bash
pnpm exec tsx scripts/token-fix.ts          # apply
pnpm exec tsx scripts/token-fix.ts --dry    # CI gate (exit 1 on match)
```

First pass: caught **13 additional files** outside cockpit scope. Re-run dry: `0 / 764 files would change`.

## Still Armed

- **#19 i18n** `yearly-plan-editor.tsx` — mixed PT/EN. Needs dedicated i18n pass + `messages/*.json` updates.
- **#20 `formatBRL` duplication** — trivial extract to `@/lib/format/brl.ts`. Deferred.
- **#22 TZ-naive `today.getMonth()`** — `Intl.DateTimeFormat` or explicit `America/Sao_Paulo`. Low impact (1 cell/year max).
