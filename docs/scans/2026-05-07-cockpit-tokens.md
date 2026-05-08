# Scan: fractal-plan cockpit — layout + token usage — 2026-05-07

**Branch**: `feat/yearly-tax-reporting`
**Base**: `origin/main`
**Files audited**: 10 source files (cockpit + plan route + tax + yearly-plan-editor + provenance/snapshot)
**Verdict**: 8 critical, 7 high, 5 medium, 3 low

## Findings (full table)

| #   | Severity | Category    | File:Line                                | Issue                                                                       | Rule violated                     | Status                      |
| --- | -------- | ----------- | ---------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- | --------------------------- |
| 1   | CRIT     | tokens      | setup-summary-card.tsx (multiple)        | `rounded-m-300`/`p-s-500`/`mt-s-400`/`gap-s-400`/`text-h4`                  | invalid Tailwind v4 token         | fixed                       |
| 2   | CRIT     | tokens      | month-card.tsx:53,81,93                  | `rounded-m-200` + `p-s-400`                                                 | invalid radius/spacing tokens     | fixed                       |
| 3   | CRIT     | tokens      | month-card.tsx:58,106                    | `text-h4`                                                                   | undefined text scale              | fixed                       |
| 4   | CRIT     | tokens      | month-card.tsx:113,140                   | `text-[10px]`/`text-[11px]` arbitrary values                                | use design-system text-micro/tiny | fixed                       |
| 5   | CRIT     | tokens      | annual-cockpit-grid.tsx:116              | `gap-s-400` (s-400 not defined)                                             | invalid spacing token             | fixed                       |
| 6   | CRIT     | tokens      | what-if-calculator.tsx:60,69,109,116,119 | `rounded-m-200`+`p-s-400`+`text-h4`+`rounded-s-200`                         | invalid tokens                    | fixed                       |
| 7   | CRIT     | tokens      | tax-tab.tsx:91,105,128                   | `gap-s-400`+`rounded-m-200`                                                 | invalid tokens                    | fixed                       |
| 8   | CRIT     | tokens      | darf-strip.tsx:55,62,76,85               | `text-[10px]`+`rounded-s-200`                                               | invalid tokens                    | fixed                       |
| 9   | HIGH     | a11y        | month-capital-popover.tsx:77             | 22px target hidden `opacity-0 group-hover` (touch invisible)                | WCAG 2.5.5 + touch reachability   | fixed (size-7 + opacity-40) |
| 10  | HIGH     | tokens      | yearly-plan-editor.tsx:257,259,400       | `rounded-m-200`+`text-h4`+`hover:text-err-100`                              | invalid tokens                    | fixed                       |
| 11  | HIGH     | design      | page.tsx (no-plan branch)                | Renders `YearlyPlanEditor` AND `SetupSummaryCard.slideover` (double editor) | duplicate UX surface              | fixed                       |
| 12  | HIGH     | tokens      | snapshot-hero.tsx:27                     | `gap-s-400`                                                                 | invalid token                     | fixed                       |
| 13  | HIGH     | tokens      | provenance-badge.tsx:23                  | `text-[10px]` arbitrary                                                     | use `text-micro`                  | fixed                       |
| 14  | HIGH     | tokens      | week-row.tsx:32                          | `rounded-s-100`                                                             | invalid token                     | fixed                       |
| 15  | HIGH     | tokens      | month-capital-popover.tsx:77,88          | `rounded-s-200`+`p-s-400`                                                   | invalid tokens                    | fixed                       |
| 16  | MED      | a11y        | tax-tab.tsx accordion buttons            | missing `aria-controls` + region semantics                                  | ARIA disclosure pattern           | fixed                       |
| 17  | MED      | conventions | month-capital-popover.tsx:39             | `usePrevMonth` looks like a hook (use-prefix)                               | `handle*` event prefix            | fixed                       |
| 18  | MED      | conventions | month-card.tsx:67                        | dead alias `const oneRCentsLocal = oneRCents`                               | DRY                               | fixed                       |
| 19  | MED      | i18n        | yearly-plan-editor.tsx (whole file)      | English strings mixed with PT labels                                        | i18n consistency                  | deferred                    |
| 20  | MED      | DRY         | 6 files                                  | duplicate `formatBRL` function                                              | DRY — extract to lib              | deferred                    |
| 21  | LOW      | tokens      | (DEFAULT_LADDER literal)                 | flagged as typo — actually correct (R$999,999.99 = `999_999_99` cents)      | n/a                               | wontfix                     |
| 22  | LOW      | data        | page.tsx `today.getMonth()`              | server-local TZ vs São Paulo TZ at month boundary midnight                  | low blast (1 cell mis-state)      | deferred                    |
| 23  | LOW      | conventions | yearly-plan-editor.tsx (toast strings)   | hardcoded English error messages                                            | i18n / consistency                | deferred                    |

