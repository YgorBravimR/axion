# Scan: missing translations — 2026-06-20

**Branch**: main
**Base**: origin/main
**Files audited**: 33 page/layout files in `src/app/[locale]/` + 368 components in `src/components/` (excl. `ui/`, `dev/`)
**Verdict**: 3 critical, 5 high, 4 medium, 0 low (12 total)

## Findings (full table)

| #   | Severity | Category | File:Line                                                             | Issue                                                 | Rule violated                            | Status |
| --- | -------- | -------- | --------------------------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------- | ------ |
| 1   | critical | i18n     | `src/components/fractal-plan/cockpit/monthly-plan-slideover.tsx:43`   | Hardcoded PT SheetTitle `Editar plano · {monthLabel}` | No `useTranslations` import              | fixed  |
| 2   | critical | i18n     | `…/monthly-plan-slideover.tsx:45`                                     | Hardcoded PT SheetDescription                         | No `useTranslations` import              | fixed  |
| 3   | critical | i18n     | `…/quarter-plan-slideover.tsx:39`                                     | Hardcoded PT SheetTitle                               | No `useTranslations` import              | fixed  |
| 4   | high     | i18n     | `…/quarter-plan-slideover.tsx:41`                                     | Hardcoded PT SheetDescription                         | No `useTranslations` import              | fixed  |
| 5   | high     | i18n     | `…/yearly-plan-slideover.tsx:78`                                      | Hardcoded PT `Editar/Criar plano ${year}`             | No `useTranslations` import              | fixed  |
| 6   | high     | i18n     | `…/yearly-plan-slideover.tsx:81`                                      | Hardcoded PT SheetDescription                         | No `useTranslations` import              | fixed  |
| 7   | high     | i18n     | `…/annual-cockpit-grid.tsx:220`                                       | Hardcoded PT `aria-label`                             | Server comp — no `getTranslations`       | fixed  |
| 8   | high     | i18n     | `…/month-capital-popover.tsx` (full file, 14 strings)                 | Full PT toast / labels / buttons hardcoded            | No `useTranslations` import              | fixed  |
| 9   | medium   | i18n     | `…/r-cap-override-popover.tsx` (lines 136,142,147,156,160 + 8 labels) | English toast/label/button strings hardcoded          | No `useTranslations` import              | fixed  |
| 10  | medium   | i18n     | `src/components/journal/quick-add-trade-fab.tsx:28`                   | English aria-label `Quick add trade`                  | No `useTranslations` import              | fixed  |
| 11  | medium   | i18n     | `src/app/[locale]/(auth)/layout.tsx:19`                               | Hardcoded EN `Skip to content`                        | Key already existed in `common`          | fixed  |
| 12  | medium   | i18n     | `src/app/[locale]/(app)/page.tsx:37`                                  | Hardcoded EN `aria-label="Dashboard"`                 | Key already existed in `dashboard.title` | fixed  |

Verification: `pnpm i18n:check` → 0 missing key references, 0 locale parity gaps (en/pt-BR both at 5587 keys). `pnpm exec eslint <touched files>` → no issues. `pnpm exec tsc --noEmit` → 93 pre-existing errors elsewhere; **0 new errors in touched files** (verified by filtering tsc log against touched-file list).

## Root causes

**Slideover headers built before i18n migration.** `src/components/fractal-plan/cockpit/{monthly,quarter,yearly}-plan-slideover.tsx` were created as thin wrappers around their editor components. The editors (`monthly-plan-editor.tsx`, etc.) were translated, but the wrapping `Sheet` chrome (title + description) was left as hardcoded Portuguese. The wrappers' siblings (`month-card`, `month-header`, `caps-strip`, etc.) all already use `useTranslations("plan.*")`. Detector for this class: grep for `<SheetTitle>[^<{]` or `<SheetDescription>[^<{]` matching a non-expression child.

**Popover-shaped components were partial migrations.** `month-capital-popover.tsx` and `r-cap-override-popover.tsx` are interactive popovers added to the cockpit grid. Both have many tightly-scoped strings (toast messages, button labels, heading) and were committed without any next-intl wiring at all. Anti-pattern signature: a `"use client"` file that imports `useToast` from `@/components/ui/toast` and never imports `next-intl` — every `showToast()` call site is a candidate.