## Root causes

**1. Tailwind v4 token namespaces are silently lossy.** Tailwind v4 emits a class only when the requested utility resolves to a defined `@theme` CSS variable. `rounded-m-200` looks plausible but maps to `--radius-m-200` which doesn't exist (only `--radius` is defined). `gap-s-400` maps to `--spacing-s-400` which doesn't exist (only `s-100/200/300`, `m-400/500/600`, `l-700/800/900` are defined). The class compiles to nothing — no border radius, no gap. That manifests visually as cards with sharp corners blending into adjacent cards, no gutter between grid cells, and unsized headings collapsing into body text. **Why it slipped past review**: Tailwind doesn't error or warn on missing tokens at build time. A class either has bytes or it doesn't, and PR review catches "missing class" only by running the page and noticing the visual deficit. Cross-namespace mistakes (`rounded-m-*` for radius, `text-[10px]` instead of `text-micro`) are the single biggest source of layout regressions in this codebase.

**2. Touch a11y forgotten on hover-revealed controls.** `opacity-0 group-hover:opacity-100` is fine on desktop with a pointer, but touch devices have no hover state — the control is invisible. Combined with a 22px target, the popover trigger was effectively unusable on tablet/mobile. Pattern signature: `opacity-0 group-hover:` without a `pointer:coarse` fallback or a baseline opacity > 0.

## Prevention rules

- **Rule**: Never use `rounded-m-*`, `rounded-s-*`, `rounded-l-*` — radius scale doesn't exist; use Tailwind built-ins (`rounded-sm/md/lg/xl`).
  **Detector**: `rg -n 'rounded-(m|s|l)-[0-9]' src/`
  **Auto-fix**: `/scan` token swap pass (rounded-m-200/300 → rounded-md, rounded-s-100/200 → rounded-sm)

- **Rule**: Spacing tokens are `s-100/200/300`, `m-400/500/600`, `l-700/800/900` only. No `s-400`, `s-500`, `m-100`, `m-200`, `m-300`.
  **Detector**: `rg -n '(gap|p[xytrbl]?|m[xytrbl]?|space-[xy])-(s-(400|500)|m-([1-3]00))' src/`
  **Auto-fix**: manual — choose nearest valid (s-300 → m-400 jumps from 12px to 16px; s-400 was probably meant as 16px).

- **Rule**: Text scale is `text-h1/h2/h3/body/small/tiny/micro` only. No `text-h4`, no arbitrary `text-[Npx]` for design text.
  **Detector**: `rg -n 'text-h4|text-\[[0-9]+px\]' src/`
  **Auto-fix**: `text-h4` → `text-h3` or `text-body font-semibold`; `text-[10px]` → `text-micro`; `text-[11px]` → `text-tiny`.

- **Rule**: Error/warning/success tokens are `fb-error/warning/success`, never `err-*`/`warn-*`/`success-*`.
  **Detector**: `rg -n 'text-err-|bg-err-|border-err-' src/`
  **Auto-fix**: `text-err-100` → `text-fb-error`.

- **Rule**: Hover-revealed controls must remain reachable on touch (no `opacity-0 group-hover:opacity-100` without baseline visibility ≥ 30%) and ≥ 24×24px.
  **Detector**: `rg -n 'opacity-0\s+(group-hover|hover):opacity-100' src/`
  **Auto-fix**: change baseline to `opacity-30..50`, ensure size-6 (24px) min.

- **Rule**: Event handlers use `handle*` prefix; reserve `use*` for hooks.
  **Detector**: `rg -n 'const use[A-Z][a-zA-Z]* = \(\) =>' src/components`
  **Auto-fix**: rename to `handle*`.

## Fix log

1. Phase A — token swaps:
   - `setup-summary-card.tsx`: rounded/spacing/text tokens; ladder empty-state added; What-if collapsible details (already done pre-scan).
   - `month-card.tsx`: rounded-m-200 → rounded-md, p-s-400 → p-m-400, text-h4 → text-h3, text-[10px] → text-micro, text-[11px] → text-tiny, dead `oneRCentsLocal` removed.
   - `annual-cockpit-grid.tsx`: gap-s-400 → gap-m-400.
   - `what-if-calculator.tsx`: rounded-m-200 → rounded-md, p-s-400 → p-m-400, rounded-s-200 → rounded-sm, text-h4 → text-h3, text-xs/[10px] → text-tiny/micro.
   - `tax-tab.tsx`: gap-s-400 → gap-m-400, rounded-m-200 → rounded-md (replace_all).
   - `darf-strip.tsx`: text-[10px] → text-micro (replace_all), rounded-s-200 → rounded-sm (replace_all).
   - `month-capital-popover.tsx`: rounded-s-200 → rounded-sm, p-s-400 → p-m-400, baseline opacity-40 (touch a11y), size-7 (28px target).
   - `yearly-plan-editor.tsx`: rounded-m-200 → rounded-md, text-h4 → text-h3, hover:text-err-100 → hover:text-fb-error.
   - `snapshot-hero.tsx`: gap-s-400 → gap-m-400.
   - `provenance-badge.tsx`: text-[10px] → text-micro.
   - `week-row.tsx`: rounded-s-100 → rounded-sm.
   - `yearly-plan-slideover.tsx`: mt-s-400 → mt-m-400.

2. Phase B — HIGH a11y/data: popover touch reachability addressed (size-7 + opacity-40 baseline).

3. Phase D — DRY/MED: removed double editor in `/plan/[year]` no-plan branch; renamed `usePrevMonth` → `handleUsePrevMonth`; added `aria-controls`/`role=region`/`aria-labelledby` to tax-tab accordion.

## Follow-up scan: native HTML vs UI primitives (2026-05-07 +1)

| #   | Severity | Category     | File:Line                                 | Issue                                                               | Status                                        |
| --- | -------- | ------------ | ----------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| 24  | HIGH     | native-vs-ui | `tax/fee-rate-form.tsx:204`               | `<input type="checkbox">` → swap to shadcn `<Checkbox>`             | fixed                                         |
| 25  | HIGH     | native-vs-ui | `fractal-plan/yearly-plan-editor.tsx:344` | raw `<table>` → shadcn `Table/TableHeader/TableRow/TableCell`       | fixed                                         |
| 26  | HIGH     | native-vs-ui | `fractal-plan/yearly-plan-editor.tsx:395` | raw `<button>` icon → `<Button variant="ghost" size="sm">` (size-8) | fixed                                         |
| 27  | HIGH     | duplicate    | `fractal-plan/breadcrumb.tsx`             | hand-rolled breadcrumb → composes `ui/breadcrumb` primitives        | fixed                                         |
| 28  | HIGH     | native-vs-ui | `tax/carryover-ledger.tsx`                | raw `<table>` → shadcn `Table`                                      | fixed                                         |
| 29  | HIGH     | native-vs-ui | `tax/annual-tax-summary.tsx`              | raw `<table>` → shadcn `Table`                                      | fixed                                         |
| 30  | HIGH     | native-vs-ui | `tax/monthly-darf-card.tsx`               | raw `<table>` → shadcn `Table`                                      | fixed                                         |
| 31  | HIGH     | native-vs-ui | `tax/fee-breakdown-table.tsx`             | raw `<table>` (with `<tfoot>`) → shadcn `Table/TableFooter`         | fixed                                         |
| 32  | MED      | native-vs-ui | `cockpit/setup-summary-card.tsx:150`      | `<details>/<summary>` — no shadcn `Collapsible` exists in repo      | wontfix (native acceptable, no styling drift) |
| 33  | LOW      | native-vs-ui | `cockpit/tax-tab.tsx:102`                 | accordion `<button>` — custom layout, no `Accordion` primitive      | wontfix                                       |
| 34  | LOW      | semantic     | `<dl>/<dt>/<dd>`, `<output>`              | pure semantic, no shadcn equivalent                                 | wontfix                                       |