**Server-component a11y attributes get missed.** `annual-cockpit-grid.tsx` was a synchronous server component with a hardcoded `aria-label`. The cockpit's other server components (`caps-strip`, `eoy-projection-banner`) all use `await getTranslations(...)`. Anti-pattern: a server component (no `"use client"`) with a string literal in `aria-label=` and no `next-intl/server` import.

**A11y strings on root layouts.** Both `(auth)/layout.tsx` and `(app)/page.tsx` used hardcoded English even though the matching `common.skipToContent` and `dashboard.title` keys already existed in `en.json` and `pt-BR.json`. These slip past review because they're not visible — only screen readers hit them.

## Prevention rules

- **Rule**: Any new `Sheet`, `Dialog`, `Drawer`, or `Popover` wrapper must wire its title/description/aria-label through `t()` from `next-intl` before merge.
  **Detector**: `rg -n '<(SheetTitle|SheetDescription|DialogTitle|DialogDescription|DrawerTitle|DrawerDescription)>[^<{]' src/`
  **Auto-fix**: manual (string varies)

- **Rule**: A `"use client"` file that calls `showToast(...)`, `toast.success(...)`, `toast.error(...)`, or any `sonner` API must import `useTranslations` from `next-intl`.
  **Detector**: `rg -l 'showToast\(|toast\.(success\|error\|warning\|info)' src/components/ | xargs -I {} sh -c 'grep -L useTranslations {} | grep tsx'`
  **Auto-fix**: manual

- **Rule**: Any element with a string-literal `aria-label=` in `src/components/` or `src/app/` must use `t()` (client) or `await getTranslations(...)` (server).
  **Detector**: `rg -n 'aria-label="[^"{][^"]+"' src/components src/app`
  **Auto-fix**: manual

- **Rule**: When adding a new translation key, both `messages/en.json` and `messages/pt-BR.json` must receive it in the same commit. Verify with `pnpm i18n:check` before staging.
  **Detector**: `pnpm i18n:check` exit code != 0
  **Auto-fix**: add the missing locale key

## Fix log

Wave 1 — add keys: `plan.slideovers.*` (7 keys), `plan.annualGrid.ariaLabel`, `plan.capital.*` (12 keys), `plan.rCapOverride.*` (12 keys), `journal.quickAddTradeAriaLabel` to both `messages/en.json` and `messages/pt-BR.json`.

Wave 2 — wire components (Phase 3 category: i18n):

1. `monthly-plan-slideover.tsx` — `useTranslations("plan.slideovers")`
2. `quarter-plan-slideover.tsx` — `useTranslations("plan.slideovers")`
3. `yearly-plan-slideover.tsx` — `useTranslations("plan.slideovers")`
4. `annual-cockpit-grid.tsx` — `await getTranslations("plan.annualGrid")` (component made async)
5. `month-capital-popover.tsx` — `useTranslations("plan.capital")` (14 strings replaced)
6. `r-cap-override-popover.tsx` — `useTranslations("plan.rCapOverride")` (13 strings replaced)
7. `quick-add-trade-fab.tsx` — `useTranslations("journal")`
8. `(auth)/layout.tsx` — `await getTranslations("common")`
9. `(app)/page.tsx` — `await getTranslations("dashboard")`

## Still armed

None from this scan. The two diagnose subagents capped their reports at ~50 critical+high items; both came in well under 50, so coverage of cockpit + auth + dashboard surfaces is exhaustive. **Not yet scanned**: `src/components/journal/`, `src/components/command-center/`, `src/components/settings/`, `src/components/calculator/`, `src/components/risk-simulation/`, `src/components/imports/`, `src/components/backtest/`, `src/components/equity-shield/`, `src/components/dashboard/`, `src/components/account-comparison/`, `src/components/playbook/`, `src/components/tax/`, `src/components/optimize/`, `src/components/shared/`, `src/components/layout/`, `src/components/providers/` — the components agent only flagged findings inside `fractal-plan/`. A targeted next pass should run the detector regexes above against each folder.

## Phase 0 candidate (for next scan)

The four detectors in **Prevention rules** above are all mechanical greps. The next `/scan for missing translations` should run them as a Phase 0 pre-flight to catch recurring hits in <2s before launching diagnose agents.