### Prevention rule (added)

- **Rule**: Prefer shadcn UI primitives (`@/components/ui/*`) over raw HTML elements when one exists. Specifically: `<input type="checkbox">` → `Checkbox`; raw `<table>...</table>` → `Table/TableHeader/TableRow/TableCell`; styled `<button>` for actions → `Button`; hand-rolled breadcrumb → `Breadcrumb`.
  **Detector**: `rg -n '<input\s+type="checkbox"|<table\s+className=' src/components` then `rg -n 'from "@/components/ui/(checkbox|table|button|breadcrumb)"'` cross-check.
  **Auto-fix**: see swap recipes above. Note: `Button size="icon"` is 44px (size-11) — for inline table delete use `size="sm" className="size-8 p-0"` for 32px target.

### Native tags kept (justified)

- `<details>/<summary>` — repo has no `Collapsible` UI primitive; adding Radix Collapsible just for one disclosure is overkill. Native is keyboard-accessible + screen-reader-correct; styled with `group-open:rotate-180` Tailwind variant.
- `<dl>/<dt>/<dd>` — definition list semantic. No shadcn replacement, no styling concerns (uses our tokens).
- `<output>` — form output element. Pure semantic, no replacement.
- `<pre>` — none in feature scope.

## Auto-fix script

`scripts/token-fix.ts` codifies every prevention rule above as a `{ from, to, reason }` triple. It iterates `src/**/*.{ts,tsx}` and rewrites invalid tokens in place. Adding a rule = appending one entry.

```bash
pnpm exec tsx scripts/token-fix.ts          # apply
pnpm exec tsx scripts/token-fix.ts --dry    # report only, exit 1 if matches found (CI-friendly)
```

First pass after this scan caught **13 additional files** outside the original cockpit scope (`optimize/*`, `settings/*`, `layout/sidebar`, plus three cells I'd missed in `cockpit/*`). All swept. Re-run dry shows `0 / 764 files would change`.

Wire into pre-commit / CI by running `pnpm scripts/token-fix.ts --dry` — exits 1 on any match.

## Still armed

- **#19 i18n consistency** in `yearly-plan-editor.tsx` — mixed PT/EN labels and toast strings. Deferred; needs dedicated i18n pass touching `messages/en.json` + `messages/pt-BR.json` + `useTranslations` threading.
- **#20 `formatBRL` duplication** across 6 files. Deferred; trivial extract to `@/lib/format/brl.ts` but unrelated to the layout bugs that triggered this scan.
- **#22 TZ-naive `today.getMonth()`** in `page.tsx`. Server may run in UTC; Brazilian trader's "today" can differ at month-boundary midnight. Low impact (mis-marks 1 month card per year max). Address with `Intl.DateTimeFormat` or explicit `America/Sao_Paulo` zone if it surfaces in QA.
